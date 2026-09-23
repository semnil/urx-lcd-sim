import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { applyScene, inScene } from "../model/scene-state";
import { recallScene, storeScene } from "./scene";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(): Promise<Shell> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
  const shell = new Shell(buildRegistry(), store, unitById("URX44V"));
  await flush();
  return shell;
}

describe("what a scene carries", () => {
  it("takes the mixer and leaves the unit's own settings where they are", () => {
    // Measured from a unit's own settings file: a scene holds the routing, the
    // sends, the faders, the processing, the names and the colours, and leaves
    // out the monitor and phones buses, the oscillator, the streaming bus, the
    // output patch, the recorder and the unit's settings.
    for (const path of [
      "ch.ch1.level",
      "ch.ch1.send.bus.mix1.on",
      "ch.ch1.gain",
      "ch.ch1.phantom",
      "ch.ch1.comp.threshold",
      "ch.ch1.name",
      "ch.ch1.color",
      "ch.ch1.source",
      "ch.bus.stereo.level",
      "source.usb-daw-1-2.digitalGain",
    ]) {
      expect(inScene(path), path).toBe(true);
    }
    for (const path of [
      "ch.bus.stream.level",
      "ch.bus.stream.color",
      "ch.bus.stream.source",
      "monitor.1.level",
      "phones.1.level",
      "osc.on",
      "setup.outputPatch.tab",
      "sd.trackCount",
      "setup.brightness",
      "ui.selectedStrip",
      "scene.current",
    ]) {
      expect(inScene(path), path).toBe(false);
    }
  });
});

describe("storing and recalling a scene", () => {
  it("puts the mixer back where it was when the scene was stored", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.level", -12);
    await shell.ctx.store.set("ch.ch1.name", "Kick");
    await shell.ctx.store.set("ch.ch2.comp.on", true);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await storeScene(shell.ctx, "Standard", 1);

    // Move the mixer somewhere else, then come back.
    await shell.ctx.store.set("ch.ch1.level", 3);
    await shell.ctx.store.set("ch.ch1.name", "Snare");
    await shell.ctx.store.set("ch.ch2.comp.on", false);
    await recallScene(shell.ctx, 1);
    expect([
      shell.ctx.store.num("ch.ch1.level", 0),
      shell.ctx.store.str("ch.ch1.name", ""),
      shell.ctx.store.bool("ch.ch2.comp.on", false),
    ]).toEqual([-12, "Kick", true]);
    expect(shell.ctx.store.num("scene.current", -1), "and it is the scene in view").toBe(1);
  });

  it("puts back a ratio stored at the top of its travel", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    await shell.ctx.store.set("scene.Standard.1.title", "top");
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 40);
    await recallScene(shell.ctx, 1);
    expect(shell.ctx.store.num("ch.ch1.ssmcs.comp.ratio", 0)).toBe(Number.POSITIVE_INFINITY);
  });

  it("leaves the streaming bus where the unit keeps it", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stream.level", -4);
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await shell.ctx.store.set("ch.bus.stream.level", -18);
    await recallScene(shell.ctx, 1);
    expect(shell.ctx.store.num("ch.bus.stream.level", 99)).toBe(-18);
    const stored = Object.keys(JSON.parse(shell.ctx.store.str("scene.Standard.1.state", "{}")) as object);
    expect(stored.filter((p) => p.startsWith("ch.bus.stream")), "and the stored copy holds none of it").toEqual([]);
    expect(stored, "which is not how it holds the stereo bus").toContain("ch.bus.stereo.level");
  });

  it("puts back only what a scene carries, whatever the stored copy holds", async () => {
    const shell = await mount();
    const brightness = shell.ctx.store.num("setup.brightness", 99);
    await applyScene(shell.ctx.store, { "ch.ch1.level": -9, "monitor.1.level": -40, "setup.brightness": 1 });
    expect([
      shell.ctx.store.num("ch.ch1.level", 99),
      shell.ctx.store.num("monitor.1.level", 99),
      shell.ctx.store.num("setup.brightness", 99),
    ]).toEqual([-9, 0, brightness]);
  });

  it("leaves the monitor, the oscillator and the unit's settings alone", async () => {
    const shell = await mount();
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await shell.ctx.store.set("monitor.1.level", -20);
    await shell.ctx.store.set("osc.on", true);
    await shell.ctx.store.set("setup.brightness", 3);
    await recallScene(shell.ctx, 1);
    expect([
      shell.ctx.store.num("monitor.1.level", 0),
      shell.ctx.store.bool("osc.on", false),
      shell.ctx.store.num("setup.brightness", 0),
    ]).toEqual([-20, true, 3]);
  });

  it("puts back a gain above +40 dB stored with HI-Z off, over a connector whose HI-Z is on", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch3.gain", 60);
    await storeScene(shell.ctx, "Standard", 1);
    await shell.ctx.store.set("scene.Standard.1.title", "take one");
    await shell.ctx.store.set("ch.ch3.hiZ", true);
    expect(shell.ctx.store.num("ch.ch3.gain", 99), "HI-Z brought it down").toBe(40);
    await recallScene(shell.ctx, 1);
    expect([shell.ctx.store.num("ch.ch3.gain", 99), shell.ctx.store.bool("ch.ch3.hiZ", true)]).toEqual([60, false]);
  });

  it("brings the unit's own mixer back from scene 00, which nothing stores over", async () => {
    const shell = await mount();
    const factory = shell.ctx.store.num("ch.ch1.level", 99);
    await shell.ctx.store.set("ch.ch1.level", -30);
    await shell.ctx.store.set("ch.ch1.gain", 40);
    await recallScene(shell.ctx, 0);
    expect([shell.ctx.store.num("ch.ch1.level", 99), shell.ctx.store.num("ch.ch1.gain", 99)]).toEqual([factory, -8]);
    expect(shell.ctx.store.num("scene.current", -1)).toBe(0);
  });

  it("stores the mixer when a number is named for the first time", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch3.level", -7);
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", Number.POSITIVE_INFINITY);
    shell.ctx.nav.push({ id: "scene" });
    shell.ctx.nav.push({ id: "scene.list" });
    await shell.ctx.store.set("scene.selected", 2);
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".scene-actions .btn")].find((b) => b.textContent === "Store")?.click();
    await flush();
    const field = shell.root.querySelector<HTMLElement>(".title-field");
    expect(field, "the title sheet opens on a number that holds nothing").not.toBeNull();
    [...shell.root.querySelectorAll<HTMLElement>(".pick-dialog-ok")][0]?.click();
    await flush();

    await shell.ctx.store.set("ch.ch3.level", 0);
    await shell.ctx.store.set("ch.ch1.ssmcs.comp.ratio", 40);
    await recallScene(shell.ctx, 2);
    expect(shell.ctx.store.num("ch.ch3.level", 99)).toBe(-7);
    expect(shell.ctx.store.num("ch.ch1.ssmcs.comp.ratio", 0), "a ratio at the top of its travel too").toBe(Number.POSITIVE_INFINITY);
  });
});
