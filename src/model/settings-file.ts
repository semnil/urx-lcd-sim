// What a settings file on the microSD card carries.
//
// It holds the unit as it stands — the mixer, the monitor and phones buses, the
// oscillator, the scene memories, the unit's own settings and the destination
// HOME's [Sends] shows — and leaves out the rest of the screen's own state, the
// card, the clock and what a linked pair's compressors hear, which follow the
// unit rather than the file.

import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";
import { isClockPath } from "./clock";
import { asPutBack, withEverySceneCleared } from "./scene-state";
import { SENDS_TARGET_SHIPPED } from "./types";

/** What stays behind when a settings file is written. */
const NOT_SAVED = ["ui.", "sd.", "pair."];

/** The screen's own state under `ui.` a settings file carries: the destination HOME's [Sends] shows. */
const SENDS_TARGET: ParamPath = "ui.sendsTarget";

/**
 * The screen's own state kept outside `ui.`, which a load leaves where it stands:
 * the tabs OUTPUT PATCH, PERIPHERAL and SCENE LIST stand on. SCENE LIST's cursor
 * is carried, and a load puts it back.
 */
const SCREEN_STATE = new Set<ParamPath>(["setup.outputPatch.tab", "setup.peripheral.tab", "scene.bank"]);

/** Whether a settings file carries the value at this path. */
export function inSettingsFile(path: ParamPath): boolean {
  return path === SENDS_TARGET || (!NOT_SAVED.some((p) => path.startsWith(p)) && !SCREEN_STATE.has(path) && !isClockPath(path));
}

/** The unit as it stands, ready to be written to the card. */
export function captureSettings(store: DeviceStore): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const path of store.paths()) if (inSettingsFile(path)) out[path] = store.get(path, 0);
  return out;
}

/**
 * Put a settings file back on the unit, one value after another, announcing what
 * changed once it is all back. A source whose digital gain the file does not name
 * comes back at 0 dB, a BALANCE it does not name at the centre, a scene number
 * it does not name comes back empty, and HOME's [Sends], where the file does not
 * name its destination and the store holds one, comes back on the stereo bus.
 */
export async function applySettings(store: DeviceStore, state: Record<string, ParamValue>): Promise<void> {
  const named = SENDS_TARGET in state || !store.has(SENDS_TARGET) ? state : { ...state, [SENDS_TARGET]: SENDS_TARGET_SHIPPED };
  await store.batch(async () => {
    for (const [path, value] of Object.entries(withEverySceneCleared(store, asPutBack(store, named)))) {
      if (!inSettingsFile(path)) continue;
      await store.restore(path, value);
    }
  });
}
