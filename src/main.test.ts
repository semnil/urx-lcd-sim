import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeIndexedDb, fakeIndexedDb } from "./app/fake-indexeddb";
import { type Keeper, type Kept, openKeeper, readUnit } from "./app/persist";

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

/** The browser's IndexedDB, fresh for each test, which every page a test opens reads as its own. */
let idb: FakeIndexedDb;
let keeper: Keeper;

beforeEach(() => {
  idb = fakeIndexedDb();
  keeper = openKeeper(idb.factory) as Keeper;
  Object.defineProperty(window, "indexedDB", { value: idb.factory, configurable: true, writable: true });
});

afterEach(() => {
  letGo();
  document.getElementById("app")?.remove();
  window.localStorage.clear();
});

/** The values the browser holds for `model`: the record, or what a version before IndexedDB kept. */
async function readSaved(model: string): Promise<Record<string, unknown> | null> {
  const kept = (await keeper.read()) ?? { token: null, model: null, unit: window.localStorage.getItem(KEY) };
  return readUnit(kept, model);
}

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
  for (let i = 0; i < 100 && !app.querySelector(".chrome-device > button"); i++) await flush();
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

const deviceControl = (): HTMLButtonElement => document.querySelector<HTMLButtonElement>('.chrome-device > button')!;
const chooseDevice = (operation: "current" | "reset"): void => {
  if (!document.querySelector('.chrome-device [role="menu"]')) {
    if (deviceControl().getAttribute("aria-expanded") === "true") deviceControl().click();
    deviceControl().click();
  }
  document.querySelector<HTMLButtonElement>(`.chrome-device [data-operation="${operation}"]`)!.click();
};
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

describe("[Device menu]", () => {
  it("uses the selector style before the link indicator and offers only actions without a selected item", async () => {
    const app = await open(SAVED);
    expect(deviceControl().classList.contains("chrome-select")).toBe(true);
    expect(deviceControl().parentElement?.nextElementSibling?.classList.contains("chrome-link")).toBe(true);
    expect(app.querySelector(".chrome-actions")).toBeNull();
    expect(app.querySelector<HTMLElement>(".chrome-device-popup")!.hidden).toBe(true);
    deviceControl().click();
    const menu = app.querySelector<HTMLElement>('[role="menu"]')!;
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent)).toEqual([
      "Initialize Current Memories", "Reset the unit",
    ]);
    expect(menu.querySelector('option, [aria-selected], [aria-checked], [role="menuitemradio"], [role="menuitemcheckbox"]')).toBeNull();
    expect(document.activeElement?.textContent).toBe("Initialize Current Memories");
    await press("ArrowDown");
    expect(document.activeElement?.textContent).toBe("Reset the unit");
    await press("Home");
    expect(document.activeElement?.textContent).toBe("Initialize Current Memories");
    await press("Escape");
    expect(document.activeElement).toBe(deviceControl());
    expect(await readSaved("URX44V")).toMatchObject({ "ch.ch1.level": -9 });
  });

  it("permits the same command after cancellation and closes the menu when focus or a pointer moves outside", async () => {
    const app = await open(SAVED);
    chooseDevice("current");
    expect(document.activeElement?.textContent).toBe("Cancel");
    await press("Escape");
    expect(document.activeElement).toBe(deviceControl());
    chooseDevice("current");
    expect(app.querySelector(".chrome-current .chrome-reset-ask")).not.toBeNull();
    await press("Escape");
    deviceControl().click();
    const model = app.querySelector<HTMLSelectElement>('[aria-label="Unit model"]')!;
    model.focus();
    await flush();
    expect(app.querySelector<HTMLElement>(".chrome-device-popup")!.hidden).toBe(true);
    expect(document.activeElement).toBe(model);
    deviceControl().click();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(app.querySelector<HTMLElement>(".chrome-device-popup")!.hidden).toBe(true);
    expect(await readSaved("URX44V")).toMatchObject({ "ch.ch1.level": -9 });
  });
});

describe("[Reset the unit]", () => {
  it("gives the focus back to [Device] once [Cancel] takes the question back", async () => {
    const app = await open(SAVED);
    chooseDevice("reset");
    resetButton(app, "Cancel")?.focus();
    await press("Enter");
    expect(app.querySelector(".chrome-reset-ask"), "the question is gone").toBeNull();
    expect(document.activeElement).toBe(deviceControl());
  });

  it("puts the focus on [Device] of the unit started again from [Reset]", async () => {
    const app = await open(SAVED);
    const lcd = app.querySelector(".lcd");
    chooseDevice("reset");
    resetButton(app, "Reset")?.focus();
    await press("Enter");
    for (let i = 0; i < 100 && app.querySelector(".lcd") === lcd; i++) await flush();
    expect(app.querySelector(".lcd"), "the unit started again").not.toBe(lcd);
    expect(document.activeElement).toBe(deviceControl());
  });

  it("asks with the focus on [Cancel], one Shift+Tab short of [Reset]", async () => {
    const app = await open(SAVED);
    chooseDevice("reset");
    expect(app.querySelector(".chrome-reset-ask"), "it asks").not.toBeNull();
    expect(document.activeElement?.textContent).toBe("Cancel");
    const buttons = [...app.querySelectorAll<HTMLElement>(".chrome-reset button")].map((b) => b.textContent);
    expect(buttons.indexOf("Reset"), "[Reset] stands just before [Cancel]").toBe(buttons.indexOf("Cancel") - 1);
  });

  it("keeps everything the unit holds through Enter pressed twice", async () => {
    const app = await open(SAVED);
    chooseDevice("reset");
    await press("Enter");
    expect(window.localStorage.getItem(KEY), "the unit is still stored").toBe(SAVED);
    expect(app.querySelector(".chrome-reset-ask"), "the question is gone").toBeNull();
  });

  it("takes the question back on Escape as [Cancel] does, the focus on [Device] and the glass where it was", async () => {
    const seen: (string | boolean | null | undefined)[][] = [];
    for (const on of ["Cancel", "Reset"]) {
      const app = await open(SAVED);
      app.querySelector<HTMLElement>('.lcd .icon-btn[aria-label="SETUP"]')?.click();
      await flush();
      chooseDevice("reset");
      resetButton(app, on)?.focus();
      await press("Escape");
      seen.push([
        on,
        app.querySelector(".chrome-reset-ask") === null,
        document.activeElement === deviceControl(),
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

  it("leaves Escape alone on [Device] while it asks nothing", async () => {
    await open(SAVED);
    const ask = deviceControl();
    ask.focus();
    const down = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    ask.dispatchEvent(down);
    await flush();
    expect([down.defaultPrevented, deviceControl() === ask]).toEqual([false, true]);
  });

  it("drops everything the unit holds once [Reset] itself is pressed", async () => {
    const app = await open(SAVED);
    chooseDevice("reset");
    resetButton(app, "Reset")?.focus();
    await press("Enter");
    for (let i = 0; i < 100 && (await readSaved("URX44V"))?.["ch.ch1.level"] !== 0; i++) await flush();
    expect((await readSaved("URX44V"))?.["ch.ch1.level"], "the unit as it ships is stored in place of what was").toBe(0);
    expect(app.querySelector(".chrome-reset-ask"), "the unit starts again").toBeNull();
  });
});

describe("[Initialize Current Memories]", () => {
  const currentBox = (): HTMLElement => document.querySelector<HTMLElement>(".chrome-current")!;
  const button = (text: string): HTMLElement => {
    return [...currentBox().querySelectorAll<HTMLElement>("button")].find((node) => node.textContent === text)!;
  };
  const click = (node: HTMLElement): void => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  };

  it("asks with [Cancel] focused and leaves the unit where it was when canceled", async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9 } }));
    await openPage();
    chooseDevice("current");
    expect(currentBox().querySelector(".chrome-reset-ask")?.textContent).toBe(
      "Initialize current memories? Scene memories and the microSD card will stay.",
    );
    expect(document.activeElement).toBe(button("Cancel"));
    click(button("Cancel"));
    expect(currentBox().querySelector(".chrome-reset-ask")).toBeNull();
    expect(document.activeElement).toBe(deviceControl());
    expect(firstLevel()?.getAttribute("aria-valuenow")).toBe("-9");
  });

  it("opens one initialization question at a time and returns focus on Escape", async () => {
    await openPage();
    chooseDevice("current");
    chooseDevice("reset");
    expect(currentBox().querySelector(".chrome-reset-ask")).toBeNull();
    expect(document.querySelectorAll(".chrome-reset-ask").length).toBe(1);
    chooseDevice("current");
    expect(document.querySelector(".chrome-reset .chrome-reset-ask")).toBeNull();
    await press("Escape");
    expect(document.querySelector(".chrome-reset-ask")).toBeNull();
    expect(document.activeElement).toBe(deviceControl());
  });

  it("rejects the second click and the click before 500 ms, and initializes at 500 ms", async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9 } }));
    await openPage();
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const { SimTransport } = await import("./device/sim-transport");
    const close = vi.spyOn(SimTransport.prototype, "close");
    try {
      chooseDevice("current");
      now.mockReturnValue(600);
      button("Initialize").dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      now.mockReturnValue(499);
      click(button("Initialize"));
      expect(close, "neither rejected click tears down the unit").not.toHaveBeenCalled();
      expect(shownLevel()).toBe("-9");
      expect(currentBox().querySelector(".chrome-reset-ask")).not.toBeNull();
      now.mockReturnValue(500);
      click(button("Initialize"));
      expect(close, "the accepted click starts the unit again").toHaveBeenCalledTimes(1);
      await until("current values reset at the hold boundary", () => shownLevel() === "0");
    } finally {
      now.mockRestore();
      close.mockRestore();
    }
  });

  it("starts the unit once when the confirmation is activated again while its storage read is pending", async () => {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9 } }));
    await openPage();
    const { SimTransport } = await import("./device/sim-transport");
    const snapshot = vi.spyOn(SimTransport.prototype, "snapshot");
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    try {
      chooseDevice("current");
      now.mockReturnValue(500);
      idb.hold();
      const initialize = button("Initialize");
      click(initialize);
      click(initialize);
      idb.release();
      await until("the initialized unit", () => shownLevel() === "0");
      await idb.idle();
      expect(snapshot, "one new simulated unit was attached").toHaveBeenCalledTimes(1);
    } finally {
      idb.release();
      now.mockRestore();
      snapshot.mockRestore();
    }
  });

  it.each(["URX44V", "URX44", "URX22"])("resets %s's current values while keeping scene memories and its card in storage", async (model) => {
    const sceneState = JSON.stringify({ "ch.ch1.level": -9 });
    const card = JSON.stringify([
      { name: "Live.urxf", kind: "data", seconds: 0, tracks: 0, stamp: "", dir: "/" },
      { name: "Take.wav", kind: "take", seconds: 2, tracks: 2, stamp: "", dir: "/" },
    ]);
    const memories = {
      "scene.Standard.5.title": "Live",
      "scene.Standard.5.state": sceneState,
      "scene.Standard.5.protect": 1,
      "scene.Simple.63.title": "Acoustic",
      "scene.Simple.63.state": sceneState,
      "scene.Simple.63.protect": 0,
    };
    const cardValues = model === "URX22" ? {} : {
      "sd.card": card,
      "sd.cardName": "MYCARD",
      "sd.file./Live.urxf": JSON.stringify({ "ch.ch1.level": -9 }),
      "sd.trackCount": 8,
    };
    const values = {
      "ch.ch1.level": -9,
      "setup.brightness": 3,
      "scene.current": 5,
      "scene.bank": "Simple",
      ...memories,
      ...cardValues,
    };
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model, values }));
    await openPage();
    chooseDevice("current");
    expect(currentBox().querySelector(".chrome-reset-ask")?.textContent).toBe(model === "URX22"
      ? "Initialize current memories? Scene memories will stay."
      : "Initialize current memories? Scene memories and the microSD card will stay.");
    await pause(600);
    click(button("Initialize"));
    await until("current values reset", () => shownLevel() === "0");
    await until("current values stored", async () => (await readSaved(model))?.["ch.ch1.level"] === 0);
    const kept = (await readSaved(model))!;
    expect([kept["ch.ch1.level"], kept["setup.brightness"], kept["scene.current"], kept["scene.bank"]]).toEqual([
      0, 10, 0, "Standard",
    ]);
    expect(Object.fromEntries(Object.keys(memories).map((key) => [key, kept[key]]))).toEqual(memories);
    if (model !== "URX22") {
      expect(kept["sd.trackCount"]).toBe(16);
      expect([kept["sd.card"], kept["sd.cardName"], kept["sd.file./Live.urxf"]]).toEqual([
        card, "MYCARD", cardValues["sd.file./Live.urxf"],
      ]);
    }
    expect(document.activeElement).toBe(deviceControl());
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
const MODEL_KEY = "urx-lcd-sim.model";

/** The browser's own timer, which keeps running while a test holds the page's timers still. */
const realSetTimeout = globalThis.setTimeout;
const pause = (ms: number): Promise<void> => new Promise((resolve) => realSetTimeout(resolve, ms));

/** Wait for `ready` to hold, and fail with `what` when it does not. */
async function until(what: string, ready: () => boolean | Promise<boolean>, ms = 4000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await ready())) {
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
  await until("the unit to be stored", async () => (await readSaved(model))?.["ch.ch1.level"] === Number(now));
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

  it("opens on the model of the unit stored last, after another tab picked another model", async () => {
    await openPage();
    await chooseModel("URX22");
    // Another tab picks a URX44V, which keeps the model alone.
    const now = (await keeper.read()) as Kept;
    expect(await keeper.write(now.token, { ...now, model: "URX44V" })).toBe("written");
    const edited = await nudgeLevel("URX22");

    await openPage();
    expect([modelSelect()?.value, lcdModel()]).toEqual(["URX22", "URX22 LCD"]);
    expect(firstLevel()?.getAttribute("aria-valuenow"), "the URX22's level comes back").toBe(edited);
  });

  it("opens on a URX44V where the kept model is none the simulator has", async () => {
    window.localStorage.setItem(MODEL_KEY, "URX99");
    await openPage();
    expect(modelSelect()?.value).toBe("URX44V");
  });
});

describe("[Reset the unit]", () => {
  const resetBox = (): HTMLElement => document.querySelector<HTMLElement>(".chrome-reset")!;
  const button = (text: string): HTMLElement => {
    return [...resetBox().querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === text)!;
  };
  const click = (node: HTMLElement, detail: number): void => {
    node.dispatchEvent(new MouseEvent("click", { bubbles: true, detail }));
  };

  /** A URX44V with CH 1's level stored at -9 beside `values`, and [Reset the unit] asking. */
  async function asking(values: Record<string, string | number> = {}): Promise<void> {
    window.localStorage.setItem(STATE_KEY, JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9, ...values } }));
    await openPage();
    chooseDevice("reset");
    expect(button("Reset"), "the question is up").toBeDefined();
  }

  it("asks whether to drop everything and start again", async () => {
    await asking();
    expect(resetBox().querySelector(".chrome-reset-ask")?.textContent).toBe("Drop everything and start again?");
  });

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
    await pause(100);
    expect((await readSaved("URX44V"))?.["ch.ch1.level"]).toBe(-9);
    expect(firstLevel()?.getAttribute("aria-valuenow")).toBe("-9");
  });

  it("leaves the unit alone when [Reset] is pressed the moment the question appears", async () => {
    await asking();
    click(button("Reset"), 1);
    await pause(100);
    expect((await readSaved("URX44V"))?.["ch.ch1.level"]).toBe(-9);
    expect(firstLevel()?.getAttribute("aria-valuenow")).toBe("-9");
  });

  it("starts again from the unit as it ships when [Reset] is pressed once the question is up", async () => {
    await asking();
    await pause(600);
    click(button("Reset"), 1);
    await until("the unit as it ships", () => firstLevel()?.getAttribute("aria-valuenow") !== "-9");
    await until("the unit as it ships to be stored", async () => (await readSaved("URX44V"))?.["ch.ch1.level"] === Number(shownLevel()));
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
    await until("the card to be stored", async () => (await readSaved("URX44V"))?.["sd.cardName"] === "MYCARD");
    const kept = (await readSaved("URX44V"))!;
    expect([kept["sd.card"], kept["sd.file./Live.urxf"]], "the card").toEqual([card, file]);
    expect([kept["ch.ch1.level"], kept["sd.trackCount"]], "the unit as it ships").toEqual([0, 16]);
  });

  it("keeps one confirmation when the command is selected again", async () => {
    await asking();
    chooseDevice("reset");
    expect(document.querySelectorAll(".chrome-reset-ask")).toHaveLength(1);
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
    expect(await readSaved("URX44V"), "the change is still waiting").toBeNull();
    await openPage();
    expect(shownLevel()).toBe(shown);
    expect((await readSaved("URX44V"))?.["ch.ch1.level"], "and the start took it in").toBe(Number(shown));
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
    chooseDevice("reset");
    await pause(600);
    const reset = [...document.querySelectorAll<HTMLElement>(".chrome-reset button")].find((b) => b.textContent === "Reset")!;
    reset.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await until("the unit as it ships", () => shownLevel() === "0");
    await until("the unit as it ships to be stored", async () => (await readSaved("URX44V"))?.["ch.ch1.level"] === 0);
    expect((await readSaved("URX44V"))?.["ch.ch1.level"], "the change is not written back, and the unit as it ships is").toBe(0);
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

/** The banner over the top of the page that says the unit is not being kept. */
const notice = (): HTMLElement | null => document.querySelector<HTMLElement>("header.chrome > .chrome-notice");
const noticeClose = (): HTMLElement => notice()!.querySelector<HTMLElement>('button[aria-label="Close"]')!;

/** Make the browser refuse every write of the unit until the returned step is run. */
function refuseWrites(): () => void {
  idb.refuse = true;
  return () => {
    idb.refuse = false;
  };
}

/** Another tab storing a unit with CH 1 at -20, and saying so where `heard`: the record it leaves. */
async function storedElsewhere(heard = true): Promise<Kept> {
  const theirs: Kept = { token: "theirs", model: "URX44V", unit: JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -20 } }) };
  expect(await keeper.write(undefined, theirs)).toBe("written");
  if (heard) {
    const channel = new BroadcastChannel("urx-lcd-sim.state");
    channel.postMessage(theirs.token);
    channel.close();
  }
  return theirs;
}

describe("a browser that does not take the unit", () => {
  it("is told so on a banner over the page until a write is taken again", async () => {
    await openPage();
    expect(notice()?.hidden, "there is nothing to tell").toBe(true);
    expect(notice()?.closest(".chrome-controls"), "the banner is not among the header's controls").toBeNull();
    const allow = refuseWrites();
    try {
      await nudge();
      await until("the notice", () => notice()?.hidden === false);
      expect(notice()?.querySelector("p")?.getAttribute("role")).toBe("status");
      expect(notice()?.textContent).toMatch(/not keeping the unit/);
    } finally {
      allow();
    }
    await nudge();
    await until("the notice to go", () => notice()?.hidden === true);
  });

  it("closes on [Close], and comes back at the next write the browser refuses", async () => {
    await openPage();
    const allow = refuseWrites();
    try {
      await nudge();
      await until("the notice", () => notice()?.hidden === false);
      noticeClose().click();
      expect(notice()?.hidden, "closed").toBe(true);
      await nudge();
      await until("the notice again", () => notice()?.hidden === false);
    } finally {
      allow();
    }
  });

  it("closes on Escape without stepping the screen back, and hands the focus to the model selector", async () => {
    await openPage();
    const screenId = (): string | undefined => document.querySelector<HTMLElement>(".toolbar")?.dataset["screen"];
    const allow = refuseWrites();
    try {
      await nudge();
      await until("the notice", () => notice()?.hidden === false);
      document.querySelector<HTMLElement>('.toolbar [aria-label="SETUP"]')!.click();
      await until("SETUP", () => screenId() === "setup");
      noticeClose().focus();
      noticeClose().dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      expect(notice()?.hidden, "another key leaves it up").toBe(false);
      noticeClose().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      expect(notice()?.hidden, "closed").toBe(true);
      await pause(200);
      expect(screenId(), "the screen stays where it was").toBe("setup");
      expect(document.activeElement, "the focus goes to the model selector").toBe(modelSelect());
    } finally {
      allow();
    }
  });
});

describe("a browser with nowhere to keep the unit", () => {
  it("is told so from the start, and nothing is stored or left behind", async () => {
    Object.defineProperty(window, "indexedDB", { value: undefined, configurable: true, writable: true });
    await openPage();
    expect(notice()?.hidden, "told at once").toBe(false);
    expect(notice()?.textContent).toMatch(/does not let the simulator keep the unit/);
    await nudge();
    await pause(600);
    leave(false);
    expect([await keeper.read(), window.localStorage.length]).toEqual([null, 0]);
  });
});

describe("a browser that blocks storage", () => {
  it("is told so from the start", async () => {
    idb.blocked = true;
    await openPage();
    expect(notice()?.hidden, "told at once").toBe(false);
    expect(notice()?.textContent).toMatch(/does not let the simulator keep the unit/);
  });
});

describe("a change made just before another model is picked", () => {
  it("is dropped where another tab stored the unit first, unheard, and the next start says so", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await storedElsewhere(false);
    await nudge();
    expect(notice()?.hidden, "nothing told yet").toBe(true);
    await chooseModel("URX22");
    await until("the notice", () => notice()?.hidden === false);
    expect(notice()?.textContent).toMatch(/were not kept/);
    expect(await keeper.read(), "what the other tab stored stays").toMatchObject({ token: "theirs" });
  });

  it("says nothing where it was stored", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const shown = await nudge();
    await chooseModel("URX22");
    expect(notice()?.hidden).toBe(true);
    expect((await readSaved("URX44V"))?.["ch.ch1.level"]).toBe(Number(shown));
  });
});

describe("a change made while a write is under way, then another model picked", () => {
  it("is stored before the picked model starts, and nothing is told", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    idb.hold();
    await nudge();
    vi.advanceTimersByTime(500);
    const shown = await nudge();
    const switching = chooseModel("URX22");
    await pause(50);
    idb.release();
    await switching;
    expect((await readSaved("URX44V"))?.["ch.ch1.level"], "the later change stored").toBe(Number(shown));
    expect(notice()?.hidden).toBe(true);
  });

  it("is told on the picked model's start where the browser refused to store it", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    idb.refuse = true;
    await nudge();
    await chooseModel("URX22");
    await until("the notice", () => notice()?.hidden === false);
    expect(notice()?.textContent).toMatch(/refused to store the last changes made before this start/);
    expect(await keeper.read(), "nothing stored").toBeNull();
  });
});

describe("a change left on leaving the page that the browser refuses to take in", () => {
  it("is shown on the next start and told, kept for later, and stored once the browser takes a write", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const shown = await nudge();
    leave(false);
    idb.refuse = true;
    await openPage();
    expect(shownLevel(), "the start shows what was left").toBe(shown);
    await until("the notice", () => notice()?.hidden === false);
    expect(notice()?.textContent).toMatch(/shown here/);
    expect([await keeper.read(), window.localStorage.length], "nothing stored, and what was left kept").toEqual([null, 1]);
    idb.refuse = false;
    const now = await nudge();
    vi.advanceTimersByTime(500);
    await until("the unit to be stored", async () => (await readSaved("URX44V"))?.["ch.ch1.level"] === Number(now));
    expect([notice()?.hidden, window.localStorage.length], "the notice goes, and what was left with it").toEqual([true, 0]);
  });
});

describe("what another tab left on another model, which the browser refuses to take in", () => {
  it("opens the page on that model, with what was left", async () => {
    await openPage();
    await nudgeLevel("URX44V");
    const record = (await keeper.read()) as Kept;
    window.localStorage.setItem(
      "urx-lcd-sim.left.y",
      JSON.stringify({ basis: record.token, inFlight: null, model: "URX22", unit: JSON.stringify({ version: 1, model: "URX22", values: { "ch.ch1.level": -9 } }), at: Date.now() }),
    );
    idb.refuse = true;
    await openPage();
    expect([modelSelect()?.value, shownLevel()]).toEqual(["URX22", "-9"]);
  });
});

describe("what another tab left, which the browser refuses to take in when a model is picked", () => {
  it("stays where it was left, and the picked model starts from what is stored", async () => {
    await openPage();
    window.localStorage.setItem(
      "urx-lcd-sim.left.x",
      JSON.stringify({ basis: null, inFlight: null, model: "URX22", unit: JSON.stringify({ version: 1, model: "URX22", values: { "ch.ch1.level": -9 } }), at: Date.now() }),
    );
    idb.refuse = true;
    await chooseModel("URX22");
    expect(shownLevel(), "not the other tab's level").not.toBe("-9");
    expect(window.localStorage.getItem("urx-lcd-sim.left.x"), "kept for a later start").not.toBeNull();
  });
});

describe("the banner closed over changes lost before the start", () => {
  it("does not bring them back with what it says next", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await nudge();
    leave(false);
    await storedElsewhere(false);
    await openPage();
    await until("the notice", () => notice()?.hidden === false);
    noticeClose().click();
    idb.refuse = true;
    await nudge();
    vi.advanceTimersByTime(500);
    await until("the notice again", () => notice()?.hidden === false);
    expect(notice()?.querySelector("p")?.textContent, "only how storing stands now").toBe("The browser is not keeping the unit: changes made now will not come back after a reload.");
  });
});

describe("a change left on leaving the page", () => {
  it("is dropped where another tab stored the unit before the next start, and that start says so", async () => {
    await openPage();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    await nudge();
    leave(false);
    expect(window.localStorage.length, "what was waiting is left behind").toBe(1);
    await storedElsewhere();
    await openPage();
    expect(shownLevel(), "the start opens on what the other tab stored").toBe("-20");
    await until("the notice", () => notice()?.hidden === false);
    expect(notice()?.textContent).toMatch(/were not kept/);
    expect(window.localStorage.length, "and lets what was left go").toBe(0);
  });
});

describe("a unit another tab stores", () => {
  it("is left as that tab stored it, with the chrome saying so, until a reload", async () => {
    await openPage();
    const theirs = await storedElsewhere();
    await nudge();
    await pause(600);
    expect(await keeper.read(), "what the other tab stored stays").toEqual(theirs);
    expect(notice()?.hidden, "the chrome says this tab stores no more").toBe(false);
    expect(notice()?.textContent).toMatch(/another tab/i);

    await openPage();
    expect(shownLevel(), "a reload opens on what the other tab stored").toBe("-20");
    expect(notice()?.hidden).toBe(true);
    expect(await nudgeLevel("URX44V"), "and stores again").not.toBe("-20");
  });

  it("comes back on the banner at the next change once closed", async () => {
    await openPage();
    await storedElsewhere();
    await until("the notice", () => notice()?.hidden === false);
    expect(notice()?.textContent, "as soon as it hears").toMatch(/another tab/i);
    noticeClose().click();
    expect(notice()?.hidden, "closed").toBe(true);
    await nudge();
    await until("the notice again", () => notice()?.hidden === false);
    expect(notice()?.textContent).toMatch(/another tab/i);
  });

  it("is stored by this tab again once [Reset the unit] starts it again", async () => {
    await openPage();
    const theirs = await storedElsewhere();
    await nudge();
    await pause(600);
    expect(await keeper.read(), "this tab has stopped storing").toEqual(theirs);

    chooseDevice("reset");
    await pause(600);
    const reset = [...document.querySelectorAll<HTMLElement>(".chrome-reset button")].find((b) => b.textContent === "Reset")!;
    reset.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    await until("the unit as it ships", () => shownLevel() === "0");
    expect(notice()?.hidden, "the chrome has nothing to tell").toBe(true);
    const now = await nudge();
    await until("this tab to store the unit", async () => (await readSaved("URX44V"))?.["ch.ch1.level"] === Number(now), 2000);
  });
});
