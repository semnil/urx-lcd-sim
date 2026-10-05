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
//
// A unit connected through a BridgeTransport holds its own values: nothing the
// browser kept is written to it, and what it holds is kept under a key of its
// own, leaving the simulated unit stored as it was.

import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";
import { FILES, filePath, readCard } from "../model/card";
import { LEGACY_CLOCK } from "../model/clock";
import { onDynamicsTimeStops } from "../model/dynamics-times";
import { placeOfReading } from "../model/effects";
import { dropTracksOverRate } from "../model/track-count";
import type { UnitModel } from "../model/types";
import { unitById } from "../model/units";
import { onDelayGrid } from "../screens/channel";
import { dropSendsOverRate } from "../screens/effect-params";
import { settlePanLink } from "../screens/mix-bus";
import { onSsmcsStops } from "../screens/ssmcs";
import { fromJson, toJson } from "../device/value-json";

/** Where the browser keeps it: one record of one IndexedDB object store. */
const DB_NAME = "urx-lcd-sim";
const DB_STORE = "unit";
const RECORD = "state";

/** The shape the unit is written in; anything else is read as nothing. */
const VERSION = 1;

/** Where a version before IndexedDB kept the unit and the model, read while IndexedDB holds no record. */
const KEY = "urx-lcd-sim.state";
const MODEL_KEY = "urx-lcd-sim.model";

/** Where a tab leaving the page writes what it had still to store, under a key of its own. */
const LEFT = "urx-lcd-sim.left.";

/** Where tabs tell each other the token of a write. */
const CHANNEL = "urx-lcd-sim.state";

/** Where the browser keeps a connected unit, in the shape the record keeps the unit in. */
const CONNECTED_KEY = "urx-lcd-sim.bridge.state";

/** Whether `store` is on a connected unit. */
function onConnectedUnit(store: DeviceStore): boolean {
  return store.kind === "bridge";
}

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

/**
 * What the browser holds: the unit as written, the model the simulator opens
 * as, and the token naming the write that left the unit as it is. A write of
 * the unit gives the record a new token; keeping a model alone keeps it. A token
 * of null is no unit written yet: nothing kept, a model kept alone, or what a
 * version before IndexedDB kept.
 */
export interface Kept {
  token: string | null;
  model: string | null;
  unit: string | null;
}

/** How a write ended: taken, not made because another write came first, or refused by the browser. */
export type Outcome = "written" | "moved" | "refused";

/** Where the record is kept. */
export interface Keeper {
  /** The record, or nothing where none is kept. */
  read: () => Promise<Kept | null>;
  /**
   * Put `next` in the record's place in one step with looking at it: only
   * where its token is still `basis` (null: no record), or over whatever it
   * holds where `basis` is undefined.
   */
  write: (basis: string | null | undefined, next: Kept) => Promise<Outcome>;
}

function isKept(value: unknown): value is Kept {
  const kept = value as Partial<Kept> | null;
  return (
    typeof kept === "object" &&
    kept !== null &&
    (kept.token === null || typeof kept.token === "string") &&
    (kept.model === null || typeof kept.model === "string") &&
    (kept.unit === null || typeof kept.unit === "string")
  );
}

/**
 * The browser's IndexedDB as the keeper, or nothing where the browser has
 * none. A write looks at the record and puts its own in one readwrite
 * transaction, which the browser runs whole before any other tab's.
 */
export function openKeeper(factory: IDBFactory | undefined = window.indexedDB): Keeper | null {
  if (!factory) return null;
  let opened: Promise<IDBDatabase> | null = null;
  const open = (): Promise<IDBDatabase> =>
    (opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(DB_STORE);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => {
        opened = null;
        reject(request.error);
      };
    }));
  return {
    read: async () => {
      const db = await open();
      return new Promise<Kept | null>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const got = tx.objectStore(DB_STORE).get(RECORD);
        tx.oncomplete = () => resolve(isKept(got.result) ? got.result : null);
        tx.onabort = () => reject(tx.error);
      });
    },
    write: async (basis, next) => {
      let db: IDBDatabase;
      try {
        db = await open();
      } catch {
        return "refused";
      }
      return new Promise<Outcome>((resolve) => {
        let outcome: Outcome = "written";
        const tx = db.transaction(DB_STORE, "readwrite");
        const records = tx.objectStore(DB_STORE);
        const got = records.get(RECORD);
        got.onsuccess = () => {
          const now = isKept(got.result) ? got.result.token : null;
          if (basis !== undefined && now !== basis) outcome = "moved";
          else records.put(next, RECORD);
        };
        tx.oncomplete = () => resolve(outcome);
        tx.onabort = () => resolve("refused");
      });
    },
  };
}

/** What a version before IndexedDB kept, as a record not yet written. */
function legacy(): Kept {
  try {
    return { token: null, model: window.localStorage.getItem(MODEL_KEY), unit: window.localStorage.getItem(KEY) };
  } catch {
    return { token: null, model: null, unit: null };
  }
}

/** Let go of what a version before IndexedDB kept, once the record holds the unit. */
function dropLegacy(): void {
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(MODEL_KEY);
  } catch {
    // A browser that refuses to touch it leaves it under the record, which is read first.
  }
}

/** A token for a write. */
function newToken(): string {
  return crypto.randomUUID();
}

/** Tell the other tabs the token of a write. */
function announce(token: string): void {
  if (typeof BroadcastChannel !== "function") return;
  const channel = new BroadcastChannel(CHANNEL);
  channel.postMessage(token);
  channel.close();
}

/** What a tab leaving the page had still to store. */
interface Left {
  /** The token of the record it last read or wrote, and of its write still under way. */
  basis: string | null;
  inFlight: string | null;
  model: string;
  /** The unit as it stood, where a change to it was still to be stored. */
  unit: string | null;
  at: number;
}

function isLeft(value: unknown): value is Left {
  const left = value as Partial<Left> | null;
  return (
    typeof left === "object" &&
    left !== null &&
    (left.basis === null || typeof left.basis === "string") &&
    (left.inFlight === null || typeof left.inFlight === "string") &&
    typeof left.model === "string" &&
    (left.unit === null || typeof left.unit === "string") &&
    typeof left.at === "number"
  );
}

/** What tabs left on leaving the page, under each one's key, the latest first. */
function leftBehind(): [string, Left][] {
  const found: [string, Left][] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key?.startsWith(LEFT)) continue;
      try {
        const left: unknown = JSON.parse(window.localStorage.getItem(key) ?? "");
        if (isLeft(left)) found.push([key, left]);
      } catch {
        // Not what a tab leaves; nothing is taken in from it.
      }
    }
  } catch {
    return [];
  }
  return found.sort(([, a], [, b]) => b.at - a.at);
}

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // A browser that refuses to touch it hands it to the next start, which finds it taken in or dropped.
  }
}

/** What the browser holds as the simulator opens. */
export interface Opened {
  /** The record: its token is what the start's writes compare against. */
  kept: Kept;
  /**
   * What the start puts back: the record, or where the browser refused to take
   * in what a page left, the record with that page's model and unit over it.
   */
  shown: Kept;
  /** The name of the page whose left changes `shown` carries, still to be stored; nothing where it carries none. */
  carried: string | null;
  /** Whether a tab's changes left on leaving were dropped, the record having been written after what that tab read. */
  dropped: boolean;
  /** Whether the browser refused to read what it holds. */
  refused: boolean;
}

/**
 * What the browser holds as the simulator opens, with what tabs left on
 * leaving the page taken in: each where nothing was written after what that
 * tab had read, or after the write it still had under way. Two tabs opening at
 * once take one in under the same token, so it goes in once. What the browser
 * refuses to take in stays where it was left for a later write, and the latest
 * of it is what the start shows.
 */
export async function openKept(keeper: Keeper | null): Promise<Opened> {
  let kept: Kept;
  try {
    kept = (keeper && (await keeper.read())) ?? legacy();
  } catch {
    const kept = legacy();
    return { kept, shown: kept, carried: null, dropped: false, refused: true };
  }
  let dropped = false;
  let carried: [string, Left] | null = null;
  if (!keeper) return { kept, shown: kept, carried: null, dropped, refused: false };
  for (const [key, left] of leftBehind()) {
    const token = `${key}.${left.at}`;
    if (kept.token === token) {
      forget(key);
      continue;
    }
    if (kept.token !== left.basis && (left.inFlight === null || kept.token !== left.inFlight)) {
      dropped = true;
      forget(key);
      continue;
    }
    const next: Kept = { token: left.unit === null ? kept.token : token, model: left.model, unit: left.unit ?? kept.unit };
    const outcome = await keeper.write(kept.token, next);
    if (outcome === "refused") {
      carried ??= [key, left];
      continue;
    }
    forget(key);
    if (outcome === "written") {
      if (next.token !== null && next.token !== kept.token) announce(next.token);
      kept = next;
    } else {
      const now = await keeper.read().catch(() => null);
      if (now?.token !== next.token) dropped = true;
      if (now) kept = now;
    }
  }
  if (!carried) return { kept, shown: kept, carried: null, dropped, refused: false };
  const [key, left] = carried;
  const shown: Kept = { token: kept.token, model: left.model, unit: left.unit ?? kept.unit };
  return { kept, shown, carried: key.slice(LEFT.length), dropped, refused: false };
}

/** The values the record holds for `model`, or nothing where it holds none of them. */
export function readUnit(kept: Kept | null, model: string): Record<string, ParamValue> | null {
  return unitFor(kept?.unit ?? null, model);
}

/** The values `text` holds for `model`, or nothing where it holds none of them. */
function unitFor(text: string | null, model: string): Record<string, ParamValue> | null {
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
 * The model the simulator opens as: the one the record keeps, or where it
 * keeps none, the model of its unit. Nothing where it holds neither.
 */
export function modelOf(kept: Kept): string | null {
  if (kept.model) return kept.model;
  if (!kept.unit) return null;
  try {
    const saved = fromJson(kept.unit) as Partial<Saved>;
    return saved.version === VERSION && typeof saved.model === "string" ? saved.model : null;
  } catch {
    return null;
  }
}

/**
 * Put the unit `kept` holds for `model` back, one value after another. A GATE,
 * COMP or DUCKER time, and an SSMCS frequency, Attack or Release, off its stops
 * comes back on the stop nearest it, and a delay time off 0.02 ms on the
 * 0.02 ms nearest it. A connected unit is left as it is.
 */
export async function restore(store: DeviceStore, model: UnitModel["id"], kept: Kept): Promise<void> {
  if (onConnectedUnit(store)) return;
  const saved = readUnit(kept, model);
  if (!saved) return;
  const values = onDelayGrid(onSsmcsStops(onDynamicsTimeStops(saved)));
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
  // A state written before HOME's [Sends] followed the frequency can name FX 2 at
  // a rate that puts it out of reach; [Sends] goes to FX 1 the same way.
  dropSendsOverRate(store, unitById(model), store.num("setup.samplingFrequency", 48000));
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

/** Where the card in the slot keeps what is on it, its files and its volume label. */
const IN_THE_SLOT = /^sd\.(card|cardName|file\..+)$/;

/** The card in the slot as it stands, which [Reset the unit] leaves where it is. */
export function cardInSlot(store: DeviceStore): Record<string, ParamValue> {
  const values: Record<string, ParamValue> = {};
  for (const path of store.paths()) if (IN_THE_SLOT.test(path)) values[path] = store.get(path, 0);
  return values;
}

/**
 * How a settle ended: every change made up to it stored, or some left
 * unwritten because another tab stored the unit first or because the browser
 * refused the write.
 */
export type Settled = "kept" | "moved" | "refused";

/** The steps that end the writing `startSaving` starts. */
export interface Saving {
  /**
   * Write every change made up to now, and resolve once each is written or
   * will not be. Where one is left unwritten, what this tab left behind on
   * leaving is let go with it, for the caller to tell.
   */
  settle: () => Promise<Settled>;
  /**
   * Leave what is still to be stored for the next start to take in, for a page
   * that is going; the tab's next write that is taken lets it go.
   */
  leave: () => void;
  /** Stop writing, dropping a change still waiting. */
  stop: () => void;
}

/** How a start of the unit stands to what the browser holds. */
export interface From {
  /** Where the record is kept; nothing is written without one. */
  keeper: Keeper | null;
  /** The record this start read; each write is made only while the record still holds what it names. */
  kept: Kept;
  /** What to store at once: the model picked, or the whole unit as it stands ([Reset the unit]) over whatever is stored. */
  first?: "model" | "unit";
  /** Names what this tab leaves on leaving the page. */
  tab?: string;
  /** Whether the unit as it starts carries changes a page left that are still to be stored. */
  carried?: boolean;
}

/**
 * Write the unit to storage whenever it changes, and no more often than
 * `delayMs`, telling `onWrite` after each write whether the browser took it.
 *
 * Each write is made only where the record still holds what this start read
 * or what this tab last wrote, in one step with looking at it. Once another tab
 * has written the unit, this tab stops writing, so as not to write over it,
 * and tells `onElsewhere`: at the first write that finds the record moved on,
 * or as soon as the other tab says it wrote. A write carries the model, which
 * the simulator opens as next time; a model picked is kept the same way.
 *
 * A page that is going cannot wait for a write, so `leave` writes what is
 * still to be stored where the next start takes it in, on the same terms.
 *
 * While the store is on a connected unit, its mirror is written under a key of
 * its own instead, and the record keeps the simulated unit as it was. A start
 * that stores the whole unit over what is stored ([Reset the unit]) lets that
 * key go. A change not yet written when the store moves onto another transport
 * is written just before the move, with the mirror and in the place of the
 * transport it was made on; where a write of the record is under way, once that
 * write lands. Returns the steps that end it.
 */
export function startSaving(
  store: DeviceStore,
  model: string,
  delayMs = 400,
  onWrite: (kept: boolean) => void = () => {},
  onElsewhere: () => void = () => {},
  from: From = { keeper: null, kept: { token: null, model: null, unit: null } },
): Saving {
  const { keeper } = from;
  /** The token of the record as this start read it or this tab last wrote it, and the unit it holds. */
  let basis = from.kept.token;
  let unit = from.kept.unit;
  let timer = 0;
  /** The changes made since the start, and how many of them the last write took in. */
  let changes = 0;
  let written = 0;
  /** Whether a write is under way, and the token of the unit it writes. */
  let writing = false;
  let inFlight: string | null = null;
  let flight: Promise<void> = Promise.resolve();
  let modelDue = from.first === "model";
  let over = from.first === "unit";
  let ended = false;
  /** Whether it stopped because another tab stored the unit, and whether the browser refused the last write. */
  let away = false;
  let refused = false;
  const leftKey = `${LEFT}${from.tab ?? "tab"}`;
  const channel = keeper && typeof BroadcastChannel === "function" ? new BroadcastChannel(CHANNEL) : null;
  /** The store's revision when the unit was last taken to be written. */
  let taken = store.revision;
  /** The simulated unit as it stood when the store moved off it, to be written once the write under way lands. */
  let queued: string | null = null;
  const text = (): string => {
    taken = store.revision;
    const saved: Saved = { version: VERSION, model, ...pack(snapshot(store)) };
    return toJson(saved);
  };
  /** Write the connected unit under its own key, taking in every change made so far. */
  const writeConnected = (): void => {
    if (ended) return;
    written = changes;
    try {
      window.localStorage.setItem(CONNECTED_KEY, text());
    } catch {
      // A browser that refuses to store it leaves the connected unit holding its own values.
    }
  };
  /** Write the record: the model where it is due, and the unit where it changed or `pending` holds it as it stood. */
  const write = (pending?: string): void => {
    if (ended || !keeper || writing) return;
    const unitDue = pending !== undefined || (changes > written && !onConnectedUnit(store));
    if (!unitDue && !modelDue) return;
    const upTo = changes;
    const next: Kept = { token: unitDue ? newToken() : basis, model, unit: unitDue ? (pending ?? text()) : unit };
    const first = basis === null;
    writing = true;
    inFlight = unitDue ? next.token : null;
    flight = keeper.write(over ? undefined : basis, next).then((outcome) => {
      writing = false;
      inFlight = null;
      if (ended) return;
      if (outcome === "moved") {
        elsewhere();
        return;
      }
      refused = outcome === "refused";
      if (outcome === "written") {
        if (next.token !== basis) channel?.postMessage(next.token);
        basis = next.token;
        unit = next.unit;
        written = upTo;
        modelDue = false;
        over = false;
        if (first) dropLegacy();
        forget(leftKey);
      }
      onWrite(outcome === "written");
      if (queued !== null) {
        const pending = queued;
        queued = null;
        write(pending);
        return;
      }
      if (changes > written && !timer) timer = window.setTimeout(due, delayMs);
    });
  };
  const due = (): void => {
    timer = 0;
    if (onConnectedUnit(store)) writeConnected();
    else write();
  };
  const off = store.onChange(() => {
    changes++;
    if (!timer && !ended) timer = window.setTimeout(due, delayMs);
  });
  store.onBeforeMove(() => {
    if (store.revision === taken && (writing || changes <= written)) return;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    if (onConnectedUnit(store)) writeConnected();
    else if (writing) queued = text();
    else write(text());
  });
  /** Stop writing; the changes made after it are still counted, for `settle` to tell. */
  const halt = (): void => {
    ended = true;
    if (timer) window.clearTimeout(timer);
    timer = 0;
    channel?.close();
  };
  const stop = (): void => {
    halt();
    off();
  };
  const elsewhere = (): void => {
    if (ended) return;
    away = true;
    halt();
    onElsewhere();
  };
  // Every other tab's write reaches this one; this tab's own never does.
  channel?.addEventListener("message", (ev: MessageEvent) => {
    if (ev.data !== basis && ev.data !== inFlight) elsewhere();
  });
  if (over) {
    try {
      window.localStorage.removeItem(CONNECTED_KEY);
    } catch {
      // A browser that refuses to touch it keeps it, and nothing reads it back.
    }
  }
  if (over || from.carried) changes++;
  write();
  return {
    settle: async () => {
      // A change made while a write is under way is written once that write lands;
      // it stops once nothing is left to write or a write is refused.
      for (;;) {
        if (timer) window.clearTimeout(timer);
        timer = 0;
        if (onConnectedUnit(store) && changes > written) writeConnected();
        write();
        if (!writing) break;
        await flight;
        if (refused) break;
      }
      const settled: Settled = changes <= written && !modelDue ? "kept" : away ? "moved" : "refused";
      if (settled !== "kept") forget(leftKey);
      return settled;
    },
    leave: () => {
      if (ended) return;
      if (onConnectedUnit(store) && changes > written) writeConnected();
      if (!keeper) return;
      const unitDue = queued !== null || (!onConnectedUnit(store) && (changes > written || inFlight !== null));
      if (!unitDue && !modelDue) return;
      try {
        window.localStorage.setItem(leftKey, JSON.stringify({ basis, inFlight, model, unit: unitDue ? (queued ?? text()) : null, at: Date.now() } satisfies Left));
      } catch {
        // A browser that refuses it drops what was still to be stored, as it refuses a write.
      }
    },
    stop,
  };
}
