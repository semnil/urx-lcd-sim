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
async function press(key: string): Promise<void> {
  const node = document.activeElement;
  node?.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  await flush();
  node?.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
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

  it("keeps a held control down when its screen is drawn again, until the finger is let go", async () => {
    const shell = await mount();
    // The page's stylesheet is not loaded here, so [ON]'s band is given by a rule of its own.
    const band = document.createElement("style");
    band.textContent = ".btn-on { box-shadow: inset 0 -4px 0 rgb(0, 0, 0); }";
    document.head.append(band);
    try {
      const on = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".main .strip .btn-on");
      const sunk = (): boolean | undefined => on()?.classList.contains("is-pressed");
      const finger = (node: EventTarget | null, type: string, pointerId: number, clientY = 0): void => {
        const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
        node?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "touch", button: 0, buttons, clientY }));
      };

      finger(on(), "pointerdown", 1);
      const held = on();
      // A value written elsewhere draws HOME again.
      await shell.ctx.store.set("ch.ch2.level", 3);
      await flush();
      expect([on() !== held, sunk()], "drawn again under the finger").toEqual([true, true]);
      // A second finger dragging CH 2 LEVEL draws it again on each move.
      finger(shell.root.querySelector('[aria-label="CH 2 LEVEL"]'), "pointerdown", 2, 300);
      finger(window, "pointermove", 2, 250);
      await flush();
      expect(sunk(), "while a second finger drags").toBe(true);
      finger(window, "pointerup", 2, 250);
      await flush();
      expect(sunk(), "the second finger let go").toBe(true);
      finger(window, "pointerup", 1);
      expect(sunk(), "the first finger let go").toBe(false);

      // Another screen and back: the control HOME draws then is not held.
      finger(on(), "pointerdown", 3);
      shell.ctx.nav.openTop({ id: "setup" });
      await flush();
      shell.ctx.nav.home();
      await flush();
      expect(sunk(), "after another screen").toBe(false);
      finger(window, "pointerup", 3);
    } finally {
      band.remove();
    }
  });

  it("keeps a held [ON] down while HOME's bank stands, and no other channel's [ON] when it steps", async () => {
    const shell = await mount();
    const band = document.createElement("style");
    band.textContent = ".btn-on { box-shadow: inset 0 -4px 0 rgb(0, 0, 0); }";
    document.head.append(band);
    try {
      const ons = (): HTMLElement[] => [...shell.root.querySelectorAll<HTMLElement>(".main .strip .btn-on")];
      const down = (): number => ons().filter((n) => n.classList.contains("is-pressed")).length;
      const firstStrip = (): string | null | undefined => shell.root.querySelector(".main .strip")?.getAttribute("aria-label");
      const finger = (node: EventTarget | undefined, type: string, pointerId: number): void => {
        node?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "touch" }));
      };

      // The same bank drawn again keeps CH 1's [ON] down, until the finger is cancelled.
      finger(ons()[0], "pointerdown", 1);
      await shell.ctx.store.set("ch.ch2.level", 3);
      await flush();
      const sameBank = { strip: firstStrip(), first: ons()[0]?.classList.contains("is-pressed"), down: down() };
      finger(window, "pointercancel", 1);
      const cancelled = down();

      // Another bank: the [ON] drawn where CH 1's stood is another channel's.
      finger(ons()[0], "pointerdown", 2);
      await shell.ctx.store.set("ui.bank", 1);
      await flush();
      const otherBank = { strip: firstStrip(), down: down() };
      finger(window, "pointerup", 2);
      expect({ sameBank, cancelled, otherBank, letGo: down() }).toEqual({
        sameBank: { strip: expect.stringMatching(/^CH 1\b/), first: true, down: 1 },
        cancelled: 0,
        otherBank: { strip: expect.not.stringMatching(/^CH 1\b/), down: 0 },
        letGo: 0,
      });
    } finally {
      band.remove();
    }
  });

  it("keeps down nothing another channel's screen draws in the place of a held control", async () => {
    const shell = await mount();
    const band = document.createElement("style");
    band.textContent = ".ch-arrow { box-shadow: inset 0 -3px 0 rgb(0, 0, 0); }";
    document.head.append(band);
    try {
      shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
      await flush();
      const arrow = (): Element | null => shell.root.querySelector('[aria-label="Next channel"]');
      const sunk = (): boolean | undefined => arrow()?.classList.contains("is-pressed");
      arrow()?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
      await shell.ctx.store.set("ch.ch1.level", 3);
      await flush();
      const same = sunk();
      shell.ctx.nav.replace({ id: "channel-view", strip: "ch2" });
      await flush();
      expect({ same, next: sunk() }).toEqual({ same: true, next: false });
      window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "touch" }));
    } finally {
      band.remove();
    }
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
