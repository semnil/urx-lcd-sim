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

// The unit lines a column's cells up under its heading button, on every row and
// after the columns are scrolled sideways.
test("RECALL SAFE stands each column's cells under its heading button", async ({ page }) => {
  await page.goto("./");
  await tapInto(page, button(page, "Initial Data"), "scene");
  await tapInto(page, button(page, "Recall Safe"), "scene.safe");
  const columns = () =>
    lcd(page).evaluate((glass) => {
      const xs = (ns: Iterable<Element>) => [...ns].map((n) => [n.getBoundingClientRect().x, n.getBoundingClientRect().width]);
      return {
        heads: xs(glass.querySelectorAll(".safe-head .safe-btn, .safe-head .safe-switch, .safe-column-head > .safe-btn")),
        rows: [...glass.querySelectorAll(".safe-fixed-rows > .safe-fixed")].map((fixed, i) =>
          xs([...fixed.children, ...glass.querySelectorAll(".safe-cells")[i]!.children]),
        ),
      };
    });
  for (const tab of ["Input", "Output"]) {
    await button(page, tab, true).click();
    let unscrolled: number[][] = [];
    for (const scrolled of [false, true]) {
      if (scrolled) {
        await lcd(page).locator(".safe-rows .safe-window").hover();
        await page.mouse.wheel(200, 0);
      }
      const { heads, rows } = await columns();
      if (scrolled) expect(heads, `${tab}: the wheel moved the columns`).not.toEqual(unscrolled);
      else unscrolled = heads;
      expect(rows.length, `${tab}: rows`).toBeGreaterThan(1);
      for (const [i, row] of rows.entries()) expect(row, `${tab}${scrolled ? " scrolled" : ""}: row ${i + 1}`).toEqual(heads);
    }
  }
});
