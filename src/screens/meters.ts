// Meter levels.
//
// The simulator carries no audio, so with the SimTransport attached the meters
// show a synthetic signal: it exists so the screens read the way the unit's do
// (a muted channel falls silent, a fader move is visible, the oscillator lands
// on the lanes it is assigned to, the cue bus carries what is cued, a channel on
// a MIC/LINE connector rises with its A.Gain until Clip Safe holds it down), and
// it is not a measurement of anything. With a device transport attached, the
// same accessor is fed from the unit's own meter stream instead — see
// setMeterSource.

import type { AppContext } from "../app/context";
import type { DeviceStore } from "../device/store";
import { COMP_KNEE_WIDTH, OVER_REDUCTION_MAX_DB, SSMCS_CORNER_FLOOR_DB, compReductionDb, grBarShare, duckerReductionDb, gateReductionDb, levelBarShare, ssmcsCorner } from "../model/dynamics";
import { GATE_DEFAULTS, SSMCS_DEFAULTS } from "../model/defaults";
import { OSC_TARGETS } from "../model/oscillator";
import type { Strip } from "../model/types";
import { monoStripId } from "../model/units";
import { setMeterOffset } from "../ui/widgets";
import { jackParam, micLineJack } from "./head-amp";

/** A meter reading nothing. */
const SILENT = -96;

/** The level at which a meter's clip indicator lights. */
const CLIP_DB = 0;

/** The id of the meter that reads the cue bus, which no strip carries. */
export const CUE_METER = "cue";

/** The id of the meter that reads the oscillator's own output. */
const OSC_METER = "osc";

/** What the pair of lamps at the top of a strip's indicator block reads. */
export function lampState(levels: readonly number[]): { signal: boolean; clip: boolean } {
  const peak = Math.max(...levels);
  return { signal: levelBarShare(peak) > 0 && peak <= CLIP_DB, clip: peak >= CLIP_DB };
}

export type MeterSource = (stripId: string, channels: number) => number[];

let source: MeterSource | null = null;

/** Point the meters at a real device's metering. */
export function setMeterSource(next: MeterSource | null): void {
  source = next;
}

/**
 * A slow deterministic wander per strip and lane, within 7 dB either way, so the
 * picture is stable between repaints rather than flickering with every render.
 */
function wander(stripId: string, lane: number, at: number): number {
  const t = at / 1000;
  let seed = 0;
  for (let i = 0; i < stripId.length; i++) seed = (seed * 31 + stripId.charCodeAt(i)) % 997;
  const phase = (seed + lane * 137) / 97;
  return Math.sin(t * 1.7 + phase) * 4 + Math.sin(t * 0.6 + phase * 2) * 3;
}

/** Where a strip's own signal sits before its fader: a channel at its factory fader reads in the green. */
const STRIP_SIGNAL_DB = -26;

/** What a MIC/LINE connector's signal reads with its A.Gain at 0 dB: its peaks first reach the clip level at +44 dB. */
const MIC_LINE_SIGNAL_DB = -50;

/** How far Clip Safe takes its connector's signal down once it has clipped. */
const CLIP_SAFE_REDUCTION_DB = 23;

/** How long Clip Safe holds the signal down after the last clip it heard. */
export const CLIP_SAFE_HOLD_MS = 5000;

/** What the connector numbered `n` puts out before Clip Safe: its signal, raised by its A.Gain. */
function jackRaw(store: DeviceStore, n: number, at: number): number {
  return MIC_LINE_SIGNAL_DB + store.num(jackParam(n, "gain"), -8) + wander(monoStripId(n), 0, at);
}

/** The moment each connector's Clip Safe last heard a clip, per store. */
const clipSafeStates = new WeakMap<DeviceStore, Map<number, number>>();

/**
 * Clip Safe on the connector numbered `n` at `at`: whether it is engaged, and by
 * how many dB it is holding the signal down. A reading that finds the signal at
 * the clip level — held down or not — is a clip: that reading still shows it,
 * and after it the signal is held CLIP_SAFE_REDUCTION_DB down until
 * CLIP_SAFE_HOLD_MS after the last clip, engaged for as long. The A.Gain setting
 * stays where it is. Switched off, it forgets what it heard.
 */
export function clipSafe(store: DeviceStore, n: number, at = Date.now()): { engaged: boolean; reduction: number } {
  let states = clipSafeStates.get(store);
  if (!states) clipSafeStates.set(store, (states = new Map()));
  if (!store.bool(jackParam(n, "clipSafe"), false)) {
    states.delete(n);
    return { engaged: false, reduction: 0 };
  }
  const last = states.get(n) ?? -Infinity;
  const reduction = at > last && at - last <= CLIP_SAFE_HOLD_MS ? CLIP_SAFE_REDUCTION_DB : 0;
  const clip = jackRaw(store, n, at) - reduction >= CLIP_DB ? Math.max(last, at) : last;
  states.set(n, clip);
  return { engaged: at >= clip && at - clip <= CLIP_SAFE_HOLD_MS, reduction };
}

/**
 * A strip's level before its fader and its ON, one entry per lane: on a MIC/LINE
 * connector that connector's signal less what its Clip Safe takes off, and on
 * any other source the strip's own signal.
 */
function preFader(store: DeviceStore, stripId: string, channels: number, at: number): number[] {
  return Array.from({ length: channels }, (_, c) => {
    const jack = micLineJack(store, stripId, c);
    if (jack === undefined) return STRIP_SIGNAL_DB + wander(stripId, c, at);
    return jackRaw(store, jack, at) - clipSafe(store, jack, at).reduction;
  });
}

/** What a meter reading a strip's level as it arrives, before its fader, goes by. */
const INPUT_METER = "in:";

/** The meter id of `stripId`'s level as it arrives, before its fader. */
export const inputMeterId = (stripId: string): string => `${INPUT_METER}${stripId}`;

/** What a meter reading two mono strips as the two sides of one stereo meter goes by. */
const PAIR_METER = "pair:";

/** The meter id of `left` and `right` read side by side: `left`'s level in the first lane, `right`'s in the second. */
export const pairMeterId = (left: string, right: string): string => `${PAIR_METER}${left}+${right}`;

/** Meter values in dB for one strip: one entry for mono, two for stereo. */
export function simulatedLevel(ctx: AppContext, strip: Strip | undefined, stereo: boolean): number[] {
  const channels = stereo ? 2 : 1;
  if (!strip) return Array.from({ length: channels }, () => SILENT);
  return meterLevels(ctx.store, strip.id, channels);
}

/** A channel's level as it arrives, before its fader and its ON: what the INPUT screen and the channel view's input meter read. */
export function simulatedInput(ctx: AppContext, strip: Strip, stereo: boolean): number[] {
  return meterLevels(ctx.store, inputMeterId(strip.id), stereo ? 2 : 1);
}

/** Draw `node`, a Clip Safe switch, as holding the gain down or not. */
function showClipSafe(node: HTMLElement, engaged: boolean): void {
  node.classList.toggle("is-engaged", engaged);
  if (engaged) node.setAttribute("aria-description", "holding the gain down");
  else node.removeAttribute("aria-description");
}

/** Keep `node`, the Clip Safe switch of `connector`, drawn as holding the gain down while it does: now, and as the ticker runs. */
export function markClipSafe(store: DeviceStore, node: HTMLElement, connector: Strip): HTMLElement {
  const n = connector.channels[0] ?? 0;
  node.dataset["clipSafe"] = String(n);
  showClipSafe(node, clipSafe(store, n).engaged);
  return node;
}

/** Two levels in dB as one: what the pair of them reads together. */
function sumDb(a: number, b: number): number {
  return 10 * Math.log10(10 ** (a / 10) + 10 ** (b / 10));
}

/**
 * What the oscillator is putting out in dB, or silence while it is off. Burst
 * Noise sounds for its width once every interval.
 */
export function oscillatorLevel(store: DeviceStore, at = Date.now()): number {
  if (!store.bool("osc.on", false)) return SILENT;
  const level = store.num("osc.level", -14);
  if (store.str("osc.mode", "Sine Wave") !== "Burst Noise") return level;
  const interval = Math.max(store.num("osc.interval", 1), 0.1);
  return ((at / 1000) % interval) < store.num("osc.width", 0.1) ? level : SILENT;
}

/** The strips whose CUE is on, which the cue bus carries. */
function cuedStrips(store: DeviceStore): string[] {
  return store
    .pathsUnder("ch")
    .filter((p) => p.endsWith(".cue") && store.bool(p, false))
    .map((p) => p.slice("ch.".length, -".cue".length));
}

/**
 * Meter values in dB for anything that carries a meter: a strip by its id, a
 * monitor bus as `monitor.<n>`, the cue bus, or the oscillator. `at` is the
 * moment the synthetic signal is read at, so two readings can be taken of the
 * same instant.
 */
export function meterLevels(store: DeviceStore, id: string, channels: number, at = Date.now()): number[] {
  if (id.startsWith(PAIR_METER)) {
    const members = id.slice(PAIR_METER.length).split("+");
    return Array.from({ length: channels }, (_, c) => {
      const member = members[c];
      return member === undefined ? SILENT : (meterLevels(store, member, 1, at)[0] ?? SILENT);
    });
  }
  if (source) return source(id, channels);
  if (id === OSC_METER) return Array.from({ length: channels }, () => oscillatorLevel(store, at));
  if (id === CUE_METER) {
    const lanes = Array.from({ length: channels }, () => SILENT);
    for (const strip of cuedStrips(store)) {
      const cued = meterLevels(store, strip, channels, at);
      for (let c = 0; c < channels; c++) lanes[c] = sumDb(lanes[c] ?? SILENT, cued[c] ?? SILENT);
    }
    return lanes;
  }
  if (id.startsWith(INPUT_METER)) return preFader(store, id.slice(INPUT_METER.length), channels, at);
  const base = id.startsWith("monitor.") ? id : `ch.${id}`;
  const on = store.bool(`${base}.on`, true);
  if (!on) return Array.from({ length: channels }, () => SILENT);
  const fader = store.num(`${base}.level`, 0);
  const levels = preFader(store, id, channels, at).map((db) => db + fader);
  // A lane the oscillator is assigned to carries it on top of the mixer's own.
  const osc = oscillatorLevel(store, at);
  for (const t of OSC_TARGETS) {
    if (t.meter !== id || !store.bool(`osc.assign.${t.id}`, t.shipped)) continue;
    for (let c = 0; c < levels.length; c++) {
      if (t.lane === null || t.lane === c) levels[c] = sumDb(levels[c] ?? SILENT, osc);
    }
  }
  return levels;
}


/** What a screen's reduction bar is reading, and from which strip's level. */
export interface GrSpec {
  kind: "gate" | "comp" | "ducker" | "ssmcs" | "over" | "held";
  /** The block's own values live under this path. */
  base: string;
  /** The meter whose level the detector hears; a pair meter's louder side. */
  level: string;
  /**
   * The meter each OUT lane's own detector hears, where the two channels of a pair
   * are held down apart. Without it every lane is held down by `level`.
   */
  lanes?: string[];
  /** The bar lies across its block rather than down it. */
  row?: boolean;
  /** What the block adds back after it, which the OUT meter reads higher by. */
  makeup: number;
  /** For `over`: where the threshold the level is held down over is kept, and its value when unset. */
  threshold?: { path: string; fallback: number };
  /** For `over`: where the switch that turns the block on is kept, and its value when unset. Without it the block is on. */
  on?: { path: string; fallback: boolean };
}

/** The level a detector hears on meter `id`: the louder side of a pair meter, the one level of anything else. */
export function detectorLevel(store: DeviceStore, id: string, at = Date.now()): number {
  return Math.max(...meterLevels(store, id, id.startsWith(PAIR_METER) ? 2 : 1, at));
}


/**
 * How many dB the block named by `spec` is holding its channel down, from the
 * block's own values and the level going into it. A block that is off takes
 * nothing off.
 */
export function blockReduction(store: DeviceStore, spec: GrSpec, at = Date.now()): number {
  const level = detectorLevel(store, spec.level, at);
  const b = spec.base;
  if (spec.kind === "gate") {
    if (!store.bool(`${b}.gate.on`, false)) return 0;
    return gateReductionDb(level, store.num(`${b}.gate.threshold`, -50), store.num(`${b}.gate.range`, -56));
  }
  if (spec.kind === "comp") {
    if (!store.bool(`${b}.comp.on`, false)) return 0;
    return compReductionDb(
      level,
      store.num(`${b}.comp.threshold`, -18),
      store.num(`${b}.comp.ratio`, 3),
      COMP_KNEE_WIDTH[store.str(`${b}.comp.knee`, "Medium")] ?? 16,
      spec.makeup,
    );
  }
  if (spec.kind === "ducker") {
    if (!store.bool(`${b}.ducker.on`, false)) return 0;
    return duckerReductionDb(level, store.num(`${b}.ducker.threshold`, -40), store.num(`${b}.ducker.range`, -24));
  }
  // SSMCS holds the channel down by how far it is over the corner Comp Drive sets.
  if (spec.kind === "ssmcs") {
    if (!blockOn(store, spec)) return 0;
    const over = level - ssmcsCorner(store.num(`${b}.ssmcs.compDrive`, SSMCS_DEFAULTS.compDrive));
    return Math.min(-SSMCS_CORNER_FLOOR_DB, Math.max(0, over));
  }
  // An insert's compressor holds the channel down by how far it is over its threshold.
  if (spec.kind === "over") {
    if (!blockOn(store, spec) || !spec.threshold) return 0;
    return Math.min(OVER_REDUCTION_MAX_DB, Math.max(0, level - store.num(spec.threshold.path, spec.threshold.fallback)));
  }
  // A block that carries its reading rather than working one out from its own
  // values hands it over on the node itself.
  return 0;
}

/** Whether the block named by `spec` is switched on. */
export function blockOn(store: DeviceStore, spec: GrSpec): boolean {
  if (spec.kind === "gate") return store.bool(`${spec.base}.gate.on`, false);
  if (spec.kind === "comp") return store.bool(`${spec.base}.comp.on`, false);
  if (spec.kind === "ducker") return store.bool(`${spec.base}.ducker.on`, false);
  if (spec.kind === "ssmcs") return store.bool(`${spec.base}.comp.on`, false) && store.bool(`${spec.base}.ssmcs.on`, SSMCS_DEFAULTS.on);
  if (spec.kind === "over") return spec.on ? store.bool(spec.on.path, spec.on.fallback) : true;
  return true;
}

/**
 * How many dB the OUT meter of a block reads below its IN: what the block takes
 * off, less what it adds back after it. A block that is off adds nothing back.
 */
export function blockNetDb(store: DeviceStore, spec: GrSpec, at = Date.now()): number {
  return blockReduction(store, spec, at) - (blockOn(store, spec) ? spec.makeup : 0);
}

/** `blockNetDb` for each OUT lane: one figure for every lane, or one per lane where `spec.lanes` holds them apart. */
export function laneNetDb(store: DeviceStore, spec: GrSpec, at = Date.now()): number[] {
  return spec.lanes ? spec.lanes.map((level) => blockNetDb(store, { ...spec, level }, at)) : [blockNetDb(store, spec, at)];
}

/** How a block's lamps stand. */
export type LampState = "off" | "open" | "holding" | "shut";

/**
 * How the lamps of the block named by `spec` stand: GATE opens over its threshold
 * and shuts a range under it, DUCKER opens under its threshold on its key and
 * shuts a range over it. A block that is off lights none.
 */
export function blockLampState(store: DeviceStore, spec: GrSpec, at = Date.now()): LampState {
  const level = detectorLevel(store, spec.level, at);
  const b = spec.base;
  if (spec.kind === "gate") {
    if (!store.bool(`${b}.gate.on`, false)) return "off";
    const threshold = store.num(`${b}.gate.threshold`, GATE_DEFAULTS.threshold);
    const range = store.num(`${b}.gate.range`, GATE_DEFAULTS.range);
    return level > threshold ? "open" : level <= threshold + range ? "shut" : "holding";
  }
  if (spec.kind === "ducker") {
    if (!store.bool(`${b}.ducker.on`, false)) return "off";
    const threshold = store.num(`${b}.ducker.threshold`, -40);
    const range = store.num(`${b}.ducker.range`, -24);
    return level <= threshold ? "open" : level >= threshold - range ? "shut" : "holding";
  }
  return "off";
}

/** Light a block's three lamps, shut, holding and open from the left, as `state` stands. */
export function showBlockLamps(node: HTMLElement, state: LampState): void {
  const [shut, holding, open] = [...node.children];
  shut?.classList.toggle("is-shut", state === "shut");
  holding?.classList.toggle("is-holding", state === "holding");
  open?.classList.toggle("is-on", state === "open");
}

/** Keep `node`, a block's lamps, lit as the block named by `spec` stands: now, and as the ticker runs. */
export function markBlockLamps(node: HTMLElement, store: DeviceStore, spec: GrSpec): void {
  markReduction(node, spec);
  node.dataset["blockLamps"] = "";
  showBlockLamps(node, blockLampState(store, spec));
}

/** Keep `node`, a bar of a strip's level filling left to right on `levelBarShare`, lit: now, and as the ticker runs. */
export function markLevelBar(node: HTMLElement, store: DeviceStore, source: string): void {
  node.dataset["levelBar"] = source;
  showLevelBar(node, store);
}

function showLevelBar(node: HTMLElement, store: DeviceStore): void {
  const level = meterLevels(store, node.dataset["levelBar"] ?? "", 1)[0] ?? SILENT;
  const lit = node.querySelector<HTMLElement>("i");
  if (lit) lit.style.width = `${levelBarShare(level) * 100}%`;
}

/** Put a reduction on a node, so the ticker can work it out again. */
export function markReduction(node: HTMLElement, spec: GrSpec): void {
  node.dataset["grKind"] = spec.kind;
  node.dataset["grBase"] = spec.base;
  node.dataset["grLevel"] = spec.level;
  if (spec.lanes) node.dataset["grLanes"] = spec.lanes.join(" ");
  node.dataset["grMakeup"] = String(spec.makeup);
  if (spec.row) node.dataset["grRow"] = "1";
  if (spec.threshold) node.dataset["grThreshold"] = `${spec.threshold.fallback} ${spec.threshold.path}`;
  if (spec.on) node.dataset["grOn"] = `${spec.on.fallback ? 1 : 0} ${spec.on.path}`;
}

/** Read a reduction back off a node the ticker has found. */
export function readGrSpec(node: HTMLElement): GrSpec | null {
  const kind = node.dataset["grKind"];
  if (kind !== "gate" && kind !== "comp" && kind !== "ducker" && kind !== "ssmcs" && kind !== "over" && kind !== "held") return null;
  const threshold = node.dataset["grThreshold"]?.split(" ");
  const on = node.dataset["grOn"]?.split(" ");
  return {
    kind,
    base: node.dataset["grBase"] ?? "",
    level: node.dataset["grLevel"] ?? "",
    ...(node.dataset["grLanes"] ? { lanes: node.dataset["grLanes"].split(" ") } : {}),
    makeup: Number(node.dataset["grMakeup"] ?? 0),
    ...(node.dataset["grRow"] ? { row: true } : {}),
    ...(threshold ? { threshold: { fallback: Number(threshold[0]), path: threshold[1] ?? "" } } : {}),
    ...(on ? { on: { fallback: on[0] === "1", path: on[1] ?? "" } } : {}),
  };
}

/**
 * Keep the drawn meters moving without rebuilding the screen. A full repaint on
 * a timer would drop the keyboard focus and cancel a drag in progress, so the
 * ticker only writes how much of each bar is lit into meters that carry a source
 * tag, and whether each Clip Safe switch marked by `markClipSafe` is holding the
 * gain down.
 */
export function startMeterTicker(store: DeviceStore, root: HTMLElement, intervalMs = 100): () => void {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const showClipSafes = (): void => {
    for (const node of root.querySelectorAll<HTMLElement>("[data-clip-safe]")) {
      showClipSafe(node, clipSafe(store, Number(node.dataset["clipSafe"])).engaged);
    }
  };
  const id = window.setInterval(() => {
    // Clip Safe's colour is a state rather than motion, so it keeps up with reduced motion as well.
    if (reduceMotion) return showClipSafes();
    // The reduction is worked out first: the OUT meter's offset is what the bar
    // beside it reads, and the pass below reads that offset.
    for (const node of root.querySelectorAll<HTMLElement>("[data-gr-kind]")) {
      const spec = readGrSpec(node);
      if (!spec) continue;
      if (node.dataset["blockLamps"] !== undefined) {
        showBlockLamps(node, blockLampState(store, spec));
        continue;
      }
      const db = blockReduction(store, spec);
      const lit = node.querySelector<HTMLElement>("i");
      if (lit) lit.style[spec.row ? "width" : "height"] = `${grBarShare(db) * 100}%`;
      if (node.dataset["meterSource"] !== undefined) setMeterOffset(node, laneNetDb(store, spec));
    }
    for (const node of root.querySelectorAll<HTMLElement>("[data-meter-source]")) {
      const stripId = node.dataset["meterSource"];
      if (!stripId) continue;
      const bars = node.querySelectorAll<HTMLElement>(".meter-bar");
      const clips = node.querySelectorAll<HTMLElement>(".meter-clip");
      const offsets = (node.dataset["meterOffset"] ?? "0").split(" ").map(Number);
      const lane = node.dataset["meterLane"];
      const read = lane === undefined ? meterLevels(store, stripId, bars.length) : [meterLevels(store, stripId, 2)[Number(lane)] ?? SILENT];
      const levels = read.map((db, i) => db - (offsets[i] ?? offsets[0] ?? 0));
      bars.forEach((bar, i) => {
        const share = levelBarShare(levels[i] ?? SILENT);
        bar.style.setProperty("--unlit", `${(1 - share) * 100}%`);
        clips[i]?.classList.toggle("is-on", share >= 1);
      });
    }
    for (const node of root.querySelectorAll<HTMLElement>("[data-level-bar]")) showLevelBar(node, store);
    for (const node of root.querySelectorAll<HTMLElement>("[data-lamp-source]")) {
      const stripId = node.dataset["lampSource"];
      if (!stripId) continue;
      const { signal, clip } = lampState(meterLevels(store, stripId, Number(node.dataset["lampChannels"] ?? "1")));
      node.querySelector(".dot-signal")?.classList.toggle("is-on", signal);
      node.querySelector(".dot-clip")?.classList.toggle("is-on", clip);
    }
    // After the meters, so a meter that reads a clip shows it before Clip Safe holds the signal down.
    showClipSafes();
  }, intervalMs);
  return () => window.clearInterval(id);
}
