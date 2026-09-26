import { describe, expect, it } from "vitest";
import { compGrShare } from "./dynamics";

// The COMP screen's reduction bar on the unit, read by eye against its 21 mm length
// at reductions the unit reported: the scale is held to within 0.6 mm of each reading.
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

describe("the COMP screen's reduction bar", () => {
  it("reaches as far as the unit's bar at each reduction read off it", () => {
    const off = READINGS.filter(([db, mm]) => Math.abs(compGrShare(db) * BAR_MM - mm) > 0.6).map(([db]) => [db, compGrShare(db) * BAR_MM]);
    expect(off).toEqual([]);
  });

  it("runs from empty at no reduction to full at 50 dB, and no further", () => {
    expect(compGrShare(0)).toBe(0);
    expect(compGrShare(50)).toBe(1);
    expect(compGrShare(60)).toBe(1);
    expect(compGrShare(-3), "a gain is not a reduction").toBe(0);
    expect(compGrShare(Number.NaN), "a reading that is not a number is empty").toBe(0);
  });

  it("never turns back as the reduction deepens", () => {
    const shares = Array.from({ length: 61 }, (_, db) => compGrShare(db));
    expect(shares.every((share, i) => i === 0 || share >= (shares[i - 1] ?? 0))).toBe(true);
  });
});
