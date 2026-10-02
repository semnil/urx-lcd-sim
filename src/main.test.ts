import { afterEach, describe, expect, it, vi } from "vitest";
import { readSaved } from "./app/persist";

// The page around the screen: the simulator's own chrome, as the page opens it.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Where the browser keeps the unit. */
const KEY = "urx-lcd-sim.state";

/** A unit left with CH 1's level moved off where it ships. */
const SAVED = JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9 } });

/** What the page does when it is left, for the page a test opened. */
let unload: ((ev: Event) => void) | null = null;

/** The page a test opened, let go as the browser lets a page go. */
function letGo(): void {
  if (!unload) return;
  unload(new PageTransitionEvent("pagehide", { persisted: false }));
  window.removeEventListener("pagehide", unload);
  unload = null;
}

afterEach(() => {
  letGo();
  document.getElementById("app")?.remove();
  window.localStorage.clear();
});

/** The page as it opens with `saved` in the browser's storage, once the unit is up. */
async function open(saved: string): Promise<HTMLElement> {
  window.localStorage.setItem(KEY, saved);
  const app = document.createElement("div");
  app.id = "app";
  document.body.appendChild(app);
  const listen = vi.spyOn(window, "addEventListener");
  vi.resetModules();
  await import("./main");
  const left = listen.mock.calls.find(([type]) => type === "pagehide")?.[1];
  unload = typeof left === "function" ? (left as (ev: Event) => void) : null;
  listen.mockRestore();
  for (let i = 0; i < 100 && !app.querySelector(".chrome-reset button"); i++) await flush();
  return app;
}

/** A key pressed and let go where the focus stands. */
async function press(key: string): Promise<void> {
  const node = document.activeElement ?? document.body;
  node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  await flush();
  node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true }));
  for (let i = 0; i < 10; i++) await flush();
}

const resetButton = (app: HTMLElement, text: string): HTMLElement | undefined =>
  [...app.querySelectorAll<HTMLElement>(".chrome-reset button")].find((b) => b.textContent === text);

/** Waits for the unit `id` to come up on the glass. */
async function startedAs(app: HTMLElement, id: string): Promise<void> {
  for (let i = 0; i < 100 && app.querySelector(".lcd")?.getAttribute("aria-label") !== `${id} LCD`; i++) await flush();
}

describe("[Unit model]", () => {
  it("opens the page with the focus on none of the chrome", async () => {
    await open(SAVED);
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps the focus through the change of model it makes, so the next key goes on choosing", async () => {
    const app = await open(SAVED);
    const before = app.querySelector<HTMLSelectElement>('select[aria-label="Unit model"]');
    before?.focus();
    if (before) before.value = "URX22";
    before?.dispatchEvent(new Event("change", { bubbles: true }));
    await startedAs(app, "URX22");
    const after = app.querySelector<HTMLSelectElement>('select[aria-label="Unit model"]');
    expect([after === before, after?.value, document.activeElement === after]).toEqual([false, "URX22", true]);
  });
});

describe("[Reset the unit]", () => {
  it("gives the focus back to [Reset the unit] once [Cancel] takes the question back", async () => {
    const app = await open(SAVED);
    resetButton(app, "Reset the unit")?.focus();
    await press("Enter");
    resetButton(app, "Cancel")?.focus();
    await press("Enter");
    expect(app.querySelector(".chrome-reset-ask"), "the question is gone").toBeNull();
    expect(document.activeElement).toBe(resetButton(app, "Reset the unit"));
  });

  it("puts the focus on [Reset the unit] of the unit started again from [Reset]", async () => {
    const app = await open(SAVED);
    const lcd = app.querySelector(".lcd");
    resetButton(app, "Reset the unit")?.focus();
    await press("Enter");
    resetButton(app, "Reset")?.focus();
    await press("Enter");
    for (let i = 0; i < 100 && app.querySelector(".lcd") === lcd; i++) await flush();
    expect(app.querySelector(".lcd"), "the unit started again").not.toBe(lcd);
    expect(document.activeElement).toBe(resetButton(app, "Reset the unit"));
  });

  it("asks with the focus on [Cancel], one Shift+Tab short of [Reset]", async () => {
    const app = await open(SAVED);
    resetButton(app, "Reset the unit")?.focus();
    await press("Enter");
    expect(app.querySelector(".chrome-reset-ask"), "it asks").not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Cancel");
    const buttons = [...app.querySelectorAll<HTMLElement>(".chrome-reset button")].map((b) => b.textContent);
    expect(buttons.indexOf("Reset"), "[Reset] stands just before [Cancel]").toBe(buttons.indexOf("Cancel") - 1);
  });

  it("keeps everything the unit holds through Enter pressed twice", async () => {
    const app = await open(SAVED);
    resetButton(app, "Reset the unit")?.focus();
    await press("Enter");
    await press("Enter");
    expect(window.localStorage.getItem(KEY), "the unit is still stored").toBe(SAVED);
    expect(app.querySelector(".chrome-reset-ask"), "the question is gone").toBeNull();
  });

  it("takes the question back on Escape as [Cancel] does, the focus on [Reset the unit] and the glass where it was", async () => {
    const seen: (string | boolean | null | undefined)[][] = [];
    for (const on of ["Cancel", "Reset"]) {
      const app = await open(SAVED);
      app.querySelector<HTMLElement>('.lcd .icon-btn[aria-label="SETUP"]')?.click();
      await flush();
      resetButton(app, "Reset the unit")?.focus();
      await press("Enter");
      resetButton(app, on)?.focus();
      await press("Escape");
      seen.push([
        on,
        app.querySelector(".chrome-reset-ask") === null,
        document.activeElement === resetButton(app, "Reset the unit"),
        app.querySelector<HTMLElement>(".lcd .toolbar")?.dataset["screen"],
        window.localStorage.getItem(KEY) === SAVED,
      ]);
      letGo();
      app.remove();
    }
    expect(seen).toEqual([
      ["Cancel", true, true, "setup", true],
      ["Reset", true, true, "setup", true],
    ]);
  });

  it("leaves Escape alone on [Reset the unit] while it asks nothing", async () => {
    const app = await open(SAVED);
    const ask = resetButton(app, "Reset the unit");
    ask?.focus();
    const down = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    ask?.dispatchEvent(down);
    await flush();
    expect([down.defaultPrevented, resetButton(app, "Reset the unit") === ask]).toEqual([false, true]);
  });

  it("drops everything the unit holds once [Reset] itself is pressed", async () => {
    const app = await open(SAVED);
    resetButton(app, "Reset the unit")?.focus();
    await press("Enter");
    resetButton(app, "Reset")?.focus();
    await press("Enter");
    expect(window.localStorage.getItem(KEY)).toBeNull();
    expect(app.querySelector(".chrome-reset-ask"), "the unit starts again").toBeNull();
  });
});

describe("the page's landmarks", () => {
  it("holds the glass in the page's one main landmark, between the header and the footer", async () => {
    const app = await open(SAVED);
    const glass = app.querySelector('.lcd[role="application"]');
    expect([...app.children].map((n) => n.tagName.toLowerCase()), "the header, the main landmark and the footer").toEqual(["header", "main", "footer"]);
    expect(app.querySelectorAll("main, [role='main']").length, "one main landmark").toBe(1);
    expect(glass?.closest("main, [role='main']")?.parentElement, "and the glass inside it").toBe(app);
  });
});

// The page as a visitor opens it: main.ts run against an #app, its chrome and
// the screen it mounts. A reload is the page torn down and main.ts run afresh.

const STATE_KEY = "urx-lcd-sim.state";

/** The browser's own timer, which keeps running while a test holds the page's timers still. */
const realSetTimeout = globalThis.setTimeout;
const pause = (ms: number): Promise<void> => new Promise((resolve) => realSetTimeout(resolve, ms));

/** Wait for `ready` to hold, and fail with `what` when it does not. */
async function until(what: string, ready: () => boolean, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await pause(10);
  }
}

const modelSelect = (): HTMLSelectElement | null => document.querySelector<HTMLSelectElement>('select[aria-label="Unit model"]');
const lcdModel = (): string | null => document.querySelector(".lcd[role='application']")?.getAttribute("aria-label") ?? null;
const firstLevel = (): HTMLElement | null => document.querySelector<HTMLElement>(".strip-level[role='slider']");

/** What the browser fires on the page as it is left; `kept` where it keeps the page to bring back. */
function leave(kept: boolean): void {
  window.dispatchEvent(new Event("beforeunload"));
  window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: kept }));
}

/** Open the page, or reload it: the page before is let go, then main.ts runs again. */
async function openPage(): Promise<void> {
  leave(false);
  document.body.replaceChildren();
  const app = document.createElement("div");
  app.id = "app";
  document.body.append(app);
  vi.resetModules();
  await import("./main");
  await until("the screen", () => modelSelect() !== null && firstLevel() !== null);
}

async function chooseModel(id: string): Promise<void> {
  const select = modelSelect()!;
  select.value = id;
  select.dispatchEvent(new Event("change"));
  await until(`the ${id} screen`, () => lcdModel() === `${id} LCD` && firstLevel() !== null);
}

const shownLevel = (): string | null => firstLevel()?.getAttribute("aria-valuenow") ?? null;

/** Turn CH 1's level up one step from the keyboard; the level it shows after. */
async function nudge(): Promise<string | null> {
  const before = shownLevel();
  const level = firstLevel()!;
  level.focus();
  level.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
  await until("the level to move", () => shownLevel() !== before);
  return shownLevel();
}

/** Turn CH 1's level up one step, and wait for the browser to hold it. */
async function nudgeLevel(model: string): Promise<string | null> {
  const now = await nudge();
  await until("the unit to be stored", () => readSaved(model)?.["ch.ch1.level"] === Number(now));
  return now;
}

afterEach(() => {
  vi.useRealTimers();
  leave(false);
  document.body.replaceChildren();
  window.localStorage.clear();
});

describe("the model the page opens on", () => {
  it("opens on the model it was last used as, with what that model kept", async () => {
    await openPage();
    expect(modelSelect()?.value, "a first visit opens on a URX44V").toBe("URX44V");
    await chooseModel("URX22");
    const factory = firstLevel()?.getAttribute("aria-valuenow");
    const edited = await nudgeLevel("URX22");
    expect(edited).not.toBe(factory);

    await openPage();
    expect([modelSelect()?.value, lcdModel()]).toEqual(["URX22", "URX22 LCD"]);
    expect(firstLevel()?.getAttribute("aria-valuenow"), "the URX22's level comes back").toBe(edited);
  });

  it("opens on a model picked and left untouched", async () => {
    await openPage();
    await chooseModel("URX44");
    await openPage();
    expect(modelSelect()?.value).toBe("URX44");
  });

  it("opens a unit stored before the model was kept apart on that unit's model", async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX22", values: { "ch.ch1.level": -9 } }));
    await openPage();
    expect(modelSelect()?.value).toBe("URX22");
    expect(firstLevel()?.getAttribute("aria-valuenow")).toBe("-9");
  });

  it("opens on a URX44V where the kept model is none the simulator has", async () => {
    window.localStorage.setItem("urx-lcd-sim.model", "URX99");
    await openPage();
    expect(modelSelect()?.value).toBe("URX44V");
  });
});

describe("[Reset the unit]", () => {
  const resetBox = (): HTMLElement => document.querySelector<HTMLElement>(".chrome-reset")!;
  const button = (text: string): HTMLElement =>
    [...resetBox().querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!;
  const click = (node: HTMLElement, detail: number): void => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
  };

  /** A URX44V with CH 1's level stored at -9 beside `values`, and [Reset the unit] asking. */
  async function asking(values: Record<string, string | number> = {}): Promise<void> {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9, ...values } }));
    await openPage();
    click(button("Reset the unit"), 1);
    expect(button("Reset"), "the question is up").toBeDefined();
  }

  it("leaves the unit alone when the second click of a double click lands on [Reset]", async () => {
    await asking();
    click(button("Reset"), 2);
    expect(window.localStorage.getItem(STATE_KEY), "what the unit holds is still stored").not.toBeNull();
    expect(firstLevel()?.getAttribute("aria-valuenow")).toBe("-9");
  });

  it("leaves the unit alone for the second click of a double click slower than the question's hold", async () => {
    await asking();
    await pause(600);
    click(button("Reset"), 2);
    expect(window.localStorage.getItem(STATE_KEY)).not.toBeNull();
  });

  it("leaves the unit alone when [Reset] is pressed the moment the question appears", async () => {
    await asking();
    click(button("Reset"), 1);
    expect(window.localStorage.getItem(STATE_KEY)).not.toBeNull();
  });

  it("starts again from the unit as it ships when [Reset] is pressed once the question is up", async () => {
    await asking();
    await pause(600);
    click(button("Reset"), 1);
    expect(window.localStorage.getItem(STATE_KEY), "what was stored is dropped").toBeNull();
    await until("the unit as it ships", () => firstLevel()?.getAttribute("aria-valuenow") !== "-9");
  });

  it("leaves the card in the slot as it is", async () => {
    const stamp = "01/01/2026\n12:00:00";
    const card = JSON.stringify([
      { name: "Live.urxf", kind: "data", seconds: 0, tracks: 0, stamp, dir: "/" },
      { name: "20260101_120000.wav", kind: "take", seconds: 3, tracks: 2, stamp, dir: "/" },
    ]);
    const file = JSON.stringify({ "ch.ch1.level": -3 });
    await asking({ "sd.card": card, "sd.cardName": "MYCARD", "sd.file./Live.urxf": file, "sd.trackCount": 8 });
    await pause(600);
    click(button("Reset"), 1);
    await until("the unit as it ships", () => shownLevel() === "0");
    await until("the card to be stored", () => readSaved("URX44V")?.["sd.cardName"] === "MYCARD");
    const kept = readSaved("URX44V")!;
    expect([kept["sd.card"], kept["sd.file./Live.urxf"]], "the card").toEqual([card, file]);
    expect([kept["ch.ch1.level"], kept["sd.trackCount"]], "the unit as it ships").toEqual([0, 16]);
  });

  it("keeps [Reset the unit] where it was while it asks, and the question up under a second click on it", async () => {
    await asking();
    expect(resetBox().firstElementChild?.textContent, "the button stays first in the row").toBe("Reset the unit");
    click(button("Reset the unit"), 2);
    expect(button("Reset"), "the question is still up").toBeDefined();
  });
});

describe("a change still waiting to be stored", () => {
  /** Hold the page's timers still, so a change stays waiting until something stores it. */
  const holdTimers = (): void => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  };

  it("is stored when the page is left", async () => {
    await openPage();
    holdTimers();
    const shown = await nudge();
    expect(readSaved("URX44V"), "the change is still waiting").toBeNull();
    await openPage();
    expect(shownLevel()).toBe(shown);
  });

  it("is stored when another model is picked", async () => {
    await openPage();
    holdTimers();
    const shown = await nudge();
    await chooseModel("URX22");
    await chooseModel("URX44V");
    expect(shownLevel()).toBe(shown);
  });

  it("is dropped with the rest when the unit is reset", async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9 } }));
    await openPage();
    holdTimers();
    await nudge();
    const box = document.querySelector<HTMLElement>(".chrome-reset")!;
    box.querySelector<HTMLElement>("button")!.click();
    await pause(600);
    const reset = [...box.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Reset")!;
    reset.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await until("the unit as it ships", () => shownLevel() === "0");
    expect(window.localStorage.getItem(STATE_KEY), "nothing is written back").toBeNull();
  });
});

describe("a page the browser brings back", () => {
  const screenId = (): string | undefined => document.querySelector<HTMLElement>(".toolbar")?.dataset["screen"];

  it("changes and stores its values, and steps back on Escape, after another page and [Back]", async () => {
    await openPage();
    leave(true);
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(await nudgeLevel("URX44V")).not.toBe("0");
    document.querySelector<HTMLElement>('.toolbar [aria-label="SETUP"]')!.click();
    await until("SETUP", () => screenId() === "setup");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await until("HOME again", () => screenId() === "home");
  });
});

describe("a browser that does not take the unit", () => {
  const notice = (): HTMLElement | null => document.querySelector<HTMLElement>("header.chrome .chrome-unkept");

  it("is told so in the chrome until a write is taken again", async () => {
    await openPage();
    expect(notice()?.hidden, "there is nothing to tell").toBe(true);
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("storage is full", "QuotaExceededError");
    });
    try {
      await nudge();
      await until("the notice", () => notice()?.hidden === false);
      expect(notice()?.getAttribute("role")).toBe("status");
    } finally {
      set.mockRestore();
    }
    await nudge();
    await until("the notice to go", () => notice()?.hidden === true);
  });
});

describe("a unit another tab stores", () => {
  const notice = (): HTMLElement | null => document.querySelector<HTMLElement>("header.chrome .chrome-unkept");

  it("is left as that tab stored it, with the chrome saying so, until a reload", async () => {
    await openPage();
    const theirs = JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -20 } });
    window.localStorage.setItem(STATE_KEY, theirs);
    window.dispatchEvent(new StorageEvent("storage", { key: STATE_KEY, newValue: theirs, storageArea: window.localStorage }));
    await nudge();
    await pause(600);
    expect(window.localStorage.getItem(STATE_KEY), "what the other tab stored stays").toBe(theirs);
    expect(notice()?.hidden, "the chrome says this tab stores no more").toBe(false);
    expect(notice()?.textContent).toMatch(/another tab/i);

    await openPage();
    expect(shownLevel(), "a reload opens on what the other tab stored").toBe("-20");
    expect(notice()?.hidden).toBe(true);
    expect(await nudgeLevel("URX44V"), "and stores again").not.toBe("-20");
  });

  it("is stored by this tab again once [Reset the unit] starts it again", async () => {
    await openPage();
    const theirs = JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -20 } });
    window.localStorage.setItem(STATE_KEY, theirs);
    window.dispatchEvent(new StorageEvent("storage", { key: STATE_KEY, newValue: theirs, storageArea: window.localStorage }));
    await nudge();
    await pause(600);
    expect(window.localStorage.getItem(STATE_KEY), "this tab has stopped storing").toBe(theirs);

    const box = document.querySelector<HTMLElement>(".chrome-reset")!;
    box.querySelector<HTMLElement>("button")!.click();
    await pause(600);
    const reset = [...box.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Reset")!;
    reset.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await until("the unit as it ships", () => shownLevel() === "0");
    expect(notice()?.hidden, "the chrome has nothing to tell").toBe(true);
    const now = await nudge();
    await until("this tab to store the unit", () => readSaved("URX44V")?.["ch.ch1.level"] === Number(now), 2000);
  });
});
