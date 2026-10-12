// What the dynamics blocks take off, and the curve the compressor draws.
//
// The screens' reduction bars, the channel view's lamps, the OUT meters and the
// ticker that keeps them moving all read these, so a block's reading is the
// same wherever it is drawn.

/** The deepest reduction a block that holds its channel down over a threshold reports: the threshold's range. */
export const OVER_REDUCTION_MAX_DB = 54;

/**
 * Where every reduction bar bends: a reduction in dB and the share of the bar it
 * reaches, from empty to full. The bar runs straight between them.
 */
const GR_BAR_POINTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [18, 11 / 21],
  [36, 11 / 14],
  [60, 1],
];

/**
 * How far along a reduction bar a reduction of `db` reaches, as a share of the
 * bar: 11/21 of it at 18 dB, 11/14 at 36 dB and its far end at 60 dB, straight
 * between. Every block's reduction bar reads on this scale.
 */
export function grBarShare(db: number): number {
  if (!(db > 0)) return 0;
  for (let i = 1; i < GR_BAR_POINTS.length; i++) {
    const [fromDb, fromShare] = GR_BAR_POINTS[i - 1] ?? [0, 0];
    const [toDb, toShare] = GR_BAR_POINTS[i] ?? [0, 0];
    if (db <= toDb) return fromShare + ((db - fromDb) / (toDb - fromDb)) * (toShare - fromShare);
  }
  return 1;
}

/**
 * How far up a level meter a level of `db` reaches, the meters' bars and the
 * channel view's COMP level bar alike: the reduction bars' scale laid from 0 dB
 * down, so 0 dB fills it and each dB under takes off what a dB of reduction
 * would add. The COMP threshold is marked on it the same way.
 */
export function levelBarShare(db: number): number {
  if (Number.isNaN(db)) return 0;
  return 1 - grBarShare(-db);
}

/** Where the SSMCS compressor's corner sits, in dB, for a Comp Drive setting, and the lowest it goes. */
const SSMCS_CORNER_RAMP_DRIVE = 1.55;
export const SSMCS_CORNER_FLOOR_DB = -54;
const SSMCS_CORNER_AT_FACTORY_DB = -20;

export function ssmcsCorner(drive: number): number {
  const full = SSMCS_CORNER_AT_FACTORY_DB - 0.2 * (drive * 20 - 100);
  const ramped =
    drive >= SSMCS_CORNER_RAMP_DRIVE ? full : (drive / SSMCS_CORNER_RAMP_DRIVE) * (SSMCS_CORNER_AT_FACTORY_DB - 0.2 * (SSMCS_CORNER_RAMP_DRIVE * 20 - 100));
  return Math.max(SSMCS_CORNER_FLOOR_DB, ramped);
}

/** How wide Knee rounds the compressor's corner, in dB of input. */
export const COMP_KNEE_WIDTH: Record<string, number> = { Soft: 52, Medium: 16, Hard: 0 };

/**
 * The compressor's output for an input level, makeup included. Across the knee the
 * straight runs below and above the threshold are joined by a cubic whose end slopes
 * are 1 and 1/ratio, both scaled down together where the cubic would turn back. The
 * knee reaches `up` above the threshold and `down` under it; a block whose knee sits
 * evenly around the corner passes half its width for each.
 */
export function compResponse(threshold: number, ratio: number, knee: number | readonly [number, number], gain: number): (db: number) => number {
  const r = Math.max(1, ratio);
  const [up, down] = typeof knee === "number" ? [knee / 2, knee / 2] : knee;
  const kneeWidth = up + down;
  const lo = threshold - down;
  const hi = threshold + up;
  const hiOut = threshold + up / r;
  const secant = kneeWidth > 0 ? (hiOut - lo) / kneeWidth : 1;
  const reach = secant > 0 ? Math.hypot(1 / secant, 1 / r / secant) : Number.POSITIVE_INFINITY;
  const limit = reach > 3 ? 3 / reach : 1;
  return (db) => {
    if (kneeWidth > 0 && db > lo && db < hi) {
      const u = (db - lo) / kneeWidth;
      const u2 = u * u;
      const u3 = u2 * u;
      return (
        (2 * u3 - 3 * u2 + 1) * lo +
        (u3 - 2 * u2 + u) * kneeWidth * limit +
        (-2 * u3 + 3 * u2) * hiOut +
        (u3 - u2) * kneeWidth * (limit / r) +
        gain
      );
    }
    return (db <= lo ? db : threshold + (db - threshold) / r) + gain;
  };
}

/** How steeply each compander pulls down what falls below its band. */
export const COMPANDER_EXPANSION: Record<string, number> = { "Compander-H": 5, "Compander-S": 1.5 };

/**
 * What a compander puts out for an input level. 0 dB in comes out at the output
 * gain, and from there up the line is flat. Under 0 dB the ratio sets the slope as
 * far as the threshold, from there down through the width the slope is the one it
 * has at 1.0:1, and below the width it falls by the expansion.
 */
function companderResponse(threshold: number, ratio: number, width: number, gain: number, expansion: number): (db: number) => number {
  const r = Math.max(1, ratio);
  const foot = threshold - width;
  const atThreshold = gain + threshold / r;
  return (db) => {
    if (db >= 0) return gain;
    if (db >= threshold) return gain + db / r;
    if (db >= foot) return atThreshold - (threshold - db);
    return atThreshold - width - (foot - db) * expansion;
  };
}

/** The most a compander lifts the flat of its curve, in dB, whatever its threshold and ratio. */
export const COMPANDER_LIFT_MAX_DB = 18;

/** The quietest level a compander's expansion hears, in dB at its detector. */
export const COMPANDER_HEARD_FLOOR_DB = -62;

/** How far a compander lifts the flat of its curve: its threshold under the ratio, up to 18 dB. */
export const companderLiftDb = (threshold: number, ratio: number): number =>
  Math.min(-threshold * (1 - 1 / Math.max(1, ratio)), COMPANDER_LIFT_MAX_DB);

/**
 * A compander's curve as it works and as its screen draws it: the curve, the
 * whole of it standing no higher than its flat lifted by 18 dB.
 */
export function companderCurve(threshold: number, ratio: number, width: number, gain: number, expansion: number): (db: number) => number {
  const curve = companderResponse(threshold, ratio, width, gain, expansion);
  const over = -threshold * (1 - 1 / Math.max(1, ratio)) - companderLiftDb(threshold, ratio);
  return (db) => curve(db) - over;
}

/**
 * The gain a compander gives a level its detector hears as `heard`: its curve's,
 * the expansion taking a level quieter than -62 dB as -62 dB.
 */
export function companderGainDb(threshold: number, ratio: number, width: number, gain: number, expansion: number): (heard: number) => number {
  const curve = companderCurve(threshold, ratio, width, gain, expansion);
  return (heard) => {
    const at = Math.max(heard, COMPANDER_HEARD_FLOOR_DB);
    return curve(at) - at;
  };
}

/** What a gate that is on takes off: its whole range at or under the threshold. */
export function gateReductionDb(level: number, threshold: number, range: number): number {
  return level <= threshold ? -range : 0;
}

/** What the compressor takes off at `level`: how far its curve sits under unity. */
export function compReductionDb(
  level: number,
  threshold: number,
  ratio: number,
  knee: number,
  gain: number,
): number {
  return Math.max(0, level + gain - compResponse(threshold, ratio, knee, gain)(level));
}

/** How much of its range a steady tone key takes off for how far it is heard over the threshold, in dB: straight between the points. */
const DUCKER_TONE_SHARE: readonly (readonly [number, number])[] = [[-1, 0], [1, 1]];

/**
 * What a noise-like key takes off, by the range: pairs of how far the key is
 * heard over the threshold and the reduction, in dB. Straight between the
 * points, none under the first and the whole range past the last.
 */
const DUCKER_NOISE_DB: readonly (readonly [number, readonly (readonly [number, number])[]])[] = [
  [6, [[-5, 0], [-3, 1], [-1, 1], [1, 4], [3, 6]]],
  [12, [[-4, 0], [-2, 2], [0, 7], [2, 11], [4, 12]]],
  [24, [[-5, 0], [-3, 1], [-1, 6], [1, 15], [3, 21], [5, 24]]],
  [48, [[-5, 0], [-3, 1], [-1, 3], [1, 11], [3, 23], [5, 34], [7, 45], [9, 48]]],
  [70, [[-6, 0], [-4, 1], [-2, 3], [0, 11], [2, 23], [4, 35], [6, 51], [8, 70]]],
];

/** A curve of pairs at `x`: straight between its points, its first value under them and its last past them. */
function along(curve: readonly (readonly [number, number])[], x: number): number {
  const [x0 = 0, y0 = 0] = curve[0] ?? [];
  const [xn = 0, yn = 0] = curve.at(-1) ?? [];
  if (!(x > x0)) return y0;
  if (x >= xn) return yn;
  let i = 1;
  while (i < curve.length - 1 && x > (curve[i]?.[0] ?? 0)) i++;
  const [ax, ay] = curve[i - 1] ?? [0, 0];
  const [bx, by] = curve[i] ?? [0, 0];
  return ay + ((x - ax) * (by - ay)) / (bx - ax);
}

/** What a noise-like key takes off at a range of `depth` dB: between the two ranges measured either side of it, a range under the smallest scaled from it. */
function noiseReductionDb(over: number, depth: number): number {
  const ranges = DUCKER_NOISE_DB;
  const at = (k: number): number => along(ranges[k]?.[1] ?? [], over);
  const first = ranges[0]?.[0] ?? 1;
  if (depth <= first) return (at(0) * depth) / first;
  let k = 1;
  while (k < ranges.length - 1 && depth > (ranges[k]?.[0] ?? 0)) k++;
  const lo = ranges[k - 1]?.[0] ?? 0;
  const hi = ranges[k]?.[0] ?? 0;
  const t = Math.min(1, (depth - lo) / (hi - lo));
  return Math.min(depth, at(k - 1) + t * (at(k) - at(k - 1)));
}

/** What a ducker takes off for a key heard at `key`, at its range: a steady tone takes it in a dB either side of the threshold, a noise-like key across several. */
export function duckerReductionDb(key: number, threshold: number, range: number, tone = false): number {
  const depth = Math.max(0, -range);
  const over = key - threshold;
  return tone ? along(DUCKER_TONE_SHARE, over) * depth : noiseReductionDb(over, depth);
}

/** How much of its range, from 0 to 1, a ducker takes off for a key heard at `key`. A range of 0 takes the share a 6 dB range would. */
export function duckerShare(key: number, threshold: number, range: number, tone = false): number {
  const depth = Math.max(0, -range) || 6;
  return Math.min(1, duckerReductionDb(key, threshold, -depth, tone) / depth);
}
