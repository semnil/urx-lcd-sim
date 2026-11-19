// The SEND screen by real clicks: the channel view's [SEND] opens it, the side
// menu switches between SEND TO and SEND FROM, and the round arrows step the
// pages of cards.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, button, lcd, reach, tapInto } from "./tour";

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

// The step arrows as p125-1 draws them on SEND FROM: arms at 45 degrees and two pixels
// across, [<]'s point on x19..20 and [>]'s on x124..125, both on y20..21.
test("SEND FROM's step arrows stand where p125-1 draws them", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.sendfrom")!);
  const marks = await lcd(page).evaluate((glass) => {
    const box = glass.getBoundingClientRect();
    const k = box.width / 480;
    const mark = (name: string) => {
      const path = glass.querySelector(`.ch-selector [aria-label="${name}"] path`)!;
      const r = path.getBoundingClientRect();
      return { x: (r.left - box.left) / k, right: (r.right - box.left) / k, y: (r.top - box.top) / k, bottom: (r.bottom - box.top) / k, stroke: getComputedStyle(path).strokeWidth };
    };
    return { prev: mark("Previous channel"), next: mark("Next channel") };
  });
  expect(marks).toEqual({
    prev: { x: 19, right: 25, y: 14.5, bottom: 26.5, stroke: "1.75px" },
    next: { x: 119, right: 125, y: 14.5, bottom: 26.5, stroke: "1.75px" },
  });
});
