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
   * True when this notify is the transport echoing a write we just issued.
   * The store uses it to avoid re-rendering a control the operator is dragging.
   */
  echo: boolean;
}

export interface DeviceTransport {
  readonly kind: TransportKind;

  /** Read every value the device currently holds. Called once on attach. */
  snapshot(): Promise<Map<ParamPath, ParamValue>>;

  /**
   * Push one edit to the device. Resolves when the device has accepted it.
   * Rejects rather than resolving on a partial write: the caller reverts the
   * local mirror instead of leaving the screen showing a value the unit never
   * took.
   */
  write(path: ParamPath, value: ParamValue): Promise<void>;

  /** Register for device-originated changes. Returns an unsubscribe function. */
  onNotify(listener: (n: Notify) => void): () => void;

  /** Release any connection. Safe to call more than once. */
  close(): void;
}
