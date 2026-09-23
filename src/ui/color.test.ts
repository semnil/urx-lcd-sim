import { describe, expect, it } from "vitest";
import { inkOn } from "./color";

describe("a second colour worked out from a given one", () => {
  it("names a colour in whichever of black and white reads on it", () => {
    // WCAG 2.1 contrast, not a brightness guess: yellow and white take black,
    // and the deep blue and the near-black take white.
    expect(inkOn("#e6e710")).toBe("#000000");
    expect(inkOn("#e6e6e6")).toBe("#000000");
    expect(inkOn("#1965ff")).toBe("#ffffff");
    expect(inkOn("#232326")).toBe("#ffffff");
  });

  it("keeps every swatch in the palette above the AA ratio for its own name", () => {
    const ratio = (hex: string, ink: string): number => {
      const lum = (h: string): number => {
        const n = Number.parseInt(h.slice(1), 16);
        const lin = (c: number): number => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
      };
      const [a, b] = [lum(hex), lum(ink)].sort((x, y) => y - x) as [number, number];
      return (a + 0.05) / (b + 0.05);
    };
    for (const hex of ["#1965ff", "#ff8200", "#e6e710", "#8c4ade", "#29b5d6", "#ff499c", "#ce4529", "#29c26b", "#8ce63a", "#e6e6e6"]) {
      expect(ratio(hex, inkOn(hex)), `${hex} names itself legibly`).toBeGreaterThanOrEqual(4.5);
    }
    // The one that takes the colour away is named in the secondary grey rather
    // than in white, and has to read on its own face all the same.
    expect(ratio("#232326", "#c5c6ce"), "Off names itself legibly").toBeGreaterThanOrEqual(4.5);
  });
});
