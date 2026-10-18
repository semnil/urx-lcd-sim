// The glass mounted in another page (src/embed.ts), with page rules that would
// reach any element they matched: an element selector, an id selector over the
// glass's host, and the glass's own class names. Neither side's rules reach the
// other, and the glass's dialogs, drags, scale and fonts work as they do alone.

import { expect, test, type Browser, type Page } from "@playwright/test";
import { TOUR, reach } from "./tour";

/** Rules a page around the glass could carry. */
const PAGE_RULES = `
  * { box-sizing: border-box; letter-spacing: 3px; }
  button { font: 30px serif; color: rgb(255, 0, 0); padding: 9px; border: 4px solid black; }
  #inspector button { width: 462px; }
  .btn { background: rgb(0, 128, 0); }
  .lcd { outline: 5px solid blue; }
  [hidden] { display: block !important; }
  body { font: 40px serif; color: rgb(0, 0, 255); line-height: 3; }
  div { padding: 7px; margin: 3px; }
  span { color: rgb(255, 0, 255); font-weight: 900; }
  svg { width: 50px; height: 50px; fill: red; }
  input, select, textarea { font-size: 25px; }
  [role="button"], [role="slider"], [role="option"], [role="textbox"] { margin: 5px; }
  :focus, :focus-visible { outline: 6px solid rgb(255, 0, 255); }
`;

/** The moment a still glass's clock stands at. */
const STILL_AT = Date.UTC(2026, 0, 15, 12, 0, 0);

/**
 * A page holding one control of its own and the glass under #inspector; `rules` false leaves the page unstyled.
 * A still glass reads one level on every meter and a clock that stands at STILL_AT, so two of them draw alike.
 */
function hostPage(rules: boolean, still = false): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${rules ? PAGE_RULES : ""}</style></head>
<body><div id="inspector"><button class="btn" id="outer">Outer</button><div id="slot" style="position: fixed; left: 40px; top: 200px; margin: 0; padding: 0;"></div></div>
<script type="module">
  import { mountSim } from "/src/embed.ts";
  import { emulatedActions, computerClock } from "/src/device/unit.ts";
  import { SimTransport } from "/src/device/sim-transport.ts";
  import { factoryState } from "/src/model/defaults.ts";
  import { unitById } from "/src/model/units.ts";
  window.mountGlass = async (locks) => {
    window.sim = await mountSim(document.getElementById("slot"), {
      model: "URX44V",
      ...(locks ? { locks } : {}),
      unit: {
        params: new SimTransport(factoryState(unitById("URX44V"))),
        levels: ${still ? `{ kind: "device", read: (_id, channels) => Array.from({ length: channels }, () => -18), clipSafe: () => false }` : `{ kind: "simulated" }`},
        clock: ${still ? `{ now: () => ${STILL_AT} }` : "computerClock"},
        actions: emulatedActions,
      },
    });
  };
  window.hostReady = true;
</script></body></html>`;
}

async function open(page: Page, rules: boolean, mount = true, still = false): Promise<void> {
  await page.route("**/embed-host.html", (route) => route.fulfill({ contentType: "text/html", body: hostPage(rules, still) }));
  await page.goto("/embed-host.html");
  await page.waitForFunction(() => (window as { hostReady?: boolean }).hostReady === true);
  if (mount) await mountGlass(page);
}

async function mountGlass(page: Page, locks?: unknown[]): Promise<void> {
  await page.evaluate((held) => (window as unknown as { mountGlass: (locks?: unknown[]) => Promise<void> }).mountGlass(held), locks);
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

test("holds shut what the page holds, a real touch and drag on it doing nothing, and lets it go", async ({ page }) => {
  await open(page, true, false);
  const reason = "Held by the page";
  await mountGlass(page, [
    { target: { kind: "screen", id: "setup.language" }, reason },
    { target: { kind: "path", path: "ch.ch1.level" }, reason },
  ]);
  const read = (): Promise<number> => page.evaluate(() => (window as unknown as { sim: { store: { num(p: string, f: number): number } } }).sim.store.num("ch.ch1.level", Number.NaN));

  // The fader takes no drag.
  const level = page.locator(".urx-lcd-sim [role='slider'][aria-label='C H 1 LEVEL']");
  await expect(level).toHaveAttribute("aria-disabled", "true");
  await expect(level).toHaveAttribute("title", reason);
  const before = await read();
  const box = (await level.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 60, { steps: 6 });
  await page.mouse.up();
  expect(await read(), "the fader stays where it was").toBe(before);

  const glass = page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])");
  await glass.getByRole("button", { name: "SETUP", exact: true }).click();
  await page.locator('.urx-lcd-sim .lcd[data-screen="setup"]:not([inert])').waitFor();
  const language = glass.getByRole("button", { name: "Language", exact: true });
  await expect(language).toHaveAttribute("title", reason);
  await expect(language.locator(".lock-mark svg")).toBeVisible();
  // A touch on it lands on the entry itself, not on whatever stands under it.
  const at = (await language.boundingBox())!;
  const hit = await page.evaluate(
    ([x, y]) => {
      const shadow = document.querySelector(".urx-lcd-sim")!.shadowRoot!;
      return shadow.elementFromPoint(x!, y!)?.closest(".menu-btn")?.textContent ?? null;
    },
    [at.x + at.width / 2, at.y + at.height / 2],
  );
  expect(hit).toBe("Language");
  // Playwright declines to click a control marked out of reach, so the press goes to where it stands.
  await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2);
  await language.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('.urx-lcd-sim .lcd[data-screen="setup"]:not([inert])')).toHaveCount(1);

  await page.evaluate(() => (window as unknown as { sim: { setLocks(l: unknown[]): void } }).sim.setLocks([]));
  await expect(language).not.toHaveAttribute("title", reason);
  await language.click();
  await page.locator('.urx-lcd-sim .lcd[data-screen="setup.language"]:not([inert])').waitFor();
});

// A value box held shut carries the face of a control out of reach, its band included, and the
// padlock inside its own corner where the copy mark stood, as every other held control does.
test("draws a held Date / Time value box with its band darkened and the padlock inside it", async ({ page }) => {
  await open(page, true, false);
  await mountGlass(page, [{ target: { kind: "screen", id: "setup.datetime.set" }, reason: "Held by the page" }]);
  const glass = page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])");
  await glass.getByRole("button", { name: "SETUP", exact: true }).click();
  const setup = page.locator('.urx-lcd-sim .lcd[data-screen="setup"]:not([inert])');
  await setup.getByRole("button", { name: "Date/Time", exact: true }).click();
  const box = page.locator('.urx-lcd-sim .lcd[data-screen="setup.datetime"]:not([inert]) .dt-value').first();
  await expect(box).toHaveAttribute("aria-disabled", "true");
  const drawn = await box.evaluate((v) => {
    const r = (e: Element) => e.getBoundingClientRect();
    const lock = r(v.querySelector(".lock-mark")!);
    const own = r(v);
    const bevel = getComputedStyle(v).boxShadow;
    const plain = document.createElement("button");
    plain.className = "btn dt-value";
    v.parentElement!.append(plain);
    const plainBevel = getComputedStyle(plain).boxShadow;
    plain.remove();
    return {
      inside: lock.top >= own.top && lock.right <= own.right,
      copy: getComputedStyle(v.querySelector(".dt-copy")!).visibility,
      bandMoved: bevel !== plainBevel,
    };
  });
  expect(drawn).toEqual({ inside: true, copy: "hidden", bandMoved: true });
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

/** The lines of two style readings that differ, the first few, as "<element> <property>=<plain> | <ruled>". */
function styleDifferences(plain: string, ruled: string): string[] {
  const a = plain.split("\n");
  const b = ruled.split("\n");
  const out: string[] = [];
  for (let i = 0; i < Math.max(a.length, b.length) && out.length < 20; i++)
    if (a[i] !== b[i]) out.push(`${a[i] ?? "(none)"} | ${b[i]?.split("=").slice(1).join("=") ?? "(none)"}`);
  return out;
}

/** Every animation on the page and in the glass's tree held at its start, and every transition run to its end. */
async function holdStill(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // The fonts the glass draws with, loaded first: text set in a fallback face lays out at other sizes.
    await document.fonts.ready;
    const tree = document.querySelector(".urx-lcd-sim")!.shadowRoot!;
    for (const a of new Set([...document.getAnimations(), ...tree.getAnimations()])) {
      if (a.effect?.getTiming().iterations === Infinity) {
        a.pause();
        a.currentTime = 0;
      } else a.finish();
    }
    const frames = (): Promise<unknown> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await frames();
    // A blink paused on the page's own thread is drawn at its paused value only once something else on the
    // glass is drawn again, so every element is drawn once in other colours and then in its own.
    const repaint = document.createElement("style");
    repaint.textContent = "*, *::before, *::after { color: rgb(1, 2, 3) !important; fill: rgb(1, 2, 3) !important; border-color: rgb(1, 2, 3) !important; }";
    tree.appendChild(repaint);
    await frames();
    repaint.remove();
    await frames();
  });
}

/** The glass on `stop`'s screen as a still glass draws it, and the computed style of its root and of every element in it, under a page carrying `rules`. */
async function glassOn(browser: Browser, stop: (typeof TOUR)[number], rules: boolean, extra = ""): Promise<{ picture: Buffer; styles: string }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  try {
    const page = await context.newPage();
    await reach(page, stop, async (p) => {
      await open(p, rules, true, true);
      // The host is the page's own element: its rules move it and draw around it (an outline, a focus ring),
      // and the glass is compared with the host standing bare in both pages.
      await p.evaluate(() => {
        const host = document.querySelector<HTMLElement>(".urx-lcd-sim")!;
        for (const name of ["margin", "padding", "outline"]) host.style.setProperty(name, name === "outline" ? "none" : "0", "important");
      });
      if (extra) await p.addStyleTag({ content: extra });
    });
    await holdStill(page);
    const styles = await page.evaluate(() =>
      ((glass) => [glass, ...glass.querySelectorAll("*")])(document.querySelector(".urx-lcd-sim")!.shadowRoot!.querySelector(".embed-glass")!)
        .map((e, i) => {
          const c = getComputedStyle(e);
          return [...c].sort().map((k) => `${i} ${e.tagName}.${e.getAttribute("class") ?? ""} ${k}=${c.getPropertyValue(k)}`).join("\n");
        })
        .join("\n"),
    );
    const picture = await page.locator(".urx-lcd-sim .lcd[data-screen]:not([inert])").screenshot({ animations: "disabled", caret: "hide" });
    return { picture, styles };
  } finally {
    await context.close();
  }
}

/** The most a channel of a pixel may move between two pictures and the pixel still count as the same. */
const PIXEL_TOLERANCE = 4;

/**
 * How many pixels of `a` and `b` differ by more than PIXEL_TOLERANCE in some channel; every pixel when their
 * sizes differ. The two are decoded by a page of their own, so the comparison needs nothing beyond the browser.
 */
async function differingPixels(browser: Browser, a: Buffer, b: Buffer): Promise<number> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    return await page.evaluate(
      async ([first, second, tolerance]) => {
        const read = async (base64: string): Promise<ImageData> => {
          const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(bitmap, 0, 0);
          return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        };
        const [x, y] = [await read(first as string), await read(second as string)];
        if (x.width !== y.width || x.height !== y.height) return Math.max(x.width * x.height, y.width * y.height);
        let count = 0;
        for (let i = 0; i < x.data.length; i += 4) {
          for (let c = 0; c < 4; c++) {
            if (Math.abs(x.data[i + c]! - y.data[i + c]!) > (tolerance as number)) {
              count++;
              break;
            }
          }
        }
        return count;
      },
      [a.toString("base64"), b.toString("base64"), PIXEL_TOLERANCE] as const,
    );
  } finally {
    await context.close();
  }
}

/** A one-pixel PNG of the grey `level`, drawn by a page. */
async function greyPixel(browser: Browser, level: number): Promise<Buffer> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const base64 = await page.evaluate(async (v) => {
      const canvas = new OffscreenCanvas(1, 1);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = `rgb(${v}, ${v}, ${v})`;
      ctx.fillRect(0, 0, 1, 1);
      const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
      return btoa(String.fromCharCode(...bytes));
    }, level);
    return Buffer.from(base64, "base64");
  } finally {
    await context.close();
  }
}

test("counts a pixel as differing only once a channel moves past the tolerance", async ({ browser }) => {
  const base = await greyPixel(browser, 100);
  expect(await differingPixels(browser, base, await greyPixel(browser, 100 + PIXEL_TOLERANCE))).toBe(0);
  expect(await differingPixels(browser, base, await greyPixel(browser, 100 + PIXEL_TOLERANCE + 1))).toBe(1);
});

test.describe("every screen of the tour", () => {
  for (const stop of TOUR) {
    test(`draws ${stop.id} the same under a page whose rules would match its elements`, async ({ browser }) => {
      const plain = await glassOn(browser, stop, false);
      const ruled = await glassOn(browser, stop, true);
      expect(plain.picture.length, "a picture was taken").toBeGreaterThan(1000);
      expect(plain.styles.length, "styles were read").toBeGreaterThan(1000);
      expect(styleDifferences(plain.styles, ruled.styles), `every computed style inside ${stop.id} under the page's rules`).toEqual([]);
      expect(await differingPixels(browser, ruled.picture, plain.picture), `${stop.id} under the page's rules`).toBe(0);
    });
  }

  test("tells two glasses apart where a rule of the page does reach the glass", async ({ browser }) => {
    const home = TOUR.find((s) => s.id === "home")!;
    const plain = await glassOn(browser, home, false);
    const reached = await glassOn(browser, home, true, ".urx-lcd-sim { filter: invert(1); }");
    expect(await differingPixels(browser, reached.picture, plain.picture)).toBeGreaterThan(0);
  });

  test("draws the same glass twice under the same page", async ({ browser }) => {
    const stop = TOUR.find((s) => s.id === "ch.eq")!;
    const [a, b] = [await glassOn(browser, stop, false), await glassOn(browser, stop, false)];
    expect(await differingPixels(browser, a.picture, b.picture)).toBe(0);
    expect(a.styles).toBe(b.styles);
  });
});
