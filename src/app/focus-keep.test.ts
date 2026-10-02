import { afterEach, describe, expect, it } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { Shell } from "./shell";

// Every change draws the screen again from scratch. The keys stay on the control
// they were on, so a value turns press after press and a switch can be pressed
// again without the Tab key.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const mounted: Shell[] = [];

afterEach(() => {
  for (const shell of mounted.splice(0)) {
    shell.destroy();
    shell.root.remove();
  }
});

/** A shell on the page, where the focus can stand. */
async function mount(): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  document.body.appendChild(shell.root);
  mounted.push(shell);
  await flush();
  return shell;
}

/** A key pressed and let go on whatever holds the focus. */
async function press(key: string, init: KeyboardEventInit = {}): Promise<void> {
  const node = document.activeElement;
  node?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  await flush();
  node?.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, ...init }));
  await flush();
}

describe("the focus through a redraw", () => {
  it("stays on a value box the arrow keys turn, press after press", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".delay-cell .value-box");
    box()?.focus();
    const seen = [box()?.textContent];
    for (let i = 0; i < 2; i++) {
      await press("ArrowUp");
      seen.push(document.activeElement === box() ? box()?.textContent : "focus lost");
    }
    expect(seen).toEqual(["1.00", "1.01", "1.02"]);
  });

  it("turns a value box by its fastStep while Shift is held", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "bus.stream" });
    shell.ctx.nav.push({ id: "ch.delay", strip: "bus.stream" });
    await flush();
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".delay-cell .value-box");
    box()?.focus();
    const seen = [box()?.textContent];
    await press("ArrowUp");
    seen.push(box()?.textContent);
    await press("ArrowUp", { shiftKey: true });
    seen.push(box()?.textContent);
    await press("ArrowDown", { shiftKey: true });
    seen.push(box()?.textContent);
    expect(seen, "a step of 0.01, and of 0.1 with Shift").toEqual(["1.00", "1.01", "1.11", "1.01"]);
  });

  it("turns a fader four stops at once while Shift is held", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    const level = (): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>('[role="slider"]')].find((n) => n.getAttribute("aria-label") === "CH 1 LEVEL");
    const from0 = async (presses: number, shiftKey: boolean): Promise<number> => {
      await store.set("ch.ch1.level", 0);
      await flush();
      level()?.focus();
      for (let i = 0; i < presses; i++) await press("ArrowUp", { shiftKey });
      return store.num("ch.ch1.level", 99);
    };
    const [one, four, shifted] = [await from0(1, false), await from0(4, false), await from0(1, true)];
    expect([one, four, shifted]).toEqual([0.4, 3.2, 3.2]);
  });

  it("stays on a switch pressed with Enter", async () => {
    const shell = await mount();
    const on = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".strip .btn-on");
    on()?.focus();
    const lit = [on()?.classList.contains("is-on")];
    await press("Enter");
    lit.push(document.activeElement === on() && on()?.classList.contains("is-on"));
    await press("Enter");
    lit.push(document.activeElement === on() && on()?.classList.contains("is-on"));
    expect(lit).toEqual([true, false, true]);
  });

  it("follows a control the redraw moves elsewhere on the screen", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.eq", strip: "ch1" });
    await flush();
    shell.root.querySelector<HTMLElement>(".oneknob")?.focus();
    await press("Enter");
    const active = document.activeElement;
    expect([active?.classList.contains("oneknob"), active?.classList.contains("is-on"), active?.closest(".oneknob-panel") !== null]).toEqual([true, true, true]);
  });

  it("goes to the same control, not to another of its tag that the redraw put in its place", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.userDefinedKnobs", true);
    await flush();
    shell.root.querySelector<HTMLElement>(".knob-bank-next")?.focus();
    await press("Enter");
    expect([shell.ctx.store.num("setup.udk.bank", 0), shell.root.querySelector(".knob-bank-prev") !== null, document.activeElement?.getAttribute("aria-label")]).toEqual([
      2,
      true,
      "User defined knobs page 3",
    ]);
  });

  it("sinks a banded control on the glass while a pointer holds it", async () => {
    const shell = await mount();
    const box = shell.root.querySelector<HTMLElement>(".scene-box");
    // The page's stylesheet is not loaded here, so the band is given inline.
    box?.style.setProperty("box-shadow", "inset 0 -3px 0 rgb(49, 57, 58)");
    box?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    const held = [box?.classList.contains("is-pressed"), box?.style.getPropertyValue("--press")];
    window.dispatchEvent(new MouseEvent("pointerup"));
    expect([...held, box?.classList.contains("is-pressed")]).toEqual([true, "3px", false]);
  });

  it("stays in the title field as a browser's keys fill it", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.title" });
    await flush();
    const field = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".title-field");
    field()?.focus();
    for (const key of "abc") await press(key);
    expect([shell.root.querySelector(".title-text")?.textContent, document.activeElement === field()]).toEqual(["abc", true]);
  });

  it("leaves the focus on the page when the press opens another screen", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "setup" });
    await flush();
    shell.root.querySelector<HTMLElement>('.icon-btn[aria-label="HOME"]')?.focus();
    await press("Enter");
    expect([shell.ctx.nav.current.id, document.activeElement === document.body]).toEqual(["home", true]);
  });
});
