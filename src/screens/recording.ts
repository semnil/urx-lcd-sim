// The recorder's take. Kept apart from the RECORDER screen because the toolbar's
// microSD icon and the microSD menu mark the recorder in recording mode, and the
// clock that counts a take runs whatever screen is up.

import type { DeviceStore } from "../device/store";
import type { CardEntry } from "../model/card";
import { CARD_ROOT, changeCard, readCard, roomSeconds, takeName } from "../model/card";
import { clockParts } from "../model/clock";

/** Where the recorder stands: stopped, armed by [●], recording, or paused. */
export type RecState = "idle" | "armed" | "recording" | "paused";

export function recState(store: DeviceStore): RecState {
  const rec = store.str("sd.rec", "idle");
  return rec === "armed" || rec === "recording" || rec === "paused" ? rec : "idle";
}

/**
 * Recording mode runs from [●] until [■], armed, recording or paused. While it
 * does, it stays on off the RECORDER screen, the recorder's tabs, settings and
 * sources and the card wait for it, and the microSD icon and menu carry the
 * record dot.
 */
export function recordMode(store: DeviceStore): boolean {
  return recState(store) !== "idle";
}

/** A take is open from the start of recording until [■], paused or not: the counter shows and the middle button pauses. */
export function takeOpen(store: DeviceStore): boolean {
  const rec = recState(store);
  return rec === "recording" || rec === "paused";
}

/**
 * The seconds a counter has run, to the millisecond: `before` from the runs
 * before a pause, and the run under way counted from `since`, the moment it
 * started. A counter running with no start moment counts nothing more than the
 * runs before it.
 */
function runTime(before: number, since: number, running: boolean, now: number): number {
  const run = running && since > 0 ? Math.max(0, now - since) : 0;
  return (Math.round(before * 1000) + run) / 1000;
}

/** The seconds the take has recorded, parts of a second kept. */
function takeTime(store: DeviceStore, now: number): number {
  return runTime(store.num("sd.recSeconds", 0), store.num("sd.recSince", 0), recState(store) === "recording", now);
}

/**
 * How many whole seconds the take has recorded: the runs before a pause, and the
 * run under way counted from the moment it started. A take marked as recording
 * with no start moment counts nothing more than the runs before it.
 */
export function takeSeconds(store: DeviceStore, now = Date.now()): number {
  return Math.floor(takeTime(store, now));
}

/** How many whole seconds of take the card has room for, at the tracks and the frequency the recorder is set to. */
export function takeRoom(store: DeviceStore): number {
  return roomSeconds(store, store.num("setup.samplingFrequency", 48_000), store.num("sd.trackCount", 16));
}

/** The moment the take recording fills the room the card has; a take with no start moment fills nothing more. */
function takeFullAt(store: DeviceStore): number {
  const since = store.num("sd.recSince", 0);
  if (since <= 0) return Number.POSITIVE_INFINITY;
  return since + takeRoom(store) * 1000 - Math.round(store.num("sd.recSeconds", 0) * 1000);
}

/** Seconds as the recorder's counter prints them, hh:mm:ss. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

// Each step of the recorder and of playback below writes its state and its counter as one operation of the store.

/** [▶] on an armed recorder, or on a paused take: the counter runs from here. */
export function recordTake(store: DeviceStore, now = Date.now()): void {
  store.operation(() => {
    if (recState(store) === "armed") void store.set("sd.recSeconds", 0);
    void store.set("sd.recSince", now);
    void store.set("sd.rec", "recording");
  });
}

/** [⏸] on a take recording: the counter holds what it has reached, to the part of a second. */
export function pauseTake(store: DeviceStore, now = Date.now()): void {
  store.operation(() => {
    void store.set("sd.recSeconds", takeTime(store, now));
    void store.set("sd.recSince", 0);
    void store.set("sd.rec", "paused");
  });
}

/**
 * [■], or [●] pressed again while armed: back to the recorder as it opens, the
 * counter cleared. A take that recorded anything is left in the folder the card
 * browser is open on, named for the moment it was taken and holding the tracks
 * the recorder was set to, no longer than the card has room for.
 */
export function stopTake(store: DeviceStore, now = Date.now()): void {
  const seconds = Math.min(takeSeconds(store, now), takeRoom(store));
  store.operation(() => {
    if (seconds > 0 && store.bool("sd.mounted", true)) {
      const entry: CardEntry = {
        name: takeName(store, now),
        kind: "take",
        seconds,
        tracks: store.num("sd.trackCount", 16),
        rate: store.num("setup.samplingFrequency", 48_000),
        written: clockParts(store, now),
        dir: store.str("sd.path", CARD_ROOT),
      };
      void changeCard(store, [...readCard(store), entry]);
    }
    void store.set("sd.rec", "idle");
    void store.set("sd.recSeconds", 0);
    void store.set("sd.recSince", 0);
    stopPlayback(store);
  });
}

/** The seconds of the file playback holds that have played, parts of a second kept. */
function playTime(store: DeviceStore, now: number): number {
  return runTime(store.num("sd.playSeconds", 0), store.num("sd.playSince", 0), store.bool("sd.playing", false), now);
}

/** How many whole seconds of the file playback holds have played. */
export function playedSeconds(store: DeviceStore, now = Date.now()): number {
  return Math.floor(playTime(store, now));
}

/** Whether playback holds a file, playing or paused. */
export function holdsFile(store: DeviceStore): boolean {
  return store.num("sd.playingFile", -1) >= 0;
}

/** [▶] on a file, or on the file paused: the counter runs from here. */
export function startPlayback(store: DeviceStore, row: number, now = Date.now()): void {
  store.operation(() => {
    if (row !== store.num("sd.playingFile", -1)) {
      void store.set("sd.playingFile", row);
      void store.set("sd.playSeconds", 0);
    }
    void store.set("sd.playSince", now);
    void store.set("sd.playing", true);
  });
}

/** [⏸] on a file playing: the counter holds where it has reached, to the part of a second. */
export function pausePlayback(store: DeviceStore, now = Date.now()): void {
  store.operation(() => {
    void store.set("sd.playSeconds", playTime(store, now));
    void store.set("sd.playSince", 0);
    void store.set("sd.playing", false);
  });
}

/** A change of the unit's sampling frequency lets go of the file playback holds. */
export function releaseOnRateChange(store: DeviceStore, before: number, after: number): void {
  if (before !== after) stopPlayback(store);
}

/** [■] on the file playback holds, or the file played to its end: it lets the file go and the counter clears. */
export function stopPlayback(store: DeviceStore): void {
  store.operation(() => {
    void store.set("sd.playing", false);
    void store.set("sd.playingFile", -1);
    void store.set("sd.playSeconds", 0);
    void store.set("sd.playSince", 0);
  });
}

/**
 * Keep the counters on the page at the running time of the take and of the file
 * playing, in place rather than by repainting the screen once a second. The
 * take recording stops, saying nothing, at the moment it fills the room the
 * card has, and the file playing stops and is let go at its end.
 */
export function startRecorderClock(store: DeviceStore, root: HTMLElement, intervalMs = 100): () => void {
  const id = window.setInterval(() => {
    const write = (selector: string, text: string): void => {
      for (const node of root.querySelectorAll<HTMLElement>(selector)) if (node.textContent !== text) node.textContent = text;
    };
    if (recState(store) === "recording") {
      const full = takeFullAt(store);
      if (Date.now() >= full) stopTake(store, full);
    }
    write("[data-rec-clock]", formatClock(takeSeconds(store)));

    const length = readCard(store)[store.num("sd.playingFile", -1)]?.seconds ?? 0;
    // At the end of the file playback lets the file go, as [■] does.
    if (store.bool("sd.playing", false) && playedSeconds(store) >= length) stopPlayback(store);
    const played = Math.min(playedSeconds(store), length);
    write("[data-play-clock]", holdsFile(store) ? formatClock(played) : "");
    const share = length > 0 ? Math.min(1, played / length) : 0;
    for (const node of root.querySelectorAll<HTMLElement>(".sd-progress")) {
      node.style.setProperty("--played", `${share * 100}%`);
    }
  }, intervalMs);
  return () => window.clearInterval(id);
}
