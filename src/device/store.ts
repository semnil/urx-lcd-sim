// The store the UI reads.
//
// Rendering has to be synchronous, and a real device is not: so the store keeps
// a local mirror of every value and pushes edits through the transport in the
// background. The mirror is updated optimistically on `set` and reverted if the
// write is rejected, so a screen never keeps showing a value the unit refused.
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
 * what the device announces.
 */
export type WriteRule = (path: ParamPath, value: ParamValue) => Iterable<[ParamPath, ParamValue]>;

/** One rule that carries every write each of `rules` carries. */
export function combineWriteRules(...rules: WriteRule[]): WriteRule {
  return (path, value) => rules.flatMap((rule) => [...rule(path, value)]);
}

/** Raised when a write is refused by the device; the mirror has been reverted. */
export interface WriteFailure {
  path: ParamPath;
  attempted: ParamValue;
  restored: ParamValue | undefined;
  error: unknown;
}

export class DeviceStore {
  private mirror = new Map<ParamPath, ParamValue>();
  private writeRule: WriteRule | null = null;
  private transport: DeviceTransport | null = null;
  private detachTransport: (() => void) | null = null;
  private readonly listeners = new Set<ChangeListener>();
  private readonly failureListeners = new Set<(f: WriteFailure) => void>();

  /** Paths changed since the last flush, coalesced into one notification. */
  private pending = new Set<ParamPath>();
  private flushScheduled = false;

  /**
   * Point the store at a transport and load its snapshot. Replaces any previous
   * transport (that is how the simulator is switched onto a real unit and back).
   */
  async attach(transport: DeviceTransport): Promise<void> {
    this.detachTransport?.();
    this.transport = transport;
    this.detachTransport = transport.onNotify((n) => {
      const current = this.mirror.get(n.path);
      if (current === n.value) return;
      this.mirror.set(n.path, n.value);
      this.markChanged(n.path);
    });
    const snap = await transport.snapshot();
    this.mirror = new Map(snap);
    for (const p of snap.keys()) this.markChanged(p);
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

  /**
   * Edit a value: mirror it now, send it to the device, revert on rejection.
   * Returns the write promise so callers that must sequence (a scene recall
   * writing many values in order) can await it; UI handlers ignore it.
   */
  set(path: ParamPath, value: ParamValue): Promise<void> {
    const previous = this.mirror.get(path);
    if (previous === value) return Promise.resolve();
    this.mirror.set(path, value);
    this.markChanged(path);
    // Each write the rule adds is an ordinary edit, with its own optimistic
    // update and its own revert. A rule that points back at the path it was
    // given stops on the guard above, which has already taken the new value.
    if (this.writeRule) for (const [p, v] of this.writeRule(path, value)) void this.set(p, v);

    const t = this.transport;
    if (!t) return Promise.resolve();
    return t.write(path, value).catch((error: unknown) => {
      if (previous === undefined) this.mirror.delete(path);
      else this.mirror.set(path, previous);
      this.markChanged(path);
      for (const l of [...this.failureListeners]) {
        l({ path, attempted: value, restored: previous, error });
      }
    });
  }

  /** Nudge a numeric value and clamp it — what every knob gesture does. */
  step(path: ParamPath, delta: number, min: number, max: number, fallback = 0): number {
    const next = clamp(this.num(path, fallback) + delta, min, max);
    void this.set(path, next);
    return next;
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
