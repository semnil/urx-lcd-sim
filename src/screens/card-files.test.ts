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
import { forget, restore } from "../app/persist";
import { pausePlayback, playedSeconds, recordTake, startPlayback, startRecorderClock, stopPlayback, stopTake } from "./recording";
import { openTitleEntry } from "./title-entry";

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
const cursorName = (shell: Shell): string | undefined => readCard(shell.ctx.store)[shell.ctx.store.num("sd.selectedFile", -1)]?.name;
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
    expect(take?.written).toEqual({ year: 2026, month: 9, day: 20, hour: 14, minute: 5, second: 26 });
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

  it("gives a take stopped at second 59 the first second of the next minute when the card already carries its name", async () => {
    const held: CardEntry = { name: "20261001_120059.wav", kind: "take", seconds: 5, tracks: 2, stamp: "", dir: "/" };
    const shell = await mount({ id: "microsd.recorder" }, [held]);
    const store = shell.ctx.store;
    // The clock stands at 12:00 on 1 October 2026 at the start, and the take stops 59 seconds on.
    await setClock(store, { year: 2026, month: 10, day: 1, hour: 12, minute: 0 }, 0);
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 59_000);
    await flush();
    expect(names(shell)).toEqual(["20261001_120059.wav", "20261001_120100.wav"]);
    expect(readCard(store)[1]?.written, "written at 12:00:59").toEqual({ year: 2026, month: 10, day: 1, hour: 12, minute: 0, second: 59 });
  });

  it("gives a take a name the card does not carry when every second of its minute is taken", async () => {
    const minute: CardEntry[] = Array.from({ length: 60 }, (_, s) => ({ name: `20261001_1200${String(s).padStart(2, "0")}.wav`, kind: "take", seconds: 5, tracks: 2, stamp: "", dir: "/" }));
    const shell = await mount({ id: "microsd.recorder" }, minute);
    const store = shell.ctx.store;
    await setClock(store, { year: 2026, month: 10, day: 1, hour: 12, minute: 0 }, 0);
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 20_000);
    await flush();
    expect(names(shell).length, "one take more").toBe(61);
    expect(new Set(names(shell)).size, "no name twice").toBe(61);
    expect(names(shell).at(-1)).toBe("20261001_120100.wav");
  });

  it("gives a take the next second when the card carries the name its own second gives in other case", async () => {
    const held: CardEntry = { name: "20260920_140526.WAV", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" };
    const shell = await mount({ id: "microsd.recorder" }, [held]);
    const store = shell.ctx.store;
    await setClock(store, { year: 2026, month: 9, day: 20, hour: 14, minute: 5 }, 0);
    await store.set("sd.rec", "armed");
    recordTake(store, 1_000);
    stopTake(store, 26_000);
    await flush();
    expect(names(shell)).toEqual(["20260920_140526.WAV", "20260920_140527.wav"]);
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

  it("does nothing on [●] once the card has no room for a second of take", async () => {
    const shell = await mount({ id: "microsd.recorder" }, [{ name: "full.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    await store.set("sd.trackCount", 2);
    const second = 48_000 * 3 * 2;
    const press = async (capacity: number): Promise<string> => {
      await store.set("sd.capacity", capacity);
      await flush();
      shell.root.querySelector<HTMLElement>(".rec-rec")?.click();
      await flush();
      const rec = store.str("sd.rec", "");
      await store.set("sd.rec", "idle");
      return rec;
    };
    expect(await press(11 * second), "the control: room for a second").toBe("armed");
    expect(await press(10 * second + 1_000), "room for less than a second").toBe("idle");
    expect(await press(10 * second), "nothing free").toBe("idle");
    expect(shell.root.querySelector(".dialog-text"), "saying nothing").toBeNull();
  });

  it("leaves the Record tab's progress bar an empty groove whatever room the card has, recording or not", async () => {
    const shell = await mount({ id: "microsd.recorder" }, []);
    const store = shell.ctx.store;
    const bar = (): string | undefined => shell.root.querySelector(".rec-progress")?.outerHTML;
    const groove = '<div class="rec-progress"></div>';
    expect([shell.root.querySelector(".rec-slots") !== null, bar()], "an empty card, on the Record tab").toEqual([true, groove]);
    const free = freeBytes(store);
    await writeCard(store, [{ name: "full.wav", kind: "take", seconds: 10_000_000, tracks: 16, stamp: "", dir: "/" }]);
    await flush();
    expect([freeBytes(store) < free, freeBytes(store), bar()], "a full card").toEqual([true, 0, groove]);
    await writeCard(store, [{ name: "half.wav", kind: "take", seconds: 200_000, tracks: 2, stamp: "", dir: "/" }]);
    await store.set("sd.rec", "armed");
    recordTake(store);
    await flush();
    expect([store.str("sd.rec", ""), bar()], "a take recording").toEqual(["recording", groove]);
    stopTake(store);
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

  it("puts the sends into a bus on Pan Link where their sources are, whatever the loaded file holds", async () => {
    // A file saved while Pan Link left each send's own placing where it was.
    const shell = await mount({ id: "microsd.saveload" }, [{ name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    await store.set("ch.ch1.pan", -40);
    await store.set("ch.bus.mix1.panLink", true);
    await store.restore("ch.ch1.send.bus.mix1.balance", 21);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "linked");
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "linked.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(store.num("ch.ch1.send.bus.mix1.balance", 0)).toBe(-40);
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

  it("puts a GATE, COMP or DUCKER time an older settings file holds off its stops on the stop nearest it", async () => {
    // A file saved by an earlier version, with the times a detent up from where they ship by that version's steps.
    const shell = await mount({ id: "microsd.saveload" }, [{ name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    const times: [string, number][] = [
      ["ch.ch1.gate.hold", 16.3],
      ["ch.ch1.comp.attack", 34.68],
      ["ch.ch_5_6.ducker.decay", 1001],
      ["ch.ch1.ssmcs.comp.attack", 4.124],
    ];
    for (const [p, v] of times) await store.set(p, v);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "older");
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "older.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(times.map(([p]) => store.num(p, 0)), "each on its nearest stop, and the SSMCS strip's Attack as the file holds it").toEqual([16, 34.58, 1000, 4.124]);
  });

  it("stops at the end of the file and lets it go", async () => {
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
        "past its end: stopped, the counter cleared, the file let go",
      ).toEqual([false, 0, -1]);
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
    expect(ask(), "over a file that is already there").toBe("File already exists. Replace it?");
    await okDialog(shell);

    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");
    expect(ask(), "and under a name the card already carries").toBe("File already exists. Replace it?");
    await okDialog(shell);

    action(shell, "Load")?.click();
    await flush();
    expect(ask(), "loading asks nothing").toBeUndefined();
  });

  it("asks before [Save as] onto a folder of that name, and on [OK] leaves the folder as it is and writes nothing", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [
      { name: "cfg.urxf", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
      { name: "inside.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/cfg.urxf/" },
    ]);
    const store = shell.ctx.store;
    const before = readCard(store);
    const free = freeBytes(store);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "cfg");
    expect(shell.root.querySelector(".dialog-text")?.textContent, "asked as over a file").toBe("File already exists. Replace it?");
    expect(shell.root.querySelector(".dialog:not(.is-caution) .dialog-mark svg"), "under the information mark").not.toBeNull();
    expect([...shell.root.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
    await okDialog(shell);
    expect([readCard(store), freeBytes(store), store.str("sd.file./cfg.urxf", "")], "the folder kept, nothing written").toEqual([before, free, ""]);

    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "set");
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "set");
    await okDialog(shell);
    expect(readCard(store).map((e) => `${e.dir}${e.name}:${e.kind}`), "the control: [OK] writes over a settings file").toEqual(["/cfg.urxf:folder", "/set.urxf:data", "/cfg.urxf/inside.wav:take"]);
  });

  it("writes [Save] over the settings file the cursor stands on, not a folder of its name", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [
      { name: "x.urxf", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
      { name: "x.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" },
    ]);
    const store = shell.ctx.store;
    await store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Save")?.click();
    await flush();
    await okDialog(shell);
    const after = readCard(store);
    expect(after.map((e) => e.kind), "the folder kept, the file written").toEqual(["folder", "data"]);
    expect([after[1]?.written !== undefined, store.str("sd.file./x.urxf", "") !== "", store.num("sd.selectedFile", -1)], "the file the cursor stood on").toEqual([true, true, 1]);
  });

  it("writes [Save as] over a settings file whose name differs in case alone, without asking, under the name the file carries", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    const ask = (): string | null => shell.root.querySelector(".dialog-text")?.textContent ?? null;
    const saveAs = async (title: string): Promise<void> => {
      action(shell, "Save as")?.click();
      await flush();
      await typeTitle(shell, title);
    };
    await store.set("ch.ch1.level", -12);
    await saveAs("mix");
    await saveAs("mix");
    expect(ask(), "the control: the name spelt the same asks").toBe("File already exists. Replace it?");
    [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "Cancel")?.click();
    await flush();

    await store.set("ch.ch1.level", 5);
    await saveAs("MIX");
    expect(ask(), "spelt in other case, nothing asks").toBeNull();
    expect(readCard(store).filter((e) => e.kind === "data").map((e) => `${e.dir}${e.name}`), "one file, under the name it carried").toEqual(["/mix.urxf"]);
    expect(store.has("sd.file./MIX.urxf"), "nothing held under the name typed").toBe(false);
    await store.set("ch.ch1.level", 0);
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "mix.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(store.num("ch.ch1.level", 99), "the file holds what the second save wrote").toBe(5);
  });

  it("writes nothing and asks nothing on [Save as] under a folder's name in other case", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [{ name: "Cfg.urxf", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    const before = readCard(store);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "cfg");
    expect([shell.root.querySelector(".dialog-text")?.textContent ?? null, readCard(store), store.has("sd.file./cfg.urxf")], "the folder kept, nothing written").toEqual([null, before, false]);

    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "other");
    expect(names(shell), "the control: a name the folder does not carry").toEqual(["Cfg.urxf", "other.urxf"]);
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

  it("leaves the cursor on the last row left once RECORDER's Edit tab deletes the last row, with Delete and Rename in reach", async () => {
    const takes: CardEntry[] = ["a.wav", "b.wav", "c.wav"].map((name) => ({ name, kind: "take", seconds: 20, tracks: 2, stamp: "", dir: "/" }));
    const shell = await mount({ id: "microsd.recorder" }, takes);
    await shell.ctx.store.set("ui.sdTab", "Edit");
    await shell.ctx.store.set("sd.selectedFile", 2);
    await flush();
    action(shell, "Delete")?.click();
    await flush();
    await okDialog(shell);
    expect(names(shell)).toEqual(["a.wav", "b.wav"]);
    expect(shell.ctx.store.num("sd.selectedFile", -1)).toBe(1);
    expect(["Delete", "Rename"].map((l) => action(shell, l)?.classList.contains("is-disabled"))).toEqual([false, false]);
  });

  it("renames the entry the cursor stands on", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    await shell.ctx.store.set("ui.sdSaveTab", "Edit");
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Rename")?.click();
    await flush();
    await typeTitle(shell, "keeper");
    expect(names(shell)).toEqual(["Recordings", "keeper.wav"]);
    expect(cursorName(shell), "the cursor stays on it").toBe("keeper.wav");
  });

  it("keeps the cursor on the file it stood on when a new file or folder sorts ahead of it", async () => {
    const shell = await mount({ id: "microsd.saveload" }, []);
    const store = shell.ctx.store;
    const saveAs = async (title: string, level: number): Promise<void> => {
      await store.set("ch.ch1.level", level);
      action(shell, "Save as")?.click();
      await flush();
      await typeTitle(shell, title);
    };
    await saveAs("b", -30);
    await saveAs("c", -10);
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "c.urxf"));
    await flush();

    await saveAs("a", -20);
    expect([names(shell), cursorName(shell)], "after [Save as] a").toEqual([["a.urxf", "b.urxf", "c.urxf"], "c.urxf"]);
    await store.set("ui.sdSaveTab", "Edit");
    await flush();
    action(shell, "New folder")?.click();
    await flush();
    await typeTitle(shell, "Z");
    expect([names(shell), cursorName(shell)], "after [New folder] Z").toEqual([["Z", "a.urxf", "b.urxf", "c.urxf"], "c.urxf"]);
    const lit = [...shell.root.querySelectorAll(".sd-list .list-row.is-selected .list-cell")].map((c) => c.textContent);
    expect(lit[1], "the row drawn under the cursor").toBe("c.urxf");

    await store.set("ui.sdSaveTab", "Save/\nLoad");
    await store.set("ch.ch1.level", 0);
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(store.num("ch.ch1.level", 99), "[Load] brings back c.urxf").toBe(-10);
  });

  it("renames nothing onto a name the folder already carries, saying so and going back to the sheet as it was typed", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    const saveAs = async (title: string, level: number): Promise<void> => {
      await store.set("ch.ch1.level", level);
      action(shell, "Save as")?.click();
      await flush();
      await typeTitle(shell, title);
    };
    await saveAs("a", -5);
    await saveAs("b", -30);
    await store.set("ui.sdSaveTab", "Edit");
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "b.urxf"));
    await flush();
    action(shell, "Rename")?.click();
    await flush();
    await typeTitle(shell, "a");
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("File already exists.");
    expect(shell.root.querySelector(".dialog:not(.is-caution) .dialog-mark svg"), "under the information mark").not.toBeNull();
    expect([...shell.root.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent), "[OK] alone").toEqual(["OK"]);
    expect(names(shell), "nothing renamed").toEqual(["Recordings", "a.urxf", "b.urxf", "take.wav"]);

    await okDialog(shell);
    expect(shell.root.querySelector(".dialog-overlay"), "[OK] takes the dialog down").toBeNull();
    expect([shell.ctx.nav.current.id, shell.root.querySelector(".title-text")?.textContent], "back on the sheet, the name as it was typed").toEqual([
      "microsd.name",
      "a",
    ]);
    shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
    await flush();
    await store.set("ui.sdSaveTab", "Save/\nLoad");
    const loads: number[] = [];
    for (const name of ["a.urxf", "b.urxf"]) {
      await store.set("ch.ch1.level", 0);
      await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === name));
      await flush();
      action(shell, "Load")?.click();
      await flush();
      await flush();
      loads.push(store.num("ch.ch1.level", 99));
    }
    expect(loads, "each file still holds what it was saved with").toEqual([-5, -30]);
  });

  it("renames nothing onto a name another entry of the folder carries in other case, a file's or a folder's", async () => {
    const data = (name: string): CardEntry => ({ name, kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" });
    const shell = await mount({ id: "microsd.saveload" }, [{ name: "SUB.urxf", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }, data("b.urxf"), data("mix.urxf")]);
    const store = shell.ctx.store;
    await store.set("ui.sdSaveTab", "Edit");
    const before = readCard(store);
    const rename = async (title: string): Promise<string | null> => {
      await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "b.urxf"));
      await flush();
      action(shell, "Rename")?.click();
      await flush();
      await typeTitle(shell, title);
      const said = shell.root.querySelector(".dialog-text")?.textContent ?? null;
      if (said !== null) {
        await okDialog(shell);
        shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
        await flush();
      }
      return said;
    };
    for (const title of ["MIX", "sub"]) {
      expect(await rename(title), `${title}: said`).toBe("File already exists.");
      expect(readCard(store), `${title}: nothing renamed`).toEqual(before);
    }

    expect(await rename("c"), "the control: a name the folder does not carry").toBeNull();
    expect(names(shell)).toEqual(["SUB.urxf", "c.urxf", "mix.urxf"]);
  });

  it("renames nothing onto a name typed as a folder of the folder carries it, in any case, the extension aside", async () => {
    const data = (name: string): CardEntry => ({ name, kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" });
    const shell = await mount({ id: "microsd.saveload" }, [
      { name: "Fold", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
      { name: "Inner", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/Fold/" },
      data("b.urxf"),
      data("mix.urxf"),
    ]);
    const store = shell.ctx.store;
    await store.set("ui.sdSaveTab", "Edit");
    const before = readCard(store);
    const rename = async (title: string): Promise<[string | null, string | null | undefined]> => {
      await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "b.urxf"));
      await flush();
      action(shell, "Rename")?.click();
      await flush();
      await typeTitle(shell, title);
      const said = shell.root.querySelector(".dialog-text")?.textContent ?? null;
      if (said === null) return [said, null];
      await okDialog(shell);
      const field = shell.ctx.nav.current.id === "microsd.name" ? shell.root.querySelector(".title-text")?.textContent : null;
      shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
      await flush();
      return [said, field];
    };
    for (const title of ["fold", "Fold"]) {
      expect(await rename(title), `${title}: said, and [OK] back on the sheet as it was typed`).toEqual(["File already exists.", title]);
      expect(readCard(store), `${title}: nothing renamed`).toEqual(before);
    }

    expect(await rename("inner"), "the control: a name a folder elsewhere carries").toEqual([null, null]);
    expect(names(shell)).toEqual(["Fold", "inner.urxf", "mix.urxf", "Inner"]);
  });

  it("renames a file onto its own name in other case", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [{ name: "Fold", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    await store.set("ch.ch1.level", -25);
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "b");
    await store.set("ui.sdSaveTab", "Edit");
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "b.urxf"));
    await flush();
    action(shell, "Rename")?.click();
    await flush();
    await typeTitle(shell, "B");
    expect([shell.root.querySelector(".dialog-text")?.textContent ?? null, shell.ctx.nav.current.id, names(shell)], "nothing said, back on Edit, renamed").toEqual([
      null,
      "microsd.saveload",
      ["Fold", "B.urxf"],
    ]);

    await store.set("ui.sdSaveTab", "Save/\nLoad");
    await store.set("ch.ch1.level", 0);
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "B.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(store.num("ch.ch1.level", 99), "the file holds what it was saved with").toBe(-25);
  });

  it("renames no take on RECORDER's Edit tab onto a name the folder already carries", async () => {
    const take = (name: string): CardEntry => ({ name, kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" });
    const shell = await mount({ id: "microsd.recorder" }, [take("x.wav"), take("y.wav")]);
    await shell.ctx.store.set("ui.sdTab", "Edit");
    await shell.ctx.store.set("sd.selectedFile", 1);
    await flush();
    action(shell, "Rename")?.click();
    await flush();
    await typeTitle(shell, "x");
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("File already exists.");
    await okDialog(shell);
    expect(shell.ctx.nav.current.id).toBe("microsd.name");
    expect(names(shell)).toEqual(["x.wav", "y.wav"]);

    await typeTitle(shell, "z");
    expect(names(shell), "the control: a name the folder does not carry").toEqual(["x.wav", "z.wav"]);
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

  it("makes no folder under a name the folder already carries, a folder's or a file's, in any case, saying `Directory already exists.` over the sheet as it was typed", async () => {
    const shell = await mount({ id: "microsd.saveload" }, [...card, { name: "mix.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const store = shell.ctx.store;
    await store.set("ui.sdSaveTab", "Edit");
    await flush();
    const before = readCard(store);
    const made = async (name: string): Promise<[string, string, string | null]> => {
      action(shell, "New folder")?.click();
      await flush();
      await typeTitle(shell, name);
      return [shell.ctx.nav.current.id, store.str("ui.sdSaveTab", ""), shell.root.querySelector(".dialog-text")?.textContent ?? null];
    };
    // A folder's name and a file's, each spelt the same and in other case.
    for (const name of ["Recordings", "RECORDINGS", "take.wav", "Take.WAV", "mix.urxf", "MIX.urxf"]) {
      expect((await made(name))[2], `${name}: said`).toBe("Directory already exists.");
      expect(shell.root.querySelector(".dialog:not(.is-caution) .dialog-mark svg"), `${name}: under the information mark`).not.toBeNull();
      expect([...shell.root.querySelectorAll(".dialog-actions .btn")].map((b) => b.textContent), `${name}: [OK] alone`).toEqual(["OK"]);
      expect(readCard(store), `${name}: nothing made`).toEqual(before);
      await okDialog(shell);
      expect(
        [shell.root.querySelector(".dialog-overlay"), shell.ctx.nav.current.id, shell.root.querySelector(".title-text")?.textContent, readCard(store)],
        `${name}: [OK] goes back to the sheet as it was typed, making nothing`,
      ).toEqual([null, "microsd.name", name, before]);
      shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
      await flush();
    }

    expect(await made("Takes"), "the control: a name the folder does not carry goes back to Edit").toEqual(["microsd.saveload", "Edit", null]);
    expect(names(shell)).toEqual(["Recordings", "Takes", "mix.urxf", "take.wav"]);
    await store.set("sd.path", "/Recordings/");
    await flush();
    expect(await made("Recordings"), "a name another folder carries").toEqual(["microsd.saveload", "Edit", null]);
    expect(readCard(store).filter((e) => e.kind === "folder").map((e) => `${e.dir}${e.name}`)).toEqual(["/Recordings", "/Takes", "/Recordings/Recordings"]);
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

  it("prints the day each file was written in the order DATE / TIME's Display Format is set to now, over the time on the 24-hour clock", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(1_800_000_000_000);
      // A take whose moment the card kept as the list printed it.
      const shell = await mount({ id: "microsd.saveload" }, [{ name: "kept.wav", kind: "take", seconds: 10, tracks: 2, stamp: "04/30/2026\n15:29:28", dir: "/" }]);
      const store = shell.ctx.store;
      await setClock(store, { year: 2026, month: 10, day: 1, hour: 22, minute: 5 });
      vi.setSystemTime(Date.now() + 7_000);
      const column = (): Record<string, string> =>
        Object.fromEntries(
          [...shell.root.querySelectorAll(".sd-list .list-row")].map((r) => [...r.querySelectorAll(".list-cell")].map((c) => c.textContent ?? "")).map((c) => [c[1], c[2]]),
        );
      action(shell, "Save as")?.click();
      await flush();
      await typeTitle(shell, "first");
      expect(column(), "the control: the formats the unit ships with").toEqual({ "first.urxf": "10/01/2026\n22:05:07", "kept.wav": "04/30/2026\n15:29:28" });

      await store.set("setup.dateTime.dateFormat", "DD/MM/YYYY");
      await store.set("setup.dateTime.timeFormat", "12h");
      await flush();
      action(shell, "Save as")?.click();
      await flush();
      await typeTitle(shell, "second");
      expect(column(), "day first, both files, the hour still on 24").toEqual({
        "first.urxf": "01/10/2026\n22:05:07",
        "kept.wav": "04/30/2026\n15:29:28",
        "second.urxf": "01/10/2026\n22:05:07",
      });

      await store.set("setup.dateTime.dateFormat", "YYYY/MM/DD");
      await flush();
      expect(column()["first.urxf"], "year first").toBe("2026/10/01\n22:05:07");
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves a scene number the settings file holds nothing under empty once the file is loaded", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    const storeUnder = async (no: number, title: string): Promise<void> => {
      shell.ctx.nav.push({ id: "scene.list" });
      await store.set("scene.selected", no);
      await flush();
      [...shell.root.querySelectorAll<HTMLElement>(".scene-actions .btn")].find((b) => b.textContent === "Store")?.click();
      await flush();
      await typeTitle(shell, title);
      shell.ctx.nav.back();
      await flush();
    };
    const listed = async (): Promise<Record<string, string>> => {
      shell.ctx.nav.push({ id: "scene.list" });
      await flush();
      const titles = Object.fromEntries(
        [...shell.root.querySelectorAll(".scene-list .list-row")].map((r) => [...r.querySelectorAll(".list-cell")].map((c) => c.textContent ?? "")).map(([no, title]) => [no, title]),
      );
      shell.ctx.nav.back();
      await flush();
      return { "03": titles["03"] ?? "?", "05": titles["05"] ?? "?" };
    };
    await storeUnder(3, "EARLY");
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "A");

    await storeUnder(5, "LATER");
    await store.set("scene.Standard.5.protect", 1);
    await store.set("scene.Standard.3.title", "RENAMED");
    expect(await listed(), "before [Load]").toEqual({ "03": "RENAMED", "05": "LATER" });

    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "A.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(
      [store.str("scene.Standard.5.title", "?"), store.str("scene.Standard.5.state", "?").length, store.num("scene.Standard.5.protect", -1)],
      "05, stored after the file was written: its title, the length of its mixer, and its protection",
    ).toEqual(["", 0, 0]);
    expect(await listed(), "SCENE LIST after [Load]: 03 as the file holds it, 05 empty").toEqual({ "03": "EARLY", "05": "" });
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

  it("takes the recorder down to the tracks the sampling frequency a settings file brings can carry", async () => {
    // A settings file holds the frequency and not the track count: Load meets the recorder's own count with the file's frequency.
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    const open = async (...routes: Route[]): Promise<void> => {
      shell.ctx.nav.home();
      for (const route of routes) shell.ctx.nav.push(route);
      await flush();
    };
    const rate = async (label: string): Promise<void> => {
      await open({ id: "setup" }, { id: "setup.rate" });
      [...shell.root.querySelectorAll<HTMLElement>(".rate-btn")].find((b) => b.textContent === label)?.click();
      await flush();
    };
    const held = (): number[] => [store.num("setup.samplingFrequency", 0), store.num("sd.trackCount", 0)];
    await rate("192kHz");
    await open({ id: "microsd" }, { id: "microsd.saveload" });
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "fast");

    await rate("48kHz");
    await open({ id: "microsd" }, { id: "microsd.recorder" });
    shell.root.querySelector<HTMLElement>(".dropdown-box")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "16 Tracks")?.click();
    await flush();
    expect(held(), "the recorder at 48 kHz, raised to sixteen tracks").toEqual([48_000, 16]);

    await open({ id: "microsd" }, { id: "microsd.saveload" });
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "fast.urxf"));
    await flush();
    action(shell, "Load")?.click();
    await flush();
    await flush();
    expect(held(), "the file's 192 kHz carries two").toEqual([192_000, 2]);
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
    await typeTitle(shell, "yours");
    expect(names(shell), "under its new name, where the card now sorts it").toEqual(["Recordings", "take.wav", "yours.urxf"]);
    expect(cursorName(shell), "the cursor goes with it").toBe("yours.urxf");

    await store.set("ch.ch1.level", 5);
    await store.set("ui.sdSaveTab", "Save/\nLoad");
    await flush();
    action(shell, "Load")?.click();
    await okDialog(shell);
    await flush();
    expect(store.num("ch.ch1.level", 0), "the settings the file was saved with").toBe(-3);
  });

  it("sorts the card's names in one order, whatever language the browser runs in", async () => {
    const shell = await mount({ id: "microsd.saveload" });
    const store = shell.ctx.store;
    const sorted = async (...names: string[]): Promise<string[]> => {
      await writeCard(store, names.map((name) => ({ name, kind: "data", seconds: 0, tracks: 0, dir: "/" })));
      return readCard(store).map((e) => e.name);
    };
    const sortedFolders = async (...dirs: string[]): Promise<string[]> => {
      await writeCard(store, dirs.map((dir) => ({ name: "a.urxf", kind: "data", seconds: 0, tracks: 0, dir })));
      return readCard(store).map((e) => e.dir);
    };
    const own = String.prototype.localeCompare;
    // A comparison that names no language takes the one given here, as a browser running in it does.
    for (const language of [undefined, "lt", "da"]) {
      vi.spyOn(String.prototype, "localeCompare").mockImplementation(function (this: string, that: string, locales?: Intl.LocalesArgument, options?: Intl.CollatorOptions) {
        return own.call(this, that, locales ?? language, options);
      });
      expect([await sorted("Y", "J"), await sorted("Zz", "Aa"), await sorted("yours.urxf", "take.wav"), await sortedFolders("/Y/", "/J/")], language ?? "the language the tests run in").toEqual([
        ["J", "Y"],
        ["Aa", "Zz"],
        ["take.wav", "yours.urxf"],
        ["/J/", "/Y/"],
      ]);
      vi.restoreAllMocks();
    }
  });

  it("keeps apart what two settings files of one name in two folders hold", async () => {
    const shell = await mount({ id: "microsd.saveload" }, card);
    const store = shell.ctx.store;
    const saveAs = async (title: string): Promise<void> => {
      action(shell, "Save as")?.click();
      await flush();
      await typeTitle(shell, title);
    };
    const select = async (dir: string): Promise<void> => {
      await store.set("sd.path", dir);
      await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.dir === dir && e.name === "mine.urxf"));
      await flush();
    };
    const load = async (dir: string): Promise<number> => {
      await store.set("ui.sdSaveTab", "Save/\nLoad");
      await store.set("ch.ch1.level", 0);
      await select(dir);
      action(shell, "Load")?.click();
      await flush();
      await flush();
      return store.num("ch.ch1.level", 99);
    };
    await store.set("ch.ch1.level", -12);
    await saveAs("mine");
    await store.set("sd.path", "/Recordings/");
    await store.set("ch.ch1.level", 5);
    await flush();
    await saveAs("mine");
    expect(readCard(store).filter((e) => e.name === "mine.urxf").map((e) => e.dir)).toEqual(["/", "/Recordings/"]);
    expect([await load("/"), await load("/Recordings/")], "each brings back what it was saved with").toEqual([-12, 5]);

    await store.set("ui.sdSaveTab", "Edit");
    await select("/Recordings/");
    action(shell, "Delete")?.click();
    await flush();
    await okDialog(shell);
    expect(readCard(store).filter((e) => e.name === "mine.urxf").map((e) => e.dir)).toEqual(["/"]);
    expect(await load("/"), "the file left in the root still holds its own").toBe(-12);
  });

  it("brings back what a settings file held where the browser kept it under the file's name alone", async () => {
    // A unit stored while a settings file's contents were kept under its name, whatever folder held it.
    const file = (dir: string): CardEntry => ({ name: "mine.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir });
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({
        version: 1,
        model: "URX44V",
        values: {
          "sd.card": JSON.stringify([{ name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }, file("/"), file("/Recordings/")]),
          "sd.file.mine.urxf": JSON.stringify({ "ch.ch1.level": -12 }),
        },
      }),
    );
    try {
      const model = unitById("URX44V");
      const store = new DeviceStore();
      await store.attach(new SimTransport(factoryState(model)));
      await restore(store, "URX44V");
      const shell = new Shell(buildRegistry(), store, model);
      shell.ctx.nav.push({ id: "microsd.saveload" });
      await flush();
      expect(store.has("sd.file.mine.urxf"), "the old place is not put back").toBe(false);
      for (const dir of ["/", "/Recordings/"]) {
        await store.set("ch.ch1.level", 0);
        await store.set("sd.path", dir);
        await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.dir === dir && e.name === "mine.urxf"));
        await flush();
        action(shell, "Load")?.click();
        await flush();
        await flush();
        expect(store.num("ch.ch1.level", 99), dir).toBe(-12);
      }
    } finally {
      forget();
    }
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
    // The browser is open on /Recordings/ with the cursor on the file saved there.
    await shell.ctx.store.set("sd.path", "/Recordings/");
    action(shell, "Save as")?.click();
    await flush();
    await typeTitle(shell, "mine");
    await shell.ctx.store.set("sd.selectedFile", 2);
    expect(names(shell), "the card before the format").toEqual(["Recordings", "take.wav", "mine.urxf"]);
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
    expect([shell.ctx.store.str("sd.path", ""), shell.ctx.store.num("sd.selectedFile", -1)], "the browser back at the root with the cursor at the top").toEqual(["/", 0]);
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

  it("names the sheet's field by what it takes: the volume label, a name on the card, or a scene's title", async () => {
    const shell = await mount({ id: "microsd.tools" }, card);
    /** The name assistive technology reads for the sheet's field: the nodes it is labelled by, or its label. */
    const fieldName = (): string => {
      const field = shell.root.querySelector(".title-field");
      const by = field?.getAttribute("aria-labelledby");
      if (by) return by.split(" ").map((id) => shell.root.querySelector(`#${id}`)?.textContent ?? `<missing ${id}>`).join(" ");
      return field?.getAttribute("aria-label") ?? "";
    };
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    expect(fieldName(), "under the sheet's heading").toBe("Volume Label");
    [...shell.root.querySelectorAll<HTMLElement>(".title-key")].find((k) => k.textContent === "a")?.click();
    await flush();
    expect(fieldName(), "and still once a key has drawn the sheet again").toBe("Volume Label");
    shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
    await flush();

    shell.ctx.nav.push({ id: "microsd.saveload" });
    await flush();
    const opened: string[] = [];
    for (const [tab, label] of [["Save/\nLoad", "Save as"],["Edit", "Rename"], ["Edit", "New folder"]] as const) {
      await shell.ctx.store.set("ui.sdSaveTab", tab);
      await shell.ctx.store.set("sd.selectedFile", 1);
      await flush();
      action(shell, label)?.click();
      await flush();
      opened.push(`${label}: ${shell.ctx.nav.current.id} ${fieldName()}`);
      shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
      await flush();
    }
    expect(opened, "a name on the card").toEqual(["Save as: microsd.name Name", "Rename: microsd.name Name", "New folder: microsd.name Name"]);

    openTitleEntry(shell.ctx, "scene.a.1.title", "");
    await flush();
    expect([shell.ctx.nav.current.id, fieldName()], "a scene's title").toEqual(["scene.title", "Title"]);
  });

  it("takes eleven characters at most for the volume label, where [Save as] takes fourteen and does not go on empty", async () => {
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
    await type(15);
    expect(typed()).toBe("a".repeat(14));
    // Nor does it go on empty, as the volume label does.
    shell.root.querySelector<HTMLElement>(".title-clear")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    expect(shell.ctx.nav.current.id, "[OK] on an empty field does nothing").toBe("microsd.name");
  });

  describe("the name sheet a card screen opens", () => {
    const tapKey = async (shell: Shell, face: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".title-key")].find((k) => k.textContent === face || k.getAttribute("aria-label") === face)?.click();
      await flush();
    };
    const field = (shell: Shell): [string, string | null] => [
      shell.root.querySelector(".title-text")?.textContent ?? "",
      shell.root.querySelector(".title-suffix")?.textContent ?? null,
    ];
    const draft = async (shell: Shell, text: string): Promise<void> => {
      await shell.ctx.store.set("ui.titleEntry.text", text);
      await shell.ctx.store.set("ui.titleEntry.cursor", text.length);
      await flush();
    };

    it("opens a take the recorder named on its name alone, the extension beside the field, and puts the extension back on [OK]", async () => {
      const take: CardEntry = { name: "20261001_123456.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" };
      const shell = await mount({ id: "microsd.recorder" }, [take]);
      await shell.ctx.store.set("ui.sdTab", "Edit");
      await shell.ctx.store.set("sd.selectedFile", 0);
      await flush();
      action(shell, "Rename")?.click();
      await flush();
      expect(field(shell)).toEqual(["20261001_123456", ".wav"]);
      // One digit retyped.
      await tapKey(shell, "Backspace");
      await tapKey(shell, "123");
      await tapKey(shell, "7");
      expect(field(shell)).toEqual(["20261001_123457", ".wav"]);
      shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
      await flush();
      expect(names(shell)).toEqual(["20261001_123457.wav"]);
    });

    it("writes a settings file under fourteen characters at most, `.urxf` standing beside the field", async () => {
      const shell = await mount({ id: "microsd.saveload" }, []);
      action(shell, "Save as")?.click();
      await flush();
      expect(field(shell), "opened empty").toEqual(["", ".urxf"]);
      await draft(shell, "a".repeat(13));
      await tapKey(shell, "b");
      await tapKey(shell, "c");
      expect(field(shell), "the fifteenth key changes nothing").toEqual([`${"a".repeat(13)}b`, ".urxf"]);
      shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
      await flush();
      expect(names(shell)).toEqual([`${"a".repeat(13)}b.urxf`]);
    });

    it("takes 255 characters for a name with its extension on [Rename], and 255 for a folder on [New folder]", async () => {
      const file = (name: string, kind: CardEntry["kind"]): CardEntry => ({ name, kind, seconds: 0, tracks: kind === "take" ? 2 : 0, stamp: "", dir: "/" });
      const shell = await mount({ id: "microsd.saveload" }, [file("mine.urxf", "data"), file("take.wav", "take")]);
      await shell.ctx.store.set("ui.sdSaveTab", "Edit");
      const typedTo = async (open: () => Promise<void>, length: number): Promise<number> => {
        await open();
        await draft(shell, "a".repeat(length - 1));
        await tapKey(shell, "b");
        await tapKey(shell, "c");
        const text = field(shell)[0];
        shell.root.querySelector<HTMLElement>(".pick-dialog-cancel")?.click();
        await flush();
        return text.endsWith("b") ? text.length : -1;
      };
      const rename = (row: number) => async (): Promise<void> => {
        await shell.ctx.store.set("sd.selectedFile", row);
        await flush();
        action(shell, "Rename")?.click();
        await flush();
      };
      const newFolder = async (): Promise<void> => {
        action(shell, "New folder")?.click();
        await flush();
      };
      expect([await typedTo(rename(0), 250), await typedTo(rename(1), 251), await typedTo(newFolder, 255)], ".urxf, .wav, a folder").toEqual([250, 251, 255]);
      await newFolder();
      expect(field(shell), "a folder carries no extension").toEqual(["", null]);
    });

    it("lays out the card's own number and symbol keys, and takes from a browser's keyboard only what they type", async () => {
      const shell = await mount({ id: "microsd.saveload" }, []);
      action(shell, "Save as")?.click();
      await flush();
      const faces = (): string[] => [...shell.root.querySelectorAll(".title-key")].map((k) => k.textContent ?? "");
      const placed = (face: string): string =>
        [...shell.root.querySelectorAll<HTMLElement>(".title-key")].find((k) => k.textContent === face)?.style.gridColumn ?? "";
      await tapKey(shell, "123");
      expect(faces().slice(0, 10).join("")).toBe("1234567890");
      expect(faces().slice(10, 15).join("")).toBe("-;()&");
      expect(faces().slice(15, 21), "#+-, four marks and backspace").toEqual(["#+-", ...".,!'", ""]);
      expect(faces()[21]).toBe("ABC");
      expect([placed("-"), placed(",")], "the shorter rows centred, as the title's rows stand").toEqual(["11 / span 4", "15 / span 4"]);
      await tapKey(shell, "#+-");
      expect(faces().slice(0, 9).join("")).toBe("[]{}#%^+=");
      expect(faces().slice(9, 12).join("")).toBe("_~$");
      expect(faces().slice(12, 18), "123, four marks and backspace").toEqual(["123", ...".,!'", ""]);
      expect([placed("["), placed("_")]).toEqual(["3 / span 4", "15 / span 4"]);

      for (const key of ["/", ":", "*", "?", "\"", "<", ">", "|", "\\", "-"]) {
        shell.root.querySelector<HTMLElement>(".title-field")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        await flush();
      }
      expect(field(shell)[0], "the marks the card's keys do not carry are left alone").toBe("-");
    });
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

  it("holds the screen out of reach while Format runs, so nothing under the modal can leave it", async () => {
    const shell = await mount({ id: "home" }, card);
    shell.ctx.nav.openTop({ id: "microsd" });
    shell.ctx.nav.push({ id: "microsd.tools" });
    await flush();
    shell.root.querySelector<HTMLElement>(".tools-screen .btn")?.click();
    await flush();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
      for (let i = 0; i < 5; i++) await Promise.resolve();
      expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Formatting in progress...");
      const controls = [...shell.root.querySelectorAll<HTMLElement>(".toolbar button, .side button, .main button")];
      expect(controls.map((n) => n.getAttribute("aria-label") ?? n.textContent), "the toolbar's way out is under it").toEqual(
        expect.arrayContaining(["Back", "HOME", "Format microSD"]),
      );
      expect(controls.filter((n) => !n.closest("[inert]")).map((n) => n.getAttribute("aria-label") ?? n.textContent), "and none of them answers").toEqual([]);
      vi.advanceTimersByTime(60_000);
    } finally {
      vi.useRealTimers();
    }
    await flush();
    expect(names(shell), "the format went through").toEqual([]);
    expect(shell.root.querySelectorAll("[inert]").length, "and the screen is back once the modal is down").toBe(0);
  });

  it("names the card and what it has left", async () => {
    const shell = await mount({ id: "microsd.tools" }, card);
    expect(shell.root.querySelector(".tools-free")?.textContent).toBe("test\n116.4GB Free");
  });
});
