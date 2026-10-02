import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import type { ScreenDef } from "../screens/types";
import { el } from "../ui/dom";
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
async function mount(registry = buildRegistry()): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(registry, store, model);
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
    expect(seen).toEqual(["1.00", "2.00", "3.00"]);
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

  it("goes back to the title field from a key on the glass, so a browser's keys go on filling it", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.title" });
    await flush();
    const field = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".title-field");
    const key = (face: string): HTMLElement | undefined => [...shell.root.querySelectorAll<HTMLElement>(".title-key")].find((k) => k.textContent === face);
    const clear = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".title-clear");
    const presses = [key("q"), clear()].map((node) => {
      const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
      node?.dispatchEvent(down);
      return down.defaultPrevented;
    });
    expect(presses, "a press on a key or on [Clear] takes no focus off the field").toEqual([true, true]);

    // Nothing focused, as the sheet opens, and then a key holding the focus, as a browser that gives a pressed button the focus leaves it.
    const seen: (string | boolean | null | undefined)[] = [];
    key("q")?.click();
    await flush();
    seen.push(document.activeElement === field());
    key("w")?.focus();
    key("w")?.click();
    await flush();
    seen.push(document.activeElement === field());
    for (const k of ["a", "Backspace", "e"]) await press(k);
    seen.push(shell.root.querySelector(".title-text")?.textContent);
    (document.activeElement as HTMLElement | null)?.blur();
    clear()?.click();
    await flush();
    seen.push(document.activeElement === field(), shell.root.querySelector(".title-text")?.textContent);
    expect(seen).toEqual([true, true, "qwe", true, ""]);

    // [Clear] reached with Tab keeps the focus the keys put on it.
    clear()?.focus();
    await press("Enter");
    expect(document.activeElement === clear()).toBe(true);
  });

  it("works only the switch or value box pressed inside a channel view's block, as a finger does", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const find = (selector: string, text?: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(selector)].find((n) => text === undefined || n.textContent === text);
    const seen: (string | null | undefined)[] = [];
    for (const [selector, text] of [
      [".cv-block-eq .badge-switch", "EQ"],
      [".cv-gain button", "SAFE"],
      [".cv-gain .value-box", undefined],
    ] as const) {
      for (const key of ["Enter", " "]) {
        const before = find(selector, text)?.getAttribute("aria-pressed");
        find(selector, text)?.focus();
        await press(key);
        seen.push(`${shell.ctx.nav.current.id} ${before}->${find(selector, text)?.getAttribute("aria-pressed")}`);
      }
    }
    expect(seen).toEqual([
      "channel-view true->false",
      "channel-view false->true",
      "channel-view false->true",
      "channel-view true->false",
      "channel-view null->null",
      "channel-view null->null",
    ]);
  });

  it("goes to the control standing where a pressed page step stood, once the step goes", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.gate", strip: "ch1" });
    await flush();
    const name = (): string | null | undefined => (shell.root.contains(document.activeElement) ? document.activeElement?.getAttribute("aria-label") : "off the glass");
    const seen: (string | null | undefined)[] = [];
    shell.root.querySelector<HTMLElement>(".knob-page-next")?.focus();
    for (let i = 0; i < 2; i++) {
      await press("Enter");
      seen.push(name());
    }
    // The USER DEFINED KNOBS bar's first page, stepped back to from its second.
    await shell.ctx.store.set("ui.userDefinedKnobs", true);
    await shell.ctx.store.set("setup.udk.bank", 2);
    await flush();
    shell.root.querySelector<HTMLElement>(".knob-bank-prev")?.focus();
    await press("Enter");
    seen.push(`${shell.ctx.store.num("setup.udk.bank", 0)} ${name()}`);
    expect(seen).toEqual(["Knob page 1 of 2", "Knob page 2 of 2", "1 User defined knobs page 2"]);
  });

  it("goes to the step the other way when the page stepped to has no step where the pressed one stood", async () => {
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const name = (): string | null | undefined => (shell.root.contains(document.activeElement) ? document.activeElement?.getAttribute("aria-label") : "off the glass");
    /** Enter pressed `times` over on whatever holds the focus, each landing read with where the page stands. */
    const walk = async (times: number, where: () => string): Promise<string[]> => {
      const seen: string[] = [];
      for (let i = 0; i < times; i++) {
        await press("Enter");
        seen.push(`${where()} ${name()}`);
      }
      return seen;
    };
    // The USER DEFINED KNOBS bar, out to its last page and back to its first.
    await shell.ctx.store.set("ui.userDefinedKnobs", true);
    await flush();
    const bank = (): string => String(shell.ctx.store.num("setup.udk.bank", 0));
    shell.root.querySelector<HTMLElement>(".knob-bank-next")?.focus();
    expect(await walk(6, bank)).toEqual([
      "2 User defined knobs page 3",
      "3 User defined knobs page 4",
      "4 User defined knobs page 3",
      "3 User defined knobs page 2",
      "2 User defined knobs page 1",
      "1 User defined knobs page 2",
    ]);
    // The effect pages: M.B.Comp's four, and Pitch Fix's three, the first of which carries [Correction].
    const page = (): string => String(shell.ctx.store.num("ui.effectPage", 0));
    for (const [strip, effect, landings] of [
      ["bus.stereo", "M.B.Comp", ["1 Next", "2 Next", "3 Previous", "2 Previous", "1 Previous", "0 Next"]],
      ["ch1", "Pitch Fix", ["1 Next", "2 Previous", "1 Previous", "0 Next"]],
    ] as const) {
      await shell.ctx.store.set("ui.userDefinedKnobs", false);
      shell.ctx.nav.home();
      shell.ctx.nav.push({ id: "channel-view", strip });
      shell.ctx.nav.push({ id: "ch.insfx", strip });
      await flush();
      shell.root.querySelector<HTMLElement>(".insfx-effect")?.click();
      await flush();
      [...shell.root.querySelectorAll<HTMLElement>(".source-sheet .source-btn")].find((b) => b.textContent === effect)?.click();
      await flush();
      shell.root.querySelector<HTMLElement>(".efx-page-next")?.focus();
      expect(await walk(landings.length, page), effect).toEqual(landings.map((l) => `${l} page of settings`));
    }
  });

  it("leaves the focus off a place a pressed control gives up to something that is no control", async () => {
    // A button that gives its place to a text the Tab key stops on once it is pressed.
    let pressed = false;
    const screen: ScreenDef = {
      id: "gives.place",
      toolbar: "sub",
      build: (ctx) => ({
        main: el("div", {
          children: [
            pressed
              ? el("div", { class: "given", text: "Done", attrs: { tabindex: "0" } })
              : el("button", {
                  class: "giver",
                  text: "Go",
                  onTap: () => {
                    pressed = true;
                    ctx.repaint();
                  },
                }),
          ],
        }),
      }),
    };
    const shell = await mount(buildRegistry().register(screen));
    shell.ctx.nav.push({ id: "gives.place" });
    await flush();
    shell.root.querySelector<HTMLElement>(".giver")?.focus();
    await press("Enter");
    expect([shell.root.querySelector(".given") !== null, document.activeElement === document.body]).toEqual([true, true]);
  });

  it("goes to the control a pressed control gives its place to, but to no step the other way where two stand, nor to one of its kind with other words", async () => {
    // Each control on the first face gives its place: to another button, to a text with two steps the other way
    // after it, and to a text with a button of the pressed one's kind and other words after it.
    let drawn = 0;
    const screen: ScreenDef = {
      id: "gives.way",
      toolbar: "sub",
      build: (ctx) => {
        const to = (n: number) => (): void => {
          drawn = n;
          ctx.repaint();
        };
        const text = (words: string): HTMLElement => el("span", { text: words });
        const faces = [
          [
            el("button", { class: "giver", text: "Go", onTap: to(1) }),
            el("button", { class: "step step-next", text: ">", onTap: to(2) }),
            el("button", { class: "lone", text: "One", onTap: to(3) }),
          ],
          [el("button", { class: "taker", text: "Went" })],
          [text("Page"), text("2"), el("button", { class: "step step-prev", text: "<" }), el("button", { class: "step step-prev", text: "<" })],
          [text("a"), text("b"), text("c"), el("button", { class: "lone", text: "Two" })],
        ];
        return { main: el("div", { children: faces[drawn] ?? [] }) };
      },
    };
    const shell = await mount(buildRegistry().register(screen));
    shell.ctx.nav.push({ id: "gives.way" });
    await flush();
    const at = (): string => (shell.root.contains(document.activeElement) ? (document.activeElement?.textContent ?? "") : "off the glass");
    const seen: string[] = [];
    for (const pressed of [".giver", ".step-next", ".lone"]) {
      drawn = 0;
      shell.ctx.repaint();
      await flush();
      shell.root.querySelector<HTMLElement>(pressed)?.focus();
      await press("Enter");
      seen.push(at());
    }
    expect(seen).toEqual(["Went", "off the glass", "off the glass"]);
  });

  it("follows [Next SSMCS screen] onto the screen it steps to in place of this one, so Enter steps on", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.ssmcs", strip: "ch1" });
    await flush();
    shell.root.querySelector<HTMLElement>(".ssmcs-page-next")?.focus();
    const seen: (string | null | undefined)[] = [];
    for (let i = 0; i < 2; i++) {
      await press("Enter");
      await flush();
      seen.push(`${shell.ctx.nav.current.id} ${shell.ctx.nav.depth} ${document.activeElement?.getAttribute("aria-label")}`);
    }
    expect(seen).toEqual(["ch.ssmcs.comp 3 Next SSMCS screen", "ch.ssmcs.sc 3 Next SSMCS screen"]);
  });

  it("takes the focus onto the arrow the other way on the SSMCS screen at either end, so Enter steps back", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.compEqOrder", "SSMCS");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.ssmcs", strip: "ch1" });
    await flush();
    shell.root.querySelector<HTMLElement>(".ssmcs-page-next")?.focus();
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      await press("Enter");
      await flush();
      seen.push(`${shell.ctx.nav.current.id} ${shell.root.contains(document.activeElement) ? document.activeElement?.getAttribute("aria-label") : "off the glass"}`);
    }
    expect(seen).toEqual([
      "ch.ssmcs.comp Next SSMCS screen",
      "ch.ssmcs.sc Next SSMCS screen",
      "ch.ssmcs.eq Previous SSMCS screen",
      "ch.ssmcs.sc Previous SSMCS screen",
      "ch.ssmcs.comp Previous SSMCS screen",
      "ch.ssmcs Next SSMCS screen",
    ]);
  });

  it("takes onto a screen put in place of this one only its one control of the same kind and name, wherever it stands", async () => {
    // Two screens that step to each other in place, holding their buttons in another order, the second two [C].
    const step = (id: string, to: string, labels: string[]): ScreenDef => ({
      id,
      toolbar: "sub",
      build: (ctx) => ({
        main: el("div", {
          children: labels.map((label) => el("button", { class: "step", attrs: { "aria-label": label }, onTap: () => ctx.nav.replace({ id: to }) })),
        }),
      }),
    });
    const shell = await mount(buildRegistry().register(step("step.a", "step.b", ["A", "B", "C"]), step("step.b", "step.a", ["B", "A", "C", "C"])));
    shell.ctx.nav.push({ id: "step.a" });
    await flush();
    const button = (label: string): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.step[aria-label="${label}"]`);
    const at = (): string => `${shell.ctx.nav.current.id} ${shell.root.contains(document.activeElement) ? document.activeElement?.getAttribute("aria-label") : "off the glass"}`;
    const seen: string[] = [];
    button("A")?.focus();
    await press("Enter");
    seen.push(at());
    await press("Enter");
    seen.push(at());
    button("C")?.focus();
    await press("Enter");
    seen.push(at());
    expect(seen).toEqual(["step.b A", "step.a A", "step.b off the glass"]);
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

describe("the grips on a dynamics plot", () => {
  interface Stops {
    /** Where the Tab key stops under something hidden from assistive technology. */
    hidden: string[];
    /** How many grips the Tab key stops on. */
    grips: number;
    /** What a dynamics plot draws that assistive technology is left to meet, grips aside. */
    drawn: string[];
  }
  const stops = async (shell: Shell): Promise<Stops> => {
    await flush();
    const tabbable = [...shell.root.querySelectorAll("[tabindex], button, input, select, textarea")].filter(
      (n) => Number(n.getAttribute("tabindex") ?? 0) >= 0 && !n.closest("[inert]"),
    );
    return {
      hidden: tabbable.filter((n) => n.closest("[aria-hidden='true']")).map((n) => n.getAttribute("aria-label") ?? n.className),
      grips: tabbable.filter((n) => n.matches(".dyn-handle[role='slider'], .eq-grip")).length,
      drawn: [...shell.root.querySelectorAll(".dyn-curve *")]
        .filter((n) => !n.closest("[role='slider'], [aria-hidden='true']"))
        .map((n) => `${n.tagName}.${n.getAttribute("class") ?? ""}`),
    };
  };
  /** A channel's screen, opened from its channel view; an SSMCS screen on the channel put on SSMCS. */
  const open = async (id: string, strip: string): Promise<Shell> => {
    const shell = await mount();
    if (id.startsWith("ch.ssmcs")) await shell.ctx.store.set(`ch.${strip}.compEqOrder`, "SSMCS");
    shell.ctx.nav.push({ id: "channel-view", strip });
    shell.ctx.nav.push({ id, strip });
    await flush();
    return shell;
  };
  /** INS FX on `strip`, running `effect`. */
  const insert = async (strip: string, effect: string): Promise<Shell> => {
    const shell = await open("ch.insfx", strip);
    shell.root.querySelector<HTMLElement>(".insfx-effect")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".source-sheet .source-btn")].find((b) => b.textContent === effect)?.click();
    await flush();
    return shell;
  };

  it("leaves every grip that takes the Tab key in reach of assistive technology, and the rest of the plot hidden", async () => {
    const seen: Record<string, Stops> = {};
    for (const [id, strip] of [
      ["ch.gate", "ch1"],
      ["ch.comp", "ch1"],
      ["ch.ducker", "ch_5_6"],
      ["ch.ssmcs.comp", "ch1"],
      ["ch.eq", "ch1"],
      ["ch.ssmcs.eq", "ch1"],
    ] as const) {
      seen[`${id} ${strip}`] = await stops(await open(id, strip));
    }
    seen["Compander-H"] = await stops(await insert("ch1", "Compander-H"));
    const mbc = await insert("bus.stereo", "M.B.Comp");
    for (const page of [0, 1, 2, 3]) {
      await mbc.ctx.store.set("ui.effectPage", page);
      seen[`M.B.Comp page ${page}`] = await stops(mbc);
    }
    // Each screen carries grips that take the Tab key, nothing hidden takes it,
    // and the plot shows nothing but its grips.
    const astray = Object.entries(seen).filter(([, { hidden, grips, drawn }]) => hidden.length > 0 || grips === 0 || drawn.length > 0);
    expect(astray).toEqual([]);
  });

  it("hides a plot whole while its grips take no touch", async () => {
    const shell = await open("ch.comp", "ch1");
    await shell.ctx.store.set("ch.ch1.comp.oneKnob.on", true);
    const seen = await stops(shell);
    expect(shell.root.querySelectorAll(".dyn-handle.is-fixed").length, "the grips go to marks").toBe(3);
    expect(seen).toEqual({ hidden: [], grips: 0, drawn: [] });
    expect(shell.root.querySelector(".dyn-curve")?.getAttribute("aria-hidden"), "the plot itself").toBe("true");
  });
});

describe("the USER DEFINED KNOBS bar", () => {
  it("marks a screen with a readout bar of its own apart from one that carries the bar only for the mode", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ui.userDefinedKnobs", true);
    await flush();
    const marks = (): boolean[] => ["has-readout", "is-udk"].map((c) => shell.root.classList.contains(c));
    const home = marks();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    shell.ctx.nav.push({ id: "ch.comp", strip: "ch1" });
    await flush();
    expect([home, marks()], "HOME, then CH 1's COMP").toEqual([[false, true], [true, true]]);
  });
});

describe("what a redraw lets go of", () => {
  it("leaves the focus holding only the drawn screen's controls, however many times a value redraws it", async () => {
    setFlagsFromString("--expose-gc");
    const gc = runInNewContext("gc") as () => void;
    const shell = await mount();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch1" });
    await flush();
    const listening = (): number => (shell.ctx.focus as unknown as { listeners: Set<unknown> }).listeners.size;
    const first = listening();
    for (let i = 0; i < 100; i++) {
      await shell.ctx.store.set("ch.ch1.pan", i % 2 === 0 ? 10 : -10);
      await flush();
    }
    for (let i = 0; i < 4; i++) {
      gc();
      await flush();
    }
    // A listener whose control has gone lets go the next time the focus moves.
    shell.ctx.focus.takeKey("one");
    shell.ctx.focus.takeKey("two");
    expect(first, "the channel view follows the focus").toBeGreaterThan(0);
    expect(listening()).toBe(first);
  });
});
