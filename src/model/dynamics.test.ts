import { describe, expect, it } from "vitest";
import { grBarShare, levelBarShare } from "./dynamics";

// Bars on the unit, read by eye in mm against each bar's length at the reductions
// or levels the unit reported: [what the bar showed in dB, mm lit]. The scale is
// held to within 0.9 mm of each reading.
const TOLERANCE_MM = 0.9;
const REDUCTION_BARS: Record<string, { mm: number; readings: [number, number][] }> = {
  GATE: { mm: 21, readings: [[6, 3], [12, 7], [24, 13], [36, 16.5], [48, 19], [48, 18.8], [61, 21], [73, 21]] },
  DUCKER: { mm: 21, readings: [[6, 3], [12, 7], [24, 13], [36, 16.5], [48, 19], [71, 21]] },
  COMP: { mm: 21, readings: [[4, 2.5], [6, 3.5], [12, 7.5], [18, 11], [21, 12], [24, 13], [29, 15], [34, 16]] },
  SSMCS: { mm: 21, readings: [[2, 1.5], [4, 2.5], [8, 5], [11, 6.5]] },
  "the channel view's COMP block": { mm: 13.5, readings: [[6, 2.2], [12, 4.8], [24, 8.4], [34, 10]] },
  "an insert Compander": { mm: 21, readings: [[6, 3.5], [12, 7], [19, 10.5], [27, 13.5], [35, 16]] },
  "M.B.Comp's bands": { mm: 21, readings: [[1, 0.2], [4, 2], [6, 3.5], [8, 5], [11, 6], [13, 7.7], [15, 9]] },
};
const LEVEL_BARS: Record<string, { mm: number; readings: [number, number][] }> = {
  "the channel view's COMP block": {
    mm: 13.5,
    readings: [[-48, 2], [-42, 2.4], [-30, 4], [-30, 4.5], [-20, 6.4], [-12, 9.5], [-6, 11.5], [-3, 13]],
  },
  "the channel view's LEVEL": { mm: 14, readings: [[-48, 2], [-36, 3.2], [-24, 5.2], [-12, 9.6], [-6, 11.8], [-3, 13]] },
  HOME: { mm: 12, readings: [[-60, 0.4], [-48, 2], [-36, 3.2], [-24, 5], [-12, 7.3], [-6, 10.4], [-3, 11.4]] },
  "GATE's IN": {
    mm: 20,
    readings: [[-60, 0.5], [-48, 3], [-36, 4.5], [-24, 7.8], [-12, 13.2], [-12, 13], [-6, 16.4], [-6, 16.2], [-3, 18]],
  },
  "a RECORDER track": { mm: 9.7, readings: [[-36, 2.7], [-18, 5]] },
};

/** The readings of `bars` that `share` puts further than the tolerance off, with where it puts them. */
function off(bars: typeof REDUCTION_BARS, share: (db: number) => number): [string, number, number][] {
  return Object.entries(bars).flatMap(([name, { mm, readings }]) =>
    readings.filter(([db, lit]) => Math.abs(share(db) * mm - lit) > TOLERANCE_MM).map(([db]): [string, number, number] => [name, db, share(db) * mm]),
  );
}

describe("the reduction bars' scale", () => {
  it("reaches as far as each of the unit's reduction bars at each reduction read off it", () => {
    expect(off(REDUCTION_BARS, grBarShare)).toEqual([]);
  });

  it("reaches 11/21 of the bar at 18 dB, 11/14 at 36 dB and the far end at 60 dB, and no further", () => {
    expect(grBarShare(0)).toBe(0);
    expect(grBarShare(18)).toBeCloseTo(11 / 21, 12);
    expect(grBarShare(36)).toBeCloseTo(11 / 14, 12);
    expect(grBarShare(60)).toBe(1);
    expect(grBarShare(72)).toBe(1);
    expect(grBarShare(-3), "a gain is not a reduction").toBe(0);
    expect(grBarShare(Number.NaN), "a reading that is not a number is empty").toBe(0);
  });

  it("runs straight between those points", () => {
    expect(grBarShare(9)).toBeCloseTo(11 / 42, 12);
    expect(grBarShare(27)).toBeCloseTo((11 / 21 + 11 / 14) / 2, 12);
    expect(grBarShare(48)).toBeCloseTo((11 / 14 + 1) / 2, 12);
  });

  it("never turns back as the reduction deepens", () => {
    const shares = Array.from({ length: 73 }, (_, db) => grBarShare(db));
    expect(shares.every((share, i) => i === 0 || share >= (shares[i - 1] ?? 0))).toBe(true);
  });
});

describe("the level meters' scale", () => {
  it("reaches as far as each of the unit's level meters at each level read off it", () => {
    expect(off(LEVEL_BARS, levelBarShare)).toEqual([]);
  });

  it("is the reduction scale laid from 0 dB down: full at 0 dB, 10/21 at -18 dB, 3/14 at -36 dB, empty from -60 dB", () => {
    expect(levelBarShare(0)).toBe(1);
    expect(levelBarShare(6), "over 0 dB stays full").toBe(1);
    expect(levelBarShare(-18)).toBeCloseTo(10 / 21, 12);
    expect(levelBarShare(-36)).toBeCloseTo(3 / 14, 12);
    expect(levelBarShare(-60)).toBe(0);
    expect(levelBarShare(-96)).toBe(0);
    expect(levelBarShare(Number.NaN), "a reading that is not a number is empty").toBe(0);
  });

  it("never turns back as the level rises", () => {
    const shares = Array.from({ length: 73 }, (_, i) => levelBarShare(i - 72));
    expect(shares.every((share, i) => i === 0 || share >= (shares[i - 1] ?? 0))).toBe(true);
  });
});
