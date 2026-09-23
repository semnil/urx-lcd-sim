import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import type { Route } from "../app/navigator";
import { buildRegistry } from "./index";
import { columnGap, declarations, px, readStyle } from "../style/css-read";
import { setMeterSource } from "./meters";
import type { CardEntry } from "../model/card";
import { formatFree, freeBytes, writeCard } from "../model/card";

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

  it("carries the card-eject button where the unit has it, asking the unit's question before the card comes out", async () => {
    for (const id of ["microsd", "microsd.recorder", "microsd.saveload", "microsd.tools"]) {
      const shell = await mount({ id });
      const eject = shell.root.querySelector<HTMLElement>(".toolbar .sd-eject");
      expect([eject?.classList.contains("is-disabled"), eject?.hasAttribute("aria-disabled")], `${id}: in reach`).toEqual([false, false]);
      eject?.click();
      await flush();
      expect(shell.root.querySelector(".dialog-text")?.textContent, id).toBe("Now you may safely remove the microSD card.");
      const answers = [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")];
      expect(answers.map((b) => b.textContent), `${id}: [OK] alone`).toEqual(["OK"]);
      expect(shell.ctx.store.bool("sd.mounted", false), `${id}: asking takes nothing out`).toBe(true);

      // [OK] stands for the card being pulled from the slot.
      answers[0]?.click();
      await flush();
      expect(shell.ctx.store.bool("sd.mounted", true), id).toBe(false);
      expect(shell.ctx.nav.current.id, id).toBe("microsd");
      expect(shell.root.querySelector(".sd-no-card"), id).not.toBeNull();
    }
  });

  it("lets go of the file playback holds paused once the card is taken out", async () => {
    const shell = await mount({ id: "microsd" });
    await shell.ctx.store.set("sd.playingFile", 1);
    await flush();
    shell.root.querySelector<HTMLElement>(".toolbar .sd-eject")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".dialog-actions .btn")?.click();
    await flush();
    expect(shell.ctx.store.num("sd.playingFile", -1)).toBe(-1);
  });

  it("puts the card-eject button out of reach while a file plays and in recording mode", async () => {
    const out = async (shell: Shell, why: string): Promise<void> => {
      const eject = shell.root.querySelector<HTMLElement>(".toolbar .sd-eject");
      expect([eject?.classList.contains("is-disabled"), eject?.getAttribute("aria-disabled")], why).toEqual([true, "true"]);
      eject?.click();
      await flush();
      expect(shell.root.querySelector(".dialog-overlay"), `${why}: nothing asked`).toBeNull();
    };
    const playing = await mount({ id: "microsd.recorder" });
    await pickTab(playing, "ui.sdTab", "Play");
    await playing.ctx.store.set("sd.playing", true);
    await flush();
    await out(playing, "a file playing");

    const armed = await mount({ id: "microsd" });
    await armed.ctx.store.set("sd.rec", "armed");
    await flush();
    await out(armed, "recording mode");
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

  it("meters the file playing on OUT beside RECORDER's list, lit to the rows its defaults give, and unlit while nothing plays", async () => {
    const CSS = readStyle("lcd.css");
    const barRows =
      px(declarations(CSS, ".dyn-io .meter")["height"]) -
      px(declarations(CSS, ".dyn-io .meter-clip")["height"]) -
      columnGap(declarations(CSS, ".dyn-io .meter-lane")["gap"]);
    const shell = await mount({ id: "microsd.recorder" });
    const unlitRows = (): number[] =>
      [...shell.root.querySelectorAll<HTMLElement>(".sd-out .meter-bar")].map((b) =>
        Math.round((Number.parseFloat(b.style.getPropertyValue("--unlit")) / 100) * barRows),
      );
    for (const tab of ["Play", "Edit"]) {
      await shell.ctx.store.set("sd.playing", false);
      await pickTab(shell, "ui.sdTab", tab);
      expect(shell.root.querySelector(".sd-out .dyn-io-caption")?.textContent, tab).toBe("OUT");
      expect(unlitRows(), `${tab}, stopped`).toEqual([barRows, barRows]);
      await shell.ctx.store.set("sd.playing", true);
      await flush();
      expect(unlitRows(), `${tab}, playing`).toEqual([45, 39]);
    }
    await shell.ctx.store.set("sd.outLevel.0", 0);
    await shell.ctx.store.set("sd.outLevel.1", -60);
    await flush();
    expect(unlitRows(), "the levels the store carries").toEqual([0, barRows]);
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
    const lit: Record<string, number[]> = { "bus.stereo": [-18, -22], ch2: [-18], ch_9_10: [-96, -18] };
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

  it("asks a different question on the way out, and [Cancel] leaves the mode on", async () => {
    const shell = await mount({ id: "microsd" });
    await shell.ctx.store.set("sd.usbStorage", true);
    await flush();

    shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
    await flush();
    // The unit's own wording, over the three lines it breaks it into.
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe(
      "Please make sure that the microSD storage\ndrive of the URX unit has been removed from\nthe computer.",
    );

    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "Cancel")?.click();
    await flush();
    expect(shell.ctx.store.bool("sd.usbStorage", false)).toBe(true);
  });

  it("stays on the microSD screen either way", async () => {
    const shell = await mount({ id: "microsd" });
    const depth = shell.ctx.nav.depth;
    shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
    await flush();
    expect(shell.ctx.nav.depth, "the dialog is not a screen").toBe(depth);
    expect(shell.root.querySelector(".menu-grid-sd"), "the menu is still under it").not.toBeNull();
  });
});
