import { afterEach, describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import type { Route } from "../app/navigator";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { setMeterSource, startMeterTicker } from "./meters";

// What a screen shows of a moving signal outside the dynamics screens' own meters:
// the channel view's GATE and DUCKER lamps and COMP bars, the M.B.Comp bands'
// reduction bars and the RECORDER's track meters. Each is taken from silence to
// 0 dB and back, and reads the same after the meter ticker has run as after the
// screen is opened afresh.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let levels: Record<string, number> = {};
afterEach(() => setMeterSource(null));

async function mount(): Promise<Shell> {
  levels = {};
  setMeterSource((id, channels) => Array.from({ length: channels }, () => levels[id] ?? -96));
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return shell;
}

async function open(shell: Shell, routes: Route[]): Promise<void> {
  shell.ctx.nav.home();
  for (const r of routes) shell.ctx.nav.push(r);
  await flush();
}

/**
 * Move meter `id` from silence to 0 dB and back. After each step the ticker runs and
 * `read` is taken, then the screen is opened again and `read` is taken again: the two
 * agree, 0 dB reads other than silence, and silence reads as it did at the start.
 */
async function follow(shell: Shell, routes: Route[], id: string, read: () => unknown): Promise<void> {
  levels[id] = -96;
  await open(shell, routes);
  const silent = read();
  for (const [step, db] of [["at 0 dB", 0], ["back in silence", -96]] as const) {
    levels[id] = db;
    const stop = startMeterTicker(shell.ctx.store, shell.root, 20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();
    const ticked = read();
    await open(shell, routes);
    expect(ticked, `${step}: the ticker reads what the screen reads when opened`).toEqual(read());
    if (db === 0) expect(ticked, `${step}: the view moves`).not.toEqual(silent);
    else expect(ticked, `${step}: as it read at the start`).toEqual(silent);
  }
}

const classes = (shell: Shell, selector: string): string[] => [...shell.root.querySelectorAll(selector)].map((n) => n.className);
const widths = (shell: Shell, selector: string): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].map((n) => n.style.width);
const heights = (shell: Shell, selector: string): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].map((n) => n.style.height);
const unlit = (shell: Shell, selector: string): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].map((n) => n.style.getPropertyValue("--unlit"));

describe("views that follow the signal as the meters move", () => {
  it("lights the channel view's GATE lamps", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.gate.on", true);
    await follow(shell, [{ id: "channel-view", strip: "ch1" }], "ch1", () => classes(shell, ".block-lamps .block-lamp"));
  });

  it("lights the channel view's DUCKER lamps from the key", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch_5_6.ducker.on", true);
    await follow(shell, [{ id: "channel-view", strip: "ch_5_6" }], "ch1", () => classes(shell, ".block-lamps .block-lamp"));
  });

  it("moves the channel view's COMP level and reduction bars", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.comp.on", true);
    await shell.ctx.store.set("ch.ch1.comp.threshold", -40);
    await follow(shell, [{ id: "channel-view", strip: "ch1" }], "ch1", () => widths(shell, ".comp-meters .comp-bar i"));

    // At 0 dB the level bar is full, and the reduction bar reads straight over 54 dB
    // what the COMP screen's OUT takes off before the makeup.
    levels["ch1"] = 0;
    await open(shell, [{ id: "channel-view", strip: "ch1" }]);
    const [level, reduce] = widths(shell, ".comp-meters .comp-bar i");
    await open(shell, [{ id: "channel-view", strip: "ch1" }, { id: "ch.comp", strip: "ch1" }]);
    const out = Number([...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")][1]?.dataset["meterOffset"] ?? 0);
    const reduction = out + shell.ctx.store.num("ch.ch1.comp.gain", 0);
    expect(level).toBe("100%");
    expect(reduction).toBeGreaterThan(0);
    expect(Number.parseFloat(reduce ?? "NaN")).toBeCloseTo((reduction / 54) * 100, 6);
  });

  it("moves each M.B.Comp band's reduction bar", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stereo.insFx.effect", "M.B.Comp");
    await shell.ctx.store.set("ch.bus.stereo.insFx.on", true);
    await follow(
      shell,
      [
        { id: "channel-view", strip: "bus.stereo" },
        { id: "ch.insfx", strip: "bus.stereo" },
      ],
      "bus.stereo",
      () => heights(shell, ".mbc-gr-bars .dyn-gr i"),
    );
  });

  it("moves a record track's meter with the pair it records", async () => {
    const shell = await mount();
    await shell.ctx.store.set("sd.track.0", "CH 1/2");
    await follow(shell, [{ id: "microsd.recorder" }], "ch1", () => unlit(shell, ".rec-slot .rec-slot-meter .meter-bar").slice(0, 2));
  });
});
