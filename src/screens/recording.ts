// The recorder's take. Kept apart from the RECORDER screen because the toolbar's
// microSD icon and the microSD menu mark the recorder in recording mode, and the
// clock that counts a take runs whatever screen is up.

import type { DeviceStore } from "../device/store";
import type { CardEntry } from "../model/card";
import { CARD_ROOT, cardStamp, readCard, takeName, writeCard } from "../model/card";

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
 * How many whole seconds the take has recorded: the runs before a pause, and the
 * run under way counted from the moment it started. A take marked as recording
 * with no start moment counts nothing more than the runs before it.
 */
export function takeSeconds(store: DeviceStore, now = Date.now()): number {
  const before = store.num("sd.recSeconds", 0);
  const since = store.num("sd.recSince", 0);
  if (recState(store) !== "recording" || since <= 0) return before;
  return before + Math.max(0, Math.floor((now - since) / 1000));
}

/** Seconds as the recorder's counter prints them, hh:mm:ss. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, "0")).join(":");
}

/** [▶] on an armed recorder, or on a paused take: the counter runs from here. */
export function recordTake(store: DeviceStore, now = Date.now()): void {
  if (recState(store) === "armed") void store.set("sd.recSeconds", 0);
  void store.set("sd.recSince", now);
  void store.set("sd.rec", "recording");
}

/** [⏸] on a take recording: the counter holds what it has reached. */
export function pauseTake(store: DeviceStore, now = Date.now()): void {
  void store.set("sd.recSeconds", takeSeconds(store, now));
  void store.set("sd.recSince", 0);
  void store.set("sd.rec", "paused");
}

/**
 * [■], or [●] pressed again while armed: back to the recorder as it opens, the
 * counter cleared. A take that recorded anything is left in the folder the card
 * browser is open on, named for the moment it was taken and holding the tracks
 * the recorder was set to.
 */
export function stopTake(store: DeviceStore, now = Date.now()): void {
  const seconds = takeSeconds(store, now);
  if (seconds > 0 && store.bool("sd.mounted", true)) {
    const entry: CardEntry = {
      name: takeName(store, now),
      kind: "take",
      seconds,
      tracks: store.num("sd.trackCount", 16),
      rate: store.num("setup.samplingFrequency", 48_000),
      stamp: cardStamp(store, now),
      dir: store.str("sd.path", CARD_ROOT),
    };
    void writeCard(store, [...readCard(store), entry]);
  }
  void store.set("sd.rec", "idle");
  void store.set("sd.recSeconds", 0);
  void store.set("sd.recSince", 0);
  stopPlayback(store);
}

/** How many whole seconds of the file playback holds have played. */
export function playedSeconds(store: DeviceStore, now = Date.now()): number {
  const before = store.num("sd.playSeconds", 0);
  const since = store.num("sd.playSince", 0);
  if (!store.bool("sd.playing", false) || since <= 0) return before;
  return before + Math.max(0, Math.floor((now - since) / 1000));
}

/** Whether playback holds a file, playing or paused. */
export function holdsFile(store: DeviceStore): boolean {
  return store.num("sd.playingFile", -1) >= 0;
}

/** [▶] on a file, or on the file paused: the counter runs from here. */
export function startPlayback(store: DeviceStore, row: number, now = Date.now()): void {
  if (row !== store.num("sd.playingFile", -1)) {
    void store.set("sd.playingFile", row);
    void store.set("sd.playSeconds", 0);
  }
  void store.set("sd.playSince", now);
  void store.set("sd.playing", true);
}

/** [⏸] on a file playing: the counter holds where it has reached. */
export function pausePlayback(store: DeviceStore, now = Date.now()): void {
  void store.set("sd.playSeconds", playedSeconds(store, now));
  void store.set("sd.playSince", 0);
  void store.set("sd.playing", false);
}

/** The end of the file: the counter goes back to the start, the file still held. */
export function rewindPlayback(store: DeviceStore): void {
  void store.set("sd.playing", false);
  void store.set("sd.playSeconds", 0);
  void store.set("sd.playSince", 0);
}

/** A change of the unit's sampling frequency lets go of the file playback holds. */
export function releaseOnRateChange(store: DeviceStore, before: number, after: number): void {
  if (before !== after) stopPlayback(store);
}

/** [■] on the file playback holds: it lets the file go and the counter clears. */
export function stopPlayback(store: DeviceStore): void {
  void store.set("sd.playing", false);
  void store.set("sd.playingFile", -1);
  void store.set("sd.playSeconds", 0);
  void store.set("sd.playSince", 0);
}

/**
 * Keep the counters on the page at the running time of the take and of the file
 * playing, in place rather than by repainting the screen once a second. The
 * file playing stops at its end.
 */
export function startRecorderClock(store: DeviceStore, root: HTMLElement, intervalMs = 100): () => void {
  const id = window.setInterval(() => {
    const write = (selector: string, text: string): void => {
      for (const node of root.querySelectorAll<HTMLElement>(selector)) if (node.textContent !== text) node.textContent = text;
    };
    write("[data-rec-clock]", formatClock(takeSeconds(store)));

    const length = readCard(store)[store.num("sd.playingFile", -1)]?.seconds ?? 0;
    // At the end of the file the counter goes back to the start, and the file
    // playback holds stays held.
    if (store.bool("sd.playing", false) && playedSeconds(store) >= length) rewindPlayback(store);
    const played = Math.min(playedSeconds(store), length);
    write("[data-play-clock]", holdsFile(store) ? formatClock(played) : "");
    const share = length > 0 ? Math.min(1, played / length) : 0;
    for (const node of root.querySelectorAll<HTMLElement>(".sd-progress")) {
      node.style.setProperty("--played", `${share * 100}%`);
    }
  }, intervalMs);
  return () => window.clearInterval(id);
}
