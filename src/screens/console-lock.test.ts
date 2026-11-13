import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { Shell } from "../app/shell";
import { buildRegistry } from ".";
import { UNLOCKED_MS, UNLOCK_HOLD_MS } from "./setup";

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
});
