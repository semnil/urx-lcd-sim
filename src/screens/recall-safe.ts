// RECALL SAFE (user guide, "SCENE screen > Recall Safe menu"; System firmware V1.5):
// what a scene recall leaves as it stands. SCENE's [Recall Safe] opens it, and its
// side menu switches between three tabs:
//
//   Input   a row for each input channel: CH 1 to CH 4 one channel each, a stereo
//           input one row for its pair, FX 1 and FX 2 a row each;
//   Output  a row for each output channel: MIX 1, MIX 2, ST and STR;
//   Others  the effects, the MIX buses' BUS Type and the output patch.
//
// A row carries [Safe] (`ON`), [All] and a button for each parameter; a MIX bus's
// row also carries [Incoming Sends], the sends every channel makes into that bus.
// A recall keeps a channel's parameter only where the row's [Safe] is on and that
// parameter is selected: [Safe] alone keeps nothing, and a parameter selected on a
// row whose [Safe] is off keeps nothing either (confirmed on a URX44V). A selected
// button reads cyan on a row whose [Safe] is on, the selection in force, and teal
// on the others.

import type { AppContext } from "../app/context";
import type { ParamPath } from "../device/path";
import type { Strip, UnitModel } from "../model/types";
import { digitalGainPath } from "../model/source-gain";
import { el, writing } from "../ui/dom";
import { scrollbar, sideTab } from "../ui/widgets";
import type { ScreenBody, ScreenDef } from "./types";
import { linkPartner } from "./stereo-link";
import { stripColor } from "./strip-state";

/** The three tabs of the side menu. */
export const SAFE_TABS = ["Input", "Output", "Others"] as const;
export type SafeTab = (typeof SAFE_TABS)[number];

const TAB_PATH = "ui.recallSafeTab";
/** The row whose name was tapped last: the unit frames it in white. */
const ROW_PATH = "ui.recallSafeRow";

/** A parameter column, as the guide's table names them. */
export type SafeKey = "name" | "source" | "ha" | "processing" | "recPoint" | "toMix" | "toFx" | "chOn" | "chLevel" | "toSt";

interface Column {
  key: SafeKey;
  /** The heading, broken where the unit breaks it. */
  label: string;
  /** What the heading is read out as. */
  name: string;
}

const col = (key: SafeKey, label: string): Column => ({ key, label, name: label.replace("-\n", "").replace("\n", " ") });

/** The Input tab's parameter columns, in the unit's order (confirmed on a URX44V). */
const INPUT_COLUMNS: readonly Column[] = [
  col("name", "Name"),
  col("source", "Source"),
  col("ha", "HA"),
  col("processing", "Process-\ning"),
  col("recPoint", "Rec\nPoint"),
  col("toMix", "To MIX"),
  col("toFx", "To FX"),
  col("chOn", "CH ON"),
  col("chLevel", "CH\nLevel"),
  col("toSt", "To\nST/Pan"),
];

/** The Output tab's parameter columns, in the unit's order (confirmed on a URX44V). */
const OUTPUT_COLUMNS: readonly Column[] = [
  col("name", "Name"),
  col("source", "Source"),
  col("processing", "Process-\ning"),
  col("chOn", "CH ON"),
  col("chLevel", "CH\nLevel"),
  col("toSt", "To\nST/Bal"),
];

export function safeColumns(tab: "Input" | "Output"): readonly Column[] {
  return tab === "Input" ? INPUT_COLUMNS : OUTPUT_COLUMNS;
}

/** The rows a tab lists, in the unit's order. */
export function safeRows(model: UnitModel, tab: "Input" | "Output"): Strip[] {
  return tab === "Input" ? model.inputs : model.outputs;
}

/** Where a row keeps its [Safe], a parameter's selection and a MIX bus's [Incoming Sends]. */
export const safeOnPath = (strip: Strip): ParamPath => `safe.${strip.id}.on`;
export const safeKeyPath = (strip: Strip, key: SafeKey): ParamPath => `safe.${strip.id}.${key}`;
export const incomingPath = (strip: Strip): ParamPath => `safe.${strip.id}.incoming`;

/**
 * Whether a row has a button in the column at all, rather than a black cell. An
 * FX channel has no Source, HA, Processing, Rec Point or To FX; the stereo bus
 * and the MIX buses no Source; the streaming bus only Name, Source and
 * Processing (confirmed on a URX44V). Incoming Sends is a MIX bus's alone.
 */
function offers(strip: Strip, key: SafeKey | "incoming"): boolean {
  switch (strip.kind) {
    case "monoIn":
      return key !== "incoming";
    case "stIn":
      return key !== "incoming" && key !== "ha";
    case "fx":
      return key === "name" || key === "toMix" || key === "chOn" || key === "chLevel" || key === "toSt";
    case "mix":
      return key === "incoming" || (key !== "source" && key !== "ha" && key !== "recPoint" && key !== "toMix" && key !== "toFx");
    case "stereo":
      return key === "name" || key === "processing" || key === "chOn" || key === "chLevel" || key === "toSt";
    case "streaming":
      return key === "name" || key === "source" || key === "processing";
  }
}

export const isSafe = (ctx: AppContext, strip: Strip): boolean => ctx.store.bool(safeOnPath(strip), false);
export const isSelected = (ctx: AppContext, strip: Strip, key: SafeKey): boolean => ctx.store.bool(safeKeyPath(strip, key), false);
const incomingSelected = (ctx: AppContext, strip: Strip): boolean => ctx.store.bool(incomingPath(strip), false);

/** Whether the cell is a button. HA is one only while the channel's Source is selected. */
export function hasCell(ctx: AppContext, strip: Strip, key: SafeKey): boolean {
  if (!offers(strip, key)) return false;
  return key !== "ha" || isSelected(ctx, strip, "source");
}

/** The row's parameters that are buttons now. */
function cellsOf(ctx: AppContext, strip: Strip, tab: "Input" | "Output"): SafeKey[] {
  return safeColumns(tab)
    .map((c) => c.key)
    .filter((k) => hasCell(ctx, strip, k));
}

/** The channels a selection of Source goes to: the channel and the other of its input source's pair. */
function sourceOwners(ctx: AppContext, strip: Strip): Strip[] {
  const partner = linkPartner(ctx, strip);
  return partner ? [strip, partner] : [strip];
}

/**
 * Select or clear a parameter. Source goes by the input source's pair, CH 1 with
 * CH 2 and CH 3 with CH 4, and clearing it clears the pair's HA, which is a
 * button only while Source is selected.
 */
function setSelected(ctx: AppContext, strip: Strip, key: SafeKey, on: boolean): void {
  if (key !== "source") {
    void ctx.store.set(safeKeyPath(strip, key), on);
    return;
  }
  for (const s of sourceOwners(ctx, strip)) {
    void ctx.store.set(safeKeyPath(s, "source"), on);
    if (!on && offers(s, "ha")) void ctx.store.set(safeKeyPath(s, "ha"), false);
  }
}

/** The paths a selection of the parameter writes. */
function selectionWrites(ctx: AppContext, strip: Strip, key: SafeKey): ParamPath[] {
  if (key !== "source") return [safeKeyPath(strip, key)];
  return sourceOwners(ctx, strip).flatMap((s) => [safeKeyPath(s, "source"), ...(offers(s, "ha") ? [safeKeyPath(s, "ha")] : [])]);
}

/** How many of a set of buttons are selected: none, some or all. */
type Fill = "none" | "some" | "all";
function fillOf(selected: boolean[]): Fill {
  const n = selected.filter(Boolean).length;
  return n === 0 ? "none" : n === selected.length ? "all" : "some";
}

/**
 * Select every parameter of the row, or clear them where all are selected. A row
 * whose Source this selects has its HA selected with it.
 */
function toggleRow(ctx: AppContext, strip: Strip, tab: "Input" | "Output"): void {
  const on = fillOf(cellsOf(ctx, strip, tab).map((k) => isSelected(ctx, strip, k))) !== "all";
  ctx.store.operation(() => {
    for (const key of safeColumns(tab).map((c) => c.key)) {
      if (key === "ha") continue;
      if (hasCell(ctx, strip, key) || (key === "source" && offers(strip, key))) setSelected(ctx, strip, key, on);
    }
    if (on && offers(strip, "ha")) void ctx.store.set(safeKeyPath(strip, "ha"), true);
  });
}

/** Select the column on every row that has it, or clear it where every one is selected. */
function toggleColumn(ctx: AppContext, rows: Strip[], key: SafeKey): void {
  const owners = rows.filter((s) => hasCell(ctx, s, key));
  const on = fillOf(owners.map((s) => isSelected(ctx, s, key))) !== "all";
  ctx.store.operation(() => {
    for (const s of owners) setSelected(ctx, s, key, on);
  });
}

/** Select every parameter of every row, or clear them all where all are selected. */
function toggleTab(ctx: AppContext, rows: Strip[], tab: "Input" | "Output"): void {
  const on = fillOf(rows.flatMap((s) => cellsOf(ctx, s, tab).map((k) => isSelected(ctx, s, k)))) !== "all";
  ctx.store.operation(() => {
    for (const s of rows) {
      for (const key of safeColumns(tab).map((c) => c.key)) {
        if (key === "ha") continue;
        if (offers(s, key)) setSelected(ctx, s, key, on);
      }
      if (offers(s, "ha")) void ctx.store.set(safeKeyPath(s, "ha"), on);
    }
  });
}

/** The face of a tri-state button: `All` until something is selected, `...` while some are, `All` lit once all are. */
function fillText(fill: Fill): string {
  return fill === "some" ? "..." : "All";
}

function safeButton(opts: {
  text: string;
  label: string;
  on: boolean;
  safe: boolean;
  writes: ParamPath[];
  onTap: () => void;
  extraClass?: string;
}): HTMLElement {
  const node = el("button", {
    class: `safe-btn${opts.on ? " is-on" : ""}${opts.safe ? " is-safe" : ""}${opts.extraClass ? ` ${opts.extraClass}` : ""}`,
    text: opts.text,
    attrs: { "aria-label": opts.label, "aria-pressed": String(opts.on) },
    onTap: writing(opts.writes, opts.onTap),
  });
  return node;
}

/** A cell with no button: black, out of reach and read as nothing. */
const noCell = (): HTMLElement => el("span", { class: "safe-btn is-none", attrs: { "aria-hidden": "true" } });

/** How far a tab's columns are scrolled, in columns, kept across redraws of the glass. */
const hScroll = new WeakMap<object, Partial<Record<SafeTab, number>>>();

/**
 * How many parameter columns stand in view at a time, and the length of the bar's
 * well under them: four on Output (p079-1); five on Input, whose panel takes the
 * place Incoming Sends leaves.
 */
const IN_VIEW: Record<"Input" | "Output", { columns: number; track: number }> = {
  Input: { columns: 5, track: 217 },
  Output: { columns: 4, track: 171 },
};
/** One column's pitch, button and gap. */
const COLUMN_PITCH_PX = 46;
/** One row's pitch, and the travel of the bar beside the rows. */
const ROW_PITCH_PX = 44;
const V_TRACK_PX = 121;

/**
 * The bar under the columns: a well with a thumb covering the share of the
 * columns in view. Dragging the thumb, or the columns themselves, steps them a
 * column at a time, as the wheel's sideways turn does.
 */
function columnBar(ctx: AppContext, tab: "Input" | "Output", total: number, tracks: HTMLElement[]): HTMLElement {
  const { columns: inView, track: H_TRACK_PX } = IN_VIEW[tab];
  const thumb = el("div", { class: "scroll-thumb" });
  const bar = el("div", { class: "safe-hbar", children: [thumb] });
  const hidden = Math.max(0, total - inView);
  const width = hidden === 0 ? H_TRACK_PX : Math.round((H_TRACK_PX * inView) / total);
  const kept = hScroll.get(ctx.store) ?? {};
  hScroll.set(ctx.store, kept);
  const place = (at: number): void => {
    const to = Math.min(hidden, Math.max(0, Math.round(at)));
    kept[tab] = to;
    for (const t of tracks) t.style.transform = `translateX(${-to * COLUMN_PITCH_PX}px)`;
    thumb.style.width = `${width}px`;
    thumb.style.left = `${hidden === 0 ? 0 : ((H_TRACK_PX - width) * to) / hidden}px`;
  };
  place(kept[tab] ?? 0);
  const drag = (start: PointerEvent, perPx: number, host: HTMLElement): void => {
    if (start.button !== 0) return;
    const from = kept[tab] ?? 0;
    const glass = host.closest<HTMLElement>(".lcd");
    const scale = glass ? glass.getBoundingClientRect().width / glass.offsetWidth || 1 : 1;
    let dragged = false;
    const swallow = (ev: Event): void => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const move = (m: PointerEvent): void => {
      const moved = (m.clientX - start.clientX) / scale;
      if (!dragged && Math.abs(moved) < 4) return;
      dragged = true;
      place(from + moved * perPx);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (!dragged) return;
      for (const t of tracks) t.addEventListener("click", swallow, true);
      setTimeout(() => {
        for (const t of tracks) t.removeEventListener("click", swallow, true);
      }, 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  thumb.style.touchAction = "none";
  thumb.addEventListener("pointerdown", (ev) => drag(ev, hidden === 0 ? 0 : hidden / (H_TRACK_PX - width), thumb));
  for (const t of tracks) {
    const host = t.parentElement ?? t;
    host.style.touchAction = "pan-y";
    host.addEventListener("pointerdown", (ev) => drag(ev, -1 / COLUMN_PITCH_PX, host));
    host.addEventListener(
      "wheel",
      (ev) => {
        if (ev.deltaX === 0) return;
        const before = kept[tab] ?? 0;
        place(before + Math.sign(ev.deltaX));
        if (kept[tab] !== before) ev.preventDefault();
      },
      { passive: false },
    );
  }
  bar.hidden = hidden === 0;
  return bar;
}

/** A row's fixed name: ST and STR for the stereo and streaming buses, and FX 1 and FX 2 spaced (confirmed on a URX44V). */
function rowId(strip: Strip): string {
  if (strip.kind === "stereo") return "ST";
  if (strip.kind === "streaming") return "STR";
  return strip.kind === "fx" ? strip.label.replace(/^FX(\d)/, "FX $1") : strip.label;
}

/** A row's name: the channel's fixed name over the name the user gave it, on a square of its colour.
 * A tap selects the row, which the unit frames in white; a tap on the framed row keeps it. */
function rowName(ctx: AppContext, strip: Strip): HTMLElement {
  const fixed = rowId(strip);
  const selected = ctx.store.str(ROW_PATH, "") === strip.id;
  return el("button", {
    class: `safe-row-name${selected ? " is-selected" : ""}`,
    attrs: { "aria-label": fixed, "aria-pressed": String(selected) },
    onTap: () => void ctx.store.set(ROW_PATH, strip.id),
    children: [
      el("span", { class: "safe-row-icon", style: { background: stripColor(ctx, strip) } }),
      el("span", { class: "safe-row-id", text: fixed }),
      el("span", { class: "safe-row-user", text: ctx.store.str(`ch.${strip.id}.name`, "") }),
    ],
  });
}

function gridTab(ctx: AppContext, tab: "Input" | "Output"): HTMLElement {
  const rows = safeRows(ctx.model, tab);
  const columns = safeColumns(tab);
  const output = tab === "Output";
  const anySafe = rows.some((s) => isSafe(ctx, s));
  const safeFill = fillOf(rows.map((s) => isSafe(ctx, s)));
  const tracks: HTMLElement[] = [];
  const track = (children: HTMLElement[]): HTMLElement => {
    const t = el("div", { class: "safe-track", children });
    tracks.push(t);
    return el("div", { class: "safe-window", children: [t] });
  };

  // The heading row: [Safe]'s `ALL`, [Incoming Sends] on Output, [All] and a button over each column.
  const heading = (label: string): HTMLElement => el("span", { class: `safe-heading${label.includes("\n") ? " is-wrapped" : ""}`, text: label });
  const safeAll = el("button", {
    class: `safe-switch is-head${safeFill === "all" ? " is-on" : safeFill === "some" ? " is-some" : ""}`,
    text: safeFill === "some" ? "..." : "ALL",
    attrs: { "aria-label": `Safe on every ${tab.toLowerCase()} channel`, "aria-pressed": String(safeFill === "all") },
    onTap: writing(rows.map(safeOnPath), () => {
      const on = safeFill !== "all";
      ctx.store.operation(() => {
        for (const s of rows) void ctx.store.set(safeOnPath(s), on);
      });
    }),
  });
  const mixes = rows.filter((s) => offers(s, "incoming"));
  const incomingFill = fillOf(mixes.map((s) => incomingSelected(ctx, s)));
  const tabFill = fillOf(rows.flatMap((s) => cellsOf(ctx, s, tab).map((k) => isSelected(ctx, s, k))));
  const columnFill = (key: SafeKey): Fill => fillOf(rows.filter((s) => hasCell(ctx, s, key)).map((s) => isSelected(ctx, s, key)));
  const head = el("div", {
    class: "safe-head",
    children: [
      el("div", { class: "safe-fixed", children: [heading("Safe"), ...(output ? [heading("Incoming\nSends")] : []), heading("All")] }),
      el("div", {
        class: "safe-fixed",
        children: [
          safeAll,
          ...(output
            ? [
                safeButton({
                  text: fillText(incomingFill),
                  label: "Incoming Sends of every MIX bus",
                  on: incomingFill !== "none",
                  safe: anySafe,
                  writes: mixes.map(incomingPath),
                  onTap: () => {
                    const on = incomingFill !== "all";
                    ctx.store.operation(() => {
                      for (const s of mixes) void ctx.store.set(incomingPath(s), on);
                    });
                  },
                }),
              ]
            : []),
          safeButton({
            text: fillText(tabFill),
            label: `Every parameter of every ${tab.toLowerCase()} channel`,
            on: tabFill !== "none",
            safe: anySafe,
            writes: rows.flatMap((s) => safeColumns(tab).filter((c) => offers(s, c.key)).flatMap((c) => selectionWrites(ctx, s, c.key))),
            onTap: () => toggleTab(ctx, rows, tab),
          }),
        ],
      }),
    ],
  });
  const headTrack = track(
    columns.map((c) =>
      el("div", {
        class: "safe-column-head",
        children: [
          heading(c.label),
          safeButton({
            text: fillText(columnFill(c.key)),
            label: `${c.name} on every ${tab.toLowerCase()} channel`,
            on: columnFill(c.key) !== "none",
            safe: anySafe,
            writes: rows.filter((s) => hasCell(ctx, s, c.key)).flatMap((s) => selectionWrites(ctx, s, c.key)),
            onTap: () => toggleColumn(ctx, rows, c.key),
          }),
        ],
      }),
    ),
  );

  // The rows stand in three columns side by side, scrolled up and down as one: the
  // names, the buttons that stay, and the window the parameter buttons slide in.
  const fixedRow = (strip: Strip): HTMLElement => {
    const safe = isSafe(ctx, strip);
    const name = rowId(strip);
    const rowFill = fillOf(cellsOf(ctx, strip, tab).map((k) => isSelected(ctx, strip, k)));
    return el("div", {
      class: "safe-fixed",
      children: [
        el("button", {
          class: `safe-switch${safe ? " is-on" : ""}`,
          text: "ON",
          attrs: { "aria-label": `${name} Safe`, "aria-pressed": String(safe) },
          onTap: writing(safeOnPath(strip), () => void ctx.store.set(safeOnPath(strip), !safe)),
        }),
        ...(output
          ? [
              offers(strip, "incoming")
                ? safeButton({
                    text: "",
                    label: `${name} Incoming Sends`,
                    on: incomingSelected(ctx, strip),
                    safe,
                    writes: [incomingPath(strip)],
                    onTap: () => void ctx.store.set(incomingPath(strip), !incomingSelected(ctx, strip)),
                  })
                : noCell(),
            ]
          : []),
        safeButton({
          text: fillText(rowFill),
          label: `Every parameter of ${name}`,
          on: rowFill !== "none",
          safe,
          writes: safeColumns(tab)
            .filter((c) => offers(strip, c.key))
            .flatMap((c) => selectionWrites(ctx, strip, c.key)),
          onTap: () => toggleRow(ctx, strip, tab),
        }),
      ],
    });
  };
  const cellRow = (strip: Strip): HTMLElement => {
    const safe = isSafe(ctx, strip);
    const name = rowId(strip);
    return el("div", {
      class: "safe-cells",
      children: columns.map((c) =>
        hasCell(ctx, strip, c.key)
          ? safeButton({
              text: "",
              label: `${name} ${c.name}`,
              on: isSelected(ctx, strip, c.key),
              safe,
              writes: selectionWrites(ctx, strip, c.key),
              onTap: () => setSelected(ctx, strip, c.key, !isSelected(ctx, strip, c.key)),
            })
          : noCell(),
      ),
    });
  };
  const body = el("div", {
    class: "safe-rows",
    children: [
      el("div", { class: "safe-names", children: rows.map((strip) => rowName(ctx, strip)) }),
      el("div", { class: "safe-fixed-rows", children: rows.map(fixedRow) }),
      track(rows.map(cellRow)),
    ],
  });
  const vbar = scrollbar(body, V_TRACK_PX, ROW_PITCH_PX, false, 0, 0, { ctx, key: "safe.rows", keep: tab });
  vbar.classList.add("safe-vbar");
  const hbar = columnBar(ctx, tab, columns.length, tracks);

  return el("div", {
    class: `safe-screen safe-${tab.toLowerCase()}`,
    children: [el("div", { class: "safe-panel safe-panel-fixed" }), el("div", { class: "safe-panel safe-panel-scroll" }), head, headTrack, body, vbar, hbar],
  });
}

/** One of the Others tab's buttons: green while it keeps what it names. */
interface OtherButton {
  key: string;
  label: string;
}

const OTHERS: readonly { band: string; buttons: readonly OtherButton[] }[] = [
  {
    band: "EFFECT",
    buttons: [
      { key: "fx1", label: "FX 1" },
      { key: "fx2", label: "FX 2" },
      { key: "insFxInput", label: "INS FX\n(Input)" },
      { key: "insFxOutput", label: "INS FX\n(Output)" },
    ],
  },
  {
    band: "BUS TYPE",
    buttons: [
      { key: "busTypeMix1", label: "MIX1" },
      { key: "busTypeMix2", label: "MIX2" },
    ],
  },
  { band: "OTHERS", buttons: [{ key: "outputPatch", label: "Output\nPatch" }] },
];

export const otherPath = (key: string): ParamPath => `safe.others.${key}`;

function othersTab(ctx: AppContext): HTMLElement {
  return el("div", {
    class: "safe-screen safe-others",
    children: OTHERS.flatMap((group) => [
      el("div", { class: "safe-band", text: group.band }),
      el("div", {
        class: "safe-others-row",
        children: group.buttons.map((b) => {
          const on = ctx.store.bool(otherPath(b.key), false);
          return el("button", {
            class: `safe-other${on ? " is-on" : ""}`,
            text: b.label,
            attrs: { "aria-label": `${group.band} ${b.label.replace("\n", " ")}`, "aria-pressed": String(on) },
            onTap: writing(otherPath(b.key), () => void ctx.store.set(otherPath(b.key), !on)),
          });
        }),
      }),
    ]),
  });
}

export const recallSafeScreen: ScreenDef = {
  id: "scene.safe",
  toolbar: "sub",
  sideAtTop: true,
  title: () => "RECALL SAFE",
  // The side rail carries the three tabs alone (p079-1, p080-1).
  knobToggle: false,
  build(ctx): ScreenBody {
    const stored = ctx.store.str(TAB_PATH, "Input");
    const tab: SafeTab = (SAFE_TABS as readonly string[]).includes(stored) ? (stored as SafeTab) : "Input";
    return {
      main: tab === "Others" ? othersTab(ctx) : gridTab(ctx, tab),
      side: SAFE_TABS.map((t) => sideTab(t, t === tab, writing(TAB_PATH, () => void ctx.store.set(TAB_PATH, t)), undefined, "safe-tab")),
    };
  },
};

// ---------------------------------------------------------------------------
// What a recall keeps.

/** A path under a strip, as `ch.<id>.<rest>`, split into the strip and the rest. */
function stripOf(model: UnitModel, path: ParamPath): { strip: Strip; rest: string } | undefined {
  if (!path.startsWith("ch.")) return undefined;
  for (const strip of [...model.inputs, ...model.outputs]) {
    const base = `ch.${strip.id}.`;
    if (path.startsWith(base)) return { strip, rest: path.slice(base.length) };
  }
  return undefined;
}

const under = (rest: string, ...heads: string[]): boolean => heads.some((h) => rest === h || rest.startsWith(`${h}.`));

/** The parameter column a channel's own value belongs to, or none where no column covers it. */
export function columnOf(strip: Strip, rest: string): SafeKey | "insFx" | "effect" | "busType" | undefined {
  if (under(rest, "name", "color")) return "name";
  if (under(rest, "source")) return "source";
  if (under(rest, "gain", "phantom", "hiZ", "clipSafe") || (strip.kind === "monoIn" && under(rest, "phase"))) return "ha";
  if (under(rest, "hpf", "gate", "comp", "eq", "eqType", "geq", "ssmcs", "ducker", "compEqOrder", "delay")) return "processing";
  if (under(rest, "recPoint")) return "recPoint";
  if (under(rest, "send.bus.mix1", "send.bus.mix2")) return "toMix";
  if (under(rest, "send.fx1", "send.fx2")) return "toFx";
  if (under(rest, "on")) return "chOn";
  if (under(rest, "level")) return "chLevel";
  if (under(rest, "send.bus.stereo", "pan", "balance", "panBal")) return "toSt";
  if (under(rest, "insFx")) return "insFx";
  if (under(rest, "effect")) return "effect";
  if (under(rest, "busType")) return "busType";
  return undefined;
}

/** Whether a row's parameter is kept by a recall: the row's [Safe] on and the parameter selected. */
function keeps(ctx: AppContext, strip: Strip, key: SafeKey): boolean {
  return isSafe(ctx, strip) && offers(strip, key) && isSelected(ctx, strip, key);
}

/**
 * The paths a recall leaves as they stand, out of those `paths` it would put
 * back: a channel's parameter its row keeps, a send into a MIX bus whose row
 * keeps its Incoming Sends, and what a lit button of the Others tab names.
 */
export function keptByRecallSafe(ctx: AppContext, paths: Iterable<ParamPath>): Set<ParamPath> {
  const kept = new Set<ParamPath>();
  // Recall Safe works in Standard Mode alone, so a recall in Simple Mode keeps nothing.
  if (ctx.store.str("setup.operationMode", "Standard") === "Simple") return kept;
  const other = (key: string): boolean => ctx.store.bool(otherPath(key), false);
  const incoming = ctx.model.outputs.filter((s) => s.kind === "mix" && isSafe(ctx, s) && incomingSelected(ctx, s));
  // A channel whose HA is kept keeps its input source's D.Gain, which the source carries.
  const gains = new Set(
    ctx.model.inputs.filter((s) => keeps(ctx, s, "ha")).map((s) => digitalGainPath(ctx.store.str(`ch.${s.id}.source`, ""))),
  );
  for (const path of paths) {
    if (gains.has(path)) kept.add(path);
    if (path.startsWith("setup.outputPatch.") && other("outputPatch")) kept.add(path);
    const at = stripOf(ctx.model, path);
    if (!at) continue;
    const { strip, rest } = at;
    if (incoming.some((bus) => under(rest, `send.${bus.id}`))) {
      kept.add(path);
      continue;
    }
    const column = columnOf(strip, rest);
    if (column === "insFx") {
      if (other(strip.side === "input" ? "insFxInput" : "insFxOutput")) kept.add(path);
    } else if (column === "effect") {
      if (other(strip.id)) kept.add(path);
    } else if (column === "busType") {
      if (other(strip.id === "bus.mix1" ? "busTypeMix1" : "busTypeMix2")) kept.add(path);
    } else if (column !== undefined && keeps(ctx, strip, column)) {
      kept.add(path);
    }
  }
  return kept;
}
