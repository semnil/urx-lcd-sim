// MIX bus type and Pan Link (user guide, "Channel settings screen" items
// [BUS Type] and [Pan Link]).
//
// Both belong to a MIX bus and to no other strip, and both decide what the
// sends INTO that bus offer: a FIXED bus takes no send level, no send tap and
// no send placing, and a bus on Pan Link places each send by its source
// channel's own position.

import type { AppContext } from "../app/context";
import type { ParamPath } from "../device/path";
import type { Strip } from "../model/types";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { stripPosition } from "./stereo-link";

/** What a MIX bus does with the level of each send into it. */
export const BUS_TYPES = ["VARI", "FIXED"] as const;

export function isMixBus(strip: Strip): boolean {
  return strip.kind === "mix";
}

export function busType(ctx: AppContext, strip: Strip): string {
  return ctx.store.str(`ch.${strip.id}.busType`, "VARI");
}

export function panLinkOn(ctx: AppContext, strip: Strip): boolean {
  return ctx.store.bool(`ch.${strip.id}.panLink`, false);
}

/**
 * What the sends into `to` cannot be given. A bus on FIXED takes its sends at
 * one level; a bus on Pan Link places them by their source. Pan Link keeps its
 * value while the bus is FIXED and only its effect goes away.
 */
export function sendLocks(ctx: AppContext, to: Strip): { busFixed: boolean; panLinked: boolean } {
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
 * rather than putting back what was there.
 */
export function setBusType(ctx: AppContext, strip: Strip, value: string): void {
  if (busType(ctx, strip) === value) return;
  void ctx.store.set(`ch.${strip.id}.busType`, value);
  resetSendBank(ctx, strip.id, value === "VARI");
}

export function setPanLink(ctx: AppContext, strip: Strip, value: boolean): void {
  void ctx.store.set(`ch.${strip.id}.panLink`, value);
}
