import { describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { insertCurveGainDb } from "../model/levels";
import { panLawDb } from "../model/pan-law";
import { unitById } from "../model/units";
import { blockReduction, meterLevels, shownLevels } from "./meters";
import { CUE_METER, drawAtOneMoment, gateSpec, tapId } from "./signal-flow";

// The synthetic signal is carried through the mixer the way the unit routes it.
// Each case reads two meters at one moment, so the signal's own wander cancels
// out of the difference between them.

const AT = 1_700_000_000_000;

async function unit(model: "URX44V" | "URX22" = "URX44V"): Promise<DeviceStore> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById(model))));
  return store;
}

/** Leave only `keep` of the input channels on a source; every other one on None. */
async function only(store: DeviceStore, ...keep: (string | string[])[]): Promise<void> {
  const kept = keep.flat();
  for (const id of ["ch1", "ch2", "ch3", "ch4", "ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"]) {
    if (!kept.includes(id)) await store.set(`ch.${id}.source`, "None");
  }
}

const read = (store: DeviceStore, id: string, at = AT): number[] => meterLevels(store, id, 2, at);
const mono = (store: DeviceStore, id: string, at = AT): number => meterLevels(store, id, 1, at)[0] ?? -96;
const SILENT = -96;

describe("the input sources", () => {
  it("put out -26 dB at their shipped D.Gain, give or take the wander, on every source a stereo channel ships on", async () => {
    const store = await unit();
    for (const id of ["ch_5_6", "ch_7_8", "ch_9_10", "ch_11_12"]) {
      for (let t = 0; t < 20_000; t += 997) {
        for (const db of read(store, tapId(id, "input"), AT + t)) {
          expect(db, `${id} at +${t} ms`).toBeGreaterThanOrEqual(-26 - 7.01);
          expect(db, `${id} at +${t} ms`).toBeLessThanOrEqual(-26 + 7.01);
        }
      }
    }
  });

  it("move with the source's D.Gain, which every channel on the source shares", async () => {
    const store = await unit();
    await store.set("ch.ch3.source", "USB MAIN A");
    const before = [mono(store, tapId("ch3", "input")), read(store, tapId("ch_7_8", "input"))[0] ?? SILENT];
    await store.set("source.usb-main-a.digitalGain", -4);
    const after = [mono(store, tapId("ch3", "input")), read(store, tapId("ch_7_8", "input"))[0] ?? SILENT];
    expect(after.map((db, i) => db - (before[i] ?? 0))).toEqual([10, 10].map((v) => expect.closeTo(v, 9)));
  });

  it("give a mono channel its own side of a stereo source: an odd channel the left, an even one the right", async () => {
    const store = await unit();
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch4.source", "USB MAIN A");
    const [l, r] = read(store, tapId("ch_7_8", "input"));
    expect([mono(store, tapId("ch3", "input")), mono(store, tapId("ch4", "input"))]).toEqual([l, r]);
  });

  it("sound microSD Playback only while a file plays, and None not at all", async () => {
    const store = await unit();
    await store.set("ch.ch_5_6.source", "microSD Playback");
    expect(read(store, tapId("ch_5_6", "input"))).toEqual([SILENT, SILENT]);
    await store.set("sd.playing", true);
    expect(Math.max(...read(store, tapId("ch_5_6", "input")))).toBeGreaterThan(-40);
    await store.set("ch.ch_5_6.source", "None");
    expect(read(store, tapId("ch_5_6", "input"))).toEqual([SILENT, SILENT]);
  });
});

describe("a channel into the stereo bus", () => {
  it("places a mono channel by the unit's pan law at every step", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    for (const pan of [-63, -40, -8, 0, 8, 40, 63]) {
      await store.set("ch.ch3.pan", pan);
      const input = mono(store, tapId("ch3", "input"));
      const [l, r] = panLawDb(pan);
      const expected = [l, r].map((g) => (g === Number.NEGATIVE_INFINITY ? SILENT : input + g));
      expect(read(store, tapId("bus.stereo", "sum")), `PAN ${pan}`).toEqual(expected.map((v) => expect.closeTo(v, 6)));
    }
    expect(panLawDb(-63)).toEqual([3, Number.NEGATIVE_INFINITY]);
    expect(panLawDb(32)).toEqual([-6, 1.5]);
  });

  it("takes each side of a stereo channel by its own side of the balance, with nothing crossing over", async () => {
    const store = await unit();
    await only(store, "ch_7_8");
    await store.set("ch.ch_7_8.balance", -63);
    const [inL] = read(store, tapId("ch_7_8", "input"));
    expect(read(store, tapId("bus.stereo", "sum"))).toEqual([expect.closeTo((inL ?? 0) + 3, 6), SILENT]);
  });

  it("puts a linked pair on its balance each channel on its own side: the odd one left, the even one right", async () => {
    const store = await unit();
    await only(store, "ch3", "ch4");
    for (const id of ["ch3", "ch4"]) {
      await store.set(`ch.${id}.source`, "USB MAIN A");
      await store.set(`ch.${id}.signalType`, "STEREO");
      await store.set(`ch.${id}.panBal`, "BAL");
    }
    await store.set("ch.ch3.balance", 0);
    const [l, r] = read(store, tapId("bus.stereo", "sum"));
    expect([l, r]).toEqual([mono(store, tapId("ch3", "input")), mono(store, tapId("ch4", "input"))].map((v) => expect.closeTo(v, 6)));
  });

  it("stops at the channel's [ON], its fader and its assign to the stereo bus", async () => {
    const store = await unit();
    await only(store, "ch_7_8");
    const [inL = 0] = read(store, tapId("ch_7_8", "input"));
    await store.set("ch.ch_7_8.level", -20);
    expect(read(store, tapId("bus.stereo", "sum"))[0]).toBeCloseTo(inL - 20, 6);
    await store.set("ch.ch_7_8.send.bus.stereo.on", false);
    expect(read(store, tapId("bus.stereo", "sum"))).toEqual([SILENT, SILENT]);
    await store.set("ch.ch_7_8.send.bus.stereo.on", true);
    await store.set("ch.ch_7_8.on", false);
    expect(read(store, tapId("bus.stereo", "sum"))).toEqual([SILENT, SILENT]);
  });
});

describe("signals meeting on a bus", () => {
  it("add as amplitudes where they are the same signal, and cancel where one is inverted", async () => {
    const store = await unit();
    await only(store, "ch3", "ch_7_8");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.pan", -63);
    await store.set("ch.ch_7_8.balance", -63);
    const one = mono(store, tapId("ch3", "input")) + 3;
    expect(read(store, tapId("bus.stereo", "sum"))[0]).toBeCloseTo(one + 20 * Math.log10(2), 6);
    await store.set("ch.ch3.phase", true);
    expect(read(store, tapId("bus.stereo", "sum"))[0]).toBe(SILENT);
  });

  it("add as powers where they are different signals", async () => {
    const store = await unit();
    await only(store, "ch_7_8", "ch_9_10");
    await store.set("ch.ch_7_8.balance", -63);
    await store.set("ch.ch_9_10.balance", -63);
    const [a = 0] = read(store, tapId("ch_7_8", "input"));
    const [b = 0] = read(store, tapId("ch_9_10", "input"));
    const power = 10 * Math.log10(10 ** ((a + 3) / 10) + 10 ** ((b + 3) / 10));
    expect(read(store, tapId("bus.stereo", "sum"))[0]).toBeCloseTo(power, 6);
  });

  it("add a sine oscillator to another signal as amplitudes, and pink noise as powers", async () => {
    const store = await unit();
    await only(store, "ch_7_8");
    await store.set("ch.ch_7_8.balance", -63);
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    const [a = 0] = read(store, tapId("ch_7_8", "input"));
    const amp = (db: number): number => 10 ** (db / 20);
    expect(read(store, tapId("bus.stereo", "sum"))[0]).toBeCloseTo(20 * Math.log10(amp(a + 3) + amp(-20)), 6);
    await store.set("osc.mode", "Pink Noise");
    expect(read(store, tapId("bus.stereo", "sum"))[0]).toBeCloseTo(10 * Math.log10(10 ** ((a + 3) / 10) + 10 ** (-22 / 10)), 6);
  });
});

describe("the sends", () => {
  it("take PRE after the EQ and before the fader, POST after it, and neither once the channel's [ON] is off", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.send.bus.mix1.level", 0);
    await store.set("ch.ch3.eq.lowMid.gain", 6);
    const pre = mono(store, tapId("ch3", "preFader"));
    await store.set("ch.ch3.level", -20);
    expect(read(store, tapId("bus.mix1", "sum"))[0], "POST").toBeCloseTo(pre - 20, 6);
    await store.set("ch.ch3.send.bus.mix1.pre", true);
    expect(read(store, tapId("bus.mix1", "sum"))[0], "PRE").toBeCloseTo(pre, 6);
    await store.set("ch.ch3.on", false);
    expect(read(store, tapId("bus.mix1", "sum")), "[ON] off").toEqual([SILENT, SILENT]);
  });

  it("place a send into a MIX bus by its own position, or by the channel's on FIXED and on Pan Link", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.send.bus.mix1.level", 0);
    await store.set("ch.ch3.send.bus.mix1.balance", -63);
    await store.set("ch.ch3.pan", 63);
    const input = mono(store, tapId("ch3", "input"));
    expect(read(store, tapId("bus.mix1", "sum")), "its own").toEqual([expect.closeTo(input + 3, 6), SILENT]);
    await store.set("ch.bus.mix1.panLink", true);
    expect(read(store, tapId("bus.mix1", "sum")), "Pan Link").toEqual([SILENT, expect.closeTo(input + 3, 6)]);
    await store.set("ch.bus.mix1.panLink", false);
    await store.set("ch.bus.mix1.busType", "FIXED");
    await store.set("ch.ch3.send.bus.mix1.level", -30);
    expect(read(store, tapId("bus.mix1", "sum")), "FIXED, at 0 dB whatever the send's level").toEqual([SILENT, expect.closeTo(input + 3, 6)]);
    await store.set("ch.ch3.send.bus.mix1.pre", true);
    await store.set("ch.ch3.level", -20);
    expect(read(store, tapId("bus.mix1", "sum")), "FIXED, after the fader whatever the send's tap").toEqual([SILENT, expect.closeTo(input + 3 - 20, 6)]);
  });

  it("fold a stereo channel into an FX bus as its two sides summed 3 dB down, whatever its balance", async () => {
    const store = await unit();
    await only(store, "ch_7_8");
    await store.set("ch.ch_7_8.send.fx1.level", 0);
    const [l = 0, r = 0] = read(store, tapId("ch_7_8", "post"));
    const folded = 10 * Math.log10((10 ** (l / 10) + 10 ** (r / 10)) / 2);
    expect(mono(store, tapId("fx1", "input"))).toBeCloseTo(folded, 6);
    await store.set("ch.ch_7_8.balance", -63);
    expect(mono(store, tapId("fx1", "input"))).toBeCloseTo(folded, 6);
  });
});

describe("the FX channels", () => {
  it("return each effect at its own level over what goes in", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.send.fx1.level", 0);
    const into = mono(store, tapId("fx1", "input"));
    // Each effect's own figures, left and right, as the unit's meters read them on pink noise.
    for (const [effect, l, r] of [["Rev-X Hall", -3, -3], ["Rev-X Room", -5, -6], ["Ping Pong", 0, 0]] as const) {
      await store.set("ch.fx1.effect.type", effect);
      expect(read(store, tapId("fx1", "effect")), effect).toEqual([into + l, into + r].map((v) => expect.closeTo(v, 6)));
    }
  });

  it("run FX 2 silent above 96 kHz, and FX 1 as it was", async () => {
    const store = await unit();
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    await store.set("osc.assign.fx1", true);
    await store.set("osc.assign.fx2", true);
    await store.set("setup.samplingFrequency", 192000);
    expect(mono(store, tapId("fx2", "input"))).toBe(SILENT);
    expect(read(store, tapId("fx2", "effect"))).toEqual([SILENT, SILENT]);
    expect(mono(store, tapId("fx1", "input"))).toBeCloseTo(-20, 6);
  });
});

describe("the buses", () => {
  it("take the oscillator into their sum, before their EQ", async () => {
    const store = await unit();
    await only(store);
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    await store.set("ch.bus.stereo.eq.lowMid.gain", -12);
    const [sum = 0] = read(store, tapId("bus.stereo", "sum"));
    expect(sum).toBeCloseTo(-20, 6);
    expect(read(store, tapId("bus.stereo", "preFader"))[0]).toBeLessThan(sum - 1);
  });

  it("send a MIX bus into the stereo bus at 0 dB after its fader, its balance and its insert, where TO ST is on", async () => {
    const store = await unit();
    await only(store);
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    await store.set("osc.assign.stereoL", false);
    await store.set("osc.assign.stereoR", false);
    await store.set("osc.assign.mix1L", true);
    expect(read(store, tapId("bus.stereo", "sum")), "TO ST ships off").toEqual([SILENT, SILENT]);
    await store.set("ch.bus.mix1.send.bus.stereo.on", true);
    await store.set("ch.bus.mix1.level", -10);
    expect(read(store, tapId("bus.stereo", "sum"))).toEqual([expect.closeTo(-30, 6), SILENT]);
  });
});

describe("the cue bus", () => {
  it("takes a channel before its fader, its [ON] and its position, on both sides", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.cue", true);
    await store.set("ch.ch3.level", -20);
    await store.set("ch.ch3.pan", -63);
    await store.set("ch.ch3.on", false);
    const pre = mono(store, tapId("ch3", "preFader"));
    expect(read(store, CUE_METER)).toEqual([pre, pre]);
  });

  it("takes a bus after its fader and its insert", async () => {
    const store = await unit();
    await only(store);
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    await store.set("ch.bus.stereo.level", -10);
    await store.set("ch.bus.stereo.cue", true);
    expect(read(store, CUE_METER)).toEqual([-30, -30].map((v) => expect.closeTo(v, 6)));
  });

  it("takes the place of a monitor's source while CUE Interrupt is on", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    await store.set("ch.ch3.cue", true);
    const pre = mono(store, tapId("ch3", "preFader"));
    expect(read(store, "monitor.1")).toEqual([pre, pre]);
    await store.set("monitor.1.cueInterrupt", false);
    expect(Math.max(...read(store, "monitor.1"))).toBeGreaterThan(pre + 1);
  });
});

describe("a monitor bus", () => {
  it("folds to mono as its two sides summed 3 dB down, after which its ON and LEVEL act", async () => {
    const store = await unit();
    await only(store);
    await store.set("osc.on", true);
    await store.set("osc.level", -20);
    await store.set("osc.assign.stereoR", false);
    await store.set("monitor.1.mono", true);
    expect(read(store, "monitor.1")).toEqual([-23, -23].map((v) => expect.closeTo(v, 1)));
    await store.set("osc.assign.stereoR", true);
    expect(read(store, "monitor.1")).toEqual([-17, -17].map((v) => expect.closeTo(v, 1)));
    await store.set("monitor.1.level", -20);
    expect(read(store, "monitor.1")).toEqual([-37, -37].map((v) => expect.closeTo(v, 1)));
    expect(read(store, tapId("monitor.1", "input")), "what the monitor takes in is before all of it").toEqual([-20, -20]);
  });
});

describe("the processing on a channel", () => {
  it("holds a gate shut by the noise's own level as its detector hears it, 2 dB under the meter", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.gate.on", true);
    const input = mono(store, tapId("ch3", "preGate"));
    await store.set("ch.ch3.gate.threshold", Math.round(input - 1));
    expect(blockReduction(store, gateSpec({ store, model: unitById("URX44V") }, unitById("URX44V").inputs[2]!), AT), "1 dB under the meter is shut").toBe(56);
    await store.set("ch.ch3.gate.threshold", Math.round(input - 3));
    expect(blockReduction(store, gateSpec({ store, model: unitById("URX44V") }, unitById("URX44V").inputs[2]!), AT), "3 dB under is open").toBe(0);
  });

  it("takes an amp insert through the unit's own curve", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.insFx.effect", "Drive");
    await store.set("ch.ch3.insFx.on", true);
    const into = mono(store, tapId("ch3", "preIns"));
    expect(mono(store, tapId("ch3", "preFader"))).toBeCloseTo(into + insertCurveGainDb("Drive", into), 6);
    expect(insertCurveGainDb("Drive", -42)).toBeCloseTo(30, 9);
    await store.set("setup.samplingFrequency", 192000);
    expect(mono(store, tapId("ch3", "preFader")), "above 96 kHz the insert passes the signal").toBeCloseTo(into, 6);
  });

  it("leaves a stereo channel's EQ out above 96 kHz", async () => {
    const store = await unit();
    await store.set("ch.ch_7_8.eq.lowMid.gain", 12);
    const [boosted = 0, input = 0] = [read(store, tapId("ch_7_8", "preFader"))[0], read(store, tapId("ch_7_8", "input"))[0]];
    expect(boosted).toBeGreaterThan(input + 1);
    await store.set("setup.samplingFrequency", 192000);
    expect(read(store, tapId("ch_7_8", "preFader"))[0]).toBeCloseTo(input, 9);
  });

  it("ducks a stereo channel by a key heard at the key channel's Rec Point", async () => {
    const store = await unit();
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("ch.ch3.gain", 0);
    await store.set("ch.ch_7_8.ducker.on", true);
    await store.set("ch.ch_7_8.ducker.source", "3");
    await store.set("ch.ch_7_8.ducker.threshold", -60);
    const [into = 0] = read(store, tapId("ch_7_8", "preDucker"));
    expect(read(store, tapId("ch_7_8", "post"))[0], "the key is well over the threshold").toBeCloseTo(into - 24, 6);
    await store.set("ch.ch3.recPoint", "PRE GATE");
    await store.set("ch.ch3.hpf.on", true);
    expect(read(store, tapId("ch_7_8", "post"))[0]).toBeCloseTo(into - 24, 6);
  });
});

describe("a DUCKER keyed by a bus", () => {
  it("hears the bus's two sides summed, 3 dB under the sum for a tone", async () => {
    const store = await unit();
    await only(store);
    await store.set("osc.on", true);
    await store.set("osc.level", -30);
    await store.set("osc.assign.stereoL", false);
    await store.set("osc.assign.stereoR", false);
    await store.set("osc.assign.mix1L", true);
    await store.set("osc.assign.mix1R", true);
    await store.set("ch.ch_7_8.source", "AUX IN");
    await store.set("ch.ch_7_8.ducker.on", true);
    await store.set("ch.ch_7_8.ducker.source", "MIX 1");
    await store.set("ch.ch_7_8.ducker.threshold", -28);
    const [into = 0] = read(store, tapId("ch_7_8", "preDucker"));
    // -30 on each side sums to 6 dB more; heard 3 dB under that is about 1 dB over the threshold.
    const heard = -30 + 20 * Math.log10(2) - 3;
    expect(read(store, tapId("ch_7_8", "post"))[0]).toBeCloseTo(into - (heard + 28), 6);
  });
});

describe("an insert's compander and M.B.Comp", () => {
  /** CH 3 alone on a source, at `db` as it goes into its insert, and MIX 1 fed from it after its fader. */
  async function into(store: DeviceStore, db: number, tone: boolean): Promise<void> {
    await only(store, tone ? [] : ["ch3"]);
    if (tone) {
      await store.set("osc.on", true);
      await store.set("osc.level", db);
      await store.set("osc.assign.stereoL", false);
      await store.set("osc.assign.stereoR", false);
      await store.set("osc.assign.mix1L", true);
      await store.set("osc.assign.mix1R", true);
      return;
    }
    await store.set("ch.ch3.source", "USB MAIN A");
    const [now = 0] = meterLevels(store, tapId("ch3", "preIns"), 1, AT);
    await store.set("source.usb-main-a.digitalGain", -14 + db - now);
  }

  // The unit's own readings at the effect's defaults, in → out, and how close the curve comes to them: within
  // what the curve's fit to the unit's sweeps left, 1.1 dB on the tone and 4.3 dB on pink noise for Compander-S.
  const measured: [string, boolean, number, number, number][] = [
    ["Compander-S", true, -20, -14, 1.5],
    ["Compander-S", true, -44, -43, 1.5],
    ["Compander-S", false, -36, -35, 4.5],
    ["Compander-H", true, -20, -26, 3.5],
    ["Compander-H", true, -26, -56, 3.5],
    ["Compander-H", false, -18, -44, 4.5],
  ];

  it("puts out a compander's level along its curve, as the unit does on a MIX bus", async () => {
    for (const [effect, tone, level, out, within] of measured) {
      const store = await unit();
      await into(store, level, tone);
      if (!tone) {
        await store.set("ch.ch3.send.bus.mix1.level", 0);
        await store.set("ch.ch3.send.bus.stereo.on", false);
      }
      await store.set("ch.bus.mix1.insFx.effect", effect);
      await store.set("ch.bus.mix1.insFx.on", true);
      const [inL = 0] = read(store, tapId("bus.mix1", "preIns"));
      const [outL = 0] = read(store, tapId("bus.mix1", "post"));
      expect(Math.abs(inL - level), `${effect} ${tone ? "tone" : "noise"} in`).toBeLessThan(0.01);
      expect(Math.abs(outL - out), `${effect} ${tone ? "tone" : "noise"} ${level} → ${out}, read ${outL.toFixed(1)}`).toBeLessThanOrEqual(within);
    }
  });

  it("reads a compander's reduction bar as how far its gain is under the gain on the flat of its curve", async () => {
    const store = await unit();
    await into(store, -20, true);
    await store.set("ch.bus.mix1.insFx.effect", "Compander-H");
    await store.set("ch.bus.mix1.insFx.on", true);
    const [inL = 0] = read(store, tapId("bus.mix1", "preIns"));
    const [outL = 0] = read(store, tapId("bus.mix1", "post"));
    // Threshold -10, ratio 3.5: the flat of the curve lifts the level 10 x (1 - 1/3.5) dB.
    const flat = 10 * (1 - 1 / 3.5);
    const spec = { kind: "over" as const, base: "ch.bus.mix1.insFx", level: tapId("bus.mix1", "preIns"), makeup: 0, detector: "companderH" as const, on: { path: "ch.bus.mix1.insFx.on", fallback: false } };
    expect(blockReduction(store, spec, AT)).toBeCloseTo(flat - (outL - inL), 6);
  });

  it("puts out M.B.Comp's level along the unit's own table", async () => {
    const store = await unit();
    await into(store, -20, true);
    await store.set("ch.bus.mix1.insFx.effect", "M.B.Comp");
    await store.set("ch.bus.mix1.insFx.on", true);
    expect(read(store, tapId("bus.mix1", "post"))[0]).toBeCloseTo(-16, 6);
  });
});

describe("the meters after a fader", () => {
  it("read over while what goes into the fader is over, the fader down and [ON] off, and pass nothing on", async () => {
    const store = await unit();
    await only(store, "ch3");
    await store.set("ch.ch3.source", "USB MAIN A");
    await store.set("source.usb-main-a.digitalGain", 24);
    await store.set("ch.ch3.eq.lowMid.gain", 18);
    await store.set("ch.ch3.on", false);
    await store.set("ch.ch3.level", -20);
    expect(mono(store, tapId("ch3", "preFader"))).toBeGreaterThanOrEqual(0);
    expect(mono(store, tapId("ch3", "post"))).toBe(0);
    expect(read(store, tapId("bus.stereo", "sum"))).toEqual([SILENT, SILENT]);
  });
});

describe("the streaming bus", () => {
  it("puts out what it is fed its DELAY later", async () => {
    const store = await unit();
    await store.set("ch.bus.stream.delay.on", true);
    await store.set("ch.bus.stream.delay.ms", 500);
    expect(read(store, tapId("bus.stream", "post"), AT)).toEqual(read(store, tapId("bus.stream", "input"), AT - 500));
    expect(read(store, tapId("bus.stream", "input"), AT)).toEqual(read(store, tapId("bus.stereo", "post"), AT));
  });
});

describe("a bar's fall", () => {
  it("rises at once and falls no faster than 30 dB a second", async () => {
    const store = await unit();
    await only(store);
    await store.set("osc.on", true);
    await store.set("osc.level", -6);
    expect(shownLevels(store, "osc", 1, AT)).toEqual([-6]);
    await store.set("osc.on", false);
    expect(shownLevels(store, "osc", 1, AT + 100)).toEqual([expect.closeTo(-9, 9)]);
    expect(shownLevels(store, "osc", 1, AT + 1000)).toEqual([expect.closeTo(-36, 9)]);
    await store.set("osc.on", true);
    expect(shownLevels(store, "osc", 1, AT + 1100)).toEqual([-6]);
  });
});

describe("the moment a screen reads at", () => {
  it("reads every meter of one draw at one moment, and each reading outside a draw at its own", async () => {
    const store = await unit();
    const id = tapId("ch_5_6", "input");
    let now = AT;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => (now += 250));
    try {
      const twice = (): number[][] => [meterLevels(store, id, 2), meterLevels(store, id, 2)];
      const [drawnFirst, drawnSecond] = drawAtOneMoment(twice);
      expect(drawnSecond).toEqual(drawnFirst);
      const [outer, inner, after] = drawAtOneMoment(() => [meterLevels(store, id, 2), drawAtOneMoment(() => meterLevels(store, id, 2)), meterLevels(store, id, 2)]);
      expect([inner, after], "a draw inside a draw keeps the outer one's moment").toEqual([outer, outer]);
      const [first, second] = twice();
      expect(second).not.toEqual(first);
    } finally {
      clock.mockRestore();
    }
  });
});

describe("a URX22", () => {
  it("carries its two mono channels through the same laws", async () => {
    const store = await unit("URX22");
    await store.set("ch.ch1.source", "USB MAIN A");
    await store.set("ch.ch1.pan", -63);
    await store.set("ch.ch2.source", "None");
    for (const id of ["ch_3_4", "ch_5_6", "ch_7_8", "ch_9_10"]) await store.set(`ch.${id}.source`, "None");
    expect(read(store, tapId("bus.stereo", "sum"))).toEqual([expect.closeTo(mono(store, tapId("ch1", "input")) + 3, 6), SILENT]);
  });
});
