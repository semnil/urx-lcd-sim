// A list the bar beside it scrolls is moved by the page's own script, never by the browser: the
// wheel and the keys move it by its rows, and a list at its end leaves the wheel to the page.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, reach } from "./tour";

const list = (page: Page) => page.locator('.lcd[data-screen="scene.list"]:not([inert]) .scene-list .list-body');
const top = (page: Page): Promise<number> => list(page).evaluate((n) => n.scrollTop);
const pitch = (page: Page): Promise<number> =>
  list(page).evaluate((n) => {
    const [a, b] = [...n.querySelectorAll(".list-row")].map((r) => r.getBoundingClientRect().top);
    return (b! - a!) / (n.closest(".lcd")!.getBoundingClientRect().width / (n.closest(".lcd") as HTMLElement).offsetWidth);
  });

test("scrolls SCENE LIST by the wheel and by the keys, the browser not scrolling it", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "scene.list")!);
  expect(await list(page).evaluate((n) => getComputedStyle(n).overflowY)).toBe("hidden");
  const box = (await list(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120);
  await expect.poll(() => top(page), "the wheel moves the list").toBeGreaterThan(0);
  await list(page).focus();
  await page.keyboard.press("Home");
  await expect.poll(() => top(page)).toBe(0);
  const row = await pitch(page);
  await page.keyboard.press("ArrowDown");
  await expect.poll(() => top(page), "an arrow moves it one row").toBeCloseTo(row, 0);
  await page.keyboard.press("End");
  const end = await list(page).evaluate((n) => n.scrollHeight - n.clientHeight);
  await expect.poll(() => top(page), "End reaches the last row").toBeCloseTo(end, 0);
  // At its end the list leaves the wheel to the page.
  const taken = await list(page).evaluate((n) => {
    const ev = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
    n.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(taken).toBe(false);
});
