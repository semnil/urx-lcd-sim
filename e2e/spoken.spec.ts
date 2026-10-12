// Every screen, reached by touches alone, hands a screen reader no mark in its printed form:
// each name and description on the glass carries "CH", an a/b pair, a slash, the middle dot
// and the polarity mark in their readings (src/ui/spoken.ts).

import { expect, test } from "@playwright/test";
import { holdsMark } from "../src/ui/spoken";
import { TOUR, reach } from "./tour";

for (const stop of TOUR) {
  test(`${stop.id}: no name read in its printed form`, async ({ page }) => {
    await reach(page, stop);
    const read = await page.evaluate(() => {
      const out: string[] = [];
      for (const e of document.querySelectorAll<HTMLElement>(".lcd [aria-label], .lcd [aria-description]")) {
        if (e.closest("[aria-hidden='true']") || !e.checkVisibility({ visibilityProperty: true })) continue;
        for (const attr of ["aria-label", "aria-description"]) {
          const value = e.getAttribute(attr);
          if (value) out.push(`${e.className || e.tagName} ${attr}: ${value}`);
        }
      }
      return out;
    });
    if (stop.id === "home") expect(read.length, "HOME names its strips, so the reading reaches the names").toBeGreaterThan(0);
    expect(read.filter((line) => holdsMark(line.slice(line.indexOf(": ") + 2)))).toEqual([]);
  });
}
