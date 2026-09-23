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
