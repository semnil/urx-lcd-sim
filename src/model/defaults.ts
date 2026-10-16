// Power-on state.
//
// The channel values are a URX44V's and a URX22's own factory defaults: gain -8 dB and the
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
import { SENDS_TARGET_SHIPPED, allStrips, carriesInsert, channelPairs, findStrip, sendsTo } from "./types";
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
 * that switch their COMP / EQ type to it. LOW and HIGH are shelves and carry no
 * Q; MID's is the only one.
 */
export const SSMCS_DEFAULTS = {
  on: true,
  data: "01 Basic",
  compDrive: 5,
  morphing: 0,
  outGain: 0,
  knee: "Medium",
  attack: 4.122,
  release: 92,
  ratio: 2.5,
  sc: { on: true, q: 1, freq: 90, gain: -4.7 },
  eq: {
    low: { freq: 100, gain: 0 },
    mid: { q: 1, freq: 1000, gain: 0 },
    high: { freq: 10000, gain: 0 },
  },
} as const;

/** Factory four-band EQ, identical on every channel: the outer bands shelves, the mid bands bells. */
const EQ_BANDS = [
  { band: "low", freq: 125, gain: 0, q: 0.71, shape: "L.Shelf" },
  { band: "lowMid", freq: 1000, gain: 0, q: 0.71, shape: "Bell" },
  { band: "highMid", freq: 4000, gain: 0, q: 0.71, shape: "Bell" },
  { band: "high", freq: 10000, gain: 0, q: 0.71, shape: "H.Shelf" },
] as const;

/** The filter shape each EQ band ships drawing, by band. */
export const EQ_BAND_SHAPE_SHIPPED: Readonly<Record<string, string>> = Object.fromEntries(EQ_BANDS.map((b) => [b.band, b.shape]));

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
    out.push([`eq.${b.band}.freq`, b.freq], [`eq.${b.band}.gain`, b.gain], [`eq.${b.band}.q`, b.q], [`eq.${b.band}.on`, true], [`eq.${b.band}.shape`, b.shape]);
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
    out.push([`ssmcs.eq.${band}.on`, true]);
    if ("q" in values) out.push([`ssmcs.eq.${band}.q`, values.q]);
    out.push([`ssmcs.eq.${band}.freq`, values.freq], [`ssmcs.eq.${band}.gain`, values.gain]);
  }
  return out;
}

/** Where a strip's fader ships: an FX channel's at the bottom, every other at 0 dB. */
export function faderShipped(strip: Pick<Strip, "kind">): number {
  return strip.kind === "fx" ? LEVEL_MIN_DB : 0;
}

/** Whether a send ships switched on: every one does but a MIX bus's into STEREO. */
export function sendShipsOn(from: Pick<Strip, "kind">, to: Pick<Strip, "kind">): boolean {
  return !(from.kind === "mix" && to.kind === "stereo");
}

/** Whether a strip carries the four-band EQ: the input channels, the MIX buses and the stereo bus. */
export function holdsEq(strip: Pick<Strip, "kind">): boolean {
  return strip.kind === "monoIn" || strip.kind === "stIn" || strip.kind === "mix" || strip.kind === "stereo";
}

/** Whether a strip has a fader and an [ON]: every one but the streaming bus, which is fed and heard. */
function holdsFader(strip: Pick<Strip, "kind">): boolean {
  return strip.kind !== "streaming";
}

/**
 * Whether a strip holds a BALANCE of its own. A mono pair is placed by its
 * lower-numbered channel's, so the higher-numbered one holds none, and neither
 * does the streaming bus.
 */
export function holdsBalance(strip: Pick<Strip, "kind" | "channels">): boolean {
  if (strip.kind === "monoIn") return (strip.channels[0] ?? 1) % 2 === 1;
  return strip.kind !== "streaming";
}

/**
 * Whether a send into `to` carries `key`. A send into the stereo bus carries its
 * switch alone: the channel's own fader and position stand for its level, tap
 * and placing. A send into an FX bus is taken summed to one side, with no placing.
 */
function sendHolds(to: Pick<Strip, "kind">, key: string): boolean {
  if (to.kind === "stereo") return key === "on";
  return !(to.kind === "fx" && key === "balance");
}

/** LINE OUT's output patch, on a unit that has a LINE OUT. */
const LINE_OUT_PATCH = path("setup", "outputPatch.lineOut");

/** Whether the unit holds the value at `p`: what the predicates above leave out, it does not. */
function holds(model: UnitModel, p: ParamPath): boolean {
  if (p === LINE_OUT_PATCH) return model.hasLineOut;
  const strip = allStrips(model).find((s) => p.startsWith(`ch.${s.id}.`));
  if (!strip) return true;
  const rest = p.slice(`ch.${strip.id}.`.length);
  if (rest === "level" || rest === "on") return holdsFader(strip);
  if (rest === "balance") return holdsBalance(strip);
  if (rest.startsWith("eq.")) return holdsEq(strip);
  if (rest.startsWith("insFx.")) return carriesInsert(strip);
  const send = /^send\.(.+)\.([^.]+)$/.exec(rest);
  const to = send ? findStrip(model, send[1] ?? "") : undefined;
  return to === undefined || sendHolds(to, send?.[2] ?? "");
}

/**
 * Values as they are put back on `model`: a browser save, a scene or a settings
 * file that names a value the unit does not hold has it left out.
 */
export function onlyHeld(model: UnitModel, values: Record<ParamPath, ParamValue>): Record<ParamPath, ParamValue> {
  return Object.fromEntries(Object.entries(values).filter(([p]) => holds(model, p)));
}

function seedStrip(out: Map<ParamPath, ParamValue>, strip: Strip, model: UnitModel): void {
  const p = (...rest: (string | number)[]): ParamPath => chPath(strip.id, ...rest);
  out.set(p("name"), factoryName(strip));
  out.set(p("color"), strip.color);
  const source = factorySource(model, strip);
  if (source !== undefined) out.set(p("source"), source);
  if (holdsFader(strip)) out.set(p("on"), true);
  out.set(p("cue"), false);
  if (holdsFader(strip)) out.set(p("level"), faderShipped(strip));
  for (const [suffix, value] of compEqBankDefaults()) {
    // Only a mono channel carries the compressor, and only a strip `holdsEq` names the EQ.
    if (suffix.startsWith("comp.") ? strip.kind !== "monoIn" : !holdsEq(strip)) continue;
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

  // A strip holding a BALANCE ships with it at the centre.
  if (holdsBalance(strip)) out.set(p("balance"), 0);

  if (strip.side === "output" && carriesInsert(strip)) {
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
  out.set(path("setup", "followUsb"), true);
  out.set(path("setup", "outputPatch.tab"), "Analog");
  out.set(path("setup", "outputPatch.mainOut"), "STEREO");
  if (model.hasLineOut) out.set(LINE_OUT_PATCH, "MIX 1");
  for (const p of ["usbMainA", "usbMainB", "usbMainC", "usbSub"]) out.set(path("setup", `outputPatch.${p}`), "STEREO");
  out.set(path("setup", "peripheral.tab"), "Main");
  out.set(path("setup", "peripheral.usbSuppression"), "None");
  out.set(path("setup", "peripheral.hdmiEnable"), true);
  out.set(path("setup", "peripheral.hdmiChannels"), "2 Channels");
  out.set(path("setup", "power.autoPowerOff"), model.autoPowerOffShipped);
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
  // placed centre, but for the switches `sendShipsOn` leaves off. A send carries
  // what `sendHolds` names of these alone.
  const stereo = model.outputs.filter((o) => o.kind === "stereo");
  const mixes = model.outputs.filter((o) => o.kind === "mix");
  const returns = model.inputs.filter((s) => s.kind === "fx");
  for (const from of [...model.inputs, ...model.outputs]) {
    const targets = [...stereo, ...mixes, ...returns].filter((to) => sendsTo(from, to));
    for (const to of targets) {
      const shipped: [string, ParamValue][] = [["level", LEVEL_MIN_DB], ["on", sendShipsOn(from, to)], ["pre", false], ["balance", 0]];
      for (const [key, value] of shipped) if (sendHolds(to, key)) out.set(chPath(from.id, "send", to.id, key), value);
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
  out.set(path("ui", "sendsTarget"), SENDS_TARGET_SHIPPED);
  out.set(path("ui", "bankSide"), "input");
  out.set(path("ui", "bank"), 0);
  out.set(path("ui", "userDefinedKnobs"), false);

  return out;
}
