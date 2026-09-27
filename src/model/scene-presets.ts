// The scenes the unit ships: 00 Initial Data, and Simple Mode's presets P01
// Live Music 0, P02 Streaming 0 and P03 DAW Rec 0 (user guide, "Selecting the
// presets and use cases"). A preset is the factory mixer with its own settings
// laid over it; what a preset does not set stays as the factory ships it.

import type { ParamPath, ParamValue } from "../device/path";
import { chPath } from "../device/path";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { factoryState } from "./defaults";
import { inScene } from "./scene-state";
import { digitalGainPath } from "./source-gain";
import type { UnitModel } from "./types";

/** Settings on one strip, keyed by the path under the strip. */
type Settings = Readonly<Record<string, ParamValue>>;

/** What every preset sets on a mono channel: the fader down, the MIX sends taken before it, a send into FX 1 at -16 dB and none into FX 2, and SSMCS off. */
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

/** What every preset sets on a stereo channel: the fader down, the MIX sends before it, the FX sends off, and the ducker's range at -56 dB. */
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

/** What every preset sets on the buses: STEREO down, FX 1 a plate reverb returned at 0 dB, FX 2 off and unnamed, and MIX 2 named MIX3. */
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

/** The sources whose digital gain a preset sets, all of them to 0 dB. */
const PRESET_SOURCES = ["AUX IN", "USB MAIN A", "USB MAIN B", "USB MAIN C", "USB SUB"];

interface Preset {
  /** The mono channels, CH 1 up, four of them. */
  mono: readonly Settings[];
  /** The stereo channels, the lowest-numbered first. */
  stereo: readonly Settings[];
  /** Settings on other strips, over the buses every preset sets. */
  extra?: Readonly<Record<string, Settings>>;
}

/** P01 to P03, in order. */
const PRESETS: readonly Preset[] = [
  {
    mono: [LIVE_MIC, LIVE_MIC, LIVE_MIC, LIVE_MIC],
    stereo: [fed("AUX IN", "AUX"), fed("USB MAIN A", "USB A"), fed("USB SUB", "USB SUB"), UNFED],
  },
  {
    mono: [LIVE_MIC, LIVE_MIC, STREAM_INSTRUMENT, STREAM_INSTRUMENT],
    stereo: [fed("AUX IN", "AUX"), fed("USB MAIN A", "USB A"), fed("USB SUB", "USB SUB"), UNFED],
  },
  {
    mono: [DAW_MIC, DAW_MIC, DAW_INSTRUMENT, DAW_INSTRUMENT],
    stereo: [dawStereo(fed("USB DAW 1/2", "USB DAW", { "eq.on": false })), dawStereo(UNFED), dawStereo(UNFED), dawStereo(UNFED)],
    extra: { "bus.mix1": { "eq.on": false }, "bus.mix2": { "eq.on": false } },
  },
];

/**
 * The mixer a factory scene holds: 00 Initial Data at 0 and a preset from 1, or
 * nothing where the unit ships no such preset. A preset's channels go onto the
 * model's mono and stereo channels in order, so a URX22 takes the first two mono
 * settings.
 */
export function shippedScene(model: UnitModel, preset: number): Record<ParamPath, ParamValue> | undefined {
  const out: Record<ParamPath, ParamValue> = {};
  for (const [path, value] of factoryState(model)) if (inScene(path)) out[path] = value;
  if (preset === 0) return out;
  const layout = PRESETS[preset - 1];
  if (!layout) return undefined;
  const lay = (strip: string | undefined, settings: Settings | undefined): void => {
    if (strip === undefined || settings === undefined) return;
    for (const [key, value] of Object.entries(settings)) out[chPath(strip, key)] = value;
  };
  const mono = model.inputs.filter((s) => s.kind === "monoIn");
  const stereo = model.inputs.filter((s) => s.kind === "stIn");
  layout.mono.forEach((settings, i) => lay(mono[i]?.id, settings));
  layout.stereo.forEach((settings, i) => lay(stereo[i]?.id, settings));
  for (const [strip, settings] of Object.entries(BUSES)) lay(strip, settings);
  for (const [strip, settings] of Object.entries(layout.extra ?? {})) lay(strip, settings);
  for (const source of PRESET_SOURCES) out[digitalGainPath(source)] = 0;
  return out;
}
