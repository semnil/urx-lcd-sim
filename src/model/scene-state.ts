// What a scene memory carries, and how it is put back.
//
// A scene holds the whole mixer: every bus assign, send, tap, fader, pan, EQ,
// dynamics, name and colour, the head amp's gain and its +48V among them, and
// the digital gain of each input source. Since System firmware V1.5 it holds
// the output patch and the streaming bus too, but for the streaming bus's
// delay frame rate (confirmed on a URX22 and a URX44V). It leaves out each
// strip's [CUE] (the guide's list of what a scene does not save), the monitor
// and phones buses, the oscillator, the recorder and the unit's own settings —
// those follow the unit rather than the scene.

import type { DeviceStore } from "../device/store";
import type { ParamPath, ParamValue } from "../device/path";
import { fromJson } from "../device/value-json";
import { withEverySourceGain } from "./source-gain";

/** The subtrees a scene is taken from: the mixer and the output patch. */
const MIXER = ["ch", "source", "setup.outputPatch"];

/** What stands inside those subtrees and still follows the unit: the tab OUTPUT PATCH stands on, and the streaming bus's frame rate. */
const NOT_IN_A_SCENE = new Set<ParamPath>(["setup.outputPatch.tab", "ch.bus.stream.delay.frameRate"]);

/** Whether the value at this path is a strip's [CUE]. */
export function isCue(path: ParamPath): boolean {
  return path.startsWith("ch.") && path.endsWith(".cue");
}

/** Whether a scene carries the value at this path. */
export function inScene(path: ParamPath): boolean {
  return MIXER.some((m) => path === m || path.startsWith(`${m}.`)) && !NOT_IN_A_SCENE.has(path) && !isCue(path);
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
 * What the recall changed is announced once, when it is all back.
 */
export async function applyScene(store: DeviceStore, state: Record<string, ParamValue>): Promise<void> {
  await store.batch(async () => {
    for (const [path, value] of Object.entries(state)) {
      if (!inScene(path)) continue;
      await store.restore(path, value);
    }
  });
}

/** What a bank keeps under a scene number: its title, its mixer and its protection. */
const SCENE_MEMORY = /^scene\.[^.]+\.\d+\.(title|state|protect)$/;

/** Whether a path holds a scene memory's title, mixer or protection. */
export function isSceneMemory(path: ParamPath): boolean {
  return SCENE_MEMORY.test(path);
}

/**
 * A settings file as it is put back. A scene number the file does not name
 * comes back empty: no title, no mixer, and unprotected.
 */
export function withEverySceneCleared(store: DeviceStore, state: Record<ParamPath, ParamValue>): Record<ParamPath, ParamValue> {
  const out = { ...state };
  for (const path of store.pathsUnder("scene")) {
    const part = SCENE_MEMORY.exec(path)?.[1];
    if (part && !(path in out)) out[path] = part === "protect" ? 0 : "";
  }
  return out;
}

/**
 * A saved state as a recall or a settings file load puts it back: a source's
 * digital gain and a BALANCE, a strip's or a send's, that the store holds and
 * the state names none for come back at 0, the centre for a BALANCE.
 */
export function asPutBack(store: DeviceStore, state: Record<ParamPath, ParamValue>): Record<ParamPath, ParamValue> {
  const out = withEverySourceGain(store, state);
  for (const path of store.pathsUnder("ch")) if (path.endsWith(".balance") && !(path in out)) out[path] = 0;
  return out;
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
