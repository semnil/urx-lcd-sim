import { describe, expect, it } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { UDK_BANKS, UDK_KNOBS, UDK_UNASSIGNED, udkAssignment, udkPath } from "../model/udk";
import { buildRegistry } from "../screens";
import type { NumericSpec } from "../ui/param-spec";
import { Shell } from "./shell";
import type { Route } from "./navigator";

// Nothing in this project draws the unit's physical knobs, so a parameter a
// screen hands to the multi-function knobs has to be turnable on the glass. If
// it is not, the value is stranded: visible and unchangeable.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Mounted {
  shell: Shell;
  store: DeviceStore;
  /** Specs the screen rendered last handed to setKnobs. */
  bound: NumericSpec[];
}

async function mount(): Promise<Mounted> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  const bound: NumericSpec[] = [];
  const inner = shell.ctx.setKnobs;
  shell.ctx.setKnobs = (specs): void => {
    bound.length = 0;
    for (const s of specs) if (s) bound.push(s);
    inner(specs);
  };
  return { shell, store, bound };
}

/** Every control that claims to turn a value, in render order. */
function turnables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('[role="slider"], [role="spinbutton"]')];
}

/**
 * Which of `paths` an arrow press on any rendered control moves. The nodes are
 * collected before the first press: a press repaints, but the listener is bound
 * to the node object, so a detached node still reports for its parameter.
 *
 * Both directions are tried. A parameter sitting on a limit (screen brightness
 * ships at its maximum) is clamped in one direction, and a press that cannot
 * move the value says nothing about whether the control is wired.
 */
function pathsReachedByKeyboard(root: HTMLElement, store: DeviceStore, paths: string[]): Set<string> {
  const reached = new Set<string>();
  for (const node of turnables(root)) {
    for (const key of ["ArrowUp", "ArrowDown"]) {
      if (paths.every((p) => reached.has(p))) break;
      const before = new Map(paths.map((p) => [p, store.num(p, 0)]));
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      for (const p of paths) if (store.num(p, 0) !== before.get(p)) reached.add(p);
    }
  }
  return reached;
}

async function open(shell: Shell, route: Route): Promise<void> {
  shell.ctx.nav.push(route);
  await flush();
}

describe("every knob-bound parameter is reachable on the glass", () => {
  it("turns the HOME strip level, which no knob strip is drawn for", async () => {
    const { shell, store, bound } = await mount();
    // HOME suppresses the knob strip, so re-render it through the patched
    // context to see what it binds.
    await open(shell, { id: "setup" });
    shell.ctx.nav.home();
    await flush();

    const level = bound.find((s) => s.path === "ch.ch1.level");
    expect(level, "HOME binds CH 1 LEVEL to a multi-function knob").toBeDefined();

    const before = store.num("ch.ch1.level", 0);
    expect(pathsReachedByKeyboard(shell.root, store, ["ch.ch1.level"])).toContain("ch.ch1.level");
    expect(store.num("ch.ch1.level", 0)).toBeGreaterThan(before);
  });

  it("keeps turning while a pointer drags, though the screen repaints under it", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "setup" });
    shell.ctx.nav.home();
    await flush();

    const level = [...shell.root.querySelectorAll<HTMLElement>('[role="slider"]')].find(
      (n) => n.getAttribute("aria-label") === "CH 1 LEVEL",
    );
    expect(level, "HOME draws the strip level as a control").toBeDefined();

    const before = store.num("ch.ch1.level", 0);
    level?.dispatchEvent(new MouseEvent("pointerdown", { clientY: 200, bubbles: true }));
    for (let i = 1; i <= 8; i++) {
      // Every turn repaints, which replaces the node the gesture started on.
      await flush();
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 200 - i * 5 }));
    }
    window.dispatchEvent(new MouseEvent("pointerup", {}));

    // A drag that dies with the first repaint moves one step; this one moves eight.
    expect(store.num("ch.ch1.level", 0) - before).toBeGreaterThan(1);
  });

  it("turns a value from the rotary beside its box, not only from the box", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });

    const knobs = [...shell.root.querySelectorAll<HTMLElement>(".knob-graphic.is-control")];
    expect(knobs.length, "the channel view draws a rotary per value").toBeGreaterThan(2);

    const paths = ["ch.ch1.gain", "ch.ch1.pan", "ch.ch1.level"];
    const moved = new Set<string>();
    for (const knob of knobs) {
      const before = new Map(paths.map((p) => [p, store.num(p, 0)]));
      knob.dispatchEvent(new MouseEvent("pointerdown", { clientY: 200, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 190 }));
      window.dispatchEvent(new MouseEvent("pointerup", {}));
      await flush();
      for (const p of paths) if (store.num(p, 0) !== before.get(p)) moved.add(p);
    }
    expect([...moved].sort()).toEqual([...paths].sort());
  });

  it("runs a control from one end of its range to the other in one drag", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    const knob = shell.root.querySelector<HTMLElement>(".cv-gain .knob-graphic.is-control");
    expect(knob, "the channel view draws the head-amp rotary").not.toBeNull();

    const sweep = async (from: number, to: number): Promise<void> => {
      knob?.dispatchEvent(new MouseEvent("pointerdown", { clientY: from, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: to }));
      window.dispatchEvent(new MouseEvent("pointerup", {}));
      await flush();
    };

    // 240 px of travel is more than the range needs, so both ends are reachable
    // without letting go.
    await sweep(400, 160);
    expect(store.num("ch.ch1.gain", 0)).toBe(70);
    await sweep(160, 400);
    expect(store.num("ch.ch1.gain", 0)).toBe(-8);
  });

  it("marks the page while a pointer is turning, so nothing lights up under it", async () => {
    const { shell } = await mount();
    await open(shell, { id: "setup" });
    shell.ctx.nav.home();
    await flush();
    const level = [...shell.root.querySelectorAll<HTMLElement>('[role="slider"]')].find(
      (n) => n.getAttribute("aria-label") === "CH 1 LEVEL",
    );
    const turning = (): boolean => document.documentElement.classList.contains("is-turning");

    for (const ending of ["pointerup", "pointercancel"]) {
      expect(turning()).toBe(false);
      level?.dispatchEvent(new MouseEvent("pointerdown", { clientY: 200, bubbles: true }));
      expect(turning(), "a drag in progress").toBe(true);
      window.dispatchEvent(new MouseEvent(ending, {}));
      expect(turning(), `after ${ending}`).toBe(false);
    }
  });

  it("steps the user-defined knob pages from the ends of the bar", async () => {
    const { shell, store } = await mount();
    await store.set("ui.userDefinedKnobs", true);
    await flush();

    const page = (): string | undefined => shell.root.querySelector(".knob-bank")?.textContent ?? undefined;
    const step = (dir: "prev" | "next"): HTMLElement | null =>
      shell.root.querySelector<HTMLElement>(`.knob-bank-${dir}`);

    expect(page(), "the bar names the page it is showing").toBe("1");
    expect(step("prev"), "nothing before the first page").toBeNull();

    for (const expected of ["2", "3", "4"]) {
      step("next")?.click();
      await flush();
      expect(page()).toBe(expected);
    }
    expect(step("next"), "nothing after the last page").toBeNull();

    step("prev")?.click();
    await flush();
    expect(page()).toBe("3");
    expect(store.num("setup.udk.bank", 1)).toBe(3);
  });

  it("turns what each user-defined knob holds from its division, and nothing from an empty one", async () => {
    const { shell, store } = await mount();
    await store.set("phones.1.level", 5);
    await store.set("ui.userDefinedKnobs", true);
    await flush();
    for (const bank of UDK_BANKS) {
      await store.set("setup.udk.bank", bank);
      await flush();
      const cells = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")];
      expect(cells.length).toBe(UDK_KNOBS.length);
      for (const [i, knob] of UDK_KNOBS.entries()) {
        const spec = udkAssignment(store.str(udkPath(bank, knob), UDK_UNASSIGNED)).spec;
        const cell = cells[i];
        if (!cell) throw new Error(`no division for ${bank}.${knob}`);
        const watched = ["phones.1.level", "phones.2.level", "monitor.1.level", "monitor.2.level", "osc.level", "setup.brightness"];
        const before = new Map(watched.map((p) => [p, store.num(p, 0)]));
        cell.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }));
        const moved = watched.filter((p) => store.num(p, 0) !== before.get(p));
        expect([cell.getAttribute("role"), moved], `${bank}.${knob}`).toEqual(spec ? ["slider", [spec.path]] : [null, []]);
      }
    }

    // Bank 1's A as it ships: Phones 1, by the wheel and by a drag as well.
    await store.set("setup.udk.bank", 1);
    await store.set("phones.1.level", 5);
    await flush();
    const phones = (): HTMLElement => {
      const cell = shell.root.querySelector<HTMLElement>(".knob-cell");
      if (!cell) throw new Error("no division");
      return cell;
    };
    phones().dispatchEvent(new WheelEvent("wheel", { deltaY: -1, bubbles: true, cancelable: true }));
    expect(store.num("phones.1.level", 0)).toBeGreaterThan(5);
    const afterWheel = store.num("phones.1.level", 0);
    phones().dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 60, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 60, bubbles: true }));
    expect(store.num("phones.1.level", 0)).toBeGreaterThan(afterWheel);
    await flush();
    expect(phones().querySelector(".knob-cell-value")?.textContent, "and the division reads the new value").not.toBe("5.0");
  });

  it("holds the user-defined knobs still while 1-knob holds the screen's focus", async () => {
    const { shell, store } = await mount();
    const turn = async (oneKnob: boolean): Promise<number> => {
      await store.set("phones.1.level", 5);
      await store.set("ch.ch1.eq.oneKnob.on", oneKnob);
      await open(shell, { id: "ch.eq", strip: "ch1" });
      await store.set("ui.userDefinedKnobs", true);
      await flush();
      shell.root.querySelector<HTMLElement>(".knob-cell.is-udk")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      return store.num("phones.1.level", 0);
    };
    expect(await turn(false), "with 1-knob off, Phones 1 turns").toBeGreaterThan(5);
    expect(await turn(true), "with 1-knob on, it stays").toBe(5);
  });

  it("makes each filled division of the strip the knob under it", async () => {
    // The bar reads out what the four knobs hold. Nothing draws those knobs, so
    // the division is the only thing left to turn them by.
    const { shell, store, bound } = await mount();
    await open(shell, { id: "monitor.osc" });

    const paths = bound.map((s) => s.path);
    expect(paths.length, "OSCILLATOR binds at least one knob").toBeGreaterThan(0);
    const cells = [...shell.root.querySelectorAll(".knob-cell")];
    expect(cells.length).toBe(4);
    expect(cells.filter((c) => c.getAttribute("role") === "slider").length).toBe(paths.length);
    expect(
      cells.filter((c) => c.classList.contains("is-empty") && c.getAttribute("role") === "slider"),
      "a division with nothing on it turns nothing",
    ).toEqual([]);

    // Each of them moves its own parameter and no other.
    for (const cell of cells.filter((c) => c.getAttribute("role") === "slider")) {
      const before = new Map(paths.map((p) => [p, store.num(p, 0)]));
      cell.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      const moved = paths.filter((p) => store.num(p, 0) !== before.get(p));
      expect(moved.length, cell.getAttribute("aria-label") ?? "").toBe(1);
    }
  });

  it("carries the label band across every division, filled or not", async () => {
    // The bar's band is unbroken on the unit: a division with nothing on it is
    // still part of it, so an empty one keeps the band and drops only the text.
    const { shell } = await mount();
    await open(shell, { id: "monitor.osc" });
    const cells = [...shell.root.querySelectorAll(".knob-cell")];
    expect(cells.length).toBe(4);
    expect(cells.map((c) => c.querySelector(".knob-cell-label") !== null)).toEqual([true, true, true, true]);
    expect(cells.filter((c) => c.classList.contains("is-empty")).length, "OSCILLATOR leaves some unused").toBeGreaterThan(0);
  });

  it("ends the oscillator's mode knobs on the second and its level on the fourth", async () => {
    const labels = (shell: Shell): string[] =>
      [...shell.root.querySelectorAll(".knob-cell")].map((c) => c.querySelector(".knob-cell-label")?.textContent ?? "");

    const { shell, store, bound } = await mount();
    await open(shell, { id: "monitor.osc" });
    expect(bound.map((s) => s.path)).toEqual(["osc.frequency", "osc.level"]);
    expect(labels(shell), "one parameter, so it lands on the second").toEqual(["", "Frequency", "", "Level"]);

    await store.set("osc.mode", "Burst Noise");
    await flush();
    expect(bound.map((s) => s.path)).toEqual(["osc.width", "osc.interval", "osc.level"]);
    expect(labels(shell), "two, so they fill up to the second").toEqual(["Width", "Interval", "", "Level"]);

    await store.set("osc.mode", "Pink Noise");
    await flush();
    expect(labels(shell), "none, so only the level").toEqual(["", "", "", "Level"]);
  });

  it("shows the analog head amp only while the channel is on a MIC/LINE connector", async () => {
    const head = (shell: Shell): { label: string; flags: string[] } => ({
      label: shell.root.querySelector(".cv-gain .cv-caption")?.textContent ?? "",
      // A mark drawn instead of a letter goes by its label.
      flags: [...shell.root.querySelectorAll(".cv-gain-flags .flag")].map((n) => n.getAttribute("aria-label") ?? n.textContent ?? ""),
    });

    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    // Four cells, two to a row, as the unit lays them out. CH 1 is not on a
    // high-impedance connector, so that cell stands empty.
    expect(head(shell)).toEqual({ label: "A.Gain", flags: ["+48V", "Φ", "HPF", ""] });

    // Phantom power is the analog head amp's, so it goes when the source does,
    // leaving its cell empty rather than moving the two that stay.
    await store.set("ch.ch1.source", "USB DAW 1/2");
    await flush();
    expect(head(shell)).toEqual({ label: "D.Gain", flags: ["", "Φ", "HPF", ""] });

    await store.set("ch.ch1.source", "MIC/LINE 1/2");
    await flush();
    expect(head(shell).label).toBe("A.Gain");

    // HI-Z belongs to the connector, not to every mono channel: on a URX44V it
    // is CH 3 and CH 4 that take a high-impedance source.
    await open(shell, { id: "channel-view", strip: "ch3" });
    expect(head(shell).flags).toEqual(["+48V", "\u03a6", "HPF", "HI-Z"]);
    expect([...shell.root.querySelectorAll(".cv-gain-flags .flag")].length, "the panel keeps its four cells").toBe(4);
  });

  it("prints the head amp in whole dB with a sign, as the unit does", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    const box = (): string => shell.root.querySelector(".cv-gain-stack .value-box")?.textContent ?? "";
    const bar = (): string => shell.root.querySelector(".knob-cell-value")?.textContent ?? "";

    await store.set("ch.ch1.gain", 14);
    await flush();
    expect([box(), bar()], "over zero it carries a plus").toEqual(["+14", "+14dB"]);

    await store.set("ch.ch1.gain", 0);
    await flush();
    expect([box(), bar()], "zero carries none").toEqual(["0", "0dB"]);

    await store.set("ch.ch1.gain", -8);
    await flush();
    expect([box(), bar()]).toEqual(["-8", "-8dB"]);

    // The fader beside it keeps its two decimals.
    expect(shell.root.querySelector(".cv-level .value-box")?.textContent).toBe("0.00");
  });

  it("gives each kind of channel the processing its strip carries", async () => {
    const blocks = async (strip: string): Promise<string[]> => {
      const { shell } = await mount();
      await open(shell, { id: "channel-view", strip });
      return [...shell.root.querySelectorAll(".cv-block .badge, .cv-block .cv-block-name")].map((n) => n.textContent ?? "");
    };
    // GATE and COMP belong to a mono channel, DUCKER to a stereo input, DELAY to
    // the streaming bus. An EQ goes to the inputs, the mixes and the stereo bus;
    // an insert to the mono channels, the mixes and the stereo bus. An FX channel
    // carries neither, and names the effect it is instead.
    expect(await blocks("ch1")).toEqual(["GATE", "COMP", "EQ", "INS FX"]);
    expect(await blocks("ch_5_6"), "no insert on a stereo input").toEqual(["EQ", "DUCKER"]);
    expect(await blocks("fx1"), "an FX channel names itself and its effect").toEqual(["FX1"]);
    expect(await blocks("bus.mix1")).toEqual(["EQ", "INS FX"]);
    expect(await blocks("bus.stereo")).toEqual(["EQ", "INS FX"]);
    expect(await blocks("bus.stream"), "the streaming bus carries only its delay").toEqual(["DELAY"]);
  });

  it("keeps the input meter where it stands whether or not the strip has a head amp", async () => {
    // What stands above and left of the meter: the caption's line, then the
    // stack's column. Both keep their room when empty (the style rules pin that).
    const column = (shell: Shell): string[] => {
      const gain = shell.root.querySelector(".cv-gain");
      const caption = gain?.querySelector(":scope > .cv-caption");
      const row = [...(gain?.querySelector(".cv-gain-row")?.children ?? [])];
      return [caption, ...row].map((n) => n?.classList[0] ?? "");
    };

    const { shell } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    expect(shell.root.querySelector(".cv-gain .cv-caption")?.textContent, "an input channel has one").toBe("A.Gain");
    const onChannel = column(shell);
    expect(onChannel, "the meter is drawn beside the stack").toEqual(["cv-caption", "cv-gain-stack", "meter"]);

    const bus = await mount();
    await open(bus.shell, { id: "channel-view", strip: "bus.mix1" });
    expect(bus.shell.root.querySelector(".cv-gain .cv-caption")?.textContent, "a bus has no head amp to name").toBe("");
    expect(bus.shell.root.querySelector(".cv-gain-stack")?.childElementCount, "nor a gain to show").toBe(0);
    expect(bus.shell.root.querySelector(".cv-gain-buttons"), "and no AUTO / SAFE").toBeNull();
    expect(column(bus.shell), "but the meter stands in the same place").toEqual(onChannel);
    expect(bus.bound.map((s) => s.path), "nor a gain on the knobs").toEqual([
      "ch.bus.mix1.balance",
      "ch.bus.mix1.level",
    ]);
  });

  it("offers only the settings a channel's routing gives it", async () => {
    const controls = async (strip: string): Promise<string[]> => {
      const { shell } = await mount();
      await open(shell, { id: "channel-view", strip });
      const names: string[] = [];
      if (shell.root.querySelector(".cv-sendto")) names.push("SEND TO");
      for (const cell of shell.root.querySelectorAll(".cv-param .cv-caption")) names.push(cell.textContent ?? "");
      for (const btn of shell.root.querySelectorAll(".cv-onoff .btn")) names.push(btn.textContent ?? "");
      return names;
    };
    // A SEND TO needs a send to STEREO (channels, FX, MIX). The streaming bus is
    // the one with no position, no level and no on/off.
    expect(await controls("ch1")).toEqual(["SEND TO", "PAN", "LEVEL", "CUE", "ON"]);
    expect(await controls("fx1")).toEqual(["SEND TO", "BALANCE", "LEVEL", "CUE", "ON"]);
    expect(await controls("bus.mix1")).toEqual(["SEND TO", "BALANCE", "LEVEL", "CUE", "ON"]);
    expect(await controls("bus.stereo"), "the stereo bus is what the others send to").toEqual([
      "BALANCE",
      "LEVEL",
      "CUE",
      "ON",
    ]);
    expect(await controls("bus.stream"), "the streaming bus only listens").toEqual(["CUE"]);
  });

  it("stands each oscillator box under the knob that turns it", async () => {
    const boxes = (shell: Shell): string[] =>
      [...shell.root.querySelectorAll(".osc-params > *")].map((n) => n.querySelector(".param-caption")?.textContent ?? "");

    const { shell, store } = await mount();
    await open(shell, { id: "monitor.osc" });
    // Two columns wide, so a lone parameter is preceded by an empty one and
    // lands under the second knob.
    expect(boxes(shell)).toEqual(["", "Frequency"]);
    expect(shell.root.querySelector(".osc-output")?.textContent).toContain("ON");
    expect(shell.root.querySelector(".osc-output")?.textContent).toContain("Level");
    expect(shell.root.querySelector(".osc-params")?.textContent, "Level is not among them").not.toContain("Level");

    await store.set("osc.mode", "Burst Noise");
    await flush();
    expect(boxes(shell)).toEqual(["Width", "Interval"]);
  });

  it("draws the readout strip only on the screens that carry no value of their own", async () => {
    // MONITOR and PHONES print each bus's level beside its rotary, so the strip
    // beneath them would repeat what is already on the screen.
    for (const id of ["monitor.level", "monitor.phones"]) {
      const { shell } = await mount();
      await open(shell, { id });
      expect(shell.root.querySelectorAll(".knob-cell").length, `${id} draws no readout strip`).toBe(0);
    }
    const { shell } = await mount();
    await open(shell, { id: "monitor.osc" });
    expect(shell.root.querySelectorAll(".knob-cell").length, "OSCILLATOR draws one").toBeGreaterThan(0);
  });

  it("hands the knobs nothing on a tab that shows no level", async () => {
    const { shell, store, bound } = await mount();
    await open(shell, { id: "monitor.level" });
    expect(bound.map((s) => s.path), "the Level tab binds the bus levels").toEqual([
      "monitor.1.level",
      "monitor.2.level",
    ]);

    // setKnobs is what fills this, so empty it first: what it holds afterwards is
    // what the Setting tab handed over.
    bound.length = 0;
    await store.set("ui.monitorTab", "Setting");
    await flush();
    expect(bound, "the Setting tab has no level control to reach them with").toEqual([]);
  });

  // One strip of each kind: what a channel screen draws depends on it, so a
  // single mono channel would leave the stereo, FX and bus faces unswept.
  const STRIPS = ["ch1", "ch_5_6", "fx1", "bus.stereo"];

  it("strands no knob-bound parameter on any screen", async () => {
    const registry = buildRegistry();
    const stranded: string[] = [];
    for (const id of registry.ids()) {
      for (const strip of STRIPS) {
        const { shell, store, bound } = await mount();
        // The channel screens are scoped to a strip; the rest ignore the field.
        await open(shell, { id, strip });
        const paths = bound.map((s) => s.path);
        if (paths.length === 0) continue;
        const reached = pathsReachedByKeyboard(shell.root, store, paths);
        for (const p of paths) if (!reached.has(p)) stranded.push(`${id} (${strip}): ${p}`);
      }
    }
    expect(stranded).toEqual([]);
  });

  it("keeps every value the unit ships inside the range its control offers", async () => {
    // A control whose range is narrower than the unit's pins the value at an end
    // and refuses to reach the rest of it, which is what a wrong min or max
    // looks like from the glass.
    const registry = buildRegistry();
    const outside: string[] = [];
    let checked = 0;
    for (const id of registry.ids()) {
      for (const strip of STRIPS) {
        const { shell } = await mount();
        await open(shell, { id, strip });
        for (const node of turnables(shell.root)) {
          const min = Number(node.getAttribute("aria-valuemin"));
          const max = Number(node.getAttribute("aria-valuemax"));
          const now = Number(node.getAttribute("aria-valuenow"));
          if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(now)) continue;
          checked += 1;
          if (now < min || now > max) {
            outside.push(`${id} (${strip}): ${node.getAttribute("aria-label")} = ${now}, range ${min}..${max}`);
          }
        }
      }
    }
    expect(checked, "the sweep found controls to check").toBeGreaterThan(30);
    expect(outside).toEqual([]);
  });

  it("finds screens that bind knobs at all, so the sweep cannot pass vacuously", async () => {
    const registry = buildRegistry();
    let binding = 0;
    for (const id of registry.ids()) {
      const { shell, bound } = await mount();
      await open(shell, { id, strip: "ch1" });
      if (bound.length > 0) binding += 1;
    }
    expect(binding).toBeGreaterThan(3);
  });
});
