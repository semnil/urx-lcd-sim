// The effects the unit runs: the ones a channel inserts (INS FX) and the ones an
// FX channel is, with what each one sets and what it comes up at.
//
// A value is held as what the screen prints for it — decibels, milliseconds,
// hertz — except where the control's scale has an end the unit names with a word
// (THRU, -inf) or a reading that follows another value. Those are held as the
// place on the control's own scale, and the table below gives the reading.

import type { ParamPath } from "../device/path";
import type { DeviceStore, WriteRule } from "../device/store";
import { clamp } from "../device/store";
import { OFF_MARK, formatHz, hzUnit } from "../ui/dom";
import type { NumericSpec } from "../ui/param-spec";
import { round, steps, stopsTravel } from "../ui/param-spec";

/** What the effect button reads while nothing is inserted. */
export const NO_EFFECT = "No Effect";

/** What a filter reads at the end of its travel where it passes the whole band. */
const THRU = "THRU";

/** The shape of one numeric control, over the path and name the screen gives it. */
type ParamShape = Omit<NumericSpec, "path" | "label" | "fallback">;

export interface EffectNumeric {
  kind: "num";
  key: string;
  label: string;
  fallback: number;
  /** What the readout bar calls the row, where the unit names it differently there. */
  bar?: string;
  /** `values` carries the effect's other readings, for a reading that follows one. */
  shape(values: Readonly<Record<string, number>>): ParamShape;
}

export interface EffectSelect {
  kind: "select";
  key: string;
  /** The caption over the control. A row the unit prints no name beside has none. */
  label: string;
  /** What a reader hears where the caption is empty. */
  name?: string;
  options: readonly string[];
  fallback: string;
  /** The options are note values, which the unit draws as notes. */
  notes?: boolean;
  /** The options stand as a row of buttons across two panels, with no caption. */
  buttons?: boolean;
  /** The caption and the list stand at the foot of the panel. */
  foot?: boolean;
  /** The control stands on the glass, with no panel under it. */
  bare?: boolean;
  /** The list runs the width of the readout bar's division under it rather than its panel's. */
  division?: boolean;
  /** Takes two columns, for a list whose longest name does not fit one. */
}

export interface EffectToggle {
  kind: "toggle";
  key: string;
  label: string;
  fallback: boolean;
  /** The unit stands the switch in the top right corner of every page of the effect. */
  corner?: boolean;
}

export type EffectParam = EffectNumeric | EffectSelect | EffectToggle;

/** One page of an effect's controls. An effect with a single face carries no rail. */
export interface EffectFace {
  label: string;
  params: readonly EffectParam[];
  /**
   * Where the unit stands each control, by key, eight panels to a page: four
   * across the upper row, then four across the lower. `null` leaves a panel
   * empty. Without it the controls fill the panels in order.
   */
  slots?: readonly (string | null)[];
}

export interface EffectDef {
  name: string;
  faces: readonly EffectFace[];
}

/** An entry of an effect menu, and what decides whether it can be taken. */
export interface EffectOption {
  name: string;
  /** The highest sampling frequency the effect runs at. */
  maxRate?: number;
  /** The effect runs on a mono channel alone. */
  monoOnly?: boolean;
  /** The holder it takes: one channel at a time holds each. */
  holder?: string;
}

// ---- readings ----------------------------------------------------------------

/** ISO 3 preferred numbers, one decade in forty grades. */
const R40 = [
  10.0, 10.6, 11.2, 11.8, 12.5, 13.2, 14.0, 15.0, 16.0, 17.0, 18.0, 19.0, 20.0, 21.2, 22.4, 23.6, 25.0, 26.5, 28.0,
  30.0, 31.5, 33.5, 35.5, 37.5, 40.0, 42.5, 45.0, 47.5, 50.0, 53.0, 56.0, 60.0, 63.0, 67.0, 71.0, 75.0, 80.0, 85.0,
  90.0, 95.0,
];
/** The same series in twenty grades, which is what the reverb on FX 1 steps in. */
const R20 = R40.filter((_, i) => i % 2 === 0);

/** The grade `offset` places above the series' 1.0 decade. */
function grade(series: readonly number[], offset: number): number {
  const n = series.length;
  const k = Math.round(offset);
  const i = ((k % n) + n) % n;
  return round((series[i] ?? 0) * Math.pow(10, Math.floor(k / n) - 1), 4);
}

/** The frequencies a filter stops on, from the first grade to the last. */
const gradeWindow = (series: readonly number[], from: number, to: number): number[] =>
  steps(to - from + 1, (i) => grade(series, from + i));

/** The windows the four kinds of filter run over. */
const REVX_HPF_HZ = gradeWindow(R20, 26, 78);
const REVX_LPF_HZ = gradeWindow(R20, 60, 86);
const REVX_LOW_FREQ_HZ = gradeWindow(R20, 27, 85);
const FX2_HPF_HZ = gradeWindow(R40, 53, 156);
const FX2_LPF_HZ = gradeWindow(R40, 68, 168);
/** The crossovers of the multi-band compressor, over the same grades. */
const MBC_LOW_MID_HZ = gradeWindow(R40, 53, 144);
const MBC_MID_HIGH_HZ = gradeWindow(R40, 65, 156);

/** A frequency of the reverb on FX 1: whole hertz under a kilohertz. */
function revxHz(hz: number): string {
  return hz >= 1000 ? formatHz(hz) : String(Math.round(hz));
}

/** A time the reverbs count their tails in. */
function formatSec(s: number): string {
  return s < 10 ? s.toFixed(2) : s.toFixed(1);
}

/** The delay before a reverb's first reflections, and the one between its two stages. */
const INITIAL_DELAY_MS = steps(128, (i) => round(0.1 + (i * 199.9) / 127, 1));

/** How long a REV-X tail runs, from its own step, the room it is in and its kind. */
const REVX_TIME_UNIT = 0.103 / 3;
function revxTimeUnits(step: number): number {
  if (step <= 47) return step + 3;
  if (step <= 57) return 50 + 5 * (step - 47);
  if (step <= 67) return 100 + 10 * (step - 57);
  return 200 + 50 * (step - 67);
}
function revxTimeSec(step: number, roomSize: number, kind: number): number {
  return REVX_TIME_UNIT * kind * revxTimeUnits(step) * Math.pow(3, roomSize / 31);
}
/** How much longer than Hall the other two REV-X rooms run at the same step. */
const REVX_HALL = 1;
const REVX_ROOM = 15.2 / 10.3;
const REVX_PLATE = 17.6 / 10.3;

/** The tails the reverb on FX 2 stops on. */
const REVR3_TIME_SEC = steps(70, (i) => {
  if (i <= 47) return round(0.3 + 0.1 * i, 1);
  if (i <= 57) return round(5.0 + 0.5 * (i - 47), 1);
  if (i <= 67) return i - 47;
  return i === 68 ? 25 : 30;
});

/** The balance between a reverb's early reflections and its tail. */
function balanceLabel(step: number): string {
  const n = 63 - step;
  if (n > 0) return `E${n}>R`;
  if (n < 0) return `E<R${-n}`;
  return "E=R";
}

/** The note values tempo sync counts a delay in, shortest first. */
const NOTE_VALUES = [
  "---", "1/32T", "1/16T", "1/16", "1/8T", "1/16.", "1/8", "1/4T", "1/8.", "1/4", "1/4.", "1/2", "1/2.", "whole",
  "whole x2",
];

/** The ratios and times the multi-band compressor stops on. */
const MBC_RATIOS = [1.0, 1.5, 2.0, 3.0, 5.0, 7.0, 10.0, 20.0];
const MBC_ATTACK_MS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 23, 26, 30, 35, 40, 50, 60, 70, 80, 100, 120, 140, 160, 180, 200,
];
const MBC_RELEASE_MS = [
  10, 15, 25, 35, 45, 55, 65, 75, 85, 100, 115, 140, 170, 230, 340, 680, 850, 1000, 1200, 1500, 1700, 2000, 2400, 3000,
];

/** What a band of the multi-band compressor puts back, over its own scale. */
export function mbcGainDb(step: number): number {
  if (step >= 20) return step - 37;
  return round(-60 + ((step - 1) * 43) / 19, 4);
}

/** What a guitar amp leaves at its output, over its own scale. */
const GUITAR_OUTPUT_ANCHORS: readonly (readonly [number, number])[] = [
  [8, -48.0],
  [20, -32.1],
  [40, -20.1],
  [64, -11.9],
  [96, -4.9],
  [127, 0],
];
function guitarOutputDb(step: number): number {
  const a = GUITAR_OUTPUT_ANCHORS;
  const between = (x0: number, y0: number, x1: number, y1: number): number => y0 + ((y1 - y0) / (x1 - x0)) * (step - x0);
  const first = a[0] ?? [0, 0];
  const second = a[1] ?? first;
  if (step <= first[0]) return between(first[0], first[1], second[0], second[1]);
  for (let i = 1; i < a.length; i++) {
    const lo = a[i - 1] ?? first;
    const hi = a[i] ?? first;
    if (step <= hi[0]) return between(lo[0], lo[1], hi[0], hi[1]);
  }
  return a[a.length - 1]?.[1] ?? 0;
}

// ---- control shapes ----------------------------------------------------------

/** A value that runs evenly over its range. */
function even(min: number, max: number, step: number, format: (v: number) => string, extra: Partial<ParamShape> = {}): ParamShape {
  return { min, max, step, fastStep: step * 10, format, ...extra };
}

/** A whole number. */
const whole = (min: number, max: number): ParamShape => even(min, max, 1, (v) => String(Math.round(v)));

/** A value the unit steps through a table of settings. */
function stops(values: readonly number[], format: (v: number) => string, extra: Partial<ParamShape> = {}): ParamShape {
  return {
    min: values[0] ?? 0,
    max: values[values.length - 1] ?? 0,
    step: 1,
    travel: stopsTravel(values),
    format,
    ...extra,
  };
}

/** A value held as its place on the control's own scale, `count` settings long. */
function scale(count: number, format: (v: number) => string, extra: Partial<ParamShape> = {}): ParamShape {
  return { min: 0, max: count - 1, step: 1, fastStep: 5, format, ...extra };
}

/** A frequency table, in the hertz the unit prints. */
const hzStops = (values: readonly number[], reading: (hz: number) => string): ParamShape =>
  stops(values, reading, { unit: hzUnit });

/** A filter that reads THRU below its lowest frequency. */
function thruLow(values: readonly number[]): ParamShape {
  const hz = (i: number): number | null => (i <= 0 ? null : (values[i - 1] ?? null));
  return scale(values.length + 1, (i) => (hz(i) === null ? THRU : formatHz(hz(i) as number)), {
    unit: (i: number) => (hz(i) === null ? "" : hzUnit(hz(i) as number)),
  });
}

/** A filter that reads THRU above its highest frequency. */
function thruHigh(values: readonly number[]): ParamShape {
  const hz = (i: number): number | null => values[i] ?? null;
  return scale(values.length + 1, (i) => (hz(i) === null ? THRU : formatHz(hz(i) as number)), {
    unit: (i: number) => (hz(i) === null ? "" : hzUnit(hz(i) as number)),
  });
}

/** A gain that reads -inf at the bottom of its scale. */
function fadedGain(count: number, db: (step: number) => number, digits: number): ParamShape {
  return scale(count, (i) => (i <= 0 ? OFF_MARK : db(i).toFixed(digits)), {
    unit: (i: number) => (i <= 0 ? "" : "dB"),
  });
}

const num = (key: string, label: string, fallback: number, shape: (values: Readonly<Record<string, number>>) => ParamShape): EffectNumeric => ({
  kind: "num",
  key,
  label,
  fallback,
  shape,
});
const fixed = (key: string, label: string, fallback: number, shape: ParamShape): EffectNumeric =>
  num(key, label, fallback, () => shape);
const pick = (
  key: string,
  label: string,
  options: readonly string[],
  fallback: string,
  extra: { name?: string; notes?: boolean; buttons?: boolean; foot?: boolean; bare?: boolean; division?: boolean } = {},
): EffectSelect => ({ kind: "select", key, label, options, fallback, ...extra });
const flag = (key: string, label: string, fallback: boolean, extra: { corner?: boolean } = {}): EffectToggle => ({
  kind: "toggle",
  key,
  label,
  fallback,
  ...extra,
});

const ONE_FACE = (params: readonly EffectParam[]): readonly EffectFace[] => [{ label: "", params }];

// ---- the effects a channel inserts -------------------------------------------

const DB_TENTHS = (min: number, max: number): ParamShape => even(min, max, 0.1, (v) => v.toFixed(1), { unit: "dB" });
/** A percentage, a minus below zero and no sign above it. */
const PERCENT: ParamShape = { ...whole(-99, 99), unit: "%" };
const TENTHS_0_10 = stops(steps(101, (i) => round(i / 10, 1)), (v) => v.toFixed(1));
const RATIO_TENTHS = (max: number): ParamShape => stops(steps(max * 10, (i) => round((i + 1) / 10, 1)), (v) => v.toFixed(1));

/**
 * The compander's release, which runs from milliseconds into tens of seconds. It
 * stops on every millisecond up to a second and on every hundredth of a second
 * above it, so a stop and the reading beside it are the same thing.
 */
const COMPANDER_RELEASE_MS = [...steps(996, (i) => 5 + i), ...steps(4130, (i) => 1010 + i * 10)];
const COMPANDER_RELEASE = stops(
  COMPANDER_RELEASE_MS,
  (v) => (v >= 1000 ? (v / 1000).toFixed(2) : String(Math.round(v))),
  { unit: (v: number) => (v >= 1000 ? "s" : "ms") },
);

function companderFace(threshold: number, ratio: number, width: number, attack: number, release: number): readonly EffectFace[] {
  return ONE_FACE([
    fixed("threshold", "Threshold", threshold, DB_TENTHS(-54, 0)),
    fixed("ratio", "Ratio", ratio, stops(steps(191, (i) => round(1 + i / 10, 1)), (v) => `${v.toFixed(1)}:1`)),
    fixed("width", "Width", width, even(1, 90, 1, (v) => String(Math.round(v)), { unit: "dB" })),
    fixed("gain", "Gain", 0, DB_TENTHS(-18, 0)),
    fixed("attack", "Attack", attack, even(0, 120, 1, (v) => String(Math.round(v)), { unit: "ms" })),
    fixed("release", "Release", release, COMPANDER_RELEASE),
  ]);
}

/** One band of the multi-band compressor: what it repeats for LOW, MID and HIGH. */
function mbcBand(band: string, attackMs: number): EffectFace {
  const at = (key: string): string => `${band.toLowerCase()}${key}`;
  return {
    label: band,
    params: [
      flag(at("Bypass"), "Bypass", false),
      fixed(at("Threshold"), "Threshold", -20, even(-54, -6, 1, (v) => String(Math.round(v)), { unit: "dB" })),
      fixed(at("Ratio"), "Ratio", 2, stops(MBC_RATIOS, (v) => `${v.toFixed(1)}:1`)),
      fixed(at("Attack"), "Attack", attackMs, stops(MBC_ATTACK_MS, (v) => String(Math.round(v)), { unit: "ms" })),
      fixed(at("Gain"), "Gain", 39, fadedGain(56, mbcGainDb, 0)),
    ],
  };
}

const MBC_FACES: readonly EffectFace[] = [
  {
    label: "Main",
    params: [
      flag("oneKnobOn", "1-knob", false),
      fixed("oneKnobLevel", "1-knob Level", 0, whole(0, 48)),
      fixed("xoverLowMid", "L-M Xover", 125, hzStops(MBC_LOW_MID_HZ, formatHz)),
      fixed("xoverMidHigh", "M-H Xover", 3350, hzStops(MBC_MID_HIGH_HZ, formatHz)),
      fixed("release", "Release", 75, stops(MBC_RELEASE_MS, (v) => (v >= 1000 ? (v / 1000).toFixed(2) : String(Math.round(v))), {
        unit: (v: number) => (v >= 1000 ? "s" : "ms"),
      })),
      fixed("outGain", "Out Gain", 4, even(-12, 12, 1, (v) => String(Math.round(v)), { unit: "dB" })),
    ],
  },
  mbcBand("Low", 30),
  mbcBand("Mid", 40),
  mbcBand("High", 10),
];

/** The band gains the multi-band compressor's first page draws its bands up, from its lowest step to its highest. */
export const MBC_GAIN_RANGE: readonly [number, number] = [mbcGainDb(1), mbcGainDb(56)];

/** The frequencies that page runs across, which the crossovers stand at. */
export const MBC_PLOT_HZ: readonly [number, number] = [20, 20000];

/** The rows the unit's multi-band compressor drives itself while 1-knob is on. */
export const MBC_ONE_KNOB_DRIVEN: readonly string[] = [
  ...["low", "mid", "high"].flatMap((b) => [`${b}Bypass`, `${b}Threshold`, `${b}Ratio`, `${b}Attack`, `${b}Gain`]),
  "release",
  "xoverLowMid",
  "xoverMidHigh",
];

const SEMITONES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const noteName = (n: number): string => `${SEMITONES[n % 12] ?? "C"}${Math.floor(n / 12) - 2}`;
const PITCH_SCALES = [
  "Custom", "Single", "Major", "Natural Minor", "Harmonic Minor", "Melodic Minor", "Pentatonic", "Chromatic",
];
const MIDI_CONTROL = ["Off", "Setting", "Real Time"];

const PITCH_FACES: readonly EffectFace[] = [
  {
    label: "Pitch",
    params: [
      flag("correction", "Correction", true, { corner: true }),
      // The unit's readout bar spells this row without its `s`.
      // The unit prints neither row's unit, on the panel or on the readout bar.
      { ...fixed("coarse", "Coarse", 0, whole(-12, 12)), bar: "Coarce" },
      fixed("fine", "Fine", 0, whole(-50, 50)),
      fixed("formant", "Formant", 0, whole(-62, 62)),
    ],
    slots: [null, null, null, null, "coarse", "fine", "formant", null],
  },
  {
    label: "",
    params: [
      pick("midiControl", "MIDI Control", MIDI_CONTROL, "Off"),
      pick("key", "Key", SEMITONES, "C"),
      pick("scale", "Scale", PITCH_SCALES, "Chromatic"),
      // The keyboard's twelve notes. The unit ships on Chromatic, which takes them all.
      ...SEMITONES.map((name, i) => flag(pitchNoteKey(i), name, true)),
    ],
    // The page sets the three out down its left and draws the scale on a keyboard,
    // so it stands none of them in a panel.
    slots: [null, null, null, null, null, null, null, null],
  },
  {
    label: "Note Limit Low/High",
    params: [
      fixed("mix", "Mix", 126, whole(0, 126)),
      fixed("limitLow", "Limit Low", 0, scale(128, noteName)),
      fixed("limitHigh", "Limit High", 127, scale(128, noteName)),
      fixed("speed", "Speed", 100, whole(0, 100)),
      fixed("tolerance", "Tolerance", 50, whole(0, 100)),
    ],
    slots: [null, null, "mix", null, "limitLow", "limitHigh", "speed", "tolerance"],
  },
];

/** The notes a scale snaps to, as semitones above its key. */
const PITCH_SCALE_STEPS: Record<string, readonly number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  "Natural Minor": [0, 2, 3, 5, 7, 8, 10],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  Pentatonic: [0, 2, 4, 7, 9],
  Chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  Single: [0],
};

/**
 * The semitones a named scale takes, counted from C. `Custom` is the operator's
 * own set: choosing it takes nothing, so it names no semitones here.
 */
export function pitchScaleNotes(key: string, scale: string): ReadonlySet<number> {
  const root = Math.max(0, SEMITONES.indexOf(key));
  return new Set((PITCH_SCALE_STEPS[scale] ?? []).map((step) => (root + step) % 12));
}

/** Whether a scale sets the notes itself, which every scale but `Custom` does. */
export const pitchScaleSets = (scale: string): boolean => scale in PITCH_SCALE_STEPS;

/** The names of the twelve notes, as the keyboard draws them. */
export const PITCH_NOTE_NAMES: readonly string[] = SEMITONES;

/** Where the note a semitone above C is kept. */
export function pitchNoteKey(semitone: number): string {
  return `note${semitone}`;
}

const SP_TYPES = ["BS 4x12", "AC 2x12", "AC 1x12", "AC 4x10", "BC 2x12", "AM 4x12", "YC 4x12", "JC 2x12"];
const MIC_POSITIONS = ["Center", "Edge"];

interface AmpSettings {
  bass: number;
  middle: number;
  treble: number;
  presence: number;
  /** The place on the output's own scale. */
  output: number;
  spType: string;
  extra: readonly EffectParam[];
  /** Where the unit stands each value of the amp, two pages of eight panels. */
  slots: readonly (string | null)[];
}

function ampFaces(a: AmpSettings): readonly EffectFace[] {
  const knob = (key: string, label: string, fallback: number): EffectNumeric => fixed(key, label, fallback, TENTHS_0_10);
  const params: EffectParam[] = [
    ...a.extra,
    knob("bass", "Bass", a.bass),
    knob("middle", "Middle", a.middle),
    knob("treble", "Treble", a.treble),
    knob("presence", "Presence", a.presence),
    fixed("output", "Output", a.output, fadedGain(128, guitarOutputDb, 1)),
    flag("gate", "Gate", false),
    knob("gateLevel", "Gate Level", 2),
    pick("spType", "SP Type", SP_TYPES, a.spType, { foot: true, bare: true, division: true }),
    pick("micPosition", "Mic Position", MIC_POSITIONS, "Center", { foot: true, bare: true, division: true }),
  ];
  return [{ label: "", params, slots: a.slots }];
}

/** A setting the unit turns through a list of names with a knob, held as its place in the list. */
const named = (key: string, label: string, names: readonly string[], fallback: string): EffectNumeric =>
  fixed(key, label, Math.max(0, names.indexOf(fallback)), scale(names.length, (i) => names[Math.round(i)] ?? ""));

const CLEAN_MOD = ["Cho", "Off", "Vib"];
const CRUNCH_TYPES = ["Normal", "Bright"];
const LEAD_TYPES = ["High", "Low"];
const DRIVE_AMPS = ["Raw1", "Raw2", "Vintage1", "Vintage2", "Modern1", "Modern2"];

/** The lower row of the first page, which every amp shares. */
const TONE_ROW = ["treble", "middle", "bass", "presence"];
/** The second page of an amp with nothing of its own there: Gate, its level and the cabinet where Clean stands them. */
const GATE_AND_CABINET = [null, null, "gate", "spType", null, null, "gateLevel", "micPosition"];

const GUITAR_AMPS: readonly { name: string; settings: AmpSettings }[] = [
  {
    name: "Clean",
    settings: {
      bass: 6.1, middle: 5, treble: 4, presence: 3, output: 64, spType: "JC 2x12",
      slots: [
        "volume", "distortion", "blend", "output", ...TONE_ROW,
        "mod", null, "gate", "spType", "modSpeed", "modDepth", "gateLevel", "micPosition",
      ],
      extra: [
        fixed("volume", "Volume", 1.9, TENTHS_0_10),
        fixed("distortion", "Distortion", 0, TENTHS_0_10),
        fixed("blend", "Blend", 5, TENTHS_0_10),
        pick("mod", "", CLEAN_MOD, "Off", { name: "Cho/Off/Vib", buttons: true, bare: true }),
        fixed("modSpeed", "Speed", 5, TENTHS_0_10),
        fixed("modDepth", "Depth", 5, TENTHS_0_10),
      ],
    },
  },
  {
    name: "Crunch",
    settings: {
      bass: 4.7, middle: 7, treble: 5.3, presence: 2.8, output: 47, spType: "AC 4x10",
      slots: ["type", "gain", null, "output", ...TONE_ROW, ...GATE_AND_CABINET],
      extra: [named("type", "Type", CRUNCH_TYPES, "Bright"), fixed("gain", "Gain", 4.6, TENTHS_0_10)],
    },
  },
  {
    name: "Lead",
    settings: {
      bass: 6.6, middle: 8, treble: 3, presence: 2.9, output: 42, spType: "BS 4x12",
      slots: ["type", "gain", "master", "output", ...TONE_ROW, ...GATE_AND_CABINET],
      extra: [
        named("type", "Type", LEAD_TYPES, "High"),
        fixed("gain", "Gain", 10, TENTHS_0_10),
        fixed("master", "Master", 4.9, TENTHS_0_10),
      ],
    },
  },
  {
    name: "Drive",
    settings: {
      bass: 4, middle: 5, treble: 8, presence: 9, output: 43, spType: "AM 4x12",
      slots: ["ampType", "gain", "master", "output", ...TONE_ROW, ...GATE_AND_CABINET],
      extra: [
        named("ampType", "Amp Type", DRIVE_AMPS, "Vintage2"),
        fixed("gain", "Gain", 7.5, TENTHS_0_10),
        fixed("master", "Master", 4, TENTHS_0_10),
      ],
    },
  },
];

// ---- the effects an FX channel is --------------------------------------------

function revxFaces(kind: number, time: number, diffusion: number, initial: number, hpf: number, lpf: number, roomSize: number, hiRatio: number, lowRatio: number, decay: number): readonly EffectFace[] {
  return ONE_FACE([
    fixed("diffusion", "Diffusion", diffusion, whole(0, 10)),
    fixed("hiRatio", "Hi.Ratio", hiRatio, RATIO_TENTHS(1)),
    fixed("lowRatio", "Lo.Ratio", lowRatio, RATIO_TENTHS(1.4)),
    fixed("lowFreq", "Lo.Freq.", 800, hzStops(REVX_LOW_FREQ_HZ, revxHz)),
    num("revTime", "Rev.Time", time, (values) =>
      scale(70, (i) => formatSec(revxTimeSec(i, values.roomSize ?? roomSize, kind)), { unit: "s" }),
    ),
    fixed("initialDelay", "Ini.Delay", INITIAL_DELAY_MS[initial] ?? 0.1, stops(INITIAL_DELAY_MS, msReading, MS_UNITS)),
    fixed("decay", "Decay", decay, whole(0, 63)),
    fixed("roomSize", "Room Size", roomSize, whole(0, 31)),
    fixed("hpf", "HPF", REVX_HPF_HZ[hpf] ?? 20, hzStops(REVX_HPF_HZ, revxHz)),
    fixed("lpf", "LPF", REVX_LPF_HZ[lpf] ?? 1000, hzStops(REVX_LPF_HZ, revxHz)),
  ]);
}

/** A reading in milliseconds, which the reverbs and the delays share. */
const msReading = (v: number): string => v.toFixed(1);
const MS_UNITS: Partial<ParamShape> = { unit: "ms" };

function revr3Faces(time: number, initial: number, hiRatio: number, diffusion: number, density: number, erDelay: number, balance: number, hpf: number, lpf: number): readonly EffectFace[] {
  return ONE_FACE([
    fixed("density", "Density", density, whole(0, 4)),
    fixed("feedback", "FB.Gain", 0, PERCENT),
    fixed("erDelay", "E/R Delay", INITIAL_DELAY_MS[erDelay] ?? 0.1, stops(INITIAL_DELAY_MS, msReading, MS_UNITS)),
    fixed("erBalance", "E/R Bal.", balance, scale(127, balanceLabel)),
    fixed("revTime", "Rev.Time", REVR3_TIME_SEC[time] ?? 0.3, stops(REVR3_TIME_SEC, formatSec, { unit: "s" })),
    fixed("initialDelay", "Ini.Delay", INITIAL_DELAY_MS[initial] ?? 0.1, stops(INITIAL_DELAY_MS, msReading, MS_UNITS)),
    fixed("hiRatio", "Hi.Ratio", hiRatio, RATIO_TENTHS(1)),
    fixed("diffusion", "Diffusion", diffusion, whole(0, 10)),
    fixed("hpf", "HPF", hpf, thruLow(FX2_HPF_HZ)),
    fixed("lpf", "LPF", lpf, thruHigh(FX2_LPF_HZ)),
  ]);
}

/** The delay time is the one row the two delays do not share: they take different ranges. */
function delayFaces(label: string, min: number, max: number, hpf: number, lpf: number, feedback: number, hiRatio: number): readonly EffectFace[] {
  return [
    {
      label: "",
      params: [
        fixed("hpf", "HPF", hpf, thruLow(FX2_HPF_HZ)),
        fixed("lpf", "LPF", lpf, thruHigh(FX2_LPF_HZ)),
        // One click of the unit's encoder moves this by 5 ms.
        fixed("delay", label, 500, even(min, max, 5, msReading, { ...MS_UNITS, fastStep: 50 })),
        fixed("feedback", "FB.Gain", feedback, PERCENT),
        fixed("hiRatio", "Hi.Ratio", hiRatio, RATIO_TENTHS(1)),
        flag("sync", "Sync", false),
        fixed("bpm", "BPM", 120, whole(25, 300)),
        pick("note", "Note", NOTE_VALUES, "1/4", { notes: true, foot: true, bare: true }),
      ],
      slots: [
        "hpf", "lpf", null, null,
        "delay", "feedback", "hiRatio", null,
        "sync", null, null, "bpm",
        null, null, null, "note",
      ],
    },
  ];
}

// ---- the catalogue -----------------------------------------------------------

const DEFS: EffectDef[] = [
  { name: "Compander-H", faces: companderFace(-10, 3.5, 6, 1, 229) },
  { name: "Compander-S", faces: companderFace(-8, 4, 24, 25, 165) },
  { name: "M.B.Comp", faces: MBC_FACES },
  { name: "Pitch Fix", faces: PITCH_FACES },
  ...GUITAR_AMPS.map((a) => ({ name: a.name, faces: ampFaces(a.settings) })),
  { name: "Rev-X Hall", faces: revxFaces(REVX_HALL, 23, 10, 2, 4, 16, 29, 0.8, 1.2, 27) },
  { name: "Rev-X Room", faces: revxFaces(REVX_ROOM, 6, 8, 2, 6, 13, 15, 0.7, 1.1, 5) },
  { name: "Rev-X Plate", faces: revxFaces(REVX_PLATE, 21, 8, 2, 12, 18, 18, 0.9, 1.0, 5) },
  { name: "Rev.R3 Hall", faces: revr3Faces(15, 25, 0.7, 7, 3, 1, 55, 24, 78) },
  { name: "Rev.R3 Room", faces: revr3Faces(13, 2, 0.4, 7, 1, 2, 48, 34, 90) },
  { name: "Rev.R3 Plate", faces: revr3Faces(17, 12, 0.9, 6, 2, 0, 63, 36, 90) },
  { name: "Mono Delay", faces: delayFaces("Delay", 0.1, 2700, 35, 89, 20, 0.7) },
  { name: "Ping Pong", faces: delayFaces("Delay Time", 1, 1350, 0, 99, 14, 0.4) },
];

const BY_NAME = new Map(DEFS.map((d) => [d.name, d]));

/** What an effect sets, one page at a time. An unknown name sets nothing. */
export function effectFaces(name: string): readonly EffectFace[] {
  return BY_NAME.get(name)?.faces ?? [];
}

/** Every value an effect holds, across its pages. */
export function effectParams(name: string): readonly EffectParam[] {
  return effectFaces(name).flatMap((f) => f.params);
}

/**
 * The control a numeric value is turned by, under the path the channel gives it.
 * The box an effect prints its value in carries the same unit the readout bar
 * does: a row of them names four settings at once, and a bare number among them
 * says neither which unit it is in nor which decade.
 */
export function effectSpec(base: string, param: EffectNumeric, values: Readonly<Record<string, number>>): NumericSpec {
  const shape = param.shape(values);
  const box = shape.boxUnit ?? shape.unit;
  return {
    path: `${base}.${param.key}` as ParamPath,
    label: param.label,
    fallback: param.fallback,
    ...shape,
    ...(box === undefined ? {} : { boxUnit: box }),
  };
}

/**
 * The place on a numeric value's own scale that reads `reading`, for a value
 * written as what it read. Nothing where no place reads so.
 */
export function placeOfReading(effect: string, key: string, reading: string): number | undefined {
  const p = effectParams(effect).find((q) => q.key === key);
  if (p?.kind !== "num") return undefined;
  const { min, max, format } = p.shape({});
  for (let v = min; v <= max; v++) if (format(v) === reading) return v;
  return undefined;
}

/** Every effect the catalogue holds, for the checks that walk all of them. */
export const EFFECT_NAMES: readonly string[] = DEFS.map((d) => d.name);

/** How long each note value tempo sync counts in is, in whole notes (Effect Reference Guide, "Delay Section"). */
const NOTE_WHOLES: Readonly<Record<string, number>> = {
  "1/32T": 1 / 48,
  "1/16T": 1 / 24,
  "1/16": 1 / 16,
  "1/8T": 1 / 12,
  "1/16.": 3 / 32,
  "1/8": 1 / 8,
  "1/4T": 1 / 6,
  "1/8.": 3 / 16,
  "1/4": 1 / 4,
  "1/4.": 3 / 8,
  "1/2": 1 / 2,
  "1/2.": 3 / 4,
  whole: 1,
  "whole x2": 2,
};

/**
 * While a delay's Sync is on, the unit sets its delay time itself: the note
 * value at the tempo, kept inside the time the delay reaches. It does so when
 * Sync goes on and whenever the note or the tempo moves; the time can still be
 * turned by hand in between.
 */
export function delaySyncWriteRule(store: DeviceStore): WriteRule {
  return (path) => {
    const base = /^(ch\.[^.]+\.effect)\.(?:sync|bpm|note)$/.exec(path)?.[1];
    if (base === undefined) return [];
    const params = effectParams(store.str(`${base}.type`, ""));
    const [delay, sync, bpm, note] = ["delay", "sync", "bpm", "note"].map((key) => params.find((p) => p.key === key));
    if (delay?.kind !== "num" || sync?.kind !== "toggle" || bpm?.kind !== "num" || note?.kind !== "select") return [];
    if (!store.bool(`${base}.sync`, sync.fallback)) return [];
    const wholes = NOTE_WHOLES[store.str(`${base}.note`, note.fallback)];
    if (wholes === undefined) return [];
    const { min, max } = effectSpec(base, delay, {});
    const ms = (240_000 / store.num(`${base}.bpm`, bpm.fallback)) * wholes;
    return [[`${base}.delay` as ParamPath, clamp(round(ms, 1), min, max)]];
  };
}

// ---- the menus ---------------------------------------------------------------

/** What a mono input channel can take, in the order the unit offers them. */
export const INPUT_INSERT_EFFECTS: readonly EffectOption[] = [
  { name: NO_EFFECT },
  { name: "Clean", maxRate: 96000, monoOnly: true, holder: "amp" },
  { name: "Crunch", maxRate: 96000, monoOnly: true, holder: "amp" },
  { name: "Lead", maxRate: 96000, monoOnly: true, holder: "amp" },
  { name: "Drive", maxRate: 96000, monoOnly: true, holder: "amp" },
  { name: "Pitch Fix", maxRate: 48000, monoOnly: true, holder: "pitch" },
  { name: "Compander-H", maxRate: 96000, holder: "compander" },
  { name: "Compander-S", maxRate: 96000, holder: "compander" },
];

/** What an output channel can take. The three share one holder across the outputs. */
export const OUTPUT_INSERT_EFFECTS: readonly EffectOption[] = [
  { name: NO_EFFECT },
  { name: "Compander-H", maxRate: 96000, holder: "out" },
  { name: "Compander-S", maxRate: 96000, holder: "out" },
  { name: "M.B.Comp", maxRate: 96000, holder: "out" },
];

/** What each FX channel runs. One of them is always selected. */
export const FX_EFFECTS: Readonly<Record<string, readonly EffectOption[]>> = {
  fx1: [
    { name: "Rev-X Hall", maxRate: 192000 },
    { name: "Rev-X Room", maxRate: 192000 },
    { name: "Rev-X Plate", maxRate: 192000 },
    { name: "Mono Delay", maxRate: 192000 },
    { name: "Ping Pong", maxRate: 192000 },
  ],
  fx2: [
    { name: "Rev.R3 Hall", maxRate: 96000 },
    { name: "Rev.R3 Room", maxRate: 96000 },
    { name: "Rev.R3 Plate", maxRate: 96000 },
    { name: "Mono Delay", maxRate: 96000 },
    { name: "Ping Pong", maxRate: 96000 },
  ],
};

/** The effect an FX channel comes up running. */
export const FX_EFFECT_DEFAULT: Readonly<Record<string, string>> = { fx1: "Rev-X Hall", fx2: "Mono Delay" };
