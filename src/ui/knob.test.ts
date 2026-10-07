import { describe, expect, it } from "vitest";
import {
  A_GAIN_HI_Z_MARKS,
  A_GAIN_HI_Z_MAX_DB,
  A_GAIN_MARKS,
  D_GAIN_MARKS,
  KNOB_START_DEG,
  KNOB_SWEEP_DEG,
  LEVEL_MAX_DB,
  LEVEL_MIN_DB,
  OSC_LEVEL_MARKS,
  type NumericSpec,
  dbSpec,
  faderSpec,
  formatValue,
  gainSpec,
  logFreqSpec,
  markedDial,
  panSpec,
  scaleSpec,
} from "./param-spec";
import type { AppContext } from "../app/context";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { fractionOf, knobControl, knobGraphic } from "./widgets";

/** Where the mark ends up on the clock face: 0 is 12 o'clock, 90 is 3 o'clock. */
function clockAngle(node: HTMLElement): number {
  return ((pointerAngle(node) % 360) + 360) % 360;
}

/** Degrees the mark is turned through from the start of the travel. */
function pointerAngle(node: HTMLElement): number {
  const t = node.querySelector<HTMLElement>(".knob-pointer")?.style.transform ?? "";
  const m = /rotate\((-?[\d.]+)deg\)/.exec(t);
  if (!m?.[1]) throw new Error(`no rotation on the mark: ${t}`);
  return Number(m[1]);
}

/** The lit length and the whole track length, in user units of the arc's circle. */
function arcLengths(node: HTMLElement): { fill: number; track: number } {
  const read = (cls: string): number => {
    const el = node.querySelector(`.${cls}`);
    if (!el) return 0; // an arc with nothing to show is left out entirely
    return Number((el.getAttribute("stroke-dasharray") ?? "").split(" ")[0]);
  };
  return { fill: read("knob-arc-fill"), track: read("knob-arc-track") };
}

const forLevel = (db: number): HTMLElement => knobGraphic(fractionOf(faderSpec("ch.ch1.level", "LEVEL"), db));

describe("the rotary graphic", () => {
  it("leaves the same gap either side of the bottom, so the two ends are level", () => {
    const end = ((KNOB_START_DEG + KNOB_SWEEP_DEG) % 360 + 360) % 360;
    expect(end).toBeCloseTo(360 - KNOB_START_DEG, 6);
  });

  it("stops the mark 150 degrees either side of 12 o'clock", () => {
    expect(clockAngle(knobGraphic(0))).toBeCloseTo(210, 6);
    expect(clockAngle(knobGraphic(1))).toBeCloseTo(150, 6);
  });

  it("turns a rotary given a shorter sweep 135 degrees either side, its track with it", () => {
    expect(clockAngle(knobGraphic(0, 38, 0, 270))).toBeCloseTo(225, 6);
    expect(clockAngle(knobGraphic(1, 38, 0, 270))).toBeCloseTo(135, 6);
    const r = 38 / 2 - 1.75;
    expect(arcLengths(knobGraphic(0.5, 38, 0, 270)).track).toBeCloseTo((270 / 360) * 2 * Math.PI * r, 6);
    expect(arcLengths(knobGraphic(0.5)).track, "the others keep their own").toBeCloseTo((KNOB_SWEEP_DEG / 360) * 2 * Math.PI * r, 6);
  });

  it("points the head amp, PHONES and the oscillator level at their horizontal marks, and A.Gain with HI-Z on at the ends of its range", () => {
    const at = (spec: NumericSpec, v: number): number => clockAngle(knobGraphic(fractionOf(spec, v)));
    const analog = gainSpec("ch.ch1.gain", "A.Gain", -8, 70, -8, A_GAIN_MARKS);
    const hiZ = gainSpec("ch.ch3.gain", "A.Gain", -8, A_GAIN_HI_Z_MAX_DB, -8, A_GAIN_HI_Z_MARKS);
    const digital = gainSpec("ch.ch9.gain", "D.Gain", -24, 24, 0, D_GAIN_MARKS);
    const phones = scaleSpec("phones.1.level", "Phones 1", 2);
    const osc = { ...dbSpec("osc.level", "Level", -96, 0, -14), markAt: markedDial(OSC_LEVEL_MARKS) };
    const cases: [NumericSpec, number, number][] = [
      [analog, 8, 270], [analog, 55, 90], [analog, -8, 210], [digital, -14, 270], [digital, 15, 90], [digital, 0, 357],
      [hiZ, -8, 210], [hiZ, 16, 0], [hiZ, 40, 150],
      [phones, 2, 270], [phones, 8, 90], [phones, 0, 210], [phones, 10, 150],
      [osc, -96, 210], [osc, -50, 270], [osc, -8, 90], [osc, 0, 150], [osc, -29, 0],
    ];
    for (const [spec, v, deg] of cases) expect(at(spec, v), `${spec.label} ${v}`).toBeCloseTo(deg, 0);
  });

  it("puts a fader's marks where the unit does: -40 left, 0.00 right", () => {
    // The slots are not shared out evenly: these two are what the spacing on
    // either side of them is set to reach.
    expect(clockAngle(forLevel(-40))).toBeCloseTo(270, 6);
    expect(clockAngle(forLevel(0))).toBeCloseTo(90, 6);
  });

  it("stops only on the levels a fader offers, and gets finer towards the top", () => {
    const travel = faderSpec("ch.ch1.level", "LEVEL").travel;
    expect(travel, "a fader declares its travel").toBeDefined();
    if (!travel) return;

    // Walk it the way an operator does: one detent at a time from the bottom.
    const stops: number[] = [LEVEL_MIN_DB];
    for (let i = 0; i < 60; i++) {
      const next = travel.step(stops[stops.length - 1] ?? 0, 1);
      if (next === stops[stops.length - 1]) break;
      stops.push(next);
    }
    expect(stops[0]).toBe(LEVEL_MIN_DB); // off
    expect(stops.at(-1)).toBe(LEVEL_MAX_DB);
    expect(stops.slice(1, 8)).toEqual([-96, -80, -72, -64, -56, -48, -40]);
    expect(stops).toContain(0);

    // Every stop is above the one before it, and the tail is coarse where the
    // top is fine — that is what keeps 0 dB in reach of a small movement.
    for (let i = 2; i < stops.length; i++) expect(stops[i]).toBeGreaterThan(stops[i - 1] ?? 0);
    const gap = (i: number): number => (stops[i] ?? 0) - (stops[i - 1] ?? 0);
    expect(gap(3)).toBeGreaterThan(gap(stops.length - 1));
  });

  it("keeps a lit dot at the start of the track at the bottom of its travel only where asked", () => {
    const dot = knobGraphic(0, 38, 0, KNOB_SWEEP_DEG, true).querySelector(".knob-arc-fill");
    expect([dot !== null, dot?.getAttribute("stroke-dasharray")?.split(" ")[0]], "a zero-length lit arc: the dot its round cap paints").toEqual([true, "0"]);
    expect(knobGraphic(0).querySelector(".knob-arc-fill"), "left out by default").toBeNull();
  });

  it("reaches off before the mark runs out of travel", () => {
    // The complaint this replaced: a travel even in dB hit the end of the arc
    // while the value was still far above -INF.
    expect(arcLengths(forLevel(LEVEL_MIN_DB)).fill).toBe(0);
    // Not merely zero-length: a round cap would paint a dot on the track.
    expect(forLevel(LEVEL_MIN_DB).querySelector(".knob-arc-fill")).toBeNull();
    expect(arcLengths(forLevel(-96)).fill).toBeGreaterThan(0);
    expect(clockAngle(forLevel(-96))).toBeGreaterThan(KNOB_START_DEG);
  });

  it("turns the mark clockwise as the value rises", () => {
    const angles = [-40, -20, -6, 0, 5, LEVEL_MAX_DB].map((db) => pointerAngle(forLevel(db)));
    for (let i = 1; i < angles.length; i++) expect(angles[i]).toBeGreaterThan(angles[i - 1] ?? 0);
  });

  it("draws a track with a gap at the bottom, and lights it up to the value", () => {
    const { fill: atMin, track } = arcLengths(forLevel(LEVEL_MIN_DB));
    expect(atMin).toBe(0);
    expect(arcLengths(forLevel(LEVEL_MAX_DB)).fill).toBeCloseTo(track, 6);
    // The rest of the circle is the gap the unit leaves at the bottom, and the
    // circle itself runs at the edge of the graphic: a 38px knob carries a 3px
    // arc whose outer edge lands on 38.
    const circumference = track / (KNOB_SWEEP_DEG / 360);
    const r = circumference / (2 * Math.PI);
    expect(r).toBeCloseTo(38 / 2 - 1.75, 6);
    expect(r + 1.5, "the arc reaches the edge").toBeCloseTo(38 / 2 - 0.25, 6);
  });

  it("lights a pan from the centre of its travel rather than from one end", () => {
    const pan = panSpec("ch.ch1.pan");
    const at = (v: number): number => {
      const node = knobControl(
        { store: { num: () => v }, focus: { take: () => undefined } } as unknown as AppContext,
        pan,
      );
      const { fill } = arcLengths(node);
      return fill;
    };
    // Dead centre lights nothing; either side lights the same length.
    expect(at(0)).toBe(0);
    expect(at(31.5)).toBeCloseTo(at(-31.5), 6);
    expect(at(63)).toBeGreaterThan(at(31.5));

    // A fader, which is placed from one end, lights from the bottom instead.
    expect(arcLengths(forLevel(LEVEL_MIN_DB)).fill).toBe(0);
  });

  it("lights the same fraction of the track as the mark has turned through", () => {
    for (const db of [-30, -12, 0, 6]) {
      const node = forLevel(db);
      const { fill, track } = arcLengths(node);
      const turned = (pointerAngle(node) - KNOB_START_DEG) / KNOB_SWEEP_DEG;
      expect(fill / track).toBeCloseTo(turned, 6);
    }
  });

  it("spaces a frequency control by decade, not by hertz", () => {
    const travel = logFreqSpec("ch.ch1.eq.low.freq", "Freq.", 20, 20000, 1000).travel;
    expect(travel, "a frequency control declares its travel").toBeDefined();
    if (!travel) return;

    expect(travel.position(20)).toBeCloseTo(0, 6);
    expect(travel.position(20000)).toBeCloseTo(1, 6);
    // 20..20000 is three decades, so 200 Hz sits a third of the way along and
    // the middle of the travel is 632 Hz, not the 10 kHz an even travel gives.
    expect(travel.position(200)).toBeCloseTo(1 / 3, 3);
    expect(travel.valueAt(0.5)).toBeGreaterThan(600);
    expect(travel.valueAt(0.5)).toBeLessThan(650);
  });

  it("moves a frequency control on every detent, the bottom decade included", () => {
    const travel = logFreqSpec("ch.ch1.eq.low.freq", "Freq.", 20, 20000, 1000).travel;
    if (!travel) throw new Error("a frequency control declares its travel");

    // A thousandth of three decades is under half a hertz below 73 Hz.
    const stuck: string[] = [];
    for (let v = 20; v <= 72; v++) if (!(travel.step(v, 1) > v)) stuck.push(`${v} up`);
    for (let v = 21; v <= 72; v++) if (!(travel.step(v, -1) < v)) stuck.push(`${v} down`);
    expect(stuck).toEqual([]);
    expect([travel.step(20, -1), travel.step(20000, 1)], "the ends hold").toEqual([20, 20000]);
    expect([travel.step(1000, 1), travel.step(1000, -1)], "higher up a detent stays a thousandth of the travel").toEqual([1007, 993]);

    // Detent by detent from one end to the other and back, every reading new.
    const walk = (from: number, dir: 1 | -1): { end: number; repeats: number; detents: number } => {
      let v = from;
      let repeats = 0;
      let detents = 0;
      while (detents < 5000 && v !== (dir > 0 ? 20000 : 20)) {
        const next = travel.step(v, dir);
        if (next === v) repeats += 1;
        v = next;
        detents += 1;
      }
      return { end: v, repeats, detents };
    };
    const up = walk(20, 1);
    const down = walk(20000, -1);
    expect([up.end, up.repeats, down.end, down.repeats]).toEqual([20000, 0, 20, 0]);
    expect(up.detents, "and it takes fewer detents than hertz").toBeLessThan(1500);
  });

  it("leaves a control that is not a fader on its own linear travel", () => {
    // PAN runs -63..63, so centre is halfway round however the fader is scaled.
    const { fill, track } = arcLengths(knobGraphic(fractionOf(panSpec("ch.ch1.pan"), 0)));
    expect(fill / track).toBeCloseTo(0.5, 6);
  });
});

describe("the stops of a time", () => {
  const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  /** A URX44V's screens, and the values the screen drawn last hands to the readout bar. */
  const mount = async (): Promise<{ shell: Shell; store: DeviceStore; bound: NumericSpec[] }> => {
    const model = unitById("URX44V");
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(model)));
    const shell = new Shell(buildRegistry(), store, model);
    const bound: NumericSpec[] = [];
    const inner = shell.ctx.setKnobs;
    shell.ctx.setKnobs = (specs): void => {
      bound.length = 0;
      for (const s of specs) if (s && "path" in s) bound.push(s);
      inner(specs);
    };
    return { shell, store, bound };
  };

  /**
   * GATE's, COMP's and DUCKER's times as the unit turns them one detent at a time from one end to the other
   * (URX44V, the operator, 2026-10-03): how many stops each has, its two ends and the sum of its stops, counted
   * in the unit its table is whole in (microseconds for Attack, hundredths of a millisecond for Hold, tenths for
   * the rest), so that a stop read otherwise changes the sum. `reads` is what the bottom and the top read. The
   * value each ships at is one of its stops.
   */
  const TIMES = [
    { route: { id: "ch.gate", strip: "ch1" }, label: "Attack", per: 1000, count: 227, ends: [92, 80000], sum: 2707666, reads: ["0.092ms", "80.00ms"] },
    { route: { id: "ch.gate", strip: "ch1" }, label: "Hold", per: 100, count: 214, ends: [2, 196000], sum: 4532608, reads: ["0.02ms", "1.96s"] },
    { route: { id: "ch.gate", strip: "ch1" }, label: "Decay", per: 10, count: 277, ends: [93, 9990], sum: 590007, reads: ["9.3ms", "999.0ms"] },
    { route: { id: "ch.comp", strip: "ch1" }, label: "Attack", per: 1000, count: 227, ends: [92, 80000], sum: 2707666, reads: ["0.092ms", "80.00ms"] },
    { route: { id: "ch.comp", strip: "ch1" }, label: "Release", per: 10, count: 277, ends: [93, 9990], sum: 590007, reads: ["9.3ms", "999.0ms"] },
    { route: { id: "ch.ducker", strip: "ch_5_6" }, label: "Attack", per: 1000, count: 227, ends: [92, 80000], sum: 2707666, reads: ["0.092ms", "80.00ms"] },
    { route: { id: "ch.ducker", strip: "ch_5_6" }, label: "Decay", per: 10, count: 122, ends: [13, 50000], sum: 742257, reads: ["1.3ms", "5.0s"] },
  ] as const;

  /** The control on the screen that turns `label`, and a press of a key on it. */
  const control = (shell: Shell, store: DeviceStore, spec: NumericSpec) => {
    // The value box where the screen has one, and the readout bar's division where it has not.
    const node = shell.root.querySelector<HTMLElement>(
      `[role="spinbutton"][aria-label="${spec.label}"], .knob-strip [role="slider"][aria-label="${spec.label}"]`,
    );
    if (!node) throw new Error(`no control for ${spec.label}`);
    const value = (): number => store.num(spec.path, spec.fallback);
    const press = (key: string, shiftKey = false): number => {
      node.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
      return value();
    };
    /** Every value from the bottom up, one detent at a time, until a detent leaves the value where it stands. */
    const walk = (key: "ArrowUp" | "ArrowDown"): number[] => {
      const seen = [value()];
      for (let n = 0; n < 5000; n++) {
        if (press(key) === seen.at(-1)) break;
        seen.push(value());
      }
      return seen;
    };
    return { value, press, walk };
  };

  it("turns each of GATE's, COMP's and DUCKER's times one stop a detent through the unit's stops, and stops at either end", async () => {
    const { shell, store, bound } = await mount();
    const walked: unknown[] = [];
    for (const t of TIMES) {
      shell.ctx.nav.push(t.route);
      await flush();
      const spec = bound.find((s) => s.label === t.label);
      if (!spec) throw new Error(`${t.route.id} binds no ${t.label}`);
      const { value, press, walk } = control(shell, store, spec);
      const shipped = value();
      press("Home");
      const up = walk("ArrowUp");
      const top = formatValue(spec, up.at(-1) ?? Number.NaN);
      const down = walk("ArrowDown");
      const counted = up.map((v) => Math.round(v * t.per));
      walked.push({
        time: `${t.route.id} ${t.label}`,
        count: counted.length,
        ends: [counted[0], counted.at(-1)],
        sum: counted.reduce((a, b) => a + b, 0),
        rising: counted.every((v, i) => i === 0 || v > (counted[i - 1] ?? v)),
        back: JSON.stringify(down) === JSON.stringify([...up].reverse()),
        reads: [formatValue(spec, down.at(-1) ?? Number.NaN), top],
        shipsOnAStop: up.includes(shipped),
      });
      shell.ctx.nav.back();
      await flush();
    }
    expect(walked, "up from the bottom stop by stop to the top, a detent past it, and back down the same stops").toEqual(
      TIMES.map((t) => ({ time: `${t.route.id} ${t.label}`, count: t.count, ends: t.ends, sum: t.sum, rising: true, back: true, reads: t.reads, shipsOnAStop: true })),
    );
    shell.destroy();
  });

  it("turns each time one stop a detent with Shift, as without it, and stops at either end", async () => {
    const { shell, store, bound } = await mount();
    const shifted: unknown[] = [];
    for (const t of TIMES) {
      shell.ctx.nav.push(t.route);
      await flush();
      const spec = bound.find((s) => s.label === t.label);
      if (!spec) throw new Error(`${t.route.id} binds no ${t.label}`);
      const { press, walk } = control(shell, store, spec);
      press("Home");
      const stops = walk("ArrowUp");
      const last = stops.length - 1;
      const from = async (i: number, key: string): Promise<number> => {
        await store.set(spec.path, stops[i] ?? Number.NaN);
        return stops.indexOf(press(key, true));
      };
      shifted.push({
        time: `${t.route.id} ${t.label}`,
        up: [await from(0, "ArrowUp"), await from(last - 1, "ArrowUp"), await from(last, "ArrowUp")],
        down: [await from(last, "ArrowDown"), await from(1, "ArrowDown"), await from(0, "ArrowDown")],
      });
      shell.ctx.nav.back();
      await flush();
    }
    expect(shifted, "a stop in from either end, onto the end from the stop next to it, and none past it").toEqual(
      TIMES.map((t) => ({ time: `${t.route.id} ${t.label}`, up: [1, t.count - 1, t.count - 1], down: [t.count - 2, 0, 0] })),
    );
    shell.destroy();
  });

  it("runs a drag over a time's stops evenly, counted from 4px off the press", async () => {
    const { shell, store } = await mount();
    const drag = async (selector: string, dx: number, dy: number): Promise<void> => {
      const node = shell.root.querySelector(selector);
      expect(node, selector).not.toBeNull();
      node?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100 + dx, clientY: 100 + dy, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100 + dx, clientY: 100 + dy, bubbles: true }));
      await flush();
    };
    // DUCKER's D grip runs its 122 stops in 192px across: 1.0s is the 100th, 4px past the slop is
    // 4/192 of the 121 steps between the ends (2.5, so 3 stops), 20px is 12.6 stops, and 192px the whole way.
    shell.ctx.nav.push({ id: "ch.ducker", strip: "ch_5_6" });
    await flush();
    const decay = (): number => store.num("ch.ch_5_6.ducker.decay", Number.NaN);
    const moved: number[] = [];
    for (const [from, dx] of [[1000, 4 + 4], [1000, 4 + 20], [1000, -4 - 4], [1.3, 4 + 192], [1.3, 4 + 191]] as const) {
      await store.set("ch.ch_5_6.ducker.decay", from);
      await flush();
      await drag('[aria-label^="D handle"]', dx, 0);
      moved.push(decay());
    }
    expect(moved, "4px and 20px up and 4px down from 1.0s, and 192px and 191px up from the bottom").toEqual([1300, 2600, 850, 5000, 4800]);
    // GATE's Hold box runs its 214 stops in 192px up: 15.30 ms is the 102nd, and 10px is 11.1 stops.
    shell.ctx.nav.replace({ id: "ch.gate", strip: "ch1" });
    await store.set("ch.ch1.gate.hold", 15.3);
    await flush();
    await drag('[role="spinbutton"][aria-label="Hold"]', 0, -4 - 10);
    expect(store.num("ch.ch1.gate.hold", Number.NaN)).toBe(23.6);
    shell.destroy();
  });
});
