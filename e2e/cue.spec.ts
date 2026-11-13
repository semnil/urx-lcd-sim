// MONITOR's CUE tab (System firmware V1.5), driven by real clicks: the CUE Mode
// it switches decides what a [CUE] on HOME leaves in the cue, its lamps follow
// the group in the cue, and [Clear CUE] takes every cue out.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, button, lcd, reach, tapInto } from "./tour";

const go = (page: Page, id: string): Promise<void> => reach(page, TOUR.find((s) => s.id === id)!);
const lamp = (page: Page, name: string) => lcd(page).locator(".active-cue-row", { hasText: name });
const homeCue = (page: Page, n: number) => lcd(page).locator(".btn-cue").nth(n);

/** From HOME back onto the Monitor menu, which opens on the tab it was left on. */
async function backToMonitor(page: Page): Promise<void> {
  await tapInto(page, button(page, "MONITOR", true), "monitor");
  await tapInto(page, button(page, "Monitor", true), "monitor.level");
}

test("Last CUE leaves the last [CUE] alone in the cue, the lamp shows it, and [Clear CUE] takes it out", async ({ page }) => {
  await go(page, "monitor.level");
  await button(page, "CUE", true).click();
  await expect(button(page, "Mix CUE", true)).toHaveAttribute("aria-pressed", "true");
  await expect(lamp(page, "Input")).not.toHaveClass(/is-lit/);
  await button(page, "Last CUE", true).click();
  await expect(button(page, "Last CUE", true)).toHaveAttribute("aria-pressed", "true");
  await expect(button(page, "Mix CUE", true)).toHaveAttribute("aria-pressed", "false");

  await tapInto(page, button(page, "HOME", true), "home");
  await homeCue(page, 0).click();
  await homeCue(page, 1).click();
  await expect(homeCue(page, 0)).toHaveAttribute("aria-pressed", "false");
  await expect(homeCue(page, 1)).toHaveAttribute("aria-pressed", "true");

  await backToMonitor(page);
  await expect(button(page, "Last CUE", true)).toHaveAttribute("aria-pressed", "true");
  await expect(lamp(page, "Input")).toHaveClass(/is-lit/);
  await expect(lamp(page, "Output")).not.toHaveClass(/is-lit/);
  await button(page, "Clear CUE", true).click();
  await expect(lamp(page, "Input")).not.toHaveClass(/is-lit/);
});
