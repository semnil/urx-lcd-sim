// How many tracks the microSD recorder carries at a sampling frequency.
//
// The unit acts on this itself: raising the frequency lowers its own Track
// Count to fit, and lowering the frequency again does not raise it back. So the
// count is lowered when the frequency MOVES, not when it is read — a clamp at
// read time would hand the old count back the moment the frequency came down.

import type { DeviceStore } from "../device/store";

/** The counts the recorder offers, in the order its list prints them. */
export const TRACK_COUNTS = [2, 4, 6, 8, 10, 12, 14, 16];

/** The most tracks the recorder carries at `rate`. */
export function trackCountCeiling(rate: number): number {
  if (rate > 96000) return 2;
  if (rate > 48000) return 8;
  return 16;
}

/** The count a recorder standing at `count` is left with once `rate` is taken. */
export function trackCountAtRate(count: number, rate: number): number {
  return Math.min(count, trackCountCeiling(rate));
}

/**
 * Take the recorder down to what `rate` carries. Every path that moves the
 * frequency runs this: the SAMPLING FREQUENCY screen, a settings file being
 * loaded, and a unit coming back from storage.
 */
export function dropTracksOverRate(store: DeviceStore, rate: number): void {
  if (!store.has("sd.trackCount")) return;
  const held = store.num("sd.trackCount", 16);
  const fits = trackCountAtRate(held, rate);
  if (fits !== held) void store.set("sd.trackCount", fits);
}
