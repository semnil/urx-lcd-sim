// The store the UI reads.
//
// Rendering has to be synchronous, and a real device is not: so the store keeps
// a local mirror of every value and pushes edits through the transport in the
// background. The mirror is updated optimistically on `set`, and a rejected
// write still on screen goes back to the value the unit last took, so a screen
// never keeps showing a value the unit refused.
//
// Device-originated notifies (`echo: false`) are adopted unconditionally — that
// is the path a scene recall, or somebody turning a knob on the unit itself,
// reaches the screen by.

import type { ParamPath, ParamValue } from "./path";
import { inSubtree } from "./path";
import type { DeviceTransport } from "./transport";

export type ChangeListener = (paths: ReadonlySet<ParamPath>) => void;

/**
 * The other writes an edit carries with it. It runs on edits alone, not on
 * what the device announces or on a restore.
 */
export type WriteRule = (path: ParamPath, value: ParamValue) => Iterable<[ParamPath, ParamValue]>;

/** One rule that carries every write each of `rules` carries. */
export function combineWriteRules(...rules: WriteRule[]): WriteRule {
  return (path, value) => rules.flatMap((rule) => [...rule(path, value)]);
}

/**
 * Raised when a write is refused by the device. `restored` is what the mirror
 * holds after it: the value the device last took or announced where the refused
 * write was still the newest to its path and still on screen, and otherwise the
 * value a later write or the device put there.
 */
export interface WriteFailure {
  path: ParamPath;
  attempted: ParamValue;
  restored: ParamValue | undefined;
  error: unknown;
}

/** A path with writes awaiting the device's answer. */
interface Awaited {
  /** The number of the newest write to the path. */
  newest: number;
  /** How many of its writes are awaiting an answer. */
  open: number;
  /** The value the device last took or announced for the path; undefined where it held none. */
  held: ParamValue | undefined;
}

export class DeviceStore {
  private mirror = new Map<ParamPath, ParamValue>();
  private writeRule: WriteRule | null = null;
  private transport: DeviceTransport | null = null;
  private detachTransport: (() => void) | null = null;
  private readonly listeners = new Set<ChangeListener>();
  private readonly failureListeners = new Set<(f: WriteFailure) => void>();

  /** Each path with writes awaiting the device, and the count each write is numbered from. */
  private readonly awaiting = new Map<ParamPath, Awaited>();
  private writes = 0;

  /** Paths changed since the last flush, coalesced into one notification. */
  private pending = new Set<ParamPath>();
  private changes = 0;
  private flushScheduled = false;

  /**
   * Point the store at a transport and load its snapshot. Replaces any previous
   * transport (that is how the simulator is switched onto a real unit and back).
   * Every path the snapshot holds, and every path it drops, is a change.
   */
  async attach(transport: DeviceTransport): Promise<void> {
    this.detachTransport?.();
    this.transport = transport;
    this.detachTransport = transport.onNotify((n) => {
      const awaited = this.awaiting.get(n.path);
      if (awaited) awaited.held = n.value;
      const current = this.mirror.get(n.path);
      if (current === n.value) return;
      this.mirror.set(n.path, n.value);
      this.markChanged(n.path);
    });
    const snap = await transport.snapshot();
    const before = this.mirror;
    this.mirror = new Map(snap);
    for (const p of snap.keys()) this.markChanged(p);
    for (const p of before.keys()) if (!snap.has(p)) this.markChanged(p);
  }

  /** A count that moves on every change to the mirror, for whatever keeps what it worked out from the values. */
  get revision(): number {
    return this.changes;
  }

  get kind(): string {
    return this.transport?.kind ?? "detached";
  }

  /** Synchronous read of the mirror. `fallback` covers a path never written. */
  get<T extends ParamValue>(path: ParamPath, fallback: T): T {
    const v = this.mirror.get(path);
    return (v === undefined ? fallback : v) as T;
  }

  num(path: ParamPath, fallback = 0): number {
    const v = this.mirror.get(path);
    return typeof v === "number" ? v : fallback;
  }

  bool(path: ParamPath, fallback = false): boolean {
    const v = this.mirror.get(path);
    return typeof v === "boolean" ? v : fallback;
  }

  str(path: ParamPath, fallback = ""): string {
    const v = this.mirror.get(path);
    return typeof v === "string" ? v : fallback;
  }

  has(path: ParamPath): boolean {
    return this.mirror.has(path);
  }

  /** Every mirrored path, for whatever takes the whole state in. */
  paths(): ParamPath[] {
    return [...this.mirror.keys()];
  }

  /** Every mirrored path under `prefix`, for screens that enumerate a subtree. */
  pathsUnder(prefix: ParamPath): ParamPath[] {
    return this.paths().filter((p) => inSubtree(p, prefix));
  }

  /**
   * The writes that go with an edit. The store holds one rule and knows
   * nothing of what it decides; the caller supplies the meaning.
   */
  setWriteRule(rule: WriteRule | null): void {
    this.writeRule = rule;
  }

  /** The paths an edit of `path` to `value` carries a write onto. */
  carries(path: ParamPath, value: ParamValue): ParamPath[] {
    return this.writeRule ? [...this.writeRule(path, value)].map(([p]) => p) : [];
  }

  /**
   * Edit a value: mirror it now, send it to the device, revert on rejection.
   * Returns the write promise so callers that must sequence can await it; UI
   * handlers ignore it.
   */
  set(path: ParamPath, value: ParamValue): Promise<void> {
    return this.write(path, value, true);
  }

  /**
   * Put back a value stored together with every value it depends on (a scene,
   * a settings file), writing many in order. It carries none of the writes an
   * edit carries.
   */
  restore(path: ParamPath, value: ParamValue): Promise<void> {
    return this.write(path, value, false);
  }

  private write(path: ParamPath, value: ParamValue, carry: boolean): Promise<void> {
    const previous = this.mirror.get(path);
    if (previous === value) return Promise.resolve();
    this.mirror.set(path, value);
    this.markChanged(path);
    // Each write the rule adds is an ordinary edit, with its own optimistic
    // update and its own revert. A rule that points back at the path it was
    // given stops on the guard above, which has already taken the new value.
    if (carry && this.writeRule) for (const [p, v] of this.writeRule(path, value)) void this.set(p, v);

    const t = this.transport;
    if (!t) return Promise.resolve();
    const awaited = this.awaiting.get(path) ?? { newest: 0, open: 0, held: previous };
    const n = ++this.writes;
    awaited.newest = n;
    awaited.open++;
    this.awaiting.set(path, awaited);
    const settle = (): void => {
      if (--awaited.open === 0) this.awaiting.delete(path);
    };
    return t.write(path, value).then(
      () => {
        awaited.held = value;
        settle();
      },
      (error: unknown) => {
        settle();
        // A refused write goes back to what the device holds only while it is
        // the newest write to the path and still on screen; a later write, or a
        // value the device announced since, stays.
        if (awaited.newest === n && this.mirror.get(path) === value) {
          if (awaited.held === undefined) this.mirror.delete(path);
          else this.mirror.set(path, awaited.held);
          this.markChanged(path);
        }
        const restored = this.mirror.get(path);
        for (const l of [...this.failureListeners]) {
          l({ path, attempted: value, restored, error });
        }
      },
    );
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onWriteFailure(listener: (f: WriteFailure) => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  /** Deliver any coalesced changes immediately (tests, and forced repaints). */
  flush(): void {
    if (this.pending.size === 0) return;
    const batch = this.pending;
    this.pending = new Set();
    this.flushScheduled = false;
    for (const l of [...this.listeners]) l(batch);
  }

  private markChanged(path: ParamPath): void {
    this.changes++;
    this.pending.add(path);
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      this.flush();
    });
  }
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
