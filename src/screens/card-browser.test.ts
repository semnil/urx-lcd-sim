import { describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import type { Route } from "../app/navigator";
import { buildRegistry } from "./index";
import { declarations, readStyle } from "../style/css-read";
import { inputMeterId, meterLevels, setMeterSource, startMeterTicker } from "./meters";
import type { CardEntry } from "../model/card";
import { filePath, formatFree, freeBytes, readCard, writeCard } from "../model/card";
import { levelBarShare } from "../model/dynamics";
import { SILENT_DB } from "../model/signal";
import { digitalGainPath } from "../model/source-gain";
import { pausePlayback, startPlayback, startRecorderClock, stopPlayback } from "./recording";

// RECORDER's Play and Edit tabs and both SAVE/LOAD tabs show what is on the
// card, as rows of the same list the SCENE screen uses.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** An entry as the card holds it, named and with the rest of its parts filled in. */
function entry(name: string, kind: CardEntry["kind"], seconds = 0, tracks = kind === "take" ? 2 : 0, dir = "/"): CardEntry {
  return { name, kind, seconds, tracks, stamp: kind === "folder" ? "" : STAMP, dir };
}

const STAMP = "04/30/2026\n15:29:28";

/** The card the tests browse: a folder and two takes, of ten and twenty-five seconds. */
const CARD: CardEntry[] = [
  entry("Recordings", "folder"),
  entry("20251020_112323.wav", "take", 10),
  entry("20251020_124253.wav", "take", 25),
];

async function mount(route: Route, card: CardEntry[] = CARD): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await writeCard(store, card);
  shell.ctx.nav.push(route);
  await flush();
  return shell;
}

/** Take the card out, the way the eject button does. */
async function eject(shell: Shell): Promise<void> {
  await shell.ctx.store.set("sd.mounted", false);
  await flush();
}

const cellsOf = (row: Element): string[] => [...row.querySelectorAll(".list-cell")].map((c) => c.textContent ?? "");
const rows = (shell: Shell): Element[] => [...shell.root.querySelectorAll(".sd-list .list-row")];
const columns = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll(".sd-list .list-head .list-cell")].map((c) => c.textContent ?? "");
// What each control of the tab shows: its name where it is drawn in words, the
// class of its mark where the mark stands alone.
const actions = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].map(
    (n) => [...n.children].find((c) => c.tagName.toLowerCase() === "svg")?.getAttribute("class") ?? n.textContent ?? "",
  );
const usable = (shell: Shell): boolean[] =>
  [...shell.root.querySelectorAll(".sd-actions > .sd-action")].map((n) => !n.classList.contains("is-disabled"));

async function pickTab(shell: Shell, path: string, tab: string): Promise<void> {
  await shell.ctx.store.set(path, tab);
  await flush();
}

/** Tap the side tab named `label`, as a finger would. */
async function tapSideTab(shell: Shell, label: string): Promise<void> {
  [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.querySelector(".side-tab-label")?.textContent === label)?.click();
  await flush();
}

/** The name of the side tab drawn lit. */
const litSideTab = (shell: Shell): string | null | undefined =>
  shell.root.querySelector('.side-tab[aria-pressed="true"] .side-tab-label')?.textContent;

describe("the microSD card browser", () => {
  it("lists what is on the card, an icon beside each name", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    expect(columns(shell)).toEqual(["", "File Name", "Date/Time"]);
    expect(rows(shell).map((r) => cellsOf(r)[1])).toEqual([
      "Recordings",
      "20251020_112323.wav",
      "20251020_124253.wav",
    ]);
    // A folder and a file are told apart by their icon, not by the name.
    const icons = rows(shell).map((r) => r.querySelector(".sd-icon svg") !== null);
    expect(icons).toEqual([true, true, true]);
    expect(rows(shell)[0]?.querySelector(".sd-icon svg path")?.getAttribute("d")).not.toBe(
      rows(shell)[1]?.querySelector(".sd-icon svg path")?.getAttribute("d"),
    );
  });

  it("selects the row that is tapped", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    rows(shell)[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("sd.selectedFile", -1)).toBe(1);
    expect(rows(shell).map((r) => r.classList.contains("is-selected"))).toEqual([false, true, false]);
  });

  it("scrolls the list under a drag instead of taking the row the drag started on", async () => {
    // The unit is a touch panel: the guide's "Scrolling" says a screen with a
    // bar is scrolled by dragging it. A pointer that travelled is therefore not
    // a tap, and the click it ends in must not reach the row under it.
    const shell = await mount({ id: "microsd.saveload" });
    await shell.ctx.store.set("sd.selectedFile", 0);
    await flush();
    const list = shell.root.querySelector<HTMLElement>(".sd-list .scroll-host");
    expect(list, "the list carries a bar").not.toBeNull();
    const picked = (): number => shell.ctx.store.num("sd.selectedFile", -1);

    const at = (type: string, y: number): MouseEvent => new MouseEvent(type, { bubbles: true, clientY: y });
    list?.dispatchEvent(at("pointerdown", 100));
    window.dispatchEvent(at("pointermove", 60));
    window.dispatchEvent(at("pointerup", 60));
    rows(shell)[1]?.dispatchEvent(at("click", 60));
    await flush();
    expect(picked(), "the drag took no row").toBe(0);

    // The next tap is a tap again, so the list is not left deaf.
    rows(shell)[1]?.dispatchEvent(at("click", 60));
    await flush();
    expect(picked()).toBe(1);
  });

  it("moves the list and its thumb as far on the screen as the pointer moves, however large the glass is drawn", async () => {
    const card = Array.from({ length: 20 }, (_, i) => entry(`take${i}.wav`, "take", 10));
    const shell = await mount({ id: "microsd.saveload" }, card);
    // The glass drawn at twice its own size, as the page's default 100% draws it.
    const glass = shell.root;
    const drawn = { left: 0, top: 0, right: 960, bottom: 544, width: 960, height: 544, x: 0, y: 0 };
    glass.getBoundingClientRect = () => ({ ...drawn, toJSON: () => drawn }) as DOMRect;
    Object.defineProperty(glass, "offsetWidth", { value: 480, configurable: true });
    const list = shell.root.querySelector<HTMLElement>(".sd-list .scroll-host") as HTMLElement;
    const thumb = shell.root.querySelector<HTMLElement>(".sd-scrollbar .scroll-thumb") as HTMLElement;
    let scrolled = 0;
    Object.defineProperty(list, "scrollHeight", { value: 20 * 38, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 114, configurable: true });
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrolled,
      set: (v: number) => {
        scrolled = Math.max(0, Math.min(20 * 38 - 114, v));
        list.dispatchEvent(new Event("scroll"));
      },
    });
    const at = (type: string, y: number): MouseEvent => new MouseEvent(type, { bubbles: true, clientY: y });

    list.scrollTop = 200;
    list.dispatchEvent(at("pointerdown", 100));
    window.dispatchEvent(at("pointermove", 97));
    expect(list.scrollTop, "a move inside the slop is still a tap").toBe(200);
    window.dispatchEvent(at("pointermove", 94));
    expect(list.scrollTop, "the slop is measured on the page").toBe(203);
    window.dispatchEvent(at("pointermove", 80));
    window.dispatchEvent(at("pointerup", 80));
    expect(list.scrollTop - 200, "20 page px up is 10 of the glass's own px").toBe(10);
    await flush();

    list.scrollTop = 100;
    const top = (): number => Number.parseFloat(thumb.style.top);
    const from = top();
    thumb.dispatchEvent(at("pointerdown", 100));
    window.dispatchEvent(at("pointermove", 110));
    window.dispatchEvent(at("pointerup", 110));
    expect(top() - from, "10 page px down is 5 of the glass's own px").toBeCloseTo(5, 6);
  });

  it("scrolls the list by the main button's drag, and by the pointer that took it alone", async () => {
    const card = Array.from({ length: 20 }, (_, i) => entry(`take${i}.wav`, "take", 10));
    const shell = await mount({ id: "microsd.saveload" }, card);
    const list = shell.root.querySelector<HTMLElement>(".sd-list .scroll-host") as HTMLElement;
    const thumb = shell.root.querySelector<HTMLElement>(".sd-scrollbar .scroll-thumb") as HTMLElement;
    let scrolled = 0;
    Object.defineProperty(list, "scrollHeight", { value: 20 * 38, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 114, configurable: true });
    Object.defineProperty(list, "scrollTop", {
      configurable: true,
      get: () => scrolled,
      set: (v: number) => {
        scrolled = Math.max(0, Math.min(20 * 38 - 114, v));
        list.dispatchEvent(new Event("scroll"));
      },
    });
    const pe = (type: string, init: PointerEventInit): PointerEvent => new PointerEvent(type, { bubbles: true, ...init });

    // The right button scrolls nothing, on the rows or on the thumb.
    for (const part of [list, thumb]) {
      list.scrollTop = 200;
      part.dispatchEvent(pe("pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, buttons: 2, clientY: 100 }));
      window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 2, clientY: 60 }));
      window.dispatchEvent(pe("pointerup", { pointerId: 1, pointerType: "mouse", button: 2, clientY: 60 }));
      expect(list.scrollTop, `the right button on ${part.className}`).toBe(200);
    }

    // A second finger neither scrolls the list the first holds nor ends its drag.
    list.dispatchEvent(pe("pointerdown", { pointerId: 1, pointerType: "touch", buttons: 1, clientY: 100 }));
    window.dispatchEvent(pe("pointermove", { pointerId: 2, pointerType: "touch", buttons: 1, clientY: 60 }));
    window.dispatchEvent(pe("pointercancel", { pointerId: 2, pointerType: "touch" }));
    expect(list.scrollTop, "a second finger's move and cancel").toBe(200);
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "touch", buttons: 1, clientY: 80 }));
    expect(list.scrollTop, "the first finger goes on scrolling it").toBe(220);
    // A second finger pressed on the rows or on the thumb while the first holds the list scrolls nothing.
    for (const part of [list, thumb]) {
      part.dispatchEvent(pe("pointerdown", { pointerId: 2, pointerType: "touch", button: 0, buttons: 1, clientY: 100 }));
      window.dispatchEvent(pe("pointermove", { pointerId: 2, pointerType: "touch", buttons: 1, clientY: 140 }));
      window.dispatchEvent(pe("pointerup", { pointerId: 2, pointerType: "touch", clientY: 140 }));
      expect(list.scrollTop, `a second finger pressed on ${part.className}`).toBe(220);
    }
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "touch", buttons: 1, clientY: 70 }));
    expect(list.scrollTop, "the first finger still holds it").toBe(230);
    window.dispatchEvent(pe("pointerup", { pointerId: 1, pointerType: "touch", clientY: 70 }));
    await flush();
    // Once the first finger is let go, the next finger takes the list.
    list.dispatchEvent(pe("pointerdown", { pointerId: 3, pointerType: "touch", button: 0, buttons: 1, clientY: 100 }));
    window.dispatchEvent(pe("pointermove", { pointerId: 3, pointerType: "touch", buttons: 1, clientY: 90 }));
    expect(list.scrollTop, "the next finger").toBe(240);
    window.dispatchEvent(pe("pointerup", { pointerId: 3, pointerType: "touch", clientY: 90 }));
    await flush();

    // A mouse that comes back with no button held was let go where the page did not hear it.
    list.scrollTop = 200;
    list.dispatchEvent(pe("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientY: 100 }));
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 0, clientY: 60 }));
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 1, clientY: 40 }));
    expect(list.scrollTop, "a hover with no button held").toBe(200);
  });

  it("carries the path bar and how much of the card is left", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    expect(shell.root.querySelector(".sd-path-field")?.textContent).toBe("/");
    expect(shell.root.querySelector(".sd-up"), "the way out of a folder").not.toBeNull();
    expect(shell.root.querySelector(".sd-up")?.textContent, "drawn as a mark, not a character").toBe("");
    expect(shell.root.querySelector(".sd-up svg")?.getAttribute("class")).toBe("icon-up");
    // The card's volume label over what it has left, as TOOLS carries them, on the browser rather than in the path row.
    expect(shell.root.querySelector(".sd-browser > .sd-free")?.textContent, "the card's name and what it has left").toBe(
      `test\n${formatFree(freeBytes(shell.ctx.store))}`,
    );
    expect(shell.root.querySelector(".sd-path .sd-free"), "not in the path row").toBeNull();
    await shell.ctx.store.set("sd.cardName", "SONG 1");
    await flush();
    expect(shell.root.querySelector(".sd-free")?.textContent?.split("\n")[0], "the name follows the card").toBe("SONG 1");
  });

  it("changes only the actions between the two SAVE/LOAD tabs", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    expect(actions(shell)).toEqual(["Save", "Save as", "Load"]);
    const before = rows(shell).map((r) => cellsOf(r)[1]);

    await pickTab(shell, "ui.sdSaveTab", "Edit");
    expect(actions(shell)).toEqual(["icon-new-folder", "icon-trash", "icon-rename"]);
    expect(rows(shell).map((r) => cellsOf(r)[1]), "the same list under both").toEqual(before);
  });

  it("moves SAVE/LOAD between its tabs on a tap of the side tab", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    const names = (): string[] =>
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].map((n) => n.getAttribute("aria-label") ?? n.textContent ?? "");
    expect(names()).toEqual(["Save", "Save as", "Load"]);

    await tapSideTab(shell, "Edit");
    expect([shell.ctx.store.str("ui.sdSaveTab", ""), litSideTab(shell)]).toEqual(["Edit", "Edit"]);
    expect(names()).toEqual(["New folder", "Delete", "Rename"]);

    await tapSideTab(shell, "Save/\nLoad");
    expect([shell.ctx.store.str("ui.sdSaveTab", ""), litSideTab(shell)]).toEqual(["Save/\nLoad", "Save/\nLoad"]);
    expect(names()).toEqual(["Save", "Save as", "Load"]);
  });

  it("moves TOOLS between Format and Test on a tap of the side tab", async () => {
    const shell = await mount({ id: "microsd.tools" });
    const job = (): string | null | undefined => shell.root.querySelector(".tools-screen > .btn")?.textContent;
    expect(job()).toBe("Format microSD");

    await tapSideTab(shell, "Test");
    expect([shell.ctx.store.str("ui.sdToolsTab", ""), litSideTab(shell)]).toEqual(["Test", "Test"]);
    expect(job()).toBe("Test microSD");

    await tapSideTab(shell, "Format");
    expect([shell.ctx.store.str("ui.sdToolsTab", ""), litSideTab(shell)]).toEqual(["Format", "Format"]);
    expect(job()).toBe("Format microSD");
  });

  it("gives RECORDER a track layout on Record and the card on Play and Edit", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    expect(shell.root.querySelectorAll(".rec-slot").length, "Record lays out the inputs").toBeGreaterThan(0);
    expect(shell.root.querySelector(".sd-list"), "and does not browse the card").toBeNull();
    expect(shell.root.querySelector(".dropdown-box"), "Track Count belongs to Record").not.toBeNull();
    expect(shell.root.querySelector(".rec-play svg")?.getAttribute("class"), "Record plays with the triangle").toBe("icon-transport-play");

    await pickTab(shell, "ui.sdTab", "Play");
    expect(shell.root.querySelectorAll(".rec-slot").length).toBe(0);
    expect(columns(shell)).toEqual(["", "File Name", "Time"]);
    expect(actions(shell), "no counter until a file is started").toEqual(["icon-to-playing", "", "icon-stop", "icon-transport-play"]);
    expect(shell.root.querySelector(".dropdown-box"), "no track count while playing back").toBeNull();

    await pickTab(shell, "ui.sdTab", "Edit");
    expect(columns(shell)).toEqual(["", "File Name", "Time"]);
    expect(actions(shell)).toEqual(["icon-trash", "icon-rename"]);
  });

  it("marks RECORDER's browser apart from SAVE/LOAD's", async () => {
    const browser = (shell: Shell): Element | null => shell.root.querySelector(".sd-browser");
    const saveLoad = await mount({ id: "microsd.saveload" });
    expect(browser(saveLoad)?.classList.contains("rec-browser")).toBe(false);
    const recorder = await mount({ id: "microsd.recorder" });
    for (const tab of ["Play", "Edit"]) {
      await pickTab(recorder, "ui.sdTab", tab);
      expect(browser(recorder)?.classList.contains("rec-browser"), tab).toBe(true);
    }
  });

  it("lets RECORDER's Delete and Rename act only while a file is selected", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    await pickTab(shell, "ui.sdTab", "Edit");
    const pick = async (i: number): Promise<boolean[]> => {
      await shell.ctx.store.set("sd.selectedFile", i);
      await flush();
      return usable(shell);
    };
    expect(await pick(1), "a file").toEqual([true, true]);
    expect(await pick(0), "a folder").toEqual([false, false]);
    expect(await pick(3), "past the last row").toEqual([false, false]);
  });

  it("lets SAVE/LOAD's Edit tab make a folder, and delete or rename a selected file", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    await pickTab(shell, "ui.sdSaveTab", "Edit");
    await shell.ctx.store.set("sd.selectedFile", 2);
    await flush();
    expect(usable(shell), "a file on the card").toEqual([true, true, true]);
    await shell.ctx.store.set("sd.selectedFile", 0);
    await flush();
    expect(usable(shell), "a folder on the card").toEqual([true, false, false]);
  });

  it("fills Play's bar by how far the file playback holds has played", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    await pickTab(shell, "ui.sdTab", "Play");
    const played = (): number =>
      Number.parseFloat(shell.root.querySelector<HTMLElement>(".sd-progress")?.style.getPropertyValue("--played") ?? "");
    const put = async (values: Record<string, string | number>): Promise<number> => {
      for (const [path, value] of Object.entries(values)) await shell.ctx.store.set(path, value);
      await flush();
      return played();
    };
    // Row 2 is the take of twenty-five seconds, row 1 the one of ten.
    expect(await put({ "sd.playingFile": 2, "sd.playSeconds": 2 })).toBeCloseTo(8);
    expect(await put({ "sd.playSeconds": 60 }), "no further than the end").toBe(100);
    expect(await put({ "sd.playSeconds": 0 })).toBe(0);
    expect(await put({ "sd.playSeconds": 2, "sd.playingFile": 1 }), "the same reading over a shorter file").toBeCloseTo(20);
    expect(await put({ "sd.playingFile": -1, "sd.selectedFile": 2, "sd.playSeconds": 2 }), "nothing held, whatever is selected").toBe(0);
  });

  it("shows the counter and the sampling frequency only while playback holds a file, playing or paused", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    await pickTab(shell, "ui.sdTab", "Play");
    const meta = (): string[] => [...shell.root.querySelectorAll(".sd-transport-meta > span")].map((s) => s.textContent ?? "");
    const put = async (values: Record<string, string | number | boolean>): Promise<string[]> => {
      for (const [path, value] of Object.entries(values)) await shell.ctx.store.set(path, value);
      await flush();
      return meta();
    };
    expect(await put({ "sd.selectedFile": 1 }), "a file selected, none started: neither").toEqual(["", ""]);
    expect(await put({ "sd.playingFile": 1, "sd.playing": true }), "playing: the frequency the unit is running, and the counter").toEqual([
      "48.0kHz",
      "00:00:00",
    ]);
    expect(await put({ "sd.playing": false, "sd.playSeconds": 10 }), "paused: both, the counter where it holds").toEqual(["48.0kHz", "00:00:10"]);
    // The reading follows the unit, rather than standing at one rate.
    expect((await put({ "setup.samplingFrequency": 96000 }))[0]).toBe("96.0kHz");
    expect(await put({ "sd.playingFile": -1, "sd.playSeconds": 0 }), "stopped: gone again").toEqual(["", ""]);
  });

  it("draws Play's buttons as marks, and swaps the play mark for the pause while a file plays", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    await shell.ctx.store.set("sd.mounted", true);
    await shell.ctx.store.set("sd.selectedFile", 1);
    await pickTab(shell, "ui.sdTab", "Play");
    const control = (cls: string): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.sd-actions > .${cls}`);
    for (const cls of ["sd-locate", "rec-stop", "rec-pause"]) {
      expect(control(cls)?.querySelector("svg"), cls).not.toBeNull();
      expect(control(cls)?.textContent, cls).toBe("");
    }
    const shown = (): (string | null | undefined | boolean)[] => [
      control("rec-pause")?.querySelector("svg")?.getAttribute("class"),
      control("rec-pause")?.getAttribute("aria-pressed"),
      control("rec-pause")?.classList.contains("is-on"),
    ];
    expect(shown(), "stopped").toEqual(["icon-transport-play", "false", false]);
    control("rec-pause")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.playing", false)).toBe(true);
    expect(shown(), "playing, on the same unlit face").toEqual(["icon-pause", "true", false]);
    control("rec-stop")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.playing", true), "stop ends playback").toBe(false);
  });

  it("opens a folder on the second touch, and climbs back out of it", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [
      entry("Recordings", "folder"),
      entry("take.wav", "take", 10),
      entry("inside.wav", "take", 96, 2, "/Recordings/"),
    ]);
    const path = (): string => shell.root.querySelector(".sd-path-field")?.textContent ?? "";
    const names = (): string[] => rows(shell).map((r) => cellsOf(r)[1] ?? "");
    const up = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".sd-up");
    const touchFolder = async (): Promise<void> => {
      rows(shell)[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    };
    expect([path(), names()]).toEqual(["/", ["Recordings", "take.wav"]]);
    expect(up()?.classList.contains("is-disabled"), "nothing to climb out of at the root").toBe(true);

    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    await touchFolder();
    expect([path(), shell.ctx.store.num("sd.selectedFile", -1)], "the first touch takes the cursor").toEqual(["/", 0]);
    await touchFolder();
    expect([path(), names()], "the second opens it, on what is inside").toEqual(["/Recordings/", ["inside.wav"]]);
    expect(shell.ctx.store.num("sd.selectedFile", -1), "the cursor on the first thing in it").toBe(2);
    expect(up()?.classList.contains("is-disabled")).toBe(false);

    up()?.click();
    await flush();
    expect([path(), names()]).toEqual(["/", ["Recordings", "take.wav"]]);
  });

  it("stays where it was scrolled when a row is touched, and shows a folder it opens from the top", async () => {
    // Folders list first, so the folder touched stands below the first rows.
    const shell = await mount({ id: "microsd.saveload" }, [
      ...Array.from({ length: 12 }, (_, i) => entry(`Folder${String(i).padStart(2, "0")}`, "folder")),
      ...Array.from({ length: 8 }, (_, i) => entry(`take${i}.wav`, "take", 10)),
      entry("inside.wav", "take", 96, 2, "/Folder09/"),
    ]);
    const body = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".sd-list .list-body");
    const touch = async (row: number): Promise<void> => {
      rows(shell)[row]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    };
    const before = body();
    if (before) before.scrollTop = 300;
    await touch(8);
    expect(shell.ctx.store.num("sd.selectedFile", -1)).toBe(8);
    expect(body(), "the touch drew the list again").not.toBe(before);
    expect(body()?.scrollTop, "the row touched stays in view").toBe(300);

    await touch(9);
    expect([shell.ctx.store.num("sd.selectedFile", -1), body()?.scrollTop], "the first touch on the folder takes the cursor").toEqual([9, 300]);
    await touch(9);
    expect(shell.root.querySelector(".sd-path-field")?.textContent).toBe("/Folder09/");
    expect(body()?.scrollTop, "the folder from its top").toBe(0);
  });

  it("carries the card-eject button where the unit has it, asking the unit's question before the card comes out", async () => {
    for (const id of ["microsd", "microsd.recorder", "microsd.saveload", "microsd.tools"]) {
      const shell = await mount({ id });
      const eject = shell.root.querySelector<HTMLElement>(".toolbar .sd-eject");
      const said = (): [string | null, string[], boolean] => [
        shell.root.querySelector(".dialog-text")?.textContent ?? null,
        [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].map((b) => b.textContent ?? ""),
        shell.root.querySelector(".dialog:not(.is-caution) .dialog-mark svg") !== null,
      ];
      const answer = async (label: string): Promise<void> => {
        [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === label)?.click();
        await flush();
      };
      expect([eject?.classList.contains("is-disabled"), eject?.hasAttribute("aria-disabled")], `${id}: in reach`).toEqual([false, false]);
      eject?.click();
      await flush();
      expect(said(), `${id}: asked first, under the i mark`).toEqual(["Eject the microSD card?", ["Cancel", "OK"], true]);
      await answer("Cancel");
      expect([shell.root.querySelector(".dialog-overlay"), shell.ctx.store.bool("sd.mounted", false)], `${id}: [Cancel] leaves the card in`).toEqual([null, true]);

      eject?.click();
      await flush();
      await answer("OK");
      expect(said(), `${id}: then told the card can come out`).toEqual(["Now you may safely remove the microSD card.", ["OK"], true]);
      expect(shell.ctx.store.bool("sd.mounted", false), `${id}: asking takes nothing out`).toBe(true);

      // [OK] stands for the card being pulled from the slot.
      await answer("OK");
      expect(shell.ctx.store.bool("sd.mounted", true), id).toBe(false);
      expect(shell.ctx.nav.current.id, id).toBe("microsd");
      expect(shell.root.querySelector(".sd-no-card"), id).not.toBeNull();
    }
  });

  it("keeps the card in and the paused file held when the eject button on RECORDER's Play tab is touched", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    const store = shell.ctx.store;
    await pickTab(shell, "ui.sdTab", "Play");
    rows(shell).find((r) => cellsOf(r)[1] === "20251020_112323.wav")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    for (let i = 0; i < 2; i++) {
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === "Play/Pause")?.click();
      await flush();
    }
    const eject = shell.root.querySelector<HTMLElement>(".toolbar .sd-eject");
    expect([store.bool("sd.playing", true), store.num("sd.playingFile", -1), eject?.classList.contains("is-disabled"), eject?.getAttribute("aria-disabled")], "paused").toEqual([
      false,
      1,
      true,
      "true",
    ]);
    eject?.click();
    await flush();
    expect([shell.root.querySelector(".dialog-overlay"), store.bool("sd.mounted", false), store.num("sd.playingFile", -1)], "nothing asked, the card in and the file held").toEqual([
      null,
      true,
      1,
    ]);
  });

  it("keeps the file playback holds paused, under the speaker and on [Play/Pause], when the card sorts anew around it", async () => {
    const card = [entry("a.wav", "take", 10), entry("b.wav", "take", 25), entry("c.wav", "take", 40)];
    const press = async (shell: Shell, label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label)?.click();
      await flush();
    };
    const tapRow = async (shell: Shell, name: string): Promise<void> => {
      rows(shell).find((r) => cellsOf(r)[1] === name)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    };
    const typed = async (shell: Shell, text: string): Promise<void> => {
      await shell.ctx.store.set("ui.titleEntry.text", text);
      await flush();
      shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
      await flush();
    };
    const onSaveLoad = async (shell: Shell, tab: string, act: () => Promise<void>): Promise<void> => {
      shell.ctx.nav.push({ id: "microsd.saveload" });
      await pickTab(shell, "ui.sdSaveTab", tab);
      await act();
      shell.ctx.nav.back();
      await flush();
    };
    const changes: [string, (shell: Shell) => Promise<void>, string][] = [
      [
        "[Delete] on the file ahead of it",
        async (shell) => {
          await pickTab(shell, "ui.sdTab", "Edit");
          await tapRow(shell, "a.wav");
          await press(shell, "Delete");
          [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
          await flush();
        },
        "b.wav",
      ],
      [
        "[Rename] onto a name the card sorts after the others",
        async (shell) => {
          await pickTab(shell, "ui.sdTab", "Edit");
          await tapRow(shell, "b.wav");
          await press(shell, "Rename");
          await typed(shell, "z");
        },
        "z.wav",
      ],
      [
        "[Save as] under a name the card sorts ahead of it",
        (shell) =>
          onSaveLoad(shell, "Save/\nLoad", async () => {
            await press(shell, "Save as");
            await typed(shell, "a");
          }),
        "b.wav",
      ],
      [
        "[New folder]",
        (shell) =>
          onSaveLoad(shell, "Edit", async () => {
            await press(shell, "New folder");
            await typed(shell, "Z");
          }),
        "b.wav",
      ],
    ];
    for (const [why, change, held] of changes) {
      const shell = await mount({ id: "microsd.recorder" }, card);
      const store = shell.ctx.store;
      await pickTab(shell, "ui.sdTab", "Play");
      await tapRow(shell, "b.wav");
      await press(shell, "Play/Pause");
      await press(shell, "Play/Pause");
      expect([store.bool("sd.playing", true), readCard(store)[store.num("sd.playingFile", -1)]?.name], `${why}: paused on b.wav`).toEqual([false, "b.wav"]);

      await change(shell);
      await pickTab(shell, "ui.sdTab", "Play");
      const speaker = rows(shell).find((r) => r.querySelector(".sd-icon .icon-speaker") !== null);
      expect(speaker ? cellsOf(speaker)[1] : undefined, `${why}: the speaker`).toBe(held);
      await press(shell, "Play/Pause");
      expect([store.bool("sd.playing", false), readCard(store)[store.num("sd.playingFile", -1)]?.name], `${why}: [Play/Pause] resumes`).toEqual([true, held]);
    }
  });

  it("puts the card-eject button out of reach while a file plays and in recording mode, and back in reach once [■] lets the file go", async () => {
    const out = async (shell: Shell, why: string): Promise<void> => {
      const eject = shell.root.querySelector<HTMLElement>(".toolbar .sd-eject");
      expect([eject?.classList.contains("is-disabled"), eject?.getAttribute("aria-disabled")], why).toEqual([true, "true"]);
      eject?.click();
      await flush();
      expect(shell.root.querySelector(".dialog-overlay"), `${why}: nothing asked`).toBeNull();
    };
    const playing = await mount({ id: "microsd.recorder" });
    const press = async (label: string): Promise<void> => {
      [...playing.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === label)?.click();
      await flush();
    };
    await pickTab(playing, "ui.sdTab", "Play");
    rows(playing).find((r) => cellsOf(r)[1] === "20251020_112323.wav")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await press("Play/Pause");
    expect([playing.ctx.store.bool("sd.playing", false), playing.ctx.store.num("sd.playingFile", -1)], "a file playing").toEqual([true, 1]);
    await out(playing, "a file playing");
    await press("Stop");
    const back = playing.root.querySelector<HTMLElement>(".toolbar .sd-eject");
    expect([back?.classList.contains("is-disabled"), back?.getAttribute("aria-disabled")], "[■] lets the file go").toEqual([false, null]);

    const armed = await mount({ id: "microsd" });
    await armed.ctx.store.set("sd.rec", "armed");
    await flush();
    await out(armed, "recording mode");
  });

  it("puts Save/Load and Tools on the microSD top out of reach while playback holds a file, playing or paused, until [■] lets it go", async () => {
    const shell = await mount({ id: "microsd" });
    const store = shell.ctx.store;
    const press = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === label)?.click();
      await flush();
    };
    const menu = (name: string): HTMLElement | undefined => [...shell.root.querySelectorAll<HTMLElement>(".menu-btn")].find((b) => b.textContent === name);
    const reach = (): [string, boolean | undefined, string | null | undefined][] =>
      ["Recorder", "Save/Load", "Tools"].map((name) => [name, menu(name)?.classList.contains("is-disabled"), menu(name)?.getAttribute("aria-disabled")]);
    const top = async (): Promise<void> => {
      shell.ctx.nav.back();
      await flush();
      expect(shell.ctx.nav.current.id).toBe("microsd");
    };

    shell.ctx.nav.push({ id: "microsd.recorder" });
    await pickTab(shell, "ui.sdTab", "Play");
    rows(shell).find((r) => cellsOf(r)[1] === "20251020_112323.wav")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    for (const [why, playing] of [["playing", true], ["paused", false]] as const) {
      await press("Play/Pause");
      expect([store.bool("sd.playing", !playing), store.num("sd.playingFile", -1)], why).toEqual([playing, 1]);
      await top();
      expect(reach(), why).toEqual([
        ["Recorder", false, null],
        ["Save/Load", true, "true"],
        ["Tools", true, "true"],
      ]);
      for (const name of ["Save/Load", "Tools"]) {
        menu(name)?.click();
        await flush();
        expect(shell.ctx.nav.current.id, `${why}: ${name} opens nothing`).toBe("microsd");
      }
      menu("Recorder")?.click();
      await flush();
      expect(shell.ctx.nav.current.id, `${why}: Recorder still opens`).toBe("microsd.recorder");
    }

    await press("Stop");
    await top();
    expect(reach(), "back in reach once [■] lets the file go").toEqual([
      ["Recorder", false, null],
      ["Save/Load", false, null],
      ["Tools", false, null],
    ]);
    menu("Save/Load")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "Save/Load opens once more").toBe("microsd.saveload");
  });

  it("lets go of the file playback holds once it has played to its end, as [■] does: the triangle leaves the microSD icon, and the card-eject button and the microSD top's Save/Load and Tools come back in reach", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const shell = await mount({ id: "microsd" });
    const stop = startRecorderClock(shell.ctx.store, shell.root, 50);
    try {
      const store = shell.ctx.store;
      const press = async (label: string): Promise<void> => {
        [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === label)?.click();
        await flush();
      };
      const shut = (node: HTMLElement | null | undefined): [boolean | undefined, string | null | undefined] => [node?.classList.contains("is-disabled"), node?.getAttribute("aria-disabled")];
      const menu = (name: string): HTMLElement | undefined => [...shell.root.querySelectorAll<HTMLElement>(".menu-btn")].find((b) => b.textContent === name);
      // The eject button on RECORDER's toolbar, Save/Load and Tools on the
      // microSD top, and the microSD icon on HOME's toolbar, back on RECORDER after.
      const reach = async (): Promise<unknown[]> => {
        const eject = shut(shell.root.querySelector<HTMLElement>(".toolbar .sd-eject"));
        shell.ctx.nav.back();
        await flush();
        const top = [shut(menu("Save/Load")), shut(menu("Tools"))];
        shell.ctx.nav.home();
        await flush();
        const icon = shell.root.querySelector<HTMLElement>('.toolbar-icons .icon-btn[aria-label^="microSD"]');
        const seen = [store.num("sd.playingFile", -1), eject, ...top, icon?.getAttribute("aria-label"), icon?.querySelector(".play-mark") != null];
        shell.ctx.nav.openTop({ id: "microsd" });
        shell.ctx.nav.push({ id: "microsd.recorder" });
        await flush();
        return seen;
      };

      shell.ctx.nav.push({ id: "microsd.recorder" });
      await pickTab(shell, "ui.sdTab", "Play");
      rows(shell).find((r) => cellsOf(r)[1] === "20251020_112323.wav")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
      await press("Play/Pause");
      vi.advanceTimersByTime(60);
      await flush();
      expect(await reach(), "the control: ten seconds of file, playing").toEqual([1, [true, "true"], [true, "true"], [true, "true"], "microSD, playing", true]);

      // The file has run past its ten seconds.
      await store.set("sd.playSince", Date.now() - 11_000);
      vi.advanceTimersByTime(60);
      await flush();
      expect([store.bool("sd.playing", true), store.num("sd.playSeconds", -1)], "stopped, the counter cleared").toEqual([false, 0]);
      expect(await reach(), "played to its end").toEqual([-1, [false, null], [false, null], [false, null], "microSD", false]);
    } finally {
      stop();
      vi.useRealTimers();
    }
  });

  it("marks a file of four tracks or more by its count on Edit and leaves it off Play, the speaker marking the file played or paused and the audio mark any other", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [
      entry("new sound", "folder"),
      entry("four.wav", "take", 10, 4),
      entry("two.wav", "take", 10),
      entry("sixteen.wav", "take", 10, 16),
      entry("zlast.wav", "take", 10),
    ]);
    await shell.ctx.store.set("sd.selectedFile", 4);
    await shell.ctx.store.set("sd.playingFile", 4);
    const marks = (target: Shell): string[] =>
      [...target.root.querySelectorAll(".sd-list .list-row .sd-icon")].map(
        (icon) => icon.querySelector("svg")?.getAttribute("class") ?? icon.textContent ?? "",
      );
    // The card lists its folders first and then its files by name.
    const quiet = ["icon-folder", "4tr", "16tr", "icon-audio", "icon-audio"];
    await shell.ctx.store.set("sd.playing", true);
    await pickTab(shell, "ui.sdTab", "Edit");
    expect(marks(shell), "Edit names no file as playing").toEqual(quiet);
    await pickTab(shell, "ui.sdTab", "Play");
    expect(marks(shell), "Play, playing").toEqual(["icon-folder", "icon-audio", "icon-speaker"]);
    await shell.ctx.store.set("sd.playing", false);
    await flush();
    expect(marks(shell), "Play, paused: the file is still held").toEqual(["icon-folder", "icon-audio", "icon-speaker"]);
    await shell.ctx.store.set("sd.playingFile", -1);
    await flush();
    expect(marks(shell), "Play, stopped").toEqual(["icon-folder", "icon-audio", "icon-audio"]);
    // A row keeps its entry's place on the card, so tapping the last row Play shows picks the last entry.
    rows(shell).at(-1)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    expect(shell.ctx.store.num("sd.selectedFile", -1)).toBe(4);

    const saveLoad = await mount({ id: "microsd.saveload" }, [
      entry("Recordings", "folder"),
      entry("20260430_data1.urxf", "data"),
      entry("20260430_data2.urxf", "data"),
    ]);
    expect(marks(saveLoad), "SAVE/LOAD marks a file as a settings file").toEqual(["icon-folder", "icon-file", "icon-file"]);
  });

  it("names its list by the screen, and steps the focus along the rows on the arrow keys, Home and End, the cursor staying where it is", async () => {
    const seen: Record<string, unknown[]> = {};
    for (const id of ["microsd.saveload", "microsd.recorder"]) {
      const shell = await mount({ id });
      if (id === "microsd.recorder") await pickTab(shell, "ui.sdTab", "Play");
      document.body.appendChild(shell.root);
      const list = rows(shell) as HTMLElement[];
      const key = (name: string): (boolean | number)[] => {
        const ev = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
        document.activeElement?.dispatchEvent(ev);
        return [ev.defaultPrevented, list.indexOf(document.activeElement as HTMLElement)];
      };
      list[0]?.focus();
      seen[id] = [
        shell.root.querySelector(".sd-list .list-body")?.getAttribute("aria-label"),
        ...["ArrowDown", "End", "ArrowUp", "Home"].map((name) => key(name)),
        shell.ctx.store.num("sd.selectedFile", 0),
        rows(shell).findIndex((r) => r.getAttribute("aria-selected") === "true"),
      ];
      shell.destroy();
      shell.root.remove();
    }
    expect(seen).toEqual({
      "microsd.saveload": ["SAVE/LOAD files", [true, 1], [true, 2], [true, 1], [true, 0], 0, 0],
      "microsd.recorder": ["RECORDER files", [true, 1], [true, 2], [true, 1], [true, 0], 0, 0],
    });
  });

  it("describes a folder's row as a folder, and the row of the file playback holds as playing or paused", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [entry("dir", "folder"), entry("a.wav", "take", 30), entry("b.wav", "take", 30)]);
    await pickTab(shell, "ui.sdTab", "Play");
    const described = (target: Shell): (string | null)[] => rows(target).map((r) => r.getAttribute("aria-description"));
    expect(described(shell), "nothing held: the folder alone").toEqual(["folder", null, null]);
    rows(shell)[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    shell.root.querySelector<HTMLElement>(".sd-actions > .rec-pause")?.click();
    await flush();
    expect(shell.ctx.store.num("sd.playingFile", -1)).toBe(1);
    expect(described(shell), "a.wav playing").toEqual(["folder", "playing", null]);
    shell.root.querySelector<HTMLElement>(".sd-actions > .rec-pause")?.click();
    await flush();
    expect(described(shell), "a.wav paused, still held").toEqual(["folder", "paused", null]);
    shell.root.querySelector<HTMLElement>(".sd-actions > .rec-stop")?.click();
    await flush();
    expect(described(shell), "stopped").toEqual(["folder", null, null]);

    const saveLoad = await mount({ id: "microsd.saveload" }, [entry("Recordings", "folder"), entry("20260430_data1.urxf", "data")]);
    expect(described(saveLoad), "SAVE/LOAD").toEqual(["folder", null]);
  });

  it("leaves a settings file off Play, which lists the folders and the files it plays", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [
      entry("Recordings", "folder"),
      entry("four.wav", "take", 10, 4),
      entry("mine.urxf", "data"),
      entry("two.wav", "take", 10),
    ]);
    await pickTab(shell, "ui.sdTab", "Play");
    expect(rows(shell).map((r) => cellsOf(r)[1])).toEqual(["Recordings", "two.wav"]);
  });

  it("leaves a take recorded at another sampling frequency off Play and Edit and unplayed, until the unit runs at that frequency again", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [
      entry("Recordings", "folder"),
      { ...entry("at48.wav", "take", 10), rate: 48_000 },
      { ...entry("at96.wav", "take", 10), rate: 96_000 },
    ]);
    const listed = (): string[] => rows(shell).map((r) => cellsOf(r)[1] ?? "");
    await pickTab(shell, "ui.sdTab", "Play");
    expect(listed(), "at 48 kHz").toEqual(["Recordings", "at48.wav"]);

    // The take the list leaves off does not play, even with the cursor on it.
    await shell.ctx.store.set("sd.selectedFile", 2);
    await flush();
    shell.root.querySelector<HTMLElement>(".sd-actions > .rec-pause")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.playing", false), "the 96 kHz take at 48 kHz").toBe(false);

    await shell.ctx.store.set("setup.samplingFrequency", 96_000);
    await flush();
    expect(listed(), "at 96 kHz").toEqual(["Recordings", "at96.wav"]);
    shell.root.querySelector<HTMLElement>(".sd-actions > .rec-pause")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.playing", false), "the control: at its own frequency it plays").toBe(true);
    await shell.ctx.store.set("sd.playing", false);

    await pickTab(shell, "ui.sdTab", "Edit");
    expect(listed(), "Edit at 96 kHz").toEqual(["Recordings", "at96.wav"]);
    await shell.ctx.store.set("setup.samplingFrequency", 48_000);
    await flush();
    expect(listed(), "Edit at 48 kHz").toEqual(["Recordings", "at48.wav"]);
    // Delete and Rename take nothing the list leaves off, even with the cursor on it.
    expect(usable(shell), "the cursor on the 96 kHz take").toEqual([false, false]);
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    expect(usable(shell), "the control: the take listed").toEqual([true, true]);
  });

  it("starts only a stereo file on a card, pauses and resumes the file it holds, and lets that file go on Stop", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [
      entry("Recordings", "folder"),
      entry("20251020_112323.wav", "take", 10),
      entry("20251020_124253.wav", "take", 25, 4),
    ]);
    await pickTab(shell, "ui.sdTab", "Play");
    const tap = async (cls: string): Promise<void> => {
      shell.root.querySelector<HTMLElement>(`.sd-actions > .${cls}`)?.click();
      await flush();
    };
    const select = async (row: number): Promise<void> => {
      await shell.ctx.store.set("sd.selectedFile", row);
      await flush();
    };
    const state = (): [boolean, number] => [shell.ctx.store.bool("sd.playing", false), shell.ctx.store.num("sd.playingFile", -1)];

    for (const [row, why] of [[0, "a folder"], [2, "a file of four tracks"], [5, "past the last row"]] as const) {
      await select(row);
      await tap("rec-pause");
      expect(state(), why).toEqual([false, -1]);
    }

    await select(1);
    await tap("rec-pause");
    expect(state(), "a stereo file").toEqual([true, 1]);
    await tap("rec-pause");
    expect(state(), "paused, still held").toEqual([false, 1]);
    await select(0);
    await tap("rec-pause");
    expect(state(), "resumed where the cursor no longer is").toEqual([true, 1]);
    await tap("rec-stop");
    expect(state(), "let go").toEqual([false, -1]);
  });

  it("leaves SAVE/LOAD's Delete and Rename out of reach where the list has no row under the cursor", async () => {
    const shell = await mount({ id: "microsd.saveload" }, []);
    await pickTab(shell, "ui.sdSaveTab", "Edit");
    // New folder, Delete, Rename.
    expect(usable(shell), "an empty card").toEqual([true, false, false]);
    const filled = await mount({ id: "microsd.saveload" });
    await pickTab(filled, "ui.sdSaveTab", "Edit");
    await filled.ctx.store.set("sd.selectedFile", 1);
    await flush();
    expect(usable(filled), "the control: a file under the cursor").toEqual([true, true, true]);
  });

  it("keeps SAVE/LOAD's cursor in the folder that is open once its last file is deleted, and acts on no file the list does not show", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [entry("F", "folder"), entry("B.urxf", "data"), entry("X.urxf", "data", 0, 0, "/F/")]);
    const store = shell.ctx.store;
    await store.set(filePath({ dir: "/F/", name: "X.urxf" }), JSON.stringify({ "ch.ch1.level": -30 }));
    const press = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === label || b.textContent === label)?.click();
      await flush();
    };
    const saveLoad = (): boolean[] =>
      ["Save", "Save as", "Load"].map((l) => [...shell.root.querySelectorAll(".sd-actions .btn")].find((b) => b.textContent === l)?.classList.contains("is-disabled") === false);
    const shown = (): [string, boolean][] => rows(shell).map((r) => [cellsOf(r)[1] ?? "", r.classList.contains("is-selected")]);
    await pickTab(shell, "ui.sdSaveTab", "Edit");
    rows(shell)[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    await press("Delete");
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
    await flush();
    expect(readCard(store)[store.num("sd.selectedFile", -1)]?.dir ?? "/", "the cursor stays in the root").toBe("/");
    expect(shown(), "on the folder left there").toEqual([["F", true]]);
    expect(usable(shell), "New folder, Delete, Rename").toEqual([true, false, false]);
    await pickTab(shell, "ui.sdSaveTab", "Save/\nLoad");
    expect(saveLoad(), "Save, Save as, Load").toEqual([false, true, false]);

    // The cursor on a file of another folder: the root's list shows no row under it.
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "X.urxf"));
    await flush();
    expect(shown()).toEqual([["F", false]]);
    expect(saveLoad(), "Save, Save as, Load").toEqual([false, true, false]);
    await store.set("ch.ch1.level", 0);
    await press("Load");
    await flush();
    expect(store.num("ch.ch1.level", 99), "nothing loaded").toBe(0);
    await pickTab(shell, "ui.sdSaveTab", "Edit");
    expect(usable(shell), "New folder, Delete, Rename").toEqual([true, false, false]);
    await press("Delete");
    expect(shell.root.querySelector(".dialog-overlay"), "nothing asked").toBeNull();
    expect(readCard(store).map((e) => `${e.dir}${e.name}`)).toEqual(["/F", "/F/X.urxf"]);
  });

  it("keeps RECORDER's cursor in the folder that is open once its last file is deleted", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [entry("Takes", "folder"), entry("A.wav", "take", 10), entry("Z.wav", "take", 10, 2, "/Takes/")]);
    const store = shell.ctx.store;
    await pickTab(shell, "ui.sdTab", "Edit");
    rows(shell)[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    shell.root.querySelector<HTMLElement>('.sd-actions [aria-label="Delete"]')?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
    await flush();
    expect(readCard(store)[store.num("sd.selectedFile", -1)]?.dir ?? "/", "the cursor stays in the root").toBe("/");
    expect(usable(shell), "Delete, Rename").toEqual([false, false]);
    shell.root.querySelector<HTMLElement>('.sd-actions [aria-label="Delete"]')?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-overlay"), "nothing asked").toBeNull();
    expect(readCard(store).map((e) => `${e.dir}${e.name}`)).toEqual(["/Takes", "/Takes/Z.wav"]);

    // The folder's only file deleted: the cursor stands on nothing.
    await store.set("sd.path", "/Takes/");
    await store.set("sd.selectedFile", 1);
    await flush();
    shell.root.querySelector<HTMLElement>('.sd-actions [aria-label="Delete"]')?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
    await flush();
    expect([readCard(store).map((e) => `${e.dir}${e.name}`), store.num("sd.selectedFile", 0)]).toEqual([["/Takes"], -1]);
  });

  it("sizes the bar's thumb by whole rows, three of four in view taking three quarters of its travel, a pixel in from the rim", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    await shell.ctx.store.set("sd.files", "a/\nb\nc\nd");
    await flush();
    const body = shell.root.querySelector<HTMLElement>(".sd-list .list-body");
    // Four rows of 36px with 2px between them and 2px under the last, three in view.
    for (const [name, value] of [["scrollHeight", 152], ["clientHeight", 114], ["scrollTop", 0]] as const) {
      if (body) Object.defineProperty(body, name, { configurable: true, value });
    }
    body?.dispatchEvent(new Event("scroll"));
    const thumb = shell.root.querySelector<HTMLElement>(".sd-scrollbar .scroll-thumb");
    expect(Number.parseFloat(thumb?.style.height ?? "")).toBeCloseTo((111 * 3) / 4);
    expect(declarations(readStyle("lcd.css"), ".list-carded + .scrollbar .scroll-thumb")["margin-top"]).toBe("1px");
  });

  it("keeps Play's folders shut and Record and Edit out of reach while playback holds a file, playing or paused, until [■] lets it go", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [
      entry("Recordings", "folder"),
      entry("take.wav", "take", 10),
      entry("inside.wav", "take", 96, 2, "/Recordings/"),
    ]);
    const store = shell.ctx.store;
    await pickTab(shell, "ui.sdTab", "Play");
    const press = async (cls: string): Promise<void> => {
      shell.root.querySelector<HTMLElement>(`.sd-actions > .${cls}`)?.click();
      await flush();
    };
    const touch = async (name: string): Promise<void> => {
      rows(shell).find((r) => cellsOf(r)[1] === name)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    };
    const tab = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.querySelector(".side-tab-label")?.textContent === label);
    const shut = (): boolean[] => ["Record", "Play", "Edit"].map((t) => tab(t)?.getAttribute("aria-disabled") === "true" && tab(t)?.classList.contains("is-disabled") === true);
    const where = (): [string, string, number] => [store.str("ui.sdTab", ""), store.str("sd.path", "/"), store.num("sd.selectedFile", -1)];

    await touch("take.wav");
    await press("rec-pause");
    for (const state of ["playing", "paused"]) {
      expect([store.num("sd.playingFile", -1), store.bool("sd.playing", false)], state).toEqual([1, state === "playing"]);
      expect(shut(), `${state}: Record and Edit shut`).toEqual([true, false, true]);
      await touch("Recordings");
      await touch("Recordings");
      expect(where(), `${state}: the folder takes the cursor and stays shut`).toEqual(["Play", "/", 0]);
      for (const label of ["Edit", "Record"]) {
        tab(label)?.click();
        await flush();
        expect([store.str("ui.sdTab", ""), shell.root.querySelector(".dialog-overlay")], `${state}: ${label} does nothing`).toEqual(["Play", null]);
      }
      await touch("take.wav");
      if (state === "playing") await press("rec-pause");
    }

    await press("rec-stop");
    expect(shut(), "let go: every tab in reach").toEqual([false, false, false]);
    await touch("Recordings");
    await touch("Recordings");
    expect(where(), "let go: the folder opens").toEqual(["Play", "/Recordings/", 2]);
    tab("Record")?.click();
    await flush();
    expect(store.str("ui.sdTab", ""), "let go: Record opens").toBe("Record");
  });

  it("opens no tab at the end of Loading... that a file held or recording mode has by then put out of reach", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [entry("take.wav", "take", 600)]);
    const store = shell.ctx.store;
    const tab = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.querySelector(".side-tab-label")?.textContent === label);
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    // Touch a tab, let the recorder change while Loading... is up, and wait the modal out.
    const load = async (label: string, meanwhile?: () => unknown): Promise<string> => {
      tab(label)?.click();
      await settle();
      expect(shell.root.querySelector(".dialog-text")?.textContent, `${label} loads`).toBe("Loading...");
      await meanwhile?.();
      await settle();
      vi.advanceTimersByTime(60_000);
      await settle();
      expect(shell.root.querySelector(".dialog-overlay"), `${label}: the modal takes itself down`).toBeNull();
      return store.str("ui.sdTab", "");
    };
    await pickTab(shell, "ui.sdTab", "Play");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      expect(await load("Edit", () => startPlayback(store, 0)), "a file held by then: Edit stays shut").toBe("Play");
      expect([store.num("sd.playingFile", -1), store.bool("sd.playing", false)], "with the file playing").toEqual([0, true]);
      stopPlayback(store);
      await settle();
      expect(await load("Edit"), "the control: nothing changed under it, Edit opens").toBe("Edit");

      tab("Record")?.click();
      await settle();
      expect(await load("Play", () => store.set("sd.rec", "armed")), "recording mode by then: it keeps the tab it came on in").toBe("Record");
      expect([store.str("sd.rec", ""), shell.root.querySelector('.rec-transport [aria-label="Stop"]') !== null], "with [■] there to leave it").toEqual(["armed", true]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("holds playback out of the keys' reach behind Loading..., and Record and Edit out of it while a file is held", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [entry("take.wav", "take", 600)]);
    document.body.appendChild(shell.root);
    const store = shell.ctx.store;
    const tab = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.querySelector(".side-tab-label")?.textContent === label);
    const control = (cls: string): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.sd-actions > .${cls}`);
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    };
    // Enter pressed and let go on a control the focus is put on.
    const enter = async (node: HTMLElement | null | undefined): Promise<void> => {
      node?.focus();
      node?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await settle();
      node?.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true, cancelable: true }));
      await settle();
    };
    const modal = (): string | null => shell.root.querySelector(".dialog-text")?.textContent ?? null;
    await pickTab(shell, "ui.sdTab", "Play");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      await enter(tab("Edit"));
      expect(modal(), "Edit loads").toBe("Loading...");
      expect(
        [control("rec-pause"), control("rec-stop"), tab("Record"), tab("Play"), tab("Edit")].map((n) => n !== null && n?.closest("[inert]") !== null),
        "[Play/Pause], [■] and the tabs are under it",
      ).toEqual([true, true, true, true, true]);
      vi.advanceTimersByTime(60_000);
      await settle();
      expect([modal(), store.str("ui.sdTab", ""), store.num("sd.playingFile", -1)], "Edit opens on nothing held").toEqual([null, "Edit", -1]);

      await enter(tab("Play"));
      vi.advanceTimersByTime(60_000);
      await settle();
      await enter(control("rec-pause"));
      expect([store.str("ui.sdTab", ""), store.num("sd.playingFile", -1), store.bool("sd.playing", false)], "a file played from the keys").toEqual(["Play", 0, true]);
      for (const label of ["Edit", "Record"]) {
        await enter(tab(label));
        expect([modal(), store.str("ui.sdTab", "")], `held: ${label} does nothing`).toEqual([null, "Play"]);
      }
      await enter(control("rec-stop"));
      await enter(tab("Edit"));
      expect([store.num("sd.playingFile", -1), modal()], "the control: let go, Edit loads").toEqual([-1, "Loading..."]);
      vi.advanceTimersByTime(60_000);
      await settle();
    } finally {
      vi.useRealTimers();
      shell.destroy();
      shell.root.remove();
    }
  });


  it("puts Play's [↑] out of reach while playback holds a file, playing or paused, and brings it back once [■] lets the file go", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [entry("Recordings", "folder"), entry("inside.wav", "take", 96, 2, "/Recordings/")]);
    const store = shell.ctx.store;
    await store.set("sd.path", "/Recordings/");
    await store.set("sd.selectedFile", 1);
    await pickTab(shell, "ui.sdTab", "Play");
    const press = async (cls: string): Promise<void> => {
      shell.root.querySelector<HTMLElement>(`.sd-actions > .${cls}`)?.click();
      await flush();
    };
    // The face [↑] wears, and the folder open once it is touched.
    const climb = async (): Promise<[boolean, string | null, string]> => {
      const up = shell.root.querySelector<HTMLElement>(".sd-up");
      const face: [boolean, string | null] = [up?.classList.contains("is-disabled") === true, up?.getAttribute("aria-disabled") ?? null];
      up?.click();
      await flush();
      return [...face, store.str("sd.path", "/")];
    };

    await press("rec-pause");
    expect([store.num("sd.playingFile", -1), store.bool("sd.playing", false)], "playing").toEqual([1, true]);
    expect(await climb(), "playing: shut, the folder staying open").toEqual([true, "true", "/Recordings/"]);
    await press("rec-pause");
    expect([store.num("sd.playingFile", -1), store.bool("sd.playing", false)], "paused").toEqual([1, false]);
    expect(await climb(), "paused: shut, the folder staying open").toEqual([true, "true", "/Recordings/"]);

    await press("rec-stop");
    expect(store.num("sd.playingFile", -1), "let go").toBe(-1);
    expect(await climb(), "let go: [↑] climbs out").toEqual([false, null, "/"]);
  });

  it("brings the cursor to the file playback holds, playing or paused, and fills the bar by that file's length", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    await pickTab(shell, "ui.sdTab", "Play");
    const played = (): number =>
      Number.parseFloat(shell.root.querySelector<HTMLElement>(".sd-progress")?.style.getPropertyValue("--played") ?? "");
    const speakerRow = (): number => rows(shell).findIndex((r) => r.querySelector(".sd-icon .icon-speaker") !== null);
    const button = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".sd-locate");
    const locate = async (): Promise<void> => {
      button()?.click();
      await flush();
    };
    await shell.ctx.store.set("sd.selectedFile", 2);
    await flush();
    // Nothing held: the mark is greyed and the button takes nothing.
    expect([button()?.classList.contains("is-disabled"), button()?.getAttribute("aria-disabled")], "stopped").toEqual([true, "true"]);
    await locate();
    expect(shell.ctx.store.num("sd.selectedFile", -1), "nothing held, so the cursor stays").toBe(2);

    const state = { "sd.playSeconds": 2, "sd.playingFile": 1 };
    for (const [path, value] of Object.entries(state)) await shell.ctx.store.set(path, value);
    await flush();
    expect(played(), "two seconds of the ten the file held lasts").toBeCloseTo(20);
    expect([button()?.classList.contains("is-disabled"), button()?.hasAttribute("aria-disabled")], "paused").toEqual([false, false]);
    expect(speakerRow(), "paused, the speaker stays on the file held").toBe(1);
    await locate();
    expect(shell.ctx.store.num("sd.selectedFile", -1), "paused, the cursor comes to the file held").toBe(1);

    await shell.ctx.store.set("sd.selectedFile", 2);
    await shell.ctx.store.set("sd.playing", true);
    await flush();
    expect(speakerRow(), "the speaker marks the file playing, not the cursor").toBe(1);
    await locate();
    expect(shell.ctx.store.num("sd.selectedFile", -1)).toBe(1);
  });

  it("meters on OUT beside RECORDER's list what the file playing puts out after microSD Playback's D.Gain, moving as it plays, and nothing while no file plays", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const shell = await mount({ id: "microsd.recorder" }, [entry("a.wav", "take", 600)]);
    const store = shell.ctx.store;
    const stopTicker = startMeterTicker(store, shell.root);
    try {
      // A stereo channel on microSD Playback takes in what the file puts out.
      await store.set("ch.ch_5_6.source", "microSD Playback");
      const unlit = (): string[] => [...shell.root.querySelectorAll<HTMLElement>(".sd-out .meter-bar")].map((b) => b.style.getPropertyValue("--unlit"));
      const out = (): number[] => meterLevels(store, shell.root.querySelector<HTMLElement>(".sd-out .meter")?.dataset["meterSource"] ?? "", 2, Date.now());
      const taken = (): number[] => meterLevels(store, inputMeterId("ch_5_6"), 2, Date.now());
      const drawn = (levels: number[]): string[] => levels.map((db) => `${(1 - levelBarShare(db)) * 100}%`);
      for (const tab of ["Play", "Edit"]) {
        stopPlayback(store);
        // OUT falls from where it stood, as every meter the ticker moves, and comes to rest within 4 s.
        vi.advanceTimersByTime(4_000);
        await pickTab(shell, "ui.sdTab", tab);
        expect(shell.root.querySelector(".sd-out .dyn-io-caption")?.textContent, tab).toBe("OUT");
        expect(unlit(), `${tab}, stopped`).toEqual(["100%", "100%"]);
        startPlayback(store, 0);
        await flush();
        expect(out(), `${tab}, playing: what the channel takes in`).toEqual(taken());
        expect(Math.max(...out()), `${tab}, playing: sounding`).toBeGreaterThan(-60);
        expect(unlit(), `${tab}, playing: drawn to it`).toEqual(drawn(taken()));
      }
      const seen = new Set<string>();
      for (let i = 0; i < 4; i++) {
        vi.advanceTimersByTime(2_500);
        expect(out(), `${2.5 * (i + 1)} s on`).toEqual(taken());
        seen.add(unlit().join(" "));
      }
      expect(seen.size, "moving as the file plays").toBeGreaterThan(1);

      const before = out();
      await store.set(digitalGainPath("microSD Playback"), -20);
      expect(out().map((db, i) => db - (before[i] ?? 0)), "20 dB down with the D.Gain").toEqual([expect.closeTo(-20, 6), expect.closeTo(-20, 6)]);
      const heard = out();
      await store.set("ch.ch_5_6.source", "None");
      expect(out(), "whatever the channels take").toEqual(heard);

      pausePlayback(store);
      await flush();
      expect(out(), "paused").toEqual([SILENT_DB, SILENT_DB]);
      vi.advanceTimersByTime(5_000);
      expect(unlit(), "paused, fallen").toEqual(["100%", "100%"]);
    } finally {
      stopTicker();
      vi.useRealTimers();
    }
  });

  it("marks every control out of reach that RECORDER and SAVE/LOAD shut, so a key press does not sink it", async () => {
    const shut = (shell: Shell): [string, string | null][] =>
      [...shell.root.querySelectorAll<HTMLElement>(".is-disabled")].map((n) => [
        n.getAttribute("aria-label") ?? n.textContent ?? "",
        n.getAttribute("aria-disabled"),
      ]);
    // The folder at the root is picked: nothing to climb out of, and no file to act on.
    const recorder = await mount({ id: "microsd.recorder" });
    await pickTab(recorder, "ui.sdTab", "Edit");
    expect(shut(recorder)).toEqual([["Up one level", "true"], ["Delete", "true"], ["Rename", "true"]]);
    const saveLoad = await mount({ id: "microsd.saveload" });
    expect(shut(saveLoad), "Save/Load").toEqual([["Up one level", "true"], ["Save", "true"], ["Load", "true"]]);
    await pickTab(saveLoad, "ui.sdSaveTab", "Edit");
    expect(shut(saveLoad), "Edit").toEqual([["Up one level", "true"], ["Delete", "true"], ["Rename", "true"]]);
  });

  it("draws Delete and Rename with one pair of marks on RECORDER and on SAVE/LOAD", async () => {
    const marks = (shell: Shell): (string | null)[] =>
      [...shell.root.querySelectorAll(".sd-actions > .sd-action svg")].map((svg) => svg.getAttribute("class"));
    const recorder = await mount({ id: "microsd.recorder" });
    await pickTab(recorder, "ui.sdTab", "Edit");
    expect(marks(recorder)).toEqual(["icon-trash", "icon-rename"]);
    const saveLoad = await mount({ id: "microsd.saveload" });
    await pickTab(saveLoad, "ui.sdSaveTab", "Edit");
    expect(marks(saveLoad)).toEqual(["icon-new-folder", "icon-trash", "icon-rename"]);
  });
});

describe("RECORDER's track slots", () => {
  it("meter the source each slot takes, a pair channel by channel, whether or not recording", async () => {
    // A bus is read as it goes out, a channel at its Rec Point.
    const lit: Record<string, number[]> = { "bus.stereo@post": [-18, -22], "ch2@preFader": [-18], "ch_9_10@preFader": [-96, -18] };
    setMeterSource((id, channels) => lit[id] ?? Array.from({ length: channels }, () => -96));
    try {
      const shell = await mount({ id: "microsd.recorder" });
      for (const [slot, source] of ["STEREO", "None", "CH 1/2", "CH 9/10"].entries()) await shell.ctx.store.set(`sd.track.${slot}`, source);
      await flush();
      const bars = (): boolean[][] =>
        [...shell.root.querySelectorAll(".rec-slot")].slice(0, 4).map((slot) =>
          [...slot.querySelectorAll<HTMLElement>(".meter-bar")].map((b) => Number.parseFloat(b.style.getPropertyValue("--unlit")) < 100),
        );
      const expected = [[true, true], [false, false], [false, true], [false, true]];
      expect(bars(), "not recording").toEqual(expected);
      await shell.ctx.store.set("sd.rec", "recording");
      await flush();
      expect(bars(), "recording changes nothing").toEqual(expected);
    } finally {
      setMeterSource(null);
    }
  });
});

describe("the microSD screen with no card in the slot", () => {
  it("says so on the row the entries stood on, and draws neither the entries nor the toolbar's card controls", async () => {
    const shell = await mount({ id: "microsd" });
    await shell.ctx.store.set("sd.mounted", false);
    await flush();
    // The unit leaves the title and the way home, and nothing to go on to.
    expect(shell.root.querySelector(".menu-grid-sd > .sd-no-card")?.textContent).toBe("Not inserted microSD card");
    expect(shell.root.querySelectorAll(".menu-grid-sd .menu-btn").length, "no Recorder, Save/Load or Tools").toBe(0);
    expect(shell.root.querySelector(".usb-storage"), "no USB Storage Mode").toBeNull();
    expect(shell.root.querySelector(".sd-eject"), "no eject button").toBeNull();
    expect(shell.root.querySelector(".toolbar-title")?.textContent).toBe("microSD");

    // The control: a card in the slot brings the three back.
    await shell.ctx.store.set("sd.mounted", true);
    await flush();
    expect(shell.root.querySelector(".sd-no-card")).toBeNull();
    expect(shell.root.querySelectorAll(".menu-grid-sd .menu-btn").length).toBe(3);
  });

  it("puts the line in white across the three columns, as tall as an entry and smaller than the entries' names", () => {
    const css = readStyle("lcd.css");
    const line = declarations(css, ".menu-grid .sd-no-card");
    expect([line["color"], line["text-align"], line["grid-column"]]).toEqual(["var(--text)", "center", "1 / -1"]);
    expect(line["min-height"]).toBe(declarations(css, ".menu-btn")["min-height"]);
    expect(line["font-size"]).toBe("var(--fs-sm)");
  });

  it("takes RECORDER, SAVE/LOAD and TOOLS back to the microSD top once the card comes out", async () => {
    for (const id of ["microsd.recorder", "microsd.saveload", "microsd.tools"]) {
      const shell = await mount({ id: "home" });
      shell.ctx.nav.openTop({ id: "microsd" });
      shell.ctx.nav.push({ id });
      await flush();
      // The control: with the card in, the screen stays.
      expect(shell.ctx.nav.current.id, id).toBe(id);
      await eject(shell);
      await flush();
      expect(shell.ctx.nav.current.id, id).toBe("microsd");
      expect(shell.ctx.nav.depth, `${id}: HOME under it, as the toolbar icon leaves it`).toBe(2);
      expect(shell.root.querySelector(".sd-no-card")?.textContent, id).toBe("Not inserted microSD card");
      expect(shell.root.querySelector(".toolbar .icon-btn[aria-label='Back']"), `${id}: no back arrow`).toBeNull();
    }
  });

  it("takes the name sheet a card screen opened back to the microSD top once the card comes out", async () => {
    const opens: [string, string, string | null, string][] = [
      ["microsd.saveload", "ui.sdSaveTab", null, "Save as"],
      ["microsd.saveload", "ui.sdSaveTab", "Edit", "New folder"],
      ["microsd.saveload", "ui.sdSaveTab", "Edit", "Rename"],
      ["microsd.recorder", "ui.sdTab", "Edit", "Rename"],
    ];
    for (const [id, tabPath, tab, label] of opens) {
      const shell = await mount({ id: "home" });
      shell.ctx.nav.openTop({ id: "microsd" });
      shell.ctx.nav.push({ id });
      if (tab) await pickTab(shell, tabPath, tab);
      await shell.ctx.store.set("sd.selectedFile", 1);
      await flush();
      const control =
        shell.root.querySelector<HTMLElement>(`.sd-actions [aria-label="${label}"]`) ??
        [...shell.root.querySelectorAll<HTMLElement>(".sd-actions .btn")].find((b) => b.textContent === label);
      control?.click();
      await flush();
      const where = `${id} ${label}`;
      expect(shell.root.querySelector(".pick-dialog-ok"), `${where}: the sheet is open`).not.toBeNull();
      await eject(shell);
      await flush();
      expect(shell.ctx.nav.current.id, where).toBe("microsd");
      expect(shell.ctx.nav.depth, where).toBe(2);
      expect(shell.root.querySelector(".sd-no-card"), where).not.toBeNull();
    }
  });

  it("puts the card back through a question of the simulator's own, asked by the line saying there is none", async () => {
    const shell = await mount({ id: "microsd" });
    await eject(shell);
    const line = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".sd-no-card");
    const answer = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === label)?.click();
      await flush();
    };
    expect(line()?.tagName, "the line is a button").toBe("BUTTON");

    line()?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Simulate inserting the microSD card?");
    expect([...shell.root.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
    await answer("Cancel");
    expect(shell.ctx.store.bool("sd.mounted", true), "[Cancel] leaves the slot empty").toBe(false);

    line()?.click();
    await flush();
    await answer("OK");
    expect(shell.ctx.store.bool("sd.mounted", false)).toBe(true);
    expect(shell.root.querySelectorAll(".menu-grid-sd .menu-btn").length, "the three entries are back").toBe(3);
  });

  it("draws the line that asks as the line alone, with no face, frame or padding of a button", () => {
    const line = declarations(readStyle("lcd.css"), ".menu-grid .sd-no-card");
    expect([line["background"], line["border"], line["padding"]]).toEqual(["none", "0", "0"]);
  });

  it("leaves the name sheet SCENE LIST opened where it is once the card comes out", async () => {
    const shell = await mount({ id: "scene.title" });
    await eject(shell);
    await flush();
    expect(shell.ctx.nav.current.id).toBe("scene.title");
    expect(shell.root.querySelector(".pick-dialog-ok")).not.toBeNull();
  });
});

describe("USB Storage Mode", () => {
  it("asks before it is entered, and lights the button on [OK]", async () => {
    const shell = await mount({ id: "microsd" });
    const btn = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".usb-storage");
    expect(btn()?.classList.contains("is-on")).toBe(false);

    btn()?.click();
    await flush();
    // The unit's own wording and line breaks, its mark, and [Cancel] left of [OK].
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe(
      "This microSD card is recognized as a storage\ndrive by the computer and will not work with\nthe URX unit.",
    );
    expect(shell.root.querySelector(".dialog-mark svg"), "with the mark beside it").not.toBeNull();
    expect([...shell.root.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
    expect(shell.ctx.store.bool("sd.usbStorage", false), "asking changes nothing").toBe(false);

    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.usbStorage", false)).toBe(true);
    expect(btn()?.classList.contains("is-on"), "the button lights").toBe(true);
  });

  it("asks a different question on the way out, [Cancel] leaves the mode on and [OK] takes it off", async () => {
    const shell = await mount({ id: "microsd" });
    await shell.ctx.store.set("sd.usbStorage", true);
    await flush();
    /** The mode, the button's light, the entries out of reach, and the card-eject button in the toolbar. */
    const state = (): [boolean, boolean | undefined, number, boolean] => [
      shell.ctx.store.bool("sd.usbStorage", false),
      shell.root.querySelector(".usb-storage")?.classList.contains("is-on"),
      shell.root.querySelectorAll(".menu-grid-sd .menu-btn.is-disabled").length,
      shell.root.querySelector(".toolbar .sd-eject") !== null,
    ];
    const answer = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === label)?.click();
      await flush();
    };

    shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
    await flush();
    // The unit's own wording, over the three lines it breaks it into.
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe(
      "Please make sure that the microSD storage\ndrive of the URX unit has been removed from\nthe computer.",
    );

    await answer("Cancel");
    expect(state(), "[Cancel]: the mode on, Recorder, Save/Load and Tools out of reach, no card to take out").toEqual([true, true, 3, false]);

    shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
    await flush();
    await answer("OK");
    expect(shell.root.querySelector(".dialog-text"), "the question answered").toBeNull();
    expect(state(), "[OK]: the mode off, the three entries and the card-eject button back").toEqual([false, false, 0, true]);
  });

  it("stays on the microSD screen either way", async () => {
    const shell = await mount({ id: "microsd" });
    const depth = shell.ctx.nav.depth;
    for (const [way, answer] of [
      ["in", "Cancel"],
      ["in", "OK"],
      ["out", "Cancel"],
      ["out", "OK"],
    ]) {
      shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
      await flush();
      expect(shell.root.querySelector(".dialog-text"), `${way}: asked`).not.toBeNull();
      expect(shell.ctx.nav.depth, `${way}: the dialog is not a screen`).toBe(depth);
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === answer)?.click();
      await flush();
      expect(shell.root.querySelector(".dialog-text"), `${way}, ${answer}: answered`).toBeNull();
      expect([shell.ctx.nav.current.id, shell.ctx.nav.depth], `${way}, ${answer}`).toEqual(["microsd", depth]);
      expect(shell.root.querySelector(".menu-grid-sd"), `${way}, ${answer}: the menu is still there`).not.toBeNull();
    }
    expect(shell.ctx.store.bool("sd.usbStorage", true), "in and out again").toBe(false);
  });

  it("puts USB Storage Mode and the card-eject button out of reach while playback holds a file, playing or paused, until [■] lets it go", async () => {
    const shell = await mount({ id: "microsd" });
    const store = shell.ctx.store;
    const press = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions > *")].find((b) => b.getAttribute("aria-label") === label)?.click();
      await flush();
    };
    const top = async (): Promise<void> => {
      shell.ctx.nav.back();
      await flush();
      expect(shell.ctx.nav.current.id).toBe("microsd");
    };
    const reach = (): [string, boolean | undefined, string | null | undefined][] =>
      [".usb-storage", ".sd-eject"].map((sel) => {
        const node = shell.root.querySelector<HTMLElement>(`.toolbar ${sel}`);
        return [sel, node?.classList.contains("is-disabled"), node?.getAttribute("aria-disabled")];
      });

    shell.ctx.nav.push({ id: "microsd.recorder" });
    await pickTab(shell, "ui.sdTab", "Play");
    rows(shell).find((r) => cellsOf(r)[1] === "20251020_112323.wav")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flush();
    for (const [why, playing] of [["playing", true], ["paused", false]] as const) {
      await press("Play/Pause");
      expect([store.bool("sd.playing", !playing), store.num("sd.playingFile", -1)], why).toEqual([playing, 1]);
      await top();
      expect(reach(), why).toEqual([
        [".usb-storage", true, "true"],
        [".sd-eject", true, "true"],
      ]);
      for (const sel of [".usb-storage", ".sd-eject"]) {
        shell.root.querySelector<HTMLElement>(`.toolbar ${sel}`)?.click();
        await flush();
        expect(shell.root.querySelector(".dialog-overlay"), `${why}: ${sel} asks nothing`).toBeNull();
      }
      expect([store.bool("sd.usbStorage", false), store.bool("sd.mounted", false), store.num("sd.playingFile", -1)], `${why}: the file still held`).toEqual([false, true, 1]);
      shell.ctx.nav.push({ id: "microsd.recorder" });
      await flush();
    }

    await press("Stop");
    await top();
    expect(reach(), "both back in reach once [■] lets the file go").toEqual([
      [".usb-storage", false, null],
      [".sd-eject", false, null],
    ]);
  });
});
