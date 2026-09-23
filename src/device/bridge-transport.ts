// The transport that puts a real URX unit behind the simulated LCD.
//
// It owns no protocol of its own: the caller injects a `DeviceLink` — four
// read/write verbs plus a subscription. This file is therefore the whole of the
// integration: give it a link and a filled BindingTable and the same screens
// drive hardware.
//
// Two rules it will not bend:
//   - An unbound path is refused, never guessed onto some nearby address.
//   - A snapshot that cannot be read completely is an error, not a partial
//     answer: a half-read screen invites an edit against values that were
//     never established.

import type { ParamPath, ParamValue } from "./path";
import type { DeviceTransport, Notify } from "./transport";
import type { BindingTable } from "./binding";

/** The host application's connection to a unit. */
export interface DeviceLink {
  get(addr: string): Promise<number>;
  set(addr: string, value: number): Promise<void>;
  getStr(addr: string): Promise<string>;
  setStr(addr: string, value: string): Promise<void>;
  /** Register `addrs` for change notifies. Returns an unsubscribe function. */
  subscribe(addrs: string[], onUpdate: (addr: string, raw: number) => void): Promise<() => void>;
}

export class UnboundPathError extends Error {
  constructor(readonly path: ParamPath) {
    super(`no validated device address is bound for "${path}"`);
    this.name = "UnboundPathError";
  }
}

export class BridgeTransport implements DeviceTransport {
  readonly kind = "bridge" as const;

  private unsubscribe: (() => void) | null = null;
  private readonly listeners = new Set<(n: Notify) => void>();
  /** Addresses we wrote and have not yet seen come back, so echoes are flagged. */
  private readonly inFlight = new Map<string, number>();

  constructor(
    private readonly bridge: DeviceLink,
    private readonly bindings: BindingTable,
  ) {}

  async snapshot(): Promise<Map<ParamPath, ParamValue>> {
    const out = new Map<ParamPath, ParamValue>();
    for (const p of this.bindings.boundPaths()) {
      const b = this.bindings.forPath(p);
      if (!b) continue;
      if (b.isString) out.set(p, await this.bridge.getStr(b.addr));
      else out.set(p, b.codec.decode(await this.bridge.get(b.addr)));
    }
    await this.startFollowing();
    return out;
  }

  async write(path: ParamPath, value: ParamValue): Promise<void> {
    const b = this.bindings.forPath(path);
    if (!b) throw new UnboundPathError(path);
    if (b.isString) {
      await this.bridge.setStr(b.addr, String(value));
      this.emit({ path, value, echo: true });
      return;
    }
    const raw = b.codec.encode(value);
    this.inFlight.set(b.addr, raw);
    await this.bridge.set(b.addr, raw);
    this.emit({ path, value, echo: true });
  }

  onNotify(listener: (n: Notify) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
    this.inFlight.clear();
  }

  /**
   * Follow every bound address, so an edit made on the unit's own panel lands
   * on the simulated screen. This is the direction that makes the simulator a
   * mirror rather than a one-way remote.
   */
  private async startFollowing(): Promise<void> {
    if (this.unsubscribe) return;
    const addrs = this.bindings
      .boundPaths()
      .map((p) => this.bindings.forPath(p)?.addr)
      .filter((a): a is string => typeof a === "string");
    if (addrs.length === 0) return;
    this.unsubscribe = await this.bridge.subscribe(addrs, (addr, raw) => {
      const p = this.bindings.pathForAddr(addr);
      if (p === undefined) return;
      const b = this.bindings.forPath(p);
      if (!b) return;
      const echo = this.inFlight.get(addr) === raw;
      if (echo) this.inFlight.delete(addr);
      this.emit({ path: p, value: b.codec.decode(raw), echo });
    });
  }

  private emit(n: Notify): void {
    for (const l of [...this.listeners]) l(n);
  }
}
