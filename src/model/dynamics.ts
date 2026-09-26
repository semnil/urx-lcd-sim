// What the dynamics blocks take off, and the curve the compressor draws.
//
// The screens' reduction bars, the channel view's lamps, the OUT meters and the
// ticker that keeps them moving all read these, so a block's reading is the
// same wherever it is drawn.

/** The deepest reduction a block that holds its channel down over a threshold reports: the threshold's range. */
export const OVER_REDUCTION_MAX_DB = 54;

/** The reduction every reduction bar bends at, and the share of the bar it reaches there. */
const GR_BAR_BEND_DB = 18;
const GR_BAR_BEND_SHARE = 11 / 21;

/** The reduction that reaches the far end of every reduction bar. */
const GR_BAR_FULL_DB = 50;

/**
 * How far along a reduction bar a reduction of `db` reaches, as a share of the
 * bar: straight to 18 dB at 11/21 of it, then straight on at a shallower slope to
 * 50 dB at its far end. Every block's reduction bar reads on this scale.
 */
export function grBarShare(db: number): number {
  if (!(db > 0)) return 0;
  const share =
    db <= GR_BAR_BEND_DB
      ? (db / GR_BAR_BEND_DB) * GR_BAR_BEND_SHARE
      : GR_BAR_BEND_SHARE + ((db - GR_BAR_BEND_DB) / (GR_BAR_FULL_DB - GR_BAR_BEND_DB)) * (1 - GR_BAR_BEND_SHARE);
  return Math.min(1, share);
}

/**
 * How far along the channel view's COMP level bar a level of `db` reaches: the
 * reduction bars' scale laid from 0 dB down, so 0 dB fills it and each dB under
 * takes off what a dB of reduction would add. The threshold is marked on it the same way.
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

/** What a ducker takes off: down to its range once the key is a range over the threshold. */
export function duckerReductionDb(key: number, threshold: number, range: number): number {
  return Math.min(Math.max(0, key - threshold), -range);
}
