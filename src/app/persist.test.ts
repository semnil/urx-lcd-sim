import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import type { CardEntry } from "../model/card";
import { filePath, writeCard } from "../model/card";
import { captureScene } from "../model/scene-state";
import { captureSettings } from "../model/settings-file";
import type { ModelId } from "../model/types";
import { unitById } from "../model/units";
import { toJson } from "../device/value-json";
import { type FakeIndexedDb, fakeIndexedDb } from "./fake-indexeddb";
import {
  type From,
  type Keeper,
  type Kept,
  modelOf,
  openKeeper,
  openKept,
  persisted,
  readUnit,
  restore,
  type Saving,
  snapshot,
  startSaving,
} from "./persist";

// The unit comes back as it was left, and what it was doing does not.

const MODEL = "URX44V";

/** A timer of the page's own, which a test's fake timers leave alone. */
const later = globalThis.setTimeout.bind(globalThis);

async function unit(model: ModelId = MODEL): Promise<DeviceStore> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById(model))));
  return store;
}

/** The browser's IndexedDB, fresh for each test and shared by the tabs it starts. */
let idb: FakeIndexedDb;
let keeper: Keeper;
/** The savings a test started, stopped after it. */
let started: Saving[] = [];

beforeEach(() => {
  idb = fakeIndexedDb();
  keeper = openKeeper(idb.factory) as Keeper;
});

afterEach(() => {
  for (const saving of started) saving.stop();
  started = [];
  window.localStorage.clear();
  vi.useRealTimers();
});

/** Runs what the browser has to run, and lets a tab hear what another told it. */
async function settle(): Promise<void> {
  await idb.idle();
  await new Promise((resolve) => later(resolve, 5));
  await idb.idle();
}

/** The values the browser holds for `model`. */
async function stored(model: string = MODEL): Promise<Record<string, unknown> | null> {
  return readUnit(await keeper.read(), model);
}

/** A tab's saving, how many times it was told another tab stored the unit, and whether the browser took each write. */
interface Tab {
  saving: Saving;
  told: () => number;
  took: boolean[];
}

/** A tab started on what the browser holds now, as the page starts one. */
async function start(store: DeviceStore, model: string = MODEL, from: Partial<From> = {}, delayMs = 10): Promise<Tab> {
  const { kept } = await openKept(keeper);
  let told = 0;
  const took: boolean[] = [];
  const saving = startSaving(store, model, delayMs, (k) => took.push(k), () => told++, { keeper, kept, ...from });
  started.push(saving);
  return { saving, told: () => told, took };
}

/** Bring back into `store` what the next start brings back for `model`. */
async function bring(store: DeviceStore, model: ModelId = MODEL): Promise<void> {
  await restore(store, model, (await openKept(keeper)).kept);
}

/** How many times the unit has been written out as text since `JSON.stringify` was spied on. */
function unitTexts(stringify: { mock: { calls: unknown[][] } }): number {
  return stringify.mock.calls.filter(([value]) => typeof value === "object" && value !== null && "values" in value && "version" in value).length;
}

describe("what a reload carries over", () => {
  it("leaves out what the unit was doing at that moment", () => {
    for (const path of ["ch.ch1.level", "setup.brightness", "sd.card", "ui.selectedStrip", "ui.eqBand", "scene.Standard.1.state"]) {
      expect(persisted(path), path).toBe(true);
    }
    for (const path of ["sd.rec", "sd.playing", "sd.playSeconds", "sd.playingFile", "ui.titleEntry.text", "ui.dateTimeDraft.hour"]) {
      expect(persisted(path), path).toBe(false);
    }
  });

  it("leaves out the result of a card test, as a unit switched off does", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store);
    await store.set("ui.sdToolsTab", "Test");
    await store.set("sd.tested", true);
    vi.advanceTimersByTime(20);
    await settle();
    saving.stop();

    const next = await unit();
    await bring(next);
    expect([next.str("ui.sdToolsTab", ""), next.bool("sd.tested", false)], "the tab back, and no result on it").toEqual(["Test", false]);
  });

  it("brings the values back on the next start", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store);
    await store.set("ch.ch1.level", -9);
    await store.set("ch.ch1.name", "Kick");
    await store.set("setup.brightness", 3);
    await store.set("sd.rec", "recording");
    vi.advanceTimersByTime(20);
    await settle();
    saving.stop();

    const next = await unit();
    expect(next.num("ch.ch1.level", 0), "before it is restored, the unit as it ships").not.toBe(-9);
    await bring(next);
    expect([next.num("ch.ch1.level", 0), next.str("ch.ch1.name", ""), next.num("setup.brightness", 0)]).toEqual([-9, "Kick", 3]);
    expect(next.str("sd.rec", "idle"), "the recorder comes back stopped").toBe("idle");
  });

  it("brings back what each settings file on the card holds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store);
    const files: CardEntry[] = ["/", "/Recordings/"].map((dir) => ({ name: "mine.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir }));
    await writeCard(store, [{ name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }, ...files]);
    for (const file of files) await store.set(filePath(file), `held in ${file.dir}`);
    vi.advanceTimersByTime(20);
    await settle();
    saving.stop();

    const next = await unit();
    await bring(next);
    expect(files.map((file) => next.str(filePath(file), ""))).toEqual(["held in /", "held in /Recordings/"]);
  });

  it("brings back a ratio left at the top of its travel", async () => {
    // The SSMCS Ratio's last stop is infinite, which JSON has no number for.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store);
    await store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    await store.set("ch.ch2.ssmcs.comp.ratio", 40);
    vi.advanceTimersByTime(20);
    await settle();
    saving.stop();

    const next = await unit();
    await bring(next);
    expect([next.num("ch.ch1.ssmcs.comp.ratio", 0), next.num("ch.ch2.ssmcs.comp.ratio", 0)]).toEqual([Number.POSITIVE_INFINITY, 40]);
  });

  it("leaves out what the unit is doing even where it was stored", async () => {
    // A unit stored by a version that kept more than this one does.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -4, "sd.playing": true, "sd.rec": "recording" } }),
    );
    const store = await unit();
    await bring(store);
    expect(store.num("ch.ch1.level", 0), "the mixer comes back").toBe(-4);
    expect([store.bool("sd.playing", false), store.str("sd.rec", "idle")], "and it is doing nothing").toEqual([false, "idle"]);
  });

  it("brings a [SAFE] kept apart from [Clip Safe] back as Clip Safe", async () => {
    // A unit stored while the channel view's [SAFE] held a value of its own.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.safe": true, "ch.ch1.clipSafe": false, "ch.ch2.safe": false } }),
    );
    const store = await unit();
    await bring(store);
    expect([store.bool("ch.ch1.clipSafe", false), store.bool("ch.ch2.clipSafe", true)]).toEqual([true, false]);
    expect(store.has("ch.ch1.safe"), "the old name is not put back").toBe(false);
  });

  it("brings the sends into a bus on Pan Link back where their sources are, and a FIXED bus off Pan Link", async () => {
    // A unit stored while Pan Link left each send's own placing where it was.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({
        version: 1,
        model: MODEL,
        values: {
          "ch.bus.mix1.panLink": true, "ch.ch1.pan": -40, "ch.ch1.send.bus.mix1.balance": 21, "ch.ch1.send.bus.mix2.balance": 21,
          "ch.bus.mix2.busType": "FIXED", "ch.bus.mix2.panLink": true,
        },
      }),
    );
    const store = await unit();
    await bring(store);
    expect(
      [store.num("ch.ch1.send.bus.mix1.balance", 0), store.num("ch.ch1.send.bus.mix2.balance", 0)],
      "MIX 1 is on Pan Link and MIX 2, a FIXED bus, is not",
    ).toEqual([-40, 21]);
    expect(store.bool("ch.bus.mix2.panLink", true), "and a FIXED bus comes back with Pan Link off").toBe(false);
  });

  it("brings an amp's type written as its name back at the place on its knob that reads it", async () => {
    // A unit stored while Type and Amp Type were lists held by name.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({
        version: 1,
        model: MODEL,
        values: {
          "ch.ch1.insFx.effect": "Lead", "ch.ch1.insFx.type": "Low",
          "ch.ch2.insFx.effect": "Drive", "ch.ch2.insFx.ampType": "Modern1",
          "ch.ch3.insFx.effect": "Crunch", "ch.ch3.insFx.type": "Loud",
        },
      }),
    );
    const store = await unit();
    await bring(store);
    expect([store.get("ch.ch1.insFx.type", ""), store.get("ch.ch2.insFx.ampType", "")]).toEqual([1, 4]);
    expect(store.has("ch.ch3.insFx.type"), "a name the amp does not have is not put back").toBe(false);
  });

  it("leaves a clock that stood still behind, and keeps a clock that was set", async () => {
    // A unit stored while the clock was kept as parts that did not run.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({ version: 1, model: MODEL, values: { "setup.dateTime.year": 2020, "setup.dateTime.hour": 9, "setup.dateTime.offsetMs": 3_600_000 } }),
    );
    const store = await unit();
    await bring(store);
    expect([store.has("setup.dateTime.year"), store.has("setup.dateTime.hour")], "the old parts are not put back").toEqual([false, false]);
    expect(store.num("setup.dateTime.offsetMs", 0), "how far the clock was set apart comes back").toBe(3_600_000);
  });

  it("brings back a recorder the stored frequency cannot hold at the count it can", async () => {
    // A unit stored before the recorder followed the frequency: 16 tracks at 192 kHz.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({ version: 1, model: MODEL, values: { "setup.samplingFrequency": 192000, "sd.trackCount": 16 } }),
    );
    const store = await unit();
    await bring(store);
    await Promise.resolve();
    expect(store.num("sd.trackCount", 0)).toBe(2);
  });

  it("brings a GATE, COMP or DUCKER time stored off its stops back on the stop nearest it", async () => {
    // A unit stored by an earlier version: each time a detent up from where it ships, by that version's steps.
    const times: [string, number][] = [
      ["ch.ch1.gate.attack", 20.27],
      ["ch.ch1.gate.hold", 16.3],
      ["ch.ch1.gate.decay", 151.2],
      ["ch.ch1.comp.release", 219],
      ["ch.ch_5_6.ducker.decay", 1001],
      ["ch.ch1.ssmcs.comp.attack", 4.124],
    ];
    window.localStorage.setItem("urx-lcd-sim.state", JSON.stringify({ version: 1, model: MODEL, values: Object.fromEntries(times) }));
    const store = await unit();
    await bring(store);
    expect(
      times.map(([p]) => store.num(p, 0)),
      "each on its nearest stop, and the SSMCS strip's Attack as it is stored",
    ).toEqual([20.17, 16, 150.2, 218, 1000, 4.124]);
  });

  it("leaves another model's unit alone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    await settle();
    saving.stop();
    expect(await stored("URX22"), "what was stored was another unit's").toBeNull();

    const next = await unit("URX22");
    await bring(next, "URX22");
    expect(next.num("ch.ch1.level", 99)).not.toBe(-9);
  });

  it("names the model it opens as: the one the record keeps, or where it keeps none, its unit's", () => {
    const unitOf = (version: number): string => JSON.stringify({ version, model: "URX22", values: {} });
    expect(modelOf({ token: null, model: null, unit: null }), "nothing stored").toBeNull();
    expect(modelOf({ token: null, model: null, unit: unitOf(2) }), "a unit of another version").toBeNull();
    expect(modelOf({ token: null, model: null, unit: unitOf(1) }), "a unit stored before the model was kept with it").toBe("URX22");
    expect(modelOf({ token: "t", model: "URX44", unit: unitOf(1) }), "the model kept").toBe("URX44");
  });

  it("stores the unit as it ships at once when it starts again from it", async () => {
    // [Reset the unit]: the unit as it ships takes the place of what was stored.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const first = await start(store);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    await settle();
    first.saving.stop();
    expect((await stored())?.["ch.ch1.level"]).toBe(-9);

    const next = await unit();
    const shipped = next.num("ch.ch1.level", 99);
    const again = await start(next, MODEL, { first: "unit" });
    await settle();
    expect((await stored())?.["ch.ch1.level"], "before any change falls due").toBe(shipped);
    expect(again.took).toEqual([true]);
    again.saving.stop();
    const after = await unit();
    await bring(after);
    expect(after.num("ch.ch1.level", 99)).toBe(shipped);
  });

  it("runs on where the browser refuses to store anything or to read what it holds", async () => {
    idb.refuse = true;
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    await settle();
    expect(tab.took, "a refused write is told, not a crash").toEqual([false]);
    expect(await keeper.read(), "and nothing is stored").toBeNull();
    const blocked: Keeper = { read: () => Promise.reject(new Error("storage is blocked")), write: () => Promise.resolve("refused") };
    const opened = await openKept(blocked);
    const nothing = { token: null, model: null, unit: null };
    expect(opened, "a refused read is nothing stored, and told").toEqual({ kept: nothing, shown: nothing, carried: null, dropped: false, refused: true });
    await expect(restore(store, MODEL, opened.kept)).resolves.toBeUndefined();
  });

  it("stores the unit only once for a burst of changes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const write = vi.fn(keeper.write);
    const stringify = vi.spyOn(JSON, "stringify");
    await start(store, MODEL, { keeper: { read: keeper.read, write } });
    for (let i = 0; i < 20; i++) await store.set("ch.ch1.level", -i);
    vi.advanceTimersByTime(20);
    await settle();
    expect(write).toHaveBeenCalledTimes(1);
    expect(unitTexts(stringify), "and writes it out as text once").toBe(1);
    expect((await stored())?.["ch.ch1.level"]).toBe(-19);
  });

  it("writes no more often than its delay while changes keep coming", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const write = vi.fn(keeper.write);
    await start(store, MODEL, { keeper: { read: keeper.read, write } }, 400);
    for (let i = 0; i < 10; i++) {
      await store.set("ch.ch1.level", -i);
      vi.advanceTimersByTime(100);
      await settle();
    }
    vi.advanceTimersByTime(400);
    await settle();
    expect(write.mock.calls.length, "a write each 400 ms over a second of changes, not one each change").toBe(3);
    expect((await stored())?.["ch.ch1.level"]).toBe(-9);
  });

  it("writes a change still waiting when it settles, and nothing where none waits", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store);
    const stringify = vi.spyOn(JSON, "stringify");
    await saving.settle();
    expect(await keeper.read(), "nothing waited").toBeNull();
    expect(unitTexts(stringify), "nor is the unit written out as text").toBe(0);
    await store.set("ch.ch1.level", -9);
    await settle();
    expect(await stored(), "the change is still waiting").toBeNull();
    await saving.settle();
    expect((await stored())?.["ch.ch1.level"]).toBe(-9);
  });

  it("drops a change still waiting when it stops, and leaves nothing behind for the next start", async () => {
    // [Reset the unit] stops the unit before it starts again: the change is not stored.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { saving } = await start(store, MODEL, { tab: "a" });
    await store.set("ch.ch1.level", -9);
    saving.stop();
    vi.advanceTimersByTime(20);
    await saving.settle();
    saving.leave();
    await settle();
    expect(await keeper.read()).toBeNull();
    expect(window.localStorage.length, "nothing left for the next start").toBe(0);
  });

  it("takes in what the unit holds, and nothing of what it is doing", async () => {
    const store = await unit();
    await store.set("sd.playing", true);
    const values = snapshot(store);
    expect(Object.keys(values).some((p) => p.startsWith("ch.")), "the mixer").toBe(true);
    expect(values["sd.playing"], "not what it is doing").toBeUndefined();
  });

  it("tells whether the browser took each write", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store);
    idb.refuse = true;
    await store.set("ch.ch1.level", -9);
    await tab.saving.settle();
    idb.refuse = false;
    await store.set("ch.ch1.level", -8);
    await tab.saving.settle();
    expect(tab.took).toEqual([false, true]);
    expect((await stored())?.["ch.ch1.level"]).toBe(-8);
  });

  it("opens on what a version before IndexedDB kept, and lets it go once the unit is written", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    window.localStorage.setItem("urx-lcd-sim.state", JSON.stringify({ version: 1, model: "URX22", values: { "ch.ch1.level": -4 } }));
    window.localStorage.setItem("urx-lcd-sim.model", "URX22");
    const opened = await openKept(keeper);
    expect(modelOf(opened.kept), "the model it kept").toBe("URX22");
    const store = await unit("URX22");
    await restore(store, "URX22", opened.kept);
    expect(store.num("ch.ch1.level", 0)).toBe(-4);
    const tab = await start(store, "URX22");
    await store.set("ch.ch2.level", -5);
    await tab.saving.settle();
    expect([(await stored("URX22"))?.["ch.ch1.level"], (await stored("URX22"))?.["ch.ch2.level"]]).toEqual([-4, -5]);
    expect(modelOf((await keeper.read()) as Kept)).toBe("URX22");
    expect([window.localStorage.getItem("urx-lcd-sim.state"), window.localStorage.getItem("urx-lcd-sim.model")], "let go").toEqual([null, null]);
  });

  it("writes nothing where the browser has no IndexedDB", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    expect(openKeeper(undefined), "no keeper").toBeNull();
    const store = await unit();
    const tab = await start(store, MODEL, { keeper: null, tab: "a" });
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    await tab.saving.settle();
    tab.saving.leave();
    expect([tab.took, window.localStorage.length]).toEqual([[], 0]);
  });
});

describe("one tab at a time", () => {
  /** Two tabs started on what the browser holds now, each on its own unit. */
  async function twoTabs(model: ModelId = MODEL): Promise<{ a: DeviceStore; b: DeviceStore; tabA: Tab; tabB: Tab }> {
    const a = await unit(model);
    const b = await unit(model);
    const tabA = await start(a, model, { tab: "a" });
    const tabB = await start(b, model, { tab: "b" });
    return { a, b, tabA, tabB };
  }

  it("stops writing once another tab stores the unit, and tells so", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { a, b, tabA, tabB } = await twoTabs();
    await a.set("ch.ch1.level", -9);
    await tabA.saving.settle();
    await settle();
    expect(tabB.told(), "told as it hears").toBe(1);
    await b.set("ch.ch2.level", -5);
    await tabB.saving.settle();
    vi.advanceTimersByTime(20);
    await settle();
    expect([(await stored())?.["ch.ch1.level"], (await stored())?.["ch.ch2.level"]], "what the other tab stored stays").toEqual([-9, a.num("ch.ch2.level", 0)]);
    await a.set("ch.ch1.level", -8);
    await tabA.saving.settle();
    await settle();
    expect([tabA.told(), tabB.told()], "told once, having stopped").toEqual([0, 1]);
  });

  it("settles on whether a change was left unwritten because another tab stored the unit", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { a, b, tabA, tabB } = await twoTabs();
    expect(await tabB.saving.settle(), "nothing was waiting").toBe("kept");
    await a.set("ch.ch1.level", -9);
    expect(await tabA.saving.settle(), "written").toBe("kept");
    await settle();
    await b.set("ch.ch2.level", -5);
    expect(await tabB.saving.settle(), "left unwritten").toBe("moved");
  });

  it("settles only once every change made up to it is stored, one made while a write was under way included", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store);
    idb.hold();
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    await store.set("ch.ch2.level", -5);
    const settled = tab.saving.settle();
    idb.release();
    const outcome = await settled;
    tab.saving.stop();
    await settle();
    expect([(await stored())?.["ch.ch1.level"], (await stored())?.["ch.ch2.level"]], "both changes stored before it settles").toEqual([-9, -5]);
    expect(outcome).toBe("kept");
  });

  it("settles on refused where the browser refuses the write, and leaves nothing behind for the next start", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store, MODEL, { tab: "a" });
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    idb.refuse = true;
    const outcome = await tab.saving.settle();
    expect([await keeper.read(), window.localStorage.length], "nothing stored, and what was left let go with it").toEqual([null, 0]);
    expect(outcome).toBe("refused");
  });

  it("stops at its next write, and tells so, where another tab's write moved the record on unheard", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store);
    const theirs: Kept = { token: "theirs", model: MODEL, unit: JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -20 } }) };
    expect(await keeper.write(null, theirs)).toBe("written");
    await store.set("ch.ch2.level", -5);
    await tab.saving.settle();
    await settle();
    expect(await stored(), "what the other tab stored stays").toEqual({ "ch.ch1.level": -20 });
    expect([tab.told(), tab.took], "told, with no write to report").toEqual([1, []]);
  });

  it("keeps on storing where another tab keeps a model alone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const a = await unit();
    const tabA = await start(a);
    await start(await unit("URX22"), "URX22", { first: "model" });
    await settle();
    expect(modelOf((await keeper.read()) as Kept), "the model picked is kept").toBe("URX22");
    await a.set("ch.ch1.level", -9);
    await tabA.saving.settle();
    await settle();
    expect([tabA.told(), (await stored())?.["ch.ch1.level"]], "a model kept is no reason to stop").toEqual([0, -9]);
    expect(modelOf((await keeper.read()) as Kept), "and the unit stored brings its own model").toBe(MODEL);
  });

  it("leaves a write made while another tab was bringing the unit back where it is, and tells that tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const a = await unit();
    const tabA = await start(a);
    await a.set("ch.ch1.level", -9);
    await tabA.saving.settle();
    // The second tab reads what is stored, and the first writes while the second puts it back.
    const b = await unit();
    const { kept } = await openKept(keeper);
    const bringing = restore(b, MODEL, kept);
    await a.set("ch.ch1.level", -8);
    await tabA.saving.settle();
    await bringing;
    expect(b.num("ch.ch1.level", 0), "the second tab brought back what it read").toBe(-9);
    let told = 0;
    const saving = startSaving(b, MODEL, 10, undefined, () => told++, { keeper, kept });
    started.push(saving);
    await b.set("ch.ch2.level", -5);
    await saving.settle();
    await settle();
    expect((await stored())?.["ch.ch1.level"], "the first tab's later level stays").toBe(-8);
    expect(told, "the second tab is told").toBe(1);
  });

  for (const leaving of [false, true]) {
    const how = leaving ? "the first leaves the page" : "the first's write falls due";
    it(`stores one tab's change and tells the other, where both change before either write lands and ${how}`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const { a, b, tabA, tabB } = await twoTabs();
      await a.set("ch.ch1.level", -9);
      await b.set("ch.ch2.level", -5);
      idb.hold();
      if (leaving) {
        tabA.saving.leave();
        tabA.saving.stop();
      }
      vi.advanceTimersByTime(20);
      idb.release();
      await settle();
      const { kept, dropped } = await openKept(keeper);
      const levels = [readUnit(kept, MODEL)?.["ch.ch1.level"], readUnit(kept, MODEL)?.["ch.ch2.level"]];
      if (leaving) {
        expect(levels, "the second tab's unit, whole").toEqual([b.num("ch.ch1.level", 0), -5]);
        expect([dropped, tabB.took], "the first tab's change is dropped, and the next start says so").toEqual([true, [true]]);
      } else {
        expect(levels, "the first tab's unit, whole").toEqual([-9, a.num("ch.ch2.level", 0)]);
        expect([dropped, tabA.told(), tabB.told(), tabB.took], "the second tab is told, with no write to report").toEqual([false, 0, 1, []]);
      }
    });
  }

  it("keeps a tab's change left on leaving where nothing was written after it, with its model and card", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit("URX22");
    const tab = await start(store, "URX22", { tab: "a" });
    await writeCard(store, [{ name: "mine.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    await store.set("sd.file./mine.urxf", "held");
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    tab.saving.stop();
    const { kept, dropped } = await openKept(keeper);
    expect(dropped).toBe(false);
    expect([kept.model, readUnit(kept, "URX22")?.["ch.ch1.level"], readUnit(kept, "URX22")?.["sd.file./mine.urxf"]]).toEqual(["URX22", -9, "held"]);
    expect(await keeper.read(), "and it is written").toEqual(kept);
    expect(window.localStorage.length, "what was left is let go").toBe(0);
  });

  it("keeps a change left while its write was still under way, whether or not that write lands", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    for (const lands of [true, false]) {
      const store = await unit();
      const tab = await start(store, MODEL, { tab: "a" });
      idb.hold();
      await store.set("ch.ch1.level", -9);
      vi.advanceTimersByTime(20);
      await store.set("ch.ch2.level", -5);
      tab.saving.leave();
      tab.saving.stop();
      idb.refuse = !lands;
      idb.release();
      await settle();
      idb.refuse = false;
      const { kept, dropped } = await openKept(keeper);
      expect([dropped, readUnit(kept, MODEL)?.["ch.ch1.level"], readUnit(kept, MODEL)?.["ch.ch2.level"]], lands ? "the write landed" : "the write did not").toEqual([false, -9, -5]);
      idb = fakeIndexedDb();
      keeper = openKeeper(idb.factory) as Keeper;
    }
  });

  it("writes a change made while its write was under way once that write lands, as the same tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store);
    idb.hold();
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    await store.set("ch.ch2.level", -5);
    vi.advanceTimersByTime(20);
    idb.release();
    await settle();
    vi.advanceTimersByTime(20);
    await settle();
    expect([(await stored())?.["ch.ch1.level"], (await stored())?.["ch.ch2.level"]]).toEqual([-9, -5]);
    expect([tab.told(), tab.took], "one write after the other, neither over the other").toEqual([0, [true, true]]);
  });

  it("drops nothing it finds taken in already by a start that came first", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store, MODEL, { tab: "a" });
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    tab.saving.stop();
    const left = Object.entries({ ...window.localStorage });
    expect((await openKept(keeper)).dropped).toBe(false);
    // A start that read what was left before the first let it go.
    for (const [key, value] of left) window.localStorage.setItem(key, value);
    const again = await openKept(keeper);
    expect([again.dropped, readUnit(again.kept, MODEL)?.["ch.ch1.level"], window.localStorage.length]).toEqual([false, -9, 0]);
  });

  it("lets go of what it left at its next write, as a page brought back does, so a later start drops nothing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store, MODEL, { tab: "a" });
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    await tab.saving.settle();
    const { kept, dropped } = await openKept(keeper);
    expect([dropped, readUnit(kept, MODEL)?.["ch.ch1.level"], window.localStorage.length]).toEqual([false, -9, 0]);
  });

  it("tells the tabs still open as soon as a start takes in what a tab left", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { a, tabA, tabB } = await twoTabs();
    await a.set("ch.ch1.level", -9);
    tabA.saving.leave();
    tabA.saving.stop();
    await openKept(keeper);
    await settle();
    expect(tabB.told(), "the other tab hears of it").toBe(1);
  });

  it("opens on what a page left where the browser refuses to take it in, keeps it for later, and stores it at the next write the browser takes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit("URX22");
    const tab = await start(store, "URX22", { tab: "a" });
    await writeCard(store, [{ name: "mine.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    tab.saving.stop();
    idb.refuse = true;
    const opened = await openKept(keeper);
    expect([opened.dropped, opened.carried, window.localStorage.length], "kept for later, and told").toEqual([false, "a", 1]);
    expect([modelOf(opened.shown), readUnit(opened.shown, "URX22")?.["ch.ch1.level"], readUnit(opened.shown, "URX22")?.["sd.card"]], "what it opens on").toEqual(["URX22", -9, store.str("sd.card", "")]);
    // The start puts back what was left, and stores it with its next change once the browser takes it.
    const next = await unit("URX22");
    await restore(next, "URX22", opened.shown);
    const saving = startSaving(next, "URX22", 10, undefined, undefined, { keeper, kept: opened.kept, tab: opened.carried as string, carried: true });
    started.push(saving);
    idb.refuse = false;
    expect(await saving.settle(), "with no change made yet").toBe("kept");
    expect(readUnit(await keeper.read(), "URX22")?.["ch.ch1.level"], "what was left is stored").toBe(-9);
    await next.set("ch.ch2.level", -5);
    expect(await saving.settle()).toBe("kept");
    const kept = (await keeper.read()) as Kept;
    expect([modelOf(kept), readUnit(kept, "URX22")?.["ch.ch1.level"], readUnit(kept, "URX22")?.["ch.ch2.level"], readUnit(kept, "URX22")?.["sd.card"]]).toEqual(["URX22", -9, -5, store.str("sd.card", "")]);
    expect(window.localStorage.length, "what was left is let go once stored").toBe(0);
  });

  it("drops what a tab left, and says so, where another tab writes while a start takes it in", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store, MODEL, { tab: "a" });
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    tab.saving.stop();
    const theirs: Kept = { token: "theirs", model: MODEL, unit: JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -20 } }) };
    const racing: Keeper = {
      read: keeper.read,
      write: async (basis, next) => {
        await keeper.write(undefined, theirs);
        return keeper.write(basis, next);
      },
    };
    const { kept, dropped } = await openKept(racing);
    expect([dropped, kept.token, readUnit(kept, MODEL)?.["ch.ch1.level"]]).toEqual([true, "theirs", -20]);
  });

  it("takes what a tab left in once where two tabs open at the same time", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const tab = await start(store, MODEL, { tab: "a" });
    await store.set("ch.ch1.level", -9);
    tab.saving.leave();
    tab.saving.stop();
    const [one, two] = await Promise.all([openKept(keeper), openKept(keeper)]);
    expect([one.dropped, two.dropped], "neither drops it").toEqual([false, false]);
    expect([readUnit(one.kept, MODEL)?.["ch.ch1.level"], readUnit(two.kept, MODEL)?.["ch.ch1.level"], one.kept.token === two.kept.token]).toEqual([-9, -9, true]);
  });

  it("lets [Reset the unit] in one tab stand over another tab's change, with its card and model, and tells that tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { a, tabA } = await twoTabs();
    await a.set("ch.ch1.level", -9);
    // The second tab starts again from the unit as it ships, with its card in the slot.
    const b = await unit("URX22");
    await writeCard(b, [{ name: "mine.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" }]);
    const reset = await start(b, "URX22", { first: "unit", tab: "b" });
    await settle();
    vi.advanceTimersByTime(20);
    await settle();
    const kept = (await keeper.read()) as Kept;
    expect([modelOf(kept), readUnit(kept, "URX22")?.["ch.ch1.level"], readUnit(kept, "URX22")?.["sd.card"]]).toEqual(["URX22", b.num("ch.ch1.level", 0), b.str("sd.card", "")]);
    expect([tabA.told(), reset.told(), reset.took], "the first tab is told").toEqual([1, 0, [true]]);
  });

  it("opens next on the model of the unit stored last, over a model picked in another tab before or after", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    for (const pickedFirst of [true, false]) {
      const a = await unit("URX22");
      const tabA = await start(a, "URX22");
      const pick = async (): Promise<void> => {
        await start(await unit(), MODEL, { first: "model" });
        await settle();
      };
      if (pickedFirst) await pick();
      await a.set("ch.ch1.level", -9);
      await tabA.saving.settle();
      await settle();
      if (!pickedFirst) {
        expect(modelOf((await keeper.read()) as Kept)).toBe("URX22");
        await pick();
        expect(modelOf((await keeper.read()) as Kept), "picked after the unit was stored, it is kept").toBe(MODEL);
        continue;
      }
      const { kept } = await openKept(keeper);
      expect([modelOf(kept), readUnit(kept, "URX22")?.["ch.ch1.level"]], "the unit stored last, on its own model").toEqual(["URX22", -9]);
    }
  });
});

describe("the room a unit takes in the browser", () => {
  /** A URX44V holding a scene in every Standard number and `files` settings files, all taken as it stands. */
  async function fullUnit(files: number): Promise<DeviceStore> {
    const store = await unit();
    for (let no = 1; no <= 63; no++) {
      await store.set("ch.ch1.level", -no / 2);
      await store.set(`scene.Standard.${no}.state`, toJson(captureScene(store)));
      await store.set(`scene.Standard.${no}.title`, `S${no}`);
    }
    for (let f = 1; f <= files; f++) await store.set(`sd.file.F${f}.urxf`, toJson(captureSettings(store)));
    return store;
  }

  it("keeps every scene memory and settings files that each hold them all", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await fullUnit(4);
    const tab = await start(store);
    await store.set("ch.ch1.level", -33);
    await tab.saving.settle();
    const saved = await stored();
    expect(saved?.["ch.ch1.level"], "the change after the files is stored").toBe(-33);
    for (const path of ["sd.file.F1.urxf", "sd.file.F4.urxf", "scene.Standard.1.state", "scene.Standard.63.state"]) {
      expect(saved?.[path], path).toBe(store.str(path, ""));
    }
    expect(tab.took, "the browser took the write").toEqual([true]);
  });

  it("writes each scene memory's mixer once, however many settings files hold it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const lengths: number[] = [];
    let scenes = 0;
    for (const files of [0, 1]) {
      const store = await fullUnit(files);
      scenes = store.paths().filter((p) => /^scene\..+\.state$/.test(p)).reduce((sum, p) => sum + store.str(p, "").length, 0);
      const tab = await start(store, MODEL, { first: "unit" });
      await tab.saving.settle();
      tab.saving.stop();
      lengths.push((await keeper.read())?.unit?.length ?? 0);
    }
    expect(lengths[0], "the unit is stored").toBeGreaterThan(scenes);
    expect(lengths[1]! - lengths[0]!, "a settings file adds a small part of the scene memories it holds").toBeLessThan(scenes / 10);
  });

  it("brings back a unit stored with its settings files written as text", async () => {
    // A unit stored before settings files and scene memories were written once each.
    const store = await fullUnit(1);
    const file: CardEntry = { name: "F1.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" };
    const text = store.str("sd.file.F1.urxf", "");
    const scene = store.str("scene.Standard.5.state", "");
    const values = { "sd.card": JSON.stringify([file]), [filePath(file)]: text, "scene.Standard.5.state": scene };
    window.localStorage.setItem("urx-lcd-sim.state", toJson({ version: 1, model: MODEL, values }));
    const next = await unit();
    await bring(next);
    expect([next.str(filePath(file), ""), next.str("scene.Standard.5.state", "")]).toEqual([text, scene]);
  });
});
