// Keeping the unit as it was left.
//
// The browser reloads the page far more often than anybody power-cycles a
// mixer, so what the unit holds is written to the browser's own storage and
// read back when the simulator opens on the same model; it opens on the model
// it was last used as. What the unit was doing
// at that moment — a take running, a file playing, a name half typed — is not
// part of that: those come back stopped, as they do on a unit that has been
// switched off. Nor is the result of a card test, which such a unit no longer
// shows.

import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";
import { FILES, filePath, readCard } from "../model/card";
import { LEGACY_CLOCK } from "../model/clock";
import { onDynamicsTimeStops } from "../model/dynamics-times";
import { placeOfReading } from "../model/effects";
import { dropTracksOverRate } from "../model/track-count";
import type { UnitModel } from "../model/types";
import { unitById } from "../model/units";
import { settlePanLink } from "../screens/mix-bus";
import { fromJson, toJson } from "../device/value-json";

/** Where the browser keeps it. */
const KEY = "urx-lcd-sim.state";

/** The shape written under that key; anything else is read as nothing. */
const VERSION = 1;

/** Where the browser keeps the model the simulator was last used as. */
const MODEL_KEY = "urx-lcd-sim.model";

/** What a reload does not carry over. */
const IN_FLIGHT = [
  "sd.rec",
  "sd.recSince",
  "sd.recSeconds",
  "sd.playing",
  "sd.playSince",
  "sd.playSeconds",
  "sd.playingFile",
  "sd.tested",
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

/** Where the unit and a settings file keep a scene memory's mixer, as JSON text. */
const SCENE_STATE = /^scene\..+\.state$/;

/** Where the card keeps a file; a settings file is the unit's values as JSON text. */
const CARD_FILE = /^sd\.file\./;

/** In storage, a scene memory's mixer named by its place in `Saved.shared`. */
interface Shared {
  shared: number;
}

/** A settings file in storage: its values, each scene memory's mixer named by its place. */
type StoredFile = Record<string, ParamValue | Shared>;

interface Saved {
  version: number;
  model: string;
  values: Record<string, ParamValue | Shared | StoredFile>;
  /**
   * Each scene memory's mixer, written once for the unit and every settings
   * file holding it. A unit stored without it holds them where they stand.
   */
  shared?: string[];
}

function isShared(value: unknown): value is Shared {
  return typeof value === "object" && value !== null && Object.keys(value).length === 1 && typeof (value as Shared).shared === "number";
}

/** The values a settings file's text holds, or nothing where the text is not a settings file. */
function settingsFile(value: ParamValue): Record<string, ParamValue> | null {
  if (typeof value !== "string" || !value.startsWith("{")) return null;
  try {
    const parsed = fromJson(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, ParamValue>) : null;
  } catch {
    return null;
  }
}

/**
 * The unit as it is written to storage: a settings file as its values rather
 * than as text, and each scene memory's mixer written once in `shared` and
 * named by its place wherever the unit or a settings file holds it.
 */
function pack(values: Record<string, ParamValue>): Pick<Saved, "values" | "shared"> {
  const shared: string[] = [];
  const places = new Map<string, number>();
  const share = (path: string, value: ParamValue): ParamValue | Shared => {
    if (!SCENE_STATE.test(path) || typeof value !== "string" || !value) return value;
    let place = places.get(value);
    if (place === undefined) {
      place = shared.length;
      shared.push(value);
      places.set(value, place);
    }
    return { shared: place };
  };
  const out: Saved["values"] = {};
  for (const [path, value] of Object.entries(values)) {
    const file = CARD_FILE.test(path) ? settingsFile(value) : null;
    out[path] = file ? Object.fromEntries(Object.entries(file).map(([p, v]) => [p, share(p, v)])) : share(path, value);
  }
  return { values: out, shared };
}

/** The unit as the mirror holds it, from what `pack` wrote or from a unit stored before it. */
function unpack(values: Saved["values"], shared: unknown): Record<string, ParamValue> {
  const pool = Array.isArray(shared) ? shared : [];
  const take = (value: unknown): ParamValue | undefined => {
    if (!isShared(value)) return value as ParamValue;
    const text: unknown = pool[value.shared];
    return typeof text === "string" ? text : undefined;
  };
  const out: Record<string, ParamValue> = {};
  for (const [path, value] of Object.entries(values)) {
    if (CARD_FILE.test(path) && typeof value === "object" && value !== null && !isShared(value)) {
      const file: Record<string, ParamValue> = {};
      for (const [p, v] of Object.entries(value)) {
        const taken = take(v);
        if (taken !== undefined) file[p] = taken;
      }
      out[path] = toJson(file);
      continue;
    }
    const taken = take(value);
    if (taken !== undefined) out[path] = taken;
  }
  return out;
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
    return typeof saved.values === "object" && saved.values !== null ? unpack(saved.values, saved.shared) : null;
  } catch {
    return null;
  }
}

/**
 * The model the simulator was last used as: the one kept for it, or where none
 * is kept, the model of the stored unit. Nothing where the browser holds neither.
 */
export function lastModel(): string | null {
  try {
    const kept = window.localStorage.getItem(MODEL_KEY);
    if (kept) return kept;
    const text = window.localStorage.getItem(KEY);
    if (!text) return null;
    const saved = fromJson(text) as Partial<Saved>;
    return saved.version === VERSION && typeof saved.model === "string" ? saved.model : null;
  } catch {
    return null;
  }
}

/** Keep `model` as the one the simulator opens as next time. */
export function keepModel(model: string): void {
  try {
    window.localStorage.setItem(MODEL_KEY, model);
  } catch {
    // A browser that refuses to store it opens the simulator on its first model.
  }
}

/**
 * Put a stored unit back, one value after another. A GATE, COMP or DUCKER time
 * off its stops comes back on the stop nearest it.
 */
export async function restore(store: DeviceStore, model: UnitModel["id"]): Promise<void> {
  const saved = readSaved(model);
  if (!saved) return;
  const values = onDynamicsTimeStops(saved);
  for (const [path, value] of Object.entries(values)) {
    // A clock that stood still is not put back: the clock runs with the computer's.
    if (LEGACY_SAFE.test(path) || LEGACY_CLOCK.test(path)) continue;
    if (NAMED_AMP_TYPE.test(path) && typeof value === "string") continue;
    if (path.startsWith(FILES)) continue;
    if (persisted(path)) await store.set(path, value);
  }
  // What each settings file on the card holds comes back under its folder and
  // name. A state written while the contents were kept under the file's name
  // alone gives every file of that name what was kept there.
  for (const entry of readCard(store)) {
    if (entry.kind !== "data") continue;
    const held = values[filePath(entry)] ?? values[`${FILES}${entry.name}`];
    if (typeof held === "string" && held) await store.set(filePath(entry), held);
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
  // A state written while Pan Link left each send's own placing where it was, or
  // kept Pan Link on over a FIXED bus, comes back as the unit would hold it.
  settlePanLink({ store, model: unitById(model) });
}

/** The unit as it stands, as it is written to storage. */
export function snapshot(store: DeviceStore): Record<string, ParamValue> {
  const values: Record<string, ParamValue> = {};
  for (const path of store.paths()) if (persisted(path)) values[path] = store.get(path, 0);
  return values;
}

/** The steps that end the writing `startSaving` starts. */
export interface Saving {
  /** Write a change still waiting now, rather than when it falls due. */
  flush: () => void;
  /** Stop writing, dropping a change still waiting. */
  stop: () => void;
}

/**
 * Write the unit to storage whenever it changes, and no more often than
 * `delayMs`, telling `onWrite` after each write whether the browser took it.
 * Once another tab of the browser stores the unit or forgets it, stop writing,
 * so as not to write over it, and tell `onElsewhere`.
 * Returns the steps that end it.
 */
export function startSaving(
  store: DeviceStore,
  model: string,
  delayMs = 400,
  onWrite: (kept: boolean) => void = () => {},
  onElsewhere: () => void = () => {},
): Saving {
  let timer = 0;
  const save = (): void => {
    timer = 0;
    const saved: Saved = { version: VERSION, model, ...pack(snapshot(store)) };
    let kept = true;
    try {
      window.localStorage.setItem(KEY, toJson(saved));
    } catch {
      // A browser that is full or refuses to store anything keeps what it held
      // before, and the unit runs on.
      kept = false;
    }
    onWrite(kept);
  };
  const off = store.onChange(() => {
    if (timer) return;
    timer = window.setTimeout(save, delayMs);
  });
  const stop = (): void => {
    if (timer) window.clearTimeout(timer);
    timer = 0;
    off();
    window.removeEventListener("storage", elsewhere);
  };
  // A storage event reaches a tab only for a write another tab made.
  const elsewhere = (ev: StorageEvent): void => {
    if (ev.key !== KEY) return;
    stop();
    onElsewhere();
  };
  window.addEventListener("storage", elsewhere);
  return {
    flush: () => {
      if (!timer) return;
      window.clearTimeout(timer);
      save();
    },
    stop,
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
