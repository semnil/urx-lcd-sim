// What a knob needs to know about a value: how far it goes, how big one detent
// is, and how the unit prints it. Screens declare these; the knob widgets and
// the TOUCH AND TURN / multi-function knob bindings all read the same spec, so a
// parameter cannot behave one way under a finger and another under a knob.

import type { ParamPath } from "../device/path";
import { path } from "../device/path";
import { OFF_MARK, formatDb, formatGain, formatHz, formatLevel, formatPan, hzUnit } from "./dom";

export interface NumericSpec {
  path: ParamPath;
  /** Short label under the multi-function knob, e.g. "A.Gain". */
  label: string;
  min: number;
  max: number;
  /** Value change for one encoder detent. */
  step: number;
  /** Coarser step while the knob is turned quickly. */
  fastStep?: number;
  fallback: number;
  format(value: number): string;
  /** Unit suffix shown in the knob strip, e.g. "dB". A time changes unit with
   * its value, so this may be read from the value. */
  unit?: string | ((value: number) => string);
  /** Unit suffix a value box shows, where the box prints a shorter one. */
  boxUnit?: string | ((value: number) => string);
  /**
   * A control whose travel is not linear in its value. Absent means the travel
   * runs evenly over [min, max].
   */
  travel?: Travel;
  /**
   * Where the mark points for a value, as a fraction of the travel, where that is
   * not the value's place in its range. A drag and a detent still move the value
   * evenly.
   */
  markAt?: (value: number) => number;
  /** How far the rotary turns, in degrees centred on 12 o'clock, where it turns less than the others. */
  sweep?: number;
  /** The name the focus goes by, where several controls turn one value in units of their own. */
  focusKey?: string;
  /** Placed from the middle of its travel, as a pan or a balance is. */
  centred?: boolean;
  /** A value the unit is holding itself: the control shows it and does not turn it. */
  locked?: boolean;
}

/** How a control's value maps onto its travel, 0 at the start and 1 at the end. */
export interface Travel {
  position(value: number): number;
  /** The value at `position` — always one the control can stop on. */
  valueAt(position: number): number;
  /** `value` moved `detents` stops along the travel. */
  step(value: number, detents: number): number;
}

const clamp01 = (p: number): number => Math.min(1, Math.max(0, p));

/** The value a control stops on, as the unit steps it through a table of settings. */
export function stopsTravel(values: readonly number[]): Travel {
  const last = values.length - 1;
  const indexOf = (value: number): number => {
    if (!Number.isFinite(value)) return last;
    let best = 0;
    for (let i = 1; i <= last; i++) {
      if (Math.abs((values[i] ?? 0) - value) < Math.abs((values[best] ?? 0) - value)) best = i;
    }
    return best;
  };
  const at = (i: number): number => values[Math.min(last, Math.max(0, i))] ?? 0;
  return {
    position: (value) => indexOf(value) / last,
    valueAt: (p) => at(Math.round(clamp01(p) * last)),
    // Stops that hold one value in a row are stepped off from the far end of
    // the row, so each step moves the value on.
    step: (value, detents) => {
      let i = indexOf(value);
      const dir = Math.sign(detents);
      while (dir !== 0 && values[i + dir] === values[i]) i += dir;
      return at(i + detents);
    },
  };
}

/** A table of `count` stops, the value at each. */
export const steps = (count: number, at: (i: number) => number): number[] => Array.from({ length: count }, (_, i) => at(i));

/** A stop the table holds exactly, so a value read back sits on it. */
export const round = (v: number, digits: number): number => Number(v.toFixed(digits));

/**
 * The rotary's travel, in degrees clockwise from 12 o'clock. The track leaves a
 * gap centred on the bottom, so its two ends sit at the same height.
 */
const KNOB_GAP_DEG = 60;

/** How wide a rotary is drawn where the screen sets no other size. */
export const KNOB_SIZE = 38;

export const KNOB_SWEEP_DEG = 360 - KNOB_GAP_DEG;
export const KNOB_START_DEG = 180 + KNOB_GAP_DEG / 2;

/** A value and the angle its mark points at, in degrees clockwise from 12 o'clock. */
export type Mark = readonly [value: number, angle: number];

/**
 * The mark's place on the travel for a value, from marks in rising order: between
 * two marks it turns evenly, before the first and after the last it keeps their
 * slope, and it stops at the two ends of the travel.
 */
export function markedDial(marks: readonly Mark[]): (value: number) => number {
  return (value) => {
    let i = 0;
    while (i < marks.length - 2 && value > (marks[i + 1]?.[0] ?? 0)) i++;
    const [v0, a0] = marks[i] ?? [0, 0];
    const [v1, a1] = marks[i + 1] ?? [1, 0];
    const angle = a0 + ((value - v0) / (v1 - v0)) * (a1 - a0);
    return clamp01((angle - (KNOB_START_DEG - 360)) / KNOB_SWEEP_DEG);
  };
}

/** The head amp's horizontal marks: A.Gain +8 dB left and +55 dB right, D.Gain -14 dB left and +15 dB right. */
export const A_GAIN_MARKS: readonly Mark[] = [[8, -90], [55, 90]];
export const D_GAIN_MARKS: readonly Mark[] = [[-14, -90], [15, 90]];

/** The top of A.Gain while the connector's HI-Z is on. */
export const A_GAIN_HI_Z_MAX_DB = 40;

/** A.Gain with HI-Z on: -8 dB at the start of the travel and +40 dB at its end. */
export const A_GAIN_HI_Z_MARKS: readonly Mark[] = [[-8, -150], [A_GAIN_HI_Z_MAX_DB, 150]];

/** The oscillator level: -96 dB at the start, -50 dB left, -8 dB right, 0 dB at the end. */
export const OSC_LEVEL_MARKS: readonly Mark[] = [[-96, -150], [-50, -90], [-8, 90], [0, 150]];

/** The range a fader covers. */
export const LEVEL_MIN_DB = -96.5;
export const LEVEL_MAX_DB = 10;

/**
 * The levels a fader stops at: wide steps down in the tail and fine ones around
 * 0 dB, so the travel spends its length where the ear needs it. Slot 0 is off
 * (-∞) and the list fills the slots above it.
 */
const LEVEL_STEPS_DB = [
  -96, -80, -72, -64, -56, -48, -40, -36, -32, -30, -28, -25.6, -24, -22.4, -20, -18, -16, -14, -12, -10, -8.8, -7.2,
  -6, -5, -4, -3.2, -2, -1.2, -0.4, 0, 0.4, 1.2, 2, 3.2, 4, 5, 6, 7.2, 8.8, 10,
];
const LEVEL_SLOTS = LEVEL_STEPS_DB.length;

/** Which slot a level sits in, fractional between two steps. Slot 0 is off. */
function levelSlot(db: number): number {
  if (!Number.isFinite(db) || db <= LEVEL_MIN_DB) return 0;
  const lowest = LEVEL_STEPS_DB[0] ?? LEVEL_MIN_DB;
  if (db <= lowest) return 1;
  for (let i = 0; i < LEVEL_SLOTS - 1; i++) {
    const lo = LEVEL_STEPS_DB[i] ?? 0;
    const hi = LEVEL_STEPS_DB[i + 1] ?? 0;
    if (db <= hi) return i + 1 + (db - lo) / (hi - lo);
  }
  return LEVEL_SLOTS;
}

const levelSlotOf = (db: number): number => LEVEL_STEPS_DB.indexOf(db) + 1;

/**
 * The travel is not shared out evenly between the slots: two of the fader's
 * marks sit where the unit puts them — -40 dB horizontal left, 0 dB horizontal
 * right — and the slots either side of each are spaced to reach them. The three
 * runs come out at roughly 8.6, 7.8 and 6.0 degrees a slot.
 */
const LEVEL_ANCHORS: readonly (readonly [number, number])[] = [
  [0, 0],
  [levelSlotOf(-40), (270 - KNOB_START_DEG) / KNOB_SWEEP_DEG],
  [levelSlotOf(0), (360 + 90 - KNOB_START_DEG) / KNOB_SWEEP_DEG],
  [LEVEL_SLOTS, 1],
];

/** Slot (fractional) to travel, following the anchors. */
function slotPosition(slot: number): number {
  for (let i = 0; i < LEVEL_ANCHORS.length - 1; i++) {
    const [s0, p0] = LEVEL_ANCHORS[i] ?? [0, 0];
    const [s1, p1] = LEVEL_ANCHORS[i + 1] ?? [1, 1];
    if (slot <= s1) return p0 + ((slot - s0) / (s1 - s0)) * (p1 - p0);
  }
  return 1;
}

/** Travel back to a slot — the inverse of `slotPosition`. */
function positionSlot(position: number): number {
  for (let i = 0; i < LEVEL_ANCHORS.length - 1; i++) {
    const [s0, p0] = LEVEL_ANCHORS[i] ?? [0, 0];
    const [s1, p1] = LEVEL_ANCHORS[i + 1] ?? [1, 1];
    if (position <= p1) return s0 + ((position - p0) / (p1 - p0)) * (s1 - s0);
  }
  return LEVEL_SLOTS;
}

/** The level in a slot: one of the steps, or off below them. */
function levelInSlot(slot: number): number {
  const s = Math.round(Math.min(LEVEL_SLOTS, Math.max(0, slot)));
  return s <= 0 ? LEVEL_MIN_DB : (LEVEL_STEPS_DB[s - 1] ?? LEVEL_MAX_DB);
}

const FADER_TRAVEL: Travel = {
  position: (db) => slotPosition(levelSlot(db)),
  valueAt: (p) => levelInSlot(positionSlot(clamp01(p))),
  step: (db, detents) => levelInSlot(Math.round(levelSlot(db)) + detents),
};

/**
 * What a control prints for a value: the value and the unit it is measured in.
 * A level that is off is not a number of anything, so it carries no unit.
 */
export function formatValue(spec: NumericSpec, value: number): string {
  const text = spec.format(value);
  return text === OFF_MARK ? text : text + unitOf(spec.unit, value);
}

/** The suffix a unit comes to for a value. */
export function unitOf(unit: NumericSpec["unit"], value: number): string {
  return typeof unit === "function" ? unit(value) : (unit ?? "");
}

export function dbSpec(
  path: ParamPath,
  label: string,
  min: number,
  max: number,
  fallback = 0,
  step = 0.2,
  digits = 2,
): NumericSpec {
  return {
    path,
    label,
    min,
    max,
    step,
    fastStep: step * 5,
    fallback,
    format: (v) => formatDb(v, digits),
    unit: "dB",
  };
}

/** The head amp of an input channel: whole dB, and the unit prints the sign. Its mark follows `marks`. */
export function gainSpec(path: ParamPath, label: string, min: number, max: number, fallback: number, marks: readonly Mark[]): NumericSpec {
  return { ...dbSpec(path, label, min, max, fallback, 1), format: formatGain, fastStep: 5, markAt: markedDial(marks) };
}

/**
 * A fader — a channel, send or monitor level. Its travel covers only the top of
 * the range, so 0 dB sits about four fifths of the way round rather than near
 * the end, and everything below the travel sits at the start.
 */
export function faderSpec(path: ParamPath, label: string, fallback = 0): NumericSpec {
  return { ...dbSpec(path, label, LEVEL_MIN_DB, LEVEL_MAX_DB, fallback), travel: FADER_TRAVEL, format: formatLevel };
}

export function panSpec(path: ParamPath, label = "PAN"): NumericSpec {
  return { path, label, min: -63, max: 63, step: 1, fastStep: 4, fallback: 0, format: formatPan, centred: true };
}

/**
 * A frequency control. Its travel is logarithmic: three decades of it cannot be
 * resolved at the bottom by an even one, so the steps are equal divisions of the
 * log range instead.
 */
export function logFreqSpec(path: ParamPath, label: string, min: number, max: number, fallback: number): NumericSpec {
  const span = Math.log(max / min);
  const position = (v: number): number => clamp01(Math.log(Math.max(v, min) / min) / span);
  const valueAt = (p: number): number => Math.round(min * Math.exp(span * clamp01(p)));
  return {
    ...freqSpec(path, label, min, max, fallback),
    travel: { position, valueAt, step: (v, detents) => valueAt(position(v) + detents / 1000) },
  };
}

export function freqSpec(
  path: ParamPath,
  label: string,
  min: number,
  max: number,
  fallback: number,
  step = 1,
): NumericSpec {
  return { path, label, min, max, step, fastStep: step === 1 ? 10 : step, fallback, format: formatHz, unit: hzUnit };
}

/**
 * The screen backlight. 0 is a real setting on the unit, not "off": the glass
 * stays readable there. Three places read it — the Brightness screen, the knob
 * it can be assigned to, and the shell that dims the glass — so the range lives
 * here rather than in each.
 */
export const BRIGHTNESS_MAX = 10;

export function brightnessSpec(): NumericSpec {
  return intSpec(path("setup", "brightness"), "Screen", 0, BRIGHTNESS_MAX, BRIGHTNESS_MAX);
}

export function intSpec(
  path: ParamPath,
  label: string,
  min: number,
  max: number,
  fallback: number,
  unit?: string,
): NumericSpec {
  return {
    path,
    label,
    min,
    max,
    step: 1,
    fallback,
    format: (v) => String(Math.round(v)),
    ...(unit === undefined ? {} : { unit }),
  };
}

/** A plain 0.0-10.0 scale, as the PHONES level is marked: its even travel points 2.0 left and 8.0 right. */
export function scaleSpec(path: ParamPath, label: string, fallback: number): NumericSpec {
  return {
    path,
    label,
    min: 0,
    max: 10,
    step: 0.1,
    fastStep: 1,
    fallback,
    format: (v) => v.toFixed(1),
  };
}

/**
 * A time in milliseconds. A control whose range runs past a second prints the
 * long end of it in seconds, so the unit is part of what the value prints and
 * the box carries the same short form the unit uses.
 */
export function msSpec(
  path: ParamPath,
  label: string,
  min: number,
  max: number,
  fallback: number,
  step = 0.1,
  digits = 2,
): NumericSpec {
  const seconds = max > MS_IN_SECOND;
  const long = (v: number): boolean => seconds && v >= MS_IN_SECOND;
  return {
    path,
    label,
    min,
    max,
    step,
    fastStep: step * 10,
    fallback,
    format: (v) =>
      long(v) ? (v / MS_IN_SECOND).toFixed(1) : v >= 100 ? v.toFixed(1) : v.toFixed(digits),
    unit: (v) => (long(v) ? "s" : "ms"),
    boxUnit: (v) => (long(v) ? "s" : "m"),
  };
}

const MS_IN_SECOND = 1000;

/** The ratios a compressor stops on from 4.00:1 to the top of its travel, the last one ∞. */
const RATIO_TOP = [
  4, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9,
  5, 5.2, 5.4, 5.6, 5.8, 6, 6.2, 6.4, 6.6, 6.8,
  7, 7.5, 8, 8.5, 9, 9.5,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  22, 24, 26, 28, 30, 32, 34, 36, 38,
  40, 45, 50, 55, 60, 65, 70, 80, 90, 100, 150, 200, 300, 500, Number.POSITIVE_INFINITY,
];

/** Below 4.00:1 it stops every 0.05, from 1.00:1. */
const RATIO_STOPS = steps(121, (i) => {
  const top = i - (121 - RATIO_TOP.length);
  return top >= 0 ? (RATIO_TOP[top] ?? Number.POSITIVE_INFINITY) : round(1 + 0.05 * i, 2);
});

/**
 * A compressor's Ratio. The channel's COMP and the SSMCS strip stop on the same
 * ratios and write them differently: the strip prints three figures, so from
 * 100:1 up it drops the decimal place that COMP keeps.
 */
export function compRatioSpec(path: ParamPath, fallback: number, threeFigures: boolean): NumericSpec {
  return {
    path,
    label: "Ratio",
    min: 1,
    max: Number.POSITIVE_INFINITY,
    step: 0.1,
    fastStep: 1,
    fallback,
    travel: stopsTravel(RATIO_STOPS),
    format: (v) =>
      `${!Number.isFinite(v) ? "INF" : v < 10 ? v.toFixed(2) : threeFigures && v >= 100 ? v.toFixed(0) : v.toFixed(1)}:1`,
  };
}
