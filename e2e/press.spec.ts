// A control drawn with a band under its face sinks while it is held, and its
// foot is cut by the band's depth as it goes down. A quick tap is let go before
// the face has slid down, and it still lands on the control it went down on,
// band and all: the cut follows the face rather than running ahead of it.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, button, reach, screenOf } from "./tour";

const go = (page: Page, id: string): Promise<void> => reach(page, TOUR.find((s) => s.id === id)!);

/** A tap at `dy` CSS pixels above the foot of `node`'s box, down and up at once. */
async function tapAtFoot(page: Page, name: string, dy: number, exact = true): Promise<void> {
  const box = (await button(page, name, exact).boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height - dy);
}

// At the default scale a screen pixel is two CSS pixels, so the band's three
// are six; a seventh is on the face above it.
const FOOT = [1, 2, 3, 4, 5, 6, 7];

for (const dy of FOOT) {
  test(`a quick tap ${dy}px above a channel-view block's foot opens its screen`, async ({ page }) => {
    await go(page, "channel-view");
    // The first touch brings the focus to GATE's value and does not sink the block.
    await tapAtFoot(page, "GATE", dy);
    expect(await screenOf(page)).toBe("channel-view");
    await page.waitForTimeout(100);
    await tapAtFoot(page, "GATE", dy);
    await expect(page.locator('.lcd[data-screen="ch.gate"]:not([inert])')).toHaveCount(1);
  });

  test(`a quick tap ${dy}px above a SETUP menu button's foot opens its screen`, async ({ page }) => {
    await go(page, "setup");
    await tapAtFoot(page, "Version", dy);
    await expect(page.locator('.lcd[data-screen="setup.version"]:not([inert])')).toHaveCount(1);
  });
}
