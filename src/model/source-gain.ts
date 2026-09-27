// The digital gain of an input source (user guide, "INPUT screen", the NOTE
// under [A.Gain]).
//
// It belongs to the source, not to a channel: every channel on one source —
// mono or stereo — shows and turns the same D.Gain, and a source keeps its value
// while no channel is on it.

import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";

/** The sources whose digital gain ships 14 dB down; every other source ships at 0. */
export const SOURCES_SHIPPED_DOWN = ["USB MAIN A", "USB MAIN B", "USB MAIN C", "USB SUB"];

/** Where a source's digital gain is kept: "USB DAW 1/2" at "source.usb-daw-1-2.digitalGain". */
export function digitalGainPath(source: string): ParamPath {
  const key = source.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "none";
  return `source.${key}.digitalGain`;
}

/** A source's digital gain as the unit ships. */
export function digitalGainShipped(source: string): number {
  return SOURCES_SHIPPED_DOWN.includes(source) ? -14 : 0;
}

/**
 * A saved state as it is put back: a source the store holds a digital gain for
 * and the state names none for comes back at 0 dB.
 */
export function withEverySourceGain(store: DeviceStore, state: Record<ParamPath, ParamValue>): Record<ParamPath, ParamValue> {
  const out = { ...state };
  for (const path of store.pathsUnder("source")) if (path.endsWith(".digitalGain") && !(path in out)) out[path] = 0;
  return out;
}
