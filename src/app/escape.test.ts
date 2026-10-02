import { afterEach, describe, expect, it } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { dialog } from "../ui/widgets";
import type { Route } from "./navigator";
import { Shell } from "./shell";

// The unit has no keyboard, so Escape is the simulator's own affordance: it does
// what the toolbar's back arrow does. Two things outrank it — an open dialog and
// a field being typed into — because both would otherwise lose work to it.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The shells a test builds, each holding the window until the test is over. */
const alive: Shell[] = [];

afterEach(() => {
  for (const shell of alive.splice(0)) {
    shell.destroy();
    shell.root.remove();
  }
});

async function mount(): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  alive.push(shell);
  await flush();
  return shell;
}

/** Escape with nothing in the frame focused, as a fresh screen leaves it. */
async function escape(init: KeyboardEventInit = {}): Promise<void> {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", ...init }));
  await flush();
}

describe("Escape", () => {
  it("steps back out of a screen", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    await escape();
    expect(shell.ctx.nav.current.id).toBe("home");
  });

  it("steps back one screen at a time, not all the way home", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    shell.ctx.nav.push({ id: "setup.brightness" });
    await flush();
    await escape();
    expect(shell.ctx.nav.current.id).toBe("setup");
  });

  it("does nothing on HOME, which has nowhere to go back to", async () => {
    const shell = await mount();
    await escape();
    expect(shell.ctx.nav.current.id).toBe("home");
  });

  it("closes the bank list, which draws no button to close it with", async () => {
    const shell = await mount();
    shell.root.querySelector<HTMLElement>(".bank-btn")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("bank-select");
    await escape();
    expect(shell.ctx.nav.current.id).toBe("home");
  });

  it("is the dialog's while one is open, and the screen behind stays put", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    try {
      shell.ctx.nav.push({ id: "setup" });
      await flush();
      let cancelled = 0;
      const ask = (): void => {
        shell.ctx.overlay(dialog({ message: "Discard?", onOk: () => undefined, onCancel: () => cancelled++ }));
      };
      ask();
      await flush();

      // Nothing focused: the key is still the dialog's, and it cancels the dialog.
      await escape();
      expect(shell.root.querySelector('[role="dialog"]'), "the dialog is down").toBeNull();
      expect(cancelled, "as its [Cancel] takes it down").toBe(1);
      expect(shell.ctx.nav.current.id, "the screen behind it did not go back").toBe("setup");

      // Focused, which is where the dialog puts it: the dialog closes, alone.
      ask();
      await flush();
      shell.root.querySelector<HTMLElement>('[role="dialog"] button')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
      expect(shell.root.querySelector('[role="dialog"]')).toBeNull();
      expect(cancelled).toBe(2);
      expect(shell.ctx.nav.current.id).toBe("setup");
    } finally {
      shell.root.remove();
    }
  });

  it("belongs to a field being typed into", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    try {
      shell.ctx.nav.push({ id: "ch.setting", strip: "ch1" });
      await flush();
      const name = shell.root.querySelector<HTMLInputElement>(".chs-name");
      expect(name, "CH SETTING carries the channel name field").not.toBeNull();

      name?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
      expect(shell.ctx.nav.current.id, "the edit in hand is not worth a screen").toBe("ch.setting");
    } finally {
      shell.root.remove();
    }
  });

  it("belongs to an IME composition", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    await escape({ isComposing: true });
    expect(shell.ctx.nav.current.id, "Escape cancels the composition, not the screen").toBe("setup");
  });
});

// A dialog or a sheet blocks the screen behind it until it is answered: the keys
// stay in it wherever the focus has gone, and once it is down they are back on
// the control it was opened from.

describe("a dialog or a sheet over the screen", () => {
  /** A shell on the page, where the focus can stand, on the screen asked for. */
  async function onPage(...routes: Route[]): Promise<Shell> {
    const shell = await mount();
    document.body.appendChild(shell.root);
    for (const route of routes) shell.ctx.nav.push(route);
    await flush();
    return shell;
  }

  /** A key pressed and let go where the focus stands, and whether its press was taken. */
  async function press(key: string, init: KeyboardEventInit = {}): Promise<boolean> {
    const node = document.activeElement ?? document.body;
    const down = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
    node.dispatchEvent(down);
    await flush();
    node.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...init }));
    await flush();
    return down.defaultPrevented;
  }

  /** Focus a control and press Enter on it. */
  async function enter(node: HTMLElement | null | undefined): Promise<void> {
    node?.focus();
    await press("Enter");
  }

  /** The focus let go of, as a touch on a part of the dialog that takes none leaves it. */
  const letGo = (): void => (document.activeElement as HTMLElement | null)?.blur();

  /** Output Patch, with the [Default] dialog open from the keys. */
  async function defaultDialog(): Promise<Shell> {
    const shell = await onPage({ id: "setup" }, { id: "setup.patch" });
    await enter(shell.root.querySelector<HTMLElement>(".patch-default"));
    return shell;
  }

  /** MONITOR's Setting tab, with Monitor 1's source sheet open from the keys. */
  async function sourceSheet(): Promise<Shell> {
    const shell = await onPage();
    await shell.ctx.store.set("ui.monitorTab", "Setting");
    shell.ctx.nav.openTop({ id: "monitor" });
    shell.ctx.nav.push({ id: "monitor.level" });
    await flush();
    await enter(shell.root.querySelector<HTMLElement>(".mon-source"));
    return shell;
  }

  const behind = (shell: Shell): (boolean | undefined)[] =>
    [".toolbar", ".main", ".side", ".knob-strip"].map((s) => shell.root.querySelector(s)?.hasAttribute("inert"));
  const inside = (shell: Shell, selector: string): boolean => shell.root.querySelector(selector)?.contains(document.activeElement) === true;

  it("cancels the dialog on Escape wherever the focus stands, leaving the screen behind where it is", async () => {
    const shell = await defaultDialog();
    expect(inside(shell, ".dialog-overlay"), "the dialog takes the focus").toBe(true);
    letGo();
    expect(document.activeElement).toBe(document.body);
    expect(await press("Escape"), "the key is taken").toBe(true);
    expect([shell.root.querySelector(".dialog-overlay"), shell.ctx.nav.current.id]).toEqual([null, "setup.patch"]);
  });

  it("closes the sheet on Escape wherever the focus stands, leaving the screen behind where it is", async () => {
    const shell = await sourceSheet();
    expect(inside(shell, ".source-overlay"), "the sheet takes the focus").toBe(true);
    letGo();
    expect(await press("Escape"), "the key is taken").toBe(true);
    expect([shell.root.querySelector(".source-overlay"), shell.ctx.nav.current.id]).toEqual([null, "monitor.level"]);
  });

  it("gives the focus back to [Default] however its dialog is answered, and after a redraw under it", async () => {
    const after: (string | null | undefined)[] = [];
    for (const answer of ["Cancel", "OK", "Escape", "redrawn"]) {
      const shell = await defaultDialog();
      const opener = shell.root.querySelector(".patch-default");
      if (answer === "redrawn") {
        await shell.ctx.store.set("setup.brightness", 5);
        await flush();
        expect(opener?.isConnected, "the redraw put another [Default] in its place").toBe(false);
      }
      if (answer === "Escape" || answer === "redrawn") await press("Escape");
      else await enter([...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === answer));
      expect(shell.root.querySelector(".dialog-overlay"), `${answer} takes the dialog down`).toBeNull();
      after.push(document.activeElement === shell.root.querySelector(".patch-default") ? "Default" : document.activeElement?.className);
    }
    expect(after).toEqual(["Default", "Default", "Default", "Default"]);
  });

  it("gives the focus back to [Source] however its sheet closes, the pick that redraws it included", async () => {
    const after: (string | null | undefined)[] = [];
    for (const how of ["pick", "Escape", "back"]) {
      const shell = await sourceSheet();
      if (how === "Escape") await press("Escape");
      else if (how === "back") await enter(shell.root.querySelector<HTMLElement>(".source-back"));
      else await enter([...shell.root.querySelectorAll<HTMLElement>(".source-btn")].find((b) => b.textContent === "MIX 1"));
      expect(shell.root.querySelector(".source-overlay"), `${how} takes the sheet down`).toBeNull();
      after.push(document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName);
    }
    expect(after).toEqual(["Monitor 1 source", "Monitor 1 source", "Monitor 1 source"]);
  });

  it("leaves Tab and Escape alone under the loading modal, which has nothing to answer with", async () => {
    const shell = await onPage({ id: "microsd" }, { id: "microsd.recorder" });
    [...shell.root.querySelectorAll<HTMLElement>(".side-tab")].find((t) => t.textContent === "Play")?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-text")?.textContent).toBe("Loading...");
    expect(behind(shell), "the recorder is out of reach under it").toEqual([true, true, true, true]);
    letGo();
    expect(await press("Tab"), "Tab goes on past the glass").toBe(false);
    expect(await press("Escape"), "nor Escape").toBe(false);
    expect([shell.root.querySelector(".dialog-text")?.textContent, shell.ctx.nav.current.id], "which takes neither it nor the screen down").toEqual([
      "Loading...",
      "microsd.recorder",
    ]);
  });

  it("leaves the focus where it went off the glass when the dialog goes with its screen", async () => {
    const shell = await defaultDialog();
    const outside = document.body.appendChild(document.createElement("button"));
    try {
      outside.focus();
      shell.ctx.nav.back();
      await flush();
      expect([shell.root.querySelector(".dialog-overlay"), document.activeElement === outside]).toEqual([null, true]);
    } finally {
      outside.remove();
    }
  });

  it("keeps Tab going round the dialog, from inside it or from nowhere, and the screen behind out of reach", async () => {
    const shell = await defaultDialog();
    expect(behind(shell), "toolbar, main area, side rail and knob bar").toEqual([true, true, true, true]);
    const name = (): string | undefined => document.activeElement?.textContent ?? undefined;
    const seen = [name()];
    expect(await press("Tab"), "Tab is taken").toBe(true);
    seen.push(name());
    expect(await press("Tab")).toBe(true);
    seen.push(name());
    expect(await press("Tab", { shiftKey: true })).toBe(true);
    seen.push(name());
    letGo();
    expect(await press("Tab", { shiftKey: true }), "and taken from nowhere").toBe(true);
    seen.push(name());
    letGo();
    expect(await press("Tab")).toBe(true);
    seen.push(name());
    expect(seen).toEqual(["OK", "Cancel", "OK", "Cancel", "OK", "Cancel"]);

    await press("Escape");
    expect(behind(shell), "and back in reach once it is down").toEqual([false, false, false, false]);
  });

  it("keeps Tab going round the sheet, and the screen behind out of reach", async () => {
    const shell = await sourceSheet();
    expect(behind(shell)).toEqual([true, true, true, true]);
    const label = (): string | null | undefined => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent;
    const first = label();
    expect(await press("Tab", { shiftKey: true }), "Shift+Tab on the first stop is taken").toBe(true);
    const last = label();
    expect(await press("Tab"), "and Tab on the last").toBe(true);
    expect([first, last, label()]).toEqual(["Close the Monitor 1 source list", "MIX 2", "Close the Monitor 1 source list"]);
    expect(inside(shell, ".source-overlay")).toBe(true);

    await press("Escape");
    expect(behind(shell)).toEqual([false, false, false, false]);
  });
});

// A shell and the things layered over it hold the window between them. Nothing
// on screen shows what a discarded one is still listening to, so the guards
// below watch the window itself.

describe("what a screen gives back", () => {
  it("takes the window with it when the shell is destroyed", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();

    shell.destroy();
    await escape();
    expect(shell.ctx.nav.current.id, "a shell nobody can see does not answer the key").toBe("setup");
  });

  it("closes what is layered over a screen when the screen changes under it", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    const node = document.createElement("div");
    let closed = 0;
    shell.ctx.overlay(node, () => {
      closed++;
    });

    shell.ctx.nav.back();
    await flush();
    expect(shell.root.contains(node), "the overlay is off the glass").toBe(false);
    expect(closed, "and whatever it was holding is given up with it").toBe(1);
  });

  it("leaves the window's keys to the shell while a list is up, and nothing behind once the screen under it goes away", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "ch.setting", strip: "ch1" });
    await flush();

    const add = window.addEventListener;
    const remove = window.removeEventListener;
    let held = 0;
    window.addEventListener = ((...args: Parameters<typeof add>) => {
      if (args[0] === "keydown") held++;
      return add.apply(window, args);
    }) as typeof add;
    window.removeEventListener = ((...args: Parameters<typeof remove>) => {
      if (args[0] === "keydown") held--;
      return remove.apply(window, args);
    }) as typeof remove;
    try {
      shell.root.querySelector<HTMLElement>(".chs-field .pulldown")?.click();
      await flush();
      const lists = (): number => shell.root.querySelectorAll(".dropdown-sheet").length;
      expect([lists(), held], "the list is up and holds no key of its own").toEqual([1, 0]);

      shell.ctx.nav.back();
      await flush();
      expect([lists(), held], "and goes with the screen that opened it").toEqual([0, 0]);
    } finally {
      window.addEventListener = add;
      window.removeEventListener = remove;
    }
  });
});
