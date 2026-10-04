import { afterEach, describe, expect, it, vi } from "vitest";
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
import { type From, lastModel, openHold, persisted, readSaved, restore, type Saving, snapshot, startSaving } from "./persist";

// The unit comes back as it was left, and what it was doing does not.

const MODEL = "URX44V";

async function unit(model: ModelId = MODEL): Promise<DeviceStore> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById(model))));
  return store;
}

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

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
    const { stop } = startSaving(store, MODEL, 10);
    await store.set("ui.sdToolsTab", "Test");
    await store.set("sd.tested", true);
    vi.advanceTimersByTime(20);
    stop();

    const next = await unit();
    await restore(next, MODEL);
    expect([next.str("ui.sdToolsTab", ""), next.bool("sd.tested", false)], "the tab back, and no result on it").toEqual(["Test", false]);
  });

  it("brings the values back on the next start", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop } = startSaving(store, MODEL, 10);
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

  it("brings back what each settings file on the card holds", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop } = startSaving(store, MODEL, 10);
    const files: CardEntry[] = ["/", "/Recordings/"].map((dir) => ({ name: "mine.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir }));
    await writeCard(store, [{ name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" }, ...files]);
    for (const file of files) await store.set(filePath(file), `held in ${file.dir}`);
    vi.advanceTimersByTime(20);
    stop();

    const next = await unit();
    await restore(next, MODEL);
    expect(files.map((file) => next.str(filePath(file), ""))).toEqual(["held in /", "held in /Recordings/"]);
  });

  it("brings back a ratio left at the top of its travel", async () => {
    // The SSMCS Ratio's last stop is infinite, which JSON has no number for.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop } = startSaving(store, MODEL, 10);
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
    await restore(store, MODEL);
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
    await restore(store, MODEL);
    expect(
      times.map(([p]) => store.num(p, 0)),
      "each on its nearest stop, and the SSMCS strip's Attack as it is stored",
    ).toEqual([20.17, 16, 150.2, 218, 1000, 4.124]);
  });

  it("leaves another model's unit alone", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop } = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    stop();
    expect(readSaved("URX22"), "what was stored was another unit's").toBeNull();

    const next = await unit();
    await restore(next, "URX22");
    expect(next.num("ch.ch1.level", 99)).not.toBe(-9);
  });

  it("names the model it was last used as, or the stored unit's where none is kept", () => {
    try {
      expect(lastModel(), "nothing stored").toBeNull();
      window.localStorage.setItem("urx-lcd-sim.state", JSON.stringify({ version: 2, model: "URX22", values: {} }));
      expect(lastModel(), "a unit of another version").toBeNull();
      window.localStorage.setItem("urx-lcd-sim.state", JSON.stringify({ version: 1, model: "URX22", values: {} }));
      expect(lastModel(), "a unit stored before the model was kept apart").toBe("URX22");
      window.localStorage.setItem("urx-lcd-sim.model", "URX44");
      expect(lastModel(), "the model kept apart").toBe("URX44");
    } finally {
      window.localStorage.removeItem("urx-lcd-sim.model");
    }
  });

  it("stores the unit as it ships at once when it starts again from it", async () => {
    // [Reset the unit]: the unit as it ships takes the place of what was stored.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop } = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.level", -9);
    vi.advanceTimersByTime(20);
    stop();
    expect(readSaved(MODEL)?.["ch.ch1.level"]).toBe(-9);

    const next = await unit();
    const shipped = next.num("ch.ch1.level", 99);
    const again = startSaving(next, MODEL, 10, undefined, undefined, { first: "unit" });
    await settle();
    expect(readSaved(MODEL)?.["ch.ch1.level"], "before any change falls due").toBe(shipped);
    again.stop();
    const after = await unit();
    await restore(after, MODEL);
    expect(after.num("ch.ch1.level", 99)).toBe(shipped);
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
      const { stop } = startSaving(store, MODEL, 10);
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
    const stringify = vi.spyOn(JSON, "stringify");
    const { stop } = startSaving(store, MODEL, 10);
    for (let i = 0; i < 20; i++) await store.set("ch.ch1.level", -i);
    vi.advanceTimersByTime(20);
    expect(set.mock.calls.filter(([key]) => key === "urx-lcd-sim.state")).toHaveLength(1);
    expect(unitTexts(stringify), "and writes it out as text once").toBe(1);
    stop();
    set.mockRestore();
  });

  it("stores a change still waiting the moment it is flushed, and nothing where none waits", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop, flush } = startSaving(store, MODEL, 10);
    const stringify = vi.spyOn(JSON, "stringify");
    flush();
    expect(readSaved(MODEL), "nothing waited").toBeNull();
    expect(unitTexts(stringify), "nor is the unit written out as text").toBe(0);
    await store.set("ch.ch1.level", -9);
    expect(readSaved(MODEL), "the change is still waiting").toBeNull();
    flush();
    expect(readSaved(MODEL)?.["ch.ch1.level"]).toBe(-9);
    stop();
  });

  it("drops a change still waiting when it stops", async () => {
    // [Reset the unit] stops the unit before it starts again: the change is not stored.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    const { stop, flush } = startSaving(store, MODEL, 10);
    await store.set("ch.ch1.level", -9);
    stop();
    vi.advanceTimersByTime(20);
    flush();
    expect(readSaved(MODEL)).toBeNull();
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
    const took: boolean[] = [];
    const { stop, flush } = startSaving(store, MODEL, 10, (kept) => took.push(kept));
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("storage is full", "QuotaExceededError");
    });
    await store.set("ch.ch1.level", -9);
    flush();
    set.mockRestore();
    await store.set("ch.ch1.level", -8);
    flush();
    stop();
    expect(took).toEqual([false, true]);
  });

  it("stops writing once another tab stores the unit, and tells so", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    let told = 0;
    const { stop, flush } = startSaving(store, MODEL, 10, undefined, () => told++);
    /** Another tab of the same browser writing `value` under `key`, as this tab hears of it. */
    const elsewhere = (key: string, value: string): void => {
      window.localStorage.setItem(key, value);
      window.dispatchEvent(new StorageEvent("storage", { key, newValue: value, storageArea: window.localStorage }));
    };
    elsewhere("urx-lcd-sim.model", MODEL);
    await store.set("ch.ch1.level", -9);
    flush();
    expect(readSaved(MODEL)?.["ch.ch1.level"], "another tab opening on a model is no reason to stop").toBe(-9);
    expect(told).toBe(0);

    elsewhere("urx-lcd-sim.state", JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -20 } }));
    await store.set("ch.ch2.level", -5);
    vi.advanceTimersByTime(20);
    flush();
    expect(readSaved(MODEL), "what the other tab stored stays").toEqual({ "ch.ch1.level": -20 });
    expect(told).toBe(1);
    elsewhere("urx-lcd-sim.state", JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -21 } }));
    expect(told, "told once, having stopped").toBe(1);
    stop();
  });

  it("stops writing once another tab forgets the unit", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const store = await unit();
    let told = 0;
    const { stop, flush } = startSaving(store, MODEL, 10, undefined, () => told++);
    await store.set("ch.ch1.level", -9);
    flush();
    expect(readSaved(MODEL)?.["ch.ch1.level"], "this tab stores the unit").toBe(-9);
    // A tab of an earlier version, whose [Reset the unit] leaves nothing stored.
    window.localStorage.removeItem("urx-lcd-sim.state");
    window.dispatchEvent(new StorageEvent("storage", { key: "urx-lcd-sim.state", newValue: null, storageArea: window.localStorage }));
    expect(told, "told as it hears").toBe(1);
    await store.set("ch.ch1.level", -8);
    vi.advanceTimersByTime(20);
    expect(readSaved(MODEL), "the other tab's reset stays done").toBeNull();
    expect(told).toBe(1);
    stop();
  });
});

/**
 * Web Locks shared by the tabs of a test, as a browser keeps them: each tab
 * asks through its own view, a grant comes after the request returns, and the
 * tab a lock is taken from hears of it only on `deliver()`.
 */
function webLocks(): { tab: () => LockManager; deliver: () => void; answerLater: () => () => void } {
  const holders = new Map<string, { client: string; reject: (err: unknown) => void }>();
  const taken: (() => void)[] = [];
  let clients = 0;
  /** Queries the lock manager has not answered yet, once `answerLater` holds them. */
  let unanswered: (() => void)[] | null = null;
  const tab = (): LockManager => {
    const client = `tab ${++clients}`;
    const request = (name: string, ...rest: unknown[]): Promise<unknown> => {
      const callback = rest.at(-1) as (lock: Lock | null) => unknown;
      const options = (rest.length > 1 ? rest[0] : {}) as LockOptions;
      return new Promise((resolve, reject) => {
        queueMicrotask(() => {
          const holder = holders.get(name);
          if (holder && !options.steal) {
            resolve(callback(null));
            return;
          }
          if (holder) taken.push(() => holder.reject(new DOMException("The lock was taken.", "AbortError")));
          const me = { client, reject };
          holders.set(name, me);
          void Promise.resolve(callback({ name, mode: "exclusive" } as Lock)).then((value) => {
            if (holders.get(name) === me) holders.delete(name);
            resolve(value);
          });
        });
      });
    };
    const query = (): Promise<LockManagerSnapshot> =>
      new Promise((resolve) => {
        const answer = (): void =>
          resolve({ held: [...holders].map(([name, h]) => ({ name, mode: "exclusive" as const, clientId: h.client })), pending: [] });
        if (unanswered) unanswered.push(answer);
        else answer();
      });
    return { request, query } as unknown as LockManager;
  };
  const answerLater = (): (() => void) => {
    const held: (() => void)[] = [];
    unanswered = held;
    return () => {
      unanswered = null;
      held.forEach((answer) => answer());
    };
  };
  return { tab, deliver: () => taken.splice(0).forEach((tell) => tell()), answerLater };
}

/** Let the promises in flight settle, as the browser does between tasks. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/**
 * A tab of the browser, holding its hold on storing through `locks` (none: a
 * browser without Web Locks): its unit, its saving and how often it was told
 * another tab stores the unit.
 */
async function tab(
  locks: LockManager | undefined,
  model: ModelId = MODEL,
  from: From = {},
): Promise<{ store: DeviceStore; saving: Saving; told: () => number }> {
  const store = await unit(model);
  let told = 0;
  const saving = startSaving(store, model, 10, undefined, () => told++, locks ? { ...from, hold: openHold(locks) } : from);
  return { store, saving, told: () => told };
}

describe("one tab at a time", () => {
  for (const withLocks of [true, false]) {
    const browser = withLocks ? "with Web Locks" : "without Web Locks";
    for (const leaving of [false, true]) {
      it(`stores one tab's change or tells that tab, where a second tab's change comes before the first ${leaving ? "leaves the page" : "falls due"}, ${browser}`, async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        const net = withLocks ? webLocks() : null;
        const a = await tab(net?.tab());
        const b = await tab(net?.tab());
        await a.store.set("ch.ch1.level", -9);
        await settle();
        await b.store.set("ch.ch2.level", -5);
        await settle();
        if (leaving) {
          a.saving.flush();
          a.saving.stop();
        }
        vi.advanceTimersByTime(10);
        await settle();
        const kept = readSaved(MODEL);
        const mine = [kept?.["ch.ch1.level"] === -9, kept?.["ch.ch2.level"] === -5];
        expect(mine.filter(Boolean), "one tab's unit is stored, whole").toHaveLength(1);
        expect(mine[0] || a.told() === 1, "the first tab's change is stored, or the tab says it does not store").toBe(true);
        expect(mine[1] || b.told() === 1, "the second tab's change is stored, or the tab says it does not store").toBe(true);
        net?.deliver();
        await settle();
        a.saving.stop();
        b.saving.stop();
      });
    }

    it(`leaves the unit with the tab that stored it where a second tab changes what it read before that, ${browser}`, async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      const net = withLocks ? webLocks() : null;
      const a = await tab(net?.tab());
      const b = await tab(net?.tab());
      await a.store.set("ch.ch1.level", -9);
      await settle();
      vi.advanceTimersByTime(10);
      await settle();
      expect(readSaved(MODEL)?.["ch.ch1.level"]).toBe(-9);
      // The second tab has not heard of that write yet.
      await b.store.set("ch.ch2.level", -5);
      await settle();
      vi.advanceTimersByTime(10);
      await settle();
      expect(b.told(), "the second tab says it does not store").toBe(1);
      await a.store.set("ch.ch1.level", -8);
      await settle();
      vi.advanceTimersByTime(10);
      await settle();
      expect(readSaved(MODEL)?.["ch.ch1.level"], "the first tab stores on").toBe(-8);
      expect(readSaved(MODEL)?.["ch.ch2.level"], "and the second tab's change is not stored").not.toBe(-5);
      expect(a.told()).toBe(0);
      a.saving.stop();
      b.saving.stop();
    });
  }

  it("leaves unwritten the write of a tab whose hold was taken before it heard, and tells that tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab());
    const b = await tab(net.tab());
    await a.store.set("ch.ch1.level", -9);
    await settle();
    // The second tab takes the hold; the first has not heard when its change falls due.
    await b.store.set("ch.ch2.level", -5);
    await settle();
    vi.advanceTimersByTime(10);
    await settle();
    expect(readSaved(MODEL)?.["ch.ch1.level"], "the first tab's write is not made").not.toBe(-9);
    expect(a.told(), "and the first tab says it does not store").toBe(1);
    expect(readSaved(MODEL)?.["ch.ch2.level"], "the second tab stores").toBe(-5);
    net.deliver();
    await settle();
    a.saving.stop();
    b.saving.stop();
  });

  it("stores a change made at once after it starts on leaving the page, where no tab holds the hold", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab());
    await settle();
    await a.store.set("ch.ch1.level", -9);
    a.saving.flush();
    expect(readSaved(MODEL)?.["ch.ch1.level"]).toBe(-9);
    a.saving.stop();
  });

  it("keeps the newest change where a write the lock manager answers late comes after one written at once", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab());
    await settle();
    await a.store.set("ch.ch1.level", -9);
    const answer = net.answerLater();
    vi.advanceTimersByTime(10);
    // The page goes into the back/forward cache: the change since is written at once.
    await a.store.set("ch.ch1.level", -8);
    a.saving.flush();
    expect(readSaved(MODEL)?.["ch.ch1.level"]).toBe(-8);
    answer();
    await settle();
    expect(readSaved(MODEL)?.["ch.ch1.level"], "the earlier write does not land over it").toBe(-8);
    a.saving.stop();
  });

  it("leaves the hold to another tab once it stops storing", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab());
    await settle();
    // A tab of an earlier version, which holds no lock, stores the unit.
    const theirs = JSON.stringify({ version: 1, model: MODEL, values: { "ch.ch1.level": -20 } });
    window.localStorage.setItem("urx-lcd-sim.state", theirs);
    window.dispatchEvent(new StorageEvent("storage", { key: "urx-lcd-sim.state", newValue: theirs, storageArea: window.localStorage }));
    expect(a.told()).toBe(1);
    const c = await tab(net.tab(), "URX22", { first: "model" });
    await settle();
    expect(lastModel(), "a model picked in another tab is kept").toBe("URX22");
    a.saving.stop();
    c.saving.stop();
  });

  it("takes storing over with a change made while it is still asking for the hold it starts with", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab());
    await settle();
    const b = await tab(net.tab());
    await b.store.set("ch.ch2.level", -5);
    await settle();
    net.deliver();
    await settle();
    expect(a.told(), "the first tab is told").toBe(1);
    vi.advanceTimersByTime(10);
    await settle();
    expect(readSaved(MODEL)?.["ch.ch2.level"]).toBe(-5);
    a.saving.stop();
    b.saving.stop();
  });

  it("hands storing to a tab opened on what was stored with its first change, and tells the tab it takes it from", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab());
    await a.store.set("ch.ch1.level", -9);
    await settle();
    vi.advanceTimersByTime(10);
    await settle();
    const bStore = await unit();
    await restore(bStore, MODEL);
    let bTold = 0;
    const b = startSaving(bStore, MODEL, 10, undefined, () => bTold++, { hold: openHold(net.tab()) });
    await settle();
    expect(a.told(), "opening a second tab takes nothing").toBe(0);
    await bStore.set("ch.ch2.level", -5);
    await settle();
    net.deliver();
    await settle();
    expect(a.told(), "the first tab is told").toBe(1);
    vi.advanceTimersByTime(10);
    await settle();
    expect([readSaved(MODEL)?.["ch.ch1.level"], readSaved(MODEL)?.["ch.ch2.level"]], "the second tab stores what it opened on and its change").toEqual([-9, -5]);
    await a.store.set("ch.ch3.level", -1);
    vi.advanceTimersByTime(10);
    await settle();
    expect(readSaved(MODEL)?.["ch.ch3.level"], "the first tab stores no more").not.toBe(-1);
    expect(bTold).toBe(0);
    a.saving.stop();
    b.stop();
  });

  it("opens next on the model of the unit stored last, over a model picked in a tab that does not store", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const a = await tab(net.tab(), "URX22", { first: "model" });
    await settle();
    const b = await tab(net.tab(), "URX44V", { first: "model" });
    await settle();
    expect(lastModel(), "the second tab's pick is not kept while the first stores").toBe("URX22");
    await a.store.set("ch.ch1.level", -9);
    await settle();
    vi.advanceTimersByTime(10);
    await settle();
    expect(lastModel()).toBe("URX22");
    expect(readSaved("URX22")?.["ch.ch1.level"]).toBe(-9);
    a.saving.stop();
    b.saving.stop();
  });

  it("opens next on the model of the unit stored last, over a model picked first in another tab", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const net = webLocks();
    const b = await tab(net.tab(), "URX44V", { first: "model" });
    await settle();
    const a = await tab(net.tab(), "URX22");
    await settle();
    expect(lastModel(), "a pick is kept in the tab that stores").toBe("URX44V");
    await a.store.set("ch.ch1.level", -9);
    await settle();
    net.deliver();
    await settle();
    expect(b.told(), "the tab that picked is told").toBe(1);
    vi.advanceTimersByTime(10);
    await settle();
    expect(lastModel()).toBe("URX22");
    expect(readSaved("URX22")?.["ch.ch1.level"]).toBe(-9);
    a.saving.stop();
    b.saving.stop();
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
    const took: boolean[] = [];
    const { stop, flush } = startSaving(store, MODEL, 10, (kept) => took.push(kept));
    await store.set("ch.ch1.level", -33);
    flush();
    stop();
    const saved = readSaved(MODEL);
    expect(saved?.["ch.ch1.level"], "the change after the files is stored").toBe(-33);
    for (const path of ["sd.file.F1.urxf", "sd.file.F4.urxf", "scene.Standard.1.state", "scene.Standard.63.state"]) {
      expect(saved?.[path], path).toBe(store.str(path, ""));
    }
    expect(took, "the browser took the write").toEqual([true]);
  });

  it("writes each scene memory's mixer once, however many settings files hold it", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const lengths: number[] = [];
    let scenes = 0;
    for (const files of [0, 1]) {
      const store = await fullUnit(files);
      scenes = store.paths().filter((p) => /^scene\..+\.state$/.test(p)).reduce((sum, p) => sum + store.str(p, "").length, 0);
      window.localStorage.removeItem("urx-lcd-sim.state");
      const { stop, flush } = startSaving(store, MODEL, 10);
      await store.set("ch.ch1.level", -33);
      flush();
      stop();
      lengths.push(window.localStorage.getItem("urx-lcd-sim.state")?.length ?? 0);
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
    await restore(next, MODEL);
    expect([next.str(filePath(file), ""), next.str("scene.Standard.5.state", "")]).toEqual([text, scene]);
  });
});
