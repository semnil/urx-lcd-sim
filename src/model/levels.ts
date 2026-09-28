// The unit's own figures the synthetic signal is laid out by: what each input
// source puts out, what the processing that changes a level does to it, and how
// far under the meters' reading each detector hears. All of them are a URX44V's
// (System 1.3.1.0), read off its meters, and the URX22 and URX44 take the same.

/** A reading of a lane off a meter, as a detector hears it: how many dB it hears a steady tone and a noise-like signal off it. */
export interface DetectorOffset {
  tone: number;
  noise: number;
}

/**
 * How far each detector hears off the meter's reading. A stereo key is heard as
 * its two sides summed, and the figure is off that sum.
 */
export const DETECTOR_OFFSET = {
  gate: { tone: 0, noise: -2 },
  comp: { tone: 0, noise: -6 },
  ssmcs: { tone: 0, noise: -6 },
  duckerMono: { tone: 1, noise: -2 },
  duckerStereo: { tone: -3, noise: -6 },
  companderS: { tone: 0.8, noise: -2.7 },
  companderH: { tone: 0.25, noise: -7.1 },
  mbc: { tone: 5.3, noise: -2.1 },
} as const satisfies Record<string, DetectorOffset>;

export type DetectorKind = keyof typeof DETECTOR_OFFSET;

/** The detector an insert effect hears through, by the effect's name. */
export function insertDetector(effect: string): DetectorKind | undefined {
  if (effect === "Compander-S") return "companderS";
  if (effect === "Compander-H") return "companderH";
  if (effect === "M.B.Comp") return "mbc";
  return undefined;
}

/**
 * What an input source puts out before its D.Gain: the four sources whose D.Gain
 * ships 14 dB down at -12 dB, so every source reads -26 dB at its shipped D.Gain.
 */
export function sourceBaseDb(source: string): number {
  return ["USB MAIN A", "USB MAIN B", "USB MAIN C", "USB SUB"].includes(source) ? -12 : -26;
}

/** What a MIC/LINE connector puts out with its A.Gain at 0 dB: its peaks first reach the clip level at +44 dB. */
export const MIC_LINE_SIGNAL_DB = -50;

/** What the oscillator's meter reads under its Level on Pink Noise, where the peaks reach the Level. */
export const OSC_PINK_UNDER_DB = 2;

/**
 * What M.B.Comp puts out for what goes into it, at the effect's own values: pairs
 * of input and output in dB from the quietest input up, for pink noise and for a
 * steady tone.
 */
export const MBC_CURVES: Readonly<Record<"noise" | "tone", readonly (readonly [number, number])[]>> = {
  noise: [[-65, -60], [-60, -55], [-53, -48], [-47, -43], [-42, -36], [-35, -31], [-29, -25], [-24, -19], [-18, -14], [-12, -9], [-5, -6]],
  tone: [[-61, -55], [-56, -50], [-49, -43], [-44, -38], [-38, -32], [-32, -26], [-26, -20], [-20, -16], [-14, -13], [-8, -11], [-2, -7]],
};

/**
 * How far over (or under) what goes into it each effect an FX channel runs puts
 * out, by effect and side, at the effect's own values: pink noise in, the
 * median of each meter.
 */
export const FX_RETURN_DB: Readonly<Record<string, readonly [number, number]>> = {
  "Rev-X Hall": [-3, -3],
  "Rev-X Room": [-5, -6],
  "Rev-X Plate": [-3, -2],
  "Rev.R3 Hall": [-5, -5],
  "Rev.R3 Room": [-7, -7],
  "Rev.R3 Plate": [-2, -3],
  "Mono Delay": [-2, -2],
  "Ping Pong": [0, 0],
};

/**
 * What an input insert puts out for what goes into it, at the effect's own
 * values: pink noise in, the median of each meter, pairs of input and output in
 * dB from the quietest input up.
 */
export const INSERT_CURVES: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  Clean: [[-65, -59], [-59, -53], [-53, -47], [-48, -42], [-41, -36], [-36, -29], [-30, -23], [-24, -17], [-18, -11], [-12, -7], [-6, -5]],
  Crunch: [[-66, -47], [-60, -41], [-54, -35], [-48, -29], [-42, -23], [-36, -18], [-30, -15], [-23, -14], [-17, -13], [-12, -14], [-6, -13]],
  Lead: [[-66, -27], [-60, -21], [-53, -17], [-48, -14], [-41, -13], [-35, -13], [-30, -14], [-24, -14], [-18, -14], [-12, -13], [-5, -13]],
  Drive: [[-66, -24], [-60, -18], [-54, -14], [-48, -13], [-42, -12], [-36, -11], [-29, -12], [-24, -11], [-18, -11], [-12, -11], [-6, -11]],
  "Pitch Fix": [[-66, -69], [-60, -64], [-54, -58], [-48, -52], [-42, -44], [-36, -40], [-29, -34], [-24, -28], [-18, -22], [-12, -16], [-5, -10]],
};

/**
 * What an input insert gains at `db` going in: straight between the points of
 * its curve, and along the slope of the nearest end past them.
 */
export function insertCurveGainDb(effect: string, db: number): number {
  return curveGainDb(INSERT_CURVES[effect], db);
}

/** What a curve of input and output pairs gains at `db` going in: straight between its points, and along the slope of the nearest end past them. */
export function curveGainDb(curve: readonly (readonly [number, number])[] | undefined, db: number): number {
  if (!curve || curve.length < 2) return 0;
  let i = 1;
  while (i < curve.length - 1 && db > (curve[i]?.[0] ?? 0)) i++;
  const [x0, y0] = curve[i - 1] ?? [0, 0];
  const [x1, y1] = curve[i] ?? [0, 0];
  const out = y0 + ((db - x0) * (y1 - y0)) / (x1 - x0);
  return out - db;
}

/** How fast a level meter's bar falls, in dB a second. It rises at once. */
export const METER_FALL_DB_PER_S = 30;

/** The level from which a strip's signal lamp lights. */
export const SIGNAL_LAMP_DB = -40;
