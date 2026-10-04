// The transport that puts a real URX unit behind the simulated LCD.
//
// It owns no protocol of its own: the caller injects a `DeviceLink` — four
// read/write verbs plus a subscription. This file is therefore the whole of the
// integration: give it a link and a filled BindingTable and the same screens
// drive hardware.
//
// Four rules it will not bend:
//   - An unbound path is refused, never guessed onto some nearby address.
//   - A value its codec does not turn into a finite number is refused before
//     anything is sent.
//   - A snapshot that cannot be read completely is an error, not a partial
//     answer: a half-read screen invites an edit against values that were
//     never established.
//   - After close, a write or a snapshot is refused, a snapshot reads no
//     further address, and no subscription is left open on the link.
//
// Writes to one address go to the link one at a time, each once the link has
// answered the one before.

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
  /** The subscribe the link has not answered yet, which every snapshot waiting on it shares. */
  private subscribing: Promise<void> | null = null;
  /** How many snapshots are under way, each of them relying on the subscription. */
  private snapshotsUnderWay = 0;
  /** Whether a snapshot has been read in full, after which the following stays. */
  private snapshotRead = false;
  private closed = false;
  private readonly listeners = new Set<(n: Notify) => void>();
  /** The newest write issued to each address, sent or still waiting its turn. */
  private readonly newest = new Map<string, object>();
  /**
   * The write last sent to each address that no notify has followed since, with
   * the raw value of a numeric one. A notify carrying that raw value is flagged
   * as its echo, and any notify for the address clears it.
   */
  private readonly inFlight = new Map<string, { raw?: number }>();
  /** The newest read of each string address taken on its notify and not yet answered. */
  private readonly strReads = new Map<string, Promise<string>>();
  /** The last write queued on each address, which the next write to it waits for. */
  private readonly lanes = new Map<string, Promise<void>>();

  constructor(
    private readonly bridge: DeviceLink,
    private readonly bindings: BindingTable,
  ) {}

  /**
   * Follow every bound address, then read each one. What the unit announces
   * while they are read goes to the listeners as it comes. A snapshot that
   * cannot be read stops the following, unless another snapshot is still
   * under way or one has already been read in full. A snapshot taken after
   * close is refused, and one the transport is closed during reads no further
   * address and is refused.
   */
  async snapshot(): Promise<Map<ParamPath, ParamValue>> {
    if (this.closed) throw new Error("transport closed");
    this.snapshotsUnderWay++;
    try {
      await this.startFollowing();
      const out = new Map<ParamPath, ParamValue>();
      for (const p of this.bindings.boundPaths()) {
        if (this.closed) throw new Error("transport closed");
        const b = this.bindings.forPath(p);
        if (!b) continue;
        if (b.isString) out.set(p, await this.bridge.getStr(b.addr));
        else out.set(p, b.codec.decode(await this.bridge.get(b.addr)));
      }
      if (this.closed) throw new Error("transport closed");
      this.snapshotRead = true;
      return out;
    } catch (error) {
      if (this.snapshotsUnderWay === 1 && !this.snapshotRead) {
        this.unsubscribe?.();
        this.unsubscribe = null;
      }
      throw error;
    } finally {
      this.snapshotsUnderWay--;
    }
  }

  /**
   * Resolves with what the unit holds after the write: the value as encoded for
   * it, or the string written. The write goes out, calling `onSent`, once the
   * link has answered every write queued on its address before it.
   */
  async write(path: ParamPath, value: ParamValue, onSent?: () => void): Promise<ParamValue> {
    if (this.closed) throw new Error("transport closed");
    const b = this.bindings.forPath(path);
    if (!b) throw new UnboundPathError(path);
    const addr = b.addr;
    if (b.isString) {
      const sentStr = {};
      this.newest.set(addr, sentStr);
      await this.inTurn(addr, () => {
        onSent?.();
        this.inFlight.set(addr, sentStr);
        return this.bridge.setStr(addr, String(value));
      });
      // The echo goes out only while the write is the newest to its address and
      // no notify for the address has come since it was sent.
      if (this.newest.get(addr) === sentStr && this.inFlight.get(addr) === sentStr) this.emit({ path, value, echo: true });
      return String(value);
    }
    const raw = b.codec.encode(value);
    if (!Number.isFinite(raw)) throw new Error(`"${path}" does not encode ${String(value)} to a number`);
    const sent = { raw };
    this.newest.set(addr, sent);
    await this.inTurn(addr, () => {
      onSent?.();
      this.inFlight.set(addr, sent);
      return this.bridge.set(addr, raw);
    });
    const held = b.codec.decode(raw);
    // The echo carries the value as encoded for the unit, and goes out only
    // while the write is the newest to its address and no notify for the
    // address has come since it was sent.
    if (this.newest.get(addr) === sent && this.inFlight.get(addr) === sent) this.emit({ path, value: held, echo: true });
    return held;
  }

  onNotify(listener: (n: Notify) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.listeners.clear();
    this.inFlight.clear();
    this.strReads.clear();
  }

  /**
   * Follow every bound address, so an edit made on the unit's own panel lands
   * on the simulated screen. This is the direction that makes the simulator a
   * mirror rather than a one-way remote. Snapshots that overlap share one
   * subscribe.
   */
  private startFollowing(): Promise<void> {
    if (this.unsubscribe) return Promise.resolve();
    this.subscribing ??= this.follow().finally(() => {
      this.subscribing = null;
    });
    return this.subscribing;
  }

  /** Subscribe to every bound address; a subscription the link answers after close is let go at once. */
  private async follow(): Promise<void> {
    const addrs = this.bindings
      .boundPaths()
      .map((p) => this.bindings.forPath(p)?.addr)
      .filter((a): a is string => typeof a === "string");
    if (addrs.length === 0) return;
    const unsubscribe = await this.bridge.subscribe(addrs, (addr, raw) => {
      const p = this.bindings.pathForAddr(addr);
      if (p === undefined) return;
      const b = this.bindings.forPath(p);
      if (!b) return;
      if (b.isString) {
        this.inFlight.delete(addr);
        this.readAgain(p, addr);
        return;
      }
      const echo = this.inFlight.get(addr)?.raw === raw;
      this.inFlight.delete(addr);
      this.emit({ path: p, value: b.codec.decode(raw), echo });
    });
    if (this.closed) unsubscribe();
    else this.unsubscribe = unsubscribe;
  }

  /**
   * A notify carries no string, so a string address is read again on its
   * notify and the string read goes out. A read that fails, or that a later
   * read of the same address has overtaken, sends nothing.
   */
  private readAgain(path: ParamPath, addr: string): void {
    const read = this.bridge.getStr(addr);
    this.strReads.set(addr, read);
    read.then(
      (value) => {
        if (this.strReads.get(addr) !== read) return;
        this.strReads.delete(addr);
        this.emit({ path, value, echo: false });
      },
      () => {
        if (this.strReads.get(addr) === read) this.strReads.delete(addr);
      },
    );
  }

  /**
   * Run `op` once the link has answered every write queued on `addr`. One whose
   * turn comes after close is refused without being sent.
   */
  private afterWrites<T>(addr: string, op: () => Promise<T>): Promise<T> {
    const run = (): Promise<T> => (this.closed ? Promise.reject(new Error("transport closed")) : op());
    const ahead = this.lanes.get(addr);
    return ahead ? ahead.then(run) : run();
  }

  /**
   * Send a write once the link has answered every write queued on `addr`
   * before it, so writes reach the unit, and come back, in the order they were
   * issued.
   */
  private inTurn(addr: string, op: () => Promise<void>): Promise<void> {
    const turn = this.afterWrites(addr, op);
    const answered = turn.then(
      () => {},
      () => {},
    );
    this.lanes.set(addr, answered);
    void answered.then(() => {
      if (this.lanes.get(addr) === answered) this.lanes.delete(addr);
    });
    return turn;
  }

  private emit(n: Notify): void {
    for (const l of [...this.listeners]) l(n);
  }
}
