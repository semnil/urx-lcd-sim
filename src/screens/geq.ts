// Flex12GEQ on a bus, as the screens set it: the EQ Type, each side's GEQ Limit
// and [GEQ] switch, and what the unit changes along with them (`src/model/geq.ts`).

import type { AppContext } from "../app/context";
import type { Strip } from "../model/types";
import { allStrips } from "../model/types";
import {
  EQ_TYPES,
  EQ_TYPE_SHIPPED,
  GEQ_BANDS,
  GEQ_LIMIT_SHIPPED,
  GEQ_SIDES,
  carriesGeq,
  eqTypePath,
  geqBandPath,
  geqClamp,
  geqLimitPath,
  geqLinkPath,
  geqOverRate,
  type EqType,
  type GeqSide,
} from "../model/geq";
import { stripLane } from "./strip-state";

type GeqCtx = Pick<AppContext, "store" | "model">;

const base = (strip: Strip): string => `ch.${strip.id}`;

/** The side of a bus the screens stand on: its L lane or its R lane. */
export function geqSide(ctx: AppContext, strip: Strip): GeqSide {
  return stripLane(ctx, strip) === 0 ? "l" : "r";
}

/** The EQ Type a bus runs. */
export function eqTypeOf(ctx: GeqCtx, strip: Strip): EqType {
  const v = ctx.store.str(eqTypePath(base(strip)), EQ_TYPE_SHIPPED);
  return (EQ_TYPES as readonly string[]).includes(v) ? (v as EqType) : EQ_TYPE_SHIPPED;
}

/** Whether a bus runs Flex12GEQ in place of its 4-band EQ. */
export function runsGeq(ctx: GeqCtx, strip: Strip): boolean {
  return carriesGeq(strip) && eqTypeOf(ctx, strip) === "Flex12GEQ" && !geqOverRate(ctx.store.num("setup.samplingFrequency", 48000));
}

/** Whether the GEQ Link joins the two sides of a bus. */
const linked = (ctx: GeqCtx, strip: Strip): boolean => ctx.store.str(geqLinkPath(base(strip)), "Off") !== "Off";

/**
 * [EQ Type], as one operation of the store. Switching to Flex12GEQ turns the
 * bus's EQ on and, on a MIX, the GEQ Link off; switching back to 4band PEQ
 * changes nothing else.
 */
export function setEqType(ctx: GeqCtx, strip: Strip, type: EqType): void {
  const b = base(strip);
  if (eqTypeOf(ctx, strip) === type) return;
  ctx.store.operation(() => {
    void ctx.store.set(eqTypePath(b), type);
    if (type !== "Flex12GEQ") return;
    void ctx.store.set(`${b}.eq.on`, true);
    if (strip.kind === "mix") void ctx.store.set(geqLinkPath(b), "Off");
  });
}

/**
 * [GEQ Limit] on one side, as one operation of the store: every band of the
 * side pulled into the new window, and while the GEQ Link is on, the other side
 * set the same way.
 */
export function setGeqLimit(ctx: GeqCtx, strip: Strip, side: GeqSide, limit: string): void {
  const b = base(strip);
  const sides = linked(ctx, strip) ? GEQ_SIDES : [side];
  ctx.store.operation(() => {
    for (const s of sides) {
      void ctx.store.set(geqLimitPath(b, s), limit);
      GEQ_BANDS.forEach((_, band) => {
        const path = geqBandPath(b, s, band);
        const now = ctx.store.num(path, 0);
        const pulled = geqClamp(now, limit);
        if (pulled !== now) void ctx.store.set(path, pulled);
      });
    }
  });
}

/** The GEQ Limit a side stands on. */
export function geqLimitOf(ctx: GeqCtx, strip: Strip, side: GeqSide): string {
  return ctx.store.str(geqLimitPath(base(strip), side), GEQ_LIMIT_SHIPPED);
}

/**
 * What a sampling frequency over 48 kHz does to the buses: each one on
 * Flex12GEQ goes back to 4band PEQ with every band of both sides at 0 dB, and
 * stays there at a lower rate.
 */
export function dropGeqOverRate(ctx: GeqCtx, rate: number): void {
  if (!geqOverRate(rate)) return;
  for (const strip of allStrips(ctx.model)) {
    if (!carriesGeq(strip) || eqTypeOf(ctx, strip) !== "Flex12GEQ") continue;
    const b = base(strip);
    void ctx.store.set(eqTypePath(b), "4band PEQ");
    for (const s of GEQ_SIDES) GEQ_BANDS.forEach((_, band) => {
      if (ctx.store.num(geqBandPath(b, s, band), 0) !== 0) void ctx.store.set(geqBandPath(b, s, band), 0);
    });
  }
}
