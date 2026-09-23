import { describe, expect, it } from "vitest";
import { meter } from "./widgets";
import { declarations, readStyle } from "../style/css-read";

const CSS = readStyle("lcd.css");

const clips = (node: HTMLElement): HTMLElement[] => [...node.querySelectorAll<HTMLElement>(".meter-clip")];
const lit = (node: HTMLElement): boolean[] => clips(node).map((c) => c.classList.contains("is-on"));

describe("a meter", () => {
  it("carries a clip indicator over every bar", () => {
    expect(clips(meter({ levels: [-20] }))).toHaveLength(1);
    expect(clips(meter({ levels: [-20, -14] }))).toHaveLength(2);
  });

  it("leaves the indicator dark below the top of the scale", () => {
    expect(lit(meter({ levels: [-60, -20, -0.5] }))).toEqual([false, false, false]);
  });

  it("lights it at the top of the scale and above", () => {
    expect(lit(meter({ levels: [0] }))).toEqual([true]);
    expect(lit(meter({ levels: [6] }))).toEqual([true]);
  });

  it("lights only the channel that reached it", () => {
    expect(lit(meter({ levels: [-30, 0] }))).toEqual([false, true]);
  });

  it("is green over the lower half of the bar and yellow over the upper half", () => {
    // Whatever the meter's length or range. A bar lit to its top is yellow to
    // the top; only the clip dot over it is red. The lit part is yellow, and the
    // green over it is cut to the lower half of the bar itself, so the halves
    // stay put as the level moves.
    const yellow = declarations(CSS, ".meter-bar::before")["background"] ?? "";
    const green = declarations(CSS, ".meter-bar::after");
    expect(yellow.split(",").at(-1)?.trim()).toBe("var(--meter-yellow)");
    expect((green["background"] ?? "").split(",").at(-1)?.trim()).toBe("var(--meter-green)");
    // The half is the bar's own, read off the bar as a container, and taken down
    // to a whole row, which hands an odd bar's middle row to yellow.
    expect(declarations(CSS, ".meter-bar")["container-type"]).toBe("size");
    expect(green["clip-path"]).toBe("inset(max(0px, calc(100% - round(down, 50cqh, 1px))) 0 0 0)");
    expect(yellow + (green["background"] ?? ""), "the bar carries no red").not.toContain("--meter-red");
    expect(declarations(CSS, ".meter-clip.is-on")["--meter-face"], "the clip dot does").toBe("var(--meter-clip-lit)");
    expect(declarations(CSS, ".meter-clip")["background"], "on its face").toBe("var(--meter-rows), var(--meter-face)");
    for (const node of [meter({ levels: [-20] }), meter({ levels: [-20], min: -30, max: 0 })]) {
      expect(node.getAttribute("style") ?? "", "no meter moves the halves").not.toContain("zone");
    }
  });

  it("paints the bands only where the bar is lit", () => {
    // The unlit part is the bar's own track colour with nothing of the bands
    // under it; both bands start at the level, taken to a whole row.
    const own = declarations(CSS, ".meter-bar")["background"] ?? "";
    expect(own).toBe("var(--meter-rows), var(--meter-track)");
    expect(own, "none of the bands under it").not.toMatch(/meter-(green|yellow)/);
    for (const part of [".meter-bar::before", ".meter-bar::after"]) {
      const d = declarations(CSS, part);
      expect([d["top"], d["bottom"], d["inset"]], part).toEqual(["round(var(--unlit, 100%), 1px)", "0", undefined]);
    }
    expect(CSS, "nothing is drawn over the bands to hide them").not.toContain("meter-shade");
    const bars = [...meter({ levels: [-60, -30, 0, 6] }).querySelectorAll<HTMLElement>(".meter-bar")];
    expect(bars.map((b) => b.style.getPropertyValue("--unlit"))).toEqual(["100%", "50%", "0%", "0%"]);
    expect(bars.every((b) => b.children.length === 0), "and the bar holds no element of its own").toBe(true);
  });

  it("starts the lit part on the corner shades of the colour its first rows are lit in", () => {
    // The row the level starts on and the sides of the rows under it take the
    // shades of the colour each row is lit in, and the ground beside the first
    // row stays the track.
    const yellow = declarations(CSS, ".meter-bar::before");
    const green = declarations(CSS, ".meter-bar::after");
    expect([yellow["--top-outer"], yellow["--top-inner"]]).toEqual(["var(--meter-level-outer)", "var(--meter-level-inner)"]);
    expect([green["--top-outer"], green["--top-inner"]]).toEqual(["var(--meter-level-green-outer)", "var(--meter-level-green-inner)"]);
    for (const d of [yellow, green]) {
      expect(d["--top-ground"]).toBe("var(--meter-track)");
      expect(d["background"]).toContain("var(--meter-rows)");
    }
  });

  it("wears the top-end shades of a lit bar only when lit to the top", () => {
    // They lie over the level's shades, each row at its place at the top, and
    // any unlit row above the level pushes all of them clear of the bar.
    const before = declarations(CSS, ".meter-bar::before");
    expect((before["background"] ?? "").split(",")[0]?.trim()).toBe("var(--meter-full-rows)");
    const at = [...(before["--meter-full-rows"] ?? "").matchAll(/\)\s+0 (calc\([^/]+?\))\s*\/\s*100% 1px no-repeat/g)].map((r) => r[1]);
    expect(at).toEqual([0, 1].map((k) => `calc(${k}px + clamp(0px, (100cqh - 100% - 1px) * 1000, 1000px))`));
  });

  it("puts the lit share on the meter's own scale", () => {
    const unlit = (node: HTMLElement): string[] =>
      [...node.querySelectorAll<HTMLElement>(".meter-bar")].map((b) => b.style.getPropertyValue("--unlit"));
    expect(unlit(meter({ levels: [-15], min: -30, max: 0 }))).toEqual(["50%"]);
    expect(unlit(meter({ levels: [-33], min: -60, max: -6 })), "a scale that stops short of 0 dB").toEqual(["50%"]);
  });

  it("reads a level that is not a number as silence", () => {
    const node = meter({ levels: [Number.NaN] });
    expect(node.querySelector<HTMLElement>(".meter-bar")?.style.getPropertyValue("--unlit")).toBe("100%");
    expect(lit(node)).toEqual([false]);
  });

  it("follows a scale that does not end at 0 dB", () => {
    // The channel meters run to 0, but the option exists, and the indicator has
    // to mean "the top of this meter" rather than a hard-coded level.
    expect(lit(meter({ levels: [-6], min: -60, max: -6 }))).toEqual([true]);
  });
});
