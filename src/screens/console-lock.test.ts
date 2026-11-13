import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { Shell } from "../app/shell";
import { buildRegistry } from ".";
import { CONSOLE_PASSWORD, MISMATCH_MS, UNLOCKED_MS, UNLOCK_HOLD_MS } from "./setup";

// SETUP > Console Lock (System firmware V1.5). The lock screen takes nothing but a touch held on
// it, read off a URX44V: a short touch leaves the unit locked, a hold opens the padlock and HOME
// comes back.

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const alive: Shell[] = [];

afterEach(() => {
  vi.useRealTimers();
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
  document.body.appendChild(shell.root);
  alive.push(shell);
  await flush();
  return shell;
}

const button = (shell: Shell, name: string): HTMLElement | undefined =>
  [...shell.root.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent?.replace(/\s+/g, " ").trim() === name);

/** Lock the unit from SETUP, as the screens lead there. */
async function lock(shell: Shell): Promise<HTMLElement> {
  shell.ctx.nav.openTop({ id: "setup" });
  await flush();
  button(shell, "Console Lock")?.click();
  await flush();
  expect(shell.ctx.nav.current.id, "[Console Lock] opens CONSOLE LOCK").toBe("setup.consoleLock");
  shell.root.querySelector<HTMLElement>(".console-lock-tile")?.click();
  await flush();
  const screen = shell.root.querySelector<HTMLElement>(".console-locked");
  expect(screen, "the lock screen is up").not.toBeNull();
  return screen!;
}

const pointer = (type: string): Event => Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }), { pointerId: 1 });

describe("Console Lock", () => {
  it("draws the three lines and the padlock over the whole glass", async () => {
    const shell = await mount();
    const screen = await lock(shell);
    expect([...screen.querySelectorAll("h1, p")].map((n) => n.textContent)).toEqual([
      "CONSOLE LOCK",
      "Touch and Hold the Screen to Unlock the Console.",
      "A password is required if one is set.",
    ]);
    expect(screen.querySelector(".icon-console-lock")).not.toBeNull();
    expect(screen.getAttribute("aria-modal")).toBe("true");
  });

  it("stays locked through a short touch and through Escape", async () => {
    const shell = await mount();
    const screen = await lock(shell);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    screen.dispatchEvent(pointer("pointerdown"));
    expect(screen.classList.contains("is-holding"), "the faint circle goes up at the touch").toBe(true);
    vi.advanceTimersByTime(UNLOCK_HOLD_MS - 1);
    screen.dispatchEvent(pointer("pointerup"));
    expect(screen.classList.contains("is-holding"), "and comes down when it is let go").toBe(false);
    vi.advanceTimersByTime(UNLOCK_HOLD_MS + UNLOCKED_MS);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    vi.useRealTimers();
    await flush();
    expect(screen.isConnected, "still locked").toBe(true);
    expect(screen.querySelector(".icon-console-unlocked")).toBeNull();
  });

  it("unlocks after the hold and goes back to HOME", async () => {
    const shell = await mount();
    const screen = await lock(shell);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    screen.dispatchEvent(pointer("pointerdown"));
    vi.advanceTimersByTime(UNLOCK_HOLD_MS);
    expect(screen.querySelector(".icon-console-unlocked"), "the padlock opens at the end of the hold").not.toBeNull();
    expect(screen.isConnected, "the open padlock stays up a while").toBe(true);
    screen.dispatchEvent(pointer("pointerup"));
    vi.advanceTimersByTime(UNLOCKED_MS);
    vi.useRealTimers();
    await flush();
    expect(screen.isConnected, "the lock screen is gone").toBe(false);
    expect(shell.ctx.nav.current.id).toBe("home");
  });

  it("shuts the glass behind the lock screen, so nothing under it can be pressed", async () => {
    const shell = await mount();
    await lock(shell);
    const behind = [".toolbar", ".main", ".side", ".knob-strip"].map((sel) => shell.root.querySelector(sel)?.hasAttribute("inert"));
    expect(behind).toEqual([true, true, true, true]);
  });

  it("does not unlock on a key held and let go after the focus has moved off the lock screen", async () => {
    const shell = await mount();
    const screen = await lock(shell);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    screen.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(100);
    screen.blur();
    vi.advanceTimersByTime(UNLOCK_HOLD_MS + UNLOCKED_MS);
    vi.useRealTimers();
    await flush();
    expect(screen.isConnected, "still locked").toBe(true);
    expect(screen.querySelector(".icon-console-unlocked")).toBeNull();
  });

  it("takes Enter held on the lock screen as a held touch", async () => {
    const shell = await mount();
    const screen = await lock(shell);
    expect(document.activeElement, "the lock screen takes the focus").toBe(screen);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    screen.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(UNLOCK_HOLD_MS + UNLOCKED_MS);
    vi.useRealTimers();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
    expect(screen.isConnected).toBe(false);
  });

  describe("Change Password", () => {
    /** Open Change Password from CONSOLE LOCK. */
    async function open(shell: Shell): Promise<void> {
      shell.ctx.nav.openTop({ id: "setup" });
      shell.ctx.nav.push({ id: "setup.consoleLock" });
      await flush();
      shell.root.querySelector<HTMLElement>(".console-lock-password")?.click();
      await flush();
      expect(shell.ctx.nav.current.id).toBe("setup.consoleLock.password");
    }
    /** Type `text` into the field named `name` through the keyboard it opens, and take it with [OK]. */
    async function type(shell: Shell, name: string, text: string): Promise<void> {
      shell.root.querySelector<HTMLElement>(`[aria-label="${name}"]`)?.click();
      await flush();
      expect(shell.ctx.nav.current.id, "the field opens the keyboard").toBe("scene.title");
      // Each key redraws the sheet, so the field is found again for the next one.
      for (const key of text) {
        shell.root.querySelector<HTMLElement>(".title-field")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        await flush();
      }
      expect(shell.root.querySelector(".title-text")?.textContent, "the keyboard shows an asterisk a character").toBe("*".repeat(text.length));
      button(shell, "OK")?.click();
      await flush();
    }
    const stars = (shell: Shell): string[] => [...shell.root.querySelectorAll(".console-password-stars")].map((n) => n.textContent ?? "");

    it("says for two seconds that two different passwords do not match, and gives the sheet back as it was", async () => {
      const shell = await mount();
      await open(shell);
      await type(shell, "New Password", "ab");
      expect(stars(shell)).toEqual(["**", ""]);
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      button(shell, "OK")?.click();
      const message = (): string | null => shell.root.querySelector(".dialog-overlay .dialog-text")?.textContent ?? null;
      expect(message()).toBe("Entered Password do not match, please re-enter.");
      expect(shell.root.querySelector(".main")?.hasAttribute("inert"), "the sheet under the message takes no press").toBe(true);
      vi.advanceTimersByTime(MISMATCH_MS - 1);
      expect(message(), "still up").not.toBeNull();
      vi.advanceTimersByTime(1);
      vi.useRealTimers();
      await flush();
      expect(message(), "gone").toBeNull();
      expect(shell.ctx.nav.current.id).toBe("setup.consoleLock.password");
      expect(stars(shell)).toEqual(["**", ""]);
      expect(shell.ctx.store.str(CONSOLE_PASSWORD, ""), "nothing set").toBe("");
    });

    it("sets the password when the two are the same, and [Cancel] sets nothing", async () => {
      const shell = await mount();
      await open(shell);
      await type(shell, "New Password", "ab");
      button(shell, "Cancel")?.click();
      await flush();
      expect([shell.ctx.nav.current.id, shell.ctx.store.str(CONSOLE_PASSWORD, "")]).toEqual(["setup.consoleLock", ""]);
      button(shell, "Change Password")?.click();
      await flush();
      expect(stars(shell), "the sheet opens empty").toEqual(["", ""]);
      await type(shell, "New Password", "ab");
      await type(shell, "Confirm Password", "ab");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      button(shell, "OK")?.click();
      expect(shell.root.querySelector(".dialog-overlay .dialog-text")?.textContent).toBe("Password Changed.");
      vi.advanceTimersByTime(MISMATCH_MS);
      vi.useRealTimers();
      await flush();
      expect([shell.ctx.nav.current.id, shell.ctx.store.str(CONSOLE_PASSWORD, "")]).toEqual(["setup.consoleLock", "ab"]);
    });
  });

  describe("with a password set", () => {
    /** Type `text` into the open sheet's field named `name` through the keyboard. */
    async function enter(shell: Shell, name: string, text: string): Promise<void> {
      shell.root.querySelector<HTMLElement>(`[aria-label="${name}"]`)?.click();
      await flush();
      for (const key of text) {
        shell.root.querySelector<HTMLElement>(".title-field")?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        await flush();
      }
      button(shell, "OK")?.click();
      await flush();
    }
    /** Hold the lock screen until the padlock has opened and given way. */
    async function hold(shell: Shell): Promise<void> {
      const screen = shell.root.querySelector<HTMLElement>(".console-locked")!;
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      screen.dispatchEvent(pointer("pointerdown"));
      vi.advanceTimersByTime(UNLOCK_HOLD_MS + UNLOCKED_MS);
      vi.useRealTimers();
      await flush();
    }

    it("asks for it once the padlock has opened, refuses the wrong one, and goes back to the lock on [Cancel] and on Escape", async () => {
      const shell = await mount();
      await shell.ctx.store.set(CONSOLE_PASSWORD, "1");
      await lock(shell);
      await hold(shell);
      expect(shell.ctx.nav.current.id, "Type the password").toBe("setup.consoleLock.enter");
      expect(shell.root.querySelector(".console-locked"), "the lock screen has given way").toBeNull();
      await enter(shell, "Password", "2");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      button(shell, "OK")?.click();
      expect(shell.root.querySelector(".dialog-overlay .dialog-text")?.textContent).toBe("Incorrect password entered.");
      vi.advanceTimersByTime(MISMATCH_MS);
      vi.useRealTimers();
      await flush();
      expect(shell.ctx.nav.current.id).toBe("setup.consoleLock.enter");
      expect(shell.root.querySelector(".console-password-stars")?.textContent, "what was typed stays").toBe("*");
      button(shell, "Cancel")?.click();
      await flush();
      expect(shell.root.querySelector(".console-locked"), "[Cancel] puts the lock back").not.toBeNull();
      await hold(shell);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      await flush();
      expect(shell.root.querySelector(".console-locked"), "so does Escape").not.toBeNull();
    });

    it("unlocks to HOME with the right one", async () => {
      const shell = await mount();
      await shell.ctx.store.set(CONSOLE_PASSWORD, "1");
      await lock(shell);
      await hold(shell);
      await enter(shell, "Password", "1");
      button(shell, "OK")?.click();
      await flush();
      expect(shell.ctx.nav.current.id).toBe("home");
      shell.ctx.nav.openTop({ id: "setup" });
      await flush();
      expect(shell.root.querySelector(".console-locked"), "and stays unlocked").toBeNull();
    });

    it("asks for it before Change Password, and both fields left empty take it away", async () => {
      const shell = await mount();
      await shell.ctx.store.set(CONSOLE_PASSWORD, "1");
      shell.ctx.nav.openTop({ id: "setup" });
      shell.ctx.nav.push({ id: "setup.consoleLock" });
      await flush();
      button(shell, "Change Password")?.click();
      await flush();
      expect(shell.ctx.nav.current.id).toBe("setup.consoleLock.enter");
      await enter(shell, "Password", "1");
      button(shell, "OK")?.click();
      await flush();
      expect(shell.ctx.nav.current.id, "the right password opens Change Password").toBe("setup.consoleLock.password");
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      button(shell, "OK")?.click();
      expect(shell.root.querySelector(".dialog-overlay .dialog-text")?.textContent).toBe("Password Changed.");
      vi.advanceTimersByTime(MISMATCH_MS);
      vi.useRealTimers();
      await flush();
      expect([shell.ctx.nav.current.id, shell.ctx.store.str(CONSOLE_PASSWORD, "")]).toEqual(["setup.consoleLock", ""]);
    });
  });
});
