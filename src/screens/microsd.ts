// microSD screen (URX44V, URX44): the top menu and the RECORDER / SAVE-LOAD /
// TOOLS menus below it.
//
// The card these browse is held in the store (src/model/card.ts): the recorder
// writes takes to it, SAVE/LOAD writes settings files, and what is left on it
// follows. With a unit attached the same store paths read the unit's own card.

import type { AppContext } from "../app/context";
import type { ParamValue } from "../device/path";
import type { CardEntry } from "../model/card";
import { CARD_ROOT, cardStamp, folderPath, formatFree, formatRate, freeBytes, parentPath, readCard, takeRate, writeCard } from "../model/card";
import { applySettings, captureSettings } from "../model/settings-file";
import { TRACK_COUNTS, dropTracksOverRate, trackCountCeiling } from "../model/track-count";
import { dropInsertsOverRate } from "./insert-fx";
import { followRecall, pairStates } from "./stereo-link";
import { allStrips, channelPairs } from "../model/types";
import { el, setPressed } from "../ui/dom";
import { Icons } from "../ui/icons";
import { LIST_THUMB_MIN_PX, button, dialog, dropdown, listView, loadingDialog, menuButton, menuGrid, meter, pickerGrid, pickerSheet, scrollbar, sideTab, toggle } from "../ui/widgets";
import { meterLevels, pairMeterId } from "./meters";
import { formatClock, holdsFile, pausePlayback, pauseTake, playedSeconds, recState, recordMode, recordTake, releaseOnRateChange, startPlayback, stopPlayback, stopTake, takeOpen, takeSeconds } from "./recording";
import type { TitleDraft } from "./title-entry";
import { draftTitle, titleEntryScreen } from "./title-entry";
import type { ScreenBody, ScreenDef } from "./types";
import { fromJson, toJson } from "../device/value-json";


/** The microSD top's menu, which the line saying there is no card stands in when the slot is empty. */
const SD_MENU = "menu-grid-wide menu-grid-sd";

export const microsdScreen: ScreenDef = {
  id: "microsd",
  toolbar: "sub",
  title: () => "microSD",
  knobToggle: false,
  build(ctx): ScreenBody {
    // With no card in the slot the screen holds one line saying so, and the
    // toolbar nothing but its title and the way home.
    if (!ctx.store.bool("sd.mounted", true)) {
      return { main: menuGrid([insertCardLine(ctx)], SD_MENU) };
    }
    const open = (id: string) => () => ctx.nav.push({ id });
    // While USB Storage Mode is on the three entries are out of reach and no
    // card-eject button is drawn. In recording mode, Recorder alone stays in
    // reach and carries the record dot.
    const usbOn = ctx.store.bool("sd.usbStorage", false);
    const taking = recordMode(ctx.store);
    const entry = (label: string, onTap: () => void, usable = !usbOn): HTMLElement => {
      const node = menuButton(label, usable ? onTap : () => undefined);
      if (!usable) {
        node.classList.add("is-disabled");
        node.setAttribute("aria-disabled", "true");
      }
      return node;
    };
    const recorder = entry("Recorder", open("microsd.recorder"));
    if (taking) {
      recorder.classList.add("has-rec-dot");
      recorder.firstElementChild?.appendChild(el("span", { class: "rec-dot", attrs: { "aria-hidden": "true" } }));
      recorder.setAttribute("aria-label", "Recorder, recording");
    }
    return {
      main: menuGrid(
        [recorder, entry("Save/Load", open("microsd.saveload"), !usbOn && !taking), entry("Tools", open("microsd.tools"), !usbOn && !taking)],
        SD_MENU,
      ),
      headerLeft: (() => {
        // The button asks before it goes either way, and lights while the mode is on.
        const node = button("USB Storage Mode", () => (taking ? undefined : usbStorageAsk(ctx, usbOn)), "usb-storage");
        setPressed(node, usbOn);
        if (taking) {
          node.classList.add("is-disabled");
          node.setAttribute("aria-disabled", "true");
        }
        return node;
      })(),
      ...(usbOn ? {} : { headerRight: ejectButton(ctx) }),
    };
  },
};

/**
 * The button that takes the card out. It asks what the unit asks, and [OK]
 * stands for the card being pulled from the slot. In recording mode and while a
 * file plays it is out of reach.
 */
function ejectButton(ctx: AppContext): HTMLElement {
  const usable = !recordMode(ctx.store) && !ctx.store.bool("sd.playing", false);
  const ask = (): void => {
    ctx.overlay(
      dialog({
        message: "Now you may safely remove the microSD card.",
        okOnly: true,
        onOk: () => {
          stopPlayback(ctx.store);
          void ctx.store.set("sd.mounted", false);
        },
      }),
    );
  };
  return el("button", {
    class: `sd-eject${usable ? "" : " is-disabled"}`,
    attrs: { "aria-label": "Eject the card", ...(usable ? {} : { "aria-disabled": "true" }) },
    onTap: usable ? ask : () => undefined,
    children: [Icons.eject()],
  });
}

/**
 * The line the microSD screen holds while the slot is empty. A touch on it asks
 * the simulator's own question, and [OK] puts the card back.
 */
function insertCardLine(ctx: AppContext): HTMLElement {
  const ask = (): void => {
    ctx.overlay(dialog({ message: "Simulate inserting the microSD card?", onOk: () => void ctx.store.set("sd.mounted", true) }));
  };
  return el("button", { class: "sd-no-card", text: "Not inserted microSD card", onTap: ask });
}

/** What a card browser is made of, beyond the entries themselves. */
interface BrowserOptions {
  /** The name over the column that follows the file names. */
  metaColumn: string;
  /** What that column reads for an entry. */
  meta: (entry: CardEntry) => string;
  /** The controls under the list. */
  actions: HTMLElement[];
  extraClass?: string;
  /** The mark a file's row carries; a folder always carries the folder mark. */
  fileIcon?: (entry: CardEntry, row: number) => Element;
  /** Which entries the list shows; a row keeps its entry's place on the card. */
  listed?: (entry: CardEntry, row: number) => boolean;
}

/**
 * The card browser the RECORDER and SAVE/LOAD screens share: where the card is
 * open, its entries as list rows, and the actions of the tab under them.
 */
function cardBrowser(ctx: AppContext, opts: BrowserOptions): HTMLElement {
  const { metaColumn, meta, actions, extraClass = "", fileIcon = () => Icons.file(), listed = () => true } = opts;
  const entries = cardEntries(ctx);
  const selected = ctx.store.num("sd.selectedFile", 0);
  const path = cardPath(ctx);
  const rows = entries
    .map((entry, i) => ({
      key: String(i),
      selected: i === selected,
      // The first touch brings the cursor to the row; a folder already under it
      // opens on the next touch.
      onTap:
        entry.kind === "folder" && i === selected ? () => openFolder(ctx, entry) : () => void ctx.store.set("sd.selectedFile", i),
      cells: [
        el("span", { class: "sd-icon", children: [entry.kind === "folder" ? Icons.folder() : fileIcon(entry, i)] }),
        entry.name,
        meta(entry),
      ],
    }))
    .filter((_, i) => (entries[i] as CardEntry).dir === path && listed(entries[i] as CardEntry, i));

  const list = listView(["", "File Name", metaColumn], rows, "list-carded sd-list");
  const body = list.querySelector<HTMLElement>(".list-body");
  // The well the thumb runs in, between the rims at each end of the bar. The
  // list's padding and the gaps between its rows come to whole rows, so the bar
  // adds nothing before counting them.
  const bar = body ? scrollbar(body, LIST_TRACK_PX, LIST_ROW_PITCH_PX, false, 0, LIST_THUMB_MIN_PX, { ctx, key: "sd.list" }) : null;
  bar?.classList.add("sd-scrollbar");

  return el("div", {
    class: `sd-browser ${extraClass}`.trim(),
    children: [
      el("div", {
        class: "sd-path",
        children: [
          // Nothing to climb out of until a folder is opened.
          el("button", {
            class: `btn sd-up${path === CARD_ROOT ? " is-disabled" : ""}`,
            attrs: { "aria-label": "Up one level" },
            onTap: path === CARD_ROOT ? () => undefined : () => openPath(ctx, parentPath(path)),
            children: [Icons.upFolder()],
          }),
          el("div", { class: "sd-path-field", children: [el("span", { text: path })] }),
        ],
      }),
      el("div", { class: "sd-free", text: cardLabel(ctx) }),
      list,
      ...(bar ? [bar] : []),
      el("div", { class: "sd-actions", children: actions }),
    ],
  });
}

/** How far the thumb travels, a pixel in from each end of the bar's well, and the pitch one row of the list takes. */
const LIST_TRACK_PX = 111;
const LIST_ROW_PITCH_PX = 38;

/** The folder the browsers are open on. */
function cardPath(ctx: AppContext): string {
  return ctx.store.str("sd.path", CARD_ROOT);
}

/** Open a folder, with the cursor on the first thing in it. */
function openPath(ctx: AppContext, path: string): void {
  void ctx.store.set("sd.path", path);
  const at = readCard(ctx.store).findIndex((e) => e.dir === path);
  void ctx.store.set("sd.selectedFile", at);
  ctx.repaint();
}

function openFolder(ctx: AppContext, entry: CardEntry): void {
  openPath(ctx, folderPath(entry));
}

/** The card's entries in list order. */
function cardEntries(ctx: AppContext): CardEntry[] {
  return readCard(ctx.store);
}

/** The name sheet, opened on something on the card: it gives way once the card is out. */
const cardNameScreen: ScreenDef = { ...titleEntryScreen, id: "microsd.name", needsCard: true };

/** Open the name sheet on `title`; [OK] hands what is typed to `onOk`. `more` carries the rest of the draft. */
function nameOnCard(ctx: AppContext, title: string, onOk: (text: string) => void, more: Pick<TitleDraft, "heading" | "max" | "empty"> = {}): void {
  draftTitle(ctx, { ...more, path: "", title, onOk });
  ctx.nav.push({ id: "microsd.name" });
}

/** What the card leaves. */
function freeText(ctx: AppContext): string {
  return formatFree(freeBytes(ctx.store));
}

/** The card's volume label. */
function cardName(ctx: AppContext): string {
  return ctx.store.str("sd.cardName", "test");
}

/** The card's name over what it leaves, as every card screen carries it. */
function cardLabel(ctx: AppContext): string {
  return `${cardName(ctx)}\n${freeText(ctx)}`;
}

/** Leave the card with nothing on it. */
function formatCard(ctx: AppContext): void {
  stopPlayback(ctx.store);
  for (const entry of cardEntries(ctx)) void ctx.store.set(filePath(entry.name), "");
  void ctx.store.set("sd.selectedFile", 0);
  void ctx.store.set("sd.path", CARD_ROOT);
  updateCard(ctx, []);
}

/** The entry the list's cursor stands on, if the card carries one there. */
function selectedEntry(ctx: AppContext): CardEntry | undefined {
  return cardEntries(ctx)[ctx.store.num("sd.selectedFile", 0)];
}

/** Whether the selected row is a file on a card in the slot: the thing Delete, Rename and playback act on. */
function fileSelected(ctx: AppContext): boolean {
  const entry = selectedEntry(ctx);
  return entry !== undefined && entry.kind !== "folder";
}

/** A file of this many tracks or more is marked by its count, and Play leaves it off its list. */
const MULTITRACK = 4;

/** Whether the selected file is one the unit plays back: a stereo take. */
function playableSelected(ctx: AppContext): boolean {
  const entry = selectedEntry(ctx);
  return entry !== undefined && entry.kind === "take" && entry.tracks === 2 && atUnitRate(ctx, entry);
}

/** Whether a take was recorded at the frequency the unit is running: RECORDER lists and plays back only those. */
function atUnitRate(ctx: AppContext, entry: CardEntry): boolean {
  return takeRate(entry) === ctx.store.num("setup.samplingFrequency", 48_000);
}

/** Whether RECORDER lists an entry: anything but a take recorded at another frequency than the unit is running. */
function recorderLists(ctx: AppContext, entry: CardEntry): boolean {
  return entry.kind !== "take" || atUnitRate(ctx, entry);
}

/** The row of the file playback holds, playing or paused; -1 while it holds none. */
function playingFile(ctx: AppContext): number {
  return ctx.store.num("sd.playingFile", -1);
}

/** How much of the file playing has played, from 0 to 1. */
function playedShare(ctx: AppContext): number {
  const length = cardEntries(ctx)[playingFile(ctx)]?.seconds ?? 0;
  if (length <= 0) return 0;
  return Math.min(1, Math.max(0, playedSeconds(ctx.store) / length));
}

/** One of the browser's icon-only buttons, out of reach unless `usable`. */
function iconAction(label: string, icon: SVGSVGElement, usable: boolean, onTap: () => void = () => undefined): HTMLElement {
  return el("button", {
    class: `btn sd-action${usable ? "" : " is-disabled"}`,
    attrs: { "aria-label": label },
    onTap: usable ? onTap : () => undefined,
    children: [icon],
  });
}

/** Where a settings file's contents are kept. */
function filePath(name: string): string {
  return `sd.file.${name}`;
}

/** Put a changed card back and draw it as it now stands. */
function updateCard(ctx: AppContext, entries: readonly CardEntry[]): void {
  void writeCard(ctx.store, entries);
  ctx.repaint();
}

/** Take the selected file off the card, asking first. */
function deleteSelected(ctx: AppContext): void {
  const row = ctx.store.num("sd.selectedFile", 0);
  const entries = cardEntries(ctx);
  const entry = entries[row];
  if (!entry) return;
  ctx.overlay(
    dialog({
      message: "Delete the selected file?",
      onOk: () => {
        if (row === playingFile(ctx)) stopPlayback(ctx.store);
        void ctx.store.set(filePath(entry.name), "");
        void ctx.store.set("sd.selectedFile", Math.max(0, Math.min(row, entries.length - 2)));
        updateCard(ctx, entries.filter((_, i) => i !== row));
      },
    }),
  );
}

/** Give the selected entry another name, keeping what it holds. */
function renameSelected(ctx: AppContext): void {
  const row = ctx.store.num("sd.selectedFile", 0);
  const entries = cardEntries(ctx);
  const entry = entries[row];
  if (!entry) return;
  nameOnCard(ctx, entry.name, (name) => {
    const held = ctx.store.str(filePath(entry.name), "");
    if (held) {
      void ctx.store.set(filePath(entry.name), "");
      void ctx.store.set(filePath(name), held);
    }
    updateCard(
      ctx,
      entries.map((e, i) => (i === row ? { ...e, name } : e)),
    );
  });
}

/** Put a folder on the card under the name that is typed. */
function newFolder(ctx: AppContext): void {
  nameOnCard(ctx, "", (name) => {
    updateCard(ctx, [...cardEntries(ctx), { name, kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: cardPath(ctx) }]);
  });
}

/** Write the unit's settings to the card under `name`, over a file of that name. */
function saveSettings(ctx: AppContext, name: string): void {
  void ctx.store.set(filePath(name), toJson(captureSettings(ctx.store)));
  const entries = cardEntries(ctx);
  const at = entries.findIndex((e) => e.name === name && e.dir === cardPath(ctx));
  const entry: CardEntry = { name, kind: "data", seconds: 0, tracks: 0, stamp: cardStamp(ctx.store), dir: cardPath(ctx) };
  updateCard(ctx, at < 0 ? [...entries, entry] : entries.map((e, i) => (i === at ? entry : e)));
}

/** What SAVE/LOAD's three buttons do: over the selected file, under a new name, and back onto the unit. */
function saveLoadAction(ctx: AppContext, label: string): void {
  const entry = selectedEntry(ctx);
  if (label === "Save as") {
    nameOnCard(ctx, "", (typed) => {
      const name = `${typed}${SETTINGS_SUFFIX}`;
      const taken = cardEntries(ctx).some((e) => e.name === name && e.dir === cardPath(ctx));
      if (taken) ctx.overlay(dialog({ message: REPLACE_ASK, onOk: () => saveSettings(ctx, name) }));
      else saveSettings(ctx, name);
    });
    return;
  }
  if (entry === undefined || entry.kind !== "data") return;
  if (label === "Load") {
    loadSettings(ctx, entry.name);
    return;
  }
  // Saving over a file that is already there asks first; nothing else does.
  ctx.overlay(dialog({ message: REPLACE_ASK, onOk: () => saveSettings(ctx, entry.name) }));
}

/** Put a settings file back on the unit. */
function loadSettings(ctx: AppContext, name: string): void {
  const held = ctx.store.str(filePath(name), "");
  if (!held) return;
  const before = ctx.store.num("setup.samplingFrequency", 48000);
  const pairs = pairStates(ctx);
  void applySettings(ctx.store, fromJson(held) as Record<string, ParamValue>).then(() => {
    followRecall(ctx, pairs);
    const rate = ctx.store.num("setup.samplingFrequency", 48000);
    dropInsertsOverRate(ctx, rate);
    dropTracksOverRate(ctx.store, rate);
    releaseOnRateChange(ctx.store, before, rate);
    ctx.repaint();
  });
}

/** What the unit asks before it writes over a file that is already on the card. */
const REPLACE_ASK = "File alerady exists. Replace it?";

/** What the unit calls a settings file. */
const SETTINGS_SUFFIX = ".urxf";

/** A transport button: the mark alone, named for the reader. */
function iconButton(label: string, icon: SVGSVGElement, extraClass: string, onTap: () => void): HTMLElement {
  return el("button", { class: `btn ${extraClass}`, attrs: { "aria-label": label }, onTap, children: [icon] });
}

/**
 * Play/Pause starts the selected file, and pauses and resumes the file playback
 * holds. Another file starts only once Stop has let the held one go.
 */
function playPause(ctx: AppContext, playing: boolean): void {
  if (playing) {
    pausePlayback(ctx.store);
    return;
  }
  const held = playingFile(ctx);
  if (held >= 0) {
    startPlayback(ctx.store, held);
    return;
  }
  if (!playableSelected(ctx)) return;
  startPlayback(ctx.store, ctx.store.num("sd.selectedFile", 0));
}

/**
 * The mark a RECORDER row gives a file: the speaker on the row `playingRow`
 * names, the track count on a file of four tracks or more, and the audio file
 * mark on any other.
 */
function recFileIcon(playingRow: number): (entry: CardEntry, row: number) => Element {
  return (entry, row) => {
    if (row === playingRow) return Icons.speaker();
    if (entry.tracks >= MULTITRACK) return el("span", { class: "sd-tracks", text: `${entry.tracks}tr` });
    return Icons.audioFile();
  };
}

/**
 * The meter a record track's source is read on: a bus in stereo, the two channels
 * of a pair (a stereo channel's own two, or two mono channels side by side), and
 * none for None.
 */
function sourceMeter(ctx: AppContext, source: string): string | undefined {
  const strips = allStrips(ctx.model);
  const bus = strips.find((s) => s.side === "output" && s.label === source);
  if (bus) return bus.id;
  const pair = /^CH (\d+)\/(\d+)$/.exec(source);
  if (!pair) return undefined;
  const [left, right] = [Number(pair[1]), Number(pair[2])].map((n) => strips.find((s) => s.side === "input" && s.channels.includes(n)));
  if (!left || !right) return undefined;
  return left === right ? left.id : pairMeterId(left.id, right.id);
}

/** What a record track's meter shows, kept moving with its source: silence for None. */
function sourceMeterView(ctx: AppContext, source: string): HTMLElement {
  const id = sourceMeter(ctx, source);
  return id ? meter({ levels: meterLevels(ctx.store, id, 2), source: id }) : meter({ levels: [-96, -96] });
}

/** What RECORDER's OUT meter reads while a file plays, until the store carries a level. */
const OUT_LEVELS_DB = [-27.3, -23.6];

/** The meter beside RECORDER's list: the file playing, in stereo, and unlit while nothing plays. */
function outMeter(ctx: AppContext, playing: boolean): HTMLElement {
  const levels = OUT_LEVELS_DB.map((db, i) => (playing ? ctx.store.num(`sd.outLevel.${i}`, db) : -96));
  return el("div", {
    class: "dyn-io sd-out",
    children: [
      el("div", {
        class: "dyn-io-col",
        children: [el("span", { class: "dyn-io-caption", text: "OUT" }), meter({ levels })],
      }),
    ],
  });
}

export const recorderScreen: ScreenDef = {
  id: "microsd.recorder",
  toolbar: "sub",
  title: () => "RECORDER",
  needsCard: true,
  build(ctx): ScreenBody {
    const tracks = ctx.store.num("sd.trackCount", 16);
    // Record arms the recorder, play starts the take, pause holds it, and stop
    // leaves recording for the state the screen opened in. Record pressed again
    // while armed does what stop does. In recording mode the tabs and the
    // sources stay put, looking as they do.
    const rec = recState(ctx.store);
    const recording = takeOpen(ctx.store);
    const busy = recordMode(ctx.store);
    const playing = ctx.store.bool("sd.playing", false);
    const tab = ctx.store.str("ui.sdTab", "Record");
    const tabs = (["Record", "Play", "Edit"] as const).map((t) =>
      sideTab(t, tab === t, () => (busy ? undefined : openSdTab(ctx, tab, t)), SD_TAB_ICON[t]?.(), t === "Record" ? "" : "is-name-raised"),
    );

    // Play and Edit list what is on the card; only Record lays out the inputs.
    if (tab !== "Record") {
      // Delete and Rename take only a file the list shows.
      const cursor = selectedEntry(ctx);
      const onFile = fileSelected(ctx) && cursor !== undefined && recorderLists(ctx, cursor);
      const held = holdsFile(ctx.store);
      const actions =
        tab === "Play"
          ? [
              (() => {
                // It greys its mark and takes nothing until playback holds a file.
                const node = iconButton("Move the cursor to the file playing", Icons.toPlaying(), `sd-locate${held ? "" : " is-disabled"}`, () => {
                  if (held) void ctx.store.set("sd.selectedFile", playingFile(ctx));
                });
                if (!held) node.setAttribute("aria-disabled", "true");
                return node;
              })(),
              el("div", {
                class: "sd-transport",
                children: [
                  el("div", {
                    class: "sd-transport-meta",
                    children: [
                      // The sampling frequency and the counter show only while playback holds a file.
                      el("span", { text: held ? formatRate(ctx.store.num("setup.samplingFrequency", 48_000)) : "" }),
                      el("span", { text: held ? formatClock(playedSeconds(ctx.store)) : "", attrs: { "data-play-clock": "" } }),
                    ],
                  }),
                  el("div", { class: "sd-progress", style: { "--played": `${playedShare(ctx) * 100}%` } }),
                ],
              }),
              iconButton("Stop", Icons.stop(), "rec-stop", () => stopPlayback(ctx.store)),
              (() => {
                // The mark is what a tap does next: pause while a file plays, play otherwise.
                const node = iconButton("Play/Pause", playing ? Icons.pause() : Icons.transportPlay(), "rec-pause", () => playPause(ctx, playing));
                node.setAttribute("aria-pressed", String(playing));
                return node;
              })(),
            ]
          : [
              iconAction("Delete", Icons.trash(), onFile, () => deleteSelected(ctx)),
              iconAction("Rename", Icons.rename(), onFile, () => renameSelected(ctx)),
            ];
      // The speaker marks the file playback holds, playing or paused.
      const playingRow = tab === "Play" && held ? playingFile(ctx) : -1;
      // Play lists the folders and the files it can play back, not a recording of four tracks or more. Neither
      // tab lists a take recorded at another frequency than the unit is running.
      const playList = (entry: CardEntry): boolean => entry.kind === "folder" || (entry.tracks < MULTITRACK && recorderLists(ctx, entry));
      const browser = cardBrowser(ctx, {
        metaColumn: "Time",
        meta: (entry) => (entry.kind === "take" ? formatClock(entry.seconds) : ""),
        actions,
        extraClass: "rec-browser",
        fileIcon: recFileIcon(playingRow),
        listed: tab === "Play" ? playList : (entry: CardEntry) => recorderLists(ctx, entry),
      });
      browser.appendChild(outMeter(ctx, playing));
      return { main: browser, side: tabs, headerRight: ejectButton(ctx) };
    }

    const pairs = Array.from({ length: Math.max(1, tracks / 2) }, (_, i) => {
      const key = `sd.track.${i}`;
      const source = ctx.store.str(key, "None");
      const src = el("button", {
        class: "btn rec-slot-src",
        onTap: () => (busy ? undefined : void recordSourceSheet(ctx, i)),
        children: [el("span", { text: source }), el("span", { class: "rec-slot-copy", children: [Icons.copySoft()] })],
      });
      return el("div", {
        class: "rec-slot",
        children: [
          el("span", { class: "rec-slot-id", text: `${2 * i + 1}/${2 * i + 2}` }),
          el("span", { class: "rec-slot-caption", text: "Source" }),
          src,
          // What the source is carrying, recording or not, down the right edge of the slot.
          el("div", {
            class: "rec-slot-meter",
            children: [sourceMeterView(ctx, source)],
          }),
        ],
      });
    });

    return {
      main: el("div", {
        class: "rec-screen",
        children: [
          el("div", { class: "rec-slots", children: pairs }),
          // While a take runs, its sampling frequency and running time stand over the bar.
          ...(recording
            ? [
                el("div", {
                  class: "rec-meta",
                  children: [
                    el("span", { text: formatRate(ctx.store.num("setup.samplingFrequency", 48_000)) }),
                    el("span", { text: formatClock(takeSeconds(ctx.store)), attrs: { "data-rec-clock": "" } }),
                  ],
                }),
              ]
            : []),
          el("div", { class: "rec-progress" }),
          el("div", {
            class: "rec-transport",
            children: [
              iconButton("Stop", Icons.stop(), "rec-stop", () => stopTake(ctx.store)),
              // While a take runs, the middle button pauses and resumes it, red while paused.
              // Stopped and not armed, it does nothing.
              iconButton(recording ? "Pause" : "Play", recording ? Icons.pause() : Icons.transportPlay(), `rec-play${rec === "paused" ? " is-paused" : ""}`, () => {
                if (rec === "armed" || rec === "paused") recordTake(ctx.store);
                else if (rec === "recording") pauseTake(ctx.store);
              }),
              iconButton("Record", Icons.record(), `rec-rec${rec === "armed" ? " is-armed" : ""}`, () => {
                if (rec === "idle") void ctx.store.set("sd.rec", "armed");
                else if (rec === "armed") stopTake(ctx.store);
              }),
            ],
          }),
        ],
      }),
      side: tabs,
      headerRight: ejectButton(ctx),
      headerLeft: (() => {
        const ceiling = trackCountCeiling(ctx.store.num("setup.samplingFrequency", 48000));
        const node = dropdown(ctx, {
          label: "Track Count",
          value: `${tracks} Tracks`,
          options: TRACK_COUNTS.map((n) => `${n} Tracks`),
          // A count the frequency cannot carry stays in the list on a face that
          // cannot be used, so the list keeps the unit's own two-by-four shape.
          disabled: TRACK_COUNTS.filter((n) => n > ceiling).map((n) => `${n} Tracks`),
          onPick: (v) => void ctx.store.set("sd.trackCount", Number.parseInt(v, 10)),
          listClass: "rec-track-list",
        });
        // In recording mode the box keeps its name, darkened, and opens nothing.
        if (busy) {
          node.classList.add("is-disabled");
          (node as HTMLButtonElement).disabled = true;
        }
        return node;
      })(),
    };
  },
};

export const saveLoadScreen: ScreenDef = {
  id: "microsd.saveload",
  toolbar: "sub",
  title: () => "SAVE/LOAD",
  needsCard: true,
  build(ctx): ScreenBody {
    const tab = ctx.store.str("ui.sdSaveTab", "Save/\nLoad");
    // Delete and Rename wait for a file to be selected.
    const onFile = fileSelected(ctx);
    const onData = onFile && selectedEntry(ctx)?.kind === "data";
    const actions =
      tab === "Edit"
        ? [
            iconAction("New folder", Icons.newFolder(), true, () => newFolder(ctx)),
            iconAction("Delete", Icons.trash(), onFile, () => deleteSelected(ctx)),
            iconAction("Rename", Icons.rename(), onFile, () => renameSelected(ctx)),
          ]
        : ["Save", "Save as", "Load"].map((label) => {
            // Save and Load act on the settings file the cursor stands on; Save as writes a new one.
            const usable = label === "Save as" || onData;
            return button(label, () => (usable ? saveLoadAction(ctx, label) : undefined), usable ? "" : "is-disabled");
          });
    return {
      main: cardBrowser(ctx, { metaColumn: "Date/Time", meta: (entry) => entry.stamp, actions }),
      side: (["Save/\nLoad", "Edit"] as const).map((t) =>
        sideTab(t, tab === t, () => void ctx.store.set("ui.sdSaveTab", t), t === "Edit" ? Icons.edit() : Icons.save(), t === "Edit" ? "is-name-raised" : "is-name-apart"),
      ),
      headerRight: ejectButton(ctx),
    };
  },
};

export const toolsScreen: ScreenDef = {
  id: "microsd.tools",
  toolbar: "sub",
  title: () => "TOOLS",
  needsCard: true,
  build(ctx): ScreenBody {
    const tab = ctx.store.str("ui.sdToolsTab", "Format");
    const tested = tab === "Test" && ctx.store.bool("sd.tested", false);
    return {
      main: el("div", {
        class: "tools-screen",
        children: [
          button(tab === "Format" ? "Format microSD" : "Test microSD", () => (tab === "Format" ? askVolumeLabel(ctx) : testCard(ctx))),
          el("div", { class: "sd-free tools-free", text: cardLabel(ctx) }),
          ...(tested ? [testReport()] : []),
        ],
      }),
      side: (["Format", "Test"] as const).map((t) =>
        sideTab(t, t === tab, () => void ctx.store.set("ui.sdToolsTab", t), t === "Format" ? Icons.refresh() : Icons.gauge(), t === "Test" ? "is-name-raised" : ""),
      ),
      headerRight: ejectButton(ctx),
    };
  },
};

/** What Format warns once the volume label is in. */
const FORMAT_WARNING =
  "Formatting will erase ALL data on this card.\nFormatting time depends on card capacity.\n(Approx. 3 minutes for 128GB)";

/** The most characters a volume label takes. */
const VOLUME_LABEL_MAX = 11;

/** Format asks for the volume label first, empty or not, and [OK] goes on to the warning. */
function askVolumeLabel(ctx: AppContext): void {
  nameOnCard(ctx, cardName(ctx), (label) => warnFormat(ctx, label), { heading: "Volume Label", max: VOLUME_LABEL_MAX, empty: true });
}

/** The warning's [OK] formats the card under `label`. */
function warnFormat(ctx: AppContext, label: string): void {
  ctx.overlay(dialog({ message: FORMAT_WARNING, caution: true, onOk: () => formatUnder(ctx, label) }));
}

/** What a card formatted with no volume label is called. */
const UNTITLED = "Untitled";

/** How long a format holds its modal up before the card comes back empty. */
const FORMAT_RUN_MS = 5000;

/** Format holds a modal up while it runs, and leaves the card empty under `label`, or Untitled for none, once done. */
function formatUnder(ctx: AppContext, label: string): void {
  let close = (): void => undefined;
  const timer = window.setTimeout(() => {
    close();
    formatCard(ctx);
    void ctx.store.set("sd.cardName", label || UNTITLED);
  }, FORMAT_RUN_MS);
  close = ctx.overlay(loadingDialog("Formatting in progress..."), () => window.clearTimeout(timer));
}

/** How long a card test runs before its result appears. */
const TEST_RUN_MS = 3000;

/** Test starts on the touch and holds a modal up while it runs; the result follows. */
function testCard(ctx: AppContext): void {
  let close = (): void => undefined;
  const timer = window.setTimeout(() => {
    close();
    void ctx.store.set("sd.tested", true);
  }, TEST_RUN_MS);
  close = ctx.overlay(loadingDialog("Testing in progress..."), () => window.clearTimeout(timer));
}

/** What a card test reports: the grade beside the button, the card's specs, and what it records at. */
function testReport(): HTMLElement {
  const row = (name: string, value: string, kind: string): HTMLElement =>
    el("div", {
      class: `tools-report-row ${kind}`,
      children: [el("span", { text: name }), el("span", { class: "tools-report-value", text: `: ${value}` })],
    });
  return el("div", {
    class: "tools-report",
    children: [
      el("div", { class: "tools-grade", children: [el("span", { text: "Result" }), el("span", { class: "tools-grade-value", text: ": A" })] }),
      row("Card specs", "Pass", "is-head"),
      row("BUS Interface", "UHS-I or higher,  SDR104", "is-sub"),
      row("UHS Speed Class", "1 or higher", "is-sub"),
      row("Speed Class", "10 or higher", "is-sub"),
      row("2 Tracks Recording", "Max 96kHz", "is-rate"),
      row("Multi Tracks Recording", "Max 96kHz", "is-rate"),
    ],
  });
}

/**
 * What USB Storage Mode asks before it is entered and before it is left. Both
 * dialogs carry their own line breaks, so the message reads as the unit writes
 * it rather than as the column happens to wrap it.
 */
const USB_ENTER =
  "This microSD card is recognized as a storage\ndrive by the computer and will not work with\nthe URX unit.";
const USB_LEAVE =
  "Please make sure that the microSD storage\ndrive of the URX unit has been removed from\nthe computer.";

/** Ask, and on [OK] take the mode the other way. [Cancel] changes nothing. */
function usbStorageAsk(ctx: AppContext, on: boolean): void {
  ctx.overlay(
    dialog({
      message: on ? USB_LEAVE : USB_ENTER,
      onOk: () => {
        void ctx.store.set("sd.usbStorage", !on);
        ctx.repaint();
      },
    }),
  );
}

/** The glyph the unit sets above each RECORDER tab's name. */
const SD_TAB_ICON: Record<string, () => SVGSVGElement> = {
  Record: Icons.record,
  Play: Icons.play,
  Edit: Icons.edit,
};

/** How long the recorder holds its loading modal up before the tab appears. */
const SD_TAB_LOADING_MS = 3000;

/**
 * Move to another RECORDER tab. Play and Edit read the card, so they come up
 * behind a loading modal; Record is the tab the screen opens on and needs none.
 */
function openSdTab(ctx: AppContext, from: string, to: string): void {
  if (to === from) return;
  if (to === "Record") {
    void ctx.store.set("ui.sdTab", to);
    return;
  }
  let close = (): void => undefined;
  const timer = window.setTimeout(() => {
    close();
    void ctx.store.set("ui.sdTab", to);
  }, SD_TAB_LOADING_MS);
  close = ctx.overlay(loadingDialog(), () => window.clearTimeout(timer));
}

/**
 * What a record track can be fed from, laid out as the rows of the sheet: the
 * two that stand apart on the first row, then the input pairs and the buses.
 * A null is a cell the row leaves empty.
 */
function recordSourceRows(ctx: AppContext): (string | null)[][] {
  const stereo = ctx.model.outputs.find((s) => s.kind === "stereo")?.label ?? "STEREO";
  const rest = [...channelPairs(ctx.model), ...ctx.model.outputs.filter((s) => s.kind === "mix").map((s) => s.label)];
  const rows: (string | null)[][] = [["None", null, null, stereo]];
  for (let i = 0; i < rest.length; i += 4) rows.push(rest.slice(i, i + 4));
  return rows;
}

/**
 * The sheet a RECORDER track slot's [Source] button drops. It covers the
 * RECORDER screen rather than replacing it, the way the input-source sheet
 * covers the INPUT screen.
 */
export function recordSourceSheet(ctx: AppContext, slot: number): HTMLElement {
  const key = `sd.track.${slot}`;
  const current = ctx.store.str(key, "None");
  const title = `REC Track ${2 * slot + 1}/${2 * slot + 2}`;
  return pickerSheet(ctx, {
    title,
    label: `${title} source`,
    build: (close) => {
      const pick = (label: string): void => {
        void ctx.store.set(key, label);
        close();
        ctx.repaint();
      };
      return pickerGrid(
        recordSourceRows(ctx).map((row) =>
          row.map((label) => (label === null ? null : toggle(label, label === current, () => pick(label), "source-btn"))),
        ),
      );
    },
  });
}

export const microsdScreens: ScreenDef[] = [microsdScreen, recorderScreen, saveLoadScreen, toolsScreen, cardNameScreen];
