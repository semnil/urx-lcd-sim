import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { COMP_DEFAULTS, SSMCS_DEFAULTS, factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";

// The unit holds COMP -> EQ and the morphing strip as two separate banks, and
// loads one of them whole when the type is taken. The EQ 1-knob has its own
// chain: taking a curve puts the level on that curve's neutral point, and
// switching the knob on takes the curve back to Intensity.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Mounted {
  shell: Shell;
  store: DeviceStore;
}

async function mount(): Promise<Mounted> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return { shell, store };
}

async function open(shell: Shell, id: string, strip: string): Promise<void> {
  shell.ctx.nav.push({ id, strip });
  await flush();
}

/** Take CH SETTING's COMP / EQ pulldown to `value`. */
async function pickCompEq(shell: Shell, value: string): Promise<void> {
  const field = [...shell.root.querySelectorAll<HTMLElement>(".chs-field")].find((f) =>
    (f.textContent ?? "").startsWith("COMP / EQ"),
  );
  field?.querySelector<HTMLElement>(".pulldown")?.click();
  await flush();
  [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === value)?.click();
  await flush();
}

describe("switching a channel's COMP / EQ type", () => {
  it("loads the morphing strip's factory values, and leaves the bank it came from", async () => {
    const { shell, store } = await mount();
    // Both banks are moved off their factory values first.
    await store.set("ch.ch1.ssmcs.morphing", 62);
    await store.set("ch.ch1.ssmcs.comp.ratio", 8);
    await store.set("ch.ch1.ssmcs.data", "07 Vocal");
    await store.set("ch.ch1.comp.threshold", -33);
    await store.set("ch.ch1.gate.threshold", -41);

    await open(shell, "ch.setting", "ch1");
    await pickCompEq(shell, "SSMCS");

    expect(store.num("ch.ch1.ssmcs.morphing", -1), "the bank taken is back at the factory").toBe(0);
    expect(store.num("ch.ch1.ssmcs.comp.ratio", -1)).toBe(SSMCS_DEFAULTS.ratio);
    expect(store.str("ch.ch1.ssmcs.data", "")).toBe(SSMCS_DEFAULTS.data);
    expect([store.bool("ch.ch1.comp.on", false), store.bool("ch.ch1.eq.on", false)], "and switched on").toEqual([
      true,
      true,
    ]);
    expect(store.num("ch.ch1.comp.threshold", 0), "the bank left keeps its own").toBe(-33);
    expect(store.num("ch.ch1.gate.threshold", 0), "GATE is the same either way").toBe(-41);
  });

  it("loads the COMP -> EQ bank's factory values on the way back", async () => {
    const { shell, store } = await mount();
    await open(shell, "ch.setting", "ch1");
    await pickCompEq(shell, "SSMCS");
    await store.set("ch.ch1.comp.threshold", -33);
    await store.set("ch.ch1.eq.low.gain", 7);
    await store.set("ch.ch1.eq.oneKnob.on", true);
    await store.set("ch.ch1.ssmcs.morphing", 62);

    await pickCompEq(shell, "COMP->EQ");
    expect(store.num("ch.ch1.comp.threshold", 0)).toBe(COMP_DEFAULTS.threshold);
    expect(store.num("ch.ch1.eq.low.gain", -1)).toBe(0);
    expect(store.bool("ch.ch1.eq.oneKnob.on", true)).toBe(false);
    expect(store.bool("ch.ch1.comp.on", true), "the compressor comes back off").toBe(false);
    expect(store.num("ch.ch1.ssmcs.morphing", -1), "and the morphing strip keeps its own").toBe(62);
  });

  it("leaves both banks alone when the type it is given is the one it holds", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.comp.threshold", -33);
    await open(shell, "ch.setting", "ch1");
    await pickCompEq(shell, "COMP->EQ");
    expect(store.num("ch.ch1.comp.threshold", 0)).toBe(-33);
  });
});

describe("the EQ 1-knob's chain", () => {
  const panel = (shell: Shell): Element | null => shell.root.querySelector(".oneknob-panel");

  it("puts the level on the neutral point of the curve that is taken", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.eq.oneKnob.on", true);
    await store.set("ch.ch1.eq.oneKnob.level", 30);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.eq", "ch1");

    panel(shell)?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "Vocal")?.click();
    await flush();
    expect([store.str("ch.ch1.eq.oneKnob.type", ""), store.num("ch.ch1.eq.oneKnob.level", -1)]).toEqual(["Vocal", 0]);

    panel(shell)?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "Intensity")?.click();
    await flush();
    expect([store.str("ch.ch1.eq.oneKnob.type", ""), store.num("ch.ch1.eq.oneKnob.level", -1)]).toEqual([
      "Intensity",
      50,
    ]);
  });

  it("takes the curve back to Intensity when the knob is switched on", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.eq.oneKnob.type", "Loudness");
    await store.set("ch.ch1.eq.oneKnob.level", 30);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.eq", "ch1");

    shell.root.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    expect([
      store.bool("ch.ch1.eq.oneKnob.on", false),
      store.str("ch.ch1.eq.oneKnob.type", ""),
      store.num("ch.ch1.eq.oneKnob.level", -1),
    ]).toEqual([true, "Intensity", 50]);

    // Switching it off leaves the curve and the level where the unit put them.
    panel(shell)?.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    expect([
      store.bool("ch.ch1.eq.oneKnob.on", true),
      store.str("ch.ch1.eq.oneKnob.type", ""),
      store.num("ch.ch1.eq.oneKnob.level", -1),
    ]).toEqual([false, "Intensity", 50]);
  });

  const bands = ["low", "lowMid", "highMid", "high"] as const;
  const gains = (store: DeviceStore): number[] => bands.map((b) => store.num(`ch.ch1.eq.${b}.gain`, NaN));

  it("scales the gains the bands stood at when it went on, by level / 50 under Intensity", async () => {
    // User guide, "How 1-knob EQ works": 50% is the EQ as set, 0% no EQ and
    // 100% more than the midpoint.
    const { shell, store } = await mount();
    for (const [b, db] of [["low", 6.5], ["lowMid", -3.3], ["highMid", 12], ["high", -10]] as const) {
      await store.set(`ch.ch1.eq.${b}.gain`, db);
    }
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.eq", "ch1");
    const curve = (): string | null | undefined => shell.root.querySelector(".eq-curve-line")?.getAttribute("points");
    const shaped = curve();
    shell.root.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    expect(gains(store), "switching it on leaves the curve as it was").toEqual([6.5, -3.3, 12, -10]);
    expect(curve()).toBe(shaped);

    await store.set("ch.ch1.eq.oneKnob.level", 0);
    await flush();
    expect(gains(store), "0% takes the EQ away").toEqual([0, 0, 0, 0]);
    expect(new Set(curve()?.split(" ").map((p) => p.split(",")[1])), "and the curve is flat").toEqual(new Set(["68.0"]));

    await store.set("ch.ch1.eq.oneKnob.level", 70);
    expect(gains(store), "each from where it stood, not from the last level, to a tenth of a dB").toEqual([9.1, -4.6, 16.8, -14]);
    await store.set("ch.ch1.eq.oneKnob.level", 100);
    expect(gains(store), "stopping at the ends of a band's range").toEqual([13, -6.6, 18, -18]);

    // Switching it off leaves the bands where the level put them.
    panel(shell)?.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    expect(gains(store)).toEqual([13, -6.6, 18, -18]);
  });

  it("sets Loudness's own curve when it is taken, and its level sets each band at its own rate", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.eq.low.gain", 6.5);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.eq", "ch1");
    shell.root.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    panel(shell)?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "Loudness")?.click();
    await flush();
    expect(
      bands.map((b) => [store.str(`ch.ch1.eq.${b}.shape`, ""), store.num(`ch.ch1.eq.${b}.q`, 0), store.num(`ch.ch1.eq.${b}.freq`, 0)]),
    ).toEqual([
      ["Bell", 0.56, 90],
      ["Bell", 1, 400],
      ["Bell", 1, 2000],
      ["H.Shelf", 1, 6000],
    ]);
    expect(gains(store), "at its neutral point, 0%, no gain").toEqual([0, 0, 0, 0]);

    await store.set("ch.ch1.eq.oneKnob.level", 50);
    expect(gains(store)).toEqual([10, -10, 1, 5]);
    await store.set("ch.ch1.eq.oneKnob.level", 100);
    expect(gains(store), "the two strongest stop at the ends").toEqual([18, -18, 2, 10]);

    // Intensity taken after it keeps Loudness's curve and scales from there.
    await store.set("ch.ch1.eq.oneKnob.level", 50);
    panel(shell)?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "Intensity")?.click();
    await flush();
    expect(gains(store)).toEqual([10, -10, 1, 5]);
    await store.set("ch.ch1.eq.oneKnob.level", 70);
    expect(gains(store)).toEqual([14, -14, 1.4, 7]);
  });

  it("lands Loudness's H-MID on a tenth of a dB below its 10% steps", async () => {
    const { store } = await mount();
    await store.set("ch.ch1.eq.oneKnob.on", true);
    await store.set("ch.ch1.eq.oneKnob.type", "Loudness");
    for (const [level, db] of [[1, 0], [3, 0.1], [97, 1.9], [98, 2]] as const) {
      await store.set("ch.ch1.eq.oneKnob.level", level);
      expect(store.num("ch.ch1.eq.highMid.gain", NaN), `${level}%`).toBe(db);
    }
  });

  it("sets Vocal's own curve when it is taken, and its level walks LOW's corner and the three gains", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.eq.lowMid.gain", 6.5);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.eq", "ch1");
    shell.root.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    panel(shell)?.querySelector<HTMLElement>(".pulldown")?.click();
    await flush();
    [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === "Vocal")?.click();
    await flush();
    const state = (): unknown[] => [
      store.bool("ch.ch1.eq.low.on", true),
      store.str("ch.ch1.eq.low.shape", ""),
      store.num("ch.ch1.eq.low.freq", 0),
      ...gains(store).slice(1),
    ];
    expect(
      bands.map((b) => [store.str(`ch.ch1.eq.${b}.shape`, ""), store.num(`ch.ch1.eq.${b}.q`, 0), store.num(`ch.ch1.eq.${b}.freq`, 0)]),
    ).toEqual([
      ["HPF", 0.71, 80],
      ["Bell", 0.71, 335],
      ["Bell", 0.71, 3000],
      ["Bell", 0.71, 8000],
    ]);
    expect(state(), "at 0% LOW is off and nothing is lifted").toEqual([false, "HPF", 80, 0, 0, 0]);
    for (const [level, want] of [
      [1, [true, "HPF", 80, 0, 0, 0]],
      [17, [true, "HPF", 100, -0.7, 0.1, 0.1]],
      [50, [true, "HPF", 125, -4.2, 0.3, 0.4]],
      // HIGH peaks at 77% and falls back to nothing by 93%.
      [77, [true, "HPF", 132, -6, 0.5, 2]],
      [78, [true, "HPF", 132, -6, 0.5, 1.9]],
      [100, [true, "HPF", 140, -6, 2, 0]],
    ] as const) {
      await store.set("ch.ch1.eq.oneKnob.level", level);
      expect(state(), `${level}%`).toEqual(want);
    }
  });

  it("leaves the COMP 1-knob writing its own switch alone", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.comp.oneKnob.level", 30);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.comp", "ch1");
    shell.root.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    expect([store.bool("ch.ch1.comp.oneKnob.on", false), store.num("ch.ch1.comp.oneKnob.level", -1)]).toEqual([
      true,
      30,
    ]);
  });
});

describe("COMP's makeup gain while Auto Makeup is on", () => {
  it("reads it out on the bar and does not turn it", async () => {
    const { shell, store } = await mount();
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.comp", "ch1");
    const gain = (): HTMLElement | undefined =>
      [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")].find(
        (c) => c.querySelector(".knob-cell-label")?.textContent === "Gain",
      );
    expect(gain()?.classList.contains("is-driven")).toBe(false);
    expect(gain()?.getAttribute("aria-disabled")).toBeNull();

    await store.set("ch.ch1.comp.autoMakeup", true);
    await flush();
    const before = store.num("ch.ch1.comp.gain", 0);
    expect(gain()?.querySelector(".knob-cell-value")?.textContent, "the reading stays").toBe("2.0dB");
    expect(gain()?.classList.contains("is-driven")).toBe(true);
    expect(gain()?.getAttribute("aria-disabled")).toBe("true");

    gain()?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await flush();
    expect(store.num("ch.ch1.comp.gain", 0), "and the key does not move it").toBe(before);
  });
});
