// Keeping the unit as it was left.
//
// The browser reloads the page far more often than anybody power-cycles a
// mixer, so what the unit holds is written to the browser's own storage and
// read back when the simulator opens on the same model. What the unit was doing
// at that moment — a take running, a file playing, a name half typed — is not
// part of that: those come back stopped, as they do on a unit that has been
// switched off.

import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";
import { LEGACY_CLOCK } from "../model/clock";
import { placeOfReading } from "../model/effects";
import { dropTracksOverRate } from "../model/track-count";
import { fromJson, toJson } from "../device/value-json";

/** Where the browser keeps it. */
const KEY = "urx-lcd-sim.state";

/** The shape written under that key; anything else is read as nothing. */
const VERSION = 1;

/** What a reload does not carry over. */
const IN_FLIGHT = [
  "sd.rec",
  "sd.recSince",
  "sd.recSeconds",
  "sd.playing",
  "sd.playSince",
  "sd.playSeconds",
  "sd.playingFile",
  "ui.titleEntry.",
  "ui.dateTimeDraft.",
];

/** Where a state written before [SAFE] and [Clip Safe] were one switch keeps [SAFE]. */
const LEGACY_SAFE = /^(ch\.[^.]+)\.safe$/;

/** Where a state written while an amp's type was held by its name keeps it. */
const NAMED_AMP_TYPE = /^(ch\.[^.]+\.insFx)\.(type|ampType)$/;

/** Whether a reload carries the value at this path over. */
export function persisted(path: ParamPath): boolean {
  return !IN_FLIGHT.some((p) => path === p || path.startsWith(p));
}

interface Saved {
  version: number;
  model: string;
  values: Record<string, ParamValue>;
}

/** What is stored for `model`, or nothing where the browser holds none of it. */
export function readSaved(model: string): Record<string, ParamValue> | null {
  let text: string | null = null;
  try {
    text = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const saved = fromJson(text) as Partial<Saved>;
    if (saved.version !== VERSION || saved.model !== model) return null;
    return typeof saved.values === "object" && saved.values !== null ? saved.values : null;
  } catch {
    return null;
  }
}

/** Put a stored unit back, one value after another. */
export async function restore(store: DeviceStore, model: string): Promise<void> {
  const values = readSaved(model);
  if (!values) return;
  for (const [path, value] of Object.entries(values)) {
    // A clock that stood still is not put back: the clock runs with the computer's.
    if (LEGACY_SAFE.test(path) || LEGACY_CLOCK.test(path)) continue;
    if (NAMED_AMP_TYPE.test(path) && typeof value === "string") continue;
    if (persisted(path)) await store.set(path, value);
  }
  // An amp's type written as its name comes back at the place on its knob that
  // reads that name, and a name the amp does not have is not put back.
  for (const [path, value] of Object.entries(values)) {
    const amp = NAMED_AMP_TYPE.exec(path);
    if (!amp || typeof value !== "string") continue;
    const place = placeOfReading(store.str(`${amp[1]}.effect`, ""), amp[2] ?? "", value);
    if (place !== undefined) await store.set(path, place);
  }
  // A state written while the channel view's [SAFE] kept a switch apart from
  // [Clip Safe] holds it under `safe`; one left on there comes back as Clip Safe.
  for (const [path, value] of Object.entries(values)) {
    if (LEGACY_SAFE.test(path) && value === true) await store.set(path.replace(LEGACY_SAFE, "$1.clipSafe"), true);
  }
  // A state written before the recorder followed the frequency can name a pair
  // the unit cannot hold, so it is taken through the same one-way drop.
  dropTracksOverRate(store, store.num("setup.samplingFrequency", 48000));
}

/** The unit as it stands, as it is written to storage. */
export function snapshot(store: DeviceStore): Record<string, ParamValue> {
  const values: Record<string, ParamValue> = {};
  for (const path of store.paths()) if (persisted(path)) values[path] = store.get(path, 0);
  return values;
}

/**
 * Write the unit to storage whenever it changes, and no more often than
 * `delayMs`. Returns the step that stops writing.
 */
export function startSaving(store: DeviceStore, model: string, delayMs = 400): () => void {
  let timer = 0;
  const save = (): void => {
    timer = 0;
    const saved: Saved = { version: VERSION, model, values: snapshot(store) };
    try {
      window.localStorage.setItem(KEY, toJson(saved));
    } catch {
      // A browser that refuses to store it leaves the unit running on nothing else.
    }
  };
  const off = store.onChange(() => {
    if (timer) return;
    timer = window.setTimeout(save, delayMs);
  });
  return () => {
    if (timer) window.clearTimeout(timer);
    off();
  };
}

/** Leave the browser holding nothing, so the next start is the unit as it ships. */
export function forget(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Nothing was stored to begin with.
  }
}
