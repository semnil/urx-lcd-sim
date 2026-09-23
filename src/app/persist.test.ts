import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { forget, persisted, readSaved, restore, snapshot, startSaving } from "./persist";

// The unit comes back as it was left, and what it was doing does not.

const MODEL = "URX44V";

async function unit(): Promise<DeviceStore> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById(MODEL))));
  return store;
}

afterEach(() => {
  forget();
  vi.useRealTimers();
});

describe("what a reload carries over", () => {
  it("leaves out what the unit was doing at that moment", () => {
    for (const path of ["ch.ch1.level", "setup.brightness", "sd.card", "ui.selectedStrip", "scene.Standard.1.state"]) {
      expect(persisted(path), path).toBe(true);
    }
    for (const path of ["sd.rec", "sd.playing", "sd.playSeconds", "sd.playingFile", "ui.titleEntry.text", "ui.dateTimeDraft.hour"]) {
      expect(persisted(path), path).toBe(false);
    }
  });

  it("brings the values back on the next start", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const stop = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.level", -9);
    await store.set("ch.ch1.name", "Kick");
    await store.set("setup.brightness", 3);
    await store.set("sd.rec", "recording");
    vi.advanceTimersByTime(20);
    stop();

    const next = await unit();
    expect(next.num("ch.ch1.level", 0), "before it is restored, the unit as it ships").not.toBe(-9);
    await restore(next, MODEL);
    expect([next.num("ch.ch1.level", 0), next.str("ch.ch1.name", ""), next.num("setup.brightness", 0)]).toEqual([-9, "Kick", 3]);
    expect(next.str("sd.rec", "idle"), "the recorder comes back stopped").toBe("idle");
  });

  it("brings back a ratio left at the top of its travel", async () => {
    // The SSMCS Ratio's last stop is infinite, which JSON has no number for.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const stop = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    await store.set("ch.ch2.ssmcs.comp.ratio", 40);
    vi.advanceTimersByTime(20);
    stop();

    const next = await unit();
    await restore(next, MODEL);
    expect([next.num("ch.ch1.ssmcs.comp.ratio", 0), next.num("ch.ch2.ssmcs.comp.ratio", 0)]).toEqual([Number.POSITIVE_INFINITY, 40]);
  });

  it("leaves out what the unit is doing even where it was stored", async () => {
    // A unit stored by a version that kept more than this one does.
    window.localStorage.setItem(
      "urx-lcd-sim.state",
      JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -4, "sd.playing": true, "sd.rec": "recording" } }),
    );
    const store = await unit();
    await restore(store, MODEL);
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
    await restore(store, MODEL);
    expect([store.bool("ch.ch1.clipSafe", false), store.bool("ch.ch2.clipSafe", true)]).toEqual([true, false]);
    expect(store.has("ch.ch1.safe"), "the old name is not put back").toBe(false);
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
    await restore(store, MODEL);
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
    await restore(store, MODEL);
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
    await restore(store, MODEL);
    await Promise.resolve();
    expect(store.num("sd.trackCount", 0)).toBe(2);
  });

  it("leaves another model's unit alone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const stop = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    stop();
    expect(readSaved("URX22"), "what was stored was another unit's").toBeNull();

    const next = await unit();
    await restore(next, "URX22");
    expect(next.num("ch.ch1.level", 99)).not.toBe(-9);
  });

  it("starts from the unit as it ships once it is forgotten", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const stop = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    stop();
    expect(readSaved(MODEL)).not.toBeNull();
    forget();
    expect(readSaved(MODEL)).toBeNull();

    const next = await unit();
    const before = next.num("ch.ch1.level", 99);
    await restore(next, MODEL);
    expect(next.num("ch.ch1.level", 99)).toBe(before);
  });

  it("runs on where the browser refuses to store anything", async () => {
    const store = await unit();
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is full");
    });
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    try {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const stop = startSaving(store, MODEL, 10);
      await store.set("ch.ch1.level", -9);
      expect(() => vi.advanceTimersByTime(20), "a refused write is not a crash").not.toThrow();
      stop();
      expect(readSaved(MODEL), "and a refused read is nothing stored").toBeNull();
      await expect(restore(store, MODEL)).resolves.toBeUndefined();
    } finally {
      set.mockRestore();
      get.mockRestore();
    }
  });

  it("stores the unit only once for a burst of changes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const set = vi.spyOn(Storage.prototype, "setItem");
    const stop = startSaving(store, MODEL, 10);
    for (let i = 0; i < 20; i++) await store.set("ch.ch1.level", -i);
    vi.advanceTimersByTime(20);
    expect(set).toHaveBeenCalledTimes(1);
    stop();
    set.mockRestore();
  });

  it("takes in what the unit holds, and nothing of what it is doing", async () => {
    const store = await unit();
    await store.set("sd.playing", true);
    const values = snapshot(store);
    expect(Object.keys(values).some((p) => p.startsWith("ch.")), "the mixer").toBe(true);
    expect(values["sd.playing"], "not what it is doing").toBeUndefined();
  });
});
