// The simulated device: values live in a Map in this process.
//
// It behaves like the hardware in the two ways that matter to the layers above:
// a write is asynchronous and echoes back as a notify, and a change can also
// originate from the device side with no write behind it (`inject`), which is
// what a scene recall or a hand on the front panel looks like to the app.

import type { ParamPath, ParamValue } from "./path";
import type { DeviceTransport, Notify } from "./transport";

export class SimTransport implements DeviceTransport {
  readonly kind = "sim" as const;

  private readonly values: Map<ParamPath, ParamValue>;
  private readonly listeners = new Set<(n: Notify) => void>();
  private closed = false;

  constructor(initial: Map<ParamPath, ParamValue> | Iterable<[ParamPath, ParamValue]>) {
    this.values = new Map(initial);
  }

  snapshot(): Promise<Map<ParamPath, ParamValue>> {
    return Promise.resolve(new Map(this.values));
  }

  write(path: ParamPath, value: ParamValue): Promise<void> {
    if (this.closed) return Promise.reject(new Error("transport closed"));
    this.values.set(path, value);
    this.emit({ path, value, echo: true });
    return Promise.resolve();
  }

  /**
   * A change made on the device itself: a scene recall, an automatic level
   * adjustment finishing, a physical knob being turned. Not an echo, so the
   * store adopts it even while the operator is holding another control.
   */
  inject(path: ParamPath, value: ParamValue): void {
    if (this.closed) return;
    this.values.set(path, value);
    this.emit({ path, value, echo: false });
  }

  /** Apply many device-side changes as one burst (what a scene recall is). */
  injectAll(entries: Iterable<[ParamPath, ParamValue]>): void {
    for (const [p, v] of entries) this.inject(p, v);
  }

  peek(path: ParamPath): ParamValue | undefined {
    return this.values.get(path);
  }

  onNotify(listener: (n: Notify) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  private emit(n: Notify): void {
    for (const l of [...this.listeners]) l(n);
  }
}
