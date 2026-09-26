import { afterEach, describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { readCard } from "../model/card";
import { factoryState } from "../model/defaults";
import { captureScene } from "../model/scene-state";
import { captureSettings } from "../model/settings-file";
import { findStrip } from "../model/types";
import { unitById } from "../model/units";
import { thresholdReduction } from "./channel";
import { buildRegistry } from "./index";
import { setMeterSource, startMeterTicker } from "./meters";
import { recallScene, storeScene } from "./scene";
import { compDetectorShared } from "./stereo-link";

// What the dynamics of a stereo-linked CH 1 / CH 2 pair hear, with CH 1 carrying a
// signal and CH 2 silent: GATE and an insert hear the pair's louder channel; COMP
// hears it from the moment the pair is linked until the linked pair is taken into
// SSMCS, and each channel its own after that; SSMCS hears each channel its own.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

let levels: Record<string, number> = {};
afterEach(() => setMeterSource(null));

async function mount(): Promise<Shell> {
  levels = { ch1: -12, ch2: -96 };
  setMeterSource((id, channels) => Array.from({ length: channels }, () => levels[id] ?? -96));
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return shell;
}

async function open(shell: Shell, id: string, strip: string): Promise<void> {
  shell.ctx.nav.home();
  shell.ctx.nav.push({ id: "channel-view", strip });
  shell.ctx.nav.push({ id, strip });
  await flush();
}

/** Take `value` from the CH SETTING pulldown captioned `caption`, on CH 1. */
async function pick(shell: Shell, caption: string, value: string): Promise<void> {
  await open(shell, "ch.setting", "ch1");
  const field = [...shell.root.querySelectorAll<HTMLElement>(".chs-field")].find((f) => (f.textContent ?? "").startsWith(caption));
  const pulldown = field?.querySelector<HTMLElement>(".pulldown");
  expect(pulldown, `CH SETTING offers ${caption}`).toBeTruthy();
  if ((pulldown?.textContent ?? "").includes(value)) return;
  pulldown?.click();
  await flush();
  const option = [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === value);
  expect(option, `${caption} offers ${value}`).toBeDefined();
  option?.click();
  await flush();
}

/** The reduction bar's lit share on the screen open now, in percent. */
const grBar = (shell: Shell): number => Number.parseFloat(shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height ?? "NaN");

/** How much of each OUT lane's bar is unlit on the screen open now. */
const outUnlit = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll<HTMLElement>(".dyn-io .dyn-io-col:nth-child(2) .meter-bar")].map((b) => b.style.getPropertyValue("--unlit"));

/** What a meter running -60 dB to 0 dB leaves unlit at `db`. */
const unlitAt = (db: number): string => `${(1 - Math.min(1, Math.max(0, (db + 60) / 60))) * 100}%`;

/** The OUT meter's offset for each lane on the screen open now, in dB. */
const outOffsets = (shell: Shell): number[] =>
  ([...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")][1]?.dataset["meterOffset"] ?? "0").split(" ").map(Number);

const shared = (shell: Shell): boolean => {
  const strip = findStrip(shell.ctx.model, "ch1");
  if (!strip) throw new Error("CH 1");
  return compDetectorShared(shell.ctx, strip);
};

/** Store the mixer under scene `no`, with a title so the list holds it and a fader to show a recall took. */
async function store(shell: Shell, no: number): Promise<void> {
  await shell.ctx.store.set(`scene.Standard.${no}.title`, `scene ${no}`);
  await shell.ctx.store.set("ch.ch1.level", -no);
  await storeScene(shell.ctx, "Standard", no);
  await shell.ctx.store.set("ch.ch1.level", 0);
}

/** Recall scene `no` and check it took. */
async function recall(shell: Shell, no: number): Promise<void> {
  await recallScene(shell.ctx, no);
  await flush();
  expect(shell.ctx.store.num("ch.ch1.level", 0), `scene ${no} was recalled`).toBe(-no);
}

async function compOn(shell: Shell): Promise<void> {
  await shell.ctx.store.set("ch.ch1.comp.on", true);
  await flush();
}

describe("what a stereo-linked pair's dynamics hear", () => {
  it("opens GATE on the pair's louder channel, on either channel's screen and whatever the pair has been through", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch2.gate.on", true);
    await open(shell, "ch.gate", "ch2");
    expect(grBar(shell), "CH 2 alone is under the threshold and shut").toBeGreaterThan(0);

    await pick(shell, "Signal Type", "STEREO");
    await shell.ctx.store.set("ch.ch1.gate.on", true);
    await open(shell, "ch.gate", "ch2");
    expect(grBar(shell), "linked, CH 1's signal opens it").toBe(0);

    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await open(shell, "ch.gate", "ch2");
    expect(grBar(shell), "and still does after SSMCS").toBe(0);
  });

  it("holds both channels down by the pair's louder channel with COMP from the moment the pair is linked", async () => {
    const shell = await mount();
    await pick(shell, "Signal Type", "STEREO");
    await compOn(shell);
    await open(shell, "ch.comp", "ch1");
    const own = grBar(shell);
    const ownOut = outOffsets(shell);
    expect(own, "CH 1 is over the threshold").toBeGreaterThan(0);
    await open(shell, "ch.comp", "ch2");
    expect(grBar(shell), "CH 2's screen reads the same reduction").toBe(own);
    expect(outOffsets(shell), "and takes it off both OUT lanes").toEqual(ownOut);
    expect(ownOut).toHaveLength(1);
  });

  it("lets each channel's COMP hear its own channel once the linked pair has been through SSMCS, until it is linked again", async () => {
    const shell = await mount();
    // CH 2 carries a signal under the threshold, so its lane shows where it is drawn.
    levels["ch2"] = -30;
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await compOn(shell);
    expect(shared(shell)).toBe(false);
    await open(shell, "ch.comp", "ch1");
    const own = grBar(shell);
    expect(own, "CH 1 holds itself down").toBeGreaterThan(0);
    const [left, right] = outOffsets(shell);
    await open(shell, "ch.comp", "ch2");
    expect(grBar(shell), "CH 2 hears its own silence").toBe(0);
    expect(outOffsets(shell), "the OUT lanes are held down apart, CH 1 on the left").toEqual([left, right]);
    const makeup = shell.ctx.store.num("ch.ch2.comp.gain", 0);
    expect(right, "CH 2's lane is only raised by the makeup").toBe(-makeup);
    expect(Number(left), "while CH 1's comes down by its own reduction").toBeGreaterThan(Number(right));
    expect(outUnlit(shell), "each lane drawn by its own").toEqual([unlitAt(-12 - Number(left)), unlitAt(-30 - Number(right))]);

    await pick(shell, "Signal Type", "MONO x 2");
    await pick(shell, "Signal Type", "STEREO");
    expect(shared(shell), "linking the pair again puts it back on the pair").toBe(true);
  });

  it("keeps the pair on the pair when it is linked while in SSMCS and then leaves it", async () => {
    const shell = await mount();
    await pick(shell, "COMP / EQ", "SSMCS");
    await shell.ctx.store.set("ch.ch2.compEqOrder", "SSMCS");
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    expect(shared(shell)).toBe(true);
  });

  it("leaves what the compressors hear alone on a recall that keeps the pair linked, and puts a recall that links it on the pair", async () => {
    const shell = await mount();
    await pick(shell, "Signal Type", "STEREO");
    await store(shell, 1);
    expect(Object.keys(captureScene(shell.ctx.store)).some((p) => p.startsWith("pair.")), "a scene carries none of it").toBe(false);

    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await recall(shell, 1);
    expect(shared(shell), "the pair stays on its own channels").toBe(false);

    // A scene that links the pair and takes it into SSMCS at once puts it on the pair.
    await pick(shell, "COMP / EQ", "SSMCS");
    await store(shell, 2);
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await pick(shell, "Signal Type", "MONO x 2");
    await recall(shell, 2);
    expect(shell.ctx.store.str("ch.ch1.signalType", ""), "the recall linked the pair").toBe("STEREO");
    expect(shared(shell)).toBe(true);
  });

  it("goes into SSMCS by a recall as it does from the screen", async () => {
    const shell = await mount();
    await pick(shell, "COMP / EQ", "SSMCS");
    await shell.ctx.store.set("ch.ch2.compEqOrder", "SSMCS");
    await pick(shell, "Signal Type", "STEREO");
    await store(shell, 3);
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await store(shell, 2);
    expect(shared(shell)).toBe(true);
    await recall(shell, 3);
    await recall(shell, 2);
    expect(shared(shell)).toBe(false);
  });

  it("puts a settings file that links the pair on the pair, and leaves the state out of the file", async () => {
    const shell = await mount();
    const store = shell.ctx.store;
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    expect(Object.keys(captureSettings(store)).some((p) => p.startsWith("pair.")), "a settings file carries none of it").toBe(false);
    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "microsd.saveload" });
    await flush();
    const action = (label: string): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".sd-actions .btn")].find((b) => b.textContent === label || b.getAttribute("aria-label") === label);
    action("Save as")?.click();
    await flush();
    await store.set("ui.titleEntry.text", "linked");
    await flush();
    shell.root.querySelector<HTMLElement>(".pick-dialog-ok")?.click();
    await flush();
    expect(shared(shell), "saving changes nothing").toBe(false);
    await pick(shell, "Signal Type", "MONO x 2");
    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "microsd.saveload" });
    await flush();
    await store.set("sd.selectedFile", readCard(store).findIndex((e) => e.name === "linked.urxf"));
    await flush();
    action("Load")?.click();
    await flush();
    await flush();
    expect(store.str("ch.ch1.signalType", ""), "the load linked the pair").toBe("STEREO");
    expect(shared(shell)).toBe(true);
  });

  it("reads the same in the channel view's GATE and COMP blocks", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.ch2.gate.on", true);
    const open = (): boolean => shell.root.querySelector(".block-lamps .block-lamp.is-on") !== null;
    const reduce = (): number => Number.parseFloat(shell.root.querySelector<HTMLElement>(".comp-bar.comp-reduce i")?.style.width ?? "NaN");
    shell.ctx.nav.push({ id: "channel-view", strip: "ch2" });
    await flush();
    expect(open(), "CH 2 alone does not open its gate").toBe(false);

    await pick(shell, "Signal Type", "STEREO");
    await shell.ctx.store.set("ch.ch1.gate.on", true);
    await compOn(shell);
    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch2" });
    await flush();
    expect(open(), "linked, CH 1 opens it").toBe(true);
    expect(reduce(), "and CH 1 holds CH 2's COMP down").toBeGreaterThan(0);

    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await compOn(shell);
    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "channel-view", strip: "ch2" });
    await flush();
    expect(reduce(), "until the pair has been through SSMCS").toBe(0);
  });

  it("keeps each OUT lane moving by its own channel's reduction", async () => {
    const shell = await mount();
    levels["ch2"] = -30;
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await compOn(shell);
    await open(shell, "ch.comp", "ch2");
    const before = outOffsets(shell);
    levels["ch1"] = 0;
    const stop = startMeterTicker(shell.ctx.store, shell.root, 20);
    await new Promise((resolve) => setTimeout(resolve, 60));
    stop();
    const after = outOffsets(shell);
    expect(after).toHaveLength(2);
    expect(Number(after[0]), "CH 1's lane follows CH 1 going up").toBeGreaterThan(Number(before[0]));
    expect(after[1], "CH 2's lane stays where CH 2 holds it").toBe(before[1]);
    expect(outUnlit(shell), "and each lane is drawn by its own").toEqual([unlitAt(0 - Number(after[0])), unlitAt(-30 - Number(after[1]))]);
  });

  it("takes the louder channel rather than the two together", async () => {
    const shell = await mount();
    await pick(shell, "Signal Type", "STEREO");
    await compOn(shell);
    await open(shell, "ch.comp", "ch2");
    const one = grBar(shell);
    levels["ch2"] = -12;
    await open(shell, "ch.comp", "ch2");
    expect(grBar(shell)).toBe(one);
  });

  it("lets a pair's insert hear both channels", async () => {
    const shell = await mount();
    levels = { ch1: -96, ch2: -12 };
    const ch1 = findStrip(shell.ctx.model, "ch1");
    if (!ch1) throw new Error("CH 1");
    expect(thresholdReduction(shell.ctx, ch1, -40), "apart, CH 1 hears nothing").toBe(0);
    await pick(shell, "Signal Type", "STEREO");
    expect(thresholdReduction(shell.ctx, ch1, -40), "linked, it hears CH 2").toBeGreaterThan(0);
  });

  it("holds each OUT lane of a pair in SSMCS down by its own channel", async () => {
    const shell = await mount();
    levels = { ch1: 0, ch2: -96 };
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "SSMCS");
    await shell.ctx.store.set("ch.ch1.ssmcs.compDrive", 10);
    await open(shell, "ch.ssmcs.comp", "ch2");
    const [left, right] = outOffsets(shell);
    expect([Number(left) > 0, right]).toEqual([true, 0]);
  });
});
