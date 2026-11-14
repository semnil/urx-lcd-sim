// The SEND screen (user guide, "SEND screen"; System firmware V1.5): a channel's
// sends, from the channel view's [SEND]. The side menu switches between two views:
//
//   SEND TO    the sends from the channel in view into each bus it reaches;
//   SEND FROM  the sends into the bus in view from each channel that reaches it.
//
// A strip shows the views it has: an input channel SEND TO alone, the stereo bus
// SEND FROM alone (in the second place, the first left empty), and a MIX bus and
// an FX channel both. Each view lays its cards out four to a page, one page for
// each kind (confirmed on a URX44V):
//
//   SEND TO    the MIX buses; then the FX buses and the stereo bus;
//   SEND FROM  the mono channels; the stereo channels; then the FX channels and
//              the MIX buses.
//
// The round arrows at the ends of a page step to the page beside it. The unit
// comes back to the view and the page last shown, and starts on SEND TO's first
// page when it is switched on.

import type { AppContext } from "../app/context";
import type { Route } from "../app/navigator";
import type { ParamPath } from "../device/path";
import { sendShipsOn } from "../model/defaults";
import type { Strip, UnitModel } from "../model/types";
import { allStrips, sendsTo } from "../model/types";
import { aimed, el, writing } from "../ui/dom";
import { Icons } from "../ui/icons";
import { faderSpec, panSpec } from "../ui/param-spec";
import { panSlider, sideTab, toggle, valueBox } from "../ui/widgets";
import { channelSelector, noBlock, noChannel, notAvailable, routeStrip, titleBox } from "./channel";
import { fxShutOut } from "./effect-params";
import { FIXED_LEVEL_TEXT, sendLocks, sendPanPath } from "./mix-bus";
import { stripPosition } from "./stereo-link";
import type { ScreenBody, ScreenDef } from "./types";

/** The two views of the SEND screen, as its side menu names them. */
export type SendView = "to" | "from";

const SCREEN: Record<SendView, string> = { to: "ch.sendto", from: "ch.sendfrom" };

/** Where the screen keeps the view last shown, and each view's page. */
const VIEW_PATH = "ui.sendView";
const PAGE_PATH: Record<SendView, ParamPath> = { to: "ui.sendToPage", from: "ui.sendFromPage" };

const isBus = (s: Strip): boolean => s.kind === "mix" || s.kind === "fx" || s.kind === "stereo";

/** The buses `from` sends to, a page for each kind: the MIX buses, then the FX buses and the stereo bus. */
export function sendToPages(model: UnitModel, from: Strip): Strip[][] {
  const to = allStrips(model).filter((t) => isBus(t) && sendsTo(from, t));
  const kind = (k: Strip["kind"]): Strip[] => to.filter((t) => t.kind === k);
  return [kind("mix"), [...kind("fx"), ...kind("stereo")]].filter((page) => page.length > 0);
}

/** The channels that send to `into`, a page for each kind: the mono channels, the stereo channels, then the FX channels and the MIX buses. */
export function sendFromPages(model: UnitModel, into: Strip): Strip[][] {
  if (!isBus(into)) return [];
  const from = allStrips(model).filter((s) => sendsTo(s, into));
  const kind = (k: Strip["kind"]): Strip[] => from.filter((s) => s.kind === k);
  return [kind("monoIn"), kind("stIn"), [...kind("fx"), ...kind("mix")]].filter((page) => page.length > 0);
}

/** The views a strip has, SEND TO before SEND FROM. */
export function sendViews(model: UnitModel, strip: Strip): SendView[] {
  return (["to", "from"] as const).filter((v) => (v === "to" ? sendToPages : sendFromPages)(model, strip).length > 0);
}

/** The view a strip opens on: the one last shown where the strip has it, otherwise its first. */
function viewOf(ctx: AppContext, strip: Strip, asked: SendView): SendView | undefined {
  const views = sendViews(ctx.model, strip);
  return views.includes(asked) ? asked : views[0];
}

/** The channel view's [SEND]: the SEND screen on the view last shown, where the strip has it. */
export function openSend(ctx: AppContext, strip: Strip): void {
  const view = viewOf(ctx, strip, ctx.store.str(VIEW_PATH, "to") === "from" ? "from" : "to");
  if (view === "from") ctx.nav.push({ id: "ch.sendfrom", strip: strip.id });
  else ctx.nav.push({ id: "ch.sendto", strip: strip.id });
}

/** Whether a strip has a SEND screen, and so a [SEND] on its channel view. */
export function hasSend(model: UnitModel, strip: Strip): boolean {
  return sendViews(model, strip).length > 0;
}

/**
 * One send as a card: under a band naming `head` (the bus on SEND TO, the
 * channel on SEND FROM), its [ON], its [PRE] and its placing. Whatever the send
 * does not have keeps its room, so nothing else on the card moves.
 */
function sendCard(ctx: AppContext, from: Strip, to: Strip, head: Strip): HTMLElement {
  const base = `ch.${from.id}`;
  const onPath = `${base}.send.${to.id}.on`;
  const prePath = `${base}.send.${to.id}.pre`;
  // An FX channel the sampling frequency has put out of reach names itself and offers nothing to set.
  const shut = (to.kind === "fx" && fxShutOut(ctx, to)) || (from.kind === "fx" && fxShutOut(ctx, from));
  const { busFixed } = sendLocks(ctx, to);
  const toStereo = to.kind === "stereo";
  // The tap is taken against the stereo bus's own fader, so a send into it is
  // the reference and carries no tap of its own; a fixed bus takes no tap either.
  const noTap = busFixed || toStereo;
  // A fixed bus takes the send at one level, an FX bus takes it summed to one
  // side, and a MIX bus goes into the stereo bus on its own balance: none of
  // them offers the send a placing.
  const noPlacing = busFixed || to.kind === "fx" || (toStereo && from.kind === "mix");
  // The row is named after the position the sending channel is placed by: Pan
  // for a channel on its PAN, Bal otherwise. Into the stereo bus, and into a bus
  // on Pan Link, it reads and turns that position itself.
  const placing = stripPosition(ctx, from).caption === "PAN" ? "Pan" : "Bal";
  const balSpec = panSpec(toStereo ? stripPosition(ctx, from).path : sendPanPath(ctx, from, to), `${head.label} ${placing}`);
  const empty = (cls: string): HTMLElement => el("span", { class: `sendto-empty ${cls}` });
  const on = (): boolean => ctx.store.bool(onPath, sendShipsOn(from, to));
  return el("div", {
    class: "sendto-cell",
    children: [
      el("div", {
        class: "sendto-head",
        children: [
          el("span", { class: "sendto-title", text: head.label }),
          el("span", { class: "sendto-name", text: shut ? "" : ctx.store.str(`ch.${head.id}.name`, "") }),
        ],
      }),
      el("div", {
        class: "sendto-body",
        children: shut
          ? []
          : [
              toggle("ON", on(), writing(onPath, () => void ctx.store.set(onPath, !on())), "btn-switch btn-on"),
              noTap
                ? empty("sendto-empty-pre")
                : toggle("PRE", ctx.store.bool(prePath, false), writing(prePath, () => void ctx.store.set(prePath, !ctx.store.bool(prePath, false))), "btn-switch btn-pre"),
              noPlacing ? empty("sendto-empty-slider") : panSlider(ctx.store.num(balSpec.path, 0)),
              noPlacing
                ? empty("sendto-empty-bal")
                : el("div", {
                    class: "sendto-bal",
                    children: [el("span", { class: "sendto-bal-caption", text: placing }), valueBox(ctx, balSpec)],
                  }),
            ],
      }),
    ],
  });
}

/**
 * What the knob under a card turns: the send's level. The stereo bus takes a
 * channel at its own fader, with no level of its own; a fixed bus takes its sends
 * at one level, read as `Fixed` with nothing to turn.
 */
function sendLevel(ctx: AppContext, from: Strip, to: Strip): ReturnType<typeof faderSpec> | { label: string; text: string } | null {
  const shut = (to.kind === "fx" && fxShutOut(ctx, to)) || (from.kind === "fx" && fxShutOut(ctx, from));
  if (to.kind === "stereo" || shut) return null;
  if (sendLocks(ctx, to).busFixed) return { label: "Level", text: FIXED_LEVEL_TEXT };
  return faderSpec(`ch.${from.id}.send.${to.id}.level`, "Level");
}

/** The round arrow at an end of the page, stepping to the page beside it. */
function pageArrow(ctx: AppContext, view: SendView, dir: "prev" | "next", to: number): HTMLElement {
  return el("button", {
    class: `ssmcs-page ssmcs-page-${dir} send-page send-page-${dir}`,
    attrs: { "aria-label": dir === "next" ? "Next page of sends" : "Previous page of sends" },
    onTap: writing(PAGE_PATH[view], () => void ctx.store.set(PAGE_PATH[view], to)),
    children: [dir === "next" ? Icons.pageOn() : Icons.pageBack()],
  });
}

/** The side menu: [SEND TO] in the first place and [SEND FROM] in the second, each where the strip has it. */
function sideMenu(ctx: AppContext, strip: Strip, shown: SendView): HTMLElement[] {
  const views = sendViews(ctx.model, strip);
  const tab = (view: SendView, label: string): HTMLElement =>
    views.includes(view)
      ? sideTab(
          label,
          view === shown,
          aimed(
            () => {
              if (view === shown) return;
              void ctx.store.set(VIEW_PATH, view);
              if (view === "from") ctx.nav.replace({ id: "ch.sendfrom", strip: strip.id });
              else ctx.nav.replace({ id: "ch.sendto", strip: strip.id });
            },
            { kind: "screen", id: SCREEN[view] },
          ),
          undefined,
          "sendto-tab",
        )
      : el("div", { class: "sendto-tab sendto-tab-empty", attrs: { "aria-hidden": "true" } });
  return [tab("to", "SEND\nTO"), tab("from", "SEND\nFROM")];
}

function sendScreen(asked: SendView): ScreenDef {
  return {
    id: SCREEN[asked],
    toolbar: "sub",
    sideAtTop: true,
    // The readout bar stands under every page, its cells empty under a card whose send has no level.
    knobStrip: true,
    build(ctx: AppContext, route: Route): ScreenBody {
      const strip = routeStrip(ctx, route);
      if (!strip) return noChannel();
      if (fxShutOut(ctx, strip)) return notAvailable(ctx, strip, route);
      // A strip the arrows step to that lacks the view in use shows the one it has.
      const shown = viewOf(ctx, strip, asked);
      if (!shown) return noBlock(ctx, strip, route, "SEND");
      const pages = shown === "to" ? sendToPages(ctx.model, strip) : sendFromPages(ctx.model, strip);
      const page = Math.min(pages.length - 1, Math.max(0, Math.trunc(ctx.store.num(PAGE_PATH[shown], 0))));
      const cards = pages[page] ?? [];
      const pairs = cards.map((other): [Strip, Strip] => (shown === "to" ? [strip, other] : [other, strip]));
      ctx.setKnobs(Array.from({ length: 4 }, (_, i) => (pairs[i] ? sendLevel(ctx, ...pairs[i]) : null)));
      return {
        main: el("div", {
          class: "sendto-screen",
          children: [
            ...pairs.map(([from, to], i) => sendCard(ctx, from, to, cards[i] as Strip)),
            ...(page > 0 ? [pageArrow(ctx, shown, "prev", page - 1)] : []),
            ...(page < pages.length - 1 ? [pageArrow(ctx, shown, "next", page + 1)] : []),
          ],
        }),
        side: sideMenu(ctx, strip, shown),
        headerLeft: channelSelector(ctx, strip, route, true),
        headerCenter: titleBox("SEND"),
      };
    },
  };
}

export const sendToScreen = sendScreen("to");
export const sendFromScreen = sendScreen("from");
