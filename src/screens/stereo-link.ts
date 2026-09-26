// Stereo link (user guide, "Channel settings screen > [Signal Type]").
//
// Signal Type belongs to a pair of adjacent mono channels rather than to one
// channel: CH 1 with CH 2, CH 3 with CH 4. Set to STEREO the pair carries one
// stereo signal, and the screens draw the link between them.

import type { AppContext } from "../app/context";
import type { ParamPath, ParamValue } from "../device/path";
import type { DeviceStore, WriteRule } from "../device/store";
import { NO_EFFECT } from "../model/effects";
import type { Strip, UnitModel } from "../model/types";
import { findStrip } from "../model/types";

/** What these helpers need of a screen's context: the values and the unit's shape. */
type PairCtx = Pick<AppContext, "store" | "model">;

export const SIGNAL_TYPES = ["MONO x 2", "STEREO"] as const;

/** How a linked pair is positioned: one PAN per channel, or the pair's balance. */
export const PAN_BAL = ["PAN", "BAL"] as const;

/** The channel a mono strip pairs with: an odd one with the next, an even one with the previous. */
export function linkPartner(ctx: PairCtx, strip: Strip): Strip | undefined {
  if (strip.kind !== "monoIn") return undefined;
  const n = strip.channels[0];
  if (n === undefined) return undefined;
  const partner = n % 2 === 1 ? n + 1 : n - 1;
  return ctx.model.inputs.find((s) => s.kind === "monoIn" && s.channels[0] === partner);
}

export function signalType(ctx: PairCtx, strip: Strip): string {
  return ctx.store.str(`ch.${strip.id}.signalType`, "MONO x 2");
}

/** Whether this channel is running as one half of a stereo pair. */
export function isStereoLinked(ctx: PairCtx, strip: Strip): boolean {
  return signalType(ctx, strip) === "STEREO" && linkPartner(ctx, strip) !== undefined;
}

/** The two channels of the stereo pair this channel is running in, lower-numbered first, or undefined off a pair. */
export function linkedPair(ctx: PairCtx, strip: Strip): [Strip, Strip] | undefined {
  const partner = isStereoLinked(ctx, strip) ? linkPartner(ctx, strip) : undefined;
  if (!partner) return undefined;
  return (partner.channels[0] ?? 0) < (strip.channels[0] ?? 0) ? [partner, strip] : [strip, partner];
}

/**
 * What a linked pair does not hold one of. Four kinds of name sit here: the
 * pair's own flags, which both channels are written directly; the head amp,
 * which each member keeps its own of; the values a pair already shares by
 * being read from one channel (`balancePath`, `insertBase`); and the position,
 * which every transition places. Anything not named is shared.
 */
const PAIR_OWN = [
  "signalType",
  "panBal",
  "gain",
  "clipSafe",
  "phase",
  "phantom",
  "hiZ",
  "source",
  "name",
  "color",
  "cue",
  "pan",
  "balance",
  "insFx",
];

/** Whether the value under `rest` is one a linked pair holds together. */
export function pairSharesKey(rest: string, bal: boolean): boolean {
  const head = rest.split(".")[0] ?? "";
  if (PAIR_OWN.includes(head)) return false;
  // A send's level, tap and switch go with the pair whichever way it is
  // placed; the send's own position goes with it on the pair's balance alone.
  if (head === "send") return bal || !rest.endsWith(".balance");
  return true;
}

/** Where a linked pair in PAN mode puts its two channels. */
const STEREO_PAN = 63;

/** Every path a strip is positioned by: its own place and each of its sends'. */
function panPaths(ctx: PairCtx, strip: Strip): ParamPath[] {
  const base = `ch.${strip.id}`;
  return [
    `${base}.pan`,
    `${base}.balance`,
    ...ctx.store.pathsUnder(`${base}.send`).filter((p) => p.endsWith(".balance")),
  ];
}

/** The pair's two channels, lower number first. */
function pairMembers(ctx: PairCtx, strip: Strip): [Strip, Strip] | undefined {
  const partner = linkPartner(ctx, strip);
  if (!partner) return undefined;
  return (strip.channels[0] ?? 0) < (partner.channels[0] ?? 0) ? [strip, partner] : [partner, strip];
}

/**
 * Place both channels of the pair: a pair on two pans takes the ends, one on
 * its balance takes the centre, and so does an unlinked pair.
 */
function placePair(ctx: PairCtx, strip: Strip): void {
  const members = pairMembers(ctx, strip);
  if (!members) return;
  const spread = isStereoLinked(ctx, strip) && !usesBalance(ctx, strip);
  members.forEach((s, i) => {
    const place = spread ? (i === 0 ? -STEREO_PAN : STEREO_PAN) : 0;
    for (const p of panPaths(ctx, s)) void ctx.store.set(p, place);
  });
}

/** Put the pair on one set of values, the lower-numbered channel's. */
function collapsePair(ctx: PairCtx, strip: Strip): void {
  const members = pairMembers(ctx, strip);
  if (!members) return;
  const [primary, secondary] = members;
  const bal = usesBalance(ctx, primary);
  const prefix = `ch.${primary.id}.`;
  for (const p of ctx.store.pathsUnder(`ch.${primary.id}`)) {
    const rest = p.slice(prefix.length);
    if (!pairSharesKey(rest, bal)) continue;
    void ctx.store.set(`ch.${secondary.id}.${rest}`, ctx.store.get<ParamValue>(p, 0));
  }
}

/**
 * The writes an edit to one channel of a linked pair carries onto the other.
 * It runs on edits alone, so a unit doing its own mirroring is not answered
 * with a second write.
 */
export function pairWriteRule(store: DeviceStore, model: UnitModel): WriteRule {
  const ctx: PairCtx = { store, model };
  return (path, value) => {
    const cut = path.indexOf(".", 3);
    if (!path.startsWith("ch.") || cut < 0) return [];
    const strip = findStrip(model, path.slice(3, cut));
    if (!strip || strip.kind !== "monoIn" || !isStereoLinked(ctx, strip)) return [];
    const partner = linkPartner(ctx, strip);
    const rest = path.slice(cut + 1);
    if (!partner || !pairSharesKey(rest, usesBalance(ctx, strip))) return [];
    return [[`ch.${partner.id}.${rest}`, value]];
  };
}

/**
 * One setting over both channels of the pair, so it is written to both. The
 * insert goes with it: the unit takes the effect off both channels whichever way
 * the Signal Type moves. The pair comes up on its balance, both channels are
 * placed, and linking puts the pair on the lower-numbered channel's values;
 * unlinking puts nothing back.
 */
export function setSignalType(ctx: PairCtx, strip: Strip, value: string): void {
  if (signalType(ctx, strip) === value) return;
  writePair(ctx, strip, "signalType", value);
  for (const s of [strip, linkPartner(ctx, strip)]) {
    if (!s) continue;
    void ctx.store.set(`ch.${s.id}.insFx.effect`, NO_EFFECT);
    void ctx.store.set(`ch.${s.id}.insFx.on`, false);
  }
  writePair(ctx, strip, "panBal", value === "STEREO" ? "BAL" : "PAN");
  placePair(ctx, strip);
  if (value === "STEREO") collapsePair(ctx, strip);
}

/** Whether the pair is positioned by its L/R balance rather than by two pans. */
export function usesBalance(ctx: PairCtx, strip: Strip): boolean {
  return isStereoLinked(ctx, strip) && ctx.store.str(`ch.${strip.id}.panBal`, "PAN") === "BAL";
}

export function setPanBal(ctx: PairCtx, strip: Strip, value: string): void {
  if (ctx.store.str(`ch.${strip.id}.panBal`, "PAN") === value) return;
  writePair(ctx, strip, "panBal", value);
  placePair(ctx, strip);
}

/**
 * Where the balance a strip is placed by is kept. A linked pair is placed by one
 * balance, held on the lower-numbered channel, so both halves show and turn the
 * same value; every other strip has its own.
 */
export function balancePath(ctx: PairCtx, strip: Strip): string {
  const partner = usesBalance(ctx, strip) ? linkPartner(ctx, strip) : undefined;
  const first = partner && (partner.channels[0] ?? 0) < (strip.channels[0] ?? 0) ? partner : strip;
  return `ch.${first.id}.balance`;
}

/**
 * Where the position a strip is placed by is kept, and what the screens caption
 * it. A mono channel has its own PAN unless the pair it belongs to is set to be
 * placed by the pair's balance; everything else is placed by a balance.
 */
export function stripPosition(ctx: PairCtx, strip: Strip): { path: string; caption: string } {
  if (strip.kind === "monoIn" && !usesBalance(ctx, strip)) return { path: `ch.${strip.id}.pan`, caption: "PAN" };
  return { path: balancePath(ctx, strip), caption: "BALANCE" };
}

function writePair(ctx: PairCtx, strip: Strip, key: string, value: string): void {
  for (const s of [strip, linkPartner(ctx, strip)]) {
    if (s) void ctx.store.set(`ch.${s.id}.${key}`, value);
  }
}
