import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ParamValue } from "../device/path";
import { factoryState, onlyHeld } from "./defaults";
import { digitalGainPath, digitalGainShipped } from "./source-gain";
import { unitById } from "./units";

const SOURCE_DIRS = [join(process.cwd(), "src", "screens"), join(process.cwd(), "src", "app")];

/**
 * `store.num("path", fallback)` and its bool / str siblings, with a literal path
 * and a literal fallback. A template path (`ch.${id}.level`) cannot be resolved
 * here and is skipped.
 */
const READ = /store\.(num|bool|str)\(\s*"([A-Za-z0-9._]+)"\s*,\s*("(?:[^"\\]|\\.)*"|true|false|-?\d+(?:\.\d+)?)\s*\)/g;

function literalReads(): { file: string; path: string; fallback: string | number | boolean }[] {
  const out: { file: string; path: string; fallback: string | number | boolean }[] = [];
  for (const dir of SOURCE_DIRS) {
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))) {
      const text = readFileSync(join(dir, file), "utf8");
      for (const m of text.matchAll(READ)) {
        const [, , path, raw] = m;
        if (!path || raw === undefined) continue;
        const fallback = raw === "true" ? true : raw === "false" ? false : raw.startsWith('"') ? JSON.parse(raw) : Number(raw);
        out.push({ file, path, fallback });
      }
    }
  }
  return out;
}

describe("power-on state", () => {
  it("agrees with every fallback a screen reads it with", () => {
    // A screen reads through a fallback whenever the store has not been seeded,
    // so a fallback that disagrees with the seeded value is a second, silent
    // set of defaults — the screen shows one number before the first write and
    // another after.
    const seeded = factoryState(unitById("URX44V"));
    const disagreements = literalReads()
      .filter((r) => seeded.has(r.path))
      .filter((r) => seeded.get(r.path) !== r.fallback)
      .map((r) => `${r.file}: ${r.path} reads ${JSON.stringify(r.fallback)}, seeded ${JSON.stringify(seeded.get(r.path))}`);
    expect(disagreements).toEqual([]);
  });

  it("finds enough of those reads that the check above cannot pass vacuously", () => {
    const seeded = factoryState(unitById("URX44V"));
    expect(literalReads().filter((r) => seeded.has(r.path)).length).toBeGreaterThan(10);
  });

  it("ships the oscillator assigned to the stereo bus and to nothing else", () => {
    const seeded = factoryState(unitById("URX44V"));
    const assigned = ["mix1L", "mix1R", "mix2L", "mix2R", "fx1", "fx2", "stereoL", "stereoR"].map(
      (id) => [id, seeded.get(`osc.assign.${id}`)] as const,
    );
    expect(assigned).toEqual([
      ["mix1L", false],
      ["mix1R", false],
      ["mix2L", false],
      ["mix2R", false],
      ["fx1", false],
      ["fx2", false],
      ["stereoL", true],
      ["stereoR", true],
    ]);
  });

  it("names every strip the way the unit does", () => {
    const seeded = factoryState(unitById("URX44V"));
    expect(seeded.get("ch.ch1.name")).toBe("ch 1");
    expect(seeded.get("ch.ch_5_6.name")).toBe(" 5/ 6");
    expect(seeded.get("ch.ch_11_12.name")).toBe("11/12");
    expect(seeded.get("ch.fx1.name")).toBe("FX 1");
    expect(seeded.get("ch.bus.mix1.name")).toBe("MIX1");
    expect(seeded.get("ch.bus.stereo.name")).toBe("ST");
    expect(seeded.get("ch.bus.stream.name")).toBe("Strm");
  });

  it("puts the USB MAIN and USB SUB returns 14 dB down and every other source at unity", () => {
    for (const id of ["URX22", "URX44", "URX44V"] as const) {
      const seeded = factoryState(unitById(id));
      for (const source of ["USB MAIN A", "USB MAIN B", "USB MAIN C", "USB SUB"]) {
        expect(seeded.get(digitalGainPath(source)), `${id} ${source}`).toBe(-14);
        expect(digitalGainShipped(source)).toBe(-14);
      }
      for (const source of ["AUX IN", "USB DAW 1/2", "microSD Playback", "HDMI"]) {
        expect(seeded.has(digitalGainPath(source)), `${id} ${source} is read at its shipped value`).toBe(false);
        expect(digitalGainShipped(source)).toBe(0);
      }
      // No channel holds a digital gain of its own.
      expect([...seeded.keys()].filter((p) => /^ch\.ch_\d+_\d+\.gain$/.test(p))).toEqual([]);
    }
  });

  it("ships the user-defined knobs on the assignments the unit ships with", () => {
    const seeded = factoryState(unitById("URX44V"));
    const banks = [1, 2, 3, 4].map((bank) => ["A", "B", "C", "D"].map((knob) => seeded.get(`setup.udk.${bank}.${knob}`)));
    expect(banks).toEqual([
      ["Phones 1 Level", "Phones 2 Level", "No Assign", "No Assign"],
      ["Brightness Screen", "No Assign", "No Assign", "Oscillator Level"],
      ["Monitor 1 Level", "Monitor 2 Level", "No Assign", "No Assign"],
      ["No Assign", "No Assign", "No Assign", "No Assign"],
    ]);
    expect(seeded.get("setup.udk.bank"), "on bank 1").toBe(1);
  });

  it("seeds the microSD recorder only on the models that have the card slot", () => {
    expect(factoryState(unitById("URX44V")).get("sd.trackCount")).toBe(16);
    expect(factoryState(unitById("URX44")).get("sd.trackCount")).toBe(16);
    expect(factoryState(unitById("URX22")).has("sd.trackCount")).toBe(false);
    // The last track pair carries the STEREO master, so a 16-track recording
    // has the mix as well as the channels.
    expect(factoryState(unitById("URX44V")).get("sd.track.7")).toBe("STEREO");
  });

  it("gives every input channel the same colour", () => {
    const model = unitById("URX44V");
    const inputColours = new Set(model.inputs.map((s) => s.color));
    expect(inputColours.size).toBe(1);
  });
});

/**
 * Values the unit does not hold: a send into the stereo bus's level, tap and
 * placing, a send into an FX bus's placing, the EQ of FX 1, FX 2 and STREAMING,
 * STREAMING's insert, fader and [ON], and the BALANCE of a mono pair's
 * higher-numbered channel.
 */
const NOT_HELD = [
  /\.send\.bus\.stereo\.(level|pre|balance)$/,
  /\.send\.fx[12]\.balance$/,
  /^ch\.(fx[12]|bus\.stream)\.eq\./,
  /^ch\.bus\.stream\.(level|on|insFx\..+)$/,
  /^ch\.ch[24]\.balance$/,
];

/** One of each kind of value the unit does not hold, as a URX44V's save can still name it. */
const UNHELD: Record<string, ParamValue> = {
  "ch.ch1.send.bus.stereo.level": -10,
  "ch.ch1.send.bus.stereo.pre": true,
  "ch.ch_5_6.send.bus.stereo.balance": 20,
  "ch.fx1.send.bus.stereo.level": -3,
  "ch.bus.mix1.send.bus.stereo.pre": true,
  "ch.ch1.send.fx1.balance": -30,
  "ch.ch_11_12.send.fx2.balance": 30,
  "ch.fx1.eq.low.gain": 6,
  "ch.fx2.eq.oneKnob.on": true,
  "ch.bus.stream.eq.on": false,
  "ch.bus.stream.insFx.effect": "M.B.Comp",
  "ch.bus.stream.level": -6,
  "ch.bus.stream.on": false,
  "ch.ch2.balance": 40,
  "ch.ch4.balance": -40,
};

/** Their neighbours, which the unit does hold. */
const HELD: Record<string, ParamValue> = {
  "ch.ch1.send.bus.stereo.on": false,
  "ch.ch1.send.fx1.level": -12,
  "ch.ch1.send.bus.mix1.balance": 20,
  "ch.bus.mix1.eq.on": false,
  "ch.bus.stereo.insFx.on": true,
  "ch.bus.stream.delay.on": true,
  "ch.ch1.balance": 10,
  "ch.ch3.balance": -10,
  "ch.ch1.level": -4,
  "setup.outputPatch.lineOut": "MIX 2",
};

describe("what the unit does not hold", () => {
  it.each(["URX22", "URX44", "URX44V"] as const)("ships none of it, and ships its neighbours (%s)", (id) => {
    const model = unitById(id);
    const seeded = factoryState(model);
    expect([...seeded.keys()].filter((p) => NOT_HELD.some((r) => r.test(p)))).toEqual([]);
    expect(seeded.has("setup.outputPatch.lineOut"), "LINE OUT's patch, on a unit with a LINE OUT").toBe(model.hasLineOut);
    // A URX22 has no CH 3 of its own: its CH 3/4 is a stereo input.
    const neighbours = Object.keys(HELD).filter((p) => p.startsWith("ch.") && !(id === "URX22" && p === "ch.ch3.balance"));
    expect(neighbours.filter((p) => !seeded.has(p))).toEqual([]);
  });

  it("is left out of what a save, a scene or a settings file puts back, and the rest is kept", () => {
    expect(onlyHeld(unitById("URX44V"), { ...UNHELD, ...HELD })).toEqual(HELD);
    expect(Object.keys(UNHELD).filter((p) => !NOT_HELD.some((r) => r.test(p))), "every value above is one of those kinds").toEqual([]);
  });

  it("leaves LINE OUT's patch out on a unit without a LINE OUT alone", () => {
    const patch = { "setup.outputPatch.lineOut": "MIX 2" };
    expect([onlyHeld(unitById("URX22"), patch), onlyHeld(unitById("URX44"), patch)]).toEqual([{}, patch]);
  });
});
