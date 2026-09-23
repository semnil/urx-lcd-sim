// Input source popup, opened from the INPUT screen's [Input Source] select
// button (user guide, "Dedicated channel screen > INPUT screen").
//
// The list, its order and its grouping are the unit's own: a scrolling grid
// titled with the mono PAIR, since selecting a source on one mono channel also
// fixes its partner. "None", "All Input" and "All USB DAW" sit apart at the
// top: the latter two are bulk actions the unit asks about before it takes
// them, not selectable sources.
//
// A bus fed from inside the mixer drops a list of buses here instead.

import type { AppContext } from "../app/context";
import { factorySource } from "../model/defaults";
import type { Strip } from "../model/types";
import { dialog, pickerGrid, pickerSheet, toggle } from "../ui/widgets";
import { linkPartner } from "./stereo-link";

/** The list's geometry: four buttons to a row, four rows of the list in view. */
const COLUMNS = 4;
const ROW_H = 40;
const ROW_GAP = 8;
/** The scroll bar's well, the height the thumb runs in. */
const BAR_H = 181;

/** Sources a channel can be fed from, in the order the popup lists them. */
function sourceRows(ctx: AppContext): string[][] {
  const micLine: string[] = [];
  const monoCount = ctx.model.inputs.filter((s) => s.kind === "monoIn").length;
  for (let i = 1; i <= monoCount; i += 2) micLine.push(`MIC/LINE\n${i}/${i + 1}`);
  micLine.push("AUX IN");

  const usbDaw: string[] = [];
  // USB DAW returns come in stereo pairs; the URX44/44V expose twelve channels
  // and the URX22 ten.
  const dawChannels = ctx.model.id === "URX22" ? 10 : 12;
  for (let i = 1; i <= dawChannels; i += 2) usbDaw.push(`USB DAW\n${i}/${i + 1}`);

  const last = ["microSD\nPlayback"];
  if (ctx.model.hasHDMI) last.push("HDMI");

  return [
    micLine,
    ["USB MAIN A", "USB MAIN B", "USB MAIN C", "USB SUB"],
    usbDaw,
    ctx.model.hasSD ? last : last.slice(1),
  ].filter((row) => row.length > 0);
}

/**
 * What the INPUT screen's source box writes for a source: the name its sheet
 * gives it, over two lines where the sheet breaks it.
 */
export function sourceBoxLabel(ctx: AppContext, source: string): string {
  const labels = [...sourceRows(ctx).flat(), ...STREAM_SOURCE_ROWS.flat()];
  return labels.find((label) => label?.replace("\n", " ") === source) ?? source;
}

/** The title the popup carries: the mono pair, or the strip itself when stereo. */
function pairTitle(ctx: AppContext, strip: Strip): string {
  const partner = linkPartner(ctx, strip);
  if (!partner) return strip.label;
  const first = Math.min(strip.channels[0] ?? 1, partner.channels[0] ?? 1);
  return `CH ${first}/${first + 1}`;
}

/**
 * What the streaming bus can be fed from, as its sheet lays them out: STEREO at
 * the start of the first row and the two mix buses under it. It is always fed,
 * so there is no None.
 */
const STREAM_SOURCE_ROWS: (string | null)[][] = [
  ["STEREO", null, null, null],
  ["MIX 1", "MIX 2", null, null],
];

/** The sheet a bus fed from inside the mixer drops: the buses it can listen to. */
function busSourceSheet(ctx: AppContext, strip: Strip): HTMLElement {
  const path = `ch.${strip.id}.source`;
  const current = ctx.store.str(path, "");
  return pickerSheet(ctx, {
    title: strip.label,
    label: `${strip.label} source`,
    build: (close) =>
      pickerGrid(
        STREAM_SOURCE_ROWS.map((row) =>
          row.map((label) =>
            label === null
              ? null
              : toggle(label, label === current, () => {
                  void ctx.store.set(path, label);
                  close();
                  ctx.repaint();
                }, "source-btn"),
          ),
        ),
      ),
  });
}

/**
 * The sheet the INPUT screen's source button drops. It is a sheet over that
 * screen, not a screen of its own: it covers the lower half of the toolbar,
 * which the main area cannot reach, and the INPUT screen stays underneath.
 *
 * Four rows of the list are in view at a time and the rest is scrolled to, as
 * the guide's pair of captures shows.
 */
export function inputSourceSheet(ctx: AppContext, strip: Strip): HTMLElement {
  if (strip.kind === "streaming") return busSourceSheet(ctx, strip);
  const path = `ch.${strip.id}.source`;
  const current = ctx.store.str(path, "MIC/LINE");
  const title = pairTitle(ctx, strip);
  return pickerSheet(ctx, {
    title,
    label: `${title} input source`,
    scroll: { track: BAR_H, unit: ROW_H + ROW_GAP },
    build: (close) => {
      // Selecting a source on one channel of a mono pair fixes its partner.
      const pick = (label: string): void => {
        const value = label.replace("\n", " ");
        void ctx.store.set(path, value);
        const partner = linkPartner(ctx, strip);
        if (partner) void ctx.store.set(`ch.${partner.id}.source`, value);
        close();
        ctx.repaint();
      };
      const choice = (label: string, onTap: () => void, on = false): HTMLElement =>
        toggle(label, on, onTap, "source-btn");

      const rows: (HTMLElement | null)[][] = [
        [
          choice("None", () => pick("None"), current === "None"),
          null,
          choice("All Input", () => bulkAssign(ctx, "input", close)),
          choice("All USB DAW", () => bulkAssign(ctx, "usbdaw", close)),
        ],
      ];
      for (const group of sourceRows(ctx)) {
        // A group wider than the sheet is carried on as many rows of four as it
        // needs, so that each row of the list is one row of the scroll.
        for (let i = 0; i < group.length; i += COLUMNS) {
          rows.push(group.slice(i, i + COLUMNS).map((label) =>
            choice(label, () => pick(label), label.replace("\n", " ") === current),
          ));
        }
      }
      return pickerGrid(rows);
    },
  });
}

/** The channels a bulk button writes, in channel order. */
function bulkStrips(ctx: AppContext): Strip[] {
  return ctx.model.inputs.filter((s) => s.channels.length > 0);
}

/**
 * What a bulk button puts on a strip, or nothing where it leaves the strip
 * alone. [All Input] patches the channels the unit has a connector for and
 * leaves the rest; [All USB DAW] takes every channel to its own USB return.
 */
function bulkSource(ctx: AppContext, strip: Strip, kind: "input" | "usbdaw"): string | undefined {
  const first = strip.channels[0] ?? 1;
  const pairStart = first % 2 === 1 ? first : first - 1;
  if (kind === "usbdaw") return `USB DAW ${pairStart}/${pairStart + 1}`;
  const patch = factorySource(ctx.model, strip);
  return patch !== undefined && !patch.startsWith("USB") ? patch : undefined;
}

/** What the unit asks before a bulk button rewrites the channels. */
function bulkAsk(ctx: AppContext, kind: "input" | "usbdaw"): string {
  const channels = bulkStrips(ctx).flatMap((s) => s.channels);
  const first = channels[0] ?? 1;
  const last = channels.at(-1) ?? first;
  return `Change Input Source?\nCh${first}-${last} ${kind === "input" ? "All Input" : "All USB DAW"}`;
}

/**
 * The two bulk buttons: one tap rewrites the input channels from a fixed table
 * rather than selecting a source for this channel alone. The unit asks first.
 */
function bulkAssign(ctx: AppContext, kind: "input" | "usbdaw", close: () => void): void {
  close();
  ctx.overlay(
    dialog({
      message: bulkAsk(ctx, kind),
      onOk: () => {
        for (const s of bulkStrips(ctx)) {
          const label = bulkSource(ctx, s, kind);
          if (label !== undefined) void ctx.store.set(`ch.${s.id}.source`, label);
        }
        ctx.repaint();
      },
      onCancel: () => ctx.repaint(),
    }),
  );
}
