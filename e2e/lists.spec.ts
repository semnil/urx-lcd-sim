// Where a pulldown's list opens, as the unit opens it: CH SETTING's Rec Point
// beside its box with PRE COMP level with it, and COMP's Knee under its box down
// to the foot of the glass.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, button, lcd, reach } from "./tour";

const go = (page: Page, id: string): Promise<void> => reach(page, TOUR.find((s) => s.id === id)!);

/** A box on the glass in the glass's own pixels. */
async function onGlass(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const glass = (await lcd(page).boundingBox())!;
  const k = glass.width / 480;
  return { x0: (box.x - glass.x) / k, y0: (box.y - glass.y) / k, x1: (box.x + box.width - glass.x) / k, y1: (box.y + box.height - glass.y) / k };
}

test("Rec Point's list opens beside its box, PRE COMP level with it", async ({ page }) => {
  await go(page, "ch.setting");
  const pulldown = button(page, "Rec Point");
  const box = await onGlass(page, (await pulldown.boundingBox())!);
  await pulldown.click();
  const list = await onGlass(page, (await lcd(page).getByRole("listbox").boundingBox())!);
  const row = await onGlass(page, (await lcd(page).getByRole("option", { name: "PRE COMP", exact: true }).boundingBox())!);
  expect(list.x0).toBeGreaterThanOrEqual(box.x1);
  expect(Math.abs(row.y0 - box.y0)).toBeLessThanOrEqual(1);
});

test("Knee's list hangs under its box down to the foot of the glass", async ({ page }) => {
  await go(page, "ch.comp");
  const pulldown = button(page, "Knee");
  const box = await onGlass(page, (await pulldown.boundingBox())!);
  await pulldown.click();
  const list = await onGlass(page, (await lcd(page).getByRole("listbox").boundingBox())!);
  expect(Math.abs(list.y0 - box.y1)).toBeLessThanOrEqual(1);
  expect(Math.abs(list.y1 - 272)).toBeLessThanOrEqual(1);
});
