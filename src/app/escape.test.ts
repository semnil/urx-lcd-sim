import { afterEach, describe, expect, it } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { readCard, writeCard } from "../model/card";
import type { CardEntry } from "../model/card";
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
    expect(shell.ctx.nav.depth, "HOME stays on the stack").toBe(1);
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
    await flush();
    expect(shell.root.querySelector('.toolbar [aria-label="Back"]'), "EQ, two screens on from HOME, has its back arrow").not.toBeNull();
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

  it("keeps Tab and Shift+Tab going round the dialog's buttons while it is open", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    try {
      shell.ctx.overlay(dialog({ message: "Discard?", onOk: () => undefined }));
      await flush();
      [...shell.root.querySelectorAll<HTMLElement>('[role="dialog"] .dialog-actions .btn')].find((b) => b.textContent === "OK")?.focus();
      const seen = [document.activeElement?.textContent];
      const taken: boolean[] = [];
      for (const shiftKey of [false, false, true]) {
        const ev = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
        document.activeElement?.dispatchEvent(ev);
        await flush();
        taken.push(ev.defaultPrevented);
        seen.push(document.activeElement?.textContent);
      }
      expect(seen).toEqual(["OK", "Cancel", "OK", "Cancel"]);
      expect(taken, "the browser does not take the focus out of it").toEqual([true, true, true]);
    } finally {
      shell.root.remove();
    }
  });

  it("closes a picker sheet the focus is in, and the screen behind stays put", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    try {
      shell.ctx.nav.push({ id: "setup" });
      shell.ctx.nav.push({ id: "setup.patch" });
      await flush();
      shell.root.querySelector<HTMLElement>(".patch-btn")?.click();
      await flush();
      expect(document.activeElement?.closest(".source-overlay"), "the sheet is up with the focus in it").not.toBeNull();

      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await flush();
      expect([shell.root.querySelector(".source-overlay"), shell.ctx.nav.current.id]).toEqual([null, "setup.patch"]);
    } finally {
      shell.root.remove();
    }
  });

  it("steps back once for a key held down, whatever its first press closed", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    const at = (): string => `${shell.ctx.nav.current.id} (depth ${shell.ctx.nav.depth})`;
    /** Escape as the browser sends it, at the focus of the moment; whether the page took it. */
    const key = async (repeat: boolean): Promise<boolean> => {
      const ev = new KeyboardEvent("keydown", { key: "Escape", repeat, bubbles: true, cancelable: true });
      (document.activeElement ?? document.body).dispatchEvent(ev);
      await flush();
      return ev.defaultPrevented;
    };
    try {
      // The first press cancels the dialog, and the repeats leave the screen behind it.
      shell.ctx.nav.push({ id: "setup" });
      shell.ctx.nav.push({ id: "setup.patch" });
      await flush();
      shell.root.querySelector<HTMLElement>(".patch-default")?.click();
      await flush();
      expect(shell.root.querySelector('[role="dialog"]'), "[Default] asks first").not.toBeNull();
      await key(false);
      expect([shell.root.querySelector('[role="dialog"]'), at()]).toEqual([null, "setup.patch (depth 3)"]);
      for (let i = 0; i < 2; i++) expect(await key(true), "the repeat is the page's").toBe(true);
      expect(at(), "after the dialog").toBe("setup.patch (depth 3)");

      // With nothing over the screen, the first press goes back one screen and the repeats nothing.
      shell.ctx.nav.home();
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
      await flush();
      for (let i = 0; i < 2; i++) await key(true);
      expect(at(), "repeats alone").toBe("ch.comp (depth 3)");
      await key(false);
      expect(at(), "a fresh press").toBe("channel-view (depth 2)");
      await key(true);
      expect(at(), "and its repeat").toBe("channel-view (depth 2)");
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

  it("belongs to the title field being typed into, and leaves the sheet from anywhere else on it", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    try {
      shell.ctx.nav.push({ id: "scene" });
      shell.ctx.nav.push({ id: "scene.title" });
      await flush();
      shell.root.querySelector<HTMLElement>(".title-field")?.focus();
      for (const key of ["L", "i", "v", "e", "Escape"]) {
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        await flush();
      }
      expect(
        [shell.ctx.nav.current.id, shell.root.querySelector(".title-text")?.textContent, document.activeElement?.className],
        "the sheet stays up with what was typed, the focus in its field",
      ).toEqual(["scene.title", "Live", "title-field"]);

      [...shell.root.querySelectorAll<HTMLElement>(".title-entry button")].find((b) => b.textContent === "Cancel")?.focus();
      document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      await flush();
      expect(shell.ctx.nav.current.id, "Escape on [Cancel] leaves it as [Cancel] does").toBe("scene");
    } finally {
      shell.root.remove();
    }
  });

  it("belongs to a control of the page around the glass, a dialog up on the glass or not", async () => {
    const shell = await mount();
    document.body.appendChild(shell.root);
    const select = document.body.appendChild(document.createElement("select"));
    try {
      shell.ctx.nav.push({ id: "setup" });
      shell.ctx.nav.push({ id: "setup.brightness" });
      await flush();
      /** Escape pressed on `node`, and whether its press was taken. */
      const escapeOn = async (node: Element): Promise<boolean> => {
        const down = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
        node.dispatchEvent(down);
        await flush();
        return down.defaultPrevented;
      };
      const dialogUp = (): boolean => shell.root.querySelector('[role="dialog"]') !== null;

      select.focus();
      expect([await escapeOn(select), shell.ctx.nav.current.id], "the screen stays").toEqual([false, "setup.brightness"]);
      shell.ctx.overlay(dialog({ message: "Discard?", onOk: () => undefined, onCancel: () => undefined }));
      await flush();
      select.focus();
      expect([await escapeOn(select), dialogUp()], "and so does a dialog on it").toEqual([false, true]);

      // With nothing focused the key is the glass's again.
      select.blur();
      expect([await escapeOn(document.body), dialogUp()], "the dialog is cancelled").toEqual([true, false]);
      expect([await escapeOn(document.documentElement), shell.ctx.nav.current.id], "and the screen steps back").toEqual([true, "setup"]);
    } finally {
      select.remove();
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

  /** A shell taken off the page before the next goes on, so one shell at a time answers the keys. */
  function drop(shell: Shell): void {
    alive.splice(alive.indexOf(shell), 1);
    shell.destroy();
    shell.root.remove();
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

  it("gives the focus back to the control a touch opened a dialog, a sheet or a list from, though the touch left the focus elsewhere, and to the one drawn in its place since", async () => {
    // A touch on a button moves no focus here, as in WebKit; the keys open each from the control holding it.
    const kinds: { name: string; routes: Route[]; state?: Record<string, string>; opener: string; closer: string }[] = [
      { name: "dialog", routes: [{ id: "setup" }, { id: "setup.patch" }], opener: ".patch-default", closer: ".dialog-actions .btn" },
      { name: "sheet", routes: [{ id: "monitor" }, { id: "monitor.level" }], state: { "ui.monitorTab": "Setting" }, opener: '[aria-label="Monitor 1 source"]', closer: ".source-back" },
      { name: "list", routes: [{ id: "channel-view", strip: "ch1" }, { id: "ch.setting", strip: "ch1" }], opener: ".chs-rec-field .pulldown", closer: ".dropdown-sheet" },
    ];
    const seen: string[] = [];
    for (const kind of kinds) {
      for (const from of ["keys", "a touch, the focus on HOME", "a touch, the focus on nothing"]) {
        for (const redrawn of [false, true]) {
          const shell = await onPage(...kind.routes);
          for (const [path, value] of Object.entries(kind.state ?? {})) await shell.ctx.store.set(path, value);
          await flush();
          const opener = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(kind.opener);
          const home = shell.root.querySelector<HTMLElement>('.toolbar [aria-label="HOME"]');
          const touched = from !== "keys";
          if (!touched) await enter(opener());
          else {
            if (from.endsWith("HOME")) home?.focus();
            else letGo();
            opener()?.click();
            await flush();
          }
          const first = opener();
          if (redrawn) {
            await shell.ctx.store.set("setup.brightness", 5);
            await flush();
            expect(first?.isConnected, `${kind.name}: the redraw put another opener in its place`).toBe(false);
          }
          const closer = shell.root.querySelector<HTMLElement>(kind.closer);
          if (touched) {
            closer?.click();
            await flush();
          } else if (kind.name === "list") await press("Escape");
          else await enter(closer);
          expect(shell.root.querySelector("[data-overlay]"), `${kind.name} from ${from} is down`).toBeNull();
          const at = document.activeElement;
          const where = at === opener() ? "the opener" : at === document.body ? "nothing" : (at?.getAttribute("aria-label") ?? at?.className);
          seen.push(`${kind.name} from ${from}${redrawn ? ", redrawn" : ""}: ${where}`);
          drop(shell);
        }
      }
    }
    expect(seen).toEqual(
      kinds.flatMap((kind) =>
        ["keys", "a touch, the focus on HOME", "a touch, the focus on nothing"].flatMap((from) => [
          `${kind.name} from ${from}: the opener`,
          `${kind.name} from ${from}, redrawn: the opener`,
        ]),
      ),
    );
  });

  it("gives the focus back to the control under a sheet once the question a button on the sheet asks in its place is answered", async () => {
    const seen: string[] = [];
    for (const from of ["keys", "a touch"]) {
      for (const answer of ["Cancel", "OK"]) {
        const shell = await onPage({ id: "channel-view", strip: "ch1" }, { id: "ch.input", strip: "ch1" });
        const source = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".input-source-btn");
        const byText = (selector: string, text: string) => (): HTMLElement | undefined =>
          [...shell.root.querySelectorAll<HTMLElement>(selector)].find((b) => b.textContent === text);
        const steps = [source, byText(".source-btn", "All USB DAW"), byText(".dialog-actions .btn", answer)];
        if (from === "keys") for (const step of steps) await enter(step());
        else {
          letGo();
          for (const step of steps) {
            step()?.click();
            await flush();
          }
        }
        expect(shell.root.querySelector("[data-overlay]"), `${from}, ${answer}: the question is down`).toBeNull();
        const at = document.activeElement;
        seen.push(`${from}, ${answer}: ${at === source() ? "the source button" : (at?.getAttribute("aria-label") ?? at?.tagName)}`);
        drop(shell);
      }
    }
    expect(seen).toEqual(["keys, Cancel", "keys, OK", "a touch, Cancel", "a touch, OK"].map((run) => `${run}: the source button`));
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
    expect(seen).toEqual(["Cancel", "OK", "Cancel", "OK", "OK", "Cancel"]);

    await press("Escape");
    expect(behind(shell), "and back in reach once it is down").toEqual([false, false, false, false]);
  });

  it("opens a question with two answers on [Cancel], so the Enter that follows the one that opened it does nothing, and one with [OK] alone on [OK]", async () => {
    const card: CardEntry[] = [
      { name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
      { name: "take.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" },
    ];
    const byText = (selector: string, text: string) => (shell: Shell): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(selector)].find((b) => b.textContent === text);
    const bySelector = (selector: string) => (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>(selector);
    const stored = { "scene.Standard.5.title": "Band", "scene.selected": 5 };
    const asks: { routes: Route[]; state?: Record<string, string | number | boolean>; opener: (shell: Shell) => HTMLElement | null | undefined; sheet?: string }[] = [
      { routes: [{ id: "setup" }, { id: "setup.patch" }], state: { "setup.outputPatch.mainOut": "MONITOR 2" }, opener: bySelector(".patch-default") },
      { routes: [{ id: "microsd" }, { id: "microsd.saveload" }], state: { "ui.sdSaveTab": "Edit", "sd.selectedFile": 1 }, opener: bySelector('.sd-actions [aria-label="Delete"]') },
      { routes: [{ id: "scene" }, { id: "scene.list" }], state: { ...stored, "ui.sceneMenu": "Edit" }, opener: bySelector('.scene-actions.is-edit [aria-label="Delete"]') },
      { routes: [{ id: "scene" }, { id: "scene.list" }], state: stored, opener: byText(".scene-actions .btn", "Store") },
      { routes: [{ id: "scene" }, { id: "scene.list" }], state: stored, opener: byText(".scene-actions .btn", "Recall") },
      { routes: [{ id: "microsd" }, { id: "microsd.tools" }], opener: bySelector(".tools-screen .btn"), sheet: ".pick-dialog-ok" },
      { routes: [{ id: "microsd" }], state: { "sd.mounted": false }, opener: bySelector(".sd-no-card") },
      { routes: [{ id: "microsd" }], opener: bySelector(".usb-storage") },
      { routes: [{ id: "microsd" }], state: { "sd.usbStorage": true }, opener: bySelector(".usb-storage") },
    ];
    const seen: string[] = [];
    for (const ask of asks) {
      const shell = await onPage(...ask.routes);
      await writeCard(shell.ctx.store, card);
      for (const [path, value] of Object.entries(ask.state ?? {})) await shell.ctx.store.set(path, value);
      await flush();
      await enter(ask.opener(shell));
      if (ask.sheet) await enter(shell.root.querySelector<HTMLElement>(ask.sheet));
      const question = shell.root.querySelector('[role="dialog"]')?.getAttribute("aria-label")?.split("\n")[0];
      const focus = inside(shell, ".dialog-actions") ? document.activeElement?.textContent : "off the buttons";
      const revision = shell.ctx.store.revision;
      const files = readCard(shell.ctx.store).length;
      await press("Enter");
      // Format takes the card's files a while after its [OK], under a modal that stands up at once.
      const done = shell.ctx.store.revision !== revision || readCard(shell.ctx.store).length !== files || shell.root.querySelector(".dialog-overlay") !== null;
      seen.push(`${question}: ${focus}, ${done ? "something done" : "nothing done"}`);
    }
    expect(seen).toEqual([
      "Reset to Default?: Cancel, nothing done",
      "Delete the selected file?: Cancel, nothing done",
      'Delete "Scene Memory #05"?: Cancel, nothing done',
      'Store to "Scene Memory #05"?: Cancel, nothing done',
      'Recall scene "Band"?: Cancel, nothing done',
      "Formatting will erase ALL data on this card.: Cancel, nothing done",
      "Simulate inserting the microSD card?: Cancel, nothing done",
      "This microSD card is recognized as a storage: Cancel, nothing done",
      "Please make sure that the microSD storage: Cancel, nothing done",
    ]);

    const shell = await onPage({ id: "microsd" });
    await enter(shell.root.querySelector<HTMLElement>(".sd-eject"));
    expect([shell.root.querySelector('[role="dialog"]')?.getAttribute("aria-label"), document.activeElement?.textContent]).toEqual([
      "Now you may safely remove the microSD card.",
      "OK",
    ]);
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

  it("lets go of a value being dragged when the screen changes under it", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    const nav = shell.ctx.nav;
    const brightness = (): number => store.num("setup.brightness", NaN);
    const turning = (): boolean => document.documentElement.classList.contains("is-turning");
    const at = (type: string, y: number): MouseEvent => new MouseEvent(type, { bubbles: true, clientY: y });
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".single-param .value-box");
    const subscribe = nav.onChange.bind(nav);
    let following = 0;
    nav.onChange = (listener) => {
      following++;
      const off = subscribe(listener);
      return () => {
        following--;
        return off();
      };
    };
    const open = async (): Promise<void> => {
      await store.set("setup.brightness", 10);
      nav.openTop({ id: "setup" });
      nav.push({ id: "setup.brightness" });
      await flush();
    };
    const press = async (): Promise<void> => {
      box()?.dispatchEvent(at("pointerdown", 300));
      window.dispatchEvent(at("pointermove", 320));
      await flush();
    };

    // A drag that stays on its screen turns the value, and lets the screen go once it is let go.
    await open();
    const before = following;
    await press();
    expect(brightness(), "a drag on its own screen").toBe(9);
    window.dispatchEvent(at("pointerup", 320));
    expect([turning(), following], "let go").toEqual([false, before]);

    // Escape, or a second finger on HOME, takes the screen away and the drag with it.
    for (const leave of [() => escape(), async () => shell.root.querySelector<HTMLElement>('[aria-label="HOME"]')?.click()]) {
      await open();
      await press();
      await leave();
      await flush();
      expect(nav.current.id === "setup.brightness", "the screen went").toBe(false);
      expect([turning(), following], "the drag went with it").toEqual([false, before]);
      window.dispatchEvent(at("pointermove", 480));
      await flush();
      expect(brightness(), "the pointer moving on").toBe(9);
      window.dispatchEvent(at("pointerup", 480));
    }
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
