// Where a pulldown's list opens, as the unit opens it: CH SETTING's Rec Point
// beside its box with PRE COMP level with it, Signal Type under its box down to
// the foot of the glass, and COMP's Knee the same.

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

test("a stereo channel's Rec Point list opens beside its box, PRE FADER level with it", async ({ page }) => {
  await go(page, "ch.setting");
  // CH 1, 2, 3, 4, then CH 5/6.
  for (let i = 0; i < 4; i++) await button(page, "Next channel", true).click();
  await expect(lcd(page).getByRole("button", { name: "Signal Type" })).toHaveCount(0);
  const pulldown = button(page, "Rec Point");
  const box = await onGlass(page, (await pulldown.boundingBox())!);
  await pulldown.click();
  const list = await onGlass(page, (await lcd(page).getByRole("listbox").boundingBox())!);
  const row = await onGlass(page, (await lcd(page).getByRole("option", { name: "PRE FADER", exact: true }).boundingBox())!);
  expect(list.x0).toBeGreaterThanOrEqual(box.x1);
  expect(Math.abs(row.y0 - box.y0)).toBeLessThanOrEqual(1);
});

test("Signal Type's list hangs under its box down to the foot of the glass", async ({ page }) => {
  await go(page, "ch.setting");
  const pulldown = button(page, "Signal Type");
  const box = await onGlass(page, (await pulldown.boundingBox())!);
  await pulldown.click();
  const list = await onGlass(page, (await lcd(page).getByRole("listbox").boundingBox())!);
  expect(list.y0).toBeGreaterThanOrEqual(box.y1);
  expect(Math.abs(list.y1 - 272)).toBeLessThanOrEqual(1);
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
