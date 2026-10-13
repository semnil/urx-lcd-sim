import { afterEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { readCard } from "../model/card";
import { factoryState } from "../model/defaults";
import { levelBarShare } from "../model/dynamics";
import { captureScene } from "../model/scene-state";
import { captureSettings } from "../model/settings-file";
import { findStrip } from "../model/types";
import { digitalGainPath } from "../model/source-gain";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { meterLevels, startMeterTicker, tapId } from "./meters";
import { recallScene, storeScene } from "./scene";
import { compDetectorShared } from "./stereo-link";

// What the dynamics of a stereo-linked CH 1 / CH 2 pair hear, with CH 1 carrying a
// signal and CH 2 silent: GATE and an insert hear the pair's louder channel; COMP
// hears it from the moment the pair is linked until the linked pair is taken into
// SSMCS, and each channel its own after that; SSMCS hears each channel its own.
// The clock stands still but for the ticker's own steps, so each channel arrives
// at the level it is put at.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.useRealTimers());

/** The source each channel of the pair is on, so each is set apart by its own D.Gain. */
const SOURCES: Record<string, string> = { ch1: "USB MAIN A", ch2: "USB MAIN B" };

/** Bring channel `id` in at `db`: its source's D.Gain moved so it arrives there now, or its source on None for silence. */
async function level(shell: Shell, id: string, db: number): Promise<void> {
  const store = shell.ctx.store;
  const source = SOURCES[id] ?? "";
  if (db <= -96) {
    await store.set(`ch.${id}.source`, "None");
    return;
  }
  await store.set(`ch.${id}.source`, source);
  const [now = 0] = meterLevels(store, tapId(id, "input"), 1);
  await store.set(digitalGainPath(source), store.num(digitalGainPath(source), -14) + db - now);
}

async function mount(): Promise<Shell> {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(1_700_000_000_000);
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  await level(shell, "ch1", -12);
  await level(shell, "ch2", -96);
  return shell;
}

/** Run the meter ticker once. */
function tick(shell: Shell): void {
  const stop = startMeterTicker(shell.ctx.store, shell.root, 20);
  vi.advanceTimersByTime(20);
  stop();
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

/** What a level meter leaves unlit at `db`. */
const unlitAt = (db: number): string => `${(1 - levelBarShare(db)) * 100}%`;

/** The two meters of the screen open now, IN and OUT, as they read now, lane by lane. */
const inOut = (shell: Shell): number[][] =>
  [...shell.root.querySelectorAll<HTMLElement>(".dyn-io .meter")].map((m) =>
    meterLevels(shell.ctx.store, m.dataset["meterSource"] ?? "", m.querySelectorAll(".meter-bar").length),
  );

/** How far under its IN each OUT lane of the screen open now reads, in dB. */
const outOffsets = (shell: Shell): number[] => {
  const [into = [], out = []] = inOut(shell);
  return out.map((db, i) => Math.round(((into[i] ?? -96) - db) * 1e6) / 1e6);
};

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
    // CH 2 carries a signal under the threshold, so its lane shows what is taken off it.
    await level(shell, "ch2", -30);
    await pick(shell, "Signal Type", "STEREO");
    await compOn(shell);
    await open(shell, "ch.comp", "ch1");
    const own = grBar(shell);
    const ownOut = outOffsets(shell);
    expect(own, "CH 1 is over the threshold").toBeGreaterThan(0);
    await open(shell, "ch.comp", "ch2");
    expect(grBar(shell), "CH 2's screen reads the same reduction").toBe(own);
    expect(outOffsets(shell), "and takes it off both OUT lanes").toEqual(ownOut);
    expect(ownOut).toHaveLength(2);
    expect(ownOut[1], "alike").toBeCloseTo(ownOut[0] ?? NaN, 6);
  });

  it("lets each channel's COMP hear its own channel once the linked pair has been through SSMCS, until it is linked again", async () => {
    const shell = await mount();
    // CH 2 carries a signal under the threshold, so its lane shows where it is drawn.
    await level(shell, "ch2", -30);
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
    expect(outUnlit(shell).map(Number.parseFloat), "each lane drawn by its own").toEqual(
      [unlitAt(-12 - Number(left)), unlitAt(-30 - Number(right))].map((u) => expect.closeTo(Number.parseFloat(u), 4)),
    );

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
    await level(shell, "ch2", -30);
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "SSMCS");
    await pick(shell, "COMP / EQ", "COMP->EQ");
    await compOn(shell);
    await open(shell, "ch.comp", "ch2");
    const before = outOffsets(shell);
    await level(shell, "ch1", 0);
    tick(shell);
    const after = outOffsets(shell);
    expect(after).toHaveLength(2);
    expect(Number(after[0]), "CH 1's lane follows CH 1 going up").toBeGreaterThan(Number(before[0]));
    expect(after[1], "CH 2's lane stays where CH 2 holds it").toBe(before[1]);
    const [, out = []] = inOut(shell);
    expect(outUnlit(shell), "and each lane is drawn by its own").toEqual(out.map(unlitAt));
  });

  it("takes the louder channel rather than the two together", async () => {
    const shell = await mount();
    await pick(shell, "Signal Type", "STEREO");
    await compOn(shell);
    await open(shell, "ch.comp", "ch2");
    const one = grBar(shell);
    await level(shell, "ch2", -12);
    await open(shell, "ch.comp", "ch2");
    expect(grBar(shell)).toBe(one);
  });

  it("holds each OUT lane of a pair in SSMCS down by its own channel", async () => {
    const shell = await mount();
    // CH 2 carries a signal well under the corner, so its lane shows what is taken off it.
    await level(shell, "ch1", 0);
    await level(shell, "ch2", -60);
    await pick(shell, "Signal Type", "STEREO");
    await pick(shell, "COMP / EQ", "SSMCS");
    await shell.ctx.store.set("ch.ch1.ssmcs.compDrive", 10);
    await open(shell, "ch.ssmcs.comp", "ch2");
    const [left, right] = outOffsets(shell);
    expect([Number(left) > 0, right]).toEqual([true, 0]);
  });
});

describe("SSMCS's and a Compander's reduction as the signal moves", () => {
  /** The reduction bar and the OUT offsets the screen open now shows. */
  const reading = (shell: Shell): { gr: string | undefined; out: number[] } => ({
    gr: shell.root.querySelector<HTMLElement>(".dyn-gr i")?.style.height,
    out: outOffsets(shell),
  });

  /**
   * Take the screen from silence to CH 1 at 0 dB and back, reading it after the
   * ticker has run and again after the screen is opened afresh: the two agree.
   */
  async function follow(shell: Shell, screen: string): Promise<void> {
    await level(shell, "ch1", -96);
    await level(shell, "ch2", -96);
    await open(shell, screen, "ch1");
    const silent = reading(shell);
    for (const [step, db] of [["over the threshold", 0], ["back under it", -96]] as const) {
      await level(shell, "ch1", db);
      tick(shell);
      const ticked = reading(shell);
      await open(shell, screen, "ch1");
      expect(ticked, `${screen} ${step}: the ticker reads what the screen reads when opened`).toEqual(reading(shell));
      if (db === 0) expect(ticked.gr, `${screen} ${step}: the bar holds it down`).not.toBe("0%");
      else expect(ticked, `${screen} ${step}: as it read in silence`).toEqual(silent);
    }
  }

  async function ssmcs(shell: Shell): Promise<void> {
    await pick(shell, "COMP / EQ", "SSMCS");
    await shell.ctx.store.set("ch.ch1.ssmcs.compDrive", 10);
    await shell.ctx.store.set("ch.ch2.ssmcs.compDrive", 10);
  }

  async function compander(shell: Shell): Promise<void> {
    await shell.ctx.store.set("ch.ch1.insFx.effect", "Compander-S");
    await shell.ctx.store.set("ch.ch1.insFx.on", true);
    await shell.ctx.store.set("ch.ch1.insFx.threshold", -40);
  }

  it("keeps SSMCS's reduction and OUT moving on a mono channel", async () => {
    const shell = await mount();
    await ssmcs(shell);
    await follow(shell, "ch.ssmcs");
    await follow(shell, "ch.ssmcs.comp");
  });

  it("keeps SSMCS's reduction and each OUT lane moving on a linked pair", async () => {
    const shell = await mount();
    await pick(shell, "Signal Type", "STEREO");
    await ssmcs(shell);
    await follow(shell, "ch.ssmcs");
    await follow(shell, "ch.ssmcs.comp");
  });

  it("keeps a Compander's reduction and OUT moving on a mono channel", async () => {
    const shell = await mount();
    await compander(shell);
    await follow(shell, "ch.insfx");
  });

  it("lets a Compander that is switched off stop holding the signal down as the meters move", async () => {
    const shell = await mount();
    await compander(shell);
    await level(shell, "ch1", 0);
    await open(shell, "ch.insfx", "ch1");
    expect(reading(shell).gr, "on, it holds CH 1 down").not.toBe("0%");
    await shell.ctx.store.set("ch.ch1.insFx.on", false);
    tick(shell);
    expect(reading(shell), "off, the ticker lets go").toEqual({ gr: "0%", out: [0] });
  });

  it("keeps a Compander's reduction and OUT moving on a linked pair", async () => {
    const shell = await mount();
    await pick(shell, "Signal Type", "STEREO");
    await compander(shell);
    await follow(shell, "ch.insfx");
    // CH 2 alone sets the pair's gain too, on CH 1's screen: CH 1 is well under the threshold, and alone
    // its lane would be lifted by the whole flat of the curve, 30 dB at -40 dB and 4:1.
    await level(shell, "ch1", -60);
    await level(shell, "ch2", 0);
    await open(shell, "ch.insfx", "ch1");
    const [left = 0, right = 0] = reading(shell).out;
    expect(left, "CH 2's signal sets both lanes' gain").toBeCloseTo(right, 6);
    expect(left, "not CH 1's own").toBeGreaterThan(-20);
    expect(reading(shell).gr, "and the bar holds it down").not.toBe("0%");
  });
});
