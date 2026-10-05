// Every screen, reached by touches alone, and every control on it a touch lands on.

import { expect, test } from "@playwright/test";
import { unreached } from "./reach";
import { TOUR, reach } from "./tour";

for (const stop of TOUR) {
  test(`${stop.id}: each control showing takes a touch`, async ({ page }) => {
    await reach(page, stop);
    expect(await unreached(page)).toEqual([]);
  });
}
