import { describe, expect, it } from "vitest";
import { bandResponse, eqResponse, shelfDesignFreq } from "./eq-response";

// The unit's responses, each read as the difference of two meters that step in
// whole dB: the model is held to within 1.5 dB of each reading.
const band = (shape: string, freq: number, gain: number, q = 0.71) => bandResponse({ on: true, shape, freq, q, gain });
const within = (f: (hz: number) => number, readings: [number, number][]): [number, number][] =>
  readings.filter(([hz, db]) => Math.abs(f(hz) - db) > 1.5).map(([hz]) => [hz, Math.round(f(hz) * 10) / 10]);

describe("the EQ's response", () => {
  it("draws a Bell half as wide as a biquad of the Q the screen shows", () => {
    expect(within(band("Bell", 1000, 12, 1), [[1000, 12], [700, 10], [500, 7], [300, 3]])).toEqual([]);
    expect(within(band("Bell", 1000, -12, 1), [[1000, -12], [500, -8], [2000, -8], [200, -3]])).toEqual([]);
  });

  it("draws HPF and LPF 3 dB down at their frequency and 12 dB an octave beyond, whatever the Q and gain", () => {
    expect(within(band("HPF", 1000, 0), [[1000, -3], [500, -12], [250, -24], [100, -39], [4000, 0]])).toEqual([]);
    expect(within(band("LPF", 1000, 0), [[1000, -3], [2000, -13], [4000, -25], [100, 0]])).toEqual([]);
    for (const hz of [100, 1000, 5000]) {
      expect(band("HPF", 1000, 12, 4)(hz), `${hz} Hz`).toBeCloseTo(band("HPF", 1000, 0, 0.71)(hz), 9);
    }
  });

  it("puts a shelf's frequency 3 dB short of its plateau, boost or cut", () => {
    expect(within(band("H.Shelf", 1000, 18), [[250, 0], [500, 6], [1000, 15], [2000, 17], [16000, 18]])).toEqual([]);
    expect(within(band("L.Shelf", 1000, 18), [[100, 18], [250, 17], [1000, 15], [4000, 1]])).toEqual([]);
    expect(within(band("H.Shelf", 1000, -12), [[500, -3], [1000, -10], [2000, -12]])).toEqual([]);
    expect(within(band("L.Shelf", 300, 12), [[100, 11], [200, 11], [400, 6], [1600, 1]])).toEqual([]);
    expect(shelfDesignFreq(1000, 18, true), "a high shelf is designed below its frequency").toBeLessThan(1000);
    expect(shelfDesignFreq(1000, 18, false), "a low shelf above it").toBeGreaterThan(1000);
    expect(shelfDesignFreq(1000, 2, true), "a shelf of 3 dB or less stands at its own frequency").toBe(1000);
    // Short of 6 dB the point 3 dB short of the plateau would lie inside the
    // frequency; the shelf stays designed at it and stands at half its gain there.
    expect(within(band("H.Shelf", 1000, 4), [[1000, 2], [2000, 3], [4000, 4]])).toEqual([]);
    // Read at 1 kHz to a tenth of a dB, averaging the meters over a walk of the
    // tone's level across one of their steps (all bands off read 0.00 and a
    // +12 dB shelf +9.20 the same way): each is held to within 0.75 dB.
    for (const [shape, gain, db] of [["H.Shelf", 4, 2.4], ["H.Shelf", 5, 3.1], ["H.Shelf", -4, -2.5], ["L.Shelf", 4, 2.4]] as const) {
      expect(Math.abs(band(shape, 1000, gain)(1000) - db), `${shape} ${gain} dB`).toBeLessThanOrEqual(0.75);
    }
    for (const gain of [4, -4, 5.5]) {
      expect(shelfDesignFreq(1000, gain, true), `H.Shelf ${gain} dB`).toBe(1000);
      expect(shelfDesignFreq(1000, gain, false), `L.Shelf ${gain} dB`).toBe(1000);
    }
  });

  it("adds nothing for a band switched off or a Bell or shelf at no gain", () => {
    expect(bandResponse({ on: false, shape: "HPF", freq: 1000, q: 0.71, gain: 0 })(100)).toBe(0);
    expect(band("Bell", 1000, 0)(1000)).toBe(0);
    expect(band("H.Shelf", 1000, 0)(5000)).toBe(0);
  });

  it("adds the bands in dB", () => {
    const both = eqResponse([
      { on: true, shape: "L.Shelf", freq: 300, q: 0.71, gain: 12 },
      { on: true, shape: "Bell", freq: 3000, q: 2, gain: -9 },
    ]);
    expect(within(both, [[100, 11], [400, 6], [1600, -3], [3200, -8], [6400, -1]])).toEqual([]);
  });
});
