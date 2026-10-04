// MIX bus type and Pan Link (user guide, "Channel settings screen" items
// [BUS Type] and [Pan Link]).
//
// Both belong to a MIX bus and to no other strip, and both decide what the
// sends INTO that bus offer: a FIXED bus takes no send level, no send tap and
// no send placing, and a bus on Pan Link places each send by its source
// channel's own position.

import type { AppContext } from "../app/context";
import type { ParamPath } from "../device/path";
import type { WriteRule } from "../device/store";
import type { Strip } from "../model/types";
import { findStrip } from "../model/types";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { stripPosition } from "./stereo-link";

type StoreCtx = Pick<AppContext, "store">;

/** What a MIX bus does with the level of each send into it. */
export const BUS_TYPES = ["VARI", "FIXED"] as const;

/** What the unit prints for the level of a send into a FIXED bus, on HOME and on the readout bar. */
export const FIXED_LEVEL_TEXT = "Fixed";

export function isMixBus(strip: Strip): boolean {
  return strip.kind === "mix";
}

export function busType(ctx: StoreCtx, strip: Strip): string {
  return ctx.store.str(`ch.${strip.id}.busType`, "VARI");
}

export function panLinkOn(ctx: StoreCtx, strip: Strip): boolean {
  return ctx.store.bool(`ch.${strip.id}.panLink`, false);
}

/**
 * What the sends into `to` cannot be given. A bus on FIXED takes its sends at
 * one level; a bus on Pan Link places them by their source. Taking FIXED
 * switches Pan Link off, so the two do not stand together.
 */
export function sendLocks(ctx: StoreCtx, to: Strip): { busFixed: boolean; panLinked: boolean } {
  if (!isMixBus(to)) return { busFixed: false, panLinked: false };
  const busFixed = busType(ctx, to) === "FIXED";
  return { busFixed, panLinked: !busFixed && panLinkOn(ctx, to) };
}

/**
 * Where a send's placing is read from: the source channel's own position while
 * the destination is on Pan Link, otherwise the send's own.
 */
export function sendPanPath(ctx: AppContext, from: Strip, to: Strip): ParamPath {
  if (sendLocks(ctx, to).panLinked) return stripPosition(ctx, from).path;
  return `ch.${from.id}.send.${to.id}.balance`;
}

/**
 * Reset the send bank into a bus: every send into it goes to the bottom of its
 * fader, and its switch to `on`.
 */
export function resetSendBank(ctx: AppContext, busId: string, on: boolean): void {
  const tail = `.send.${busId}.`;
  for (const p of ctx.store.pathsUnder("ch")) {
    if (p.endsWith(`${tail}level`)) void ctx.store.set(p, LEVEL_MIN_DB);
    else if (p.endsWith(`${tail}on`)) void ctx.store.set(p, on);
  }
}

/**
 * Change the bus type. Taking a type resets the whole bank into that bus: every
 * send goes to the bottom of its fader, and every switch to what the type takes
 * them to — off for FIXED, on for VARI. Taking the type back resets it again
 * rather than putting back what was there. The type and the reset are one
 * operation of the store.
 */
export function setBusType(ctx: AppContext, strip: Strip, value: string): void {
  if (busType(ctx, strip) === value) return;
  ctx.store.operation(() => {
    void ctx.store.set(`ch.${strip.id}.busType`, value);
    resetSendBank(ctx, strip.id, value === "VARI");
  });
}

export function setPanLink(ctx: AppContext, strip: Strip, value: boolean): void {
  void ctx.store.set(`ch.${strip.id}.panLink`, value);
}

/** Each send into `bus` the store holds a placing for, by the strip it comes from. */
function sendsInto(ctx: Pick<AppContext, "store" | "model">, bus: Strip): [ParamPath, Strip][] {
  const tail = `.send.${bus.id}.balance`;
  const out: [ParamPath, Strip][] = [];
  for (const p of ctx.store.pathsUnder("ch")) {
    if (!p.endsWith(tail)) continue;
    const from = findStrip(ctx.model, p.slice("ch.".length, -tail.length));
    if (from) out.push([p, from]);
  }
  return out;
}

/** Each send into `bus` put where its source is, as Pan Link places it. */
function linkedPlacings(ctx: Pick<AppContext, "store" | "model">, bus: Strip): [ParamPath, number][] {
  return sendsInto(ctx, bus).map(([p, from]) => [p, ctx.store.num(stripPosition(ctx, from).path, 0)]);
}

/**
 * Bring Pan Link to where the unit's screen leaves it, as switching it on and taking FIXED
 * do: off on a FIXED bus, and every send into a bus on Pan Link where its source is.
 */
export function settlePanLink(ctx: Pick<AppContext, "store" | "model">): void {
  for (const bus of ctx.model.outputs) {
    if (!isMixBus(bus)) continue;
    if (busType(ctx, bus) === "FIXED" && panLinkOn(ctx, bus)) void ctx.store.set(`ch.${bus.id}.panLink`, false);
    if (!sendLocks(ctx, bus).panLinked) continue;
    for (const [p, v] of linkedPlacings(ctx, bus)) void ctx.store.set(p, v);
  }
}

/**
 * The writes Pan Link carries, as the unit makes them itself: switching it on
 * moves the placing of every send into the bus to its source's position, and
 * while it is on, a source's position carries onto its sends into the bus.
 * Switching it off moves nothing, so each send stays where its source was.
 * Taking FIXED switches the bus's Pan Link off.
 */
export function panLinkWriteRule(ctx: Pick<AppContext, "store" | "model">): WriteRule {
  return (path, value) => {
    const type = /^ch\.(.+)\.busType$/.exec(path);
    if (type) {
      const bus = findStrip(ctx.model, type[1] ?? "");
      return bus && isMixBus(bus) && value === "FIXED" ? [[`ch.${bus.id}.panLink`, false]] : [];
    }
    const link = /^ch\.(.+)\.panLink$/.exec(path);
    if (link) {
      const bus = findStrip(ctx.model, link[1] ?? "");
      if (!bus || value !== true || !sendLocks(ctx, bus).panLinked) return [];
      return linkedPlacings(ctx, bus);
    }
    // A position is a source strip's own PAN or BALANCE; a send's placing is not one.
    if (!/^ch\.[^.]+\.(pan|balance)$/.test(path)) return [];
    const out: [ParamPath, number][] = [];
    for (const bus of ctx.model.outputs) {
      if (!isMixBus(bus) || !sendLocks(ctx, bus).panLinked) continue;
      for (const [p, from] of sendsInto(ctx, bus)) if (stripPosition(ctx, from).path === path) out.push([p, Number(value)]);
    }
    return out;
  };
}
