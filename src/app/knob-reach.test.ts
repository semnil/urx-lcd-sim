import { describe, expect, it } from "vitest";
import type { ParamPath } from "../device/path";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { UDK_BANKS, UDK_KNOBS, UDK_UNASSIGNED, udkAssignment, udkPath } from "../model/udk";
import { buildRegistry } from "../screens";
import type { NumericSpec } from "../ui/param-spec";
import { snapshot } from "./persist";
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

async function mount(leftOut: ParamPath[] = []): Promise<Mounted> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  const state = factoryState(model);
  for (const path of leftOut) state.delete(path);
  await store.attach(new SimTransport(state));
  const shell = new Shell(buildRegistry(), store, model);
  const bound: NumericSpec[] = [];
  const inner = shell.ctx.setKnobs;
  shell.ctx.setKnobs = (specs): void => {
    bound.length = 0;
    // A readout names no value to turn.
    for (const s of specs) if (s && "path" in s) bound.push(s);
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

  it("leaves a value as it is under a press that moves less than 4 px, and counts a drag from 4 px off the press", async () => {
    // CH 5/6's DUCKER Decay is left out of what the unit holds, for the press on a value it has not been given.
    const { shell, store } = await mount(["ch.ch_5_6.ducker.decay"]);
    await open(shell, { id: "channel-view", strip: "ch1" });
    const pe = (type: string, x: number, y: number): MouseEvent =>
      new MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true });
    /** The value at `path` after a press at (200, 150) on `find`, moved by each of `moves` in turn and let go. */
    const gesture = async (find: string, path: string, moves: [number, number][]): Promise<number> => {
      const node = shell.root.querySelector(find);
      if (!node) throw new Error(`no ${find}`);
      node.dispatchEvent(pe("pointerdown", 200, 150));
      for (const [dx, dy] of moves) window.dispatchEvent(pe("pointermove", 200 + dx, 150 + dy));
      window.dispatchEvent(pe("pointerup", 200, 150));
      await flush();
      return store.num(path, NaN);
    };
    // The values as they ship, each of which a pixel of a drag moves, so a press that turned them inside the slop
    // would show.
    const controls = [
      { route: { id: "ch.eq", strip: "ch1" }, find: ".eq-grip[aria-label='LOW band']", path: "ch.ch1.eq.low.freq", along: [1, 0], from: 125 },
      { route: { id: "ch.eq", strip: "ch1" }, find: ".eq-grip[aria-label='LOW MID band']", path: "ch.ch1.eq.lowMid.freq", along: [1, 0], from: 1000 },
      { route: { id: "ch.gate", strip: "ch1" }, find: ".value-box[aria-label='Hold']", path: "ch.ch1.gate.hold", along: [0, -1], from: 15.3 },
      { route: { id: "ch.gate", strip: "ch1" }, find: ".value-box[aria-label='Attack']", path: "ch.ch1.gate.attack", along: [0, -1], from: 20.17 },
    ] as const;
    for (const c of controls) {
      await open(shell, c.route);
      const [ax, ay] = c.along;
      const taps: Record<string, [number, number][]> = {
        "still": [[0, 0]],
        "1 px along": [[ax, ay]],
        "1 px across": [[ay, ax]],
        "3 px along and back": [[ax * 3, ay * 3], [-ax * 3, -ay * 3]],
        "4 px along": [[ax * 4, ay * 4]],
      };
      for (const [name, moves] of Object.entries(taps)) {
        await store.set(c.path, c.from);
        expect(await gesture(c.find, c.path, moves), `${c.path} ${name}`).toBe(c.from);
      }
      // 4 px is a drag: back at the press, it has turned the value 4 px the other way from the edge it passed.
      await store.set(c.path, c.from);
      expect(await gesture(c.find, c.path, [[ax * 4, ay * 4], [0, 0]]), `${c.path} 4 px along and back`).not.toBe(c.from);

      // A drag of 30 px counts the 26 px past the slop, wherever the pointer passed it.
      await store.set(c.path, c.from);
      const once = await gesture(c.find, c.path, [[ax * 30, ay * 30]]);
      await store.set(c.path, c.from);
      const fromTheEdge = await gesture(c.find, c.path, [[ax * 4, ay * 4], [ax * 30, ay * 30]]);
      await store.set(c.path, c.from);
      const byTens = await gesture(c.find, c.path, [[ax * 10, ay * 10], [ax * 20, ay * 20], [ax * 30, ay * 30]]);
      expect(once, `${c.path} 30 px`).not.toBe(c.from);
      expect([fromTheEdge, byTens], `${c.path} 30 px passing the slop at 4 px and at 10 px`).toEqual([once, once]);
      // A drag let back to the edge of the slop puts the value back where it stood.
      await store.set(c.path, c.from);
      expect(await gesture(c.find, c.path, [[ax * 30, ay * 30], [ax * 4, ay * 4]]), `${c.path} 30 px and back to 4 px`).toBe(c.from);
    }
    // The 30 px drags count 26 px: LOW's Freq. from 125 Hz runs 26/192 of its three decades.
    await open(shell, { id: "ch.eq", strip: "ch1" });
    await store.set("ch.ch1.eq.low.freq", 125);
    expect(await gesture(".eq-grip[aria-label='LOW band']", "ch.ch1.eq.low.freq", [[30, 0]])).toBe(319);

    // A press of 4 px, to the edge of the slop and no further, leaves the unit as the browser stores it, a value
    // the unit has not been given included.
    await open(shell, { id: "ch.ducker", strip: "ch_5_6" });
    expect(store.has("ch.ch_5_6.ducker.decay"), "DUCKER's Decay as it is held").toBe(false);
    const stored = snapshot(store);
    await gesture("[aria-label^='D handle']", "ch.ch_5_6.ducker.decay", [[4, 0]]);
    expect([store.has("ch.ch_5_6.ducker.decay"), snapshot(store)]).toEqual([false, stored]);

    // Shift taken or let go inside the slop runs the drag from the slop's edge, as Shift held or not from the press.
    await open(shell, { id: "monitor.osc" });
    const level = async (downShift: boolean, moves: [number, boolean][]): Promise<number> => {
      await store.set("osc.level", -14);
      await flush();
      const node = turnables(shell.root).find((n) => n.getAttribute("aria-label") === "Level");
      if (!node) throw new Error("no Level");
      node.dispatchEvent(new MouseEvent("pointerdown", { clientY: 200, shiftKey: downShift, bubbles: true }));
      for (const [dy, shiftKey] of moves) window.dispatchEvent(new MouseEvent("pointermove", { clientY: 200 + dy, shiftKey }));
      window.dispatchEvent(new MouseEvent("pointerup", {}));
      await flush();
      return store.num("osc.level", NaN);
    };
    // 20 px down counts 16 px: 8 dB, or a fifth of that with Shift.
    expect([await level(true, [[20, true]]), await level(false, [[20, false]])], "Shift held and not").toEqual([-15.6, -22]);
    expect(await level(false, [[2, true], [20, true]]), "Shift taken inside the slop").toBe(-15.6);
    expect(await level(true, [[2, false], [20, false]]), "Shift let go inside the slop").toBe(-22);
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

  it("covers a fifth as much of the range in a drag with Shift held, and goes on from where the value stands as Shift is let go", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    const knob = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".cv-gain .knob-graphic.is-control");
    const gain = (): number => store.num("ch.ch1.gain", 0);
    const from = async (value: number, shiftKey: boolean): Promise<void> => {
      await store.set("ch.ch1.gain", value);
      await flush();
      knob()?.dispatchEvent(new MouseEvent("pointerdown", { clientY: 400, shiftKey, bubbles: true }));
    };
    const move = async (clientY: number, shiftKey: boolean): Promise<number> => {
      window.dispatchEvent(new MouseEvent("pointermove", { clientY, shiftKey }));
      await flush();
      return gain();
    };
    const end = async (): Promise<void> => {
      window.dispatchEvent(new MouseEvent("pointerup", {}));
      await flush();
    };

    // The same 160px drag covers a fifth as much with Shift held: 13 of the head amp's 78 dB, on its whole dB.
    await from(-8, false);
    const plain = (await move(240, false)) + 8;
    await end();
    await from(-8, true);
    const fine = (await move(240, true)) + 8;
    // Let go of Shift at 240: the value stays at 5 dB, and the next 32px cover 13 dB from there.
    const letGo = await move(240, false);
    const onward = await move(208, false);
    await end();
    expect(fine, `a fifth of the ${plain} dB the plain drag covers`).toBe(Math.round(plain / 5));
    expect([fine, letGo, onward]).toEqual([13, 5, 18]);
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

  it("turns a value by the main button's drag, and by the pointer that took it alone", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    const pan = (): number => store.num("ch.ch1.pan", NaN);
    const box = (): HTMLElement | undefined =>
      turnables(shell.root).find((n) => n.classList.contains("value-box") && n.getAttribute("aria-label") === "PAN");
    const turning = (): boolean => document.documentElement.classList.contains("is-turning");
    const pe = (type: string, init: PointerEventInit): PointerEvent => new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
    expect(pan()).toBe(0);

    // The right button starts no drag, so the mouse moving on with it held turns nothing.
    box()?.dispatchEvent(pe("pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, buttons: 2, clientY: 300 }));
    expect(turning(), "the right button").toBe(false);
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 2, clientY: 250 }));
    window.dispatchEvent(pe("pointerup", { pointerId: 1, pointerType: "mouse", button: 2, clientY: 250 }));
    await flush();
    expect(pan(), "the right button").toBe(0);

    // A second finger neither turns the value the first holds nor ends its drag.
    box()?.dispatchEvent(pe("pointerdown", { pointerId: 1, pointerType: "touch", buttons: 1, clientY: 300 }));
    window.dispatchEvent(pe("pointermove", { pointerId: 2, pointerType: "touch", buttons: 1, clientY: 200 }));
    window.dispatchEvent(pe("pointercancel", { pointerId: 2, pointerType: "touch" }));
    await flush();
    expect([pan(), turning()], "a second finger's move and cancel").toEqual([0, true]);
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "touch", buttons: 1, clientY: 250 }));
    await flush();
    expect(pan(), "the first finger goes on turning it").toBeGreaterThan(0);
    window.dispatchEvent(pe("pointerup", { pointerId: 1, pointerType: "touch", clientY: 250 }));
    expect(turning(), "the first finger let go").toBe(false);

    // A mouse that comes back with no button held was let go where the page did not hear it.
    await store.set("ch.ch1.pan", 0);
    await flush();
    box()?.dispatchEvent(pe("pointerdown", { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientY: 300 }));
    expect(turning(), "the main button").toBe(true);
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 0, clientY: 250 }));
    await flush();
    expect([pan(), turning()], "a hover with no button held").toEqual([0, false]);
    window.dispatchEvent(pe("pointermove", { pointerId: 1, pointerType: "mouse", buttons: 1, clientY: 200 }));
    await flush();
    expect(pan(), "after the drag ended").toBe(0);
  });

  it("turns two values apart under two fingers that drag them at once", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "setup" });
    shell.ctx.nav.home();
    await flush();
    const level = (ch: number): HTMLElement | undefined =>
      turnables(shell.root).find((n) => n.getAttribute("aria-label") === `CH ${ch} LEVEL`);
    const value = (ch: number): number => store.num(`ch.ch${ch}.level`, NaN);
    const finger = (node: EventTarget | undefined, type: string, pointerId: number, clientY: number): void => {
      const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
      node?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "touch", button: 0, buttons, clientY }));
    };
    const [one, two] = [value(1), value(2)];

    finger(level(1), "pointerdown", 1, 300);
    finger(level(2), "pointerdown", 2, 300);
    finger(window, "pointermove", 2, 280);
    await flush();
    expect([value(1), value(2) > two], "the second finger's move turns its own value alone").toEqual([one, true]);
    finger(window, "pointerup", 2, 280);
    const second = value(2);
    finger(window, "pointermove", 1, 290);
    await flush();
    expect([value(1) > one, value(2)], "the first finger goes on after the second is let go").toEqual([true, second]);
    finger(window, "pointerup", 1, 290);
  });

  it("leaves a value to the finger that took it until that finger is let go", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "setup" });
    shell.ctx.nav.home();
    await flush();
    const level = (ch: number): HTMLElement | undefined =>
      turnables(shell.root).find((n) => n.getAttribute("aria-label") === `CH ${ch} LEVEL`);
    const value = (ch: number): number => store.num(`ch.ch${ch}.level`, NaN);
    const finger = (node: EventTarget | undefined, type: string, pointerId: number, clientY: number): void => {
      const buttons = type === "pointerdown" || type === "pointermove" ? 1 : 0;
      node?.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId, pointerType: "touch", button: 0, buttons, clientY }));
    };
    const [one, two] = [value(1), value(2)];

    // A second finger pressed on CH 1 LEVEL while the first holds it turns nothing, and its lift ends nothing.
    finger(level(1), "pointerdown", 1, 300);
    finger(level(1), "pointerdown", 2, 300);
    finger(window, "pointermove", 2, 100);
    await flush();
    expect(value(1), "a second finger on the value the first holds").toBe(one);
    finger(window, "pointerup", 2, 100);
    finger(window, "pointermove", 1, 290);
    await flush();
    const turned = value(1);
    expect(turned, "the first finger goes on turning it").toBeGreaterThan(one);

    // A second finger on another value turns that one.
    finger(level(2), "pointerdown", 3, 300);
    finger(window, "pointermove", 3, 290);
    await flush();
    expect(value(2), "a second finger on another value").toBeGreaterThan(two);
    finger(window, "pointerup", 3, 290);
    finger(window, "pointerup", 1, 290);

    // Once the first finger is let go, the next finger takes the value.
    finger(level(1), "pointerdown", 4, 300);
    finger(window, "pointermove", 4, 310);
    await flush();
    expect(value(1), "the next finger").toBeLessThan(turned);
    finger(window, "pointerup", 4, 310);

    // A linked pair holds one level, so a second finger on the other channel's turns nothing while the first holds it.
    await store.set("ch.ch1.signalType", "STEREO");
    await store.set("ch.ch2.signalType", "STEREO");
    await flush();
    const paired = [value(1), value(2)];
    finger(level(1), "pointerdown", 5, 300);
    finger(level(2), "pointerdown", 6, 300);
    finger(window, "pointermove", 6, 100);
    await flush();
    expect([value(1), value(2)], "a second finger on the linked channel").toEqual(paired);
    finger(window, "pointerup", 6, 100);
    finger(window, "pointermove", 5, 290);
    await flush();
    expect(value(2), "the first finger turns the pair").toBe(value(1));
    expect(value(1), "the first finger turns the pair").toBeGreaterThan(paired[0] ?? NaN);
    finger(window, "pointerup", 5, 290);
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

  it("turns a value down by the wheel turned down and up by the wheel turned up, and as far as an arrow key with Shift held", async () => {
    const { shell, store } = await mount();
    await open(shell, { id: "channel-view", strip: "ch1" });
    const box = (): HTMLElement | null => shell.root.querySelector<HTMLElement>('.cv-gain [role="spinbutton"]');
    expect(box(), "the channel view draws the head amp's value box").not.toBeNull();
    const wheel = async (deltaY: number, shiftKey = false): Promise<number> => {
      box()?.dispatchEvent(new WheelEvent("wheel", { deltaY, deltaMode: WheelEvent.DOM_DELTA_LINE, shiftKey, bubbles: true, cancelable: true }));
      await flush();
      return store.num("ch.ch1.gain", 0);
    };
    await store.set("ch.ch1.gain", 30);
    await flush();
    expect([await wheel(3), await wheel(3), await wheel(-3)]).toEqual([29, 28, 29]);

    /** How far one turn with Shift held takes the head amp up from 30 dB. */
    const shifted = async (turn: () => Promise<number>): Promise<number> => {
      await store.set("ch.ch1.gain", 30);
      await flush();
      return (await turn()) - 30;
    };
    const byKey = await shifted(async () => {
      box()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", shiftKey: true, bubbles: true, cancelable: true }));
      await flush();
      return store.num("ch.ch1.gain", 0);
    });
    expect(byKey, "the up arrow with Shift turns it up").toBeGreaterThan(0);
    expect(await shifted(() => wheel(-3, true)), "the wheel up with Shift, as far as the up arrow with Shift").toBe(byKey);
  });

  it("turns a value by the wheel's up and down only, and leaves a sideways scroll to the page", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.gain", 30);
    const level = (): HTMLElement | undefined =>
      turnables(shell.root).find((n) => n.getAttribute("aria-label") === "CH 1 LEVEL");
    const gain = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".cv-gain-stack .value-box");
    const roll = async (node: HTMLElement | null | undefined, init: WheelEventInit): Promise<boolean> => {
      if (!node) throw new Error("no control");
      const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init });
      node.dispatchEvent(ev);
      await flush();
      return ev.defaultPrevented;
    };
    const sideways: WheelEventInit[] = [
      { deltaX: -120, deltaY: 0 },
      { deltaX: 120, deltaY: 0 },
      { deltaX: -120, deltaY: 0, shiftKey: true },
      { deltaX: 120, deltaY: 0, shiftKey: true },
    ];

    await open(shell, { id: "setup" });
    shell.ctx.nav.home();
    await flush();
    for (const init of sideways) {
      expect(await roll(level(), init), `HOME level ${JSON.stringify(init)} keeps the page's scroll`).toBe(false);
      expect(store.num("ch.ch1.level", NaN), JSON.stringify(init)).toBe(0);
    }
    expect(await roll(level(), { deltaY: -120 }), "the wheel up turns it").toBe(true);
    expect(store.num("ch.ch1.level", NaN)).toBeGreaterThan(0);

    await open(shell, { id: "channel-view", strip: "ch1" });
    for (const init of sideways) {
      expect(await roll(gain(), init), `A.Gain ${JSON.stringify(init)} keeps the page's scroll`).toBe(false);
      expect(store.num("ch.ch1.gain", NaN), JSON.stringify(init)).toBe(30);
    }
    expect(await roll(gain(), { deltaY: -120 }), "the wheel up turns it").toBe(true);
    expect(store.num("ch.ch1.gain", NaN), "one detent").toBe(31);
  });

  it("leaves the keys held with Alt, Cmd or Ctrl to the browser", async () => {
    const { shell, store } = await mount();
    /** One keydown on the control named `label`; whether the page took it. */
    const press = async (label: string, key: string, init: KeyboardEventInit = {}): Promise<boolean> => {
      const node = turnables(shell.root).find((n) => n.getAttribute("aria-label") === label);
      if (!node) throw new Error(`no ${label}`);
      const ev = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init });
      node.dispatchEvent(ev);
      await flush();
      return ev.defaultPrevented;
    };
    const held: KeyboardEventInit[] = [{ altKey: true }, { metaKey: true }, { ctrlKey: true }];

    for (const init of held) {
      for (const key of ["ArrowLeft", "End"]) {
        expect(await press("CH 1 LEVEL", key, init), `HOME level ${key} ${JSON.stringify(init)}`).toBe(false);
        expect(store.num("ch.ch1.level", NaN), `${key} ${JSON.stringify(init)}`).toBe(0);
      }
    }
    expect(await press("CH 1 LEVEL", "ArrowLeft"), "the arrow alone turns it").toBe(true);
    expect(store.num("ch.ch1.level", NaN)).toBe(-0.4);
    expect(await press("CH 1 LEVEL", "ArrowLeft", { shiftKey: true }), "and with Shift, the one detent it turns without").toBe(true);
    expect(store.num("ch.ch1.level", NaN)).toBe(-1.2);

    await open(shell, { id: "setup.brightness" });
    for (const init of held) {
      expect(await press("Screen", "ArrowLeft", init), `Screen ${JSON.stringify(init)}`).toBe(false);
      expect(store.num("setup.brightness", NaN), JSON.stringify(init)).toBe(10);
    }
    expect(await press("Screen", "ArrowLeft"), "the arrow alone turns it").toBe(true);
    expect(store.num("setup.brightness", NaN)).toBe(9);
  });

  it("lands the keys and the wheel on the value's own steps, as a drag does", async () => {
    const control = (shell: Shell, label: string): HTMLElement => {
      const node = turnables(shell.root).find((n) => n.getAttribute("aria-label") === label);
      if (!node) throw new Error(`no ${label}`);
      return node;
    };
    const press = async (shell: Shell, label: string, key: string, times: number): Promise<void> => {
      for (let i = 0; i < times; i++) {
        control(shell, label).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
        await flush();
      }
    };
    const roll = async (shell: Shell, label: string, deltaY: number, times: number): Promise<void> => {
      for (let i = 0; i < times; i++) {
        control(shell, label).dispatchEvent(new WheelEvent("wheel", { deltaY, bubbles: true, cancelable: true }));
        await flush();
      }
    };

    // OSCILLATOR's Level moves 0.2 dB a detent from the -14 dB it ships at.
    const osc = await mount();
    await open(osc.shell, { id: "monitor.osc" });
    await press(osc.shell, "Level", "ArrowUp", 70);
    expect([osc.store.num("osc.level", NaN), control(osc.shell, "Level").textContent], "70 detents up").toEqual([0, "0.00"]);
    await press(osc.shell, "Level", "ArrowUp", 1);
    expect(osc.store.num("osc.level", NaN), "and the top holds").toBe(0);
    await press(osc.shell, "Level", "ArrowDown", 50);
    expect([osc.store.num("osc.level", NaN), control(osc.shell, "Level").textContent], "50 down from 0 dB").toEqual([-10, "-10.0"]);
    await roll(osc.shell, "Level", -100, 50);
    expect([osc.store.num("osc.level", NaN), control(osc.shell, "Level").textContent], "and 50 back up on the wheel").toEqual([0, "0.00"]);
    // A drag counts nothing for the first 4 px from the press. 9 px from -14 dB counts the 5 px past them,
    // 2.5 dB of the range, and takes the nearest step.
    await osc.store.set("osc.level", -14);
    await flush();
    control(osc.shell, "Level").dispatchEvent(new MouseEvent("pointerdown", { clientY: 200, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: 204 }));
    expect(osc.store.num("osc.level", NaN), "a drag of 4 px").toBe(-14);
    window.dispatchEvent(new MouseEvent("pointermove", { clientY: 209 }));
    window.dispatchEvent(new MouseEvent("pointerup", {}));
    expect(osc.store.num("osc.level", NaN), "a drag of 9 px").toBe(-16.4);

    // Compander-H's Gain moves 0.1 dB a detent from 0 dB.
    const comp = await mount();
    await open(comp.shell, { id: "channel-view", strip: "ch1" });
    await open(comp.shell, { id: "ch.insfx", strip: "ch1" });
    comp.shell.root.querySelector<HTMLElement>(".insfx-effect")?.click();
    await flush();
    [...comp.shell.root.querySelectorAll<HTMLElement>(".source-sheet .source-btn")].find((b) => b.textContent === "Compander-H")?.click();
    await flush();
    expect(comp.store.str("ch.ch1.insFx.effect", ""), "the sheet picked it").toBe("Compander-H");
    expect(comp.store.num("ch.ch1.insFx.gain", NaN)).toBe(0);
    await press(comp.shell, "Gain", "ArrowDown", 3);
    await press(comp.shell, "Gain", "ArrowUp", 3);
    expect(comp.store.num("ch.ch1.insFx.gain", NaN), "three down and three up").toBe(0);
    expect([control(comp.shell, "Gain").getAttribute("aria-valuenow"), control(comp.shell, "Gain").getAttribute("aria-valuetext")]).toEqual([
      "0",
      "0.0dB",
    ]);
    await press(comp.shell, "Gain", "ArrowDown", 3);
    expect([comp.store.num("ch.ch1.insFx.gain", NaN), control(comp.shell, "Gain").getAttribute("aria-valuenow")], "three down").toEqual([-0.3, "-0.3"]);
  });

  /**
   * The gains the unit's knob turns 1 dB a detent, and 0.1 dB a detent while it is pushed in as it turns (URX44V, the
   * operator, 2026-10-03): each EQ band's on a channel, a MIX bus and STEREO, COMP's, and SSMCS's side chain's, bands'
   * and output's. `setup` puts the screen on the value.
   */
  const FINE_GAINS: { route: Route; setup: [string, string][]; label: string; path: string; range: [number, number] }[] = [
    ...["ch1", "bus.mix1", "bus.stereo"].flatMap((strip) =>
      [["low", "LOW"], ["lowMid", "L-MID"], ["highMid", "H-MID"], ["high", "HIGH"]].map(([key, box]) => ({
        route: { id: "ch.eq", strip },
        setup: [["ui.eqBand", key ?? ""]] as [string, string][],
        label: `${box} Gain`,
        path: `ch.${strip}.eq.${key}.gain`,
        range: [-18, 18] as [number, number],
      })),
    ),
    { route: { id: "ch.comp", strip: "ch1" }, setup: [], label: "Gain", path: "ch.ch1.comp.gain", range: [0, 18] },
    { route: { id: "ch.ssmcs.sc", strip: "ch1" }, setup: [["ch.ch1.compEqOrder", "SSMCS"]], label: "SC-Gain", path: "ch.ch1.ssmcs.sc.gain", range: [-18, 18] },
    ...[["low", "Low"], ["mid", "Mid"], ["high", "High"]].map(([key, label]) => ({
      route: { id: "ch.ssmcs.eq", strip: "ch1" },
      setup: [["ch.ch1.compEqOrder", "SSMCS"], ["ui.ssmcsBand", key ?? ""]] as [string, string][],
      label: `${label} Gain`,
      path: `ch.ch1.ssmcs.eq.${key}.gain`,
      range: [-18, 18] as [number, number],
    })),
    { route: { id: "ch.ssmcs", strip: "ch1" }, setup: [["ch.ch1.compEqOrder", "SSMCS"]], label: "Out Gain", path: "ch.ch1.ssmcs.outGain", range: [-18, 18] },
  ];

  /** The screen `gain` is set on, and the first control on it that names the gain. */
  async function onGain(gain: (typeof FINE_GAINS)[number]): Promise<{ shell: Shell; store: DeviceStore; node: () => HTMLElement }> {
    const { shell, store } = await mount();
    for (const [path, value] of gain.setup) await store.set(path, value);
    await open(shell, gain.route);
    const node = (): HTMLElement => {
      const found = turnables(shell.root).find((n) => n.getAttribute("aria-label") === gain.label);
      if (!found) throw new Error(`${gain.route.id} draws no ${gain.label}`);
      return found;
    };
    return { shell, store, node };
  }

  it("turns EQ's, COMP's and SSMCS's gains 1 dB a detent and 0.1 dB with Shift, as the unit's knob turns them and turns them pushed in", async () => {
    const turned: unknown[] = [];
    for (const g of FINE_GAINS) {
      const { shell, store, node } = await onGain(g);
      const value = (): number => store.num(g.path, NaN);
      const key = async (k: string, shiftKey = false): Promise<number> => {
        node().dispatchEvent(new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true }));
        await flush();
        return value();
      };
      const wheel = async (deltaY: number, shiftKey = false): Promise<number> => {
        node().dispatchEvent(new WheelEvent("wheel", { deltaY, shiftKey, bubbles: true, cancelable: true }));
        await flush();
        return value();
      };
      const from = async (v: number): Promise<void> => {
        await store.set(g.path, v);
        await flush();
      };
      const [min, max] = g.range;
      // A gain between two whole dB, as an earlier version stopped EQ and COMP on 0.5 dB and SSMCS on 0.1 dB, keeps its
      // tenths, as a detent of the unit's knob keeps them.
      await from(0.5);
      const keys = [await key("ArrowUp"), await key("ArrowUp", true), await key("ArrowDown", true), await key("ArrowDown")];
      await from(0.3);
      const wheels = [await wheel(-100, true), await wheel(-100), await wheel(100, true), await wheel(100)];
      await from(max - 0.5);
      const top = [await key("ArrowUp"), await key("ArrowUp", true)];
      await from(min + 0.5);
      const bottom = [await key("ArrowDown"), await key("ArrowDown", true)];
      turned.push({ gain: g.path, keys, wheels, top, bottom });
      shell.destroy();
    }
    expect(turned, "a detent up, one with Shift up and down, and one down; the wheel the same way; and none past either end").toEqual(
      FINE_GAINS.map((g) => ({ gain: g.path, keys: [1.5, 1.6, 1.5, 0.5], wheels: [0.4, 1.4, 1.3, 0.3], top: [g.range[1], g.range[1]], bottom: [g.range[0], g.range[0]] })),
    );
  });

  it("reaches every gain the unit's knob does, by a detent, a detent with Shift and a drag", async () => {
    const reached: unknown[] = [];
    for (const g of FINE_GAINS.filter((x) => ["ch.ch1.eq.low.gain", "ch.ch1.comp.gain", "ch.ch1.ssmcs.outGain"].includes(x.path))) {
      const { shell, store, node } = await onGain(g);
      const value = (): number => store.num(g.path, NaN);
      const control = node();
      const press = (key: string, shiftKey = false): number => {
        control.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
        return value();
      };
      /** Every value from where it stands, one detent at a time, until a detent leaves the value where it is. */
      const walk = (key: string, shiftKey: boolean): number[] => {
        const seen = [value()];
        for (let n = 0; n < 1000; n++) {
          if (press(key, shiftKey) === seen.at(-1)) break;
          seen.push(value());
        }
        return seen;
      };
      press("Home");
      const fine = walk("ArrowUp", true);
      const whole = walk("ArrowDown", false);
      // 10 px past the slop is 10/192 of the range.
      await store.set(g.path, 0);
      await flush();
      node().dispatchEvent(new MouseEvent("pointerdown", { clientY: 200, bubbles: true }));
      window.dispatchEvent(new MouseEvent("pointermove", { clientY: 186 }));
      window.dispatchEvent(new MouseEvent("pointerup", {}));
      await flush();
      reached.push({
        gain: g.path,
        fine: [fine.length, fine[0], fine.at(-1), fine.every((v, i) => i === 0 || Number((v - (fine[i - 1] ?? v)).toFixed(6)) === 0.1)],
        whole: [whole.length, whole[0], whole.at(-1), whole.every(Number.isInteger)],
        dragged: value(),
      });
      shell.destroy();
    }
    expect(reached, "every tenth of a dB by Shift, every whole dB without it, and a drag on the tenths").toEqual([
      { gain: "ch.ch1.eq.low.gain", fine: [361, -18, 18, true], whole: [37, 18, -18, true], dragged: 1.9 },
      { gain: "ch.ch1.comp.gain", fine: [181, 0, 18, true], whole: [19, 18, 0, true], dragged: 0.9 },
      { gain: "ch.ch1.ssmcs.outGain", fine: [361, -18, 18, true], whole: [37, 18, -18, true], dragged: 1.9 },
    ]);
  });

  it("turns the user-defined knobs whether 1-knob is on or off, while 1-knob keeps the screen's focus", async () => {
    const screens = [
      { name: "CH 1's EQ", route: { id: "ch.eq", strip: "ch1" }, oneKnob: "ch.ch1.eq.oneKnob.on", setup: [] },
      { name: "CH 1's COMP", route: { id: "ch.comp", strip: "ch1" }, oneKnob: "ch.ch1.comp.oneKnob.on", setup: [] },
      {
        name: "STEREO's M.B.Comp",
        route: { id: "ch.insfx", strip: "bus.stereo" },
        oneKnob: "ch.bus.stereo.insFx.oneKnobOn",
        setup: [
          ["ch.bus.stereo.insFx.effect", "M.B.Comp"],
          ["ch.bus.stereo.insFx.on", true],
        ],
      },
    ] as const;
    for (const screen of screens) {
      for (const oneKnob of [false, true]) {
        const { shell, store } = await mount();
        await open(shell, { id: "channel-view", strip: screen.route.strip });
        for (const [path, value] of screen.setup) await store.set(path, value);
        await store.set(screen.oneKnob, oneKnob);
        await open(shell, screen.route);
        await store.set("ui.userDefinedKnobs", true);
        await store.set("phones.1.level", 5);
        await flush();
        const framed = (): string[] => [...shell.root.querySelectorAll(".is-focused")].map((n) => n.className);
        const before = framed();
        const label = `${screen.name}, 1-knob ${oneKnob ? "on" : "off"}`;
        expect(before.some((c) => c.includes("oneknob-level")), `${label}: 1-knob's level holds the focus`).toBe(oneKnob);
        shell.root.querySelector<HTMLElement>(".knob-cell.is-udk")?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
        await flush();
        expect(store.num("phones.1.level", 0), `${label}: knob A turns Phones 1`).toBeGreaterThan(5);
        expect(framed(), `${label}: the focus stays where it was`).toEqual(before);
      }
    }
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
      return [...shell.root.querySelectorAll(".cv-block .badge, .cv-block .cv-fx-name, .cv-block .cv-fx-effect")].map((n) => n.textContent ?? "");
    };
    // GATE and COMP belong to a mono channel, DUCKER to a stereo input, DELAY to
    // the streaming bus. An EQ goes to the inputs, the mixes and the stereo bus;
    // an insert to the mono channels, the mixes and the stereo bus. An FX channel
    // carries neither, and names the effect it is instead.
    expect(await blocks("ch1")).toEqual(["GATE", "COMP", "EQ", "INS FX"]);
    expect(await blocks("ch_5_6"), "no insert on a stereo input").toEqual(["EQ", "DUCKER"]);
    expect(await blocks("fx1"), "an FX channel names itself and its effect").toEqual(["FX1", "Rev-X Hall"]);
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

  it.each(STRIPS)("strands no knob-bound parameter on any screen (%s)", async (strip) => {
    const registry = buildRegistry();
    const stranded: string[] = [];
    for (const id of registry.ids()) {
      const { shell, store, bound } = await mount();
      // The channel screens are scoped to a strip; the rest ignore the field.
      await open(shell, { id, strip });
      const paths = bound.map((s) => s.path);
      if (paths.length === 0) continue;
      const reached = pathsReachedByKeyboard(shell.root, store, paths);
      for (const p of paths) if (!reached.has(p)) stranded.push(`${id} (${strip}): ${p}`);
    }
    expect(stranded).toEqual([]);
  });

  it.each(STRIPS)("keeps every value the unit ships inside the range its control offers (%s)", async (strip) => {
    // A control whose range is narrower than the unit's pins the value at an end
    // and refuses to reach the rest of it, which is what a wrong min or max
    // looks like from the glass.
    const registry = buildRegistry();
    const outside: string[] = [];
    const unreadable: string[] = [];
    let checked = 0;
    for (const id of registry.ids()) {
      const { shell } = await mount();
      await open(shell, { id, strip });
      for (const node of turnables(shell.root)) {
        const min = Number(node.getAttribute("aria-valuemin"));
        const max = Number(node.getAttribute("aria-valuemax"));
        const now = Number(node.getAttribute("aria-valuenow"));
        checked += 1;
        // A screen reader takes the range and the reading as numbers, and infinity is not one.
        if (![min, max, now].every(Number.isFinite)) {
          unreadable.push(`${id} (${strip}): ${node.getAttribute("aria-label")} = ${now}, range ${min}..${max}`);
        }
        if (now < min || now > max) {
          outside.push(`${id} (${strip}): ${node.getAttribute("aria-label")} = ${now}, range ${min}..${max}`);
        }
      }
    }
    expect(checked, "the sweep found controls to check").toBeGreaterThan(30);
    expect(unreadable).toEqual([]);
    expect(outside).toEqual([]);
  });

  it.each(STRIPS)("writes every control's value and ends as numbers assistive technology reads (%s)", async (strip) => {
    // Every control writes its value and both its ends as numbers, the top of
    // a Ratio included, so assistive technology reads where it stands.
    const registry = buildRegistry();
    const unread: string[] = [];
    let checked = 0;
    for (const id of registry.ids()) {
      const { shell } = await mount();
      await open(shell, { id, strip });
      for (const node of turnables(shell.root)) {
        checked += 1;
        const attrs = ["aria-valuenow", "aria-valuemin", "aria-valuemax"].map((a) => node.getAttribute(a));
        if (!attrs.every((a) => a !== null && Number.isFinite(Number(a)))) unread.push(`${id} (${strip}): ${node.getAttribute("aria-label")} ${attrs.join(" ")}`);
      }
    }
    expect(checked, "the sweep found controls to check").toBeGreaterThan(30);
    expect(unread).toEqual([]);
  });

  /**
   * What one arrow key moves on each control `id` draws for `strip`, the channel view's blocks among them, in render
   * order: the up arrow, or the down arrow where the up arrow moves nothing. Runs with Shift and without start from
   * the same unit and press the same controls in the same order, so their lists line up.
   */
  async function detents(id: string, strip: string, shiftKey: boolean): Promise<string[]> {
    const { shell, store } = await mount();
    await open(shell, { id, strip });
    const numbers = (): Map<string, number> =>
      new Map(store.paths().flatMap((p) => (typeof store.get(p, 0) === "number" ? [[p, store.num(p)] as const] : [])));
    const moves: string[] = [];
    for (const node of [...turnables(shell.root), ...shell.root.querySelectorAll<HTMLElement>(".cv-block")]) {
      let moved = "";
      for (const key of ["ArrowUp", "ArrowDown"]) {
        const before = numbers();
        node.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
        moved = [...numbers()]
          .filter(([p, v]) => before.get(p) !== v)
          .map(([p, v]) => `${p} ${before.get(p) ?? "unset"} -> ${v}`)
          .join(", ");
        if (moved) break;
      }
      moves.push(`${id} (${strip}) ${node.getAttribute("aria-label") ?? node.className}: ${moved || "nothing"}`);
    }
    shell.destroy();
    return moves;
  }

  // FX 2 ships Mono Delay, whose delay turns 5 ms a detent, and STREAMING's channel view turns its DELAY block's
  // time: the knob on that DELAY block does not push in (URX44V, the operator, 2026-10-03).
  it.each([...STRIPS, "fx2", "bus.stream"])("turns a value a detent with Shift as without it, and a gain the knob turns finer pushed in by a finer one (%s)", async (strip) => {
    // The DELAY screen's cells turn their time by a step of their own with Shift.
    const ownShift = (move: string): boolean => move.startsWith("ch.delay ");
    // EQ's, COMP's and SSMCS's gains, which Shift turns 0.1 dB where a detent turns 1 dB.
    const finer = (move: string): boolean => /\.(eq\.\w+|comp|ssmcs\.sc)\.gain |\.ssmcs\.outGain /.test(move);
    const registry = buildRegistry();
    const differ: string[] = [];
    const same: string[] = [];
    let turned = 0;
    for (const id of registry.ids()) {
      const plain = await detents(id, strip, false);
      const shifted = await detents(id, strip, true);
      turned += plain.filter((m) => !m.endsWith(": nothing")).length;
      plain.forEach((m, i) => {
        if (finer(m)) {
          if (m === shifted[i]) same.push(m);
        } else if (m !== shifted[i] && !ownShift(m)) differ.push(`${m} | with Shift ${shifted[i] ?? "no control"}`);
      });
    }
    expect(turned, "the sweep turned values").toBeGreaterThan(20);
    expect(differ).toEqual([]);
    expect(same, "a gain that Shift turns as without it").toEqual([]);
  });

  it("reads a ratio of INF out as the top of its travel in numbers, and names it INF", async () => {
    for (const [route, path] of [
      ["ch.comp", "ch.ch1.comp.ratio"],
      ["ch.ssmcs.comp", "ch.ch1.ssmcs.comp.ratio"],
    ] as const) {
      const { shell, store } = await mount();
      await open(shell, { id: "channel-view", strip: "ch1" });
      await open(shell, { id: route, strip: "ch1" });
      const ratios = (): HTMLElement[] => turnables(shell.root).filter((n) => n.getAttribute("aria-label")?.endsWith("Ratio"));
      expect(ratios().map((n) => n.getAttribute("aria-label")), `${route} draws the ratio as its grip and its box`).toEqual(["R handle: Ratio", "Ratio"]);
      // 500:1 is the last stop before INF.
      await store.set(path, 500);
      await flush();
      ratios()[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
      await flush();
      expect(store.num(path, 0), `${route}: one detent up from 500:1`).toBe(Number.POSITIVE_INFINITY);

      for (const node of turnables(shell.root)) {
        const read = ["aria-valuemin", "aria-valuemax", "aria-valuenow"].map((a) => Number(node.getAttribute(a)));
        expect(read.every(Number.isFinite), `${route}: ${node.getAttribute("aria-label")} reads ${read.join(" / ")}`).toBe(true);
      }
      for (const node of ratios()) {
        expect(
          ["aria-valuemin", "aria-valuemax", "aria-valuenow", "aria-valuetext"].map((a) => node.getAttribute(a)),
          `${route}: ${node.getAttribute("aria-label")}`,
        ).toEqual(["1", "500", "500", "INF:1"]);
      }
    }
  });

  it.each(STRIPS)("keeps a finger dragging what it took, rather than the page (%s)", async (strip) => {
    // The browser hands a finger's travel to the page unless the place it lands
    // takes the touch; the drag then ends in a cancel a few pixels in. A part of an
    // SVG drawing takes it through the drawing.
    const takes = (node: Element): string => {
      const surface = node instanceof SVGElement ? (node.ownerSVGElement ?? node) : node;
      return (surface as HTMLElement).style.touchAction;
    };
    const registry = buildRegistry();
    const loose: string[] = [];
    const seen = { drags: 0, drawn: 0, lists: 0 };
    for (const id of registry.ids()) {
      const { shell } = await mount();
      await open(shell, { id, strip });
      const drags = shell.root.querySelectorAll(
        '[role="slider"]:not([aria-disabled="true"]), [role="spinbutton"]:not([aria-disabled="true"]), .knob-graphic.is-control, .eq-grip:not(.is-fixed)',
      );
      for (const node of drags) {
        seen.drags += 1;
        if (node instanceof SVGElement) seen.drawn += 1;
        if (takes(node) !== "none") loose.push(`${id} (${strip}): ${node.getAttribute("aria-label") ?? node.className}`);
      }
      // A list is scrolled by dragging its rows or its bar's thumb.
      for (const node of shell.root.querySelectorAll(".scroll-host, .scroll-thumb")) {
        seen.lists += 1;
        if (takes(node) !== "none") loose.push(`${id} (${strip}): ${node.className}`);
      }
    }
    expect(seen.drags, "the sweep found controls a drag turns").toBeGreaterThan(30);
    expect(seen.lists, "and lists").toBeGreaterThan(0);
    if (strip === "ch1") expect(seen.drawn, "and grips drawn on a plot").toBeGreaterThan(0);
    expect(loose).toEqual([]);
  });

  it("lets a sideways finger on HOME step the bank, and scroll the page on the other screens", async () => {
    const { shell } = await mount();
    const main = (): string | undefined => shell.root.querySelector<HTMLElement>(".main")?.style.touchAction;
    expect(main(), "HOME keeps the page's own scroll up and down").toBe("pan-y");
    await open(shell, { id: "setup" });
    expect(main(), "SETUP leaves the touch to the page").toBe("");
    shell.ctx.nav.home();
    await flush();
    expect(main()).toBe("pan-y");
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
