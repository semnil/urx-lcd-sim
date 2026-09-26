// The sheet an effect-name button drops, and what decides which of the effects on
// it a channel can take (user guide, "INS FX screen" and the Appendix's effect
// list): the sampling frequency the unit is running at, whether the channel is
// carrying one stereo signal, and whether another channel is already running an
// effect of the same kind.

import type { AppContext } from "../app/context";
import type { EffectOption } from "../model/effects";
import { INPUT_INSERT_EFFECTS, NO_EFFECT, OUTPUT_INSERT_EFFECTS, effectParams } from "../model/effects";
import type { Strip } from "../model/types";
import { allStrips } from "../model/types";
import { pickerGrid, pickerSheet, toggle } from "../ui/widgets";
import { isStereoLinked, linkedPair } from "./stereo-link";

export { NO_EFFECT };

/** Whether the strip has an insert at all: the mono channels and the output buses. */
export function carriesInsert(strip: Strip): boolean {
  return strip.kind === "monoIn" || strip.kind === "mix" || strip.kind === "stereo";
}

/** The effects offered on a strip that carries an insert. */
function insertEffects(strip: Strip): readonly EffectOption[] {
  return strip.side === "output" ? OUTPUT_INSERT_EFFECTS : INPUT_INSERT_EFFECTS;
}

/**
 * Where a strip keeps its insert. A stereo-linked pair carries one insert between
 * its two channels, held on the lower-numbered one, so both halves show and set
 * the same effect.
 */
export function insertBase(ctx: AppContext, strip: Strip): string {
  const first = linkedPair(ctx, strip)?.[0] ?? strip;
  return `ch.${first.id}.insFx`;
}

/** What is holding each kind of effect the unit runs one of at a time. */
function holders(ctx: AppContext): Map<string, string> {
  const held = new Map<string, string>();
  for (const s of allStrips(ctx.model)) {
    if (!carriesInsert(s)) continue;
    const base = insertBase(ctx, s);
    const name = ctx.store.str(`${base}.effect`, NO_EFFECT);
    const holder = insertEffects(s).find((o) => o.name === name)?.holder;
    if (holder && !held.has(holder)) held.set(holder, base);
  }
  return held;
}

/** An entry of the effect menu, and whether this channel can take it. */
export interface EffectChoice {
  name: string;
  enabled: boolean;
}

/**
 * The effects a strip is offered, and which of them it can take. An effect that
 * cannot be taken is drawn on the sheet and does nothing when touched.
 */
export function insertFxOptions(ctx: AppContext, strip: Strip): EffectChoice[] {
  const rate = ctx.store.num("setup.samplingFrequency", 48000);
  const stereo = isStereoLinked(ctx, strip) || strip.kind !== "monoIn";
  const held = holders(ctx);
  const mine = insertBase(ctx, strip);
  return insertEffects(strip).map((o) => {
    const by = o.holder === undefined ? undefined : held.get(o.holder);
    const elsewhere = by !== undefined && by !== mine;
    return {
      name: o.name,
      enabled: (o.maxRate === undefined || rate <= o.maxRate) && !(o.monoOnly && stereo) && !elsewhere,
    };
  });
}

/** Every value the effect holds, back at what the unit comes up at. */
function seedEffect(ctx: AppContext, base: string, name: string): void {
  for (const p of effectParams(name)) {
    void ctx.store.set(`${base}.${p.key}`, p.fallback);
  }
}

/**
 * Take an effect on a channel. The unit switches the block on as it takes one and
 * fills the effect with its own settings, so selecting the same effect again
 * puts those settings back.
 */
export function takeEffect(ctx: AppContext, base: string, namePath: string, onPath: string, name: string): void {
  void ctx.store.set(namePath, name);
  if (onPath) void ctx.store.set(onPath, name !== NO_EFFECT);
  seedEffect(ctx, base, name);
}

/** Take an insert on a channel, which is the pair's where the pair is linked. */
export function takeInsert(ctx: AppContext, strip: Strip, name: string): void {
  const base = insertBase(ctx, strip);
  takeEffect(ctx, base, `${base}.effect`, `${base}.on`, name);
}

/**
 * Drop every insert the unit can no longer run. Raising the sampling frequency
 * past an effect's ceiling takes the effect off the channel, and lowering it
 * again leaves the channel with none.
 */
export function dropInsertsOverRate(ctx: AppContext, rate: number): void {
  for (const s of allStrips(ctx.model)) {
    if (!carriesInsert(s)) continue;
    const base = insertBase(ctx, s);
    const name = ctx.store.str(`${base}.effect`, NO_EFFECT);
    const option = insertEffects(s).find((o) => o.name === name);
    if (option?.maxRate === undefined || rate <= option.maxRate) continue;
    void ctx.store.set(`${base}.effect`, NO_EFFECT);
    void ctx.store.set(`${base}.on`, false);
  }
}

/** The band across the top of the list the effect-name button drops, the same on every channel. */
export const EFFECT_SHEET_TITLE = "EFFECT TYPE";

export function effectSheet(
  ctx: AppContext,
  spec: { current: string; choices: EffectChoice[]; perRow: number; onPick: (name: string) => void },
): HTMLElement {
  return pickerSheet(ctx, {
    title: EFFECT_SHEET_TITLE,
    label: EFFECT_SHEET_TITLE,
    build: (close) => {
      const tile = (o: EffectChoice): HTMLElement =>
        toggle(o.name, o.name === spec.current, () => {
          if (!o.enabled) return;
          spec.onPick(o.name);
          close();
          ctx.repaint();
        }, o.enabled ? "source-btn" : "source-btn is-disabled");
      const rows: (HTMLElement | null)[][] = [];
      const pad = (row: HTMLElement[]): (HTMLElement | null)[] => [
        ...row,
        ...Array<null>(Math.max(0, spec.perRow - row.length)).fill(null),
      ];
      // Taking the effect off stands alone at the head of the list; the effects
      // themselves start at the left of the row under it.
      const empty = spec.choices.filter((o) => o.name === NO_EFFECT);
      if (empty.length > 0) rows.push(pad(empty.map(tile)));
      const rest = spec.choices.filter((o) => o.name !== NO_EFFECT);
      for (let i = 0; i < rest.length; i += spec.perRow) rows.push(pad(rest.slice(i, i + spec.perRow).map(tile)));
      return pickerGrid(rows);
    },
  });
}
