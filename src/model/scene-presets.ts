// The scenes the unit ships: 00 Initial Data, Simple Mode's presets P01 Live
// Music 0, P02 Streaming 0 and P03 DAW Rec 0 (user guide, "Selecting the
// presets and use cases"), and since System firmware V1.5 Standard Mode's P04
// Music Production, P05 DAW Streaming, P06 Sing&Talk Stream and P07 Game
// Streaming. A preset is 00 Initial Data with its own settings laid over it;
// what a preset does not set stays as 00 holds it.

import type { ParamPath, ParamValue } from "../device/path";
import { chPath } from "../device/path";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { factoryState } from "./defaults";
import { inScene } from "./scene-state";
import { digitalGainPath } from "./source-gain";
import type { UnitModel } from "./types";

/** Settings on one strip, keyed by the path under the strip. */
type Settings = Readonly<Record<string, ParamValue>>;

/** What P01 to P03 set on a mono channel: the fader down, the MIX sends taken before it, a send into FX 1 at -16 dB and none into FX 2, and SSMCS off. */
const MONO: Settings = {
  level: LEVEL_MIN_DB,
  "ssmcs.on": false,
  "send.bus.mix1.pre": true,
  "send.bus.mix2.pre": true,
  "send.fx1.level": -16,
  "send.fx2.on": false,
};

/**
 * The compressor and the 1-knob EQ curve P01 and P02 give a mono channel. The
 * curve stands at Intensity 50 over gains kept apart from the bands: the bands'
 * own, except HIGH, kept at +7 dB while its band stands at 0 dB.
 */
const MIC_CURVE: Settings = {
  "comp.threshold": -10,
  "comp.ratio": 4,
  "comp.gain": 4.5,
  "comp.attack": 18.99,
  "comp.release": 100.1,
  "comp.knee": "Soft",
  "eq.oneKnob.on": true,
  "eq.oneKnob.level": 50,
  "eq.low.shape": "HPF",
  "eq.low.freq": 140,
  "eq.lowMid.q": 0.5,
  "eq.lowMid.freq": 400,
  "eq.lowMid.gain": -8,
  "eq.highMid.q": 1.19,
  "eq.highMid.freq": 3000,
  "eq.highMid.gain": -3,
  "eq.high.shape": "Bell",
  "eq.high.q": 1.19,
  "eq.high.freq": 11800,
  "eq.oneKnob.base.low": 0,
  "eq.oneKnob.base.lowMid": -8,
  "eq.oneKnob.base.highMid": -3,
  "eq.oneKnob.base.high": 7,
};

/** A dynamic mic on P01 and P02: the compressor and EQ in, the high-pass filter in. */
const LIVE_MIC: Settings = { ...MONO, ...MIC_CURVE, name: "Dyn.Mic", gain: 40, clipSafe: true, "hpf.on": true, "comp.on": true };
/** A guitar or bass on P02, on the high-impedance input with the compressor and EQ out. */
const STREAM_INSTRUMENT: Settings = { ...MONO, ...MIC_CURVE, name: "Gt./Ba.", gain: 15, clipSafe: true, hiZ: true, "eq.on": false, "send.fx1.on": false };
/** A dynamic mic on P03, recorded before the gate, with the EQ out. */
const DAW_MIC: Settings = { ...MONO, name: "Dyn.Mic", gain: 40, clipSafe: true, recPoint: "PRE GATE", "eq.on": false, "send.fx1.on": false };
/** A guitar or bass on P03. */
const DAW_INSTRUMENT: Settings = { ...DAW_MIC, name: "Gt./Ba.", gain: 15, hiZ: true };

/** What P01 to P03 set on a stereo channel: the fader down, the MIX sends before it, the FX sends off, and the ducker's range at -56 dB. */
const STEREO: Settings = {
  level: LEVEL_MIN_DB,
  "send.bus.mix1.pre": true,
  "send.bus.mix2.pre": true,
  "send.fx1.level": -8,
  "send.fx1.on": false,
  "send.fx2.on": false,
  "ducker.range": -56,
};

/** A stereo channel fed from a source, named after it. */
const fed = (source: string, name: string, extra: Settings = {}): Settings => ({ ...STEREO, source, name, ...extra });

/** A stereo channel a preset leaves unfed: named None, its EQ out, and each band's Q at 0.70. */
const UNFED: Settings = fed("None", "None", {
  "eq.on": false,
  "eq.low.q": 0.7,
  "eq.lowMid.q": 0.7,
  "eq.highMid.q": 0.7,
  "eq.high.q": 0.7,
});

/** A stereo channel on P03, recorded before its EQ. */
const dawStereo = (settings: Settings): Settings => ({ ...settings, recPoint: "PRE EQ" });

/** What P01 to P03 set on the buses: STEREO down, FX 1 a plate reverb returned at 0 dB, FX 2 off and unnamed, and MIX 2 named MIX3. */
const BUSES: Readonly<Record<string, Settings>> = {
  "bus.stereo": { level: LEVEL_MIN_DB },
  "bus.mix2": { name: "MIX3" },
  fx1: {
    name: "Reverb",
    level: 0,
    "send.bus.mix1.level": 0,
    "send.bus.mix2.level": 0,
    "effect.type": "Rev-X Plate",
    "effect.revTime": 19,
    "effect.initialDelay": 22.1,
    "effect.decay": 11,
    "effect.roomSize": 8,
    "effect.diffusion": 8,
    "effect.hpf": 250,
    "effect.lpf": 11200,
    "effect.hiRatio": 0.8,
    "effect.lowRatio": 0.9,
    "effect.lowFreq": 250,
  },
  fx2: { name: "", on: false, "send.bus.mix1.level": 0, "send.bus.mix2.level": 0 },
};

/** The sources whose digital gain P01 to P03 set, all of them to 0 dB. */
const PRESET_SOURCES = ["AUX IN", "USB MAIN A", "USB MAIN B", "USB MAIN C", "USB SUB"];

/** Settings on the strips other than the channels, keyed by strip. */
type Strips = Readonly<Record<string, Settings>>;

/**
 * What 00 Initial Data holds over the factory mixer, and every preset with it:
 * each MIX's GEQ Link off (00 and P04 to P07 confirmed on a URX22 and a URX44V,
 * P01 to P03 on a URX22).
 */
const INITIAL_DATA: Strips = { "bus.mix1": { "geq.link": "Off" }, "bus.mix2": { "geq.link": "Off" } };

interface Preset {
  /** The mono channels, CH 1 up, four of them. */
  mono: readonly Settings[];
  /** Which two of them, by place in `mono`, a unit with two mono channels takes onto its CH 1 and CH 2. */
  twoMono: readonly [number, number];
  /** The stereo channels, the lowest-numbered first. */
  stereo: readonly Settings[];
  /** The other strips' settings. */
  strips: Strips;
  /** The sources whose digital gain the preset sets to 0 dB. */
  zeroGain?: readonly string[];
  /** The output patch, by the path under `setup.outputPatch`. */
  outputPatch?: Readonly<Record<string, string>>;
}

/**
 * P01 to P03 (confirmed on a URX22): a URX22's CH 1 takes the preset's CH 1, and
 * its CH 2, on the HI-Z connector, the preset's CH 3.
 */
const SIMPLE_PRESETS: readonly Preset[] = [
  {
    mono: [LIVE_MIC, LIVE_MIC, LIVE_MIC, LIVE_MIC],
    twoMono: [0, 2],
    stereo: [fed("AUX IN", "AUX"), fed("USB MAIN A", "USB A"), fed("USB SUB", "USB SUB"), UNFED],
    strips: BUSES,
    zeroGain: PRESET_SOURCES,
  },
  {
    mono: [LIVE_MIC, LIVE_MIC, STREAM_INSTRUMENT, STREAM_INSTRUMENT],
    twoMono: [0, 2],
    stereo: [fed("AUX IN", "AUX"), fed("USB MAIN A", "USB A"), fed("USB SUB", "USB SUB"), UNFED],
    strips: BUSES,
    zeroGain: PRESET_SOURCES,
  },
  {
    mono: [DAW_MIC, DAW_MIC, DAW_INSTRUMENT, DAW_INSTRUMENT],
    twoMono: [0, 2],
    stereo: [dawStereo(fed("USB DAW 1/2", "USB DAW", { "eq.on": false })), dawStereo(UNFED), dawStereo(UNFED), dawStereo(UNFED)],
    strips: { ...BUSES, "bus.mix1": { ...BUSES["bus.mix1"], "eq.on": false }, "bus.mix2": { ...BUSES["bus.mix2"], "eq.on": false } },
    zeroGain: PRESET_SOURCES,
  },
];

/** The MIX sends at 0 dB. */
const MIX_AT_0: Settings = { "send.bus.mix1.level": 0, "send.bus.mix2.level": 0 };
/** The MIX sends taken before the fader. */
const MIX_PRE: Settings = { "send.bus.mix1.pre": true, "send.bus.mix2.pre": true };
/** Every send taken before the fader. */
const ALL_PRE: Settings = { ...MIX_PRE, "send.fx1.pre": true, "send.fx2.pre": true };
/** The FX sends off. */
const NO_FX: Settings = { "send.fx1.on": false, "send.fx2.on": false };

/**
 * The voice channel P04, P06 and P07 share: the high-pass filter, the compressor and
 * the 1-knob EQ in, its Intensity at 50 over gains kept the same as the bands'.
 */
const TALK: Settings = {
  gain: 40,
  "hpf.on": true,
  "comp.on": true,
  "comp.threshold": -16,
  "comp.ratio": 5,
  "comp.gain": 1.5,
  "comp.attack": 14.95,
  "comp.release": 35,
  "eq.oneKnob.on": true,
  "eq.oneKnob.level": 50,
  "eq.low.shape": "HPF",
  "eq.low.freq": 100,
  "eq.lowMid.freq": 180,
  "eq.lowMid.gain": 5,
  "eq.highMid.q": 1,
  "eq.highMid.freq": 280,
  "eq.highMid.gain": -7.3,
  "eq.high.shape": "Bell",
  "eq.high.q": 0.79,
  "eq.high.freq": 6000,
  "eq.high.gain": 4,
  "eq.oneKnob.base.low": 0,
  "eq.oneKnob.base.lowMid": 5,
  "eq.oneKnob.base.highMid": -7.3,
  "eq.oneKnob.base.high": 4,
};

/** P05's voice channels: the compressor at a higher ratio, and a brighter curve, kept the same way. */
const VOCAL: Settings = {
  gain: 40,
  "hpf.on": true,
  "comp.on": true,
  "comp.ratio": 10,
  "comp.gain": 1,
  "comp.release": 35,
  "eq.oneKnob.on": true,
  "eq.oneKnob.level": 50,
  "eq.low.shape": "HPF",
  "eq.low.freq": 100,
  "eq.lowMid.q": 0.79,
  "eq.lowMid.freq": 670,
  "eq.lowMid.gain": -2,
  "eq.highMid.q": 1,
  "eq.highMid.freq": 2000,
  "eq.highMid.gain": 2,
  "eq.high.freq": 11200,
  "eq.high.gain": 5,
  "eq.oneKnob.base.low": 0,
  "eq.oneKnob.base.lowMid": -2,
  "eq.oneKnob.base.highMid": 2,
  "eq.oneKnob.base.high": 5,
};

/** An electric guitar on the HI-Z input, through Insert FX's Clean amp. */
const CLEAN_GUITAR: Settings = {
  name: "E. Gt",
  gain: 10,
  hiZ: true,
  "insFx.effect": "Clean",
  "insFx.volume": 1.9,
  "insFx.bass": 6.1,
  "insFx.middle": 5,
  "insFx.treble": 4,
  "insFx.presence": 3,
  "insFx.output": 64,
  "insFx.spType": "JC 2x12",
  "insFx.micPosition": "Center",
  "insFx.gate": false,
  "insFx.gateLevel": 2,
  "insFx.blend": 5,
  "insFx.distortion": 0,
  "insFx.mod": "Off",
  "insFx.modSpeed": 5,
  "insFx.modDepth": 5,
};

/** A keyboard on two mono channels linked as a pair, on its balance. */
const keys = (name: string, extra: Settings = {}): Settings => ({ name, gain: 0, signalType: "STEREO", panBal: "BAL", ...extra });

/** The STEREO fader down under the name given, and the MIX buses named. */
const masters = (stereo: string, mix1: string, mix2: string): Strips => ({
  "bus.stereo": { name: stereo, level: LEVEL_MIN_DB },
  "bus.mix1": { name: mix1 },
  "bus.mix2": { name: mix2 },
});

/** FX 1 a reverb and FX 2 a delay, each returned at 0 dB and sent to both MIX buses at 0 dB. */
const fxReturns = (extra: Settings = {}): Strips => ({
  fx1: { name: "Reverb", level: 0, ...MIX_AT_0, ...extra },
  fx2: { name: "Delay", level: 0, ...MIX_AT_0, ...extra },
});

/** The output patch P06 and P07 set: USB MAIN A and USB SUB on STREAMING, USB MAIN B and C on the MIX buses. */
const STREAM_AND_MIXES = { usbMainA: "STREAMING", usbMainB: "MIX 1", usbMainC: "MIX 2", usbSub: "STREAMING" };

/**
 * P04 to P07, as the unit holds them (confirmed on a URX22 and a URX44V). A URX22's two mono channels hold the same as the URX44V's
 * channels `twoMono` names.
 */
const STANDARD_PRESETS: readonly Preset[] = [
  // P04 Music Production
  {
    mono: [
      keys("Keys L", { balance: 0, recPoint: "PRE GATE", ...MIX_AT_0, ...ALL_PRE }),
      keys("Keys R", { recPoint: "PRE GATE", ...MIX_AT_0, ...ALL_PRE }),
      { ...TALK, name: "Vocal", recPoint: "PRE GATE", ...MIX_AT_0, ...ALL_PRE },
      { ...CLEAN_GUITAR, recPoint: "PRE GATE", ...MIX_AT_0, ...ALL_PRE },
    ],
    twoMono: [2, 3],
    stereo: [
      { name: "DAW PB 1", source: "USB DAW 1/2", recPoint: "PRE EQ", "ducker.range": -56, ...MIX_AT_0, ...MIX_PRE, ...NO_FX },
      { name: "DAW PB 2", source: "USB DAW 3/4", recPoint: "PRE EQ", "send.bus.stereo.on": false, ...MIX_AT_0, ...MIX_PRE, ...NO_FX },
      { name: "Click", source: "USB DAW 5/6", recPoint: "PRE EQ", "send.bus.stereo.on": false, ...MIX_AT_0, ...MIX_PRE, ...NO_FX },
      { name: "AUX", source: "AUX IN", recPoint: "PRE EQ", ...MIX_AT_0, ...ALL_PRE },
    ],
    strips: { ...masters("Main", "Monitor1", "Monitor2"), ...fxReturns(MIX_PRE) },
  },
  // P05 DAW Streaming
  {
    mono: [
      { ...VOCAL, name: "Vocal 1", ...MIX_AT_0, ...ALL_PRE },
      { ...VOCAL, name: "Vocal 2", ...MIX_AT_0, ...ALL_PRE },
      { name: "EA. Gt", gain: 15, hiZ: true, ...MIX_AT_0, ...ALL_PRE },
      { ...CLEAN_GUITAR, ...MIX_AT_0, ...ALL_PRE },
    ],
    twoMono: [0, 2],
    stereo: [
      { name: "DAW PB 1", source: "USB DAW 1/2", "ducker.range": -56, ...MIX_AT_0, ...MIX_PRE, ...NO_FX },
      { name: "DAW PB 2", source: "USB DAW 3/4", "send.bus.stereo.on": false, ...MIX_AT_0, ...MIX_PRE, ...NO_FX },
      { name: "Music", "ducker.on": true, "ducker.attack": 80, "ducker.decay": 4200, ...MIX_AT_0, ...MIX_PRE, ...NO_FX },
      { name: "AUX", source: "AUX IN", ...MIX_AT_0, ...ALL_PRE },
    ],
    strips: { ...masters("Strm", "Monitor1", "Monitor2"), ...fxReturns(MIX_PRE) },
    outputPatch: { usbMainA: "STREAMING", usbSub: "STREAMING" },
  },
  // P06 Sing&Talk Stream
  {
    mono: [
      { ...TALK, name: "Talk", ...MIX_AT_0 },
      { ...TALK, name: "Singing", gain: 30, phantom: true, "send.fx1.level": -20, ...MIX_AT_0 },
      keys("Keys L", { balance: 0, ...MIX_AT_0 }),
      keys("Keys R", MIX_AT_0),
    ],
    twoMono: [0, 1],
    stereo: [
      { name: "Karaoke", source: "USB MAIN A", "ducker.range": -56, ...MIX_AT_0 },
      { name: "Music", source: "USB MAIN B", "ducker.on": true, "ducker.attack": 80, "ducker.decay": 4200, ...MIX_AT_0 },
      { name: "SE", source: "USB SUB", "ducker.attack": 80, "ducker.decay": 4200, ...MIX_AT_0 },
      { name: "AUX", source: "AUX IN", ...MIX_AT_0 },
    ],
    strips: {
      ...masters("Strm", "Monitor1", "Monitor2"),
      "bus.stereo": {
        name: "Strm",
        level: LEVEL_MIN_DB,
        "insFx.effect": "M.B.Comp",
        "insFx.on": true,
        "insFx.release": 75,
        "insFx.oneKnobOn": false,
        "insFx.oneKnobLevel": 0,
        "insFx.xoverLowMid": 125,
        "insFx.xoverMidHigh": 3350,
        "insFx.outGain": 4,
        "insFx.lowBypass": false,
        "insFx.lowThreshold": -20,
        "insFx.lowRatio": 2,
        "insFx.lowAttack": 30,
        "insFx.lowGain": 39,
        "insFx.midBypass": false,
        "insFx.midThreshold": -20,
        "insFx.midRatio": 2,
        "insFx.midAttack": 40,
        "insFx.midGain": 39,
        "insFx.highBypass": false,
        "insFx.highThreshold": -20,
        "insFx.highRatio": 2,
        "insFx.highAttack": 10,
        "insFx.highGain": 39,
      },
      ...fxReturns(),
    },
    outputPatch: STREAM_AND_MIXES,
  },
  // P07 Game Streaming
  {
    mono: [
      { ...TALK, name: "Talk", "gate.on": true, ...MIX_AT_0, "send.bus.mix1.on": false },
      { name: "CH 2", level: LEVEL_MIN_DB },
      { name: "CH 3", level: LEVEL_MIN_DB },
      { name: "CH 4", level: LEVEL_MIN_DB },
    ],
    twoMono: [0, 1],
    stereo: [
      { name: "Game", source: "USB MAIN A", "ducker.range": -56, "send.bus.mix1.level": 0, "send.bus.mix2.on": false, ...NO_FX },
      { name: "Music", source: "USB MAIN B", "send.bus.mix1.level": 0, "send.bus.mix2.on": false, ...NO_FX },
      { name: "V. Chat", source: "USB MAIN C", "eq.low.shape": "HPF", "eq.low.freq": 80, "send.bus.mix1.level": 0, "send.bus.mix2.on": false },
      { name: "USB SUB", source: "USB SUB", "send.bus.mix1.level": 0, "send.bus.mix2.on": false, ...NO_FX },
    ],
    strips: { ...masters("Strm", "Monitor", "V. Chat"), ...fxReturns({ "send.bus.mix2.on": false }) },
    outputPatch: STREAM_AND_MIXES,
  },
];

/** P01 to P07, in order. */
const PRESETS: readonly Preset[] = [...SIMPLE_PRESETS, ...STANDARD_PRESETS];

/**
 * The mixer a factory scene holds: 00 Initial Data at 0 and a preset from 1, or
 * nothing where the unit ships no such preset. A preset's stereo channels go onto
 * the model's in order, and so do its mono channels on a unit with four; a unit
 * with two takes the two the preset names.
 */
export function shippedScene(model: UnitModel, preset: number): Record<ParamPath, ParamValue> | undefined {
  const out: Record<ParamPath, ParamValue> = {};
  for (const [path, value] of factoryState(model)) if (inScene(path)) out[path] = value;
  const lay = (strip: string | undefined, settings: Settings | undefined): void => {
    if (strip === undefined || settings === undefined) return;
    for (const [key, value] of Object.entries(settings)) out[chPath(strip, key)] = value;
  };
  const layStrips = (strips: Strips): void => {
    for (const [strip, settings] of Object.entries(strips)) lay(strip, settings);
  };
  layStrips(INITIAL_DATA);
  if (preset === 0) return out;
  const layout = PRESETS[preset - 1];
  if (!layout) return undefined;
  const mono = model.inputs.filter((s) => s.kind === "monoIn");
  const stereo = model.inputs.filter((s) => s.kind === "stIn");
  const monoFrom = mono.length === 2 ? layout.twoMono.map((i) => layout.mono[i]) : layout.mono;
  mono.forEach((s, i) => lay(s.id, monoFrom[i]));
  layout.stereo.forEach((settings, i) => lay(stereo[i]?.id, settings));
  layStrips(layout.strips);
  for (const [key, value] of Object.entries(layout.outputPatch ?? {})) out[`setup.outputPatch.${key}`] = value;
  for (const source of layout.zeroGain ?? []) out[digitalGainPath(source)] = 0;
  return out;
}
