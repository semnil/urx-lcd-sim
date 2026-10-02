// The store the UI reads.
//
// Rendering has to be synchronous, and a real device is not: so the store keeps
// a local mirror of every value and pushes edits through the transport in the
// background. The mirror is updated optimistically on `set`, and a rejected
// write still on screen goes back to the value the unit holds, so a screen
// never keeps showing a value the unit refused.
//
// Every notify that differs from the mirror is adopted, an echo of our own write
// (`echo: true`) and a change made on the device (`echo: false`) alike; the
// latter is the path a scene recall, or somebody turning a knob on the unit
// itself, reaches the screen by. It relies on the transport to send no echo for
// a write that a later write has overtaken.

import type { ParamPath, ParamValue } from "./path";
import { inSubtree } from "./path";
import type { DeviceTransport, Notify } from "./transport";

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
 * holds after it: where the refused write was still the newest to its path and
 * still on screen, the value the device holds as the store last heard of it —
 * announced in a notify, or reported by the transport for a write the device
 * took with nothing announced after that write was sent — and otherwise the
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
  /**
   * The value the device holds for the path as the store last heard of it:
   * announced in a notify, or reported by the transport for a write the device
   * took with nothing announced after that write was sent. Undefined where it
   * held none.
   */
  held: ParamValue | undefined;
  /** The number of the newest write sent when the device last announced a value for the path. */
  heard: number;
}

export class DeviceStore {
  private mirror = new Map<ParamPath, ParamValue>();
  private writeRule: WriteRule | null = null;
  private transport: DeviceTransport | null = null;
  private detachTransport: (() => void) | null = null;
  private readonly listeners = new Set<ChangeListener>();
  private readonly failureListeners = new Set<(f: WriteFailure) => void>();
  private readonly moveListeners = new Set<() => void>();

  /** Each path with writes awaiting the device, and the count each write is numbered from. */
  private readonly awaiting = new Map<ParamPath, Awaited>();
  private writes = 0;

  /** The count each attach is numbered from; the newest one is the one that takes the store. */
  private attaches = 0;

  /** Paths changed since the last flush, coalesced into one notification. */
  private pending = new Set<ParamPath>();
  private changes = 0;
  private flushScheduled = false;

  /**
   * Point the store at a transport and load its snapshot. Replaces any previous
   * transport (that is how the simulator is switched onto a real unit and back).
   * Every path the snapshot holds, and every path it drops, is a change.
   *
   * The store stays on the transport it was on until the snapshot is in, and
   * then moves its transport, its notifies and its mirror over at once. What
   * the new transport announces while its snapshot is read is taken after the
   * snapshot. A snapshot that cannot be read leaves the store where it was and
   * throws; one that comes in after a later attach is dropped. The listeners
   * given to `onBeforeMove` are told just before the move.
   */
  async attach(transport: DeviceTransport): Promise<void> {
    const turn = ++this.attaches;
    let early: Notify[] | null = [];
    const detach = transport.onNotify((n) => {
      if (early) early.push(n);
      else this.adopt(n);
    });
    let snap: Map<ParamPath, ParamValue>;
    try {
      snap = await transport.snapshot();
    } catch (error) {
      detach();
      throw error;
    }
    if (turn !== this.attaches) {
      detach();
      return;
    }
    for (const l of [...this.moveListeners]) l();
    this.detachTransport?.();
    this.transport = transport;
    this.detachTransport = detach;
    this.awaiting.clear();
    const before = this.mirror;
    this.mirror = new Map(snap);
    for (const p of snap.keys()) this.markChanged(p);
    for (const p of before.keys()) if (!snap.has(p)) this.markChanged(p);
    const announced = early;
    early = null;
    for (const n of announced) this.adopt(n);
  }

  /** Take a notify as what the device holds, and mirror it where it differs. */
  private adopt(n: Notify): void {
    const awaited = this.awaiting.get(n.path);
    if (awaited) {
      awaited.held = n.value;
      awaited.heard = this.writes;
    }
    const current = this.mirror.get(n.path);
    if (current === n.value) return;
    this.mirror.set(n.path, n.value);
    this.markChanged(n.path);
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

  private write(path: ParamPath, value: ParamValue, carry: boolean, carried = false): Promise<void> {
    const previous = this.mirror.get(path);
    // A value the mirror already holds is sent again only while an earlier
    // write to the path awaits the device, and never as a write a rule carries.
    if (previous === value && (carried || !this.awaiting.has(path))) return Promise.resolve();
    this.mirror.set(path, value);
    this.markChanged(path);
    // Each write the rule adds is an edit with its own optimistic update and
    // its own revert. A rule that points back at the path it was given stops
    // on the guard above, which has already taken the new value.
    if (carry && this.writeRule) for (const [p, v] of this.writeRule(path, value)) void this.write(p, v, true, true);

    const t = this.transport;
    if (!t) return Promise.resolve();
    const awaited = this.awaiting.get(path) ?? { newest: 0, open: 0, held: previous, heard: 0 };
    const n = ++this.writes;
    awaited.newest = n;
    awaited.open++;
    this.awaiting.set(path, awaited);
    const settle = (): void => {
      if (--awaited.open === 0 && this.awaiting.get(path) === awaited) this.awaiting.delete(path);
    };
    return t.write(path, value).then(
      (held) => {
        // What the transport reports the device holding after the write is
        // taken as what it holds, unless the device announced a value after the
        // write was sent.
        if (awaited.heard < n) awaited.held = held;
        settle();
      },
      (error: unknown) => {
        const onThisTransport = this.awaiting.get(path) === awaited;
        settle();
        // A refused write goes back to what the device holds only while it is
        // the newest write to the path on the transport the store is on and is
        // still on screen; a later write, a value the device announced since, or
        // a snapshot the store has moved onto, stays.
        if (onThisTransport && awaited.newest === n && this.mirror.get(path) === value) {
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

  /**
   * Tell `listener` just before an attach moves the store onto its new
   * transport, while `kind` and the mirror are still the old transport's.
   */
  onBeforeMove(listener: () => void): () => void {
    this.moveListeners.add(listener);
    return () => this.moveListeners.delete(listener);
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
