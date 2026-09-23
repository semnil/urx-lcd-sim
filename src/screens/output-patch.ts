// The sheet an OUTPUT PATCH source button drops (user guide, "Output Patch
// menu"): "The output source selection popup menu is shown when you touch these
// buttons."
//
// The guide gives one list per tab rather than one per output — the callout
// names the buttons in the plural and the list that follows it is a single
// figure — so every analog output offers the same sources and every USB output
// offers the same sources.

import type { AppContext } from "../app/context";
import type { UnitModel } from "../model/types";
import { pickerGrid, pickerSheet, toggle } from "../ui/widgets";

/** What an output carries when nothing is patched to it. */
export const PATCH_NONE = "None";

/**
 * The sources an output can take, laid out as the unit lays them out: four to a
 * row, with the empty cells the unit leaves.
 */
export function patchSourceRows(model: UnitModel, tab: string): (string | null)[][] {
  if (tab !== "USB") {
    return [
      [PATCH_NONE, null, null, null],
      ["STEREO", "STREAMING", "MIX 1", "MIX 2"],
      ["MONITOR\n1", "MONITOR\n2", null, null],
    ];
  }
  // A USB output can take any input channel as well as the buses: the pairs
  // first, then the mono channels on their own.
  const inputs = model.inputs.filter((s) => s.channels.length > 0);
  const total = inputs.reduce((n, s) => n + s.channels.length, 0);
  const mono = inputs.filter((s) => s.kind === "monoIn");
  const cells: string[] = ["STEREO", "STREAMING", "MIX 1", "MIX 2"];
  for (let i = 1; i < total; i += 2) cells.push(`CH ${i}/${i + 1}`);
  for (const s of mono) cells.push(s.label);

  const rows: (string | null)[][] = [[PATCH_NONE, null, cells[0] ?? null, cells[1] ?? null]];
  for (let i = 2; i < cells.length; i += 4) {
    const row = cells.slice(i, i + 4);
    rows.push([...row, ...Array<null>(4 - row.length).fill(null)]);
  }
  return rows;
}

/**
 * The sheet itself. It is titled with the output whose button was touched, the
 * way the input-source sheet is titled with the channel pair.
 */
export function patchSourceSheet(ctx: AppContext, caption: string, path: string, tab: string): HTMLElement {
  const current = ctx.store.str(path, "STEREO");
  return pickerSheet(ctx, {
    title: caption,
    label: `${caption} output source`,
    build: (close) => {
      const pick = (label: string): void => {
        void ctx.store.set(path, label.replace("\n", " "));
        close();
        ctx.repaint();
      };
      return pickerGrid(
        patchSourceRows(ctx.model, tab).map((row) =>
          row.map((label) =>
            label === null
              ? null
              : toggle(label, label.replace("\n", " ") === current, () => pick(label), "source-btn"),
          ),
        ),
      );
    },
  });
}
