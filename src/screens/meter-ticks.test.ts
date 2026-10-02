import { afterEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { grBarShare, levelBarShare } from "../model/dynamics";
import type { Route } from "../app/navigator";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { SILENT_DB } from "../model/signal";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { blockLampState, blockReduction, meterLevels, setMeterSource, shownLevels, startMeterTicker } from "./meters";
import { CLIP_DB, PLAYBACK_METER, compSpec, gateSpec } from "./signal-flow";

// What a screen shows of a moving signal outside the dynamics screens' own meters:
// the pair of lamps on a HOME strip, the channel view's GATE and DUCKER lamps and
// COMP bars, the M.B.Comp bands' reduction bars and the RECORDER's track meters.
// Each is taken from silence to 0 dB and back, and reads the same after the meter
// ticker has run as after the screen is opened afresh. The levels are set per
// strip, whichever point on it a meter reads.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let levels: Record<string, number> = {};
afterEach(() => {
  setMeterSource(null);
  vi.useRealTimers();
});

async function mount(): Promise<Shell> {
  levels = {};
  setMeterSource((id, channels) => Array.from({ length: channels }, () => levels[id.split("@")[0] ?? ""] ?? -96));
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return shell;
}

async function open(shell: Shell, routes: Route[]): Promise<void> {
  shell.ctx.nav.home();
  for (const r of routes) shell.ctx.nav.push(r);
  await flush();
}

/**
 * Move meter `id` from silence to 0 dB and back. After each step the ticker runs for
 * long enough that a falling bar has come to rest, and `read` is taken, then the
 * screen is opened again and `read` is taken again: the two agree, 0 dB reads other
 * than silence, and silence reads as it did at the start.
 */
async function follow(shell: Shell, routes: Route[], id: string, read: () => unknown): Promise<void> {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  levels[id] = -96;
  await open(shell, routes);
  const silent = read();
  for (const [step, db] of [["at 0 dB", 0], ["back in silence", -96]] as const) {
    levels[id] = db;
    const stop = startMeterTicker(shell.ctx.store, shell.root, 200);
    vi.advanceTimersByTime(4000);
    stop();
    const ticked = read();
    await open(shell, routes);
    expect(ticked, `${step}: the ticker reads what the screen reads when opened`).toEqual(read());
    if (db === 0) expect(ticked, `${step}: the view moves`).not.toEqual(silent);
    else expect(ticked, `${step}: as it read at the start`).toEqual(silent);
  }
}

const classes = (shell: Shell, selector: string): string[] => [...shell.root.querySelectorAll(selector)].map((n) => n.className);
const widths = (shell: Shell, selector: string): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].map((n) => n.style.width);
const heights = (shell: Shell, selector: string): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].map((n) => n.style.height);
const unlit = (shell: Shell, selector: string): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].map((n) => n.style.getPropertyValue("--unlit"));

describe("views that follow the signal as the meters move", () => {
  it("lights the pair of lamps at the top of a HOME strip's indicator block", async () => {
    const shell = await mount();
    const lamps = (): boolean[] =>
      [...shell.root.querySelectorAll('[data-lamp-source="ch1@input"] .dot')].map((n) => n.classList.contains("is-on"));
    await follow(shell, [], "ch1", lamps);

    // At -20 dB the left one lights alone, and it goes out once the channel is silent again.
    for (const [db, lit] of [
      [-20, [true, false]],
      [-96, [false, false]],
    ] as const) {
      levels["ch1"] = db;
      const stop = startMeterTicker(shell.ctx.store, shell.root, 200);
      vi.advanceTimersByTime(4000);
      stop();
      expect(lamps(), `at ${db} dB`).toEqual(lit);
    }
  });

  it("lights the channel view's GATE lamps", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.gate.on", true);
    await follow(shell, [{ id: "channel-view", strip: "ch1" }], "ch1", () => classes(shell, ".block-lamps .block-lamp"));
  });

  it("lights the channel view's DUCKER lamps from the key", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch_5_6.ducker.on", true);
    await follow(shell, [{ id: "channel-view", strip: "ch_5_6" }], "ch1", () => classes(shell, ".block-lamps .block-lamp"));
  });

  it("moves the channel view's COMP level and reduction bars", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.comp.on", true);
    await shell.ctx.store.set("ch.ch1.comp.threshold", -40);
    await follow(shell, [{ id: "channel-view", strip: "ch1" }], "ch1", () => widths(shell, ".comp-meters .comp-bar i"));

    // At 0 dB the level bar is full, and the reduction bar reads on the reduction
    // bars' scale what the compressor takes off before the makeup.
    levels["ch1"] = 0;
    await open(shell, [{ id: "channel-view", strip: "ch1" }]);
    const [level, reduce] = widths(shell, ".comp-meters .comp-bar i");
    const strip = shell.ctx.model.inputs[0];
    const reduction = strip ? blockReduction(shell.ctx.store, compSpec(shell.ctx, strip)) : 0;
    expect(level).toBe("100%");
    expect(reduction).toBeGreaterThan(0);
    expect(Number.parseFloat(reduce ?? "NaN")).toBeCloseTo(grBarShare(reduction) * 100, 6);

    // At -20 dB the level bar reaches where its own scale puts -20 dB, once it
    // has fallen there from 0 dB.
    levels["ch1"] = -20;
    vi.setSystemTime(Date.now() + 1000);
    await open(shell, [{ id: "channel-view", strip: "ch1" }]);
    expect(widths(shell, ".comp-meters .comp-bar i")[0]).toBe(`${levelBarShare(-20) * 100}%`);
  });

  it("moves each M.B.Comp band's reduction bar", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stereo.insFx.effect", "M.B.Comp");
    await shell.ctx.store.set("ch.bus.stereo.insFx.on", true);
    await follow(
      shell,
      [
        { id: "channel-view", strip: "bus.stereo" },
        { id: "ch.insfx", strip: "bus.stereo" },
      ],
      "bus.stereo",
      () => heights(shell, ".mbc-gr-bars .dyn-gr i"),
    );
  });

  it("moves a record track's meter with the pair it records", async () => {
    const shell = await mount();
    await shell.ctx.store.set("sd.track.0", "CH 1/2");
    await follow(shell, [{ id: "microsd.recorder" }], "ch1", () => unlit(shell, ".rec-slot .rec-slot-meter .meter-bar").slice(0, 2));
  });
});

// A bar falls 30 dB a second as the ticker moves it. An edit in the middle of the
// fall draws the screen again, and the bars it draws stand where the ticker had
// them and fall on from there.

describe("a falling bar on a screen drawn again", () => {
  const at = (db: number): string => `${(1 - levelBarShare(db)) * 100}%`;

  /**
   * The meters set per strip in `strips` from -4 dB into silence, an edit to CH 1's
   * PAN two ticks into the fall, and one tick more. `drawn` names a node the
   * screen draws afresh.
   */
  async function fall(
    shell: Shell,
    routes: Route[],
    strips: readonly string[],
    drawn: string,
    read: () => unknown,
    shown: (db: number) => unknown,
  ): Promise<void> {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    for (const s of strips) levels[s] = -4;
    await open(shell, routes);
    const stop = startMeterTicker(shell.ctx.store, shell.root, 100);
    try {
      vi.advanceTimersByTime(100);
      expect(read(), "at -4 dB").toEqual(shown(-4));
      for (const s of strips) levels[s] = -96;
      vi.advanceTimersByTime(200);
      expect(read(), "falling 3 dB a tick").toEqual(shown(-10));
      const before = shell.root.querySelector(drawn);
      expect(before, "the node the screen draws").not.toBeNull();
      await shell.ctx.store.set("ch.ch1.pan", shell.ctx.store.num("ch.ch1.pan", 0) + 5);
      await flush();
      expect(before?.isConnected, "the edit draws the screen again").toBe(false);
      expect(read(), "drawn where the ticker had it").toEqual(shown(-10));
      vi.advanceTimersByTime(100);
      expect(read(), "and falling on from there").toEqual(shown(-13));
    } finally {
      stop();
    }
  }

  it("keeps HOME's strip meter, signal dot and STEREO meter falling", async () => {
    const shell = await mount();
    await fall(
      shell,
      [],
      ["ch1", "bus.stereo"],
      '[data-meter-source="ch1@preFader"]',
      () => ({
        meter: unlit(shell, '[data-meter-source="ch1@preFader"] .meter-bar'),
        dot: shell.root.querySelector('[data-lamp-source="ch1@input"] .dot-signal')?.classList.contains("is-on"),
        stereo: unlit(shell, '.master-meter [data-meter-source="bus.stereo"] .meter-bar'),
      }),
      (db) => ({ meter: [at(db)], dot: true, stereo: [at(db), at(db)] }),
    );
  });

  it("keeps the channel view's LEVEL meter, input meter and COMP level bar falling", async () => {
    const shell = await mount();
    await fall(
      shell,
      [{ id: "channel-view", strip: "ch1" }],
      ["ch1"],
      '[data-meter-source="ch1"]',
      () => ({
        level: unlit(shell, '.cv-onoff [data-meter-source="ch1"] .meter-bar'),
        input: unlit(shell, '.cv-gain-row [data-meter-source="ch1@input"] .meter-bar'),
        comp: widths(shell, ".comp-meters .comp-bar:not(.comp-reduce) i"),
      }),
      (db) => ({ level: [at(db)], input: [at(db)], comp: [`${levelBarShare(db) * 100}%`] }),
    );
  });

  it("keeps the meters on INPUT, a block screen, SSMCS's side chain, MONITOR, the oscillator and a record track falling", async () => {
    const cases: [string, Route[], string[], string, number][] = [
      ["CH 6's INPUT", [{ id: "channel-view", strip: "ch_5_6" }, { id: "ch.input", strip: "ch_5_6" }], ["ch_5_6"], ".input-meter .meter-bar", 2],
      ["GATE's IN and OUT", [{ id: "channel-view", strip: "ch1" }, { id: "ch.gate", strip: "ch1" }], ["ch1"], ".dyn-io .meter-bar", 2],
      ["SSMCS's side chain", [{ id: "channel-view", strip: "ch1" }, { id: "ch.ssmcs.sc", strip: "ch1" }], ["ch1"], ".ssmcs-sc-meter .meter-bar", 1],
      ["MONITOR's buses", [{ id: "monitor.level" }], ["monitor.1", "monitor.2"], ".mon-meter .meter-bar", 4],
      ["the oscillator", [{ id: "monitor.osc" }], ["osc"], ".osc-meter .meter-bar", 1],
      ["a record track", [{ id: "microsd.recorder" }], ["ch1", "ch2"], ".rec-slot:first-child .rec-slot-meter .meter-bar", 2],
    ];
    for (const [name, routes, strips, selector, bars] of cases) {
      const shell = await mount();
      await shell.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
      await shell.ctx.store.set("sd.track.0", "CH 1/2");
      await shell.ctx.store.set("ui.lane.ch_5_6", 1);
      await fall(shell, routes, strips, selector, () => [name, unlit(shell, selector)], (db) => [name, Array(bars).fill(at(db))]);
      vi.useRealTimers();
    }
  });

  it("keeps RECORDER's OUT meter falling", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.sdTab", "Play");
    await fall(shell, [{ id: "microsd.recorder" }], [PLAYBACK_METER], ".sd-out .meter", () => unlit(shell, ".sd-out .meter-bar"), (db) => [at(db), at(db)]);
  });

  it("draws what the meter reads while reduced motion holds the meters still", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    try {
      const shell = await mount();
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      levels["ch1"] = -4;
      await open(shell, [{ id: "channel-view", strip: "ch1" }]);
      expect(unlit(shell, '.cv-onoff [data-meter-source="ch1"] .meter-bar'), "at -4 dB").toEqual([at(-4)]);
      levels["ch1"] = -96;
      vi.setSystemTime(Date.now() + 100);
      await shell.ctx.store.set("ch.ch1.pan", 5);
      await flush();
      expect(unlit(shell, '.cv-onoff [data-meter-source="ch1"] .meter-bar'), "silent at once").toEqual(["100%"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// A device's meter stream carries whatever it carries. A reading that is not a
// number reads as nothing and one of +Infinity as a clip, and the bars go on
// from the next reading as they would from those.

describe("a meter stream that reads something other than a number", () => {
  const at = (db: number): string => `${(1 - levelBarShare(db)) * 100}%`;

  it("takes HOME's strip meter, its clip mark and its dots on from the next reading", async () => {
    const cases: [string, number, number][] = [
      // A moment of silence, -96 dB, is the reading the others are set against.
      ["silence", -96, -13],
      ["not a number", Number.NaN, -13],
      ["+Infinity", Number.POSITIVE_INFINITY, 0],
    ];
    for (const [name, odd, dropped] of cases) {
      const shell = await mount();
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      await open(shell, []);
      const read = (): unknown => ({
        meter: unlit(shell, '[data-meter-source="ch1@preFader"] .meter-bar'),
        over: shell.root.querySelector('[data-meter-source="ch1@preFader"] .meter-clip')?.classList.contains("is-on"),
        signal: shell.root.querySelector('[data-lamp-source="ch1@input"] .dot-signal')?.classList.contains("is-on"),
        clip: shell.root.querySelector('[data-lamp-source="ch1@input"] .dot-clip')?.classList.contains("is-on"),
      });
      const shown = (db: number): unknown => ({ meter: [at(db)], over: db >= 0, signal: true, clip: db >= 0 });
      const stop = startMeterTicker(shell.ctx.store, shell.root, 100);
      try {
        levels["ch1"] = -10;
        vi.advanceTimersByTime(100);
        expect(read(), `${name}: at -10 dB`).toEqual(shown(-10));
        levels["ch1"] = odd;
        vi.advanceTimersByTime(100);
        expect(read(), `${name}: the reading itself`).toEqual(shown(dropped));
        levels["ch1"] = -10;
        vi.advanceTimersByTime(100);
        expect(read(), `${name}: the next reading, falling 3 dB a tick to it`).toEqual(shown(Math.max(-10, dropped - 3)));
        vi.advanceTimersByTime(300);
        expect(read(), `${name}: at -10 dB again`).toEqual(shown(-10));
      } finally {
        stop();
        vi.useRealTimers();
      }
    }
  });

  it("reads it the same wherever the meter is read, the gate's detector included", async () => {
    const shell = await mount();
    const strip = shell.ctx.model.inputs[0];
    expect(strip).toBeDefined();
    if (!strip) return;
    await shell.ctx.store.set("ch.ch1.gate.on", true);
    const read = (db: number): unknown => {
      levels["ch1"] = db;
      return { meter: meterLevels(shell.ctx.store, "ch1@preFader", 1), lamps: blockLampState(shell.ctx.store, gateSpec(shell.ctx, strip)) };
    };
    expect(read(Number.NaN), "not a number, as silence").toEqual(read(SILENT_DB));
    expect(read(Number.POSITIVE_INFINITY), "+Infinity, as a clip").toEqual(read(CLIP_DB));
  });

  it("holds nothing over from a reading taken at no moment", async () => {
    const shell = await mount();
    levels["ch1"] = -10;
    expect(shownLevels(shell.ctx.store, "ch1", 1, 1000)).toEqual([-10]);
    expect(shownLevels(shell.ctx.store, "ch1", 1, Number.NaN), "the reading itself").toEqual([-10]);
    expect(shownLevels(shell.ctx.store, "ch1", 1, 1100), "the next reading").toEqual([-10]);
  });
});
