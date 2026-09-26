// What the dynamics blocks take off, and the curve the compressor draws.
//
// The screens' reduction bars, the channel view's lamps, the OUT meters and the
// ticker that keeps them moving all read these, so a block's reading is the
// same wherever it is drawn.

/** How many dB a dynamics screen's reduction bar reads from its top to its bottom. */
export const GR_METER_DB = 38;

/** The same, for the channel view's COMP bar and an insert's reduction bar, which run the threshold's range. */
export const COMP_GR_METER_DB = 54;

/** The reduction the COMP screen's bar bends at, and the share of the bar it reaches there. */
const COMP_GR_BEND_DB = 18;
const COMP_GR_BEND_SHARE = 11 / 21;

/** The reduction that reaches the foot of the COMP screen's bar. */
const COMP_GR_FULL_DB = 50;

/**
 * How far down the COMP screen's reduction bar a reduction of `db` reaches, as a
 * share of the bar: straight to 18 dB at 11/21 of it, then straight on at a
 * shallower slope to 50 dB at its foot.
 */
export function compGrShare(db: number): number {
  if (!(db > 0)) return 0;
  const share =
    db <= COMP_GR_BEND_DB
      ? (db / COMP_GR_BEND_DB) * COMP_GR_BEND_SHARE
      : COMP_GR_BEND_SHARE + ((db - COMP_GR_BEND_DB) / (COMP_GR_FULL_DB - COMP_GR_BEND_DB)) * (1 - COMP_GR_BEND_SHARE);
  return Math.min(1, share);
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
