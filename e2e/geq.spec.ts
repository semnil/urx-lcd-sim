// Flex12GEQ's settings on a MIX bus's CH SETTING, by real clicks: EQ Type and
// GEQ Limit open their lists and take a pick, GEQ Limit comes in without moving
// any other field, and the channel view shows the GEQ area in place of the EQ.

import { expect, test, type Page } from "@playwright/test";
import { button, lcd, tapInto } from "./tour";

/** HOME's MIX bank, MIX 1's channel view, and its CH SETTING. */
async function mixSetting(page: Page): Promise<void> {
  await page.goto("./");
  await tapInto(page, lcd(page).getByRole("button", { name: /channel bank/ }), "bank-select");
  await tapInto(page, button(page, "MIX, ST STREAMING"), "home");
  await tapInto(page, button(page, "MIX 1 settings"), "channel-view");
  await tapInto(page, button(page, /^MIX 1/), "ch.setting");
}

/** The boxes of the fields that stand whatever the EQ Type. */
const boxes = (page: Page) =>
  Promise.all([".chs-color-field", ".chs-icon-field", ".chs-name-field", ".chs-eqtype-field", ".chs-bustype-field", ".chs-panlink"].map((sel) => lcd(page).locator(sel).boundingBox()));

test("EQ Type and GEQ Limit take a pick from their lists, and GEQ Limit moves no other field", async ({ page }) => {
  await mixSetting(page);
  const before = await boxes(page);
  await expect(lcd(page).locator(".chs-geqlimit-field")).toHaveCount(0);

  await button(page, "EQ Type").click();
  await lcd(page).getByRole("option", { name: "Flex12GEQ", exact: true }).click();
  await expect(lcd(page).getByRole("listbox")).toHaveCount(0);
  await expect(button(page, "EQ Type")).toContainText("Flex12GEQ");
  await expect(lcd(page).locator(".chs-geqlimit-field")).toHaveCount(1);
  expect(await boxes(page)).toEqual(before);

  await button(page, "GEQ Limit").click();
  await lcd(page).getByRole("option", { name: "±6dB", exact: true }).click();
  await expect(lcd(page).getByRole("listbox")).toHaveCount(0);
  await expect(button(page, "GEQ Limit")).toContainText("±6dB");

  await tapInto(page, button(page, "Back", true), "channel-view");
  await expect(lcd(page).locator(".cv-block-geq")).toHaveCount(1);
  await expect(lcd(page).locator(".cv-block-eq")).toHaveCount(0);
});
