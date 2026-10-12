// CUE groups.
//
// The unit splits CUE into two groups: the inputs (mono and stereo channels, the
// FX returns) and the outputs (STEREO, the MIX buses, STREAMING). Within a group
// cues add up; cueing a strip of the other group takes every cue of the group
// that was cued out. The outputs the first input cue takes out are remembered and
// come back once the last input cue is taken out. The inputs an output cue takes
// out are not remembered. CLEAR CUE takes every cue out and forgets the outputs.

import type { AppContext } from "../app/context";
import type { Strip, StripKind, StripSide } from "../model/types";
import { allStrips } from "../model/types";

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

/** The ids of the outputs the first input cue took out, comma-separated. */
const OUTPUT_MEMORY = "ui.cueOutputMemory";

export function cueGroup(strip: Strip): StripSide {
  return CUE_GROUP[strip.kind];
}

const cuePath = (strip: Strip): string => `ch.${strip.id}.cue`;

function cuedIn(ctx: CueCtx, side: StripSide): Strip[] {
  return allStrips(ctx.model).filter((s) => cueGroup(s) === side && ctx.store.bool(cuePath(s), false));
}

/**
 * [CUE] on a strip: put it in the cue or take it out, as one operation of the
 * store. Putting it in takes every strip of the other group out. The first
 * input cue remembers the outputs it takes out; taking the last input cue out
 * puts them back. A linked pair's other channel follows by the pair's write
 * rule.
 */
export function toggleCue(ctx: CueCtx, strip: Strip): void {
  const on = !ctx.store.bool(cuePath(strip), false);
  const side = cueGroup(strip);
  ctx.store.operation(() => {
    if (on) {
      const displaced = cuedIn(ctx, side === "input" ? "output" : "input");
      if (side === "input" && cuedIn(ctx, "input").length === 0) void ctx.store.set(OUTPUT_MEMORY, displaced.map((s) => s.id).join(","));
      for (const s of displaced) if (ctx.store.bool(cuePath(s), false)) void ctx.store.set(cuePath(s), false);
    }
    void ctx.store.set(cuePath(strip), on);
    if (on || side !== "input" || cuedIn(ctx, "input").length > 0) return;
    const remembered = ctx.store.str(OUTPUT_MEMORY, "").split(",");
    for (const s of allStrips(ctx.model)) if (cueGroup(s) === "output" && remembered.includes(s.id)) void ctx.store.set(cuePath(s), true);
  });
}

/** CLEAR CUE: take every strip out of the cue, each as an edit of its own, and forget the remembered outputs. */
export function clearCues(ctx: CueCtx): void {
  for (const s of allStrips(ctx.model)) void ctx.store.set(cuePath(s), false);
  void ctx.store.set(OUTPUT_MEMORY, "");
}
