import { describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import type { Route } from "../app/navigator";
import { clockParts, setClock } from "../model/clock";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { freeBytes, readCard, writeCard } from "../model/card";
import type { CardEntry } from "../model/card";
import { buildRegistry } from "./index";
import { pausePlayback, playedSeconds, recordTake, startPlayback, startRecorderClock, stopPlayback, stopTake } from "./recording";

// The card holds what is written to it: a take the recorder leaves, a settings
// file SAVE/LOAD writes, and the room they take up.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(route: Route, card?: CardEntry[]): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  if (card) await writeCard(store, card);
  shell.ctx.nav.push(route);
  await flush();
  return shell;
}

const names = (shell: Shell): string[] => readCard(shell.ctx.store).map((e) => e.name);
const action = (shell: Shell, label: string): HTMLElement | null =>
  shell.root.querySelector<HTMLElement>(`.sd-actions [aria-label="${label}"]`) ??
  [...shell.root.querySelectorAll<HTMLElement>(".sd-actions .btn")].find((b) => b.textContent === label) ??
  null;
const okDialog = async (shell: Shell): Promise<void> => {
  [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
  await flush();
};
const typeTitle = async (shell: Shell, text: string): Promise<void> => {
  await shell.ctx.store.set("ui.titleEntry.text", text);
  await flush();
  shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
  await flush();
};

describe("the card the simulator ships with", () => {
  it("is in the slot with nothing on it", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    expect(shell.ctx.store.bool("sd.mounted", false), "a card in the slot").toBe(true);
    expect(readCard(shell.ctx.store), "and nothing on it").toEqual([]);
    expect(shell.root.querySelectorAll(".sd-list .list-row").length).toBe(0);
    expect(shell.root.querySelector(".sd-free")?.textContent, "under its name, the room a formatted card leaves").toBe("test\n116.4GB Free");
  });
});

describe("what the recorder leaves on the card", () => {
  it("writes the take it recorded, named from the unit's clock", async () => {
    const shell = await mount({ id: "microsd.recorder" }, []);
    const store = shell.ctx.store;
    // The clock stands at 14:05 on 20 September 2026 at the start, and the take stops 26 seconds on.
    await setClock(store, { year: 2026, month: 9, day: 20, hour: 14, minute: 5 }, 0);
    await store.set("sd.trackCount", 4);
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 26_000);
    await flush();

    const [take] = readCard(store);
    expect(take?.name, "the moment it was taken, to the second").toBe("20260920_140526.wav");
    expect([take?.kind, take?.seconds, take?.tracks], "as long as it ran, on the tracks it was set to").toEqual(["take", 25, 4]);
    expect(take?.stamp).toBe("09/20/2026\n14:05:26");
  });

  it("gives a take the next second when the card already carries the name its own second gives", async () => {
    const held: CardEntry = { name: "20260920_140526.wav", kind: "take", seconds: 5, tracks: 2, stamp: "", dir: "/" };
    const shell = await mount({ id: "microsd.recorder" }, [held]);
    const store = shell.ctx.store;
    // The clock stands at 14:05 on 20 September 2026 at the start, and the take stops 26 seconds on.
    await setClock(store, { year: 2026, month: 9, day: 20, hour: 14, minute: 5 }, 0);
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 26_000);
    await flush();
    expect(names(shell).sort()).toEqual(["20260920_140526.wav", "20260920_140527.wav"]);
  });

  it("writes the take into the folder the card browser is open on", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [
      { name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
    ]);
    const store = shell.ctx.store;
    await store.set("sd.path", "/Recordings/");
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 6_000);
    await flush();
    expect(readCard(store).map((e) => [e.kind, e.dir])).toEqual([
      ["folder", "/"],
      ["take", "/Recordings/"],
    ]);
  });

  it("leaves nothing behind when the take recorded nothing", async () => {
    const shell = await mount({ id: "microsd.recorder" }, []);
    await shell.ctx.store.set("sd.rec", "armed");
    stopTake(shell.ctx.store, 5_000);
    await flush();
    expect(readCard(shell.ctx.store)).toEqual([]);
  });

  it("takes the room the take needs off the card", async () => {
    const shell = await mount({ id: "microsd.recorder" }, []);
    const store = shell.ctx.store;
    const before = freeBytes(store);
    await store.set("sd.trackCount", 2);
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 11_000);
    await flush();
    // Ten seconds of two tracks, 24-bit at 48 kHz.
    expect(before - freeBytes(store)).toBe(10 * 48_000 * 3 * 2);
  });
});

describe("playing a file back", () => {
  it("counts from where it was started, holds where it was paused, and starts another file from nothing", async () => {
    const shell = await mount({ id: "microsd.recorder" });
    const store = shell.ctx.store;
    startPlayback(store, 1, 1_000);
    expect(playedSeconds(store, 4_000)).toBe(3);
    pausePlayback(store, 4_000);
    expect(playedSeconds(store, 9_000), "paused, holding where it reached").toBe(3);
    startPlayback(store, 1, 9_000);
    expect(playedSeconds(store, 11_000), "resumed, counting on from there").toBe(5);
    startPlayback(store, 2, 11_000);
    expect(playedSeconds(store, 12_000), "another file, from its own start").toBe(1);
    stopPlayback(store);
    expect(playedSeconds(store, 20_000), "stopped, holding nothing").toBe(0);
  });

  it("keeps the counter empty while playback holds no file", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const shell = await mount({ id: "microsd.recorder" }, [
        { name: "short.wav", kind: "take", seconds: 20, tracks: 2, stamp: "", dir: "/" },
      ]);
      const store = shell.ctx.store;
      await store.set("ui.sdTab", "Play");
      await flush();
      const counter = (): string => shell.root.querySelector("[data-play-clock]")?.textContent ?? "missing";
      const stop = startRecorderClock(store, shell.root, 50);
      vi.advanceTimersByTime(60);
      expect(counter(), "nothing held").toBe("");
      startPlayback(store, 0, Date.now() - 3_000);
      vi.advanceTimersByTime(60);
      expect(counter(), "the control: a file held counts").toBe("00:00:03");
      stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets go of the file it holds once the unit's sampling frequency changes", async () => {
    const shell = await mount({ id: "setup.rate" }, [{ name: "a.wav", kind: "take", seconds: 20, tracks: 2, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    const rate = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".rate-btn")].find((b) => b.textContent === label)?.click();
      await flush();
    };
    startPlayback(store, 0, Date.now() - 4_000);
    pausePlayback(store);
    await flush();
    await rate("48kHz");
    expect(store.num("sd.playingFile", -1), "the control: the frequency it already runs at").toBe(0);
    await rate("44.1kHz");
    expect([store.num("sd.playingFile", -1), store.bool("sd.playing", true), playedSeconds(store)], "44.1 kHz").toEqual([-1, false, 0]);
  });

  it("lets go of the file it holds when a settings file brings another sampling frequency", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [
      { name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
      { name: "take.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" },
    ]);
    const store = shell.ctx.store;
    await store.set("setup.samplingFrequency", 44_100);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "at441");
    await store.set("setup.samplingFrequency", 48_000);
    startPlayback(store, 1, Date.now() - 4_000);
    pausePlayback(store);
    await flush();
    const row = readCard(store).findIndex((e) => e.name === "at441.urxf");
    await store.set("sd.selectedFile", row);
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(store.num("setup.samplingFrequency", 0), "the file's frequency").toBe(44_100);
    expect(store.num("sd.playingFile", -1)).toBe(-1);
  });

  it("puts back a ratio saved at the top of its travel", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [{ name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    await store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "inf");
    await store.set("ch.ch1.ssmcs.comp.ratio", 40);
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "inf.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(store.num("ch.ch1.ssmcs.comp.ratio", 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("stops at the end of the file", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const shell = await mount({ id: "microsd.recorder" }, [
        { name: "short.wav", kind: "take", seconds: 2, tracks: 2, stamp: "", dir: "/" },
      ]);
      const store = shell.ctx.store;
      const stop = startRecorderClock(store, shell.root, 50);
      startPlayback(store, 0, Date.now() - 1_000);
      vi.advanceTimersByTime(60);
      expect(store.bool("sd.playing", false), "a second in, still playing").toBe(true);
      startPlayback(store, 0, Date.now() - 5_000);
      vi.advanceTimersByTime(60);
      expect(
        [store.bool("sd.playing", true), playedSeconds(store), store.num("sd.playingFile", -1)],
        "past its end: stopped at the start of the file, still holding it",
      ).toEqual([false, 0, 0]);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("what the card's own actions do to it", () => {
  const card: CardEntry[] = [
    { name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
    { name: "take.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" },
  ];

  it("asks in the unit's words before it writes over a file, and loads without asking", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const ask = (): string | undefined => shell.root.querySelector(".dialog-text")?.textContent ?? undefined;
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");
    expect(ask(), "a name the card does not carry is written at once").toBeUndefined();

    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Save")?.click();
    await flush();
    expect(ask(), "over a file that is already there").toBe("File alerady exists. Replace it?");
    await okDialog(shell);

    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");
    expect(ask(), "and under a name the card already carries").toBe("File alerady exists. Replace it?");
    await okDialog(shell);

    action(shell, "Load")?.click();
    await flush();
    expect(ask(), "loading asks nothing").toBeUndefined();
  });

  it("takes a file off the card once the dialog is answered", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    await shell.ctx.store.set("ui.sdSaveTab", "Edit");
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Delete")?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Delete the selected file?");
    expect(names(shell), "nothing goes until it is answered").toEqual(["Recordings", "take.wav"]);
    await okDialog(shell);
    expect(names(shell)).toEqual(["Recordings"]);
  });

  it("renames the entry the cursor stands on", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    await shell.ctx.store.set("ui.sdSaveTab", "Edit");
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Rename")?.click();
    await flush();
    await typeTitle(shell, "keeper.wav");
    expect(names(shell)).toEqual(["Recordings", "keeper.wav"]);
  });

  it("puts a folder on the card under the name that is typed", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    await shell.ctx.store.set("ui.sdSaveTab", "Edit");
    await flush();
    action(shell, "New folder")?.click();
    await flush();
    await typeTitle(shell, "Takes");
    expect(names(shell), "folders stand ahead of the files").toEqual(["Recordings", "Takes", "take.wav"]);
    expect(readCard(shell.ctx.store)[1]?.kind).toBe("folder");
  });

  it("puts what is made next into the folder that is open", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    await store.set("sd.path", "/Recordings/");
    await flush();
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "inner");
    await store.set("ui.sdSaveTab", "Edit");
    await flush();
    action(shell, "New folder")?.click();
    await flush();
    await typeTitle(shell, "Deeper");
    const made = readCard(store).filter((e) => e.dir === "/Recordings/").map((e) => e.name);
    expect(made, "both landed in the folder that was open").toEqual(["Deeper", "inner.urxf"]);
  });

  it("writes the settings under a new name, and brings them back", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    await store.set("ch.ch1.level", -12);
    await store.set("setup.brightness", 3);
    await flush();
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");
    expect(names(shell)).toEqual(["Recordings", "mine.urxf", "take.wav"]);

    await store.set("ch.ch1.level", 5);
    await store.set("setup.brightness", 8);
    await store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Load")?.click();
    await okDialog(shell);
    await flush();
    expect([store.num("ch.ch1.level", 0), store.num("setup.brightness", 0)]).toEqual([-12, 3]);
  });

  it("leaves the clock where it stands when settings come back", async () => {
    // The file is written with the clock set a year on; the clock is then set back before loading.
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    await setClock(store, { year: 2027, month: 9, day: 21, hour: 12, minute: 0 });
    await store.set("setup.dateTime.timeZone", "London");
    await flush();
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");

    await setClock(store, { year: 2026, month: 9, day: 21, hour: 12, minute: 0 });
    await store.set("setup.dateTime.timeZone", "Tokyo");
    await store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Load")?.click();
    await okDialog(shell);
    await flush();
    expect(clockParts(store).year, "the clock is not in the file").toBe(2026);
    expect(store.str("setup.dateTime.timeZone", ""), "the time zone is").toBe("London");
  });

  it("keeps what a settings file holds when it is renamed", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    await store.set("ch.ch1.level", -3);
    await flush();
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");

    await store.set("ui.sdSaveTab", "Edit");
    await store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Rename")?.click();
    await flush();
    await typeTitle(shell, "yours.urxf");
    expect(names(shell), "under its new name, where the card now sorts it").toEqual(["Recordings", "take.wav", "yours.urxf"]);

    await store.set("ch.ch1.level", 5);
    await store.set("ui.sdSaveTab", "Save/\nLoad");
    await store.set("sd.selectedFile", 2);
    await flush();
    action(shell, "Load")?.click();
    await okDialog(shell);
    await flush();
    expect(store.num("ch.ch1.level", 0), "the settings the file was saved with").toBe(-3);
  });

  it("leaves nothing free once the card is full", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [
      { name: "huge.wav", kind: "take", seconds: 10_000_000, tracks: 16, stamp: "", dir: "/" },
    ]);
    expect(freeBytes(shell.ctx.store)).toBe(0);
  });

  it("leaves Save and Load out of reach until a settings file is under the cursor", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const reach = (): boolean[] =>
      ["Save", "Save as", "Load"].map((l) => action(shell, l)?.classList.contains("is-disabled") === false);
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    expect(reach(), "a take is not a settings file").toEqual([false, true, false]);
    await writeCard(shell.ctx.store, [...card, { name: "a.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    expect(reach(), "the settings file the card sorts first").toEqual([true, true, true]);
  });

  it("leaves the card with nothing on it after a format", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");
    shell.ctx.nav.back();
    shell.ctx.nav.push({ id: "microsd.tools" });
    await flush();
    const free = freeBytes(shell.ctx.store);
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    await typeTitle(shell, "blank");
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      // The unit holds a modal up while it formats, and the card is as it was until it is done.
      expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Formatting in progress...");
      expect(shell.root.querySelector(".dialog-spinner"), "it waits on a ring").not.toBeNull();
      vi.advanceTimersByTime(1);
      expect(names(shell), "nothing gone while it runs").not.toEqual([]);
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(shell.root.querySelector(".dialog-overlay"), "the modal takes itself down").toBeNull();
    expect(shell.ctx.nav.current.id, "back on the Format screen").toBe("microsd.tools");
    expect(names(shell)).toEqual([]);
    expect(shell.ctx.store.str("sd.cardName", ""), "under the label typed").toBe("blank");
    expect(shell.root.querySelector(".tools-free")?.textContent).toBe("blank\n116.4GB Free");
    expect(freeBytes(shell.ctx.store), "and the room the takes held back").toBeGreaterThan(free);
    const held = shell.ctx.store.paths().filter((path) => path.startsWith("sd.file.") && shell.ctx.store.str(path, "") !== "");
    expect(held, "nothing of what the files held is left behind").toEqual([]);
  });

  it("asks for the volume label on the keyboard sheet, with the card's name in the field, and warns after [OK]", async () => {
    const shell = await mount({ id: "microsd.tools" }, card);
    const before = names(shell);
    const format = async (): Promise<void> => {
      shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
      await flush();
    };
    await format();
    expect(shell.root.querySelector(".dialog-overlay"), "nothing asked before the label").toBeNull();
    expect(shell.ctx.nav.current.id).toBe("microsd.name");
    expect(shell.root.querySelector(".pick-dialog-title")?.textContent).toBe("Volume Label");
    expect(shell.root.querySelector(".title-text")?.textContent).toBe("test");

    shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
    await flush();
    expect([shell.ctx.nav.current.id, names(shell)], "[Cancel] formats nothing").toEqual(["microsd.tools", before]);

    await format();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    // The unit's words and line breaks, in the dialog that warns.
    expect(shell.ctx.nav.current.id, "the warning stands over the Format screen").toBe("microsd.tools");
    expect(shell.root.querySelector(".dialog.is-caution .dialog-text")?.textContent).toBe(
      "Formatting will erase ALL data on this card.\nFormatting time depends on card capacity.\n(Approx. 3 minutes for 128GB)",
    );
    expect(shell.root.querySelector(".dialog.is-caution .dialog-mark svg")?.getAttribute("class")).toBe("icon-caution");
    expect([...shell.root.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "Cancel")?.click();
    await flush();
    expect([shell.ctx.nav.current.id, names(shell)], "[Cancel] on the warning formats nothing").toEqual(["microsd.tools", before]);

    // The other sheets the card screens open carry no heading.
    shell.ctx.nav.push({ id: "microsd.saveload" });
    await flush();
    action(shell, "Save as")?.click();
    await flush();
    expect(shell.root.querySelector(".pick-dialog-ok"), "the sheet is open").not.toBeNull();
    expect(shell.root.querySelector(".pick-dialog-title")).toBeNull();
  });

  it("takes eleven characters at most for the volume label, where the other card sheets take sixteen and none empty", async () => {
    const shell = await mount({ id: "microsd.tools" }, card);
    const typed = (): string => shell.root.querySelector(".title-text")?.textContent ?? "";
    const type = async (times: number): Promise<void> => {
      shell.root.querySelector<HTMLElement>(".title-clear")?.click();
      await flush();
      for (let i = 0; i < times; i++) {
        [...shell.root.querySelectorAll<HTMLElement>(".title-key")].find((k) => k.textContent === "a")?.click();
        await flush();
      }
    };
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    await type(12);
    expect(typed()).toBe("a".repeat(11));

    shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
    await flush();
    shell.ctx.nav.push({ id: "microsd.saveload" });
    await flush();
    action(shell, "Save as")?.click();
    await flush();
    await type(17);
    expect(typed()).toBe("a".repeat(16));
    // Nor do they go on empty, as the volume label does.
    shell.root.querySelector<HTMLElement>(".title-clear")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "[OK] on an empty field does nothing").toBe("microsd.name");
  });

  it("formats with the volume label left empty, under the name Untitled", async () => {
    const shell = await mount({ id: "microsd.tools" }, card);
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".title-clear")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    expect(shell.root.querySelector(".dialog.is-caution"), "[OK] on an empty field goes on to the warning").not.toBeNull();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(names(shell)).toEqual([]);
    // A card formatted with no label is read as Untitled, and Format offers that name next time.
    expect(shell.ctx.store.str("sd.cardName", "")).toBe("Untitled");
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    expect(shell.root.querySelector(".title-text")?.textContent).toBe("Untitled");
  });

  it("drops a format that is still running once the card goes, leaving the card as it was", async () => {
    const shell = await mount({ id: "home" }, card);
    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.tools" });
    await flush();
    const before = names(shell);
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
      expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Formatting in progress...");
      await shell.ctx.store.set("sd.mounted", false);
      for (let i = 0; i < 5; i++) await Promise.resolve();
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(shell.ctx.nav.current.id).toBe("microsd");
    expect(names(shell)).toEqual(before);
  });

  it("names the card and what it has left", async () => {
    const shell = await mount({ id: "microsd.tools" }, card);
    expect(shell.root.querySelector(".tools-free")?.textContent).toBe("test\n116.4GB Free");
  });
});
