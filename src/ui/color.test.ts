import { describe, expect, it } from "vitest";
import { CH_COLOR_NONE, CH_COLOR_PALETTE } from "../model/units";
import { declarations, readStyle } from "../style/css-read";
import { inkOn } from "./color";

/** The WCAG 2.1 contrast ratio of two `#rrggbb` colours. */
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

describe("a second colour worked out from a given one", () => {
  it("names a colour in whichever of black and white reads on it", () => {
    // WCAG 2.1 contrast, not a brightness guess: yellow and white take black,
    // and the deep blue and the near-black take white.
    expect(inkOn("#e6e710")).toBe("#000000");
    expect(inkOn("#e6e6e6")).toBe("#000000");
    expect(inkOn("#1965ff")).toBe("#ffffff");
    expect(inkOn("#232326")).toBe("#ffffff");
  });

  it("names every swatch in the palette in whichever of black and white has the higher ratio on it", () => {
    for (const { name, hex } of CH_COLOR_PALETTE) {
      const best = Math.max(ratio(hex, "#000000"), ratio(hex, "#ffffff"));
      expect(ratio(hex, inkOn(hex)), `${name} names itself in the ink that reads best on it`).toBe(best);
    }
  });

  it("names Off in the secondary grey above the AA ratio on its own face", () => {
    // The one that takes the colour away is named in the secondary grey rather
    // than in white, and has to read on its own face all the same.
    const secondary = declarations(readStyle("tokens.css"), ":root")["--text-secondary"] ?? "";
    expect(secondary, "the secondary grey is a colour of its own").toMatch(/^#[0-9a-f]{6}$/i);
    expect(ratio(CH_COLOR_NONE, secondary), "Off names itself legibly").toBeGreaterThanOrEqual(4.5);
  });
});
