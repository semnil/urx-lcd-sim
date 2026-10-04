// SSMCS — the Sweet Spot Morphing Channel Strip (user guide, "SSMCS (Sweet Spot
// Morphing Channel Strip) screen"). A MONO IN channel whose COMP / EQ type is
// SSMCS runs this strip in place of the compressor and the 4-band EQ, and the
// channel view puts one SSMCS area where the COMP and EQ areas stand.
//
// Four screens, stepped through by the round arrows at the edges of the glass:
//
//   main        Comp Drive, Morphing and the Sweet Spot Data, over the
//               compressor's curve and the EQ's response side by side
//   comp        the compressor: its curve, Knee, Attack and Release
//   side chain  the filter the compressor listens through: Q, Frequency, Gain
//   eq          the three bands, set on the response graph
//
// The compressor's [COMP] switch and the EQ's [EQ] switch are the channel's own,
// the same two the COMP -> EQ type shows; the [SSMCS] switch in the toolbar takes
// the whole strip out.

import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";
import type { Strip } from "../model/types";
import type { ParamPath, ParamValue } from "../device/path";
import { clamp } from "../device/store";
import { SSMCS_DEFAULTS } from "../model/defaults";
import { grBarShare, ssmcsCorner } from "../model/dynamics";
import { type SsmcsBand, ssmcsBand, ssmcsEqResponse } from "../model/channel-eq";
import { el, formatHz, hzUnit, setPressed } from "../ui/dom";
import { Icons } from "../ui/icons";
import type { NumericSpec } from "../ui/param-spec";
import { compRatioSpec, fineGainSpec, freqSpec, round, steps, stopsTravel } from "../ui/param-spec";
import { attachDrag, knobControl, markFocus, meter, pickerGrid, pickerSheet, pulldown, toggle, valueBox } from "../ui/widgets";
import {
  NS,
  block,
  PLOT_MAX,
  PLOT_MIN,
  PLOT_SPAN,
  PLOT_W,
  carriesBlock,
  channelSelector,
  compResponse,
  dynMeters,
  dynSetting,
  hidePlotDrawing,
  noBlock,
  noChannel,
  notAvailable,
  plotCurve,
  plotHandle,
  plotRules,
  plotX,
  plotY,
  routeStrip,
  titleBadge,
} from "./channel";
import { type GrSpec, blockReduction, drawnLevels, markReduction } from "./meters";
import { fxShutOut } from "./effect-params";
import { ssmcsSpec, tapId } from "./signal-flow";
import type { ScreenBody, ScreenDef } from "./types";

/** How far the compressor is driven, in hundredths over its 201 stops. */
const DRIVE_STOPS = steps(201, (i) => round(i / 20, 2));
/** The Sweet Spot Data's own scale: one stop per point between its five settings. */
const MORPHING_STOPS = steps(121, (i) => i);
/** The bell's width, from wide open to its narrowest. */
const Q_STOPS = steps(61, (i) => round(0.5 * 32 ** (i / 60), 2));
/** The R40 series of preferred numbers: forty to a decade, each to three figures. */
const R40 = [
  1, 1.06, 1.12, 1.18, 1.25, 1.32, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2, 2.12, 2.24, 2.36, 2.5, 2.65, 2.8, 3,
  3.15, 3.35, 3.55, 3.75, 4, 4.25, 4.5, 4.75, 5, 5.3, 5.6, 6, 6.3, 6.7, 7.1, 7.5, 8, 8.5, 9, 9.5,
];
/** A fortieth of a decade a stop, about a twelfth of an octave, 20 Hz to 20 kHz, each on the R40 series. */
const FREQ_STOPS = steps(121, (i) => Number(((R40[(i + 12) % 40] ?? 1) * 10 ** (1 + Math.floor((i + 12) / 40))).toPrecision(3)));

/**
 * A table of `count` stops that takes the values `at` names at those stops, and
 * between two of them rises evenly in log. Each value is held to the places
 * `digits` gives it.
 */
function namedStops(count: number, at: readonly (readonly [number, number])[], digits: (v: number) => number): number[] {
  return steps(count, (i) => {
    let k = 0;
    while (k < at.length - 2 && i > (at[k + 1]?.[0] ?? 0)) k++;
    const [i0, v0] = at[k] ?? [0, 1];
    const [i1, v1] = at[k + 1] ?? [count - 1, 1];
    const v = v0 * (v1 / v0) ** ((i - i0) / (i1 - i0));
    return round(v, digits(v));
  });
}

/** Attack in ms at these of its 227 stops. */
const ATTACK_AT = [
  [0, 0.092], [12, 0.131], [24, 0.188], [36, 0.27], [48, 0.387], [60, 0.554], [72, 0.793], [84, 1.137], [96, 1.628],
  [108, 2.333], [113, 2.71], [120, 3.342], [126, 4], [127, 4.122], [132, 4.788], [144, 6.859], [156, 9.826],
  [168, 14.08], [180, 20.17], [192, 28.89], [204, 41.39], [216, 59.29], [226, 80],
] as const;
/** Release in ms at these of its 277 stops. */
const RELEASE_AT = [
  [0, 9.3], [12, 11.4], [24, 14], [36, 17.2], [48, 21.1], [60, 25.8], [72, 31.7], [84, 38.8], [96, 47.5], [108, 58.2],
  [120, 71.3], [132, 87.4], [134, 90.4], [135, 92], [136, 93.5], [144, 107.1], [156, 131.2], [168, 160.7], [180, 196.9],
  [192, 241.2], [204, 295.5], [216, 362.1], [228, 443.5], [240, 543.4], [252, 665.6], [264, 815.4], [276, 999],
] as const;
/** Attack's three places under 10 ms and two from there. */
const attackPlaces = (ms: number): number => (ms < 10 ? 3 : 2);
const ATTACK_STOPS = namedStops(227, ATTACK_AT, attackPlaces);
const RELEASE_STOPS = namedStops(277, RELEASE_AT, () => 1);

/** The three bands, in the order the graph lays them out. */
export const SSMCS_BANDS = [
  { key: "low", label: "Low", letter: "L", marks: "across" },
  { key: "mid", label: "Mid", letter: "M", marks: "updown" },
  { key: "high", label: "High", letter: "H", marks: "updown" },
] as const;

/** LOW stops at 1 kHz and HIGH starts at 500 Hz; MID takes the whole range. */
const BAND_FREQ_RANGE: Record<string, readonly [number, number]> = {
  low: [20, 1000],
  mid: [20, 20000],
  high: [500, 20000],
};

/** The list the [Sweet Spot Data] button drops. */
export const SWEET_SPOT_DATA = [
  "01 Basic",
  "02 Color",
  "03 Tone",
  "04 Sweep - Boost",
  "05 Sweep - Cut",
  "06 Lo Cut",
  "01 AK Bass",
  "02 AK Drums",
  "03 AK Master",
  "04 MZ A.Guitar",
  "05 MZ Kick",
  "06 MZ Snare",
  "07 MZ Master",
  "08 MR Vocal",
  "09 MR Drums",
  "10 MR Master",
  "11 SH Piano",
  "12 SH Drums",
  "13 SH Master",
  "14 OK Master - Vocal",
  "15 OK Master - Bass",
  "16 OK Master - Vigour",
  "17 OK Master - TV",
  "18 IO Vocal",
  "19 IO A.Guitar",
  "20 IO Drums",
  "21 TK Notch - Resonation",
  "22 TK Programmed Kick",
  "23 TK Pumping",
  "24 ZK Vocal",
  "25 ZK Bass",
  "26 ZK Drums",
  "27 ZK Master",
  "28 ZK Filter",
];

/** The knee settings, as the compressor's own screen offers them. */
const KNEES = ["Soft", "Medium", "Hard"];

const spec = (base: Omit<NumericSpec, "format">, format: NumericSpec["format"]): NumericSpec => ({ ...base, format });

const driveSpec = (b: string): NumericSpec =>
  spec(
    {
      path: `${b}.ssmcs.compDrive`,
      label: "Comp Drive",
      min: 0,
      max: 10,
      step: 0.05,
      fallback: SSMCS_DEFAULTS.compDrive,
      travel: stopsTravel(DRIVE_STOPS),
    },
    (v) => v.toFixed(2),
  );

const morphingSpec = (b: string): NumericSpec =>
  spec(
    {
      path: `${b}.ssmcs.morphing`,
      label: "Morphing",
      min: 0,
      max: 120,
      step: 1,
      fallback: SSMCS_DEFAULTS.morphing,
      travel: stopsTravel(MORPHING_STOPS),
    },
    (v) => String(Math.round(v)),
  );

/** Every gain the strip sets — a band's, the side chain's and the strip's own output. */
const gainSpec = (path: string, label: string, fallback: number): NumericSpec => fineGainSpec(path, label, -18, 18, fallback);

const qSpec = (path: string, label: string, fallback: number): NumericSpec =>
  spec(
    { path, label, min: 0.5, max: 16, step: 0.01, fallback, travel: stopsTravel(Q_STOPS) },
    (v) => v.toFixed(2),
  );

/**
 * A frequency the strip sets, running from the first stop in `range` to the
 * last. A value off the stops reads as the stop it turns from.
 */
const hzSpec = (path: string, label: string, fallback: number, range: readonly [number, number] = [20, 20000]): NumericSpec => {
  const stops = FREQ_STOPS.filter((hz) => hz >= range[0] && hz <= range[1]);
  const travel = stopsTravel(stops);
  const shown = (hz: number): number => travel.step(hz, 0);
  return {
    ...freqSpec(path, label, stops[0] ?? range[0], stops[stops.length - 1] ?? range[1], fallback),
    travel,
    format: (hz) => formatHz(shown(hz)),
    unit: (hz) => hzUnit(shown(hz)),
  };
};

/**
 * A time the strip sets, read to the places `places` gives it. A value off the
 * stops reads as the stop it turns from.
 */
const timeSpec = (path: string, label: string, stops: readonly number[], fallback: number, places: (ms: number) => number): NumericSpec => {
  const travel = stopsTravel(stops);
  return spec(
    {
      path,
      label,
      min: stops[0] ?? 0,
      max: stops[stops.length - 1] ?? 0,
      step: 0.001,
      fallback,
      travel,
      unit: "ms",
      boxUnit: "m",
    },
    (v) => {
      const ms = travel.step(v, 0);
      return ms.toFixed(places(ms));
    },
  );
};

const ratioSpec = (b: string): NumericSpec => compRatioSpec(`${b}.ssmcs.comp.ratio`, SSMCS_DEFAULTS.ratio, true);

const outGainSpec = (b: string): NumericSpec => gainSpec(`${b}.ssmcs.outGain`, "Out Gain", SSMCS_DEFAULTS.outGain);
const attackSpec = (b: string): NumericSpec => timeSpec(`${b}.ssmcs.comp.attack`, "Attack", ATTACK_STOPS, SSMCS_DEFAULTS.attack, attackPlaces);
const releaseSpec = (b: string): NumericSpec => timeSpec(`${b}.ssmcs.comp.release`, "Release", RELEASE_STOPS, SSMCS_DEFAULTS.release, () => 1);
const scQSpec = (b: string): NumericSpec => qSpec(`${b}.ssmcs.sc.q`, "SC-Q", SSMCS_DEFAULTS.sc.q);
const scFreqSpec = (b: string): NumericSpec => hzSpec(`${b}.ssmcs.sc.freq`, "SC-Freq.", SSMCS_DEFAULTS.sc.freq);
const scGainSpec = (b: string): NumericSpec => gainSpec(`${b}.ssmcs.sc.gain`, "SC-Gain", SSMCS_DEFAULTS.sc.gain);

/**
 * One band's three values, named as the readout bar names them. LOW and HIGH are
 * shelves with no Q, and leave the Q's place empty.
 */
function bandSpecs(b: string, band: (typeof SSMCS_BANDS)[number]): (NumericSpec | null)[] {
  const p = `${b}.ssmcs.eq.${band.key}`;
  const factory = SSMCS_DEFAULTS.eq[band.key];
  const range = BAND_FREQ_RANGE[band.key] ?? [20, 20000];
  return [
    band.key === "mid" ? qSpec(`${p}.q`, `${band.label} Q`, SSMCS_DEFAULTS.eq.mid.q) : null,
    hzSpec(`${p}.freq`, `${band.label} Freq.`, factory.freq, range),
    gainSpec(`${p}.gain`, `${band.label} Gain`, factory.gain),
  ];
}

/** A strip's frequencies, Attack and Release, each turned through its own stops. */
const stoppedSpecs = (b: string): NumericSpec[] => [
  scFreqSpec(b),
  ...SSMCS_BANDS.flatMap((band) => bandSpecs(b, band)[1] ?? []),
  attackSpec(b),
  releaseSpec(b),
];

/**
 * A saved state as it is put back, with each SSMCS frequency, Attack and Release
 * on the stop nearest the value it holds. A value off the stops comes back on
 * one, and the next save holds that stop.
 */
export function onSsmcsStops(state: Record<ParamPath, ParamValue>): Record<ParamPath, ParamValue> {
  const out = { ...state };
  for (const [path, value] of Object.entries(state)) {
    const at = path.indexOf(".ssmcs.");
    if (at < 0 || typeof value !== "number") continue;
    const travel = stoppedSpecs(path.slice(0, at)).find((s) => s.path === path)?.travel;
    if (travel) out[path] = travel.step(value, 0);
  }
  return out;
}

// ---------------------------------------------------------------- the curves

/** Where the compressor's corner sits, in dB, for a Comp Drive setting. */
const corner = ssmcsCorner;

/**
 * How far the knee reaches over the corner and under it, in dB of input, by knee
 * setting. The two are not the same, so the pair cannot be collapsed to a width.
 */
const KNEE_REACH: Record<string, readonly [number, number]> = {
  Soft: [26.3, 24.3],
  Medium: [10.0, 8.5],
  Hard: [0, 0],
};

/**
 * The compressor's output for an input level, as the two screens that draw it
 * read it. The strip makes up no gain of its own: under the corner the curve
 * runs at unity, and Out Gain is the only thing that lifts it.
 */
function transfer(ctx: AppContext, b: string): (db: number) => number {
  const drive = ctx.store.num(`${b}.ssmcs.compDrive`, SSMCS_DEFAULTS.compDrive);
  const thr = corner(drive);
  const ratio = ctx.store.num(`${b}.ssmcs.comp.ratio`, SSMCS_DEFAULTS.ratio);
  const knee = KNEE_REACH[ctx.store.str(`${b}.ssmcs.comp.knee`, SSMCS_DEFAULTS.knee)] ?? KNEE_REACH.Medium ?? [0, 0];
  const gain = ctx.store.num(`${b}.ssmcs.outGain`, SSMCS_DEFAULTS.outGain);
  // A drive of nothing compresses nothing; Out Gain still lifts it.
  const curve = compResponse(thr, Number.isFinite(ratio) ? ratio : 1000, knee, gain);
  return (db) => (drive === 0 ? db + gain : curve(db));
}

const bandState = (ctx: AppContext, b: string, band: (typeof SSMCS_BANDS)[number]): SsmcsBand => ssmcsBand(ctx.store, b, band.key);

/** The three bands summed: LOW and HIGH are shelves, MID a bell. A band that is off adds nothing. */
const eqResponse = (ctx: AppContext, b: string): ((hz: number) => number) => ssmcsEqResponse(ctx.store, b);

// ---------------------------------------------------------------- the pieces the screens share

/** The EQ plot's own frame: log frequency across, gain up the middle. */
const EQ_HZ_MIN = 20;
const EQ_HZ_MAX = 20000;
const EQ_GAIN_MAX = 20;

const eqPoints = (w: number, h: number, at: (hz: number) => number, count = 96): string[] =>
  Array.from({ length: count + 1 }, (_, i) => {
    const hz = EQ_HZ_MIN * (EQ_HZ_MAX / EQ_HZ_MIN) ** (i / count);
    const x = (Math.log10(hz / EQ_HZ_MIN) / Math.log10(EQ_HZ_MAX / EQ_HZ_MIN)) * w;
    const y = h / 2 - (at(hz) / (EQ_GAIN_MAX * 2)) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

const eqPlotX = (hz: number, w: number): number => (Math.log10(hz / EQ_HZ_MIN) / Math.log10(EQ_HZ_MAX / EQ_HZ_MIN)) * w;
const eqPlotY = (db: number, h: number): number => h / 2 - (db / (EQ_GAIN_MAX * 2)) * h;

/** An svg with the unit's rules across it and a curve over them. */
function curvePlot(w: number, h: number, cls: string, verticals: number[], horizontals: number[], points: string[], fill: boolean): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  // A rule is one pixel wide, so it is laid down the middle of a whole column or
  // row: the nearest one across, the one it starts in down.
  const col = (v: number): number => Math.round(v) + 0.5;
  const row = (v: number): number => Math.floor(v) + 0.5;
  for (const [x1, y1, x2, y2] of [
    ...verticals.map((x) => [col(x), 0, col(x), h] as const),
    ...horizontals.map((y) => [0, row(y), w, row(y)] as const),
  ]) {
    const rule = document.createElementNS(NS, "line");
    rule.setAttribute("x1", x1.toFixed(1));
    rule.setAttribute("y1", y1.toFixed(1));
    rule.setAttribute("x2", x2.toFixed(1));
    rule.setAttribute("y2", y2.toFixed(1));
    rule.setAttribute("class", "dyn-grid");
    svg.appendChild(rule);
  }
  if (fill) {
    const area = document.createElementNS(NS, "polygon");
    area.setAttribute("points", `0,${h / 2} ${points.join(" ")} ${w},${h / 2}`);
    area.setAttribute("class", "eq-curve-fill");
    svg.appendChild(area);
  }
  const line = document.createElementNS(NS, "polyline");
  line.setAttribute("points", points.join(" "));
  line.setAttribute("class", "eq-curve-line");
  svg.appendChild(line);
  return svg;
}

/** How wide and tall the two curves are drawn on the main screen. */
const COMP_THUMB_W = 81;
const COMP_THUMB_H = 73;
const EQ_THUMB_W = 159;
const EQ_THUMB_H = 75;

/** The compressor's curve on the screens that set it: shorter than the frame the
 *  COMP -> EQ type's own screen draws it in. */
const STRIP_PLOT_H = 130;

/** The compressor's transfer curve, on its own rules, at the size asked for. */
function compPlot(at: (db: number) => number, w: number, h: number): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("class", "dyn-curve");
  svg.setAttribute("aria-hidden", "true");
  plotRules(svg, [0.8], [0.2], w, h);
  plotCurve(
    svg,
    Array.from({ length: PLOT_SPAN + 1 }, (_, i) => PLOT_MIN + i).map((db) => [plotX(db, w), plotY(at(db), h)] as const),
    w,
    h,
  );
  return svg;
}

/**
 * The two curves the strip sets: the compressor's transfer curve and the EQ's
 * response. The main screen stands them on its two blocks and the channel view
 * beside each other, at the same proportions and on the same rules.
 */
function stripThumbs(ctx: AppContext, b: string): [SVGSVGElement, SVGSVGElement] {
  const comp = compPlot(transfer(ctx, b), COMP_THUMB_W, COMP_THUMB_H);
  const eq = curvePlot(
    EQ_THUMB_W,
    EQ_THUMB_H,
    "ssmcs-eq-curve",
    [100, 1000, 10000].map((hz) => eqPlotX(hz, EQ_THUMB_W)),
    [10, 0, -10].map((db) => eqPlotY(db, EQ_THUMB_H)),
    eqPoints(EQ_THUMB_W, EQ_THUMB_H, eqResponse(ctx, b)),
    false,
  );
  return [comp, eq];
}

/**
 * The round arrow that steps to the screen beside this one. The screen it steps
 * to is written out where the arrow is placed, so the registry's reachability
 * check reads it.
 */
function pageArrow(dir: "prev" | "next", onTap: () => void): HTMLElement {
  return el("button", {
    class: `ssmcs-page ssmcs-page-${dir}`,
    attrs: { "aria-label": dir === "next" ? "Next SSMCS screen" : "Previous SSMCS screen" },
    onTap,
    children: [dir === "next" ? Icons.pageOn() : Icons.pageBack()],
  });
}

/**
 * The signal the compressor listens to, metered beside its curve: what goes into
 * the strip through the side chain's bell, and its floor unless the compressor,
 * the morphing strip and the side chain are all on.
 */
function sideChainMeter(ctx: AppContext, strip: Parameters<typeof dynMeters>[1]): HTMLElement {
  const source = tapId(strip.id, "sideChain");
  return el("div", {
    class: "ssmcs-sc-meter",
    children: [meter({ levels: drawnLevels(ctx.store, source, 1), source })],
  });
}

/** The reduction meter, marked so the ticker keeps it moving. */
function reductionMeter(ctx: AppContext, spec: GrSpec): HTMLElement {
  const share = grBarShare(blockReduction(ctx.store, spec));
  const node = el("div", { class: "dyn-gr ssmcs-gr", children: [el("i", { style: { height: `${share * 100}%` } })] });
  markReduction(node, spec);
  return node;
}

/**
 * The switch a block carries at the top left of a screen that sets it: the small
 * one the channel view puts on its blocks where the strip shows both at once,
 * the screen's own title box where it shows one.
 */
function blockSwitch(ctx: AppContext, label: string, kind: string, path: string, small = false): HTMLElement {
  const on = ctx.store.bool(path, false);
  const node = el("button", {
    class: `badge badge-${kind} ${small ? "badge-switch" : "badge-title"} ssmcs-block-switch`,
    text: label,
    onTap: () => void ctx.store.set(path, !on),
  });
  setPressed(node, on);
  return node;
}

/** A switch the strip lights in its own colour: the side chain's and the band's. */
function litSwitch(label: string, cls: string, on: boolean, onTap: () => void, ariaLabel?: string): HTMLElement {
  const node = el("button", {
    class: `badge badge-ssmcs badge-title ${cls}`,
    text: label,
    ...(ariaLabel ? { attrs: { "aria-label": ariaLabel } } : {}),
    onTap,
  });
  setPressed(node, on);
  return node;
}

/** The toolbar's own switch: the strip itself, on or off. */
function ssmcsTitle(ctx: AppContext, b: string): HTMLElement {
  const on = ctx.store.bool(`${b}.ssmcs.on`, SSMCS_DEFAULTS.on);
  return titleBadge("SSMCS", "ssmcs", on, () => void ctx.store.set(`${b}.ssmcs.on`, !on));
}

/** The sheet the [Sweet Spot Data] button drops: the settings the Morphing knob moves between. */
function sweetSpotSheet(ctx: AppContext, b: string): HTMLElement {
  const path = `${b}.ssmcs.data`;
  const current = ctx.store.str(path, SSMCS_DEFAULTS.data);
  const rows: (HTMLElement | null)[][] = [];
  for (let i = 0; i < SWEET_SPOT_DATA.length; i += 2) {
    const row = SWEET_SPOT_DATA.slice(i, i + 2).map((name) =>
      toggle(name, name === current, () => {
        void ctx.store.set(path, name);
        close();
        ctx.repaint();
      }, "source-btn ssmcs-data-option"),
    );
    rows.push([...row, ...Array<null>(2 - row.length).fill(null)]);
  }
  let close = (): void => undefined;
  const sheet = pickerSheet(ctx, {
    title: "Sweet Spot Data",
    label: "Sweet Spot Data",
    sheetClass: "source-sheet ssmcs-data-sheet",
    scroll: { track: 150, unit: 44 },
    build: (shut) => {
      close = shut;
      return pickerGrid(rows);
    },
  });
  return sheet;
}

/**
 * What the channel view shows in place of the COMP and EQ areas while the
 * channel's COMP / EQ type is SSMCS: the strip's own switch over the two curves
 * it sets, and a touch anywhere else opens the SSMCS screen.
 */
export function ssmcsArea(ctx: AppContext, strip: Strip): HTMLElement {
  const b = `ch.${strip.id}`;
  const [comp, eq] = stripThumbs(ctx, b);
  return block(
    ctx,
    "SSMCS",
    "ssmcs",
    `${b}.ssmcs.on`,
    SSMCS_DEFAULTS.on,
    el("div", {
      class: "cv-block-body cv-ssmcs",
      children: [
        el("div", { class: "cv-ssmcs-comp", children: [comp as unknown as HTMLElement] }),
        el("div", { class: "cv-ssmcs-eq", children: [eq as unknown as HTMLElement] }),
      ],
    }),
    () => ctx.nav.push({ id: "ch.ssmcs", strip: strip.id }),
  );
}

// ---------------------------------------------------------------- the screens

export const ssmcsScreen: ScreenDef = {
  id: "ch.ssmcs",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    if (fxShutOut(ctx, strip)) return notAvailable(ctx, strip, route);
    if (!carriesBlock(ctx, strip, "SSMCS")) return noBlock(ctx, strip, route, "SSMCS");
    const b = `ch.${strip.id}`;
    const drive = driveSpec(b);
    const morphing = morphingSpec(b);
    const outGain = outGainSpec(b);
    ctx.setKnobs([drive, morphing, null, outGain]);
    const data = ctx.store.str(`${b}.ssmcs.data`, SSMCS_DEFAULTS.data);

    const [compThumb, eqThumb] = stripThumbs(ctx, b);

    const knobPanel = (cls: string, caption: string, value: NumericSpec, extra: HTMLElement[] = []): HTMLElement =>
      el("div", {
        class: `ssmcs-knob-panel ${cls}`,
        children: [
          el("span", { class: "ssmcs-caption", text: caption }),
          valueBox(ctx, value),
          knobControl(ctx, value, 38),
          ...extra,
        ],
      });

    return {
      main: el("div", {
        class: "ssmcs-screen",
        children: [
          el("div", {
            class: "ssmcs-block ssmcs-block-comp",
            children: [
              blockSwitch(ctx, "COMP", "comp", `${b}.comp.on`, true),
              el("div", { class: "ssmcs-thumb ssmcs-comp-thumb", children: [compThumb as unknown as HTMLElement] }),
              reductionMeter(ctx, ssmcsSpec(ctx, strip)),
            ],
          }),
          el("div", {
            class: "ssmcs-block ssmcs-block-eq",
            children: [
              blockSwitch(ctx, "EQ", "eq", `${b}.eq.on`, true),
              el("div", { class: "ssmcs-thumb ssmcs-eq-thumb", children: [eqThumb as unknown as HTMLElement] }),
            ],
          }),
          knobPanel("ssmcs-drive", "Comp Drive", drive),
          knobPanel("ssmcs-morphing", "Morphing", morphing, [
            el("button", {
              class: "ssmcs-data",
              onTap: () => void sweetSpotSheet(ctx, b),
              children: [el("span", { text: data }), el("span", { class: "ssmcs-data-mark", children: [Icons.copy()] })],
            }),
          ]),
          pageArrow("next", () => ctx.nav.replace({ id: "ch.ssmcs.comp", strip: strip.id })),
          dynMeters(ctx, strip, "ssmcs"),
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: ssmcsTitle(ctx, b),
    };
  },
};

/** The compressor's own screen, and the side chain's: one frame, two faces. */
function compFace(ctx: AppContext, route: Route, sideChain: boolean): ScreenBody {
  const strip = routeStrip(ctx, route);
  if (!strip) return noChannel();
  if (fxShutOut(ctx, strip)) return notAvailable(ctx, strip, route);
  if (!carriesBlock(ctx, strip, "SSMCS")) return noBlock(ctx, strip, route, "SSMCS");
  const b = `ch.${strip.id}`;
  const drive = driveSpec(b);
  const ratio = ratioSpec(b);
  const attack = attackSpec(b);
  const release = releaseSpec(b);
  const scQ = scQSpec(b);
  const scFreq = scFreqSpec(b);
  const scGain = scGainSpec(b);
  ctx.setKnobs(sideChain ? [null, scQ, scFreq, scGain] : [drive, ratio, attack, release]);

  const at = transfer(ctx, b);
  const scOn = ctx.store.bool(`${b}.ssmcs.sc.on`, SSMCS_DEFAULTS.sc.on);
  // Both screens draw the compressor's curve; only its own screen puts the two
  // handles on it.
  const svg = compPlot(at, PLOT_W, STRIP_PLOT_H);
  if (!sideChain) {
    const driveDb = clamp(corner(ctx.store.num(drive.path, drive.fallback)), PLOT_MIN, PLOT_MAX);
    // More drive takes the corner D stands on to the left, and a higher ratio
    // takes the far end R stands on down.
    plotHandle(ctx, svg, "D", plotX(driveDb), plotY(at(driveDb), STRIP_PLOT_H), "x", { spec: drive, sense: -1 });
    plotHandle(ctx, svg, "R", PLOT_W - 14.5, plotY(at(PLOT_MAX - 5), STRIP_PLOT_H), "y", { spec: ratio, sense: -1 });
  }
  hidePlotDrawing(svg);
  const plot = el("div", { class: "dyn-plot", children: [svg as unknown as HTMLElement] });

  return {
    main: el("div", {
      class: `ssmcs-dyn${sideChain ? " ssmcs-dyn-sc" : ""}`,
      children: [
        blockSwitch(ctx, "Comp", "comp", `${b}.comp.on`),
        sideChainMeter(ctx, strip),
        plot,
        reductionMeter(ctx, ssmcsSpec(ctx, strip)),
        ...(sideChain
          ? [
              litSwitch("Side Chain", "ssmcs-sc-switch", scOn, () => void ctx.store.set(`${b}.ssmcs.sc.on`, !scOn)),
              // The rows name the three shortly; the readout bar carries the SC- names.
              el("div", {
                class: "dyn-sets ssmcs-sets",
                children: [
                  dynSetting(ctx, scQ, "Q"),
                  dynSetting(ctx, scFreq, "Frequency"),
                  dynSetting(ctx, scGain, "Gain"),
                ],
              }),
            ]
          : [
              el("div", {
                class: "dyn-row dyn-row-knee ssmcs-knee",
                children: [
                  el("span", { class: "dyn-caption", text: "Knee" }),
                  pulldown(ctx, ctx.store.str(`${b}.ssmcs.comp.knee`, SSMCS_DEFAULTS.knee), KNEES, (v) => void ctx.store.set(`${b}.ssmcs.comp.knee`, v), { label: "Knee" }),
                ],
              }),
              el("div", { class: "dyn-sets ssmcs-sets", children: [attack, release].map((s) => dynSetting(ctx, s)) }),
            ]),
        sideChain
          ? pageArrow("prev", () => ctx.nav.replace({ id: "ch.ssmcs.comp", strip: strip.id }))
          : pageArrow("prev", () => ctx.nav.replace({ id: "ch.ssmcs", strip: strip.id })),
        sideChain
          ? pageArrow("next", () => ctx.nav.replace({ id: "ch.ssmcs.eq", strip: strip.id }))
          : pageArrow("next", () => ctx.nav.replace({ id: "ch.ssmcs.sc", strip: strip.id })),
        dynMeters(ctx, strip, "ssmcs"),
      ],
    }),
    headerLeft: channelSelector(ctx, strip, route, true),
    headerCenter: ssmcsTitle(ctx, `ch.${strip.id}`),
  };
}

export const ssmcsCompScreen: ScreenDef = {
  id: "ch.ssmcs.comp",
  toolbar: "sub",
  build: (ctx, route) => compFace(ctx, route, false),
};

export const ssmcsSideChainScreen: ScreenDef = {
  id: "ch.ssmcs.sc",
  toolbar: "sub",
  build: (ctx, route) => compFace(ctx, route, true),
};

export const ssmcsEqScreen: ScreenDef = {
  id: "ch.ssmcs.eq",
  toolbar: "sub",
  build(ctx, route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    if (fxShutOut(ctx, strip)) return notAvailable(ctx, strip, route);
    if (!carriesBlock(ctx, strip, "SSMCS")) return noBlock(ctx, strip, route, "SSMCS");
    const b = `ch.${strip.id}`;
    const bandKey = ctx.store.str("ui.ssmcsBand", "mid");
    const band = SSMCS_BANDS.find((x) => x.key === bandKey) ?? SSMCS_BANDS[1];
    const specs = bandSpecs(b, band);
    ctx.setKnobs([specs[0] ?? null, specs[1] ?? null, specs[2] ?? null, outGainSpec(b)]);
    // The screen opens holding the band picked last, on any channel.
    if (ctx.focus.idle) ctx.focus.takeKey(`${b}.ssmcs.eq.${band.key}.grip`);

    const W = 414;
    const H = 136;
    const response = eqResponse(ctx, b);
    const svg = curvePlot(
      W,
      H,
      "eq-curve",
      [100, 1000, 10000].map((hz) => eqPlotX(hz, W)),
      [10, 0, -10].map((db) => eqPlotY(db, H)),
      eqPoints(W, H, response),
      true,
    );
    const plot = el("div", { class: "eq-plot", children: [svg as unknown as HTMLElement] });
    for (const one of SSMCS_BANDS) {
      const s = bandState(ctx, b, one);
      const key = `${b}.ssmcs.eq.${one.key}.grip`;
      const hold = (): void => {
        ctx.focus.takeKey(key);
        void ctx.store.set("ui.ssmcsBand", one.key);
      };
      const grip = el("button", {
        class: `eq-grip${one.marks === "updown" ? " is-updown" : ""}${s.on ? "" : " is-off"}`,
        text: one.letter,
        style: { left: `${eqPlotX(s.freq, W).toFixed(1)}px`, top: `${eqPlotY(s.gain, H).toFixed(1)}px` },
        attrs: { "aria-label": `${one.label} band` },
        onTap: hold,
      });
      // Dragging a grip sets its band: the frequency along the graph, the gain up it.
      const [, freq, gain] = bandSpecs(b, one);
      if (freq) attachDrag(ctx, grip, freq, hold, { axis: "x" });
      if (gain) attachDrag(ctx, grip, gain, hold, { axis: "y" });
      markFocus(ctx, grip, key, "is-held");
      plot.appendChild(grip);
    }

    const bandOn = ctx.store.bool(`${b}.ssmcs.eq.${band.key}.on`, true);
    return {
      main: el("div", {
        class: "ssmcs-eq-screen",
        children: [
          blockSwitch(ctx, "EQ", "eq", `${b}.eq.on`),
          litSwitch(band.label, "ssmcs-band", bandOn, () => void ctx.store.set(`${b}.ssmcs.eq.${band.key}.on`, !bandOn), `${band.label} band on`),
          plot,
          pageArrow("prev", () => ctx.nav.replace({ id: "ch.ssmcs.sc", strip: strip.id })),
          dynMeters(ctx, strip, "ssmcs"),
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: ssmcsTitle(ctx, b),
    };
  },
};

export const ssmcsScreens: ScreenDef[] = [ssmcsScreen, ssmcsCompScreen, ssmcsSideChainScreen, ssmcsEqScreen];
