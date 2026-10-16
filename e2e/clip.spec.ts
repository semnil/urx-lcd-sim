// What the main area paints in the margin around its box. The selected strip's
// frame stands outside the strip, and the 1-knob panel starts three rows above
// the main area; both show in Chromium and in WebKit, which has no clip
// margin. The `webkit` project in playwright.config.ts runs this file alone.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, lcd, reach } from "./tour";

const go = (page: Page, id: string): Promise<void> => reach(page, TOUR.find((s) => s.id === id)!);

/** The colour on screen at glass coordinates (`x`, `y`). */
async function pixel(page: Page, x: number, y: number): Promise<string> {
  const glass = (await lcd(page).boundingBox())!;
  const k = glass.width / 480;
  const png = await page.screenshot({ clip: { x: glass.x + x * k, y: glass.y + y * k, width: 1, height: 1 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const g = canvas.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const [r, gr, b] = g.getImageData(0, 0, 1, 1).data;
    return `rgb(${r}, ${gr}, ${b})`;
  }, png.toString("base64"));
}

/** `node`'s box in glass coordinates. */
async function glassBox(page: Page, selector: string): Promise<{ x: number; y: number; right: number; bottom: number }> {
  return lcd(page)
    .locator(selector)
    .first()
    .evaluate((node) => {
      const glass = node.closest(".lcd")!.getBoundingClientRect();
      const k = glass.width / 480;
      const r = node.getBoundingClientRect();
      return { x: (r.left - glass.left) / k, y: (r.top - glass.top) / k, right: (r.right - glass.left) / k, bottom: (r.bottom - glass.top) / k };
    });
}

test("the selected strip on HOME is framed on all four sides", async ({ page }) => {
  await go(page, "home");
  const strip = await glassBox(page, ".strip.is-selected");
  // It stands on the main area's top, bottom and left edges, so three sides of its frame lie outside the main area.
  expect([strip.x, strip.y, strip.bottom], "flush with the main area").toEqual([2, 50, 270]);
  const frame = await lcd(page)
    .locator(".strip.is-selected")
    .evaluate((node) => /rgb\([^)]*\)/.exec(getComputedStyle(node).boxShadow)?.[0]);
  const midX = (strip.x + strip.right) / 2;
  const midY = (strip.y + strip.bottom) / 2;
  const sides = {
    top: await pixel(page, midX, strip.y - 1),
    bottom: await pixel(page, midX, strip.bottom + 0.5),
    left: await pixel(page, strip.x - 1, midY),
    right: await pixel(page, strip.right + 0.5, midY),
  };
  expect(sides).toEqual({ top: frame, bottom: frame, left: frame, right: frame });
});

test("the 1-knob panel on the EQ screen shows its top rows above the main area", async ({ page }) => {
  await go(page, "ch.eq");
  await lcd(page).locator(".oneknob").first().click();
  const panel = await glassBox(page, ".oneknob-panel");
  const main = await glassBox(page, ".main");
  expect(main.y - panel.y, "rows above the main area").toBe(3);
  const fill = await lcd(page)
    .locator(".oneknob-panel")
    .evaluate((node) => getComputedStyle(node).backgroundColor);
  const x = (panel.x + panel.right) / 2;
  const rows = [];
  for (let y = panel.y; y < main.y + 1; y++) rows.push(await pixel(page, x, y));
  expect(rows).toEqual([fill, fill, fill, fill]);
});
