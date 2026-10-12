import { afterEach, describe, expect, it, vi } from "vitest";
import { Shell } from "./app/shell";
import type { Route } from "./app/navigator";
import { SimTransport } from "./device/sim-transport";
import { DeviceStore } from "./device/store";
import type { Unit, UnitAction, UnitActions } from "./device/unit";
import { computerClock, emulatedActions, refusedActions } from "./device/unit";
import { factoryState } from "./model/defaults";
import { clockParts } from "./model/clock";
import { unitById } from "./model/units";
import { buildRegistry } from "./screens";
import { meterLevels } from "./screens/meters";
import { type EmbeddedSim, ROOT_CLASS, mountSim } from "./embed";

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

function simulated(overrides: Partial<Unit> = {}): Unit {
  return {
    params: new SimTransport(factoryState(unitById("URX44V"))),
    levels: { kind: "simulated" },
    clock: computerClock,
    actions: emulatedActions,
    ...overrides,
  };
}

const mounted: EmbeddedSim[] = [];
const shells: Shell[] = [];

async function mount(unit: Unit = simulated()): Promise<{ sim: EmbeddedSim; host: HTMLElement }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const sim = await mountSim(host, { model: "URX44V", unit });
  mounted.push(sim);
  await flush();
  return { sim, host };
}

/** A glass opened on `routes`, as a page carrying it beside other controls opens it. */
async function shellOn(routes: Route[], actions: UnitActions = emulatedActions): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model, routes, { actions, ownsDocument: false });
  shells.push(shell);
  document.body.appendChild(shell.root);
  await flush();
  return shell;
}

const styles = (): HTMLStyleElement[] => [...document.querySelectorAll<HTMLStyleElement>("style[data-urx-lcd-sim]")];

afterEach(() => {
  for (const sim of mounted.splice(0)) sim.dispose();
  for (const shell of shells.splice(0)) shell.destroy();
  document.body.replaceChildren();
});

describe("the embedded glass", () => {
  it("mounts the glass under one root carrying its class, and nothing of the simulator's own page around it", async () => {
    const { sim, host } = await mount();
    expect(host.children.length).toBe(1);
    expect(sim.root.classList.contains(ROOT_CLASS)).toBe(true);
    expect(sim.root.querySelector(".lcd")).not.toBeNull();
    expect(sim.root.querySelector(".chrome, .chrome-foot, select")).toBeNull();
  });

  it("puts its stylesheet on the page once while any glass is up, and takes it off with the last", async () => {
    const a = await mount();
    const b = await mount();
    expect(styles().length).toBe(1);
    expect(styles()[0]?.textContent).toContain(`@scope (.${ROOT_CLASS})`);
    expect(styles()[0]?.textContent, "the simulator's own rules are in it").toContain(`@keyframes ${ROOT_CLASS}-spin-turn`);
    a.sim.dispose();
    expect(styles().length).toBe(1);
    b.sim.dispose();
    expect(styles().length).toBe(0);
  });

  it("draws at the scale it is given", async () => {
    const { sim } = await mount();
    expect(sim.root.style.getPropertyValue("--zoom")).toBe("1");
    sim.setZoom(150);
    expect(sim.root.style.getPropertyValue("--zoom")).toBe("1.5");
  });

  it("reads the meters and the clock from the unit while it is up, and lets them go with it", async () => {
    const read = vi.fn((_id: string, channels: number) => Array.from({ length: channels }, () => -12));
    const at = Date.UTC(2031, 4, 6, 7, 8, 9);
    const { sim } = await mount(simulated({ levels: { kind: "device", read, clipSafe: () => false }, clock: { now: () => at } }));
    expect(meterLevels(sim.store, "ch1@input", 2)).toEqual([-12, -12]);
    expect(read).toHaveBeenCalledWith("ch1@input", 2);
    expect(clockParts(sim.store).year).toBe(2031);
    sim.dispose();
    read.mockClear();
    meterLevels(sim.store, "ch1@input", 1);
    expect(read, "a glass let go reads the simulated meters").not.toHaveBeenCalled();
    expect(clockParts(sim.store, at).year, "the clock asked for a moment still reads it").toBe(2031);
    expect(clockParts(sim.store).year, "and the computer's clock runs it again").toBe(new Date().getUTCFullYear());
  });

  it("draws the unit's meters from the first paint, the synthetic signal never", async () => {
    const { sim } = await mount(simulated({ levels: { kind: "device", read: (_id, channels) => Array.from({ length: channels }, () => Number.NaN), clipSafe: () => false } }));
    const bars = [...sim.root.querySelectorAll<HTMLElement>('[data-meter-source="bus.stereo"] .meter-bar')];
    expect(bars.length).toBe(2);
    for (const bar of bars) expect(bar.style.getPropertyValue("--unlit")).toBe("100%");
  });

  it("closes the unit's transport when it is let go", async () => {
    const params = new SimTransport(factoryState(unitById("URX44V")));
    const close = vi.spyOn(params, "close");
    const { sim } = await mount(simulated({ params }));
    sim.dispose();
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("a glass carried beside other controls", () => {
  it("leaves Escape pressed with nothing focused to the page, and steps back on one pressed on the glass", async () => {
    const shell = await shellOn([{ id: "setup" }]);
    expect(shell.ctx.nav.current.id).toBe("setup");
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(shell.ctx.nav.current.id, "the page keeps Escape").toBe("setup");
    shell.root.querySelector<HTMLElement>("button")?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(shell.ctx.nav.current.id, "Escape on the glass steps back").toBe("home");
  });
});

describe("the unit's actions", () => {
  const recordButton = (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>("[aria-label='Record']");

  it("arms the simulated recorder", async () => {
    const shell = await shellOn([{ id: "microsd.recorder" }]);
    recordButton(shell)?.click();
    await flush();
    expect(shell.ctx.store.str("sd.rec", "idle")).toBe("armed");
  });

  it("arms nothing on a unit that refuses the recorder, and says which action it refused", async () => {
    const refused: UnitAction[] = [];
    const shell = await shellOn([{ id: "microsd.recorder" }], refusedActions((a) => refused.push(a)));
    recordButton(shell)?.click();
    await flush();
    expect(shell.ctx.store.str("sd.rec", "idle")).toBe("idle");
    expect(refused).toEqual(["recorder.arm"]);
  });

  /** Move CH 1's fader off where scene 00 holds it, then recall 00 on `actions`. Returns the fader after. */
  async function recallInitialData(actions: UnitActions): Promise<number> {
    const shell = await shellOn([{ id: "scene" }, { id: "scene.list" }], actions);
    await shell.ctx.store.set("ch.ch1.level", -10);
    const byText = (sel: string, text: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(sel)].find((n) => n.textContent === text);
    [...shell.root.querySelectorAll<HTMLElement>(".scene-list .list-row")][0]?.click();
    await flush();
    byText(".scene-actions .btn", "Recall")?.click();
    await flush();
    byText(".dialog-actions .btn", "OK")?.click();
    for (let i = 0; i < 20; i++) await flush();
    return shell.ctx.store.num("ch.ch1.level", Number.NaN);
  }

  it("recalls scene 00 on the simulated unit, its fader going back to where 00 holds it", async () => {
    expect(await recallInitialData(emulatedActions)).toBe(0);
  });

  it("recalls nothing on a unit that refuses scene recall, and says it refused it", async () => {
    const refused: UnitAction[] = [];
    expect(await recallInitialData(refusedActions((a) => refused.push(a)))).toBe(-10);
    expect(refused).toEqual(["scene.recall"]);
  });

  it("carries an action out on the simulated unit and refuses it on a unit that refuses it", () => {
    const run = vi.fn();
    expect(emulatedActions.perform("scene.recall", run)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    const refuse = vi.fn();
    expect(refusedActions().perform("card.format", refuse)).toBe(false);
    expect(refuse).not.toHaveBeenCalled();
  });
});
