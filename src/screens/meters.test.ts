import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { meter } from "../ui/widgets";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { clipSafe, inputMeterId, markClipSafe, meterLevels, oscillatorLevel, setMeterSource, startMeterTicker } from "./meters";

// The ticker redraws the meters a screen already shows. What it writes has to
// read the way the meter was first drawn.

describe("the meter ticker", () => {
  let level = -40;
  const run = (node: HTMLElement): { root: HTMLElement; stop: () => void } => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const root = document.createElement("div");
    root.append(node);
    setMeterSource((_, channels) => Array.from({ length: channels }, () => level));
    return { root, stop: startMeterTicker(new DeviceStore(), root, 50) };
  };
  const dots = (root: HTMLElement): boolean[] =>
    [...root.querySelectorAll(".meter-clip")].map((d) => d.classList.contains("is-on"));
  const unlit = (root: HTMLElement): string[] =>
    [...root.querySelectorAll<HTMLElement>(".meter-bar")].map((b) => b.style.getPropertyValue("--unlit"));

  afterEach(() => {
    setMeterSource(null);
    vi.useRealTimers();
  });

  it("lights the clip dots when the level reaches the top, and puts them out below it", () => {
    level = -40;
    const { root, stop } = run(meter({ levels: [-40, -40], source: "ch1" }));
    expect(dots(root), "drawn below the top").toEqual([false, false]);
    level = 0;
    vi.advanceTimersByTime(60);
    expect(dots(root)).toEqual([true, true]);
    level = -20;
    vi.advanceTimersByTime(60);
    expect(dots(root)).toEqual([false, false]);
    stop();
  });

  it("keeps the offset a meter after a gain stage was built with", () => {
    level = -20;
    const { root, stop } = run(meter({ levels: [-40], source: "ch1", offset: 20 }));
    const before = unlit(root);
    vi.advanceTimersByTime(60);
    expect(unlit(root), "the ticker reads the source 20 dB lower, as the meter was drawn").toEqual(before);
    stop();
  });

    it("keeps the scale a meter was built on", () => {
    level = -60;
    const { root, stop } = run(meter({ levels: [-60], min: -60, max: -6, source: "probe" }));
    level = -33;
    vi.advanceTimersByTime(60);
    expect(unlit(root), "half way up a -60..-6 scale").toEqual(["50%"]);
    expect(dots(root)).toEqual([false]);
    level = -6;
    vi.advanceTimersByTime(60);
    expect([unlit(root), dots(root)], "the top of that scale lights the dot").toEqual([["0%"], [true]]);
    stop();
  });
});

// What the synthetic signal carries besides the strips' own faders.

describe("the oscillator in the meters", () => {
  const unit = async (): Promise<DeviceStore> => {
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
    return store;
  };
  // One moment, so two readings of the wandering signal can be compared.
  const AT = 1_700_000_000_000;
  const loudest = (store: DeviceStore, id: string): number => Math.max(...meterLevels(store, id, 2, AT));

  it("stays silent while it is off", async () => {
    const store = await unit();
    expect(oscillatorLevel(store)).toBe(-96);
  });

  it("puts out the level it is set to", async () => {
    const store = await unit();
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    expect(oscillatorLevel(store)).toBe(-20);
  });

  it("sounds for its width once every interval on Burst Noise", async () => {
    const store = await unit();
    await store.set("osc.on", true);
    await store.set("osc.level", -10);
    await store.set("osc.mode", "Burst Noise");
    await store.set("osc.width", 1);
    await store.set("osc.interval", 4);
    // Read the same burst at the start of an interval and part-way through it.
    expect([oscillatorLevel(store, 8_000), oscillatorLevel(store, 8_500)]).toEqual([-10, -10]);
    expect([oscillatorLevel(store, 9_500), oscillatorLevel(store, 11_900)]).toEqual([-96, -96]);
  });

  it("has a meter of its own that reads what it is putting out", async () => {
    const store = await unit();
    expect(meterLevels(store, "osc", 1), "silent while it is off").toEqual([-96]);
    await store.set("osc.on", true);
    await store.set("osc.level", -30);
    expect(meterLevels(store, "osc", 1)).toEqual([-30]);
  });

  it("lands on the bus it is assigned to and nowhere else", async () => {
    const store = await unit();
    const quiet = loudest(store, "bus.stereo");
    await store.set("osc.on", true);
    await store.set("osc.level", 0);
    expect(loudest(store, "bus.stereo"), "the stereo bus is where it ships").toBeGreaterThan(quiet + 10);
    expect(loudest(store, "bus.mix1"), "and MIX 1 is not").toBeLessThan(-10);

    await store.set("osc.assign.stereoL", false);
    await store.set("osc.assign.stereoR", false);
    await store.set("osc.assign.mix1L", true);
    const [left = -96, right = -96] = meterLevels(store, "bus.mix1", 2, AT);
    expect(left, "a side reads the side it is assigned to").toBeGreaterThan(-10);
    expect(right, "and not the other one").toBeLessThan(-10);
    expect(loudest(store, "bus.stereo"), "and the bus it was taken off is left with the mixer's own").toBeLessThan(-10);
  });
});

describe("the cue bus", () => {
  const unit = async (): Promise<DeviceStore> => {
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
    return store;
  };

  it("reads nothing while nothing is cued", async () => {
    const store = await unit();
    expect(meterLevels(store, "cue", 2)).toEqual([-96, -96]);
  });

  it("carries what is cued, and drops it again when the cue goes", async () => {
    const store = await unit();
    // One moment, so the cue bus and the channel are read of the same instant.
    const at = 1_700_000_000_000;
    // CH 1 is on its MIC/LINE connector: the A.Gain brings it up into the green.
    await store.set("ch.ch1.gain", 24);
    await store.set("ch.ch1.level", 0);
    await store.set("ch.ch1.cue", true);
    const cued = Math.max(...meterLevels(store, "cue", 2, at));
    expect(cued, "a cued channel reaches the cue meter").toBeGreaterThan(-60);
    expect(cued, "at the level the channel is putting out").toBeCloseTo(Math.max(...meterLevels(store, "ch1", 2, at)), 5);
    await store.set("ch.ch1.cue", false);
    expect(meterLevels(store, "cue", 2)).toEqual([-96, -96]);
  });

  it("sums the channels cued together", async () => {
    const store = await unit();
    const at = 1_700_000_000_000;
    for (const id of ["ch1", "ch2"]) await store.set(`ch.${id}.gain`, 24);
    await store.set("ch.ch1.level", 0);
    await store.set("ch.ch2.level", -6);
    await store.set("ch.ch1.cue", true);
    await store.set("ch.ch2.cue", true);
    const [one = -96] = meterLevels(store, "ch1", 1, at);
    const [two = -96] = meterLevels(store, "ch2", 1, at);
    const [cue = -96] = meterLevels(store, "cue", 1, at);
    // Two signals in one bus read as the pair of them, not as the louder.
    expect(cue).toBeCloseTo(10 * Math.log10(10 ** (one / 10) + 10 ** (two / 10)), 5);
    expect(cue, "which is above either of them").toBeGreaterThan(Math.max(one, two));
  });
});

describe("a channel on a MIC/LINE connector", () => {
  const unit = async (): Promise<DeviceStore> => {
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
    return store;
  };
  const at = 1_700_000_000_000;
  const input = (store: DeviceStore, id: string, when = at, channels = 1): number[] => meterLevels(store, inputMeterId(id), channels, when);
  /** The highest the input of `id` reads over ten minutes, read every 100 ms. */
  const peak = (store: DeviceStore, id: string): number =>
    Math.max(...Array.from({ length: 6000 }, (_, i) => input(store, id, at + i * 100)[0] ?? -96));

  it("rises with the connector's A.Gain, before the channel's fader and its ON", async () => {
    const store = await unit();
    await store.set("ch.ch3.gain", 10);
    const [low = 0] = input(store, "ch3");
    const [lowAfter = 0] = meterLevels(store, "ch3", 1, at);
    await store.set("ch.ch3.gain", 30);
    expect((input(store, "ch3")[0] ?? 0) - low, "20 dB more A.Gain, 20 dB more signal").toBeCloseTo(20, 6);
    expect((meterLevels(store, "ch3", 1, at)[0] ?? 0) - lowAfter, "and after the fader as well").toBeCloseTo(20, 6);
    const [arriving = 0] = input(store, "ch3");
    await store.set("ch.ch3.level", -10);
    expect(input(store, "ch3")[0], "the fader leaves the input where it is").toBe(arriving);
    expect(meterLevels(store, "ch3", 1, at)[0], "and takes the channel's level down").toBeCloseTo(arriving - 10, 6);
    await store.set("ch.ch3.on", false);
    expect(input(store, "ch3")[0], "and so does its ON").toBe(arriving);
  });

  it("reads one signal for the connector, whichever channel is on it", async () => {
    const store = await unit();
    await store.set("ch.ch3.gain", 20);
    await store.set("ch.ch4.gain", 30);
    for (const id of ["ch1", "ch2", "ch_5_6"]) await store.set(`ch.${id}.source`, "MIC/LINE 3/4");
    expect(input(store, "ch1"), "CH 1 on MIC/LINE 3").toEqual(input(store, "ch3"));
    expect(input(store, "ch2"), "CH 2 on MIC/LINE 4").toEqual(input(store, "ch4"));
    expect(input(store, "ch_5_6", at, 2), "a stereo channel, one side on each").toEqual([...input(store, "ch3"), ...input(store, "ch4")]);
  });

  it("first reaches the clip level at an A.Gain of +44 dB", async () => {
    const store = await unit();
    await store.set("ch.ch3.gain", 43);
    expect(peak(store, "ch3"), "+43 stays under it").toBeLessThan(0);
    await store.set("ch.ch3.gain", 44);
    expect(peak(store, "ch3"), "+44 reaches it").toBeGreaterThanOrEqual(0);
  });

  it("shows the clip it hears, then holds the signal 23 dB down, with the A.Gain setting where it is", async () => {
    const store = await unit();
    // At +60 the signal is over the clip level all the time, and 23 dB down it is under it.
    await store.set("ch.ch3.gain", 60);
    expect(input(store, "ch3")[0], "Clip Safe off, it clips").toBeGreaterThanOrEqual(0);
    expect(clipSafe(store, 3, at), "and nothing holds it down").toEqual({ engaged: false, reduction: 0 });
    await store.set("ch.ch3.clipSafe", true);
    expect(input(store, "ch3")[0], "the reading that hears the clip still shows it").toBeGreaterThanOrEqual(0);
    expect(clipSafe(store, 3, at), "and Clip Safe engages there").toEqual({ engaged: true, reduction: 0 });
    const [held = 0] = input(store, "ch3", at + 100);
    expect(clipSafe(store, 3, at + 100), "after it").toEqual({ engaged: true, reduction: 23 });
    expect(Math.max(...meterLevels(store, "ch3", 2, at + 100)), "on the channel's own meter too").toBeLessThan(0);
    await store.set("ch.ch3.clipSafe", false);
    expect(held, "23 dB under the signal").toBeCloseTo((input(store, "ch3", at + 100)[0] ?? 0) - 23, 6);
    expect(store.num("ch.ch3.gain", 0), "with the A.Gain left at what it was set to").toBe(60);
  });

  it("hears a clip that only just reaches the clip level", async () => {
    const store = await unit();
    // At +44 the peaks reach the clip level by less than 1 dB.
    await store.set("ch.ch3.gain", 44);
    let t = at;
    while ((input(store, "ch3", t)[0] ?? -96) < 0) {
      t += 50;
      if (t > at + 600_000) throw new Error("no clip in ten minutes");
    }
    await store.set("ch.ch3.clipSafe", true);
    expect(clipSafe(store, 3, t).engaged).toBe(true);
  });

  it("holds the signal down until 5 s after the last clip", async () => {
    const store = await unit();
    await store.set("ch.ch3.gain", 60);
    await store.set("ch.ch3.clipSafe", true);
    expect(clipSafe(store, 3, at).engaged).toBe(true);
    // Turned down to where it never clips, the last clip stays the one at `at`.
    await store.set("ch.ch3.gain", 0);
    expect(clipSafe(store, 3, at + 4_900), "just short of 5 s").toEqual({ engaged: true, reduction: 23 });
    expect(clipSafe(store, 3, at + 5_100), "just past 5 s").toEqual({ engaged: false, reduction: 0 });
    const [released = 0] = input(store, "ch3", at + 5_100);
    await store.set("ch.ch3.clipSafe", false);
    expect(input(store, "ch3", at + 5_100)[0], "released, the signal is back where it is without Clip Safe").toBe(released);
  });

  it("stays engaged while the signal keeps clipping", async () => {
    const store = await unit();
    await store.set("ch.ch3.clipSafe", true);
    // At +60 the signal clips again as soon as it is let back up.
    await store.set("ch.ch3.gain", 60);
    expect(clipSafe(store, 3, at).engaged).toBe(true);
    expect(clipSafe(store, 3, at + 5_100), "let back up, it clips and stays engaged").toEqual({ engaged: true, reduction: 0 });
    expect(clipSafe(store, 3, at + 5_200).reduction, "and is held down again").toBe(23);
    // At +80 the signal clips even 23 dB down, and each of those clips starts the 5 s again.
    await store.set("ch.ch3.gain", 80);
    expect(input(store, "ch3", at + 8_000)[0], "a clip through the hold shows").toBeGreaterThanOrEqual(0);
    expect(clipSafe(store, 3, at + 12_000), "past 5 s from the clip at 5.1 s, within 5 s of the one at 8 s").toEqual({ engaged: true, reduction: 23 });
  });

  it("forgets what it heard when Clip Safe is switched off", async () => {
    const store = await unit();
    await store.set("ch.ch3.gain", 60);
    await store.set("ch.ch3.clipSafe", true);
    expect(clipSafe(store, 3, at).engaged).toBe(true);
    await store.set("ch.ch3.gain", 0);
    await store.set("ch.ch3.clipSafe", false);
    expect(clipSafe(store, 3, at + 100).engaged, "off").toBe(false);
    await store.set("ch.ch3.clipSafe", true);
    expect(clipSafe(store, 3, at + 200).engaged, "on again, over a signal that does not clip").toBe(false);
  });
});

describe("the ticker and Clip Safe", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("turns a Clip Safe switch orange and back as it engages and lets go, with reduced motion as well", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
    const connector = unitById("URX44V").inputs.find((s) => s.id === "ch3");
    if (!connector) throw new Error("CH 3");
    await store.set("ch.ch3.gain", 60);
    await store.set("ch.ch3.clipSafe", true);
    const root = document.createElement("div");
    const button = markClipSafe(store, document.createElement("button"), connector);
    const bar = meter({ levels: [-40], source: "ch1" });
    root.append(button, bar);
    const unlit = (): string => bar.querySelector<HTMLElement>(".meter-bar")?.style.getPropertyValue("--unlit") ?? "";
    const drawn = unlit();
    expect([button.classList.contains("is-engaged"), button.getAttribute("aria-description")], "drawn engaged").toEqual([true, "holding the gain down"]);
    const stop = startMeterTicker(store, root, 50);
    await store.set("ch.ch3.gain", 0);
    vi.setSystemTime(Date.now() + 4_500);
    vi.advanceTimersByTime(60);
    expect(button.classList.contains("is-engaged"), "still within 5 s of the last clip").toBe(true);
    vi.setSystemTime(Date.now() + 1000);
    vi.advanceTimersByTime(60);
    expect([button.classList.contains("is-engaged"), button.getAttribute("aria-description")], "let go").toEqual([false, null]);
    expect(unlit(), "while the meters stay as they were drawn").toBe(drawn);
    stop();
  });
});
