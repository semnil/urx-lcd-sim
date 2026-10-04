// The seam between the simulator and whatever is actually holding the values.
//
// Everything above this file — the state store, the screens, the widgets — only
// ever talks to a DeviceTransport. Swapping the implementation is what turns the
// simulator into a remote control for a physical unit:
//
//   SimTransport      values live in this process (default)
//   BridgeTransport   values live on a URX unit, reached through an injected
//                     device link (see docs/en/device-integration.md)
//
// The verb set is the smallest one a unit needs: write one address, and hear
// about changes made anywhere — including on the unit's own panel — through a
// notify stream.

import type { ParamPath, ParamValue } from "./path";

export type TransportKind = "sim" | "bridge";

/** A value change originating from the device (or the simulated device). */
export interface Notify {
  path: ParamPath;
  value: ParamValue;
  /**
   * True when this notify is the transport echoing a write we issued. A
   * transport sends no echo for a write that a later write has overtaken; the
   * store does not tell echoes apart and takes every notify that differs from
   * its mirror, unless a write to the path has yet to go out to the device.
   */
  echo: boolean;
}

export interface DeviceTransport {
  readonly kind: TransportKind;

  /** Read every value the device currently holds. Called once on attach. */
  snapshot(): Promise<Map<ParamPath, ParamValue>>;

  /**
   * Push one edit to the device. Resolves when the device has accepted it,
   * with the value the device holds for the path after it. Rejects rather than
   * resolving on a partial write: the caller reverts the local mirror instead
   * of leaving the screen showing a value the unit never took. Writes to one
   * path reach the device in the order they were issued. `onSent` is called as
   * the write goes out to the device, before it settles: a notify that comes
   * before that is older than the write.
   */
  write(path: ParamPath, value: ParamValue, onSent?: () => void): Promise<ParamValue>;

  /**
   * Whether `write` can take `path` at all. False for a path it refuses
   * whatever the value. A transport without it takes every path.
   */
  writable?(path: ParamPath): boolean;

  /** Register for device-originated changes. Returns an unsubscribe function. */
  onNotify(listener: (n: Notify) => void): () => void;

  /** Release any connection. Safe to call more than once. A write after close is refused. */
  close(): void;
}
