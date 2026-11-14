// The SEND screen by real clicks: the channel view's [SEND] opens it, the side
// menu switches between SEND TO and SEND FROM, and the round arrows step the
// pages of cards.

import { expect, test, type Page } from "@playwright/test";
import { button, lcd, tapInto } from "./tour";

/** HOME's MIX bank and the channel view of `strip`. */
async function channelView(page: Page, strip: string): Promise<void> {
  await page.goto("./");
  await tapInto(page, lcd(page).getByRole("button", { name: /channel bank/ }), "bank-select");
  await tapInto(page, button(page, "MIX, ST STREAMING"), "home");
  await tapInto(page, button(page, `${strip} settings`), "channel-view");
}

const titles = (page: Page) => lcd(page).locator(".sendto-title").allTextContents();

test("MIX 1's [SEND] opens SEND TO, the side menu switches to SEND FROM, and the arrows step its pages", async ({ page }) => {
  await channelView(page, "MIX 1");
  await tapInto(page, button(page, "SEND", true), "ch.sendto");
  expect(await titles(page)).toEqual(["STEREO"]);

  await tapInto(page, button(page, "SEND FROM"), "ch.sendfrom");
  expect(await titles(page)).toEqual(["CH 1", "CH 2", "CH 3", "CH 4"]);
  await button(page, "Next page of sends").click();
  await expect.poll(() => titles(page)).toEqual(["CH 5/6", "CH 7/8", "CH 9/10", "CH 11/12"]);
  await button(page, "Next page of sends").click();
  await expect.poll(() => titles(page)).toEqual(["FX1", "FX2"]);
  await expect(button(page, "Next page of sends")).toHaveCount(0);
  await button(page, "Previous page of sends").click();
  await expect.poll(() => titles(page)).toEqual(["CH 5/6", "CH 7/8", "CH 9/10", "CH 11/12"]);

  await tapInto(page, button(page, "SEND TO"), "ch.sendto");
  expect(await titles(page)).toEqual(["STEREO"]);
});

test("the stereo bus's [SEND] opens SEND FROM, the one view it has", async ({ page }) => {
  await channelView(page, "STEREO");
  await tapInto(page, button(page, "SEND", true), "ch.sendfrom");
  expect(await titles(page)).toEqual(["CH 1", "CH 2", "CH 3", "CH 4"]);
  await expect(button(page, "SEND TO")).toHaveCount(0);
});
