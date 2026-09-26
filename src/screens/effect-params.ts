// What an effect sets: the rack the INS FX screen draws once an effect is taken,
// and the screen that rack opens (user guide, "Operating the insert from the HOME
// screen (Overview)": touch the effect area, and set the parameters in the
// parameter settings screen).
//
// One screen serves both places an effect runs, because a strip runs at most one:
// a mono channel or an output bus runs the effect it has inserted, and an FX
// channel is the effect.

import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";
import type { EffectFace, EffectNumeric, EffectOption, EffectParam, EffectSelect, EffectToggle } from "../model/effects";
import {
  FX_EFFECTS,
  FX_EFFECT_DEFAULT,
  MBC_GAIN_RANGE,
  MBC_ONE_KNOB_DRIVEN,
  MBC_PLOT_HZ,
  NO_EFFECT,
  PITCH_NOTE_NAMES,
  effectFaces,
  effectParams,
  effectSpec,
  mbcGainDb,
  pitchNoteKey,
  pitchScaleNotes,
  pitchScaleSets,
} from "../model/effects";
import type { Strip } from "../model/types";
import { el } from "../ui/dom";
import { Icons } from "../ui/icons";
import { COMP_GR_METER_DB, compResponse } from "../model/dynamics";
import type { NumericSpec } from "../ui/param-spec";
import { unitOf } from "../ui/param-spec";
import { knobControl, pulldown, toggle, valueBox } from "../ui/widgets";
import {
  HANDLE_R,
  HANDLE_RING,
  NS,
  PLOT_H,
  PLOT_MAX,
  PLOT_MIN,
  PLOT_SPAN,
  PLOT_W,
  channelSelector,
  dynFrame,
  dynMeters,
  dynSetting,
  noChannel,
  oneKnobButton,
  oneKnobPanel,
  pairMeter,
  plotCurve,
  plotHandle,
  plotPanel,
  plotRules,
  plotX,
  plotY,
  routeStrip,
  thresholdReduction,
  titleBadge,
  titleBox,
} from "./channel";
import { type GrSpec, blockReduction, grShare, laneNetDb } from "./meters";
import type { EffectChoice } from "./insert-fx";
import { carriesInsert, effectSheet, insertBase, insertFxOptions, takeEffect, takeInsert } from "./insert-fx";
import type { ScreenBody, ScreenDef } from "./types";

/** Where a strip keeps the effect it runs, and what it is offered instead. */
export interface EffectHolder {
  /** The prefix the effect's values hang off. */
  base: string;
  /** Where the name of the effect being run is kept. */
  namePath: string;
  onPath: string;
  /** The effect being run, or [No Effect] where the insert is empty. */
  name: string;
  /** The name in the middle of the toolbar. An insert's is also its switch; an
   *  FX channel's names the channel, and that effect has no switch at all. */
  title: string;
  switches: boolean;
  onFallback: boolean;
  /** Whether that switch does anything: the unit leaves it inert with nothing taken. */
  switchable: boolean;
  /** What the name button offers, read when it is touched: working it out walks
   *  every strip on the unit, which no render needs. */
  choices(): EffectChoice[];
  /** How many of them stand in a row on the sheet the button drops. */
  perRow: number;
  /** The screen the effect's name is chosen on. */
  pick(name: string): void;
}

/** The effect a strip runs, or nothing where the strip runs none. */
export function effectHolder(ctx: AppContext, strip: Strip): EffectHolder | null {
  if (strip.kind === "fx") {
    const base = `ch.${strip.id}.effect`;
    const options: readonly EffectOption[] = FX_EFFECTS[strip.id] ?? [];
    const rate = ctx.store.num("setup.samplingFrequency", 48000);
    const fallback = FX_EFFECT_DEFAULT[strip.id] ?? "";
    return {
      base,
      namePath: `${base}.type`,
      name: ctx.store.str(`${base}.type`, fallback),
      title: strip.label,
      switches: false,
      onPath: "",
      onFallback: true,
      switchable: false,
      choices: () => options.map((o) => ({ name: o.name, enabled: o.maxRate === undefined || rate <= o.maxRate })),
      // The reverbs fill the first row and the two delays the second.
      perRow: 3,
      pick: (name) => {
        toFirstPage(ctx);
        takeEffect(ctx, base, `${base}.type`, "", name);
      },
    };
  }
  if (!carriesInsert(strip)) return null;
  const base = insertBase(ctx, strip);
  return {
    base,
    namePath: `${base}.effect`,
    onPath: `${base}.on`,
    name: ctx.store.str(`${base}.effect`, NO_EFFECT),
    title: "INS FX",
    switches: true,
    onFallback: false,
    switchable: ctx.store.str(`${base}.effect`, NO_EFFECT) !== NO_EFFECT,
    choices: () => insertFxOptions(ctx, strip),
    perRow: 4,
    pick: (name) => {
      toFirstPage(ctx);
      takeInsert(ctx, strip, name);
    },
  };
}

/**
 * Whether the sampling frequency has put every effect an FX channel offers out
 * of reach. The channel is still there and still selected, and there is nothing
 * it can be set to.
 */
export function fxShutOut(ctx: AppContext, strip: Strip): boolean {
  if (strip.kind !== "fx") return false;
  const rate = ctx.store.num("setup.samplingFrequency", 48000);
  const options: readonly EffectOption[] = FX_EFFECTS[strip.id] ?? [];
  return options.length > 0 && options.every((o) => o.maxRate !== undefined && rate > o.maxRate);
}

/** The button that names the effect and opens the list of the rest. */
function effectButton(ctx: AppContext, holder: EffectHolder): HTMLElement {
  return el("button", {
    class: "insfx-effect",
    onTap: () =>
      void effectSheet(ctx, {
        current: holder.name,
        choices: holder.choices(),
        perRow: holder.perRow,
        onPick: holder.pick,
      }),
    attrs: { "aria-label": "Select the inserted effect" },
    children: [el("span", { text: holder.name }), el("span", { class: "insfx-effect-copy", children: [Icons.copy()] })],
  });
}

/** Where the screen keeps the page it is showing. */
const PAGE_PATH = "ui.effectPage";

/** Put the screen on the effect's first page, which is the page it opens on. */
const toFirstPage = (ctx: AppContext): void => void ctx.store.set(PAGE_PATH, 0);

/**
 * Open the settings for the effect a strip runs. The screen opens on the first
 * page rather than on the page the effect before it was left on. An insert opens
 * on the screen it is taken on, which is the screen that sets it.
 */
export function openEffectParams(ctx: AppContext, strip: Strip, insert = false): void {
  toFirstPage(ctx);
  if (insert) ctx.nav.push({ id: "ch.insfx", strip: strip.id });
  else ctx.nav.push({ id: "ch.effect", strip: strip.id });
}

/** How many panels the screen holds at once: two rows of four. */
const PAGE_SLOTS = 8;
const ROW_SLOTS = 4;

/** How many panels a control takes: a row of buttons takes two. */
const slotsOf = (p: EffectParam): number => (p.kind === "select" && p.buttons ? 2 : 1);

/** One page of controls, with the panel each one's first stands in. */
interface EffectPage {
  label: string;
  params: EffectParam[];
  firsts: number[];
}

/**
 * The pages an effect's controls are laid out over. A face of its own starts a
 * page, and a face with more controls than the screen holds runs on to the next.
 * A face that places its controls itself runs a page for every eight panels.
 */
function effectPages(faces: readonly EffectFace[]): EffectPage[] {
  const pages: EffectPage[] = [];
  for (const face of faces) {
    const { slots } = face;
    if (slots) {
      for (let from = 0; from < slots.length; from += PAGE_SLOTS) {
        const page: EffectPage = { label: face.label, params: [], firsts: [] };
        slots.slice(from, from + PAGE_SLOTS).forEach((key, slot) => {
          const p = face.params.find((q) => q.key === key);
          if (!p) return;
          page.params.push(p);
          page.firsts.push(slot);
        });
        pages.push(page);
      }
      continue;
    }
    let page: EffectPage = { label: face.label, params: [], firsts: [] };
    let used = 0;
    for (const p of face.params) {
      if (used + slotsOf(p) > PAGE_SLOTS) {
        pages.push(page);
        page = { label: face.label, params: [], firsts: [] };
        used = 0;
      }
      page.params.push(p);
      page.firsts.push(used);
      used += slotsOf(p);
    }
    if (page.params.length > 0) pages.push(page);
  }
  return pages;
}

/** The page the screen is showing, which its own arrows step. */
function pageIndex(ctx: AppContext, pages: readonly unknown[]): number {
  return Math.min(Math.max(0, Math.round(ctx.store.num(PAGE_PATH, 0))), pages.length - 1);
}

/**
 * The two effects the unit draws the way it draws the channel's own dynamics, and
 * how steeply each pulls down what falls below the band.
 */
const COMPANDER_EXPANSION: Record<string, number> = { "Compander-H": 5, "Compander-S": 1.5 };
const COMPANDERS = Object.keys(COMPANDER_EXPANSION);

/** The effect whose bands the unit pages through on the screen its own COMP takes. */
const MBC = "M.B.Comp";

/** Where the plot's rules stand, as fractions of its width and its height. */
const RULE_X = 0.8;
const RULE_Y = 0.2;

/**
 * What a compander puts out for an input level. The output is held at the crossing
 * of the plot's rules, which the output gain moves down from its ceiling of 0.0dB:
 * from there to the right edge the line is flat. Under the crossing the ratio sets
 * the slope as far as the threshold, and below the threshold the slope is the one
 * it has at 1.0:1.
 */
function companderResponse(
  threshold: number,
  ratio: number,
  width: number,
  gain: number,
  expansion: number,
): (db: number) => number {
  const r = Math.max(1, ratio);
  const inAt = PLOT_MIN + RULE_X * PLOT_SPAN;
  const top = PLOT_MIN + (1 - RULE_Y) * PLOT_SPAN + gain;
  const foot = threshold - width;
  const atThreshold = top - (inAt - threshold) / r;
  return (db) => {
    if (db >= inAt) return top;
    if (db >= threshold) return top - (inAt - db) / r;
    if (db >= foot) return atThreshold - (threshold - db);
    return atThreshold - width - (foot - db) * expansion;
  };
}

/**
 * A plot of what a block puts out for an input level: the two rules the unit
 * draws across it, the curve, and the grips that shape it.
 */
function responsePlot(outAt: (db: number) => number, grips: (svg: SVGSVGElement) => void): HTMLElement {
  return plotPanel((svg) => {
    plotRules(svg, [RULE_X], [RULE_Y]);
    plotCurve(
      svg,
      Array.from({ length: PLOT_SPAN + 1 }, (_, i) => PLOT_MIN + i).map((db) => [plotX(db), plotY(outAt(db))] as const),
    );
    grips(svg);
  });
}

/**
 * How close two grips on a plot come: half a disc, so neither covers more than
 * half of the other. A band narrower than this keeps its value and stops its grip.
 * Worked out where it is used: the plot's own measures reach this module through
 * an import that closes a circle, and are not there while this one is loading.
 */
const gripApartDb = (): number => (HANDLE_R * PLOT_SPAN) / PLOT_W;

/**
 * The same value for the narrow box a dynamics screen puts it in, where the
 * millisecond is `m`. The readout bar under the screen keeps the whole word.
 */
function inShort(spec: NumericSpec): NumericSpec {
  return { ...spec, boxUnit: (v) => (unitOf(spec.unit, v) === "ms" ? "m" : unitOf(spec.unit, v)) };
}

/** The six values a compander holds, in the order the readout bar carries them. */
function companderSpecs(holder: EffectHolder, values: Record<string, number>): NumericSpec[] {
  const face = effectFaces(holder.name)[0];
  return (face?.params ?? [])
    .filter((p): p is EffectNumeric => p.kind === "num")
    .map((p) => effectSpec(holder.base, p, values));
}

/**
 * A compander on the screen the channel's own COMP takes: the curve down the left
 * with the grips the unit puts on it, the reduction meter beside it, and the
 * settings that shape it down the right.
 */
function companderBody(ctx: AppContext, strip: Strip, holder: EffectHolder): { main: HTMLElement; knobs: NumericSpec[] } {
  const face = effectFaces(holder.name)[0];
  const values = faceValues(ctx, holder, face?.params ?? []);
  const specs = companderSpecs(holder, values);
  const [threshold, ratio, width, gain, attack, release] = specs;
  const at = (spec: NumericSpec | undefined): number =>
    spec ? (values[spec.path.slice(holder.base.length + 1)] ?? spec.fallback) : 0;
  const outAt = companderResponse(
    at(threshold),
    at(ratio),
    at(width),
    at(gain),
    COMPANDER_EXPANSION[holder.name] ?? 1,
  );
  const onPlot = (db: number): number => Math.min(Math.max(db, PLOT_MIN), PLOT_MAX);
  const corner = onPlot(at(threshold));
  const boundary = onPlot(at(threshold) - at(width));
  const plot = responsePlot(outAt, (svg) => {
    // T stands on the threshold, W at the foot of the band the effect passes, and
    // G on the output at the top right, its ring a ring's width from the frame.
    // Dragging W left widens the band, so it carries the value the other way from
    // the way it stands, and it stops half a disc short of T rather than passing
    // under it.
    const apart = gripApartDb();
    const grip = (letter: string, spec: NumericSpec | undefined, db: number, axis: "x" | "y", sense?: 1 | -1): void => {
      if (!spec) return;
      plotHandle(ctx, svg, letter, plotX(db), plotY(outAt(db)), axis, {
        spec,
        ...(sense ? { sense } : {}),
      });
    };
    // The gain's grip keeps its place: the threshold never reaches within half a
    // disc of it, and it is drawn last, so its letter is never the covered one.
    const gainDb = PLOT_MIN + ((PLOT_W - HANDLE_R - 1.5 * HANDLE_RING) / PLOT_W) * PLOT_SPAN;
    grip("W", width, Math.max(PLOT_MIN + apart, Math.min(boundary, corner - apart)), "x", -1);
    grip("T", threshold, corner, "x");
    grip("G", gain, gainDb, "y");
  });
  const sets = [attack, release, ratio].filter((s): s is NumericSpec => s !== undefined);
  const rows = el("div", { class: "dyn-sets", children: sets.map((spec) => dynSetting(ctx, inShort(spec))) });
  // The compander hears the pair's louder channel on a linked pair, and the OUT
  // meter reads as far below IN as the bar beside it is holding down.
  const gr: GrSpec = {
    kind: "over",
    base: holder.base,
    level: pairMeter(ctx, strip),
    scale: COMP_GR_METER_DB,
    makeup: 0,
    ...(threshold ? { threshold: { path: threshold.path, fallback: threshold.fallback } } : {}),
    ...(holder.onPath ? { on: { path: holder.onPath, fallback: holder.onFallback } } : {}),
  };
  const held = grShare(gr, blockReduction(ctx.store, gr));
  return { main: dynFrame(plot, held, [rows, dynMeters(ctx, strip, laneNetDb(ctx.store, gr), gr)], gr), knobs: specs };
}

/** The bands the multi-band compressor gives a page each, after the page they are set up on. */
const MBC_BANDS = [
  { key: "low", label: "Low", letter: "L" },
  { key: "mid", label: "Mid", letter: "M" },
  { key: "high", label: "High", letter: "H" },
] as const;

/** How wide the bands' own page draws them, which is wider than a curve's plot. */
const MBC_PLOT_W = 263;

/** The panel the bands stand on, which is the plot panel at its own width. */
function bandsPanel(draw: (svg: SVGSVGElement) => void): HTMLElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${MBC_PLOT_W} ${PLOT_H}`);
  svg.setAttribute("class", "dyn-curve");
  svg.setAttribute("aria-hidden", "true");
  draw(svg);
  return el("div", { class: "dyn-plot mbc-bands", children: [svg as unknown as HTMLElement] });
}

/** Where a frequency stands across the page the crossovers are set on. */
function mbcX(hz: number): number {
  const [lo, hi] = MBC_PLOT_HZ;
  return (Math.log(Math.min(Math.max(hz, lo), hi) / lo) / Math.log(hi / lo)) * MBC_PLOT_W;
}

/**
 * Where a grip's middle can stand and keep the whole disc, rim and all, inside the
 * plot — the rule the dynamics screens' grips follow.
 */
function inside(at: number, span: number, fixed = false): number {
  const edge = (fixed ? HANDLE_R / 2 : HANDLE_R) + HANDLE_RING / 2;
  return Math.min(Math.max(at, edge), span - edge);
}

/** Where a band's gain stands up that page. */
function mbcY(db: number): number {
  const [lo, hi] = MBC_GAIN_RANGE;
  return PLOT_H - ((db - lo) / (hi - lo)) * PLOT_H;
}

/** What one page of the multi-band compressor draws and what it hands the knobs. */
interface MbcPage {
  plot: HTMLElement;
  rows: HTMLElement[];
  knobs: NumericSpec[];
  /** The value the page sets out in a box, which is the one it opens framed. */
  boxed?: NumericSpec;
  /** The band whose bar the reduction meters light, where a band's page is open. */
  lit?: string;
}

/**
 * The page the bands are set up on: each band drawn from the crossover beside it
 * to the next, as high as its gain. The gain grips stand at the middle of their
 * band at the top of it, and the crossovers at the foot where two bands meet.
 */
function mbcMainPage(
  ctx: AppContext,
  spec: (key: string) => NumericSpec | undefined,
  valueAt: (key: string) => number,
): MbcPage {
  const edges = ["xoverLowMid", "xoverMidHigh"] as const;
  const bounds = [0, mbcX(valueAt(edges[0])), mbcX(valueAt(edges[1])), MBC_PLOT_W];
  const plot = bandsPanel((svg) => {
    MBC_BANDS.forEach((band, i) => {
      const left = bounds[i] ?? 0;
      const top = mbcY(mbcGainDb(valueAt(`${band.key}Gain`)));
      const fill = document.createElementNS(NS, "rect");
      fill.setAttribute("x", left.toFixed(1));
      fill.setAttribute("y", top.toFixed(1));
      fill.setAttribute("width", Math.max(0, (bounds[i + 1] ?? 0) - left).toFixed(1));
      fill.setAttribute("height", Math.max(0, PLOT_H - top).toFixed(1));
      fill.setAttribute("class", `mbc-fill mbc-fill-${band.key}`);
      svg.append(fill);
    });
    MBC_BANDS.forEach((band, i) => {
      const gain = spec(`${band.key}Gain`);
      if (!gain) return;
      const fixed = gain.locked === true;
      const middle = ((bounds[i] ?? 0) + (bounds[i + 1] ?? 0)) / 2;
      const top = mbcY(mbcGainDb(valueAt(`${band.key}Gain`)));
      plotHandle(ctx, svg, band.letter, inside(middle, MBC_PLOT_W, fixed), inside(top, PLOT_H, fixed), "y", {
        spec: gain,
        ...(fixed ? { fixed } : {}),
      });
    });
    edges.forEach((key, i) => {
      const crossover = spec(key);
      if (!crossover) return;
      const fixed = crossover.locked === true;
      plotHandle(ctx, svg, i === 0 ? "LM" : "MH", inside(bounds[i + 1] ?? 0, MBC_PLOT_W, fixed), inside(PLOT_H, PLOT_H, fixed), "x", {
        spec: crossover,
        ...(fixed ? { fixed } : {}),
      });
    });
  });
  const outGain = spec("outGain");
  const gains = MBC_BANDS.map((band) => {
    const gain = spec(`${band.key}Gain`);
    return gain && { ...gain, label: `${band.label} ${gain.label}` };
  });
  const rows = outGain
    ? [el("div", { class: "mbc-out", children: [cell(outGain.label, valueBox(ctx, { ...outGain, boxUnit: "" }, "efx-value"), knobControl(ctx, outGain))] })]
    : [];
  return {
    plot,
    rows,
    knobs: [...gains, outGain, spec(edges[0]), spec(edges[1])].filter((s): s is NumericSpec => s !== undefined),
    ...(outGain ? { boxed: outGain } : {}),
  };
}

/**
 * One band's page: its own curve with the grips the unit puts on it, the band's
 * Bypass over the times it takes, and the whole effect's Release under them.
 */
function mbcBandPage(
  ctx: AppContext,
  holder: EffectHolder,
  band: (typeof MBC_BANDS)[number],
  spec: (key: string) => NumericSpec | undefined,
  valueAt: (key: string) => number,
): MbcPage {
  const key = (name: string): string => `${band.key}${name}`;
  const threshold = valueAt(key("Threshold"));
  const outAt = compResponse(threshold, valueAt(key("Ratio")), 0, mbcGainDb(valueAt(key("Gain"))));
  const plot = responsePlot(outAt, (svg) => {
    const corner = Math.min(Math.max(threshold, PLOT_MIN), PLOT_MAX);
    const ratio = spec(key("Ratio"));
    const point = spec(key("Threshold"));
    if (point) {
      const fixed = point.locked === true;
      plotHandle(ctx, svg, "T", inside(plotX(corner), PLOT_W, fixed), inside(plotY(outAt(corner)), PLOT_H, fixed), "x", {
        spec: point,
        ...(fixed ? { fixed } : {}),
      });
    }
    if (ratio) {
      const fixed = ratio.locked === true;
      const cx = inside(PLOT_W, PLOT_W, fixed);
      const far = PLOT_MIN + (cx / PLOT_W) * PLOT_SPAN;
      plotHandle(ctx, svg, "R", cx, inside(plotY(outAt(far)), PLOT_H, fixed), "y", {
        spec: ratio,
        sense: -1,
        ...(fixed ? { fixed } : {}),
      });
    }
  });
  plot.classList.add(`mbc-curve-${band.key}`);
  const bypassPath = `${holder.base}.${key("Bypass")}`;
  const bypass = ctx.store.bool(bypassPath, false);
  const sets = [spec(key("Attack")), spec("release")].filter((s): s is NumericSpec => s !== undefined);
  const band_ = spec(key("Gain"));
  const gain = band_ && { ...band_, label: `${band.label} ${band_.label}` };
  // While the unit's own knob drives a row, the row keeps its reading and takes
  // no touch, as the rows it drives do wherever they are drawn.
  const driven = sets.some((set) => set.locked);
  const switchNode = toggle("Bypass", bypass, () => void ctx.store.set(bypassPath, !bypass), "mbc-bypass");
  return {
    plot,
    rows: [
      el("div", {
        class: "dyn-sets",
        children: [
          ...(driven ? [] : [switchNode]),
          ...sets.map((set) =>
            el("div", {
              class: "dyn-set",
              children: [
                el("span", { class: "dyn-set-caption", text: set.label }),
                valueBox(ctx, inShort(set), "", true, set.locked === true),
              ],
            }),
          ),
        ],
      }),
    ],
    knobs: [spec(key("Threshold")), spec(key("Ratio")), ...sets, gain].filter((s): s is NumericSpec => s !== undefined),
    ...(sets[0] ? { boxed: sets[0] } : {}),
    lit: band.key,
  };
}

/** The reduction each band is holding its own back by, the open band's bar lit. */
function mbcGr(ctx: AppContext, strip: Strip, valueAt: (key: string) => number, lit?: string): HTMLElement {
  return el("div", {
    class: "mbc-gr",
    children: [
      el("span", { class: "mbc-gr-caption", text: "GR" }),
      el("div", {
        class: "mbc-gr-letters",
        children: MBC_BANDS.map((band) => el("span", { text: band.letter })),
      }),
      el("div", {
        class: "mbc-gr-bars",
        children: MBC_BANDS.map((band) =>
          el("div", {
            // The frame round the open band is the wrapper's, so the bar itself
            // keeps the corner shades its own rows draw.
            class: `mbc-gr-bar${band.key === lit ? " is-lit" : ""}`,
            children: [
              el("div", {
                class: "dyn-gr",
                children: [
                  el("i", {
                    style: { height: `${thresholdReduction(ctx, strip, valueAt(`${band.key}Threshold`)) * 100}%` },
                  }),
                ],
              }),
            ],
          }),
        ),
      }),
    ],
  });
}

/**
 * The multi-band compressor, on the screen the channel's own COMP takes: the
 * bands on the first page and one page each for LOW, MID and HIGH. While 1-knob
 * is on the unit sets the bands itself, so the values it drives are read and not
 * turned, and the knob strip carries its level alone.
 */
function mbcBody(
  ctx: AppContext,
  strip: Strip,
  holder: EffectHolder,
  at: number,
): { main: HTMLElement; knobs: NumericSpec[]; boxed?: NumericSpec } {
  const params = effectParams(holder.name).filter((p): p is EffectNumeric => p.kind === "num");
  const values = faceValues(ctx, holder, params);
  const driven = drivenRows(ctx, holder);
  const specs = new Map(
    params.map((p) => [p.key, driven.has(p.key) ? { ...effectSpec(holder.base, p, values), locked: true } : effectSpec(holder.base, p, values)]),
  );
  const spec = (key: string): NumericSpec | undefined => specs.get(key);
  const valueAt = (key: string): number => values[key] ?? spec(key)?.fallback ?? 0;
  const band = MBC_BANDS[at - 1];
  const page = band ? mbcBandPage(ctx, holder, band, spec, valueAt) : mbcMainPage(ctx, spec, valueAt);
  const level = spec("oneKnobLevel");
  const oneKnob = ctx.store.bool(`${holder.base}.oneKnobOn`, false);
  if (oneKnob) page.plot.classList.add("is-oneknob");
  const top = el("div", {
    class: "dyn-row dyn-row-makeup mbc-top",
    children: [
      el("span", { class: "mbc-band-name", text: band?.label ?? "" }),
      oneKnob && level ? oneKnobPanel(ctx, level, `${holder.base}.oneKnobOn`) : oneKnobButton(ctx, `${holder.base}.oneKnobOn`),
    ],
  });
  return {
    main: el("div", {
      class: `dyn-screen mbc-screen${band ? "" : " is-bands"}`,
      children: [page.plot, mbcGr(ctx, strip, valueAt, page.lit), top, ...page.rows, dynMeters(ctx, strip)],
    }),
    knobs: oneKnob && level ? [level] : page.knobs,
    ...(oneKnob && level ? { boxed: level } : page.boxed ? { boxed: page.boxed } : {}),
  };
}

/** The rows the unit drives itself, which the operator cannot turn. */
function drivenRows(ctx: AppContext, holder: EffectHolder): ReadonlySet<string> {
  if (holder.name !== "M.B.Comp" || !ctx.store.bool(`${holder.base}.oneKnobOn`, false)) return new Set();
  return new Set(MBC_ONE_KNOB_DRIVEN);
}

/** Every numeric value on a face, read at once so a reading that follows another has it. */
function faceValues(ctx: AppContext, holder: EffectHolder, params: readonly EffectParam[]): Record<string, number> {
  const values: Record<string, number> = {};
  for (const p of params) {
    if (p.kind === "num") values[p.key] = ctx.store.num(`${holder.base}.${p.key}`, p.fallback);
  }
  return values;
}

const numericSpec = (holder: EffectHolder, p: EffectNumeric, values: Record<string, number>): NumericSpec =>
  effectSpec(holder.base, p, values);

/** A caption over the control that sets the value under it. */
function cell(caption: string, control: HTMLElement, knob?: HTMLElement, extraClass = ""): HTMLElement {
  return el("div", {
    class: `efx-cell ${extraClass}`.trim(),
    children: [el("span", { class: "efx-cell-caption", text: caption }), control, ...(knob ? [knob] : [])],
  });
}

/**
 * The options of a list the unit sets out as a row of buttons, the one taken
 * lit. `take` is left out where the row is only read.
 */
function buttonRow(options: readonly string[], value: string, name: string, take?: (v: string) => void): HTMLElement {
  return el("div", {
    class: "efx-buttons",
    attrs: { role: "group", "aria-label": name },
    children: options.map((o) => toggle(o, o === value, () => take?.(o), "efx-button")),
  });
}

/**
 * One page of an effect, four controls to a row and two rows to the page. A page
 * of one row stands in the lower row. The knobs read a row at a time, the lower
 * row first, each value in the division under its own panel; a row with nothing
 * to turn takes no page of the knobs.
 */
function effectGrid(
  ctx: AppContext,
  holder: EffectHolder,
  face: EffectPage,
): { grid: HTMLElement; knobs: (NumericSpec | null)[] } {
  const values = faceValues(ctx, holder, face.params);
  // Where each control's first panel stands, counting a row of buttons as two.
  const { firsts } = face;
  const end = Math.max(0, ...face.params.map((p, i) => (firsts[i] ?? 0) + slotsOf(p)));
  const rowCount = Math.ceil(end / ROW_SLOTS);
  const rowOf = (slot: number): number => Math.floor(slot / ROW_SLOTS) + (rowCount === 1 ? 2 : 1);
  const rowKnobs: (NumericSpec | null)[][] = [0, 1].map(() => Array<NumericSpec | null>(ROW_SLOTS).fill(null));
  const cells = face.params.map((p, i) => {
    const slot = firsts[i] ?? 0;
    const node = paramCell(p, (spec) => {
      const row = rowKnobs[rowOf(slot) - 1];
      if (row) row[slot % ROW_SLOTS] = spec;
    });
    // The upper row's controls on the glass stand lower than their panels would.
    if (rowOf(slot) === 1) node.classList.add("is-upper");
    node.style.gridRow = String(rowOf(slot));
    node.style.gridColumn = slotsOf(p) > 1 ? `${(slot % ROW_SLOTS) + 1} / span ${slotsOf(p)}` : String((slot % ROW_SLOTS) + 1);
    return node;
  });
  return {
    grid: el("div", { class: "efx-params", children: cells }),
    knobs: [rowKnobs[1] ?? [], rowKnobs[0] ?? []].filter((row) => row.some(Boolean)).flat(),
  };

  function paramCell(p: EffectParam, onKnob: (spec: NumericSpec) => void): HTMLElement {
    const caption = p.label;
    if (p.kind === "num") {
      const spec = { ...numericSpec(holder, p, values), label: p.bar ?? caption };
      // The panel prints the number alone; the readout bar keeps the unit, and
      // the name the unit gives the row there.
      onKnob(spec);
      return cell(caption, valueBox(ctx, { ...spec, label: caption, boxUnit: "" }, "efx-value"), knobControl(ctx, spec));
    }
    if (p.kind === "select") {
      const value = ctx.store.str(`${holder.base}.${p.key}`, p.fallback);
      const named = caption || p.name || "";
      const take = (v: string): void => void ctx.store.set(`${holder.base}.${p.key}`, v);
      if (p.buttons) return cell("", buttonRow(p.options, value, named, take), undefined, "has-buttons is-bare");
      const place = [p.foot ? "is-foot" : "", p.bare ? "is-bare" : "", p.division ? "is-division" : ""].filter(Boolean).join(" ");
      const face = p.notes ? Icons.note : undefined;
      // The note values open in a place of their own, five across from the top left.
      const notes = face ? { face, listClass: "efx-note-list", optionClass: "efx-note-option" } : {};
      return cell(caption, pulldown(ctx, value, p.options, take, { label: named, ...notes }), undefined, place);
    }
    const on = ctx.store.bool(`${holder.base}.${p.key}`, p.fallback);
    const flip = (): void => void ctx.store.set(`${holder.base}.${p.key}`, !on);
    // A switch on the glass carries its own name, on the button the row of buttons uses.
    if (p.bare) return cell("", el("div", { class: "efx-buttons", children: [toggle(caption, on, flip, "efx-button")] }), undefined, "is-bare");
    const node = toggle("ON", on, flip, "btn-switch btn-on efx-switch");
    node.setAttribute("aria-label", caption);
    return cell(caption, node);
  }
}

/**
 * The toolbar a screen that sets an effect carries: the channel it is walking,
 * the effect that channel runs, and the block's own switch. The channel arrows
 * reach every strip on the unit, and a strip that runs no effect keeps the
 * toolbar so the walk can be continued.
 */
function effectHeader(
  ctx: AppContext,
  strip: Strip,
  route: Route,
  holder: EffectHolder | null,
): Pick<ScreenBody, "headerLeft" | "headerCenter"> {
  const selector = channelSelector(ctx, strip, route, true);
  if (!holder) return { headerLeft: selector, headerCenter: titleBox("INS FX") };
  const headerLeft = el("div", { class: "param-header", children: [selector, effectButton(ctx, holder)] });
  if (!holder.switches) return { headerLeft, headerCenter: titleBox(holder.title) };
  const on = ctx.store.bool(holder.onPath, holder.onFallback);
  return {
    headerLeft,
    headerCenter: titleBadge(holder.title, "insfx", on, () => {
      if (!holder.switchable) return;
      void ctx.store.set(holder.onPath, !on);
    }),
  };
}

/**
 * The round arrow that steps to the page beside this one. It stands where the
 * SSMCS screens' arrows stand, over the panels at that end of the page.
 */
function pageArrow(ctx: AppContext, dir: "prev" | "next", to: number): HTMLElement {
  return el("button", {
    class: `ssmcs-page ssmcs-page-${dir} efx-page efx-page-${dir}`,
    attrs: { "aria-label": dir === "next" ? "Next page of settings" : "Previous page of settings" },
    onTap: () => void ctx.store.set(PAGE_PATH, to),
    children: [dir === "next" ? Icons.pageOn() : Icons.pageBack()],
  });
}

/** The arrows that step to the page either side of this one, where there is one. */
function pageArrows(ctx: AppContext, at: number, pages: number): HTMLElement[] {
  return [
    ...(at > 0 ? [pageArrow(ctx, "prev", at - 1)] : []),
    ...(at < pages - 1 ? [pageArrow(ctx, "next", at + 1)] : []),
  ];
}

/** The effect the unit sets out on three pages of its own, with a switch in the corner. */
const PITCH = "Pitch Fix";

/** The scale the unit takes a keyboard the operator has touched to. */
const PITCH_CUSTOM = "Custom";

/** How wide the keyboard runs and how wide a black key is, which its CSS also carries. */
const PITCH_KEYS_W = 279;
/** Where the keys start inside the panel that carries them. */
const PITCH_KEYS_INSET = 4;
const PITCH_BLACK_W = 30;

/**
 * The scale Pitch Fix snaps to, drawn on an octave of a keyboard: every note
 * carries a circle with its name, lit where the correction takes it. Touching one
 * turns that note over and takes the Scale to `Custom`, which is the set the
 * operator has made rather than a scale the unit fills in.
 */
function pitchKeyboard(ctx: AppContext, holder: EffectHolder): HTMLElement {
  const white = [0, 2, 4, 5, 7, 9, 11];
  const black = [1, 3, 6, 8, 10];
  // The whole key answers the touch; the circle on it is only the note's face.
  const key = (semitone: number, cls: string, style?: Record<string, string>): HTMLElement => {
    const path = `${holder.base}.${pitchNoteKey(semitone)}`;
    const on = ctx.store.bool(path, true);
    const name = PITCH_NOTE_NAMES[semitone] ?? "";
    const node = el("button", {
      class: cls,
      ...(style ? { style } : {}),
      attrs: { "aria-label": name, "aria-pressed": on ? "true" : "false" },
      onTap: () => {
        void ctx.store.set(path, !on);
        void ctx.store.set(`${holder.base}.scale`, PITCH_CUSTOM);
      },
      children: [el("span", { class: "pitch-note", text: name })],
    });
    return node;
  };
  // A black key stands over the seam between the two white keys it sits between.
  const seam = [0, 1, 3, 4, 5];
  return el("div", {
    class: "pitch-keys",
    children: [
      ...white.map((semitone) => key(semitone, "pitch-key")),
      ...black.map((semitone, i) =>
        key(semitone, "pitch-key-black", {
          left: `${PITCH_KEYS_INSET + (((seam[i] ?? 0) + 1) * PITCH_KEYS_W) / white.length - PITCH_BLACK_W / 2}px`,
        }),
      ),
    ],
  });
}

/**
 * The page the scale is set on: the three lists down its left, the keyboard beside
 * them. Choosing a named scale, or a key while one is named, fills the keyboard in;
 * `Custom` leaves whatever is there.
 */
function pitchNotes(ctx: AppContext, holder: EffectHolder, params: readonly EffectParam[]): HTMLElement {
  const lists = params.filter((p): p is EffectSelect => p.kind === "select");
  const at = (key: string): string =>
    ctx.store.str(`${holder.base}.${key}`, lists.find((p) => p.key === key)?.fallback ?? "");
  const fill = (key: string, scale: string): void => {
    if (!pitchScaleSets(scale)) return;
    const notes = pitchScaleNotes(key, scale);
    for (let semitone = 0; semitone < PITCH_NOTE_NAMES.length; semitone++) {
      void ctx.store.set(`${holder.base}.${pitchNoteKey(semitone)}`, notes.has(semitone));
    }
  };
  const take = (p: EffectSelect, v: string): void => {
    void ctx.store.set(`${holder.base}.${p.key}`, v);
    if (p.key === "scale") fill(at("key"), v);
    if (p.key === "key") fill(v, at("scale"));
  };
  return el("div", {
    class: "pitch-notes",
    children: [
      ...lists.map((p) =>
        el("div", {
          class: "pitch-row",
          children: [
            el("span", { class: "pitch-row-caption", text: p.label }),
            pulldown(ctx, at(p.key), p.options, (v) => take(p, v), { label: p.label }),
          ],
        }),
      ),
      pitchKeyboard(ctx, holder),
    ],
  });
}

/**
 * Pitch Fix: the pitch itself, the scale its correction snaps to, and the note
 * limits, a page each. [Correction] stands in the corner of every page, and a
 * page that carries a name draws it on a strip over the panels it names.
 */
function pitchBody(
  ctx: AppContext,
  strip: Strip,
  holder: EffectHolder,
  pages: readonly EffectPage[],
  at: number,
): { main: HTMLElement; knobs: (NumericSpec | null)[] } {
  const page = pages[at];
  // The page that sets the scale stands nothing in a panel, so it carries the
  // face's own rows instead of the grid's.
  const rows = page?.params.length === 0 ? (effectFaces(holder.name)[at]?.params ?? []) : [];
  const built = page && rows.length === 0 ? effectGrid(ctx, holder, page) : null;
  const corner = effectParams(holder.name).find((p): p is EffectToggle => p.kind === "toggle" && p.corner === true);
  const on = corner ? ctx.store.bool(`${holder.base}.${corner.key}`, corner.fallback) : false;
  return {
    main: el("div", {
      class: "efx-screen pitch-screen",
      children: [
        ...(built ? [built.grid] : []),
        ...(rows.length > 0 ? [pitchNotes(ctx, holder, rows)] : []),
        ...(page?.label ? [el("span", { class: "efx-band", text: page.label })] : []),
        ...(corner
          ? [toggle(corner.label, on, () => void ctx.store.set(`${holder.base}.${corner.key}`, !on), "pitch-corner")]
          : []),
        ...pageArrows(ctx, at, pages.length),
        dynMeters(ctx, strip),
      ],
    }),
    knobs: built?.knobs ?? [],
  };
}

/**
 * The multi-band compressor's own screen, which is both the effect area the INS FX
 * screen draws and the screen that sets it, as a compander's is.
 */
function mbcScreen(ctx: AppContext, strip: Strip, route: Route, holder: EffectHolder): ScreenBody {
  const pages = effectFaces(MBC).length;
  const at = Math.min(Math.max(ctx.store.num(PAGE_PATH, 0), 0), pages - 1);
  const built = mbcBody(ctx, strip, holder, at);
  ctx.setKnobs(built.knobs);
  // The page opens with the value it sets out in a box framed.
  const { boxed } = built;
  if (boxed && !built.knobs.some((k) => ctx.focus.holds(k.focusKey ?? k.path))) ctx.focus.take(boxed);
  return {
    main: el("div", { class: "efx-screen mbc-screen-frame", children: [built.main, ...pageArrows(ctx, at, pages)] }),
    ...effectHeader(ctx, strip, route, holder),
  };
}

/** The parameter settings screen, for whichever effect the channel runs. */
/** What the screen that sets an effect draws, wherever it is reached from. */
function effectScreen(ctx: AppContext, strip: Strip, route: Route, holder: EffectHolder | null): ScreenBody {
  {
    if (holder && COMPANDERS.includes(holder.name)) {
      const built = companderBody(ctx, strip, holder);
      ctx.setKnobs(built.knobs);
      return { main: built.main, ...effectHeader(ctx, strip, route, holder) };
    }
    if (holder && holder.name === MBC) return mbcScreen(ctx, strip, route, holder);
    const pages = holder ? effectPages(effectFaces(holder.name)) : [];
    // A channel with nothing taken has nothing to set, and draws what the INS FX
    // screen draws there: the block's own input and output, and no controls.
    if (!holder || pages.length === 0) {
      ctx.setKnobs([]);
      return {
        main: el("div", { class: "insfx-screen", children: [dynMeters(ctx, strip)] }),
        ...effectHeader(ctx, strip, route, holder),
      };
    }
    const at = pageIndex(ctx, pages);
    const page = pages[at] ?? pages[0];
    if (!page) return noChannel();
    const built =
      holder.name === PITCH ? pitchBody(ctx, strip, holder, pages, at) : effectGrid(ctx, holder, page);
    ctx.setKnobs(built.knobs);
    // A page opens, or is stepped to, with its first knob's value framed.
    const turned = built.knobs.filter((k): k is NumericSpec => k !== null);
    const first = turned[0];
    if (first && !turned.some((k) => ctx.focus.holds(k.focusKey ?? k.path))) ctx.focus.take(first);
    if ("main" in built) return { main: built.main, ...effectHeader(ctx, strip, route, holder) };
    return {
      main: el("div", {
        class: "efx-screen",
        children: [built.grid, ...pageArrows(ctx, at, pages.length), dynMeters(ctx, strip)],
      }),
      ...effectHeader(ctx, strip, route, holder),
    };
  }
}

export const effectSettingsScreen: ScreenDef = {
  id: "ch.effect",
  toolbar: "sub",
  // An effect whose every row the unit is holding itself assigns no knob, and the
  // readout strip stays where it is rather than the controls moving down into it.
  knobStrip: true,
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    return effectScreen(ctx, strip, route, effectHolder(ctx, strip));
  },
};

/**
 * The screen the effect is taken on (user guide, "INS FX screen"): the effect's
 * name, the effect area under it, and the block's own input and output. One
 * screen for both places an effect runs, since a channel runs at most one.
 */
export const insFxScreen: ScreenDef = {
  id: "ch.insfx",
  toolbar: "sub",
  // The screen assigns no knob for an effect whose settings are a screen of their
  // own, and still carries the readout strip, empty.
  knobStrip: true,
  // The screen an effect is taken on is the screen that sets it: the effect area
  // the guide names is the screen itself, ready to turn (URX44V, 2026-09-23).
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    return effectScreen(ctx, strip, route, effectHolder(ctx, strip));
  },
};

