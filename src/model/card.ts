// What is on the microSD card.
//
// The card is a list of entries the screens browse: folders, the takes the
// recorder writes, and the settings files SAVE/LOAD writes. A take's size comes
// from its length and how many tracks it holds, and what is left on the card is
// the card's capacity less everything on it.

import type { DeviceStore } from "../device/store";
import { clockParts } from "./clock";

/** What an entry on the card is. */
export type CardKind = "folder" | "take" | "data";

export interface CardEntry {
  name: string;
  kind: CardKind;
  /** A take's length in seconds. */
  seconds: number;
  /** How many tracks a take holds. */
  tracks: number;
  /** The sampling frequency it was recorded at. A take written before the
   *  recorder followed the frequency carries none and is costed at 48 kHz. */
  rate?: number;
  /** When it was written, as the list prints it: the date over the time. */
  stamp: string;
  /** The folder holding it, from the root: "/" or "/new sound/". */
  dir: string;
}

/** The root of the card, which is where a browser opens. */
export const CARD_ROOT = "/";

/** The folder an entry opens onto. */
export function folderPath(entry: CardEntry): string {
  return `${entry.dir}${entry.name}/`;
}

/** The folder above this one, or the root where there is none. */
export function parentPath(path: string): string {
  const cut = path.slice(0, -1).lastIndexOf("/");
  return cut <= 0 ? CARD_ROOT : path.slice(0, cut + 1);
}

/** The sampling frequency as the recorder's screens print it. */
export function formatRate(hz: number): string {
  return `${(hz / 1000).toFixed(1)}kHz`;
}

/** Where the card's entries are kept. */
const CARD = "sd.card";

/** The rate a take carries none of its own is costed at. */
const RATE_HZ = 48_000;
const BYTES_PER_SAMPLE = 3;

/** What a settings file takes on the card: they are all this size. */
const DATA_BYTES = 50_668;

/** The room a formatted 128 GB card leaves. */
export const CARD_CAPACITY = 125_000_000_000;

/** The entries on the card, in list order. An entry naming no folder is at the root. */
export function readCard(store: DeviceStore): CardEntry[] {
  const text = store.str(CARD, "");
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return (parsed as CardEntry[]).map((e) => ({ ...e, dir: e.dir ?? CARD_ROOT }));
  } catch {
    return [];
  }
}

/** Put the card's entries back, by folder, folders first and each group by name. */
export async function writeCard(store: DeviceStore, entries: readonly CardEntry[]): Promise<void> {
  const sorted = [...entries].sort((a, b) => {
    if (a.dir !== b.dir) return a.dir.localeCompare(b.dir);
    if ((a.kind === "folder") !== (b.kind === "folder")) return a.kind === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  await store.set(CARD, JSON.stringify(sorted));
}

/** The sampling frequency a take was recorded at. */
export function takeRate(entry: CardEntry): number {
  return entry.rate ?? RATE_HZ;
}

/** What an entry takes up on the card. */
export function entryBytes(entry: CardEntry): number {
  if (entry.kind === "folder") return 0;
  if (entry.kind === "data") return DATA_BYTES;
  return Math.round(entry.seconds * takeRate(entry) * BYTES_PER_SAMPLE * entry.tracks);
}

/** What is left on the card, in bytes. */
export function freeBytes(store: DeviceStore): number {
  const used = readCard(store).reduce((sum, e) => sum + entryBytes(e), 0);
  return Math.max(0, store.num("sd.capacity", CARD_CAPACITY) - used);
}

/** What is left on the card, as the screens print it. */
export function formatFree(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)}GB Free`;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, "0");

/** When an entry was written, as the card's list prints it. */
export function cardStamp(store: DeviceStore, at = Date.now()): string {
  const { year, month, day, hour, minute, second } = clockParts(store, at);
  return `${pad(month)}/${pad(day)}/${year}\n${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * What the recorder names a take: the unit's clock, to the second. A name the
 * card already carries takes the next second that is free.
 */
export function takeName(store: DeviceStore, at = Date.now()): string {
  const { year, month, day, hour, minute, second } = clockParts(store, at);
  const taken = new Set(readCard(store).map((e) => e.name));
  for (let i = 0; i < 60; i++) {
    const name = `${year}${pad(month)}${pad(day)}_${pad(hour)}${pad(minute)}${pad((second + i) % 60)}.wav`;
    if (!taken.has(name)) return name;
  }
  return `${year}${pad(month)}${pad(day)}_${pad(hour)}${pad(minute)}${pad(second)}.wav`;
}

/** The card the simulator ships with: one in the slot, with nothing on it yet. */
export function shippedCard(): CardEntry[] {
  return [];
}
