import { describe, expect, it } from "vitest";
import { SCRIM, SCRIM_FILTER_ID, scrimFilter } from "./scrim";

describe("the scrim filter", () => {
  const svg = scrimFilter();
  const filter = svg.querySelector("filter");

  it("is found by the id the overlays refer to, and works on sRGB values", () => {
    expect(filter?.getAttribute("id")).toBe(SCRIM_FILTER_ID);
    expect(filter?.getAttribute("color-interpolation-filters")).toBe("sRGB");
  });

  it("scales each channel by the values fitted to the guide's darkened captures", () => {
    // The filter's matrix carries SCRIM's scale on its diagonal and SCRIM's
    // offset in its last column, and passes alpha through.
    expect(SCRIM.scale).toEqual([0.204, 0.202, 0.192]);
    expect(SCRIM.offset).toEqual([0, 0, 0.00196]);
    const v = (filter?.querySelector("feColorMatrix")?.getAttribute("values") ?? "").trim().split(/\s+/).map(Number);
    expect([v[0], v[6], v[12]]).toEqual([...SCRIM.scale]);
    expect([v[4], v[9], v[14]]).toEqual([...SCRIM.offset]);
    expect([v[18], v[19]], "alpha passes through").toEqual([1, 0]);
  });

  it("takes each channel down to 32 / 64 / 32 steps", () => {
    const fns = [...(filter?.querySelectorAll("feComponentTransfer > *") ?? [])];
    expect(fns.map((f) => f.tagName)).toEqual(["feFuncR", "feFuncG", "feFuncB"]);
    expect(SCRIM.steps).toEqual([32, 64, 32]);
    fns.forEach((f, i) => {
      expect(f.getAttribute("type")).toBe("discrete");
      const table = (f.getAttribute("tableValues") ?? "").split(" ").map(Number);
      expect(table).toHaveLength(SCRIM.steps[i] ?? 0);
      expect([table[0], table.at(-1)]).toEqual([0, 1]);
    });
  });

  it("takes no room in the LCD", () => {
    expect([svg.getAttribute("width"), svg.getAttribute("height")]).toEqual(["0", "0"]);
  });
});
