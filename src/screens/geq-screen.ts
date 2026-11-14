// The GEQ screen (user guide, "GEQ screen"): Flex12GEQ on one side of the
// stereo bus or a MIX bus, the side the channel selector stands on.
//
//   - the toolbar carries [GEQ Link] and the side's [GEQ] switch;
//   - the GEQ graph across the top draws the side's response over all 31 bands,
//     a dot on each band and a window over the bands the sliders show; a touch
//     on it brings the sliders to the bands under the touch;
//   - the sliders show four bands at a time (three on the last page), and a
//     swipe across them steps to the next or previous four;
//   - Available counts the bands that may still be moved away from 0 dB, and
//     the IN and OUT meters read the GEQ's own input and output;
//   - the readout bar carries the gains of the bands the sliders show.
//
// At most twelve bands of a side stand away from 0 dB; with twelve away, a band
// at 0 dB does not move.

import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";
import type { Strip } from "../model/types";
import {
  GEQ_BANDS,
  GEQ_LIMIT_SHIPPED,
  GEQ_MAX_ACTIVE,
  GEQ_PAGES,
  GEQ_PAGE_SIZE,
  GEQ_STEP_DB,
  carriesGeq,
  geqActive,
  geqBandPath,
  geqLimitRange,
  geqLinkPath,
  geqOnPath,
  geqOverRate,
  geqPageBands,
  geqResponse,
  type GeqLimit,
  type GeqSide,
} from "../model/geq";
import { drawnScale, el, writing } from "../ui/dom";
import { Icons } from "../ui/icons";
import { dbSpec, type NumericSpec } from "../ui/param-spec";
import { PointerHolds, attachSpin, markFocus, setAriaValue } from "../ui/widgets";
import { NS, channelSelector, dynMeters, noBlock, noChannel, routeStrip, titleBadge } from "./channel";
import { geqLimitOf, geqSide, runsGeq } from "./geq";
import type { ScreenBody, ScreenDef } from "./types";

/** Where the screen keeps the page of sliders shown, on every bus. */
const PAGE_PATH = "ui.geqPage";

/** The page of sliders the screen shows. */
export function geqPageOf(ctx: Pick<AppContext, "store">): number {
  return Math.min(GEQ_PAGES - 1, Math.max(0, Math.trunc(ctx.store.num(PAGE_PATH, 0))));
}

/** Bring the sliders to `page`, held inside the pages there are. */
export function setGeqPage(ctx: Pick<AppContext, "store">, page: number): void {
  const to = Math.min(GEQ_PAGES - 1, Math.max(0, page));
  if (to !== geqPageOf(ctx)) void ctx.store.set(PAGE_PATH, to);
}

/** A side's 31 band gains, in dB. */
export function geqGains(ctx: Pick<AppContext, "store">, strip: Strip, side: GeqSide): number[] {
  return GEQ_BANDS.map((_, band) => ctx.store.num(geqBandPath(`ch.${strip.id}`, side, band), 0));
}

/** Whether a band stands at 0 dB while twelve others stand away from it, and so cannot move. */
export function geqBandShut(ctx: Pick<AppContext, "store">, strip: Strip, side: GeqSide, band: number): boolean {
  const gains = geqGains(ctx, strip, side);
  return gains[band] === 0 && geqActive(gains) >= GEQ_MAX_ACTIVE;
}

/**
 * A band's gain, as its slider and its readout cell turn it: in 0.5 dB steps
 * inside the side's GEQ Limit. A band that cannot move has nowhere to go.
 */
export function geqBandSpec(ctx: Pick<AppContext, "store" | "model">, strip: Strip, side: GeqSide, band: number): NumericSpec {
  const path = geqBandPath(`ch.${strip.id}`, side, band);
  const [lo, hi] = geqLimitRange(geqLimitOf(ctx, strip, side));
  const shut = geqBandShut(ctx, strip, side, band);
  return { ...dbSpec(path, "Gain", shut ? 0 : lo, shut ? 0 : hi, 0, GEQ_STEP_DB, 1) };
}

// --- The GEQ graph ---------------------------------------------------------

/** The graph's box on the glass. */
const OV_W = 420;
const OV_H = 40;
/** Where the band region starts and how wide each page of it is. */
const OV_LEFT = 11;
const OV_PAGE_W = 49.75;
/** Where each band's dot stands across, and how far apart the dots are. */
const OV_DOT_X0 = 16.4;
const OV_DOT_DX = 12.46;
/** The 0 dB line, and how far a decibel moves a dot. */
const OV_ZERO = 20;
const OV_PX_PER_DB = 14 / 15;

const ovRule = (k: number): number => Math.floor(OV_LEFT + OV_PAGE_W * k);
const ovDotX = (band: number): number => Math.round(OV_DOT_X0 + OV_DOT_DX * band) + 0.5;
/**
 * Where a gain stands on the graph, held inside its frame: the guide draws the
 * ±15dB scale alone, and a cut past -20 dB at -24dB stops at the frame's foot.
 */
const ovY = (db: number): number => Math.min(OV_H - 2.5, Math.max(2.5, OV_ZERO + 0.5 - db * OV_PX_PER_DB));

function svgNode(tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** The response over every band, a dot on each, and the window over the page the sliders show. */
function geqGraph(ctx: AppContext, gains: readonly number[], page: number, held: number | null): HTMLElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${OV_W} ${OV_H}`);
  svg.setAttribute("aria-hidden", "true");
  svg.append(svgNode("rect", { class: "geq-frame", x: 0.5, y: 0.5, width: OV_W - 1, height: OV_H - 1, rx: 2 }));
  for (let k = 0; k <= GEQ_PAGES; k++) {
    const x = ovRule(k) + 0.5;
    svg.append(svgNode("line", { class: "geq-rule", x1: x, y1: 1, x2: x, y2: OV_H - 1 }));
  }
  svg.append(svgNode("line", { class: "geq-zero", x1: OV_LEFT, y1: OV_ZERO + 0.5, x2: ovRule(GEQ_PAGES), y2: OV_ZERO + 0.5 }));
  // The curve runs from the first band's dot to the last's, one point a pixel.
  const at = geqResponse(gains);
  const first = OV_DOT_X0;
  const last = OV_DOT_X0 + OV_DOT_DX * (GEQ_BANDS.length - 1);
  const points: string[] = [];
  for (let x = first; x <= last + 0.01; x += 1) {
    const hz = 20 * 2 ** ((x - OV_DOT_X0) / OV_DOT_DX / 3);
    points.push(`${x.toFixed(1)},${ovY(at(hz)).toFixed(2)}`);
  }
  const zero = (OV_ZERO + 0.5).toFixed(1);
  svg.append(
    svgNode("polygon", { class: "geq-fill", points: `${first.toFixed(1)},${zero} ${points.join(" ")} ${last.toFixed(1)},${zero}` }),
    svgNode("polyline", { class: "geq-curve", points: points.join(" ") }),
  );
  // The window over the page shown runs from a pixel left of the page's rule to
  // a pixel left of the next, over the frame's top and bottom as well.
  const from = ovRule(page) - 1;
  svg.append(svgNode("rect", { class: "geq-window", x: from, y: 0, width: ovRule(page + 1) - from, height: OV_H }));
  GEQ_BANDS.forEach((_, band) => {
    const db = gains[band] ?? 0;
    svg.append(svgNode("circle", { class: `geq-dot${band === held ? " is-held" : ""}`, cx: ovDotX(band), cy: Math.round(ovY(db) - 0.5) + 0.5, r: 1.5 }));
  });
  // A touch brings the sliders to the page under it; a key steps them on, and round to the first.
  return el("div", {
    class: "geq-graph",
    attrs: { "aria-label": `GEQ graph, bands ${GEQ_BANDS[geqPageBands(page)[0] ?? 0]} to ${GEQ_BANDS[geqPageBands(page).at(-1) ?? 0]}` },
    children: [svg as unknown as HTMLElement],
    onTap: (ev) => {
      const node = ev.currentTarget as HTMLElement | null;
      if (ev instanceof MouseEvent && ev.detail > 0 && node) {
        const box = node.getBoundingClientRect();
        const x = (ev.clientX - box.left) / drawnScale(node);
        setGeqPage(ctx, Math.floor((x - OV_LEFT + 1) / OV_PAGE_W));
        return;
      }
      setGeqPage(ctx, (geqPageOf(ctx) + 1) % GEQ_PAGES);
    },
  });
}

// --- The sliders -----------------------------------------------------------

/** The slider area's box on the glass. */
const SL_W = 420;
const SL_H = 120;
/** Each slider's centre across, and how far apart the sliders stand. */
const SL_X0 = 52;
const SL_DX = 105;
/**
 * Where the GEQ Limit's two ends stand down the area, whatever the limit: at
 * ±15dB that is 3px to a dB, with 0 dB in the middle.
 */
const SL_TOP = 15;
const SL_SPAN = 90;

const slX = (slot: number): number => SL_X0 + SL_DX * slot;
const slY = (db: number, [lo, hi]: readonly [number, number]): number => SL_TOP + ((hi - db) / (hi - lo)) * SL_SPAN;

/** The gains ruled across the area and named beside it, top to bottom, at each GEQ Limit (confirmed on a URX44V). */
const GEQ_TICKS: Record<GeqLimit, readonly number[]> = {
  "±15dB": [15, 12, 6, 0, -6, -12, -15],
  "±12dB": [12, 6, 0, -6, -12],
  "±6dB": [6, 3, 0, -3, -6],
  "-24dB": [0, -6, -12, -18, -24],
};

/** The gains ruled at a GEQ Limit; a value off the list reads as the shipped ±15dB. */
export function geqTicks(limit: string): readonly number[] {
  return GEQ_TICKS[limit as GeqLimit] ?? GEQ_TICKS[GEQ_LIMIT_SHIPPED];
}

/** The area the sliders stand in: the rules, a bar under each band, and the box that sets it. */
function geqSliders(ctx: AppContext, strip: Strip, side: GeqSide, page: number): HTMLElement {
  const bands = geqPageBands(page);
  const limit = geqLimitOf(ctx, strip, side);
  const range = geqLimitRange(limit);
  const zero = slY(0, range);
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${SL_W} ${SL_H}`);
  svg.setAttribute("aria-hidden", "true");
  svg.append(svgNode("rect", { class: "geq-frame", x: 0.5, y: 0.5, width: SL_W - 1, height: SL_H - 1, rx: 3 }));
  const labels: HTMLElement[] = [];
  for (const db of geqTicks(limit)) {
    const y = Math.round(slY(db, range));
    svg.append(svgNode("line", { class: db === 0 ? "geq-sl-zero" : "geq-rule", x1: 21, y1: y + 0.5, x2: SL_W - 1, y2: y + 0.5 }));
    labels.push(el("span", { class: "geq-tick", style: { top: `${y}px` }, text: db > 0 ? `+${db}` : String(db) }));
  }
  bands.forEach((_, slot) => {
    const x = slX(slot) + 0.5;
    svg.append(svgNode("line", { class: "geq-rule", x1: x, y1: 1, x2: x, y2: SL_H - 1 }));
  });
  const boxes: HTMLElement[] = [];
  bands.forEach((band, slot) => {
    const spec = geqBandSpec(ctx, strip, side, band);
    const db = ctx.store.num(spec.path, 0);
    const y = slY(db, range);
    // The bar runs between the 0 dB line and the box: down to the line from a box
    // above it, and from the line itself down to a box below it.
    svg.append(svgNode("rect", { class: "geq-bar", x: slX(slot) - 22, y: Math.min(y, zero), width: 44, height: Math.abs(y - zero) }));
    // A box that cannot move is drawn at half its brightness.
    const box = el("button", {
      class: `geq-box${geqBandShut(ctx, strip, side, band) ? " is-shut" : ""}`,
      style: { left: `${slX(slot) - 26}px`, top: `${y - 14}px` },
      text: GEQ_BANDS[band] ?? "",
      attrs: { "aria-label": `${GEQ_BANDS[band] ?? ""} band` },
      onTap: () => ctx.focus.take(spec),
    });
    box.setAttribute("role", "slider");
    setAriaValue(box, spec, db);
    attachSpin(ctx, box, spec, () => ctx.focus.take(spec));
    markFocus(ctx, box, spec.path, "is-held");
    boxes.push(box);
  });
  // The band holding the focus stands in a lit column, under its box.
  const shade = el("div", { class: "geq-shade" });
  ctx.focus.follow(shade, () => {
    const slot = bands.findIndex((band) => ctx.focus.holds(geqBandPath(`ch.${strip.id}`, side, band)));
    shade.hidden = slot < 0;
    if (slot >= 0) shade.style.left = `${slX(slot) - 28}px`;
  });
  const area = el("div", {
    class: "geq-sliders",
    children: [svg as unknown as HTMLElement, shade, ...labels, ...boxes],
  });
  attachPageSwipe(ctx, area);
  return area;
}

/** How far a finger has to travel across the sliders to step the page. */
const SWIPE_PX = 40;

/**
 * A press on the slider area off a box, let go over the area a little to the
 * side, steps the sliders: a swipe to the left shows the next four bands, one
 * to the right the four before.
 */
function attachPageSwipe(ctx: AppContext, area: HTMLElement): void {
  const holds = new PointerHolds<HTMLElement>();
  area.style.touchAction = "pan-y";
  area.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest(".geq-box") || !holds.take(ev, [area])) return;
    const startX = ev.clientX;
    holds.follow(ev, [area], () => undefined, (last) => {
      if (last?.type !== "pointerup") return;
      const dx = (last.clientX - startX) / drawnScale(area);
      if (Math.abs(dx) < SWIPE_PX) return;
      setGeqPage(ctx, geqPageOf(ctx) + (dx < 0 ? 1 : -1));
    });
  });
}

// --- The screen ------------------------------------------------------------

export const geqScreen: ScreenDef = {
  id: "ch.geq",
  toolbar: "sub",
  build(ctx, route: Route): ScreenBody {
    const strip = routeStrip(ctx, route);
    if (!strip) return noChannel();
    if (!carriesGeq(strip)) return noBlock(ctx, strip, route, "GEQ");
    if (!runsGeq(ctx, strip)) return noBlock(ctx, strip, route, "GEQ", geqOverRate(ctx.store.num("setup.samplingFrequency", 48000)));
    const base = `ch.${strip.id}`;
    const side = geqSide(ctx, strip);
    const gains = geqGains(ctx, strip, side);
    const page = geqPageOf(ctx);
    const bands = geqPageBands(page);
    const specs = bands.map((band) => geqBandSpec(ctx, strip, side, band));
    ctx.setKnobs(Array.from({ length: GEQ_PAGE_SIZE }, (_, i) => specs[i] ?? null));
    // The screen opens on the first band shown. A band keeps the focus while the
    // sliders step to a page that does not show it: only its dot on the graph is lit.
    const holdsSide = GEQ_BANDS.some((_, band) => ctx.focus.holds(geqBandPath(base, side, band)));
    if (specs[0] && !holdsSide) ctx.focus.take(specs[0]);
    const held = GEQ_BANDS.findIndex((_, band) => ctx.focus.holds(geqBandPath(base, side, band)));
    const on = ctx.store.bool(geqOnPath(base, side), true);
    const linked = ctx.store.str(geqLinkPath(base), "Off") !== "Off";
    const available = GEQ_MAX_ACTIVE - geqActive(gains);

    const graph = geqGraph(ctx, gains, page, held < 0 ? null : held);
    // A band's dot moves with the focus, as the box it belongs to does.
    ctx.focus.follow(graph, () => {
      graph.querySelectorAll(".geq-dot").forEach((dot, band) => dot.classList.toggle("is-held", ctx.focus.holds(geqBandPath(base, side, band))));
    });

    return {
      main: el("div", {
        class: "geq-screen",
        children: [
          graph,
          el("div", {
            class: "geq-available",
            children: [el("span", { class: "geq-available-caption", text: "Available" }), el("span", { class: "geq-available-count", text: String(available) })],
          }),
          geqSliders(ctx, strip, side, page),
          dynMeters(ctx, strip, "eq"),
        ],
      }),
      headerLeft: channelSelector(ctx, strip, route, true),
      headerCenter: el("div", {
        class: "geq-toolbar",
        children: [
          // GEQ Link chooses which side the other follows; that sheet is not built yet.
          el("button", {
            class: `geq-link${linked ? " is-on" : ""}`,
            text: "GEQ Link",
            attrs: { "aria-pressed": String(linked), "aria-disabled": "true" },
            children: [el("span", { class: "geq-link-mark", children: [Icons.copy()] })],
          }),
          titleBadge("GEQ", "geq", on, writing(geqOnPath(base, side), () => void ctx.store.set(geqOnPath(base, side), !on))),
        ],
      }),
    };
  },
};
