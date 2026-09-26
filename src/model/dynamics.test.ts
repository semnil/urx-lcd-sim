import { describe, expect, it } from "vitest";
import { grBarShare, levelBarShare } from "./dynamics";

// The unit's COMP screen reduction bar, read by eye against its 21 mm length at
// reductions the unit reported: the scale is held to within 0.6 mm of each reading.
const BAR_MM = 21;
const READINGS: [number, number][] = [
  [4, 2.5],
  [6, 3.5],
  [12, 7.5],
  [18, 11],
  [21, 12],
  [24, 13],
  [29, 15],
  [34, 16],
];

// The channel view's COMP level bar, read by eye against its 13.5 mm length at
// levels going into COMP: the scale is held to within 0.8 mm of each reading.
const LEVEL_BAR_MM = 13.5;
const LEVEL_READINGS: [number, number][] = [
  [-42, 2.4],
  [-30, 4],
  [-30, 4.5],
  [-20, 6.4],
  [-12, 9.5],
  [-6, 11.5],
  [-3, 13],
];

describe("the reduction bars' scale", () => {
  it("reaches as far as the unit's COMP bar at each reduction read off it", () => {
    const off = READINGS.filter(([db, mm]) => Math.abs(grBarShare(db) * BAR_MM - mm) > 0.6).map(([db]) => [db, grBarShare(db) * BAR_MM]);
    expect(off).toEqual([]);
  });

  it("runs from empty at no reduction to full at 50 dB, and no further", () => {
    expect(grBarShare(0)).toBe(0);
    expect(grBarShare(50)).toBe(1);
    expect(grBarShare(60)).toBe(1);
    expect(grBarShare(-3), "a gain is not a reduction").toBe(0);
    expect(grBarShare(Number.NaN), "a reading that is not a number is empty").toBe(0);
  });

  it("never turns back as the reduction deepens", () => {
    const shares = Array.from({ length: 61 }, (_, db) => grBarShare(db));
    expect(shares.every((share, i) => i === 0 || share >= (shares[i - 1] ?? 0))).toBe(true);
  });
});

describe("the COMP level bar's scale", () => {
  it("reaches as far as the unit's level bar at each level read off it", () => {
    const off = LEVEL_READINGS.filter(([db, mm]) => Math.abs(levelBarShare(db) * LEVEL_BAR_MM - mm) > 0.8).map(([db]) => [
      db,
      levelBarShare(db) * LEVEL_BAR_MM,
    ]);
    expect(off).toEqual([]);
  });

  it("is the reduction scale laid from 0 dB down: full at 0 dB, 10/21 at -18 dB, empty from -50 dB", () => {
    expect(levelBarShare(0)).toBe(1);
    expect(levelBarShare(6), "over 0 dB stays full").toBe(1);
    expect(levelBarShare(-18)).toBeCloseTo(10 / 21, 12);
    expect(levelBarShare(-50)).toBe(0);
    expect(levelBarShare(-96)).toBe(0);
    expect(levelBarShare(Number.NaN), "a reading that is not a number is empty").toBe(0);
  });

  it("never turns back as the level rises", () => {
    const shares = Array.from({ length: 61 }, (_, i) => levelBarShare(i - 60));
    expect(shares.every((share, i) => i === 0 || share >= (shares[i - 1] ?? 0))).toBe(true);
  });
});
