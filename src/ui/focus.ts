// The on-screen focus.
//
// Touching a control the unit's knob turns — a value, a list's bar, a grip on a
// plot — puts a pink border around it (user guide, "Basic screen operations").
// Exactly one control holds that focus at a time, across every screen, and it
// survives a repaint — so it lives here rather than inside any one screen. A
// screen can pin it to one value, as 1-knob pins its level: nothing else takes it
// and no other value on the screen turns until the screen changes.

import type { NumericSpec } from "./param-spec";

export class FocusController {
  private current: NumericSpec | null = null;
  private key: string | null = null;
  private pinned = false;
  private readonly listeners = new Set<(spec: NumericSpec | null) => void>();

  get spec(): NumericSpec | null {
    return this.current;
  }

  /** Whether no control holds the focus. */
  get idle(): boolean {
    return this.key === null;
  }

  /** Whether `key` — a parameter's path, or the name a control that turns none took it under — wears the pink border. */
  holds(key: string): boolean {
    return this.key === key;
  }

  take(spec: NumericSpec): void {
    const key = spec.focusKey ?? spec.path;
    if (this.pinned || this.key === key) return;
    this.current = spec;
    this.key = key;
    this.emit();
  }

  /** Give the focus to a control that turns no parameter of its own: a list's bar, a grip on a plot. */
  takeKey(key: string): void {
    if (this.pinned || this.key === key) return;
    this.current = null;
    this.key = key;
    this.emit();
  }

  /** Hold the focus on `spec` until it is released: nothing else takes it meanwhile. */
  pin(spec: NumericSpec): void {
    this.pinned = false;
    this.take(spec);
    this.pinned = true;
  }

  /** Let go of a pin a screen no longer asks for. */
  unpin(): void {
    if (this.pinned) this.release();
  }

  /** Whether the value under `key` may be turned now: always, unless the focus is pinned elsewhere. */
  turns(key: string): boolean {
    return !this.pinned || this.key === key;
  }

  /** Release focus — what leaving a screen that owned the control does. */
  release(): void {
    this.pinned = false;
    if (this.key === null) return;
    this.current = null;
    this.key = null;
    this.emit();
  }

  onChange(listener: (spec: NumericSpec | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of [...this.listeners]) l(this.current);
  }
}
