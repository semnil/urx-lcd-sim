// The submenu by real clicks: a swipe left from [<] opens it and a tap does not,
// [>] and a tap outside put it away, and [Copy] raises its message and lights
// [Paste] and [Compare] on every channel's screen of the same kind.

import { expect, test, type Page } from "@playwright/test";
import { TOUR, bank, block, button, lcd, reach, tapInto } from "./tour";

const tab = (page: Page) => lcd(page).locator(".submenu-tab");
const menu = (page: Page) => lcd(page).getByRole("menu", { name: "Submenu" });
const item = (page: Page, name: string) => menu(page).getByRole("button", { name, exact: true });

async function swipeOpen(page: Page): Promise<void> {
  const box = (await tab(page).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x - 60, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(menu(page)).toBeVisible();
}

test("a swipe from [<] opens the submenu, a tap does not, and [>] or a tap outside puts it away", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.gate")!);
  await tab(page).click();
  await expect(menu(page)).toHaveCount(0);

  await swipeOpen(page);
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await expect(menu(page)).toHaveCount(0);

  await swipeOpen(page);
  const glass = (await lcd(page).boundingBox())!;
  await page.mouse.click(glass.x + 40, glass.y + glass.height / 2);
  await expect(menu(page)).toHaveCount(0);
  await expect(tab(page)).toBeVisible();
});

test("[Copy] on GATE raises its message and lights [Paste] and [Compare] on every channel's GATE, not on COMP", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.gate")!);
  await swipeOpen(page);
  await expect(item(page, "Paste")).toHaveAttribute("aria-disabled", "true");
  await expect(item(page, "Compare")).toHaveAttribute("aria-disabled", "true");

  await item(page, "Copy").click();
  await expect(lcd(page).getByRole("status")).toHaveText("GATE Parameters Copied.");
  // The submenu stays open, its two buttons lit.
  await expect(item(page, "Paste")).not.toHaveAttribute("aria-disabled");
  await expect(item(page, "Compare")).not.toHaveAttribute("aria-disabled");
  // The message goes by itself.
  await expect(lcd(page).getByRole("status")).toHaveCount(0, { timeout: 4000 });

  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await button(page, "Next channel").click();
  await swipeOpen(page);
  await expect(item(page, "Paste")).not.toHaveAttribute("aria-disabled");
  await expect(item(page, "Compare")).not.toHaveAttribute("aria-disabled");
});

test("a copy from GATE leaves COMP's [Paste] and [Compare] dark", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.gate")!);
  await swipeOpen(page);
  await item(page, "Copy").click();
  await expect(item(page, "Paste")).not.toHaveAttribute("aria-disabled");

  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await tapInto(page, button(page, "Back"), "channel-view");
  await block(page, "COMP", "ch.comp");
  await swipeOpen(page);
  await expect(item(page, "Paste")).toHaveAttribute("aria-disabled", "true");
  await expect(item(page, "Compare")).toHaveAttribute("aria-disabled", "true");
});

test("a copy on SSMCS's first page lights [Paste] on its EQ page", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.ssmcs")!);
  await swipeOpen(page);
  await item(page, "Copy").click();
  await expect(lcd(page).getByRole("status")).toHaveText("SSMCS Parameters Copied.");
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  for (const id of ["ch.ssmcs.comp", "ch.ssmcs.sc", "ch.ssmcs.eq"]) await tapInto(page, button(page, "Next SSMCS screen"), id);
  await swipeOpen(page);
  await expect(item(page, "Paste")).not.toHaveAttribute("aria-disabled");
});

test("[CH Copy] on CH 1 names the channel and lights [CH Paste] on CH 2", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "channel-view")!);
  await swipeOpen(page);
  await expect(item(page, "CH Paste")).toHaveAttribute("aria-disabled", "true");
  await item(page, "CH Copy").click();
  await expect(lcd(page).getByRole("status")).toHaveText("CH 1 Parameters Copied.");
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await button(page, "Next channel").click();
  await swipeOpen(page);
  await expect(item(page, "CH Paste")).not.toHaveAttribute("aria-disabled");
});

test("[Copy] on MIX 1's SEND FROM names the bus and lights [Paste] on MIX 2's", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.sendfrom")!);
  await swipeOpen(page);
  await expect(item(page, "Paste")).toHaveAttribute("aria-disabled", "true");
  await item(page, "Copy").click();
  await expect(lcd(page).getByRole("status")).toHaveText("MIX 1 Parameters Copied.");
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  // MIX 1 is a pair: the first step goes to its R side, the second to MIX 2.
  await button(page, "Next channel").click();
  await button(page, "Next channel").click();
  await swipeOpen(page);
  await expect(item(page, "Paste")).not.toHaveAttribute("aria-disabled");
});

test("[Paste] on CH 2's GATE takes CH 1's GATE whole, with no question first", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.gate")!);
  const readout = () => lcd(page).locator(".knob-cell-value").allTextContents();
  const ch1 = await readout();
  await swipeOpen(page);
  await item(page, "Copy").click();
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await button(page, "Next channel").click();
  // CH 2's GATE starts where the factory set it, which is CH 1's too: move its
  // Threshold so the paste has something to carry.
  const cell = lcd(page).locator(".knob-cell").first();
  await cell.hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(readout).not.toEqual(ch1);
  await swipeOpen(page);
  await item(page, "Paste").click();
  await expect(lcd(page).getByRole("status")).toHaveText("GATE Parameters Pasted.");
  await expect(menu(page)).toBeVisible();
  await expect.poll(readout).toEqual(ch1);
});

test("[Compare] swaps CH 2's GATE with the copy, and a second press puts both back", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.gate")!);
  const readout = () => lcd(page).locator(".knob-cell-value").allTextContents();
  const ch1 = await readout();
  await swipeOpen(page);
  await item(page, "Copy").click();
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await button(page, "Next channel").click();
  await lcd(page).locator(".knob-cell").first().hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(readout).not.toEqual(ch1);
  const ch2 = await readout();

  await swipeOpen(page);
  await item(page, "Compare").click();
  await expect(lcd(page).getByRole("status")).toHaveText("GATE Parameters Swapped with Copy Buffer.");
  await expect.poll(readout).toEqual(ch1);
  await item(page, "Compare").click();
  await expect.poll(readout).toEqual(ch2);
});

test("[Default] asks on a warning dialog, and its [OK] puts GATE back, closes the submenu and says so", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.gate")!);
  const readout = () => lcd(page).locator(".knob-cell-value").allTextContents();
  const factory = await readout();
  await lcd(page).locator(".knob-cell").first().hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(readout).not.toEqual(factory);

  await swipeOpen(page);
  await item(page, "Default").click();
  const ask = page.locator(".dialog.is-caution");
  await expect(ask).toContainText("Return to default GATE Setting?");
  // The submenu goes as the question comes up, and stays gone after a [Cancel].
  await expect(menu(page)).toHaveCount(0);
  await ask.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(lcd(page).getByRole("status")).toHaveCount(0);
  await expect.poll(readout).not.toEqual(factory);

  await swipeOpen(page);
  await item(page, "Default").click();
  await page.locator(".dialog.is-caution").getByRole("button", { name: "OK", exact: true }).click();
  await expect(lcd(page).getByRole("status")).toHaveText("GATE Parameters Initialized.");
  await expect(menu(page)).toHaveCount(0);
  await expect.poll(readout).toEqual(factory);
});

test("[Gain Flat] on EQ asks, and its [OK] sets the band gains to 0 dB", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.eq")!);
  const gain = lcd(page).locator(".knob-cell").filter({ hasText: /Gain$/ }).first();
  const value = () => gain.locator(".knob-cell-value").textContent();
  const flat = await value();
  await gain.hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(value).not.toEqual(flat);

  await swipeOpen(page);
  await item(page, "Gain Flat").click();
  await expect(menu(page)).toHaveCount(0);
  const ask = page.locator(".dialog.is-caution");
  await expect(ask).toContainText("Reset EQ Gains?");
  await ask.getByRole("button", { name: "OK", exact: true }).click();
  await expect.poll(value).toEqual(flat);
});

test("[CH Paste] on CH 2 takes CH 1's strip and names the channel pasted to", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "channel-view")!);
  const readout = () => lcd(page).locator(".knob-cell-value").allTextContents();
  const ch1 = await readout();
  await swipeOpen(page);
  await item(page, "CH Copy").click();
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await button(page, "Next channel").click();
  await lcd(page).locator(".knob-cell").first().hover();
  await page.mouse.wheel(0, -500);
  await expect.poll(readout).not.toEqual(ch1);
  await swipeOpen(page);
  await item(page, "CH Paste").click();
  await expect(lcd(page).getByRole("status")).toHaveText("CH 2 Parameter Pasted.");
  await expect.poll(readout).toEqual(ch1);
});

test("SEND FROM's [All Nominal] sets every send into the bus to 0 dB and says it is done", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.sendfrom")!);
  const readout = () => lcd(page).locator(".knob-cell-value").allTextContents();
  const before = await readout();
  await swipeOpen(page);
  await item(page, "All Nominal").click();
  await expect(lcd(page).getByRole("status")).toHaveText('"All Nominal" Completed.');
  await expect.poll(readout).not.toEqual(before);
  for (const v of await readout()) expect(v).toMatch(/^0(\.0+)?(dB)?$/);
});

test("[CH Copy Incoming Sends] on MIX 1 turns MIX 2's [CH Paste] into one that pastes the sends too", async ({ page }) => {
  await page.goto("./");
  await bank(page, "MIX, ST STREAMING");
  await tapInto(page, button(page, "MIX 1 settings"), "channel-view");
  await swipeOpen(page);
  await menu(page).getByRole("button", { name: "CH Copy Incoming Sends", exact: true }).click();
  await expect(lcd(page).getByRole("status")).toHaveText("MIX 1 Parameters Copied.");
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  // MIX 1 is a pair: the first step goes to its R side, the second to MIX 2.
  await button(page, "Next channel").click();
  await button(page, "Next channel").click();
  await swipeOpen(page);
  const paste = menu(page).getByRole("button", { name: "CH Paste Incoming Sends", exact: true });
  await expect(paste).not.toHaveAttribute("aria-disabled");
  await paste.click();
  await expect(lcd(page).getByRole("status")).toHaveText("MIX 2 Parameters Pasted.");
});

test("[CH Default] asks to put the channel back, by its name", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "channel-view")!);
  await swipeOpen(page);
  await item(page, "CH Default").click();
  await expect(menu(page)).toHaveCount(0);
  await expect(page.locator(".dialog.is-caution")).toContainText("Return to default CH 1 Setting?");
});

test("SEND FROM's [Paste] on MIX 2 gives it the sends copied from MIX 1", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.sendfrom")!);
  const readout = () => lcd(page).locator(".knob-cell-value").allTextContents();
  await swipeOpen(page);
  await item(page, "All Nominal").click();
  const mix1 = await readout();
  await item(page, "Copy").click();
  await expect(lcd(page).getByRole("status")).toHaveText("MIX 1 Parameters Copied.");
  await lcd(page).getByRole("button", { name: "Close the submenu" }).click();
  await button(page, "Next channel").click();
  await button(page, "Next channel").click();
  await expect.poll(readout).not.toEqual(mix1);
  await swipeOpen(page);
  await item(page, "Paste").click();
  await expect(lcd(page).getByRole("status")).toHaveText("MIX 2 Parameters Pasted.");
  await expect.poll(readout).toEqual(mix1);
});
