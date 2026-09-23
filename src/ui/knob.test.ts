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
  gainSpec,
  logFreqSpec,
  markedDial,
  panSpec,
  scaleSpec,
} from "./param-spec";
import type { AppContext } from "../app/context";
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

  it("leaves a control that is not a fader on its own linear travel", () => {
    // PAN runs -63..63, so centre is halfway round however the fader is scaled.
    const { fill, track } = arcLengths(knobGraphic(fractionOf(panSpec("ch.ch1.pan"), 0)));
    expect(fill / track).toBeCloseTo(0.5, 6);
  });
});
