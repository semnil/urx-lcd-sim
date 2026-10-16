// The questions and warnings the screen asks, answered by real clicks and keys.
// A click from a test in jsdom lands on the element it names and moves no focus;
// here the press goes down where the pointer stands, the focus moves on it, and
// the browser runs what each handler queues between them, as it does for a user.

import { expect, test, type Page } from "@playwright/test";
import { unreached } from "./reach";
import { TOUR, button, lcd, reach } from "./tour";

const go = (page: Page, id: string): Promise<void> => reach(page, TOUR.find((s) => s.id === id)!);
const dialog = (page: Page, message: string | RegExp) => lcd(page).getByRole("dialog", { name: message });

test.describe("POWER MANAGEMENT's Auto Power Off", () => {
  const WARNING = /Disabling this function will increase power/;

  test("warns before it goes off; [Cancel] leaves it on and the focus on [Enable]", async ({ page }) => {
    await go(page, "setup.power");
    const enable = button(page, "Enable", true);
    await enable.click();
    await expect(dialog(page, WARNING)).toBeVisible();
    expect(await unreached(page)).toEqual([]);
    await expect(dialog(page, WARNING).getByRole("button", { name: "Cancel" })).toBeFocused();
    await dialog(page, WARNING).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page, WARNING)).toHaveCount(0);
    await expect(enable).toHaveAttribute("aria-pressed", "true");
    await expect(enable).toBeFocused();
  });

  test("goes off on the warning's [OK], and back on without a word", async ({ page }) => {
    await go(page, "setup.power");
    const enable = button(page, "Enable", true);
    await enable.click();
    await dialog(page, WARNING).getByRole("button", { name: "OK" }).click();
    await expect(dialog(page, WARNING)).toHaveCount(0);
    await expect(enable).toHaveAttribute("aria-pressed", "false");
    await enable.click();
    await expect(enable).toHaveAttribute("aria-pressed", "true");
    await expect(lcd(page).getByRole("dialog")).toHaveCount(0);
  });

  test("takes the warning back on Escape, as [Cancel] does", async ({ page }) => {
    await go(page, "setup.power");
    const enable = button(page, "Enable", true);
    await enable.press("Enter");
    await expect(dialog(page, WARNING)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page, WARNING)).toHaveCount(0);
    await expect(enable).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".lcd[data-screen]:not([inert])")).toHaveAttribute("data-screen", "setup.power");
  });
});

test.describe("TOOLS' Format", () => {
  const WARNING = /Formatting will erase ALL data on this card/;

  test("warns once the volume label is in, and [Cancel] formats nothing", async ({ page }) => {
    await go(page, "microsd.tools");
    await button(page, "Format microSD").click();
    await expect(page.locator(".lcd[data-screen]:not([inert])")).toHaveAttribute("data-screen", "microsd.name");
    await button(page, "OK", true).click();
    await expect(dialog(page, WARNING)).toBeVisible();
    expect(await unreached(page)).toEqual([]);
    await dialog(page, WARNING).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page, WARNING)).toHaveCount(0);
    await expect(lcd(page).getByText("Formatting in progress...")).toHaveCount(0);
  });

  test("formats on the warning's [OK]", async ({ page }) => {
    await go(page, "microsd.tools");
    await button(page, "Format microSD").click();
    await button(page, "OK", true).click();
    await dialog(page, WARNING).getByRole("button", { name: "OK" }).click();
    await expect(lcd(page).getByText("Formatting in progress...")).toBeVisible();
  });
});

test("the eject button asks, then says the card may come out, and [OK] takes it out", async ({ page }) => {
  await go(page, "microsd");
  await button(page, "Eject the card").click();
  const ask = dialog(page, "Eject the microSD card?");
  await expect(ask).toBeVisible();
  expect(await unreached(page)).toEqual([]);
  await ask.getByRole("button", { name: "OK" }).click();
  const told = dialog(page, "Now you may safely remove the microSD card.");
  await expect(told).toBeVisible();
  await expect(told.getByRole("button", { name: "OK" })).toBeFocused();
  expect(await unreached(page)).toEqual([]);
  await told.getByRole("button", { name: "OK" }).click();
  await expect(lcd(page).getByRole("dialog")).toHaveCount(0);
  await expect(button(page, "Recorder", true)).toHaveCount(0);
});

test.describe("the question beside its mark", () => {
  // The middle of a box's height, and its top, in page pixels.
  const middle = async (page: Page, selector: string): Promise<{ mid: number; top: number }> => {
    const box = (await lcd(page).locator(`.dialog ${selector}`).boundingBox())!;
    return { mid: box.y + box.height / 2, top: box.y };
  };

  for (const [lines, id, open, message] of [
    [1, "microsd", "Eject the card", "Eject the microSD card?"],
    [2, "setup.power", "Enable", /Disabling this function will increase power/],
    [3, "microsd.tools", "Format microSD", /Formatting will erase ALL data on this card/],
  ] as const) {
    test(`stands ${lines} line(s) on the mark's middle, the mark where a line's would stand`, async ({ page }) => {
      await go(page, id);
      await button(page, open, id === "setup.power").click();
      if (id === "microsd.tools") await button(page, "OK", true).click();
      await expect(dialog(page, message)).toBeVisible();
      const text = (await lcd(page).locator(".dialog .dialog-text").boundingBox())!;
      const mark = await middle(page, ".dialog-mark");
      const sheet = (await lcd(page).locator(".dialog").boundingBox())!;
      const scale = sheet.width / 414;
      // The box is as tall as its lines, so its middle is theirs.
      expect(Math.abs(text.height / scale - 18 * lines)).toBeLessThan(0.5);
      expect(Math.abs(text.y + text.height / 2 - mark.mid)).toBeLessThan(0.5);
      // The mark keeps its place under the frame however many lines stand beside it.
      expect(Math.abs((mark.top - sheet.y) / scale - (4 + 74))).toBeLessThan(0.5);
    });
  }
});

test("a pulldown's list takes a touch on a row, and goes on a touch on the dark around it", async ({ page }) => {
  await go(page, "ch.setting");
  const pulldown = button(page, "COMP / EQ");
  await pulldown.click();
  const list = lcd(page).getByRole("listbox");
  await expect(list).toBeVisible();
  expect(await unreached(page)).toEqual([]);
  const box = (await list.boundingBox())!;
  await page.mouse.click(box.x - 10, box.y + box.height / 2);
  await expect(list).toHaveCount(0);
  await expect(pulldown).toContainText("COMP->EQ");
  await pulldown.click();
  await lcd(page).getByRole("option", { name: "SSMCS", exact: true }).click();
  await expect(lcd(page).getByRole("listbox")).toHaveCount(0);
  await expect(pulldown).toContainText("SSMCS");
});

test.describe("[Device]", () => {
  const device = (page: Page) => page.getByRole("button", { name: "Device", exact: true });
  const item = (page: Page, name: string) => page.getByRole("menuitem", { name });
  const ch1On = (page: Page) => lcd(page).getByRole("button", { name: "ON", exact: true }).first();

  for (const [name, question] of [
    ["Initialize Current Memories", "Initialize current memories?"],
    ["Initialize All Memories", "Initialize all memories?"],
  ] as const) {
    // A click on an item moves the focus off [Device] as the press goes down; the
    // menu shut on that once, and the click then reached no item.
    test(`[${name}] asks, and [Initialize] pressed once the question is up starts the unit again as it ships`, async ({ page }) => {
      await go(page, "home");
      await ch1On(page).click();
      await expect(ch1On(page)).toHaveAttribute("aria-pressed", "false");
      await device(page).click();
      await expect(page.getByRole("menu", { name: "Device" })).toBeVisible();
      await item(page, name).click();
      await expect(page.getByText(question)).toBeVisible();
      await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
      // The question lies over the top of the glass until it is answered.
      expect(await unreached(page, ".chrome-reset-panel")).toEqual([]);
      // [Initialize] holds off a press the moment the question appears, for longer than a double click.
      await page.waitForTimeout(600);
      await page.getByRole("button", { name: "Initialize", exact: true }).click();
      await expect(page.getByText(question)).toHaveCount(0);
      await expect(ch1On(page)).toHaveAttribute("aria-pressed", "true");
      await expect(device(page)).toBeFocused();
    });
  }

  test("[Cancel] takes the question back and leaves the unit as it was", async ({ page }) => {
    await go(page, "home");
    await ch1On(page).click();
    await device(page).click();
    await item(page, "Initialize All Memories").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Initialize all memories?")).toHaveCount(0);
    await expect(device(page)).toBeFocused();
    await expect(ch1On(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("leaves the unit alone under a double click on an item", async ({ page }) => {
    await go(page, "home");
    await ch1On(page).click();
    await device(page).click();
    await item(page, "Initialize All Memories").dblclick();
    await expect(page.getByText("Initialize all memories?")).toBeVisible();
    await expect(ch1On(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("shuts the menu on a touch on the glass, and on Escape", async ({ page }) => {
    await go(page, "home");
    await device(page).click();
    await expect(page.getByRole("menu", { name: "Device" })).toBeVisible();
    await lcd(page).getByRole("button", { name: "STEREO meter" }).click();
    await expect(page.getByRole("menu", { name: "Device" })).toHaveCount(0);
    await device(page).click();
    await expect(page.getByRole("menu", { name: "Device" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: "Device" })).toHaveCount(0);
    await expect(device(page)).toBeFocused();
  });
});

test.describe("a sheet hung off the glass", () => {
  test("goes down on a touch on its dark, stays up on a touch on its panel, and holds the screen under it out of reach", async ({ page }) => {
    await go(page, "ch.input");
    const sheet = lcd(page).locator(".source-overlay");
    const panel = lcd(page).locator(".source-sheet");
    await lcd(page).locator(".input-source-btn").click();
    await expect(sheet).toHaveCount(1);
    expect(await unreached(page)).toEqual([]);
    const glass = (await lcd(page).boundingBox())!;
    const box = (await panel.boundingBox())!;
    // The top left corner of the glass lies outside the panel, on the dark.
    expect(box.x - glass.x, "the panel leaves the corner bare").toBeGreaterThan(10);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height - 4);
    await expect(sheet).toHaveCount(1);
    await page.mouse.click(glass.x + 5, glass.y + 5);
    await expect(sheet).toHaveCount(0);
  });
});
