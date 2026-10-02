import { describe, expect, it } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { dialog } from "../ui/widgets";
import { Shell } from "./shell";

// The unit has no keyboard, so Escape is the simulator's own affordance: it does
// what the toolbar's back arrow does. Two things outrank it — an open dialog and
// a field being typed into — because both would otherwise lose work to it.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
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
      shell.ctx.overlay(dialog({ message: "Discard?", onOk: () => undefined }));
      await flush();

      // Nothing focused: the shell must still keep its hands off the key.
      await escape();
      expect(shell.root.querySelector('[role="dialog"]'), "the dialog is still up").not.toBeNull();
      expect(shell.ctx.nav.current.id, "the screen behind it did not go back").toBe("setup");

      // Focused, which is where the dialog puts it: the dialog closes, alone.
      shell.root.querySelector<HTMLElement>('[role="dialog"] button')
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
      expect(shell.root.querySelector('[role="dialog"]')).toBeNull();
      expect(shell.ctx.nav.current.id).toBe("setup");
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

  it("belongs to an IME composition", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    await escape({ isComposing: true });
    expect(shell.ctx.nav.current.id, "Escape cancels the composition, not the screen").toBe("setup");
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

  it("gives the key back when the screen under an open list goes away", async () => {
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
      expect(held, "the list holds the key while it is up").toBe(1);

      shell.ctx.nav.back();
      await flush();
      expect(held, "and hands it back with the screen that opened it").toBe(0);
    } finally {
      window.addEventListener = add;
      window.removeEventListener = remove;
    }
  });
});
