// The glass mounted in another page (src/embed.ts), with page rules that would
// reach any element they matched: an element selector, an id selector over the
// glass's host, and the glass's own class names. Neither side's rules reach the
// other, and the glass's dialogs, drags, scale and fonts work as they do alone.

import { expect, test, type Page } from "@playwright/test";

/** Rules a page around the glass could carry. */
const PAGE_RULES = `
  * { box-sizing: border-box; letter-spacing: 3px; }
  button { font: 30px serif; color: rgb(255, 0, 0); padding: 9px; border: 4px solid black; }
  #inspector button { width: 462px; }
  .btn { background: rgb(0, 128, 0); }
  .lcd { outline: 5px solid blue; }
  [hidden] { display: block !important; }
`;

/** A page holding one control of its own and the glass under #inspector; `rules` false leaves the page unstyled. */
function hostPage(rules: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${rules ? PAGE_RULES : ""}</style></head>
<body><div id="inspector"><button class="btn" id="outer">Outer</button></div>
<script type="module">
  import { mountSim } from "/src/embed.ts";
  import { emulatedActions, computerClock } from "/src/device/unit.ts";
  import { SimTransport } from "/src/device/sim-transport.ts";
  import { factoryState } from "/src/model/defaults.ts";
  import { unitById } from "/src/model/units.ts";
  window.mountGlass = async () => {
    window.sim = await mountSim(document.getElementById("inspector"), {
      model: "URX44V",
      unit: { params: new SimTransport(factoryState(unitById("URX44V"))), levels: { kind: "simulated" }, clock: computerClock, actions: emulatedActions },
    });
  };
  window.hostReady = true;
</script></body></html>`;
}

async function open(page: Page, rules: boolean, mount = true): Promise<void> {
  await page.route("**/embed-host.html", (route) => route.fulfill({ contentType: "text/html", body: hostPage(rules) }));
  await page.goto("/embed-host.html");
  await page.waitForFunction(() => (window as { hostReady?: boolean }).hostReady === true);
  if (mount) await mountGlass(page);
}

async function mountGlass(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { mountGlass: () => Promise<void> }).mountGlass());
  await page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])").waitFor();
}

/** Each button on the glass: its box from the glass's corner, and how it is drawn. */
function glassButtons(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const shadow = document.querySelector(".urx-lcd-sim")!.shadowRoot!;
    const glass = shadow.querySelector(".embed-glass")!.getBoundingClientRect();
    return [...shadow.querySelectorAll("button")].map((b) => {
      const r = b.getBoundingClientRect();
      const s = getComputedStyle(b);
      return [r.x - glass.x, r.y - glass.y, r.width, r.height, s.color, s.fontFamily, s.fontSize, s.letterSpacing, s.backgroundColor, s.borderTopWidth, s.outlineStyle, s.display].join(" ");
    });
  });
}

/** How the page's own control is drawn. */
function outerButton(page: Page): Promise<string> {
  return page.evaluate(() => {
    const b = document.getElementById("outer")!;
    const r = b.getBoundingClientRect();
    const s = getComputedStyle(b);
    return [r.width, r.height, s.color, s.fontFamily, s.fontSize, s.backgroundColor, s.borderTopWidth, s.padding, s.letterSpacing].join(" ");
  });
}

/** The element holding the focus on the glass, by its name. */
const glassFocus = (page: Page): Promise<string | null> =>
  page.evaluate(() => {
    const active = document.querySelector(".urx-lcd-sim")!.shadowRoot!.activeElement;
    return active ? (active.getAttribute("aria-label") ?? active.textContent) : null;
  });

test("draws the glass the same under a page whose rules would match its elements", async ({ page }) => {
  await open(page, false);
  const plain = await glassButtons(page);
  await open(page, true);
  // The control: the page's rules are in force on the page's own button.
  expect(await outerButton(page)).toMatch(/^462 .* rgb\(255, 0, 0\) serif 30px rgb\(0, 128, 0\) 4px 9px 3px$/);
  expect(plain.length).toBeGreaterThan(10);
  expect(await glassButtons(page)).toEqual(plain);
});

test("leaves the page's own control as it was drawn before the glass was mounted", async ({ page }) => {
  await open(page, true, false);
  const before = await outerButton(page);
  await mountGlass(page);
  expect(await outerButton(page)).toBe(before);
  expect(await page.evaluate(() => document.querySelectorAll("style").length), "the page's own rules and the glass's fonts").toBe(2);
});

test("keeps a dialog's Tab, Escape and focus on the glass, and gives the focus back to the control that opened it", async ({ page }) => {
  await open(page, true);
  const glass = page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])");
  await glass.getByRole("button", { name: "microSD", exact: true }).click();
  await page.locator('.urx-lcd-sim .lcd[data-screen="microsd"]:not([inert])').waitFor();
  const eject = page.locator(".urx-lcd-sim .sd-eject");
  await eject.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".urx-lcd-sim .dialog")).toHaveCount(1);
  const seen = new Set<string | null>();
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("Tab");
    seen.add(await glassFocus(page));
  }
  expect([...seen].sort(), "Tab goes round the dialog's two buttons").toEqual(["Cancel", "OK"]);
  await page.keyboard.press("Escape");
  await expect(page.locator(".urx-lcd-sim .dialog")).toHaveCount(0);
  expect(await glassFocus(page), "back on the control that opened it").toBe("Eject the card");
  expect(await page.evaluate(() => document.activeElement?.className)).toBe("urx-lcd-sim");
  // A key the page's own control holds stays the page's: Escape there leaves the glass on its screen.
  await page.locator("#outer").focus();
  await page.keyboard.press("Escape");
  await expect(page.locator('.urx-lcd-sim .lcd[data-screen="microsd"]:not([inert])')).toHaveCount(1);
});

test("turns a value by a drag, marking the glass rather than the page while it turns", async ({ page }) => {
  await open(page, true);
  const level = page.locator(".urx-lcd-sim [role='slider'][aria-label='C H 1 LEVEL']");
  const read = (): Promise<number> => page.evaluate(() => (window as unknown as { sim: { store: { num(p: string, f: number): number } } }).sim.store.num("ch.ch1.level", Number.NaN));
  const before = await read();
  const box = (await level.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 6 });
  const marks = await page.evaluate(() => [
    document.querySelector(".urx-lcd-sim")!.shadowRoot!.querySelector(".embed-glass")!.classList.contains("is-turning"),
    document.documentElement.classList.contains("is-turning"),
  ]);
  await page.mouse.up();
  expect(marks, "the glass marked, the page not").toEqual([true, false]);
  expect(await read()).toBeGreaterThan(before);
});

test("draws at the scale it is given", async ({ page }) => {
  await open(page, true);
  const width = (): Promise<number> =>
    page.evaluate(() => document.querySelector(".urx-lcd-sim")!.shadowRoot!.querySelector(".lcd")!.getBoundingClientRect().width);
  const full = await width();
  await page.evaluate(() => (window as unknown as { sim: { setZoom(p: number): void } }).sim.setZoom(50));
  expect(await width()).toBeCloseTo(full / 2, 0);
});

test("draws the glass's text in the simulator's own font, loaded on the page", async ({ page }) => {
  await open(page, true);
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => ({
    loaded: [...document.fonts].filter((f) => f.family.replace(/"/g, "") === "IBM Plex Sans" && f.status === "loaded").length,
    family: getComputedStyle(document.querySelector(".urx-lcd-sim")!.shadowRoot!.querySelector(".lcd button")!).fontFamily,
  }));
  expect(font.loaded).toBeGreaterThan(0);
  expect(font.family).toMatch(/^"?IBM Plex Sans"?/);
});

test("rings the control the keys are on, and sinks it while Enter holds it down", async ({ page }) => {
  await open(page, true);
  await page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])").getByRole("button", { name: "microSD", exact: true }).click();
  await page.locator('.urx-lcd-sim .lcd[data-screen="microsd"]:not([inert])').waitFor();
  const recorder = page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])").getByRole("button", { name: "Recorder", exact: true });
  await page.locator("#outer").focus();
  // Tab from the page's own control moves onto the glass, and the ring follows it there.
  for (let i = 0; i < 40 && (await glassFocus(page)) !== "Recorder"; i++) await page.keyboard.press("Tab");
  expect(await glassFocus(page)).toBe("Recorder");
  await expect(page.locator(".urx-lcd-sim .focus-ring")).toBeVisible();
  await page.keyboard.down("Enter");
  await expect(recorder).toHaveClass(/is-pressed/);
  await page.keyboard.up("Enter");
  await expect(page.locator('.urx-lcd-sim .lcd[data-screen="microsd.recorder"]:not([inert])')).toHaveCount(1);
});

test("steps HOME's bank by a sideways swipe across the main area", async ({ page }) => {
  await open(page, true);
  const bank = (): Promise<number> => page.evaluate(() => (window as unknown as { sim: { store: { num(p: string, f: number): number } } }).sim.store.num("ui.bank", 0));
  // A point of the main area that is no control, where a swipe starts.
  const at = await page.evaluate(() => {
    const shadow = document.querySelector(".urx-lcd-sim")!.shadowRoot!;
    const main = shadow.querySelector(".main")!.getBoundingClientRect();
    for (let y = main.top + 4; y < main.bottom; y += 4) {
      for (let x = main.left + main.width / 2 - 60; x < main.left + main.width / 2 + 60; x += 4) {
        const over = shadow.elementFromPoint(x, y);
        if (over && !over.closest("button, [role='button'], [role='slider'], [role='spinbutton']") && shadow.querySelector(".main")!.contains(over)) return { x, y };
      }
    }
    return null;
  });
  expect(at, "a point of the main area off every control").not.toBeNull();
  expect(await bank()).toBe(0);
  await page.mouse.move(at!.x, at!.y);
  await page.mouse.down();
  await page.mouse.move(at!.x - 50, at!.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(bank).toBe(1);
});

test("keeps the focus on its control when the screen is drawn again", async ({ page }) => {
  await open(page, true);
  await page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])").getByRole("button", { name: "microSD", exact: true }).click();
  await page.locator('.urx-lcd-sim .lcd[data-screen="microsd"]:not([inert])').waitFor();
  await page.locator("#outer").focus();
  for (let i = 0; i < 40 && (await glassFocus(page)) !== "Recorder"; i++) await page.keyboard.press("Tab");
  expect(await glassFocus(page)).toBe("Recorder");
  // USB Storage Mode taken on and off again draws the screen twice, each time with new controls.
  const replaced = await page.evaluate(async () => {
    const shadow = document.querySelector(".urx-lcd-sim")!.shadowRoot!;
    const before = shadow.activeElement;
    const store = (window as unknown as { sim: { store: { set(p: string, v: unknown): Promise<void> } } }).sim.store;
    await store.set("sd.usbStorage", true);
    await new Promise((r) => setTimeout(r, 50));
    await store.set("sd.usbStorage", false);
    await new Promise((r) => setTimeout(r, 50));
    return before !== null && !before.isConnected;
  });
  expect(replaced, "the control the focus was on has been drawn anew").toBe(true);
  expect(await glassFocus(page)).toBe("Recorder");
});
