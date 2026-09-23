// Which strips the HOME banks are showing and which one is selected. Kept in
// the store rather than in a screen, because the toolbar's bank button, the
// swipe gesture and every channel screen all read the same selection.

import type { AppContext } from "../app/context";
import type { ParamPath } from "../device/path";
import type { Strip, StripKind, StripSide } from "../model/types";
import { allStrips, bankCount, bankStrips, findStrip } from "../model/types";
import { CH_COLOR_OFF } from "../model/units";

/**
 * The colour a strip is carrying: the one CH SETTING put on it, or the one it
 * left the factory with. A strip set to no colour paints nothing, so the rail
 * and the mark beside its name come back as an empty string.
 */
export function stripColor(ctx: AppContext, strip: Strip): string {
  const chosen = ctx.store.str(`ch.${strip.id}.color`, strip.color);
  return chosen === CH_COLOR_OFF ? "" : chosen;
}

export function bankSide(ctx: AppContext): StripSide {
  return ctx.store.str("ui.bankSide", "input") === "output" ? "output" : "input";
}

export function sideStrips(ctx: AppContext, side: StripSide = bankSide(ctx)): Strip[] {
  return side === "input" ? ctx.model.inputs : ctx.model.outputs;
}

export function currentBank(ctx: AppContext): number {
  const max = bankCount(sideStrips(ctx)) - 1;
  return Math.min(Math.max(0, ctx.store.num("ui.bank", 0)), max);
}

export function currentBankStrips(ctx: AppContext): Strip[] {
  return bankStrips(sideStrips(ctx), currentBank(ctx));
}

export function bankTotal(ctx: AppContext, side: StripSide = bankSide(ctx)): number {
  return bankCount(sideStrips(ctx, side));
}

export function setBank(ctx: AppContext, bank: number): void {
  const max = bankTotal(ctx) - 1;
  void ctx.store.set("ui.bank", Math.min(Math.max(0, bank), max));
}

/**
 * Step banks. Swiping left/right in the main area moves within one side only —
 * the guide is explicit that a swipe cannot cross from input to output.
 */
export function stepBank(ctx: AppContext, delta: number): void {
  const total = bankTotal(ctx);
  setBank(ctx, (currentBank(ctx) + delta + total) % total);
}

/** How each kind of strip is named where a bank is listed by its contents. */
const GROUP_STYLE: Record<StripKind, { name: string; prefix?: string; span?: string }> = {
  monoIn: { name: "CH", prefix: "CH ", span: " - " },
  stIn: { name: "CH", prefix: "CH ", span: " - " },
  fx: { name: "FX", prefix: "FX ", span: " - " },
  mix: { name: "MIX" },
  stereo: { name: "ST" },
  streaming: { name: "STREAMING" },
};

/** [1] from "CH 1", [5, 6] from "CH 5/6". */
function labelNumbers(label: string): number[] {
  return [...label.matchAll(/\d+/g)].map((m) => Number(m[0]));
}

/** The runs of same-name strips in a bank, each covering the range it spans. */
function bankGroups(strips: readonly Strip[]): string[] {
  const groups: { kind: StripKind; numbers: number[] }[] = [];
  for (const strip of strips) {
    const open = groups.at(-1);
    if (open && GROUP_STYLE[open.kind].name === GROUP_STYLE[strip.kind].name) {
      open.numbers.push(...labelNumbers(strip.label));
    } else {
      groups.push({ kind: strip.kind, numbers: labelNumbers(strip.label) });
    }
  }
  return groups.map(({ kind, numbers }) => {
    const { name, prefix = name, span } = GROUP_STYLE[kind];
    if (span === undefined || numbers.length === 0) return name;
    return `${prefix}${Math.min(...numbers)}${span}${Math.max(...numbers)}`;
  });
}

/**
 * What a bank is called in the bank list. The groups run together on one line;
 * from three groups on, the last one carries onto a second line.
 */
export function bankName(strips: readonly Strip[]): string {
  const groups = bankGroups(strips);
  if (groups.length < 3) return groups.join(", ");
  return `${groups.slice(0, -1).join(", ")}\n${groups.at(-1) ?? ""}`;
}

export function setSide(ctx: AppContext, side: StripSide): void {
  if (bankSide(ctx) === side) return;
  void ctx.store.set("ui.bankSide", side);
  void ctx.store.set("ui.bank", 0);
}

export function selectedStripId(ctx: AppContext): string {
  return ctx.store.str("ui.selectedStrip", ctx.model.inputs[0]?.id ?? "");
}

export function selectedStrip(ctx: AppContext): Strip | undefined {
  return findStrip(ctx.model, selectedStripId(ctx));
}

export function selectStrip(ctx: AppContext, id: string): void {
  void ctx.store.set("ui.selectedStrip", id);
}

/** A mono input is one channel; every other strip is two, L and R (or its two channel numbers). */
export function stripLanes(strip: Strip): 1 | 2 {
  return strip.kind === "monoIn" ? 1 : 2;
}

/** The channel of a two-channel strip its dedicated screens show: 0 for L or the lower number, 1 for R. */
export function stripLane(ctx: AppContext, strip: Strip): 0 | 1 {
  return stripLanes(strip) === 2 && ctx.store.num(`ui.lane.${strip.id}`, 0) === 1 ? 1 : 0;
}

export function setStripLane(ctx: AppContext, strip: Strip, lane: 0 | 1): void {
  void ctx.store.set(`ui.lane.${strip.id}`, lane);
}

/**
 * The polarity invert a strip's screens read and write. A stereo input inverts
 * its two sides separately and its screens carry one side at a time, so the
 * path is the side in view; every other channel has the one invert.
 */
export function phasePath(ctx: AppContext, strip: Strip): ParamPath {
  const base = `ch.${strip.id}`;
  return strip.kind === "stIn" ? `${base}.phase.${stripLane(ctx, strip) === 0 ? "l" : "r"}` : `${base}.phase`;
}

/**
 * Move the dedicated screens to the neighbouring channel, as the "‹ ›" arrows do:
 * through every strip in device order, a two-channel strip one channel at a
 * time. The strip it lands on becomes the selected one.
 */
export function stepChannel(ctx: AppContext, delta: number, from: Strip): Strip {
  const stops = allStrips(ctx.model).flatMap((s): [Strip, 0 | 1][] => (stripLanes(s) === 2 ? [[s, 0], [s, 1]] : [[s, 0]]));
  const at = stops.findIndex(([s, lane]) => s.id === from.id && lane === stripLane(ctx, from));
  const [strip, lane] = stops[(Math.max(0, at) + delta + stops.length) % stops.length] ?? [from, 0];
  selectStrip(ctx, strip.id);
  if (stripLanes(strip) === 2) setStripLane(ctx, strip, lane);
  return strip;
}

/**
 * The first line of a dedicated screen's name box: the channel in view. The
 * narrow box carries ST and STR for the two bus names too long for it.
 */
export function channelLabel(strip: Strip, lane: 0 | 1, narrow: boolean): string {
  const side = lane === 0 ? "L" : "R";
  switch (strip.kind) {
    case "monoIn":
      return strip.label;
    case "stIn":
      return `CH ${strip.channels[lane] ?? ""}`;
    case "fx":
      return `FX ${strip.id.replace(/\D/g, "")} ${side}`;
    case "stereo":
      return `${narrow ? "ST" : strip.label} ${side}`;
    case "streaming":
      return `${narrow ? "STR" : strip.label} ${side}`;
    case "mix":
      return `${strip.label} ${side}`;
  }
}

export function sendsTarget(ctx: AppContext): string {
  return ctx.store.str("ui.sendsTarget", "ST");
}

/** The strip each Sends destination names. */
const SENDS_DESTINATIONS: Record<string, string> = {
  ST: "bus.stereo",
  MIX1: "bus.mix1",
  MIX2: "bus.mix2",
  FX1: "fx1",
  FX2: "fx2",
};

/**
 * The destination in view, named as the [Sends] tab names it: the stereo bus
 * short (p047-1) and a numbered bus with the space (p157-1).
 */
const SENDS_TAB_LABELS: Record<string, string> = {
  ST: "ST",
  MIX1: "MIX 1",
  MIX2: "MIX 2",
  FX1: "FX 1",
  FX2: "FX 2",
};

export function sendsTargetLabel(ctx: AppContext): string {
  const target = sendsTarget(ctx);
  return SENDS_TAB_LABELS[target] ?? target;
}

/** The bus the [Sends] tab is showing. */
export function sendsDestination(ctx: AppContext): Strip | undefined {
  const id = SENDS_DESTINATIONS[sendsTarget(ctx)];
  return ctx.model.inputs.concat(ctx.model.outputs).find((s) => s.id === id);
}

export { sendsTo } from "../model/types";
