// Parameter addressing.
//
// The simulator addresses every settable value by a semantic dot path
// ("ch.1.level", "setup.brightness", "monitor.1.on") rather than by the unit's
// address the unit answers to. Two reasons:
//
//   1. Screens read and write meaning, not encodings. A screen that knows
//      "ch.1.level" survives a change in how that value is carried on the wire.
//   2. The numeric ids belong to the device protocol, and only addresses that
//      have been validated against real hardware may ever be written to a unit.
//      Binding a path to an id is therefore a separate, explicit table
//      (see device/binding.ts) that is empty until a validated catalog is
//      supplied — the simulator never invents an address.

/** A semantic parameter address, e.g. "ch.3.gate.threshold". */
export type ParamPath = string;

/** Every value the store can hold. Enumerations travel as their string tag. */
export type ParamValue = number | string | boolean;

/** Join path segments, so callers never hand-build a dotted string. */
export function path(...segments: (string | number)[]): ParamPath {
  return segments.join(".");
}

/** The channel-scoped prefix for `id`, e.g. chPath("ch_5_6", "level"). */
export function chPath(channelId: string, ...rest: (string | number)[]): ParamPath {
  return path("ch", channelId, ...rest);
}

/**
 * Whether `p` is inside the subtree `prefix` (or is `prefix` itself).
 * Used by follow/refresh logic to decide which screens a burst of updates
 * invalidates, without parsing the path into pieces.
 */
export function inSubtree(p: ParamPath, prefix: ParamPath): boolean {
  return p === prefix || p.startsWith(prefix + ".");
}
