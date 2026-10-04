// The values the screens keep for their own showing rather than for the unit.

import type { ParamPath } from "../device/path";

/** The counters the recorder and playback keep for their screens, and the moments they count from. */
const RECORDER_CLOCKS: readonly ParamPath[] = ["sd.recSeconds", "sd.recSince", "sd.playSeconds", "sd.playSince"];

/**
 * A value the screens keep for their own showing: anything under `ui.`, and the
 * recorder's and playback's counters with the moments they count from.
 */
export function screenOnly(path: ParamPath): boolean {
  return path.startsWith("ui.") || RECORDER_CLOCKS.includes(path);
}
