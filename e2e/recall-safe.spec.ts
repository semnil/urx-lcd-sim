// RECALL SAFE by real clicks: SCENE's [Recall Safe] opens it, the side menu
// switches its tabs, a selection of Source opens HA on the pair, and a lit Others
// button stays lit.

import { expect, test } from "@playwright/test";
import { TOUR, button, lcd, reach, tapInto } from "./tour";

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

// A row's name is a button: a tap frames that row in white, one row at a time, and
// no part of the screen moves for it.
test("RECALL SAFE frames the row whose name is tapped, and moves nothing for it", async ({ page }) => {
  await page.goto("./");
  await tapInto(page, button(page, "Initial Data"), "scene");
  await tapInto(page, button(page, "Recall Safe"), "scene.safe");
  const rects = () =>
    lcd(page).evaluate((glass) =>
      [...glass.querySelectorAll(".main *")].map((n) => {
        const r = n.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    );
  const framed = () => lcd(page).locator(".safe-row-name.is-selected");
  await expect(framed()).toHaveCount(0);
  const before = await rects();
  await lcd(page).getByRole("button", { name: "C H 2", exact: true }).click();
  await expect(framed()).toHaveAttribute("aria-label", "C H 2");
  await lcd(page).getByRole("button", { name: "C H 3", exact: true }).click();
  await expect(framed()).toHaveAttribute("aria-label", "C H 3");
  expect(await rects()).toEqual(before);
});

// A linked pair's names carry HOME's stereo-link mark, smaller, across the middle of
// the gap between the two boxes.
test("RECALL SAFE marks a stereo-linked pair between its names", async ({ page }) => {
  await reach(page, TOUR.find((s) => s.id === "ch.setting")!);
  await button(page, "Signal Type").click();
  await lcd(page).getByRole("option", { name: "STEREO", exact: true }).click();
  await tapInto(page, button(page, "HOME", true), "home");
  await tapInto(page, button(page, "Initial Data"), "scene");
  await tapInto(page, button(page, "Recall Safe"), "scene.safe");
  const marks = lcd(page).locator(".safe-link");
  await expect(marks).toHaveCount(1);
  await expect(marks).toHaveAttribute("aria-label", "C H 1 and C H 2 stereo link");
  const [mark, upper, lower] = await Promise.all(
    [marks, lcd(page).getByRole("button", { name: "C H 1", exact: true }), lcd(page).getByRole("button", { name: "C H 2", exact: true })].map(async (l) => (await l.boundingBox())!),
  );
  expect(mark.x + mark.width / 2, "across the middle of the boxes").toBeCloseTo(upper!.x + upper!.width / 2, 1);
  expect(mark.y + mark.height / 2, "in the middle of the gap").toBeCloseTo((upper!.y + upper!.height + lower!.y) / 2, 1);
  expect(lower!.y - upper!.y, "the names keep their pitch").toBeCloseTo(44 * (upper!.width / 58), 1);
});
