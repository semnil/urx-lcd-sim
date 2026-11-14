// Flex12GEQ by real clicks: on a MIX bus's CH SETTING, EQ Type and GEQ Limit
// open their lists and take a pick, GEQ Limit comes in without moving any other
// field, and the channel view shows the GEQ area in place of the EQ; on the
// stereo bus's GEQ screen, a swipe and the graph step the sliders, a box
// dragged up lifts its band, and [GEQ Link] makes and breaks the link through
// its dialogs.

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

/** The stereo bus on Flex12GEQ, its GEQ screen opened from the channel view's GEQ area. */
async function geqScreen(page: Page): Promise<void> {
  await page.goto("./");
  await tapInto(page, lcd(page).getByRole("button", { name: /channel bank/ }), "bank-select");
  await tapInto(page, button(page, "MIX, ST STREAMING"), "home");
  await tapInto(page, button(page, "STEREO settings"), "channel-view");
  await tapInto(page, button(page, /^STEREO L/), "ch.setting");
  await button(page, "EQ Type").click();
  await lcd(page).getByRole("option", { name: "Flex12GEQ", exact: true }).click();
  await tapInto(page, button(page, "Back", true), "channel-view");
  await tapInto(page, lcd(page).locator(".cv-geq"), "ch.geq");
}

const shown = (page: Page) => lcd(page).locator(".geq-box").allTextContents();

test("the GEQ screen steps its sliders by a swipe and by a touch on the graph, and a box dragged up lifts its band", async ({ page }) => {
  await geqScreen(page);
  expect(await shown(page)).toEqual(["20", "25", "31.5", "40"]);

  // A finger drawn to the left across the slider area, off the boxes.
  const area = await lcd(page).locator(".geq-sliders").boundingBox();
  if (!area) throw new Error("no slider area");
  const y = area.y + area.height * 0.9;
  await page.mouse.move(area.x + area.width * 0.7, y);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width * 0.4, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => shown(page)).toEqual(["50", "63", "80", "100"]);

  // The graph's right end brings up the last page.
  const graph = await lcd(page).locator(".geq-graph").boundingBox();
  if (!graph) throw new Error("no graph");
  await page.mouse.click(graph.x + graph.width * 0.95, graph.y + graph.height / 2);
  await expect.poll(() => shown(page)).toEqual(["12.5k", "16k", "20k"]);

  // Dragging the 16k box up lifts the band, and Available counts it.
  const knob = lcd(page).locator(".geq-box", { hasText: "16k" });
  const at = await knob.boundingBox();
  if (!at) throw new Error("no 16k box");
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2);
  await page.mouse.down();
  await page.mouse.move(at.x + at.width / 2, at.y + at.height / 2 - 40, { steps: 8 });
  await page.mouse.up();
  await expect(lcd(page).locator(".geq-available-count")).toHaveText("11");
  await expect(lcd(page).locator(".knob-cell-value").nth(1)).not.toHaveText("0.0dB");
});

test("[GEQ Link] makes the link from the side chosen and breaks it after [OK]", async ({ page }) => {
  await geqScreen(page);
  const link = lcd(page).locator(".geq-link");
  await expect(link).toHaveAttribute("aria-pressed", "false");
  await link.click();
  await expect(lcd(page).locator(".dialog-text")).toHaveText("Make Link GEQ Parameters?");
  await button(page, "ST L → ST R", true).click();
  await expect(lcd(page).getByRole("dialog")).toHaveCount(0);
  await expect(link).toHaveAttribute("aria-pressed", "true");
  await link.click();
  await expect(lcd(page).locator(".dialog-text")).toHaveText("Break Link GEQ Parameters?");
  await button(page, "OK", true).click();
  await expect(lcd(page).getByRole("dialog")).toHaveCount(0);
  await expect(link).toHaveAttribute("aria-pressed", "false");
});
