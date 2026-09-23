// Power-on state.
//
// The channel values are a URX44V's own factory defaults: gain -8 dB and the
// gate / comp settings below are what the unit holds after a reset, not
// invented round numbers. The rest — SETUP menus, MONITOR, oscillator, scene
// list — is the state those screens show at power-on.

import type { ParamPath, ParamValue } from "../device/path";
import { chPath, path } from "../device/path";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { CARD_CAPACITY, shippedCard } from "./card";
import { CLOCK_OFFSET } from "./clock";
import { TIME_ZONE_SHIPPED } from "./time-zone";
import { FX_EFFECT_DEFAULT, effectParams } from "./effects";
import { OSC_TARGETS } from "./oscillator";
import { SOURCES_SHIPPED_DOWN, digitalGainPath, digitalGainShipped } from "./source-gain";
import type { Strip, UnitModel } from "./types";
import { channelPairs, sendsTo } from "./types";
import { UDK_BANKS, UDK_KNOBS, UDK_SHIPPED, UDK_UNASSIGNED, udkPath } from "./udk";

/**
 * The CH SETTING name a strip ships with. Mono channels are "ch 1", a stereo
 * pair is its two channel numbers right-aligned in two characters (" 5/ 6",
 * "11/12"), and the buses carry short labels.
 */
function factoryName(strip: Strip): string {
  const pad = (n: number): string => String(n).padStart(2, " ");
  const [a, b] = strip.channels;
  switch (strip.kind) {
    case "monoIn":
      return `ch ${a ?? 1}`;
    case "stIn":
      return a !== undefined && b !== undefined ? `${pad(a)}/${pad(b)}` : "";
    case "fx":
      return strip.id === "fx2" ? "FX 2" : "FX 1";
    case "mix":
      return strip.id === "bus.mix2" ? "MIX2" : "MIX1";
    case "stereo":
      return "ST";
    case "streaming":
      return "Strm";
  }
}

/**
 * The stereo input channels are fed, in strip order, from the AUX input and
 * the three USB MAIN returns.
 */
export const STEREO_FACTORY_SOURCES = ["AUX IN", "USB MAIN A", "USB MAIN B", "USB MAIN C"] as const;

/**
 * What a strip is fed from when the unit leaves the factory. A mono channel
 * takes its pair's MIC/LINE input, a stereo channel its place in the table
 * above, the streaming bus the stereo bus; nothing else is fed from a source
 * it can be given. The strings are the ones the picking sheets offer.
 */
export function factorySource(model: UnitModel, strip: Strip): string | undefined {
  if (strip.kind === "monoIn") {
    const first = strip.channels[0] ?? 1;
    const pairStart = first % 2 === 1 ? first : first - 1;
    return `MIC/LINE ${pairStart}/${pairStart + 1}`;
  }
  if (strip.kind === "stIn") return STEREO_FACTORY_SOURCES[model.inputs.filter((s) => s.kind === "stIn").indexOf(strip)];
  return strip.kind === "streaming" ? "STEREO" : undefined;
}

/** The channel a ducker ships keyed from, as the ducker's own list names it. */
export const DUCKER_SOURCE_DEFAULT = "1";

/** Factory gate settings for a mono input channel. */
export const GATE_DEFAULTS = { threshold: -50, range: -56, attack: 20.17, hold: 15.3, decay: 150.2 };

/** Factory compressor settings for a mono input channel. */
export const COMP_DEFAULTS = {
  threshold: -18,
  ratio: 3,
  gain: 2,
  attack: 34.58,
  release: 218,
  knee: "Medium",
  autoMakeup: false,
};

/**
 * Factory SSMCS (Sweet Spot Morphing Channel Strip), on the mono input channels
 * that switch their COMP / EQ type to it. LOW and HIGH are shelves and carry no Q
 * of their own; the Q the screen shows on them is MID's.
 */
export const SSMCS_DEFAULTS = {
  on: true,
  data: "01 Basic",
  compDrive: 5,
  morphing: 0,
  outGain: 0,
  knee: "Medium",
  attack: 4.124,
  release: 91.6,
  ratio: 2.5,
  sc: { on: true, q: 1, freq: 89, gain: -4.7 },
  eq: {
    low: { freq: 100, gain: 0 },
    mid: { q: 1, freq: 1002, gain: 0 },
    high: { freq: 10024, gain: 0 },
  },
} as const;

/** The curve a band ships drawing. */
export const EQ_BAND_SHAPE_DEFAULT = "Bell";

/** Factory four-band EQ, identical on every channel. */
const EQ_BANDS = [
  { band: "low", freq: 125, gain: 0, q: 0.71 },
  { band: "lowMid", freq: 1000, gain: 0, q: 0.71 },
  { band: "highMid", freq: 4000, gain: 0, q: 0.71 },
  { band: "high", freq: 10000, gain: 0, q: 0.71 },
] as const;

/**
 * The COMP -> EQ bank as the unit holds it at the factory: the compressor, the
 * four-band EQ and the EQ 1-knob. The unit loads this bank whole when a channel
 * is switched to COMP -> EQ, so the seed and that load read one table.
 */
export function compEqBankDefaults(): readonly [string, ParamValue][] {
  const out: [string, ParamValue][] = [
    ["comp.on", false],
    ["comp.threshold", COMP_DEFAULTS.threshold],
    ["comp.ratio", COMP_DEFAULTS.ratio],
    ["comp.gain", COMP_DEFAULTS.gain],
    ["comp.attack", COMP_DEFAULTS.attack],
    ["comp.release", COMP_DEFAULTS.release],
    ["comp.knee", COMP_DEFAULTS.knee],
    ["comp.autoMakeup", COMP_DEFAULTS.autoMakeup],
    ["comp.oneKnob.on", false],
    ["comp.oneKnob.level", 0],
    ["eq.on", true],
    ["eq.oneKnob.on", false],
    ["eq.oneKnob.type", "Intensity"],
    ["eq.oneKnob.level", 0],
  ];
  for (const b of EQ_BANDS) {
    out.push([`eq.${b.band}.freq`, b.freq], [`eq.${b.band}.gain`, b.gain], [`eq.${b.band}.q`, b.q], [`eq.${b.band}.on`, true], [`eq.${b.band}.shape`, EQ_BAND_SHAPE_DEFAULT]);
  }
  return out;
}

/**
 * The SSMCS bank as the unit holds it at the factory. The unit loads this bank
 * whole when a channel is switched to SSMCS.
 */
export function ssmcsBankDefaults(): readonly [string, ParamValue][] {
  const out: [string, ParamValue][] = [
    ["ssmcs.on", SSMCS_DEFAULTS.on],
    ["ssmcs.data", SSMCS_DEFAULTS.data],
    ["ssmcs.compDrive", SSMCS_DEFAULTS.compDrive],
    ["ssmcs.morphing", SSMCS_DEFAULTS.morphing],
    ["ssmcs.outGain", SSMCS_DEFAULTS.outGain],
    ["ssmcs.comp.knee", SSMCS_DEFAULTS.knee],
    ["ssmcs.comp.attack", SSMCS_DEFAULTS.attack],
    ["ssmcs.comp.release", SSMCS_DEFAULTS.release],
    ["ssmcs.comp.ratio", SSMCS_DEFAULTS.ratio],
    ["ssmcs.sc.on", SSMCS_DEFAULTS.sc.on],
    ["ssmcs.sc.q", SSMCS_DEFAULTS.sc.q],
    ["ssmcs.sc.freq", SSMCS_DEFAULTS.sc.freq],
    ["ssmcs.sc.gain", SSMCS_DEFAULTS.sc.gain],
  ];
  for (const [band, values] of Object.entries(SSMCS_DEFAULTS.eq)) {
    out.push(
      [`ssmcs.eq.${band}.on`, true],
      [`ssmcs.eq.${band}.q`, "q" in values ? values.q : SSMCS_DEFAULTS.eq.mid.q],
      [`ssmcs.eq.${band}.freq`, values.freq],
      [`ssmcs.eq.${band}.gain`, values.gain],
    );
  }
  return out;
}

function seedStrip(out: Map<ParamPath, ParamValue>, strip: Strip, model: UnitModel): void {
  const p = (...rest: (string | number)[]): ParamPath => chPath(strip.id, ...rest);
  out.set(p("name"), factoryName(strip));
  out.set(p("color"), strip.color);
  const source = factorySource(model, strip);
  if (source !== undefined) out.set(p("source"), source);
  out.set(p("on"), true);
  out.set(p("cue"), false);
  out.set(p("level"), 0);
  for (const [suffix, value] of compEqBankDefaults()) {
    // Only a mono channel carries the compressor; every strip carries the EQ.
    if (strip.kind !== "monoIn" && suffix.startsWith("comp.")) continue;
    out.set(p(suffix), value);
  }

  if (strip.kind === "monoIn") {
    out.set(p("gain"), -8);
    out.set(p("phantom"), false);
    out.set(p("hiZ"), false);
    out.set(p("phase"), false);
    out.set(p("clipSafe"), false);
    out.set(p("hpf.on"), false);
    out.set(p("hpf.freq"), 80);
    out.set(p("pan"), 0);
    out.set(p("balance"), 0);
    out.set(p("recPoint"), "PRE FADER");
    out.set(p("compEqOrder"), "COMP->EQ");
    out.set(p("signalType"), "MONO x 2");
    out.set(p("panBal"), "PAN");
    out.set(p("gate.on"), false);
    out.set(p("gate.threshold"), GATE_DEFAULTS.threshold);
    out.set(p("gate.range"), GATE_DEFAULTS.range);
    out.set(p("gate.attack"), GATE_DEFAULTS.attack);
    out.set(p("gate.hold"), GATE_DEFAULTS.hold);
    out.set(p("gate.decay"), GATE_DEFAULTS.decay);
    for (const [suffix, value] of ssmcsBankDefaults()) out.set(p(suffix), value);
    out.set(p("insFx.on"), false);
    out.set(p("insFx.effect"), "No Effect");
  }

  if (strip.kind === "stIn") {
    out.set(p("recPoint"), "PRE FADER");
    out.set(p("balance"), 0);
    out.set(p("phase.l"), false);
    out.set(p("phase.r"), false);
    out.set(p("ducker.on"), false);
    out.set(p("ducker.source"), DUCKER_SOURCE_DEFAULT);
    out.set(p("ducker.threshold"), -40);
    out.set(p("ducker.range"), -24);
    out.set(p("ducker.attack"), 20.17);
    out.set(p("ducker.decay"), 1000);
  }

  // An FX channel is an effect: it always has one selected, and it comes up with
  // that effect's own settings.
  if (strip.kind === "fx") {
    const effect = FX_EFFECT_DEFAULT[strip.id] ?? "";
    out.set(p("effect.type"), effect);
    for (const param of effectParams(effect)) out.set(p("effect", param.key), param.fallback);
  }

  if (strip.kind === "streaming") {
    out.set(p("delay.on"), false);
    out.set(p("delay.ms"), 1.0);
    out.set(p("delay.frameRate"), "30");
  }

  // A MIX bus ships taking a variable level from each send, with the sends
  // placed by their own balance rather than by their source channel.
  if (strip.kind === "mix") {
    out.set(p("busType"), "VARI");
    out.set(p("panLink"), false);
  }

  if (strip.side === "output") {
    out.set(p("insFx.on"), false);
    out.set(p("insFx.effect"), "No Effect");
  }
}

/** The values the unit holds the first time it is switched on. */
export function factoryState(model: UnitModel): Map<ParamPath, ParamValue> {
  const out = new Map<ParamPath, ParamValue>();

  for (const s of model.inputs) seedStrip(out, s, model);
  for (const s of model.outputs) seedStrip(out, s, model);
  // The digital gain belongs to the input source; the rest of the sources ship at 0.
  for (const source of SOURCES_SHIPPED_DOWN) out.set(digitalGainPath(source), digitalGainShipped(source));

  // SETUP
  out.set(path("setup", "operationMode"), "Standard");
  out.set(path("setup", "brightness"), 10);
  out.set(path("setup", "language"), "English");
  out.set(path("setup", "samplingFrequency"), 48000);
  out.set(path("setup", "followUsb"), false);
  out.set(path("setup", "outputPatch.tab"), "Analog");
  out.set(path("setup", "outputPatch.mainOut"), "STEREO");
  out.set(path("setup", "outputPatch.lineOut"), "MIX 1");
  for (const p of ["usbMainA", "usbMainB", "usbMainC", "usbSub"]) out.set(path("setup", `outputPatch.${p}`), "STEREO");
  out.set(path("setup", "peripheral.tab"), "Main");
  out.set(path("setup", "peripheral.usbSuppression"), "None");
  out.set(path("setup", "peripheral.hdmiEnable"), true);
  out.set(path("setup", "peripheral.hdmiChannels"), "2 Channels");
  out.set(path("setup", "power.autoPowerOff"), true);
  out.set(path("setup", "power.autoPowerOffMinutes"), 20);
  // The clock runs with the computer's.
  out.set(CLOCK_OFFSET, 0);
  out.set(path("setup", "dateTime.timeZone"), TIME_ZONE_SHIPPED);
  out.set(path("setup", "dateTime.dateFormat"), "MM/DD/YYYY");
  out.set(path("setup", "dateTime.timeFormat"), "24h");
  out.set(path("setup", "integration.fx1Send"), "MIX 1");
  out.set(path("setup", "integration.fx2Send"), "MIX 1");
  out.set(path("setup", "udk.bank"), 1);
  for (const bank of UDK_BANKS) {
    for (const knob of UDK_KNOBS) out.set(udkPath(bank, knob), UDK_SHIPPED[`${bank}.${knob}`] ?? UDK_UNASSIGNED);
  }

  // MONITOR / PHONES / OSCILLATOR
  for (let n = 1; n <= model.monitorBuses; n++) {
    out.set(path("monitor", n, "on"), true);
    out.set(path("monitor", n, "level"), 0);
    out.set(path("monitor", n, "source"), "STEREO");
    out.set(path("monitor", n, "cueInterrupt"), true);
    out.set(path("monitor", n, "mono"), false);
    out.set(path("phones", n, "level"), 2);
  }
  out.set(path("osc", "on"), false);
  out.set(path("osc", "mode"), "Sine Wave");
  out.set(path("osc", "frequency"), 1000);
  out.set(path("osc", "level"), -14);
  out.set(path("osc", "width"), 0.1);
  out.set(path("osc", "interval"), 1);
  // The oscillator ships assigned to the stereo bus and to nothing else.
  for (const t of OSC_TARGETS) out.set(path("osc", "assign", t.id), t.shipped);

  // Sends. Every one ships open with nothing going through it: the switch on,
  // the level at the bottom of the fader, the tap after the fader, and the send
  // placed centre.
  const stereo = model.outputs.filter((o) => o.kind === "stereo");
  const mixes = model.outputs.filter((o) => o.kind === "mix");
  const returns = model.inputs.filter((s) => s.kind === "fx");
  for (const from of [...model.inputs, ...model.outputs]) {
    const targets = [...stereo, ...mixes, ...returns].filter((to) => sendsTo(from, to));
    for (const to of targets) {
      out.set(chPath(from.id, "send", to.id, "level"), LEVEL_MIN_DB);
      out.set(chPath(from.id, "send", to.id, "on"), true);
      out.set(chPath(from.id, "send", to.id, "pre"), false);
      out.set(chPath(from.id, "send", to.id, "balance"), 0);
    }
  }

  // microSD recorder. The input pairs take one track pair each in order, and
  // STEREO sits on the last pair.
  if (model.hasSD) {
    out.set(path("sd", "trackCount"), 16);
    const sources = channelPairs(model);
    for (let slot = 0; slot < 8; slot++) {
      out.set(path("sd", "track", slot), sources[slot] ?? "None");
    }
    const master = model.outputs.find((s) => s.kind === "stereo");
    if (master) out.set(path("sd", "track", 7), master.label);
    // A card in the slot, holding what the recorder has written to it.
    out.set(path("sd", "mounted"), true);
    out.set(path("sd", "cardName"), "test");
    out.set(path("sd", "capacity"), CARD_CAPACITY);
    out.set(path("sd", "card"), JSON.stringify(shippedCard()));
  }

  // SCENE
  out.set(path("scene", "bank"), "Standard");
  out.set(path("scene", "current"), 0);
  out.set(path("scene", "0.title"), "Initial Data");

  // Session-local UI state the unit also keeps across screens.
  out.set(path("ui", "selectedStrip"), model.inputs[0]?.id ?? "");
  out.set(path("ui", "sendsTarget"), "ST");
  out.set(path("ui", "bankSide"), "input");
  out.set(path("ui", "bank"), 0);
  out.set(path("ui", "userDefinedKnobs"), false);

  return out;
}
