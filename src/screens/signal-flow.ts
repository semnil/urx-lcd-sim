// The synthetic signal, carried through the mixer the way the unit routes it.
//
// The simulator has no audio. Each input source puts out a signal of its own,
// wandering slowly about a level, and every meter reads that signal where the
// unit's own meter stands on the block diagram: through the head amp, the
// channel's blocks, its fader and its position, the sends into the MIX and FX
// buses, the FX returns, the buses' own blocks and on to the outputs, the cue
// bus, STREAMING and the monitors. A meter is named by the strip it belongs to
// and the point on that strip it reads (`tapId`).

import type { DeviceStore } from "../device/store";
import { COMP_DEFAULTS, DUCKER_SOURCE_DEFAULT, GATE_DEFAULTS, SSMCS_DEFAULTS, faderShipped } from "../model/defaults";
import { COMPANDER_EXPANSION, COMP_KNEE_WIDTH, OVER_REDUCTION_MAX_DB, SSMCS_CORNER_FLOOR_DB, compReductionDb, companderGainDb, companderLiftDb, duckerReductionDb, gateReductionDb, ssmcsCorner } from "../model/dynamics";
import { bandResponse } from "../model/eq-response";
import { SSMCS_BAND_KEYS, eqOutOfUse, fourBandResponse, fourBands, pinkGainDb, ssmcsBand, ssmcsEqResponse, ssmcsSideChain, ssmcsSideChainResponse } from "../model/channel-eq";
import { type EffectOption, FX_EFFECTS, FX_EFFECT_DEFAULT, INPUT_INSERT_EFFECTS, NO_EFFECT, OUTPUT_INSERT_EFFECTS, effectParams, guitarOutputDb } from "../model/effects";
import {
  DETECTOR_OFFSET,
  type DetectorKind,
  FX_RETURN_DB,
  INSERT_CURVES,
  MBC_CURVES,
  MIC_LINE_SIGNAL_DB,
  curveGainDb,
  OSC_PINK_UNDER_DB,
  insertCurveGainDb,
  insertDetector,
  sourceBaseDb,
} from "../model/levels";
import { OSC_TARGETS } from "../model/oscillator";
import { panLawDb } from "../model/pan-law";
import { type Lane, SILENT_DB, filtered, gain, heardDb, invert, levelDb, mix, mostlyTone, part } from "../model/signal";
import { digitalGainPath, digitalGainShipped } from "../model/source-gain";
import type { Strip, UnitModel } from "../model/types";
import { findStrip } from "../model/types";
import { URX22, URX44V, monoStripId } from "../model/units";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { jackParam, micLineJack } from "./head-amp";
import { compDetectorShared, linkedPair, stripPosition, usesBalance } from "./stereo-link";

/** What the flow needs of a screen's context: the values and the unit's shape. */
export type FlowCtx = { store: DeviceStore; model: UnitModel };

/** The unit a store holds the values of. The URX44 and URX44V carry the same strips. */
export function flowCtx(store: DeviceStore): FlowCtx {
  return { store, model: store.has(`ch.${monoStripId(3)}.on`) ? URX44V : URX22 };
}

// ---------------------------------------------------------------- where a meter reads

/** A point on a strip a meter reads. */
export type Tap =
  /** What the strip takes in: the input source, the FX bus, what the streaming bus is fed. */
  | "input"
  /** A MONO IN channel after Φ and HPF. */
  | "preGate"
  /** After GATE: into COMP, or into the SSMCS strip. */
  | "preComp"
  /** On SSMCS what the side chain's bell feeds the compressor, nothing while the chain or the compressor is off; on COMP -> EQ the same as preComp. */
  | "sideChain"
  /** Into the EQ: after COMP, and on a stereo channel after Φ. */
  | "preEq"
  /** Into the insert. */
  | "preIns"
  /** After a channel's EQ and insert, a bus's EQ: what the fader takes. */
  | "preFader"
  /** A stereo channel after its fader, into DUCKER. */
  | "preDucker"
  /** What the strip puts out: after the fader, and on a bus after its insert. */
  | "post"
  /** A MIX or STEREO bus's sum, before its EQ. */
  | "sum"
  /** An FX channel's effect, before its fader. */
  | "effect"
  /** What the strip puts into the cue bus. */
  | "cue";

const TAP_MARK = "@";

/** The id of the meter reading `tap` on `stripId`. */
export const tapId = (stripId: string, tap: Tap): string => `${stripId}${TAP_MARK}${tap}`;

/** The id of the meter reading the cue bus, which no strip carries. */
export const CUE_METER = "cue";

/** The id of the meter reading the oscillator's own output. */
export const OSC_METER = "osc";

/** The input source the card's playback puts out on. */
const PLAYBACK = "microSD Playback";

/** The id of the meter reading what the card's playback puts out, in stereo after its D.Gain. */
export const PLAYBACK_METER = "playback";

/** What a meter reading two strips as the two sides of one stereo meter goes by. */
const PAIR_METER = "pair:";

/** The meter id of `left` and `right` read side by side: `left`'s level in the first lane, `right`'s in the second. */
export const pairMeterId = (left: string, right: string): string => `${PAIR_METER}${left}+${right}`;

/** The two meters a pair meter id reads side by side, or none for any other id. */
export function pairMembers(id: string): string[] | undefined {
  return id.startsWith(PAIR_METER) ? id.slice(PAIR_METER.length).split("+") : undefined;
}

/** `tap` on `strip`, or both channels' `tap` side by side on a stereo-linked pair. */
export function stripTap(fc: FlowCtx, strip: Strip, tap: Tap): string {
  const pair = linkedPair(fc, strip);
  return pair ? pairMeterId(tapId(pair[0].id, tap), tapId(pair[1].id, tap)) : tapId(strip.id, tap);
}

// ---------------------------------------------------------------- the moment a reading is taken at

/** The moment the screen being drawn reads at, while one is being drawn. */
let drawnAt: number | undefined;

/** The moment a reading that names none is taken at: the moment of the screen being drawn, or now. */
export const readingMoment = (): number => drawnAt ?? Date.now();

/** Draw with `draw`, every reading it takes that names no moment taken at one moment, so a screen agrees with itself. */
export function drawAtOneMoment<T>(draw: () => T): T {
  if (drawnAt !== undefined) return draw();
  drawnAt = Date.now();
  try {
    return draw();
  } finally {
    drawnAt = undefined;
  }
}

// ---------------------------------------------------------------- the input sources

/**
 * A slow deterministic wander per signal and side, within 7 dB either way, so the
 * picture is stable between repaints rather than flickering with every render.
 */
function wander(key: string, lane: number, at: number): number {
  const t = at / 1000;
  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 997;
  const phase = (seed + lane * 137) / 97;
  return Math.sin(t * 1.7 + phase) * 4 + Math.sin(t * 0.6 + phase * 2) * 3;
}

/** The level at which a meter's clip indicator lights. */
export const CLIP_DB = 0;

/** How far Clip Safe takes its connector's signal down once it has clipped. */
const CLIP_SAFE_REDUCTION_DB = 23;

/** How long Clip Safe holds the signal down after the last clip it heard. */
const CLIP_SAFE_HOLD_MS = 5000;

/** The longest a STREAMING DELAY holds its signal back. */
export const DELAY_MAX_MS = 1000;

/** How often the meter ticker reads the meters. */
export const METER_TICK_MS = 100;

/** What the connector numbered `n` puts out before Clip Safe: its signal, raised by its A.Gain. */
function jackRaw(store: DeviceStore, n: number, at: number): number {
  return MIC_LINE_SIGNAL_DB + store.num(jackParam(n, "gain"), -8) + wander(monoStripId(n), 0, at);
}

/**
 * What each connector's Clip Safe has heard, per store: the moment of its last
 * clip, the latest moment read, each moment read with how far it held the signal
 * down then, and each stretch it held the signal down, from the clip that began it
 * to CLIP_SAFE_HOLD_MS after the last clip in it, as far back as a reading after
 * the longest DELAY looks.
 */
const clipSafeStates = new WeakMap<DeviceStore, Map<number, { last: number; latest: number; readings: { at: number; reduction: number }[]; holds: { from: number; to: number }[] }>>();

/**
 * Clip Safe on the connector numbered `n` at `at`: whether it is engaged, and by
 * how many dB it is holding the signal down. A reading that finds the signal at
 * the clip level — held down or not — is a clip: that reading still shows it,
 * and after it the signal is held CLIP_SAFE_REDUCTION_DB down until
 * CLIP_SAFE_HOLD_MS after the last clip, engaged for as long. A reading of a
 * moment before the latest one read, up to DELAY_MAX_MS back, hears no clip of
 * its own: within half a METER_TICK_MS of a moment read, it finds the signal held
 * down as far as the nearest of those readings did, and further from any, as far
 * as Clip Safe was holding it down at that moment. The A.Gain setting stays where
 * it is. Switched off, it forgets what it heard.
 */
export function clipSafe(store: DeviceStore, n: number, at = readingMoment()): { engaged: boolean; reduction: number } {
  let states = clipSafeStates.get(store);
  if (!states) clipSafeStates.set(store, (states = new Map()));
  if (!store.bool(jackParam(n, "clipSafe"), false)) {
    states.delete(n);
    return { engaged: false, reduction: 0 };
  }
  let state = states.get(n);
  if (!state) states.set(n, (state = { last: -Infinity, latest: -Infinity, readings: [], holds: [] }));
  const { last, readings, holds } = state;
  if (at < state.latest) {
    const near = readings.filter((r) => Math.abs(r.at - at) <= METER_TICK_MS / 2).sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0];
    const held = holds.some((h) => h.from < at && at <= h.to) ? CLIP_SAFE_REDUCTION_DB : 0;
    return { engaged: holds.some((h) => h.from <= at && at <= h.to), reduction: near ? near.reduction : held };
  }
  const reduction = at > last && at - last <= CLIP_SAFE_HOLD_MS ? CLIP_SAFE_REDUCTION_DB : 0;
  const clip = jackRaw(store, n, at) - reduction >= CLIP_DB ? Math.max(last, at) : last;
  if (clip !== last) {
    const hold = holds.at(-1);
    if (hold && clip <= hold.to) hold.to = clip + CLIP_SAFE_HOLD_MS;
    else holds.push({ from: clip, to: clip + CLIP_SAFE_HOLD_MS });
  }
  if (at > state.latest) readings.push({ at, reduction });
  while ((readings[0]?.at ?? Infinity) < at - DELAY_MAX_MS - METER_TICK_MS / 2) readings.shift();
  while ((holds[0]?.to ?? Infinity) < at - DELAY_MAX_MS) holds.shift();
  state.last = clip;
  state.latest = at;
  return { engaged: at >= clip && at - clip <= CLIP_SAFE_HOLD_MS, reduction };
}

/**
 * Lane `lane` of what the source `source` puts out into a channel: a MIC/LINE
 * connector's signal less what its Clip Safe takes off, and any other source's
 * signal as `sourceSignal` gives it.
 */
function sourceLane(store: DeviceStore, stripId: string, source: string, lane: number, at: number): Lane {
  const jack = micLineJack(store, stripId, lane);
  if (jack !== undefined) return part(`jack:${jack}`, jackRaw(store, jack, at) - clipSafe(store, jack, at).reduction);
  return sourceSignal(store, source, lane, at);
}

/**
 * Lane `lane` of a source other than a MIC/LINE connector: its signal at its
 * level and its D.Gain, microSD Playback only while a file plays, and nothing
 * from None.
 */
function sourceSignal(store: DeviceStore, source: string, lane: number, at: number): Lane {
  if (source === "" || source === "None" || source.startsWith("MIC/LINE")) return [];
  if (source === PLAYBACK && !store.bool("sd.playing", false)) return [];
  const db = sourceBaseDb(source) + store.num(digitalGainPath(source), digitalGainShipped(source)) + wander(source, lane, at);
  return part(`source:${source}:${lane}`, db);
}

/** Which side of a stereo source a mono channel takes: an odd-numbered channel the left, an even one the right. */
const monoSide = (strip: Strip): number => ((strip.channels[0] ?? 1) % 2 === 1 ? 0 : 1);

/** What an input channel takes in from its source, before anything on it: a MONO IN channel one side, a stereo channel both. */
function inputLanes(store: DeviceStore, strip: Strip, at: number): Lanes {
  const source = store.str(`ch.${strip.id}.source`, "");
  const lanes = strip.kind === "monoIn" ? [monoSide(strip)] : [0, 1];
  return lanes.map((lane) => sourceLane(store, strip.id, source, lane, at));
}

// ---------------------------------------------------------------- the oscillator

/** What the oscillator puts out at `at`: a tone on Sine Wave, noise otherwise, and on Burst Noise only for its width once every interval. */
function oscillatorLane(store: DeviceStore, at: number): Lane {
  if (!store.bool("osc.on", false)) return [];
  const level = store.num("osc.level", -14);
  const mode = store.str("osc.mode", "Sine Wave");
  if (mode === "Sine Wave") return part("osc", level, true, store.num("osc.frequency", 1000));
  if (mode === "Burst Noise") {
    const interval = Math.max(store.num("osc.interval", 1), 0.1);
    return (at / 1000) % interval < store.num("osc.width", 0.1) ? part("osc", level) : [];
  }
  return part("osc", level - OSC_PINK_UNDER_DB);
}

/** What the oscillator is putting out in dB, or silence while it is off. */
export function oscillatorLevel(store: DeviceStore, at = readingMoment()): number {
  return levelDb(oscillatorLane(store, at));
}

// ---------------------------------------------------------------- the blocks that hold a signal down

/** What a screen's reduction bar is reading, and from which meter's level. */
export interface GrSpec {
  kind: "gate" | "comp" | "ducker" | "ssmcs" | "over" | "held";
  /** The block's own values live under this path. */
  base: string;
  /** The meter whose level the detector hears; a pair meter's louder side. */
  level: string;
  /** The bar lies across its block rather than down it. */
  row?: boolean;
  /** What the block adds back after it. */
  makeup: number;
  /** For `over`: the detector the insert hears through. */
  detector?: DetectorKind;
  /** For `over`: where the threshold the level is held down over is kept, and its value when unset. */
  threshold?: { path: string; fallback: number };
  /** For `over`: where the switch that turns the block on is kept, and its value when unset. Without it the block is on. */
  on?: { path: string; fallback: boolean };
  /** For `over`: where a switch that takes the block out is kept. While it is set the block is off. */
  bypass?: string;
}

/** The detector a block's reduction is worked out through. A ducker's depends on whether its key is stereo. */
function detectorOf(spec: GrSpec, stereoKey: boolean): DetectorKind | undefined {
  if (spec.kind === "gate" || spec.kind === "comp" || spec.kind === "ssmcs") return spec.kind;
  if (spec.kind === "ducker") return stereoKey ? "duckerStereo" : "duckerMono";
  return spec.kind === "over" ? spec.detector : undefined;
}

/**
 * The level the detector of `spec` hears on `lanes`, the meter it reads: a
 * ducker's stereo key as its two sides summed, anything else on its louder lane.
 */
export function heardOn(spec: GrSpec, lanes: readonly Lane[]): number {
  const stereoKey = spec.kind === "ducker" && lanes.length > 1;
  const kind = detectorOf(spec, stereoKey);
  const offset = kind ? DETECTOR_OFFSET[kind] : { tone: 0, noise: 0 };
  if (stereoKey) return heardDb(mix(...lanes), offset);
  return lanes.length === 0 ? SILENT_DB : Math.max(...lanes.map((lane) => heardDb(lane, offset)));
}

/** Whether the block named by `spec` is switched on. */
function blockOn(store: DeviceStore, spec: GrSpec): boolean {
  if (spec.kind === "gate") return store.bool(`${spec.base}.gate.on`, false);
  if (spec.kind === "comp") return store.bool(`${spec.base}.comp.on`, false);
  if (spec.kind === "ducker") return store.bool(`${spec.base}.ducker.on`, false);
  if (spec.kind === "ssmcs") return store.bool(`${spec.base}.comp.on`, false) && store.bool(`${spec.base}.ssmcs.on`, SSMCS_DEFAULTS.on);
  if (spec.kind === "over") return (spec.on ? store.bool(spec.on.path, spec.on.fallback) : true) && !(spec.bypass && store.bool(spec.bypass, false));
  return true;
}

/** The compander a detector belongs to, by name. */
const COMPANDER_OF: Partial<Record<DetectorKind, string>> = { companderS: "Compander-S", companderH: "Compander-H" };

/** An effect's value under `base`, and the value it ships at. */
function effectValue(store: DeviceStore, base: string, effect: string, key: string): { value: number; shipped: number } {
  const p = effectParams(effect).find((x) => x.key === key);
  const shipped = p && p.kind === "num" ? p.fallback : 0;
  return { value: store.num(`${base}.${key}`, shipped), shipped };
}

/**
 * How far an effect's output level controls stand from where they ship, in dB:
 * M.B.Comp's Out Gain dB for dB, an amp's Output by its own scale, and an amp's
 * Master at its bottom silencing it. The effects' tables are read at the values
 * they ship at, so this is what the table's output moves by.
 */
function outputLevelDb(store: DeviceStore, base: string, effect: string): number {
  if (effect === "M.B.Comp") {
    const { value, shipped } = effectValue(store, base, effect, "outGain");
    return value - shipped;
  }
  const scale = (step: number): number => (step <= 0 ? Number.NEGATIVE_INFINITY : guitarOutputDb(step));
  const has = (key: string): boolean => effectParams(effect).some((p) => p.key === key);
  let db = 0;
  if (has("output")) {
    const { value, shipped } = effectValue(store, base, effect, "output");
    db += scale(value) - scale(shipped);
  }
  if (has("master") && effectValue(store, base, effect, "master").value <= 0) db = Number.NEGATIVE_INFINITY;
  return db;
}

/**
 * What an insert's compander named by `spec` does when it hears `heard`: the gain
 * its curve gives the level, and how far that is under the gain on the flat of the
 * curve between the width and the threshold, which its reduction bar reads. The
 * flat lifts no more than 18 dB, and the expansion hears nothing under -62 dB.
 */
function compander(store: DeviceStore, spec: GrSpec, heard: number): { gain: number; reduction: number } | undefined {
  const name = spec.detector ? COMPANDER_OF[spec.detector] : undefined;
  if (!name) return undefined;
  const value = (key: string): number => effectValue(store, spec.base, name, key).value;
  const [threshold, ratio, width, out] = [value("threshold"), Math.max(1, value("ratio")), value("width"), value("gain")];
  const gain = companderGainDb(threshold, ratio, width, out, COMPANDER_EXPANSION[name] ?? 1)(heard);
  const flat = out + companderLiftDb(threshold, ratio);
  return { gain, reduction: Math.max(0, flat - gain) };
}

/** The gain the insert named by `spec` gives a level its detector hears as `heard`: a compander's curve, nothing while it is off. */
function insertGainDb(store: DeviceStore, spec: GrSpec, heard: number): number {
  if (!blockOn(store, spec)) return 0;
  return compander(store, spec, heard)?.gain ?? -reductionAt(store, spec, heard);
}

/**
 * How many dB the block named by `spec` holds its channel down when its detector
 * hears `heard`, from the block's own values. A block that is off takes nothing off.
 */
export function reductionAt(store: DeviceStore, spec: GrSpec, heard: number): number {
  const b = spec.base;
  if (!blockOn(store, spec)) return 0;
  const held = compander(store, spec, heard);
  if (held) return held.reduction;
  if (spec.kind === "gate") return gateReductionDb(heard, store.num(`${b}.gate.threshold`, GATE_DEFAULTS.threshold), store.num(`${b}.gate.range`, GATE_DEFAULTS.range));
  if (spec.kind === "comp") {
    return compReductionDb(
      heard,
      store.num(`${b}.comp.threshold`, COMP_DEFAULTS.threshold),
      store.num(`${b}.comp.ratio`, COMP_DEFAULTS.ratio),
      COMP_KNEE_WIDTH[store.str(`${b}.comp.knee`, COMP_DEFAULTS.knee)] ?? 16,
      spec.makeup,
    );
  }
  if (spec.kind === "ducker") return duckerReductionDb(heard, store.num(`${b}.ducker.threshold`, -40), store.num(`${b}.ducker.range`, -24));
  // SSMCS holds the channel down by how far it is over the corner Comp Drive sets.
  if (spec.kind === "ssmcs") {
    const over = heard - ssmcsCorner(store.num(`${b}.ssmcs.compDrive`, SSMCS_DEFAULTS.compDrive));
    return Math.min(-SSMCS_CORNER_FLOOR_DB, Math.max(0, over));
  }
  // An insert's compressor holds the channel down by how far it is over its threshold.
  if (spec.kind === "over" && spec.threshold) {
    return Math.min(OVER_REDUCTION_MAX_DB, Math.max(0, heard - store.num(spec.threshold.path, spec.threshold.fallback)));
  }
  // A block that carries its reading rather than working one out from its own
  // values hands it over on the node itself.
  return 0;
}

/**
 * Where a strip keeps its insert. A stereo-linked pair carries one insert between
 * its two channels, held on the lower-numbered one, so both halves show and set
 * the same effect.
 */
export function insertBase(fc: FlowCtx, strip: Strip): string {
  const first = linkedPair(fc, strip)?.[0] ?? strip;
  return `ch.${first.id}.insFx`;
}

/** GATE, hearing the louder channel of a stereo-linked pair. */
export function gateSpec(fc: FlowCtx, strip: Strip): GrSpec {
  return { kind: "gate", base: `ch.${strip.id}`, level: stripTap(fc, strip, "preGate"), makeup: 0 };
}

/**
 * COMP, hearing a linked pair's louder channel while its compressors hear the
 * pair, and otherwise the channel itself.
 */
export function compSpec(fc: FlowCtx, strip: Strip): GrSpec {
  const base = `ch.${strip.id}`;
  const level = compDetectorShared(fc, strip) ? stripTap(fc, strip, "preComp") : tapId(strip.id, "preComp");
  return { kind: "comp", base, level, makeup: fc.store.num(`${base}.comp.gain`, COMP_DEFAULTS.gain) };
}

/** The SSMCS compressor, which hears its own channel through the side chain's bell, and what goes into the strip while the chain is open. */
export function ssmcsSpec(fc: FlowCtx, strip: Strip): GrSpec {
  const base = `ch.${strip.id}`;
  const keyed = fc.store.bool(`${base}.ssmcs.sc.on`, SSMCS_DEFAULTS.sc.on);
  return { kind: "ssmcs", base, level: tapId(strip.id, keyed ? "sideChain" : "preComp"), makeup: 0 };
}

/**
 * What a ducker can listen to, in the order the unit lists them: the input
 * channels, then the stereo bus and the two mix buses. The list names a channel
 * by its numbers alone (`1`, `5/6`) and the stereo bus `ST`; the box over it
 * carries the channel's own name.
 */
export function duckerSources(model: UnitModel): { label: string; boxed: string; strip: Strip }[] {
  const channels = model.inputs
    .filter((s) => s.kind === "monoIn" || s.kind === "stIn")
    .map((s) => ({ label: s.channels.join("/"), boxed: s.label, strip: s }));
  const stereo = model.outputs.filter((s) => s.kind === "stereo").map((s) => ({ label: "ST", boxed: "ST", strip: s }));
  const mixes = model.outputs.filter((s) => s.kind === "mix").map((s) => ({ label: s.label, boxed: s.label, strip: s }));
  return [...channels, ...stereo, ...mixes];
}

/** The strip a ducker is keyed from, or none where its key is not on the list. */
export function duckerKey(fc: FlowCtx, strip: Strip): Strip | undefined {
  const label = fc.store.str(`ch.${strip.id}.ducker.source`, DUCKER_SOURCE_DEFAULT);
  return duckerSources(fc.model).find((s) => s.label === label)?.strip;
}

/** Where a channel's recording, direct out and ducker key are taken from, by the Rec Point it is set to. */
export function recPointTap(fc: FlowCtx, strip: Strip): Tap {
  const point = fc.store.str(`ch.${strip.id}.recPoint`, "PRE FADER");
  const taps: Record<string, Tap> = { "PRE GATE": "preGate", "PRE COMP": "preComp", "PRE EQ": "preEq", "PRE INS FX": "preIns", "PRE FADER": "preFader" };
  return taps[point] ?? "preFader";
}

/**
 * What a strip is heard at by what listens to it from elsewhere — a ducker's key,
 * a record track: a channel at its Rec Point, a bus as it goes out.
 */
export function listenedTap(fc: FlowCtx, strip: Strip): string {
  if (strip.kind === "monoIn" || strip.kind === "stIn") return tapId(strip.id, recPointTap(fc, strip));
  return tapId(strip.id, "post");
}

/** DUCKER, hearing its key. */
export function duckerSpec(fc: FlowCtx, strip: Strip): GrSpec | undefined {
  const key = duckerKey(fc, strip);
  return key ? { kind: "ducker", base: `ch.${strip.id}`, level: listenedTap(fc, key), makeup: 0 } : undefined;
}

/** An insert's compander, hearing a linked pair's louder channel. */
export function insertSpec(fc: FlowCtx, strip: Strip, effect: string, base = insertBase(fc, strip)): GrSpec {
  const threshold = effectParams(effect).find((p) => p.key === "threshold");
  const detector = insertDetector(effect);
  return {
    kind: "over",
    base,
    level: stripTap(fc, strip, "preIns"),
    makeup: 0,
    ...(detector ? { detector } : {}),
    ...(threshold && threshold.kind === "num" ? { threshold: { path: `${base}.threshold`, fallback: threshold.fallback } } : {}),
    on: { path: `${base}.on`, fallback: false },
  };
}

// ---------------------------------------------------------------- the flow

/** A lane-by-lane reading of a meter. */
type Lanes = Lane[];

interface Flow {
  taps: Map<string, Lanes>;
  /** The meters just after a fader, and which of their lanes read over while that lane going into the fader is over. */
  over: Map<string, boolean[]>;
}

/** A fader's gain: its stored level, and nothing at the bottom of its travel. */
function faderDb(level: number): number {
  return level <= LEVEL_MIN_DB ? Number.NEGATIVE_INFINITY : level;
}

/** A mono lane placed across two by a position: on a pair on its balance, the channel's own side alone. */
function placeMono(fc: FlowCtx, strip: Strip, lane: Lane, position: number): Lanes {
  const [l, r] = panLawDb(position);
  if (strip.kind === "monoIn" && usesBalance(fc, strip)) return monoSide(strip) === 0 ? [gain(lane, l), []] : [[], gain(lane, r)];
  return [gain(lane, l), gain(lane, r)];
}

/** Two lanes each taken by their own side of a balance. */
function balance(lanes: Lanes, position: number): Lanes {
  const [l, r] = panLawDb(position);
  return [gain(lanes[0] ?? [], l), gain(lanes[1] ?? [], r)];
}

/** Where a strip is placed: its PAN, or the balance it is placed by. */
const positionOf = (fc: FlowCtx, strip: Strip): number => fc.store.num(stripPosition(fc, strip).path, 0);

/** Both sides of a stereo signal folded into one, as the unit folds them into a mono bus. */
const fold = (lanes: Lanes): Lane => mix(...lanes.map((lane) => gain(lane, -10 * Math.log10(2))));

/** What each response worked out lately does to pink noise, by the values it is drawn from. */
const pinkGains = new Map<string, number>();

/** How many responses `pinkGains` holds before it starts over. */
const PINK_GAINS_KEPT = 256;

/** The gains each store's present values give, by name: each looked up once while the values stay. */
const pinkGainsNow = new WeakMap<DeviceStore, { revision: number; gains: Map<string, number> }>();

/**
 * What the response named `name` does to pink noise at the store's present
 * values: worked out once per set of `values` it is drawn from.
 */
function pinkGainOf(store: DeviceStore, name: string, values: () => unknown, response: () => (hz: number) => number): number {
  let now = pinkGainsNow.get(store);
  if (!now || now.revision !== store.revision) pinkGainsNow.set(store, (now = { revision: store.revision, gains: new Map() }));
  let v = now.gains.get(name);
  if (v !== undefined) return v;
  const key = JSON.stringify(values());
  v = pinkGains.get(key);
  if (v === undefined) {
    if (pinkGains.size >= PINK_GAINS_KEPT) pinkGains.clear();
    pinkGains.set(key, (v = pinkGainDb(response())));
  }
  now.gains.set(name, v);
  return v;
}

/** What an EQ does to a signal: to pink noise, in dB, and at each frequency. */
interface Eq {
  db: number;
  response: () => (hz: number) => number;
}

/** An EQ that is off. */
const FLAT: Eq = { db: 0, response: () => () => 0 };

/** `lane` through `eq`. */
const through = (lane: Lane, eq: Eq): Lane => filtered(lane, eq.db, eq.response);

/** A strip's 4-band EQ, flat while it is off. */
function eqOf(store: DeviceStore, base: string): Eq {
  if (!store.bool(`${base}.eq.on`, true)) return FLAT;
  const response = () => fourBandResponse(store, base);
  return { db: pinkGainOf(store, `${base}.eq`, () => ["eq", fourBands(store, base)], response), response };
}

/** A MONO IN channel's HPF, flat while it is off. */
function hpfOf(store: DeviceStore, base: string): Eq {
  if (!store.bool(`${base}.hpf.on`, false)) return FLAT;
  const freq = store.num(`${base}.hpf.freq`, 80);
  const response = () => bandResponse({ on: true, shape: "HPF", freq, q: 0.71, gain: 0 });
  return { db: pinkGainOf(store, `${base}.hpf`, () => ["hpf", freq], response), response };
}

/** The SSMCS strip's EQ, flat while it is off. */
function ssmcsEqOf(store: DeviceStore, base: string): Eq {
  if (!store.bool(`${base}.eq.on`, true)) return FLAT;
  const response = () => ssmcsEqResponse(store, base);
  return { db: pinkGainOf(store, `${base}.ssmcsEq`, () => ["ssmcs", SSMCS_BAND_KEYS.map((key) => ssmcsBand(store, base, key))], response), response };
}

/** The bell the SSMCS compressor listens through. */
function sideChainOf(store: DeviceStore, base: string): Eq {
  const sc = ssmcsSideChain(store, base);
  const response = () => ssmcsSideChainResponse(sc);
  return { db: pinkGainOf(store, `${base}.ssmcsSc`, () => ["ssmcsSc", sc], response), response };
}

/** Whether an effect runs at the sampling frequency the unit is at. */
const runs = (option: EffectOption | undefined, rate: number): boolean => option !== undefined && (option.maxRate === undefined || rate <= option.maxRate);

class FlowBuilder {
  readonly taps = new Map<string, Lanes>();
  readonly over = new Map<string, boolean[]>();
  readonly rate: number;
  readonly osc: Lane;

  constructor(
    readonly fc: FlowCtx,
    readonly at: number,
  ) {
    this.rate = fc.store.num("setup.samplingFrequency", 48000);
    this.osc = oscillatorLane(fc.store, at);
  }

  get store(): DeviceStore {
    return this.fc.store;
  }

  put(stripId: string, tap: Tap, lanes: Lanes): Lanes {
    this.taps.set(tapId(stripId, tap), lanes);
    return lanes;
  }

  read(id: string): Lanes {
    const members = pairMembers(id);
    if (members) return members.map((m) => this.read(m)[0] ?? []);
    return this.taps.get(id) ?? [];
  }

  /** The reduction the block named by `spec` takes off, heard on the meter it names. */
  reduction(spec: GrSpec): number {
    return reductionAt(this.store, spec, heardOn(spec, this.read(spec.level)));
  }

  /** The gain the insert named by `spec` gives its signal, heard on the meter it names. */
  insertGain(spec: GrSpec): number {
    return insertGainDb(this.store, spec, heardOn(spec, this.read(spec.level)));
  }

  /** Mark each lane of the meter after a fader as reading over while that lane going into the fader is over. */
  carryOver(stripId: string, into: Lanes, tap: Tap): void {
    this.over.set(tapId(stripId, tap), into.map((lane) => levelDb(lane) >= CLIP_DB));
  }

  on(strip: Strip): boolean {
    return this.store.bool(`ch.${strip.id}.on`, true);
  }

  fader(strip: Strip): number {
    return faderDb(this.store.num(`ch.${strip.id}.level`, faderShipped(strip)));
  }
}

/** The buses a flow sums into, lane by lane: the stereo bus and each MIX bus in two, each FX bus in one. */
class Sums {
  readonly lanes = new Map<string, Lane[][]>();

  add(busId: string, lanes: Lanes): void {
    const list = this.lanes.get(busId) ?? [];
    list.push(lanes);
    this.lanes.set(busId, list);
  }

  total(busId: string, width: number): Lanes {
    const list = this.lanes.get(busId) ?? [];
    return Array.from({ length: width }, (_, i) => mix(...list.map((l) => l[i] ?? [])));
  }

  copy(): Sums {
    const next = new Sums();
    for (const [k, v] of this.lanes) next.lanes.set(k, [...v]);
    return next;
  }
}

/**
 * The sends out of a channel into the MIX and FX buses. `pre` and `post` are the
 * signal before and after its fader; each send takes one of them, at its own
 * level, placed by its own position or, into a MIX bus on FIXED or on Pan Link,
 * by the channel's. A send into a MIX bus on FIXED takes the signal after the
 * fader at 0 dB whatever its own tap and level. The channel's [ON] stops every send.
 */
function sendOut(f: FlowBuilder, sums: Sums, strip: Strip, pre: Lanes, post: Lanes): void {
  const { store, fc } = f;
  if (!f.on(strip)) return;
  const b = `ch.${strip.id}`;
  for (const to of [...fc.model.outputs.filter((o) => o.kind === "mix"), ...fc.model.inputs.filter((s) => s.kind === "fx")]) {
    if (to.id === strip.id || (strip.kind === "fx" && to.kind === "fx")) continue;
    const s = `${b}.send.${to.id}`;
    if (!store.bool(`${s}.on`, true)) continue;
    if (to.kind === "fx") {
      const from = store.bool(`${s}.pre`, false) ? pre : post;
      sums.add(to.id, [gain(from.length > 1 ? fold(from) : (from[0] ?? []), faderDb(store.num(`${s}.level`, LEVEL_MIN_DB)))]);
      continue;
    }
    const fixed = store.str(`ch.${to.id}.busType`, "VARI") === "FIXED";
    const linked = store.bool(`ch.${to.id}.panLink`, false);
    const from = !fixed && store.bool(`${s}.pre`, false) ? pre : post;
    const level = fixed ? 0 : faderDb(store.num(`${s}.level`, LEVEL_MIN_DB));
    const position = fixed || linked ? positionOf(fc, strip) : store.num(`${s}.balance`, 0);
    const placed = strip.kind === "monoIn" ? placeMono(fc, strip, from[0] ?? [], position) : balance(from, position);
    sums.add(to.id, placed.map((lane) => gain(lane, level)));
  }
}

/** Into the stereo bus, where the strip's assign to it is on. */
function toStereo(f: FlowBuilder, sums: Sums, strip: Strip, lanes: Lanes): void {
  const stereo = f.fc.model.outputs.find((o) => o.kind === "stereo");
  if (stereo && f.store.bool(`ch.${strip.id}.send.${stereo.id}.on`, true)) sums.add(stereo.id, lanes);
}

/** A MONO IN channel from its source to its fader, with the pairs' detectors heard across both channels. */
function monoChannels(f: FlowBuilder, sums: Sums): void {
  const { store, fc } = f;
  const strips = fc.model.inputs.filter((s) => s.kind === "monoIn");
  for (const s of strips) {
    const b = `ch.${s.id}`;
    const [src = []] = f.put(s.id, "input", inputLanes(store, s, f.at));
    const flipped = store.bool(`${b}.phase`, false) ? invert(src) : src;
    f.put(s.id, "preGate", [through(flipped, hpfOf(store, b))]);
  }
  for (const s of strips) f.put(s.id, "preComp", [gain(f.read(tapId(s.id, "preGate"))[0] ?? [], -f.reduction(gateSpec(fc, s)))]);
  for (const s of strips) {
    const b = `ch.${s.id}`;
    const into = f.read(tapId(s.id, "preComp"))[0] ?? [];
    if (store.str(`${b}.compEqOrder`, "COMP->EQ") === "SSMCS") {
      const strip = store.bool(`${b}.ssmcs.on`, SSMCS_DEFAULTS.on);
      const keyed = store.bool(`${b}.comp.on`, false) && strip && store.bool(`${b}.ssmcs.sc.on`, SSMCS_DEFAULTS.sc.on);
      f.put(s.id, "sideChain", [keyed ? through(into, sideChainOf(store, b)) : []]);
      const made = strip ? store.num(`${b}.ssmcs.outGain`, SSMCS_DEFAULTS.outGain) : 0;
      f.put(s.id, "preIns", [gain(through(into, strip ? ssmcsEqOf(store, b) : FLAT), made - f.reduction(ssmcsSpec(fc, s)))]);
      continue;
    }
    f.put(s.id, "sideChain", [into]);
    const spec = compSpec(fc, s);
    const made = store.bool(`${b}.comp.on`, false) ? spec.makeup : 0;
    const out = f.put(s.id, "preEq", [gain(into, made - f.reduction(spec))]);
    f.put(s.id, "preIns", [through(out[0] ?? [], eqOf(store, b))]);
  }
  for (const s of strips) {
    const into = f.read(tapId(s.id, "preIns"))[0] ?? [];
    const base = insertBase(fc, s);
    const effect = store.str(`${base}.effect`, NO_EFFECT);
    const option = INPUT_INSERT_EFFECTS.find((o) => o.name === effect);
    let out = into;
    if (effect !== NO_EFFECT && store.bool(`${base}.on`, false) && runs(option, f.rate)) {
      if (INSERT_CURVES[effect]) out = gain(into, insertCurveGainDb(effect, levelDb(into)) + outputLevelDb(store, base, effect));
      else out = gain(into, f.insertGain(insertSpec(fc, s, effect, base)));
    }
    f.put(s.id, "preFader", [out]);
  }
  for (const s of strips) {
    const pre = f.read(tapId(s.id, "preFader"));
    const post = f.put(s.id, "post", f.on(s) ? pre.map((lane) => gain(lane, f.fader(s))) : [[]]);
    f.carryOver(s.id, pre, "post");
    f.put(s.id, "cue", [pre[0] ?? [], pre[0] ?? []]);
    if (f.on(s)) toStereo(f, sums, s, placeMono(fc, s, post[0] ?? [], positionOf(fc, s)));
    sendOut(f, sums, s, pre, post);
  }
}

/** A stereo channel from its source to its fader: DUCKER, which may hear a bus, comes after. */
function stereoChannelsIn(f: FlowBuilder): void {
  const { store, fc } = f;
  for (const s of fc.model.inputs.filter((x) => x.kind === "stIn")) {
    const b = `ch.${s.id}`;
    const input = f.put(s.id, "input", inputLanes(store, s, f.at));
    const flipped = input.map((lane, i) => (store.bool(`${b}.phase.${i === 0 ? "l" : "r"}`, false) ? invert(lane) : lane));
    f.put(s.id, "preEq", flipped);
    const eq = eqOutOfUse(s.kind, f.rate) ? FLAT : eqOf(store, b);
    const pre = f.put(s.id, "preFader", flipped.map((lane) => through(lane, eq)));
    f.put(s.id, "preDucker", f.on(s) ? pre.map((lane) => gain(lane, f.fader(s))) : [[], []]);
    f.carryOver(s.id, pre, "preDucker");
    f.put(s.id, "cue", pre);
  }
}

/** What each stereo channel's DUCKER takes off, by channel. */
type Ducking = Map<string, number>;

/** Everything after the stereo channels' DUCKER: their outputs, the FX channels, the MIX buses and the stereo bus. */
function busesOut(f: FlowBuilder, base: Sums, ducking: Ducking): void {
  const { store, fc } = f;
  const sums = base.copy();
  for (const s of fc.model.inputs.filter((x) => x.kind === "stIn")) {
    const pre = f.read(tapId(s.id, "preFader"));
    const post = f.put(s.id, "post", f.read(tapId(s.id, "preDucker")).map((lane) => gain(lane, -(ducking.get(s.id) ?? 0))));
    if (f.on(s)) toStereo(f, sums, s, balance(post, store.num(stripPosition(fc, s).path, 0)));
    sendOut(f, sums, s, pre, post);
  }
  for (const t of OSC_TARGETS) {
    if (!store.bool(`osc.assign.${t.id}`, t.shipped)) continue;
    const bus = t.meter;
    sums.add(bus, t.lane === null ? [f.osc] : t.lane === 0 ? [f.osc, []] : [[], f.osc]);
  }
  for (const s of fc.model.inputs.filter((x) => x.kind === "fx")) {
    const b = `ch.${s.id}`;
    const effect = store.str(`${b}.effect.type`, FX_EFFECT_DEFAULT[s.id] ?? "");
    const working = runs((FX_EFFECTS[s.id] ?? []).find((o) => o.name === effect), f.rate);
    const input = f.put(s.id, "input", working ? sums.total(s.id, 1) : [[]]);
    const heard = levelDb(input[0] ?? []);
    const back = FX_RETURN_DB[effect] ?? [0, 0];
    const returned = f.put(
      s.id,
      "effect",
      back.map((db, lane) => (heard > SILENT_DB ? part(`fx:${s.id}:${lane}`, heard + db) : [])),
    );
    const post = f.put(s.id, "post", f.on(s) ? returned.map((lane) => gain(lane, f.fader(s))) : [[], []]);
    f.carryOver(s.id, returned, "post");
    f.put(s.id, "cue", returned);
    if (f.on(s)) toStereo(f, sums, s, balance(post, store.num(`${b}.balance`, 0)));
    sendOut(f, sums, s, returned, post);
  }
  const buses = [...fc.model.outputs.filter((o) => o.kind === "mix"), ...fc.model.outputs.filter((o) => o.kind === "stereo")];
  for (const s of buses) {
    const b = `ch.${s.id}`;
    const sum = f.put(s.id, "sum", sums.total(s.id, 2));
    const pre = f.put(s.id, "preFader", sum.map((lane) => through(lane, eqOf(store, b))));
    const [l, r] = panLawDb(store.num(`${b}.balance`, 0));
    const into = f.put(s.id, "preIns", f.on(s) ? pre.map((lane, i) => gain(lane, f.fader(s) + (i === 0 ? l : r))) : [[], []]);
    f.carryOver(s.id, pre, "preIns");
    const effect = store.str(`${b}.insFx.effect`, NO_EFFECT);
    const option = OUTPUT_INSERT_EFFECTS.find((o) => o.name === effect);
    let made = 0;
    if (effect !== NO_EFFECT && runs(option, f.rate) && store.bool(`${b}.insFx.on`, false)) {
      const loudest = into.reduce((a, lane) => (levelDb(lane) > levelDb(a) ? lane : a), [] as Lane);
      made =
        insertDetector(effect) === "mbc"
          ? curveGainDb(MBC_CURVES[mostlyTone(loudest) ? "tone" : "noise"], levelDb(loudest)) + outputLevelDb(store, `${b}.insFx`, effect)
          : f.insertGain(insertSpec(fc, s, effect, `${b}.insFx`));
    }
    const post = f.put(s.id, "post", into.map((lane) => gain(lane, made)));
    f.put(s.id, "cue", post);
    if (s.kind === "mix") toStereo(f, sums, s, post);
  }
}

/** The stereo channels whose DUCKER is on, and what each hears. */
function duckers(f: FlowBuilder): { strip: Strip; spec: GrSpec; bus: boolean }[] {
  const out: { strip: Strip; spec: GrSpec; bus: boolean }[] = [];
  for (const s of f.fc.model.inputs.filter((x) => x.kind === "stIn")) {
    const spec = duckerSpec(f.fc, s);
    if (!spec || !blockOn(f.store, spec)) continue;
    const key = duckerKey(f.fc, s);
    out.push({ strip: s, spec, bus: key !== undefined && key.side === "output" });
  }
  return out;
}

/**
 * The mixer at `at`. A DUCKER keyed by a bus it feeds settles where what it
 * takes off and what its key then hears agree, as the unit's own does.
 */
function evaluate(fc: FlowCtx, at: number): Flow {
  const f = new FlowBuilder(fc, at);
  const sums = new Sums();
  monoChannels(f, sums);
  stereoChannelsIn(f);
  const keyed = duckers(f);
  const ducking: Ducking = new Map();
  for (const d of keyed) if (!d.bus) ducking.set(d.strip.id, f.reduction(d.spec));
  busesOut(f, sums, ducking);
  if (keyed.some((d) => d.bus)) {
    // Each round takes what the keys now hear; from the second on it goes half way,
    // so a ducker that is its own key's only signal settles rather than swinging.
    for (let round = 0; round < 16; round++) {
      let moved = 0;
      for (const d of keyed) {
        if (!d.bus) continue;
        const was = ducking.get(d.strip.id) ?? 0;
        const heard = f.reduction(d.spec);
        moved = Math.max(moved, Math.abs(heard - was));
        ducking.set(d.strip.id, round === 0 ? heard : (was + heard) / 2);
      }
      if (moved < 0.001) break;
      busesOut(f, sums, ducking);
    }
  }
  return { taps: f.taps, over: f.over };
}

/** The flows worked out lately, per store, for the moments and the values they were worked out at. */
const flowCache = new WeakMap<DeviceStore, { revision: number; at: number; flow: Flow }[]>();

/** The mixer at `at`, worked out once per moment and set of values. */
function flowAt(fc: FlowCtx, at: number): Flow {
  const list = flowCache.get(fc.store) ?? [];
  const hit = list.find((e) => e.at === at && e.revision === fc.store.revision);
  if (hit) return hit.flow;
  const flow = evaluate(fc, at);
  list.unshift({ revision: fc.store.revision, at, flow });
  flowCache.set(fc.store, list.slice(0, 6));
  return flow;
}

/** What the streaming bus is fed, before and after its DELAY. */
function streaming(fc: FlowCtx, strip: Strip, at: number, tap: Tap): Lanes {
  const b = `ch.${strip.id}`;
  const delayed = tap !== "input" && fc.store.bool(`${b}.delay.on`, false) ? fc.store.num(`${b}.delay.ms`, 1) : 0;
  const source = fc.model.outputs.find((o) => o.label === fc.store.str(`${b}.source`, "STEREO"));
  return source ? (flowAt(fc, at - delayed).taps.get(tapId(source.id, "post")) ?? []) : [];
}

/** Whether anything is cued. */
function anyCued(fc: FlowCtx): boolean {
  return [...fc.model.inputs, ...fc.model.outputs].some((s) => fc.store.bool(`ch.${s.id}.cue`, false));
}

/** The cue bus: every cued strip's cue signal summed. */
function cueBus(fc: FlowCtx, at: number): Lanes {
  const flow = flowAt(fc, at);
  const cued: Lanes[] = [];
  for (const s of [...fc.model.inputs, ...fc.model.outputs]) {
    if (!fc.store.bool(`ch.${s.id}.cue`, false)) continue;
    cued.push(s.kind === "streaming" ? streaming(fc, s, at, "post") : (flow.taps.get(tapId(s.id, "cue")) ?? []));
  }
  return [0, 1].map((i) => mix(...cued.map((l) => l[i] ?? [])));
}

/** A monitor bus: its source, the cue bus in its place while CUE Interrupt has something to take, folded on MONO, after its ON and LEVEL. */
function monitor(fc: FlowCtx, n: number, at: number, tap: Tap): Lanes {
  const m = `monitor.${n}`;
  const source = fc.model.outputs.find((o) => o.label === fc.store.str(`${m}.source`, "STEREO"));
  const input = source ? (flowAt(fc, at).taps.get(tapId(source.id, "post")) ?? []) : [];
  if (tap === "input") return input;
  const heard = fc.store.bool(`${m}.cueInterrupt`, true) && anyCued(fc) ? cueBus(fc, at) : input;
  const folded = fc.store.bool(`${m}.mono`, false) ? [fold(heard), fold(heard)] : heard;
  if (!fc.store.bool(`${m}.on`, true)) return [[], []];
  return folded.map((lane) => gain(lane, faderDb(fc.store.num(`${m}.level`, 0))));
}

/** What a meter id names: a strip's tap, a monitor, the cue bus or the oscillator. A bare strip id reads what the strip puts out. */
function resolve(id: string): { strip: string; tap: Tap } {
  const cut = id.lastIndexOf(TAP_MARK);
  return cut < 0 ? { strip: id, tap: "post" } : { strip: id.slice(0, cut), tap: id.slice(cut + 1) as Tap };
}

/** Each lane a meter reads at `at`, in dB: a lane of a meter just after a fader reads over while that lane going into the fader is. */
export function flowLevels(fc: FlowCtx, id: string, at: number): number[] {
  if (id === OSC_METER) return [oscillatorLevel(fc.store, at)];
  if (id === CUE_METER) return cueBus(fc, at).map(levelDb);
  if (id === PLAYBACK_METER) return [0, 1].map((lane) => levelDb(sourceSignal(fc.store, PLAYBACK, lane, at)));
  const { strip: stripId, tap } = resolve(id);
  const mon = /^monitor\.(\d+)$/.exec(stripId);
  if (mon) return monitor(fc, Number(mon[1]), at, tap).map(levelDb);
  const strip = findStrip(fc.model, stripId);
  if (strip?.kind === "streaming") {
    const lanes = tap === "cue" ? streaming(fc, strip, at, "post") : streaming(fc, strip, at, tap);
    return (lanes.length ? lanes : [[], []]).map(levelDb);
  }
  // What a channel takes in is its source alone, read without the rest of the mixer.
  if (tap === "input" && (strip?.kind === "monoIn" || strip?.kind === "stIn")) return inputLanes(fc.store, strip, at).map(levelDb);
  const flow = flowAt(fc, at);
  const lanes = flow.taps.get(tapId(stripId, tap)) ?? [];
  const over = flow.over.get(tapId(stripId, tap));
  return lanes.map((lane, i) => (over?.[i] ? Math.max(CLIP_DB, levelDb(lane)) : levelDb(lane)));
}

/** The lanes a meter reads at `at`, for a detector to hear. */
export function flowLanes(fc: FlowCtx, id: string, at: number): Lanes {
  const members = pairMembers(id);
  if (members) return members.map((m) => flowLanes(fc, m, at)[0] ?? []);
  const { strip: stripId, tap } = resolve(id);
  const strip = findStrip(fc.model, stripId);
  if (strip?.kind === "streaming") return streaming(fc, strip, at, tap === "cue" ? "post" : tap);
  if (/^monitor\.\d+$/.test(stripId)) return monitor(fc, Number(stripId.slice("monitor.".length)), at, tap);
  return flowAt(fc, at).taps.get(tapId(stripId, tap)) ?? [];
}
