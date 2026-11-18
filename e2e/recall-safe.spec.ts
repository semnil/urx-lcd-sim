// RECALL SAFE by real clicks: SCENE's [Recall Safe] opens it, the side menu
// switches its tabs, a selection of Source opens HA on the pair, and a lit Others
// button stays lit.

import { expect, test } from "@playwright/test";
import { button, lcd, tapInto } from "./tour";

test("SCENE's [Recall Safe] opens RECALL SAFE, Source opens the pair's HA, and Others keeps a button lit", async ({ page }) => {
  await page.goto("./");
  await tapInto(page, button(page, "Initial Data"), "scene");
  await tapInto(page, button(page, "Recall Safe"), "scene.safe");
  const cell = (label: string) => lcd(page).getByRole("button", { name: label, exact: true });

  await expect(cell("C H 1 HA")).toHaveCount(0);
  await cell("C H 2 Source").click();
  await expect(cell("C H 1 Source")).toHaveAttribute("aria-pressed", "true");
  await expect(cell("C H 1 HA")).toHaveCount(1);
  await expect(cell("C H 2 HA")).toHaveAttribute("aria-pressed", "false");

  await cell("C H 1 Safe").click();
  await expect(cell("C H 1 Safe")).toHaveAttribute("aria-pressed", "true");
  await expect(cell("Safe on every input channel")).toHaveText("...");

  await button(page, "Others", true).click();
  await cell("BUS TYPE MIX1").click();
  await expect(cell("BUS TYPE MIX1")).toHaveAttribute("aria-pressed", "true");
  await button(page, "Input", true).click();
  await expect(cell("C H 1 Safe")).toHaveAttribute("aria-pressed", "true");
});
