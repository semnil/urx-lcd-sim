// CUE groups.
//
// The unit splits CUE into two groups: the inputs (mono and stereo channels, the
// FX returns) and the outputs (STEREO, the MIX buses, STREAMING). Within a group
// cues add up; cueing a strip of the other group takes every cue of the group
// that was cued out. The outputs the first input cue takes out are remembered and
// come back once the last input cue is taken out; bringing them back, cueing an
// output and CLEAR CUE forget them. The inputs an output cue takes out are not
// remembered. CLEAR CUE takes every cue out.
//
// That is the unit's Mix CUE. Under its other CUE Mode, Last CUE, cueing a
// strip also takes the other cues of its own group out, so a group holds one
// cue at a time; the two groups still take each other out, and the output an
// input cue took out still comes back with the last input cue taken out
// (confirmed on a URX22 and a URX44V). Switching the CUE Mode takes every cue
// out (the guide's note, and confirmed on a URX44V).

import type { AppContext } from "../app/context";
import type { Strip, StripKind, StripSide } from "../model/types";
import { CUE_MODE, CUE_MODE_SHIPPED, allStrips } from "../model/types";

export { CUE_MODE };

type CueCtx = Pick<AppContext, "store" | "model">;

/** The CUE group each kind of strip belongs to. */
const CUE_GROUP: Record<StripKind, StripSide> = {
  monoIn: "input",
  stIn: "input",
  fx: "input",
  stereo: "output",
  mix: "output",
  streaming: "output",
};

/** The two CUE Modes, as the unit names them: every cue of a group together, or the last one alone. */
export const CUE_MODES = ["Mix CUE", "Last CUE"] as const;
export type CueMode = (typeof CUE_MODES)[number];

/** The ids of the outputs the first input cue took out, comma-separated, empty once they are forgotten. */
const OUTPUT_MEMORY = "ui.cueOutputMemory";

export function cueGroup(strip: Strip): StripSide {
  return CUE_GROUP[strip.kind];
}

const cuePath = (strip: Strip): string => `ch.${strip.id}.cue`;

/** The CUE Mode the unit stands in. */
export function cueMode(ctx: CueCtx): CueMode {
  return ctx.store.str(CUE_MODE, CUE_MODE_SHIPPED) === "Last CUE" ? "Last CUE" : "Mix CUE";
}

/** Whether any strip of the group is in the cue: the Active CUE lamps. */
export function anyCued(ctx: CueCtx, side: StripSide): boolean {
  return cuedIn(ctx, side).length > 0;
}

function cuedIn(ctx: CueCtx, side: StripSide): Strip[] {
  return allStrips(ctx.model).filter((s) => cueGroup(s) === side && ctx.store.bool(cuePath(s), false));
}

/** Every cue CLEAR CUE writes. */
export function clearCueWrites(model: CueCtx["model"]): string[] {
  return allStrips(model).map(cuePath);
}

/**
 * [CUE] on a strip: put it in the cue or take it out, as one operation of the
 * store. Putting it in takes every strip of the other group out. The first
 * input cue remembers the outputs it takes out; taking the last input cue out
 * puts them back and forgets them, and so does cueing an output. Under Last
 * CUE putting a strip in also takes the other strips of its own group out. A
 * linked pair's other channel follows by the pair's write rule.
 */
export function toggleCue(ctx: CueCtx, strip: Strip): void {
  const on = !ctx.store.bool(cuePath(strip), false);
  const side = cueGroup(strip);
  ctx.store.operation(() => {
    if (on) {
      const displaced = cuedIn(ctx, side === "input" ? "output" : "input");
      if (side === "output") void ctx.store.set(OUTPUT_MEMORY, "");
      else if (cuedIn(ctx, "input").length === 0) void ctx.store.set(OUTPUT_MEMORY, displaced.map((s) => s.id).join(","));
      for (const s of displaced) if (ctx.store.bool(cuePath(s), false)) void ctx.store.set(cuePath(s), false);
      // Under Last CUE the one put in is the one its group keeps.
      if (cueMode(ctx) === "Last CUE") for (const s of cuedIn(ctx, side)) if (s.id !== strip.id && ctx.store.bool(cuePath(s), false)) void ctx.store.set(cuePath(s), false);
    }
    void ctx.store.set(cuePath(strip), on);
    if (on || side !== "input" || cuedIn(ctx, "input").length > 0) return;
    const remembered = ctx.store.str(OUTPUT_MEMORY, "").split(",");
    for (const s of allStrips(ctx.model)) if (cueGroup(s) === "output" && remembered.includes(s.id)) void ctx.store.set(cuePath(s), true);
    void ctx.store.set(OUTPUT_MEMORY, "");
  });
}

/** CLEAR CUE: take every strip out of the cue, each as an edit of its own, and forget the remembered outputs. */
export function clearCues(ctx: CueCtx): void {
  for (const s of allStrips(ctx.model)) void ctx.store.set(cuePath(s), false);
  void ctx.store.set(OUTPUT_MEMORY, "");
}

/**
 * [Mix CUE] / [Last CUE]: switch the CUE Mode, as one operation of the store,
 * taking every cue out and forgetting the remembered outputs, as the unit does.
 * The mode the unit already stands in changes nothing.
 */
export function setCueMode(ctx: CueCtx, mode: CueMode): void {
  if (cueMode(ctx) === mode) return;
  ctx.store.operation(() => {
    void ctx.store.set(CUE_MODE, mode);
    takeCuesOut(ctx);
  });
}

/**
 * What a switch of the CUE Mode does to the cues, however the mode was
 * switched: every strip in the cue taken out and the remembered outputs
 * forgotten. Only a strip in the cue is written.
 */
export function takeCuesOut(ctx: CueCtx): void {
  for (const s of allStrips(ctx.model)) if (ctx.store.bool(cuePath(s), false)) void ctx.store.set(cuePath(s), false);
  void ctx.store.set(OUTPUT_MEMORY, "");
}
