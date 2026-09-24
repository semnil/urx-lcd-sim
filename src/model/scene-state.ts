// What a scene memory carries, and how it is put back.
//
// A scene holds the whole mixer: every bus assign, send, tap, fader, pan, EQ,
// dynamics, name and colour, the head amp's gain and its +48V among them, and
// the digital gain of each input source. It
// leaves out the monitor and phones buses, the oscillator, the streaming bus,
// the output patch, the recorder and the unit's own settings — those follow the
// unit rather than the scene.

import type { DeviceStore } from "../device/store";
import type { ParamPath, ParamValue } from "../device/path";
import { fromJson } from "../device/value-json";

/** The subtrees a scene is taken from. */
const MIXER = ["ch", "source"];

/** What stands inside that subtree and still follows the unit. */
const NOT_IN_A_SCENE = ["ch.bus.stream."];

/** Whether a scene carries the value at this path. */
export function inScene(path: ParamPath): boolean {
  return MIXER.some((m) => path === m || path.startsWith(`${m}.`)) && !NOT_IN_A_SCENE.some((p) => path.startsWith(p));
}

/** The mixer as it stands, ready to be stored under a scene number. */
export function captureScene(store: DeviceStore): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const path of MIXER.flatMap((m) => store.pathsUnder(m))) {
    if (inScene(path)) out[path] = store.get(path, 0);
  }
  return out;
}

/**
 * Put a stored mixer back. Writes run one after another so a value the device
 * refuses leaves the rest of the recall where it was rather than racing it, and
 * a path the scene does not carry is left alone whatever the stored copy holds.
 */
export async function applyScene(store: DeviceStore, state: Record<string, ParamValue>): Promise<void> {
  for (const [path, value] of Object.entries(state)) {
    if (!inScene(path)) continue;
    await store.restore(path, value);
  }
}

/** Read back what `captureScene` wrote, or nothing where the number holds no mixer. */
export function readScene(store: DeviceStore, path: ParamPath): Record<string, ParamValue> | undefined {
  const text = store.str(path, "");
  if (!text) return undefined;
  try {
    const parsed: unknown = fromJson(text);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, ParamValue>) : undefined;
  } catch {
    return undefined;
  }
}
