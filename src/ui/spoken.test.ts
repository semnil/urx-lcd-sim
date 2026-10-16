import { describe, expect, it } from "vitest";
import { holdsMark, setSpokenAttr, spoken } from "./spoken";

describe("a name as a screen reader is handed it", () => {
  it.each([
    ["CH 1 LEVEL", "C H 1 LEVEL"],
    ["CH 5/6 settings", "C H 5 slash 6 settings"],
    ["Play/Pause", "Play slash Pause"],
    ["Date / Time", "Date slash Time"],
    ["Date: MM/DD/YYYY (3 options)", "Date: MM slash DD slash YYYY (3 options)"],
    ["Note: 1/16. (15 options)", "Note: 1 slash 16. (15 options)"],
    ["Φ", "Phase"],
    ["Ф", "Phase"],
    ["MIX 1 · MIX 2", "MIX 1 dot MIX 2"],
  ])("reads %j as %j", (printed, said) => {
    expect(spoken(printed)).toBe(said);
    expect(holdsMark(said), "nothing left in its printed form").toBe(false);
  });

  it.each(["Chorus", "Attack", "HPF Freq.", "No Effect", "ch1x"])("leaves %j, which holds no mark, as it is", (name) => {
    expect(holdsMark(name)).toBe(false);
    expect(spoken(name)).toBe(name);
  });

  it("speaks a name and a description, and sets every other attribute as it is", () => {
    const node = document.createElement("div");
    setSpokenAttr(node, "aria-label", "CH 1 LEVEL");
    setSpokenAttr(node, "aria-description", "CH 1/2");
    setSpokenAttr(node, "data-strip", "CH 1/2");
    expect([node.getAttribute("aria-label"), node.getAttribute("aria-description"), node.getAttribute("data-strip")]).toEqual([
      "C H 1 LEVEL",
      "C H 1 slash 2",
      "CH 1/2",
    ]);
  });
});
