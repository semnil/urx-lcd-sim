// Meter levels.
//
// The simulator carries no audio, so with the SimTransport attached the meters
// read the synthetic signal `signal-flow.ts` carries through the mixer: each
// input source's own signal, taken through the channels, the sends, the FX
// returns and the buses the way the unit routes it, and read where the unit's
// own meter stands. A unit that passes its own readings in feeds the same
// accessor instead — see setMeterSource and setClipSafeSource, which the
// unit's levels are handed to as it is mounted (src/app/unit.ts).

import type { AppContext } from "../app/context";
import type { DeviceStore } from "../device/store";
import { duckerShare, gateReductionDb, grBarShare, levelBarShare } from "../model/dynamics";
import { CLIP_LAMP_DB, DETECTOR_OFFSET, type DetectorKind, METER_FALL_DB_PER_S, OVER_DB, SIGNAL_LAMP_DB } from "../model/levels";
import { SILENT_DB, mix, mostlyTone } from "../model/signal";
import type { Strip } from "../model/types";
import { GATE_DEFAULTS } from "../model/defaults";
import { CLIP_DB, type GrSpec, METER_TICK_MS, type Tap, clipSafe, flowCtx, flowLanes, flowLevels, heardOn, pairMembers, readingMoment, reductionAt, tapId } from "./signal-flow";

export { CUE_METER, type GrSpec, clipSafe, oscillatorLevel, pairMeterId, tapId } from "./signal-flow";

/** A meter reading nothing. */
const SILENT = SILENT_DB;

/**
 * What the pair of lamps at the top of a strip's indicator block reads: the
 * left one lights from about -40 dBFS up and stays lit while the right one
 * lights, from 3 dB under a clip up.
 */
export function lampState(levels: readonly number[]): { signal: boolean; clip: boolean } {
  const peak = Math.max(...levels);
  return { signal: peak >= SIGNAL_LAMP_DB, clip: peak >= CLIP_LAMP_DB };
}

export type MeterSource = (stripId: string, channels: number) => number[];

let source: MeterSource | null = null;

/** Point the meters at a real device's metering. */
export function setMeterSource(next: MeterSource | null): void {
  source = next;
}

/** Whether the Clip Safe of connector `n` holds its gain down, as a unit reports it. */
export type ClipSafeSource = (connector: number) => boolean;

let clipSafeSource: ClipSafeSource | null = null;

/** Read Clip Safe from a real device; null goes back to the simulated head amp. */
export function setClipSafeSource(next: ClipSafeSource | null): void {
  clipSafeSource = next;
}

/** Whether the Clip Safe of connector `n` is holding its gain down. */
function clipSafeEngaged(store: DeviceStore, n: number): boolean {
  return clipSafeSource ? clipSafeSource(n) : clipSafe(store, n).engaged;
}

/** The meter id of `stripId`'s level as it arrives, before anything on the strip. */
export const inputMeterId = (stripId: string): string => tapId(stripId, "input");

/**
 * Where a strip's meter on HOME reads: a channel after its EQ and insert and
 * before its [ON] and fader, a MIX or STEREO bus after its EQ and before its
 * [ON], fader and insert, an FX channel off its effect, STREAMING before its
 * DELAY.
 */
export function homeMeterTap(strip: Strip): Tap {
  if (strip.kind === "fx") return "effect";
  if (strip.kind === "streaming") return "input";
  return "preFader";
}

/**
 * Where the lamps at the top of a strip's indicator block read: a channel what it
 * takes in, an FX channel its effect, a bus its sum.
 */
export function lampTap(strip: Strip): Tap {
  if (strip.kind === "fx") return "effect";
  if (strip.kind === "mix" || strip.kind === "stereo") return "sum";
  return "input";
}

/** Meter values in dB for one strip at `tap` as a screen draws them: one entry for mono, two for stereo. */
export function simulatedLevel(ctx: AppContext, strip: Strip | undefined, stereo: boolean, tap: Tap = "post"): number[] {
  const channels = stereo ? 2 : 1;
  if (!strip) return Array.from({ length: channels }, () => SILENT);
  return drawnLevels(ctx.store, tapId(strip.id, tap), channels);
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
  showClipSafe(node, clipSafeEngaged(store, n));
  return node;
}

/**
 * Meter values in dB for anything that carries a meter: a strip's point by its
 * tap id (a bare strip id reads what the strip puts out), a monitor bus as
 * `monitor.<n>`, the cue bus, the oscillator, the card's playback, or two of
 * them side by side. `at` is the moment the synthetic signal is read at, so two
 * readings can be taken of the same instant. A device's reading that is not a
 * number reads as nothing, and one over 0 dB, +Infinity included, as a clip,
 * OVER_DB.
 */
export function meterLevels(store: DeviceStore, id: string, channels: number, at = readingMoment()): number[] {
  const members = pairMembers(id);
  if (members) {
    return Array.from({ length: channels }, (_, c) => {
      const member = members[c];
      return member === undefined ? SILENT : (meterLevels(store, member, 1, at)[0] ?? SILENT);
    });
  }
  if (source) return source(id, channels).map((db) => (Number.isNaN(db) ? SILENT : db > CLIP_DB ? OVER_DB : db));
  const levels = flowLevels(flowCtx(store), id, at);
  return Array.from({ length: channels }, (_, c) => levels[c] ?? SILENT);
}

/** What each meter a ticker keeps moving last showed, and when, per store. */
const shown = new WeakMap<DeviceStore, Map<string, { db: number; at: number }>>();

/**
 * Meter values as a bar shows them at `at`: rising at once to what the meter
 * reads, and falling no faster than METER_FALL_DB_PER_S.
 */
export function shownLevels(store: DeviceStore, id: string, channels: number, at = readingMoment()): number[] {
  let seen = shown.get(store);
  if (!seen) shown.set(store, (seen = new Map()));
  return meterLevels(store, id, channels, at).map((db, lane) => {
    const key = `${id}#${lane}`;
    const was = seen.get(key);
    const fell = was ? was.db - (METER_FALL_DB_PER_S * Math.max(0, at - was.at)) / 1000 : SILENT;
    // A held level that is not a finite number holds nothing.
    const fallen = Number.isFinite(fell) ? fell : SILENT;
    const now = Math.max(db, fallen, SILENT);
    seen.set(key, { db: now, at });
    return now;
  });
}

/** Whether the ticker moves the meters: under reduced motion they stand as drawn. */
function metersMove(): boolean {
  return !(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
}

/**
 * Meter values as a screen draws them when it is built: where the ticker has the
 * bar at that moment, so a bar falling when the screen is drawn again goes on
 * falling from where it stood. While the meters stand still under reduced
 * motion, what the meter reads.
 */
export function drawnLevels(store: DeviceStore, id: string, channels: number, at = readingMoment()): number[] {
  return metersMove() ? shownLevels(store, id, channels, at) : meterLevels(store, id, channels, at);
}

/**
 * The level the detector of the block named by `spec` hears at `at`, on the meter
 * the spec names. A device's meters carry a level for each lane and nothing of
 * what makes it up, so on a device the detector hears the louder lane as read.
 */
function detectorLevel(store: DeviceStore, spec: GrSpec, at = readingMoment()): { heard: number; tone: boolean } {
  if (source) return { heard: Math.max(...meterLevels(store, spec.level, 2, at)), tone: false };
  const lanes = flowLanes(flowCtx(store), spec.level, at);
  return { heard: heardOn(spec, lanes), tone: mostlyTone(mix(...lanes)) };
}

/**
 * How many dB the block named by `spec` is holding its channel down, from the
 * block's own values and the level its detector hears. A block that is off
 * takes nothing off.
 */
export function blockReduction(store: DeviceStore, spec: GrSpec, at = readingMoment()): number {
  const { heard, tone } = detectorLevel(store, spec, at);
  return reductionAt(store, spec, heard, tone);
}

/** How a block's lamps stand. */
export type LampState = "off" | "open" | "holding" | "shut";

/**
 * How the lamps of the block named by `spec` stand: GATE opens over its threshold
 * and shuts once it takes off its whole range; DUCKER stands open while it takes
 * none of its range off, holding while it takes off part of it, and shut once it
 * takes off the whole of it. A block that is off lights none.
 */
export function blockLampState(store: DeviceStore, spec: GrSpec, at = readingMoment()): LampState {
  const { heard: level } = detectorLevel(store, spec, at);
  const b = spec.base;
  if (spec.kind === "gate") {
    if (!store.bool(`${b}.gate.on`, false)) return "off";
    const threshold = store.num(`${b}.gate.threshold`, GATE_DEFAULTS.threshold);
    const range = store.num(`${b}.gate.range`, GATE_DEFAULTS.range);
    if (level > threshold) return "open";
    return gateReductionDb(level, threshold, range) >= -range ? "shut" : "holding";
  }
  if (spec.kind === "ducker") {
    if (!store.bool(`${b}.ducker.on`, false)) return "off";
    const { heard, tone } = detectorLevel(store, spec, at);
    const share = duckerShare(heard, store.num(`${b}.ducker.threshold`, -40), store.num(`${b}.ducker.range`, -24), tone);
    return share <= 0 ? "open" : share >= 1 ? "shut" : "holding";
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

function showLevelBar(node: HTMLElement, store: DeviceStore, at?: number): void {
  const id = node.dataset["levelBar"] ?? "";
  const level = (at === undefined ? drawnLevels(store, id, 1) : shownLevels(store, id, 1, at))[0] ?? SILENT;
  const lit = node.querySelector<HTMLElement>("i");
  if (lit) lit.style.width = `${levelBarShare(level) * 100}%`;
}

/** Put a reduction on a node, so the ticker can work it out again. */
export function markReduction(node: HTMLElement, spec: GrSpec): void {
  node.dataset["grKind"] = spec.kind;
  node.dataset["grBase"] = spec.base;
  node.dataset["grLevel"] = spec.level;
  node.dataset["grMakeup"] = String(spec.makeup);
  if (spec.row) node.dataset["grRow"] = "1";
  if (spec.detector) node.dataset["grDetector"] = spec.detector;
  if (spec.threshold) node.dataset["grThreshold"] = `${spec.threshold.fallback} ${spec.threshold.path}`;
  if (spec.on) node.dataset["grOn"] = `${spec.on.fallback ? 1 : 0} ${spec.on.path}`;
  if (spec.bypass) node.dataset["grBypass"] = spec.bypass;
}

const isDetector = (v: string | undefined): v is DetectorKind => v !== undefined && v in DETECTOR_OFFSET;

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
    makeup: Number(node.dataset["grMakeup"] ?? 0),
    ...(node.dataset["grRow"] ? { row: true } : {}),
    ...(isDetector(node.dataset["grDetector"]) ? { detector: node.dataset["grDetector"] } : {}),
    ...(threshold ? { threshold: { fallback: Number(threshold[0]), path: threshold[1] ?? "" } } : {}),
    ...(on ? { on: { fallback: on[0] === "1", path: on[1] ?? "" } } : {}),
    ...(node.dataset["grBypass"] ? { bypass: node.dataset["grBypass"] } : {}),
  };
}

/**
 * Keep the drawn meters moving without rebuilding the screen. A full repaint on
 * a timer would drop the keyboard focus and cancel a drag in progress, so the
 * ticker only writes how much of each bar is lit into meters that carry a source
 * tag, and whether each Clip Safe switch marked by `markClipSafe` is holding the
 * gain down.
 */
export function startMeterTicker(store: DeviceStore, root: HTMLElement, intervalMs = METER_TICK_MS): () => void {
  const showClipSafes = (): void => {
    for (const node of root.querySelectorAll<HTMLElement>("[data-clip-safe]")) {
      showClipSafe(node, clipSafeEngaged(store, Number(node.dataset["clipSafe"])));
    }
  };
  const id = window.setInterval(() => {
    // Clip Safe's colour is a state rather than motion, so it keeps up with reduced motion as well.
    if (!metersMove()) return showClipSafes();
    const at = Date.now();
    for (const node of root.querySelectorAll<HTMLElement>("[data-gr-kind]")) {
      const spec = readGrSpec(node);
      if (!spec) continue;
      if (node.dataset["blockLamps"] !== undefined) {
        showBlockLamps(node, blockLampState(store, spec));
        continue;
      }
      const db = blockReduction(store, spec, at);
      const lit = node.querySelector<HTMLElement>("i");
      if (lit) lit.style[spec.row ? "width" : "height"] = `${grBarShare(db) * 100}%`;
    }
    for (const node of root.querySelectorAll<HTMLElement>("[data-meter-source]")) {
      const stripId = node.dataset["meterSource"];
      if (!stripId) continue;
      const bars = node.querySelectorAll<HTMLElement>(".meter-bar");
      const clips = node.querySelectorAll<HTMLElement>(".meter-clip");
      const lane = node.dataset["meterLane"];
      const levels = lane === undefined ? shownLevels(store, stripId, bars.length, at) : [shownLevels(store, stripId, 2, at)[Number(lane)] ?? SILENT];
      bars.forEach((bar, i) => {
        const share = levelBarShare(levels[i] ?? SILENT);
        bar.style.setProperty("--unlit", `${(1 - share) * 100}%`);
        clips[i]?.classList.toggle("is-on", (levels[i] ?? SILENT) > CLIP_DB);
      });
    }
    for (const node of root.querySelectorAll<HTMLElement>("[data-level-bar]")) showLevelBar(node, store, at);
    for (const node of root.querySelectorAll<HTMLElement>("[data-lamp-source]")) {
      const stripId = node.dataset["lampSource"];
      if (!stripId) continue;
      const { signal, clip } = lampState(shownLevels(store, stripId, Number(node.dataset["lampChannels"] ?? "1"), at));
      node.querySelector(".dot-signal")?.classList.toggle("is-on", signal);
      node.querySelector(".dot-clip")?.classList.toggle("is-on", clip);
    }
    // After the meters, so a meter that reads a clip shows it before Clip Safe holds the signal down.
    showClipSafes();
  }, intervalMs);
  return () => window.clearInterval(id);
}
