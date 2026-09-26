// What a settings file on the microSD card carries.
//
// It holds the unit as it stands — the mixer, the monitor and phones buses, the
// oscillator, the scene memories and the unit's own settings — and leaves out
// the screen's own state, the card, the clock and what a linked pair's
// compressors hear, which follow the unit rather than the file.

import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";
import { isClockPath } from "./clock";

/** What stays behind when a settings file is written. */
const NOT_SAVED = ["ui.", "sd.", "pair."];

/** Whether a settings file carries the value at this path. */
export function inSettingsFile(path: ParamPath): boolean {
  return !NOT_SAVED.some((p) => path.startsWith(p)) && !isClockPath(path);
}

/** The unit as it stands, ready to be written to the card. */
export function captureSettings(store: DeviceStore): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const path of store.paths()) if (inSettingsFile(path)) out[path] = store.get(path, 0);
  return out;
}

/** Put a settings file back on the unit, one value after another. */
export async function applySettings(store: DeviceStore, state: Record<string, ParamValue>): Promise<void> {
  for (const [path, value] of Object.entries(state)) {
    if (!inSettingsFile(path)) continue;
    await store.restore(path, value);
  }
}
