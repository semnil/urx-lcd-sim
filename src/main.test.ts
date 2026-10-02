import { afterEach, describe, expect, it, vi } from "vitest";

// The page around the screen: the simulator's own chrome, as the page opens it.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Where the browser keeps the unit. */
const KEY = "urx-lcd-sim.state";

/** A unit left with CH 1's level moved off where it ships. */
const SAVED = JSON.stringify({ version: 1, model: "URX44V", values: { "ch.ch1.level": -9 } });

/** What the page does when it is left, for the page a test opened. */
let leave: ((ev: Event) => void) | null = null;

afterEach(() => {
  if (leave) {
    leave(new Event("beforeunload"));
    window.removeEventListener("beforeunload", leave);
    leave = null;
  }
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
  const unload = listen.mock.calls.find(([type]) => type === "beforeunload")?.[1];
  leave = typeof unload === "function" ? (unload as (ev: Event) => void) : null;
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

describe("[Reset the unit]", () => {
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
      leave?.(new Event("beforeunload"));
      if (leave) window.removeEventListener("beforeunload", leave);
      leave = null;
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
