// The unit's on-screen controls.
//
// Each one is a control the user guide names in "Onscreen user interface":
// buttons that light when on, value boxes that take the pink TOUCH AND TURN
// border when touched, pulldown menus, list rows, dialog boxes, meters and the
// small rotary graphics on the channel strips.

import type { AppContext } from "../app/context";
import { clamp } from "../device/store";
import { levelBarShare } from "../model/dynamics";
import { OFF_MARK, drawnScale, el, fromInnerControl, makeTappable, setPressed } from "./dom";
import { Icons } from "./icons";
import type { NumericSpec } from "./param-spec";
import { KNOB_SIZE, KNOB_START_DEG, KNOB_SWEEP_DEG, formatValue, unitOf } from "./param-spec";

const SVG_NS = "http://www.w3.org/2000/svg";

export function button(label: string, onTap: () => void, extraClass = ""): HTMLElement {
  return el("button", { class: `btn ${extraClass}`.trim(), text: label, onTap });
}

/** The row of menu entries a top-level screen is made of. */
export function menuGrid(children: HTMLElement[], extraClass = ""): HTMLElement {
  return el("div", { class: `menu-grid ${extraClass}`.trim(), children });
}

/** An entry in a menu grid: the caption inside a plain framed button. */
export function menuButton(label: string, onTap: () => void): HTMLElement {
  // A name on one line stands a pixel higher than the middle of two.
  const lines = label.includes("\n") ? "" : " is-one-line";
  return el("button", { class: `menu-btn${lines}`, onTap, children: [el("span", { text: label })] });
}

/** A latching button: brighter when on, faint when off (user guide, Buttons). */
export function toggle(label: string, on: boolean, onTap: () => void, extraClass = ""): HTMLElement {
  const node = el("button", { class: `btn btn-toggle ${extraClass}`.trim(), text: label, onTap });
  setPressed(node, on);
  return node;
}

/**
 * A button the unit carries that this simulator does not build: it stands where
 * the unit draws it and cannot be used. It is drawn rather than left out so the
 * screen keeps the unit's layout.
 */
export function unbuilt(label: string, extraClass = ""): HTMLElement {
  const node = el("button", { class: `btn btn-toggle ${extraClass} is-disabled`.trim(), text: label });
  node.disabled = true;
  return node;
}

/** How far a pointer travels before it is a drag rather than a tap. */
const DRAG_SLOP_PX = 4;

/**
 * The bar the unit draws beside a list that does not fit: a well with a white
 * thumb covering the share of the list in view, and a pink rim while the list
 * is the thing being turned. `unit` is the pitch one row of the list takes, so
 * the thumb steps with the rows rather than with the pixels. `always` keeps the
 * bar up with a full thumb where the unit draws one whatever the list holds.
 * `gap` is what the bar adds to the list's heights before counting rows in them,
 * and `minThumb` the shortest the thumb draws.
 *
 * The returned node is positioned by the screen that owns it.
 */
/**
 * Keep `node` carrying `cls` while the focus is on `key`: now, and whenever the
 * focus moves, for as long as the node exists. The listener holds the node weakly,
 * so a node a repaint has replaced is let go.
 */
export function markFocus(ctx: AppContext, node: Element, key: string, cls = "is-focused"): void {
  followFocus(ctx, node, () => node.classList.toggle(cls, ctx.focus.holds(key)));
}

/**
 * Run `apply` now and whenever the focus moves, for as long as `node` exists. The
 * listener holds the node weakly, so a node a repaint has replaced is let go.
 */
export function followFocus(ctx: AppContext, node: Element, apply: () => void): void {
  apply();
  const ref = new WeakRef(node);
  const off = ctx.focus.onChange(() => {
    if (!ref.deref()) {
      off();
      return;
    }
    apply();
  });
}

/**
 * Follow the pointer that pressed in `start` on the window until it is let go or
 * cancelled, calling `move` on each of its moves and `end` at the end with the
 * event that ended it. Other pointers are not heard, and a mouse that moves with
 * no button held has been let go where the page did not hear it. The returned
 * function ends it early, with no event.
 */
function followPointer(start: PointerEvent, move: (m: PointerEvent) => void, end: (last?: PointerEvent) => void): () => void {
  const onMove = (m: PointerEvent): void => {
    if (m.pointerId !== start.pointerId) return;
    if (m.pointerType === "mouse" && m.buttons === 0) stop(m);
    else move(m);
  };
  const onUp = (u: PointerEvent): void => {
    if (u.pointerId === start.pointerId) stop(u);
  };
  const stop = (last?: PointerEvent): void => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    end(last);
  };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  return () => stop();
}

/**
 * Gestures each held by one pointer, from the press that takes it until that
 * pointer is let go or cancelled. A gesture holds the keys it is taken with, and
 * a press by another pointer on any key held meanwhile takes nothing.
 */
export class PointerHolds<K> {
  private readonly held = new Map<K, { pointerId: number; stop: () => void }>();

  /**
   * Whether the pointer that pressed in `ev` may take `keys`: not while another
   * pointer holds one of them. A pointer that presses while it holds one was let
   * go where the page did not hear it, and what it held ends here.
   */
  take(ev: PointerEvent, keys: readonly K[]): boolean {
    const holders = new Set(keys.flatMap((k) => this.held.get(k) ?? []));
    for (const h of holders) if (h.pointerId !== ev.pointerId) return false;
    for (const h of holders) h.stop();
    return true;
  }

  /** Follow `start`'s pointer as `followPointer` does, holding `keys` until it ends. Returns what ends it early. */
  follow(start: PointerEvent, keys: readonly K[], move: (m: PointerEvent) => void, end: (last?: PointerEvent) => void): () => void {
    const held = { pointerId: start.pointerId, stop: (): void => undefined };
    held.stop = followPointer(start, move, (last) => {
      for (const k of keys) if (this.held.get(k) === held) this.held.delete(k);
      end(last);
    });
    for (const k of keys) this.held.set(k, held);
    return held.stop;
  }
}

/** The values held by a drag, by path, for each store that holds them. */
const valueHolds = new WeakMap<AppContext["store"], PointerHolds<string>>();

function valueHoldsOf(ctx: AppContext): PointerHolds<string> {
  let holds = valueHolds.get(ctx.store);
  if (!holds) {
    holds = new PointerHolds();
    valueHolds.set(ctx.store, holds);
  }
  return holds;
}

export function scrollbar(
  target: HTMLElement,
  track: number,
  unit = 1,
  always = false,
  gap = unit > 1 ? unit - Math.round(unit * 0.8) : 0,
  minThumb = 0,
  focus?: { ctx: AppContext; key: string },
): HTMLElement {
  const thumb = el("div", { class: "scroll-thumb" });
  const bar = el("div", { class: "scrollbar", children: [thumb] });
  // The bar counts the list in rows, not in pixels. The gap after a row belongs
  // to the row, so a list of n rows is n units tall however it is spaced.
  const rows = (): { total: number; inView: number } => {
    return { total: (target.scrollHeight + gap) / unit, inView: (target.clientHeight + gap) / unit };
  };
  const thumbHeight = (): number => {
    const { total, inView } = rows();
    return Math.min(track, Math.max(minThumb, (track * Math.min(inView, total)) / total));
  };
  const size = (): void => {
    const { total, inView } = rows();
    const height = thumbHeight();
    thumb.style.height = `${height}px`;
    // The thumb travels the rest of the well while the list scrolls through the rows out of view.
    const hidden = total - inView;
    thumb.style.top = `${hidden > 0 ? ((track - height) * (target.scrollTop / unit)) / hidden : 0}px`;
    bar.hidden = !always && total <= inView;
  };
  target.addEventListener("scroll", size);
  // The list can hold the page's focus, so the keys scroll it.
  target.classList.add("scroll-host");
  target.tabIndex = -1;
  // A bar the knob can turn takes the focus when its list or the bar is touched,
  // or the keys bring the focus to the list itself, and wears the pink rim while it holds it.
  if (focus) {
    markFocus(focus.ctx, bar, focus.key);
    for (const n of [target, bar]) n.addEventListener("pointerdown", () => focus.ctx.focus.takeKey(focus.key));
    target.addEventListener("focus", () => focus.ctx.focus.takeKey(focus.key));
  }

  // The unit scrolls a list by dragging it; the thumb can also be taken
  // directly. The gesture is followed on the window so it survives the pointer
  // leaving the list, and a drag that passed the slop swallows the click the
  // list would otherwise end it in, so a row under the finger does not fire.
  // The list and the thumb move as far on the screen as the pointer does, at
  // whatever scale the glass is drawn; the slop is measured on the page.
  // One pointer at a time drags the list, by its rows or by its thumb.
  const holds = new PointerHolds<HTMLElement>();
  const drag = (start: PointerEvent, reach: (moved: number) => number): void => {
    // The main button drags, as a finger and a pen's tip do; the other buttons do not.
    if (start.button !== 0 || !holds.take(start, [target])) return;
    const from = target.scrollTop;
    const glass = target.closest<HTMLElement>(".lcd");
    const scale = glass ? drawnScale(glass) : 1;
    let dragged = false;
    const swallow = (ev: Event): void => {
      ev.stopPropagation();
      ev.preventDefault();
    };
    const move = (m: PointerEvent): void => {
      const moved = m.clientY - start.clientY;
      if (!dragged && Math.abs(moved) < DRAG_SLOP_PX) return;
      dragged = true;
      target.scrollTop = from + reach(moved / scale);
    };
    const up = (): void => {
      if (!dragged) return;
      target.addEventListener("click", swallow, true);
      setTimeout(() => target.removeEventListener("click", swallow, true), 0);
    };
    holds.follow(start, [target], move, up);
  };

  // A finger on the rows or on the thumb scrolls the list and leaves the page where it is.
  target.style.touchAction = "none";
  thumb.style.touchAction = "none";
  target.addEventListener("pointerdown", (ev) => {
    target.focus({ preventScroll: true });
    drag(ev, (moved) => -moved);
  });
  thumb.addEventListener("pointerdown", (ev) => {
    target.focus({ preventScroll: true });
    const travel = track - thumbHeight();
    const range = target.scrollHeight - target.clientHeight;
    drag(ev, (moved) => (travel > 0 ? (moved / travel) * range : 0));
  });
  queueMicrotask(size);
  return bar;
}

/** The shortest thumb the bar of a carded list draws. */
export const LIST_THUMB_MIN_PX = 15;

/**
 * A tab down the side rail. The unit draws a glyph above the name, so the tab
 * takes one rather than being text alone.
 */
export function sideTab(
  label: string,
  on: boolean,
  onTap: () => void,
  icon?: SVGSVGElement,
  extraClass = "",
): HTMLElement {
  // The glyph's space is kept whether or not the tab has one, so a tab without
  // sets its name at the same height as the tabs beside it.
  const node = el("button", {
    class: `btn btn-toggle side-tab${label.includes("\n") ? " side-tab-wrapped" : ""} ${extraClass}`.trim(),
    onTap,
    children: [
      el("span", { class: "side-tab-icon", children: icon ? [icon] : [] }),
      el("span", { class: "side-tab-label", text: label }),
    ],
  });
  setPressed(node, on);
  return node;
}

/** How many options the glass shows before a list has to open on a sheet. */
export const OPTIONS_ON_THE_GLASS = 5;

/** How many choices a sheet sets across, where the list does not say otherwise. */
const SHEET_COLUMNS = 4;

/** The sheet a list too long for the glass opens on, named after the setting. */
export function optionSheet(
  ctx: AppContext,
  label: string,
  options: readonly string[],
  current: string,
  onPick: (value: string) => void,
  columns = SHEET_COLUMNS,
): HTMLElement {
  return pickerSheet(ctx, {
    title: label,
    label,
    build: (close) => {
      const rows: (HTMLElement | null)[][] = [];
      for (let i = 0; i < options.length; i += columns) {
        const row = options.slice(i, i + columns).map((o) =>
          toggle(o, o === current, () => {
            onPick(o);
            close();
            ctx.repaint();
          }, "source-btn"),
        );
        rows.push([...row, ...Array<null>(columns - row.length).fill(null)]);
      }
      return pickerGrid(rows);
    },
  });
}

/** A value drawn as a mark rather than written, or nothing where it is written. */
export type OptionFace = (value: string) => Element | null;

/** Put the mark `face` draws for `value` in place of the words in `node`, keeping the words as its name. */
export function drawFace(node: HTMLElement, value: string, face: OptionFace | undefined): HTMLElement {
  const mark = face?.(value);
  if (!mark) return node;
  node.replaceChildren(mark);
  node.setAttribute("aria-label", value);
  return node;
}

/** A box that shows its value and opens the list of values it can take. */
export function pulldown(
  ctx: AppContext,
  value: string,
  options: readonly string[],
  onPick: (v: string) => void,
  look: Pick<OptionListSpec, "render" | "optionClass" | "listClass" | "place"> & {
    label?: string;
    open?: () => void;
    columns?: number;
    /** What the list marks as held, where the box prints the value by another name. */
    current?: string;
    /**
     * Draws a value as a mark, in the box and in the list on the glass. The sheet's
     * tiles carry names alone, so a long list that draws marks gives itself a place.
     */
    face?: OptionFace;
  } = {},
): HTMLElement {
  const node = el("div", {
    class: "pulldown",
    attrs: { "aria-haspopup": "listbox" },
    children: [drawFace(el("span", { class: "pulldown-value", text: value }), value, look.face), el("span", { class: "pulldown-mark" })],
  });
  const { label, open, columns, current, face, ...list } = look;
  const held = current ?? value;
  // A list the glass cannot hold opens on the sheet the unit opens a long list
  // on. A list that draws its own faces stays on the glass, since the sheet's
  // tiles carry names alone, and so does one the caller has given a place.
  const onSheet = !open && !list.render && !list.listClass && options.length > OPTIONS_ON_THE_GLASS;
  const render = face ? (o: string): Node => face(o) ?? document.createTextNode(o) : undefined;
  makeTappable(
    node,
    open ??
      (onSheet
        ? () => optionSheet(ctx, label ?? value, options, held, onPick, columns)
        : () =>
            openOptions(ctx, {
              value: held,
              options,
              onPick,
              anchor: node,
              ...(render ? { render } : {}),
              ...list,
            })),
  );
  node.setAttribute("aria-label", `${label ? `${label}: ` : ""}${value} (${options.length} options)`);
  return node;
}

export interface PickerSheetSpec {
  /** The name band across the top of the sheet. */
  title: string;
  /** What the sheet is choosing, for a reader who cannot see the band. */
  label?: string;
  /** The panel's own class, for a sheet with a shape of its own. */
  sheetClass?: string;
  /** Builds what stands under the band. `close` shuts the sheet. */
  build: (close: () => void) => HTMLElement;
  /** The well the bar runs in, for choices that do not all fit. */
  scroll?: { track: number; unit: number };
}

/**
 * The sheet the unit drops over a screen to choose a value on: a panel carrying
 * a name band, the way out in its top right corner, and the choices under them.
 * It covers the lower half of the toolbar, which the main area cannot reach, so
 * it hangs off the glass rather than off the screen it was opened from.
 */
export function pickerSheet(ctx: AppContext, spec: PickerSheetSpec): HTMLElement {
  // The shell hands back the way to shut it, and that is the only way it may be
  // shut: removing the node alone would leave the shell holding a closer for a
  // sheet that is no longer there.
  let close = (): void => undefined;
  const content = spec.build(() => close());

  const back = button("", () => close(), "source-back");
  back.setAttribute("aria-label", `Close the ${spec.label ?? spec.title} list`);
  back.appendChild(Icons.back());

  const panel = el("div", {
    class: `source-popup ${spec.sheetClass ?? "source-sheet"}`.trim(),
    children: [el("div", { class: "source-title", text: spec.title }), back, content],
  });
  if (spec.scroll) {
    const bar = scrollbar(content, spec.scroll.track, spec.scroll.unit, false, undefined, 0, { ctx, key: `sheet.${spec.title}` });
    bar.classList.add("source-scrollbar");
    panel.appendChild(bar);
  }

  const sheet = el("div", {
    class: "source-overlay",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": spec.label ?? spec.title },
    children: [panel],
  });
  sheet.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    ev.stopPropagation();
    close();
  });
  close = ctx.overlay(sheet);
  queueMicrotask(() => back.focus());
  return sheet;
}

/** The choices of a picker sheet, four to a row; a null leaves a place empty. */
/** The rows a pick column shows at a time, and the pitch and the track of its bar. */
const PICK_ROWS = 5;
const PICK_ROW_PITCH_PX = 38;
const PICK_TRACK_PX = 178;

export interface PickDialogSpec {
  title: string;
  /** A second line under the title. */
  sub?: string;
  onCancel: () => void;
  onOk: () => void;
  /** What stands under the title. */
  body: HTMLElement[];
}

/**
 * A dialog that takes the glass over to set something: a pale sheet with
 * [Cancel] and [OK] as buttons of their own in its top corners, the title
 * between them, and what is being set under it. Nothing is applied before [OK].
 */
export function pickDialog(spec: PickDialogSpec): HTMLElement {
  return el("div", {
    class: "pick-dialog",
    children: [
      button("Cancel", spec.onCancel, "pick-dialog-btn pick-dialog-cancel"),
      button("OK", spec.onOk, "pick-dialog-btn pick-dialog-ok"),
      el("h1", { class: "pick-dialog-title", text: spec.title }),
      ...(spec.sub ? [el("p", { class: "pick-dialog-sub", text: spec.sub })] : []),
      ...spec.body,
    ],
  });
}

/**
 * One column of a pick dialog: an optional caption, the options five rows at a
 * time on a tray, and the bar beside the tray. A column with fewer than five
 * options still draws five rows.
 */
export function pickColumn(
  caption: string | null,
  options: readonly string[],
  current: string,
  onPick: (value: string) => void,
  extraClass = "",
  focus?: { ctx: AppContext; key: string },
): HTMLElement {
  const rows = el("div", { class: "pick-dialog-rows" });
  for (let i = 0; i < Math.max(PICK_ROWS, options.length); i++) {
    const label = options[i];
    if (label === undefined) {
      rows.appendChild(el("div", { class: "pick-dialog-row is-empty" }));
      continue;
    }
    rows.appendChild(toggle(label, label === current, () => onPick(label), "pick-dialog-row"));
  }
  // A pick further down the list than the rows in view keeps the list scrolled
  // to it when the dialog is drawn again.
  const at = options.indexOf(current);
  if (at >= PICK_ROWS) {
    queueMicrotask(() => {
      rows.scrollTop = (at - Math.floor(PICK_ROWS / 2)) * PICK_ROW_PITCH_PX;
    });
  }
  const bar = scrollbar(rows, PICK_TRACK_PX, PICK_ROW_PITCH_PX, true, undefined, 0, focus);
  bar.classList.add("pick-dialog-bar");
  return el("div", {
    class: `pick-dialog-col${caption === null ? " is-bare" : ""} ${extraClass}`.trim(),
    children: [...(caption === null ? [] : [el("div", { class: "pick-dialog-head", text: caption })]), rows, bar],
  });
}

export function pickerGrid(rows: (HTMLElement | null)[][]): HTMLElement {
  return el("div", {
    class: "source-grid",
    children: rows.map((row) =>
      el("div", {
        class: "source-row",
        children: row.map((cell) => cell ?? el("div", { class: "source-spacer" })),
      }),
    ),
  });
}

/** Set on the page while a value is being dragged. */
const TURNING = "is-turning";

/** Pointer travel past the slop that covers a control's whole range, in pixels. */
const DRAG_FULL_RANGE_PX = 192;

/** How much of the range a drag covers while Shift is held. */
const DRAG_FINE = 0.2;

/**
 * Make `node` turn `spec`. A drag along `drag`'s axis (up the screen by default)
 * counts from DRAG_SLOP_PX off the press and runs the whole range in
 * DRAG_FULL_RANGE_PX from there, or a fifth of it with Shift held;
 * the wheel and the arrow keys move one detent, or with Shift the spec's
 * `fastStep` where it has one, and Home and End go to either end; a key
 * held with Alt, Cmd or Ctrl is left to the browser. `onEngage` runs
 * when a pointer or a key starts a turn. The value box, the rotaries and the
 * HOME strip level share this, so a parameter behaves the same wherever it is
 * reachable.
 */
export function attachSpin(
  ctx: AppContext,
  node: HTMLElement,
  spec: NumericSpec,
  onEngage?: () => void,
  drag: boolean | DragAxis = true,
): void {
  const value = (): number => ctx.store.num(spec.path, spec.fallback);
  const still = (): boolean => standsStill(ctx, spec);
  const put = (v: number): void => putValue(ctx, spec, v);

  const nudge = (steps: number, fast: boolean): void => {
    const travel = spec.travel;
    if (travel) {
      put(travel.step(value(), steps));
      return;
    }
    const size = fast ? (spec.fastStep ?? spec.step) : spec.step;
    put(onStep(spec, value() + steps * size));
  };

  // A control whose touch does something else of its own turns by the wheel and the keys alone.
  if (drag !== false) attachDrag(ctx, node, spec, onEngage, typeof drag === "object" ? drag : { axis: "y" });

  node.addEventListener(
    "wheel",
    (ev) => {
      // A wheel turned sideways turns nothing and scrolls the page.
      if (ev.deltaY === 0) return;
      ev.preventDefault();
      if (still()) return;
      nudge(ev.deltaY < 0 ? 1 : -1, ev.shiftKey);
    },
    { passive: false },
  );

  node.addEventListener("keydown", (ev) => {
    // A control inside this one, such as a block's switch, keeps the keys it takes.
    if (fromInnerControl(ev, node)) return;
    if (ev.altKey || ev.metaKey || ev.ctrlKey) return;
    const map: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1 };
    const ends: Record<string, number> = { Home: 0, End: 1 };
    const dir = map[ev.key];
    const end = ends[ev.key];
    if (dir === undefined && end === undefined) return;
    ev.preventDefault();
    onEngage?.();
    if (still()) return;
    if (dir !== undefined) nudge(dir, ev.shiftKey);
    else if (end !== undefined) put(spec.travel ? spec.travel.valueAt(end) : end === 0 ? spec.min : spec.max);
  });
}

/**
 * A pinned focus leaves every other value on the screen still, the readout bar's included, and a value the unit is
 * holding itself stands still too. A value turned from off the screen turns whatever the screen pins.
 */
function standsStill(ctx: AppContext, spec: NumericSpec): boolean {
  return spec.locked === true || (spec.pinFree !== true && !ctx.focus.turns(spec.focusKey ?? spec.path));
}

function putValue(ctx: AppContext, spec: NumericSpec, v: number): void {
  void ctx.store.set(spec.path, clamp(v, spec.min, spec.max));
}

/**
 * `v` on the nearest of `spec`'s steps, the finer of `step` and `fastStep`, where a drag, the wheel and the keys all
 * leave a value.
 */
function onStep(spec: NumericSpec, v: number): number {
  const step = Math.min(spec.step, spec.fastStep ?? spec.step);
  return Number((Math.round(v / step) * step).toFixed(6));
}

/**
 * Make a drag of `node` along one axis turn `spec`, counted from DRAG_SLOP_PX
 * off the press: the whole range in DRAG_FULL_RANGE_PX from there, or a fifth of
 * it with Shift held. A press that moves less turns nothing. A grip that sets two
 * values takes one of these for each axis.
 */
export function attachDrag(ctx: AppContext, node: HTMLElement, spec: NumericSpec, onEngage: (() => void) | undefined, drag: DragAxis): void {
  // Which way the pointer carries the value up: down the screen for a fader, and
  // along it for a grip that stands on the axis its value runs on.
  const axis = drag.axis;
  const sense = (drag.sense ?? 1) * (axis === "x" ? -1 : 1);
  const along = (ev: { clientX: number; clientY: number }): number => (axis === "x" ? ev.clientX : ev.clientY) * sense;
  const put = (v: number): void => putValue(ctx, spec, v);
  // A finger turns the value and leaves the page where it is. A grip drawn in an
  // SVG holds its whole drawing still under the finger.
  node.style.touchAction = "none";
  if (node instanceof SVGElement) node.ownerSVGElement?.style.setProperty("touch-action", "none");
  node.addEventListener("pointerdown", (ev) => {
    // The main button turns the value, as a finger and a pen's tip do; the other buttons do not.
    if (ev.button !== 0) return;
    // One pointer at a time turns a value, and each value a turn of it writes as
    // well, such as a linked pair's other channel, on whatever control turns them.
    const holds = valueHoldsOf(ctx);
    const held = [spec.path, ...ctx.store.carries(spec.path, ctx.store.num(spec.path, spec.fallback))];
    if (!holds.take(ev, held)) return;
    onEngage?.();
    if (standsStill(ctx, spec)) return;
    // A drag sweeps the pointer across whatever is in its way; marking the page
    // is what keeps those from lighting up under it.
    document.documentElement.classList.add(TURNING);
    let anchorAt = along(ev);
    let anchorValue = ctx.store.num(spec.path, spec.fallback);
    let fine = false;
    let dragged = false;
    const move = (m: PointerEvent): void => {
      // A pointer within DRAG_SLOP_PX of the press along the axis is a tap and
      // turns nothing; a drag counts from the edge of the slop it passed, as
      // fine as Shift makes it there.
      if (!dragged) {
        const moved = along(m) - anchorAt;
        if (Math.abs(moved) < DRAG_SLOP_PX) return;
        dragged = true;
        anchorAt += Math.sign(moved) * DRAG_SLOP_PX;
        fine = m.shiftKey;
      }
      // Taking Shift up or down mid-drag re-anchors, so the value does not jump
      // to where the coarse gesture would have put it.
      if (m.shiftKey !== fine) {
        anchorAt = along(m);
        anchorValue = ctx.store.num(spec.path, spec.fallback);
        fine = m.shiftKey;
      }
      // Position, not value: on a fader the two are not the same, and the mark
      // has to follow the pointer rather than the dB.
      const travel = spec.travel;
      const reach = ((anchorAt - along(m)) / DRAG_FULL_RANGE_PX) * (fine ? DRAG_FINE : 1);
      // At the anchor the value goes back to the one it was anchored at, on its
      // steps or not, and a value that reads that already is left unwritten.
      if (reach === 0) {
        if (ctx.store.num(spec.path, spec.fallback) !== anchorValue) put(anchorValue);
        return;
      }
      if (travel) {
        put(travel.valueAt(clamp(travel.position(anchorValue) + reach, 0, 1)));
        return;
      }
      const raw = anchorValue + reach * (spec.max - spec.min);
      put(onStep(spec, raw));
    };
    const up = (): void => {
      document.documentElement.classList.remove(TURNING);
      leave();
    };
    // The first turn repaints the screen and this node is replaced, so the rest
    // of the gesture is followed on the window rather than on the node.
    const stop = holds.follow(ev, held, move, up);
    // The drag ends with the screen it started on.
    const leave = ctx.nav.onChange(stop);
  });
}

/** Which way a drag carries a value: down the screen, or along it. */
export interface DragAxis {
  axis: "x" | "y";
  /** -1 where the control stands at the value's mirror, as a boundary under a threshold does. */
  sense?: 1 | -1;
}

/**
 * Give `node` the range and the reading of `spec` at `value` as numbers. A travel
 * whose last stop no number names (a ratio of INF) reads out the stop before it
 * as its top, and the text names the value itself.
 */
export function setAriaValue(node: Element, spec: NumericSpec, value: number): void {
  const top = Number.isFinite(spec.max) || !spec.travel ? spec.max : spec.travel.step(spec.max, -1);
  node.setAttribute("aria-valuenow", String(Number.isFinite(value) ? value : clamp(value, spec.min, top)));
  node.setAttribute("aria-valuemin", String(spec.min));
  node.setAttribute("aria-valuemax", String(top));
  node.setAttribute("aria-valuetext", formatValue(spec, value));
}

/**
 * A numeric value box. Touching it draws the pink focus border; dragging it
 * vertically, the wheel and the arrow keys turn the value.
 */
export function valueBox(ctx: AppContext, spec: NumericSpec, extraClass = "", framed = true, locked = false): HTMLElement {
  const value = ctx.store.num(spec.path, spec.fallback);
  const node = el("div", {
    class: `value-box ${extraClass}`.trim(),
    text: spec.format(value) + unitOf(spec.boxUnit, value),
    attrs: {
      role: "spinbutton",
      "aria-label": spec.label,
      // A box the unit reads out but does not let the operator turn keeps its
      // reading and its name, and takes no key and no drag.
      ...(locked ? { "aria-disabled": "true" } : {}),
    },
  });
  setAriaValue(node, spec, value);
  if (locked) return node;
  node.tabIndex = 0;
  if (framed) markFocus(ctx, node, spec.focusKey ?? spec.path);

  attachSpin(ctx, node, spec, () => ctx.focus.take(spec));

  return node;
}

/** A parameter as the screens print it: its caption over the box that turns it. */
export function paramCell(ctx: AppContext, spec: NumericSpec): HTMLElement {
  // The unit draws the knob that turns the value under the box, the same way a
  // channel screen does.
  // A card's knob at the bottom of its range keeps a lit dot at the start of the
  // track; a level that is off lights nothing.
  const value = ctx.store.num(spec.path, spec.fallback);
  const knob = knobGraphic(fractionOf(spec, value), undefined, undefined, undefined, formatValue(spec, value) !== OFF_MARK);
  attachSpin(ctx, knob, spec, () => ctx.focus.take(spec));
  knob.classList.add("is-control");
  return el("div", {
    class: "param-cell",
    children: [el("span", { class: "param-caption", text: spec.label }), valueBox(ctx, spec), knob],
  });
}

/**
 * The small rotary graphic on a channel strip: a dial with a mark, and a track
 * around it that lights from the start of the travel up to the current value.
 * It is a picture of the value, not a control.
 *
 * `size` is the whole graphic including the track; the dial fills the middle.
 */
export function knobGraphic(fraction: number, size = KNOB_SIZE, origin = 0, sweep = KNOB_SWEEP_DEG, restDot = false): HTMLElement {
  const f = clamp(fraction, 0, 1);
  const start = sweep === KNOB_SWEEP_DEG ? KNOB_START_DEG : 180 + (360 - sweep) / 2;
  const angle = start + f * sweep;

  // The track is one circle drawn twice: the dash pattern shortens the second
  // copy to the lit part. The circle starts at 3 o'clock, so it is turned back
  // to where the lit part begins. A control placed from its centre (a pan) lights
  // from there rather than from the bottom of the travel.
  const mid = size / 2;
  const R = mid - 1.75;
  const circumference = 2 * Math.PI * R;
  const arc = document.createElementNS(SVG_NS, "svg");
  arc.setAttribute("viewBox", `0 0 ${size} ${size}`);
  arc.setAttribute("class", "knob-arc");
  for (const [cls, from, span] of [
    ["knob-arc-track", 0, sweep],
    ["knob-arc-fill", Math.min(origin, f) * sweep, Math.abs(f - origin) * sweep],
  ] as const) {
    // A zero-length dash paints a dot under a round cap: at the bottom of the
    // travel the lit arc is that dot where `restDot` asks for it, and is left out
    // otherwise.
    if (span <= 0 && !(restDot && cls === "knob-arc-fill")) continue;
    const c = document.createElementNS(SVG_NS, "circle");
    c.setAttribute("class", cls);
    c.setAttribute("cx", String(mid));
    c.setAttribute("cy", String(mid));
    c.setAttribute("r", String(R));
    c.setAttribute("transform", `rotate(${start + from - 90} ${mid} ${mid})`);
    c.setAttribute("stroke-dasharray", `${(span / 360) * circumference} ${circumference}`);
    arc.appendChild(c);
  }

  const face = el("div", {
    class: "knob-face",
    children: [el("div", { class: "knob-pointer", style: { transform: `rotate(${angle}deg)` } })],
  });
  // A control placed from the centre marks the top of its travel.
  const mark = origin === 0.5 ? [el("span", { class: "knob-centre-mark" })] : [];
  const node = el("div", {
    class: "knob-graphic",
    style: { width: `${size}px`, height: `${size}px` },
    children: [arc as unknown as HTMLElement, face, ...mark],
  });
  node.setAttribute("aria-hidden", "true");
  return node;
}

/** The rotary `spec` draws at `value`, for a screen that only shows it. */
export function knobPicture(spec: NumericSpec, value: number, size?: number): HTMLElement {
  // A pan or a balance is placed from the centre, so its arc lights from there.
  return knobGraphic(fractionOf(spec, value), size, spec.centred ? 0.5 : 0, spec.sweep);
}

/**
 * The rotary that pictures `spec`, turned by a drag or the wheel. The value box
 * beside it carries the keyboard and the announcement, so this stays out of the
 * tab order rather than offering the same parameter twice.
 */
export function knobControl(ctx: AppContext, spec: NumericSpec, size?: number): HTMLElement {
  const node = knobPicture(spec, ctx.store.num(spec.path, spec.fallback), size);
  node.classList.add("is-control");
  attachSpin(ctx, node, spec, () => ctx.focus.take(spec));
  return node;
}

/** Position of `value` on the control's travel, for a knob graphic or a slider. */
export function fractionOf(spec: NumericSpec, value: number): number {
  if (spec.travel) return spec.travel.position(value);
  if (spec.markAt) return spec.markAt(value);
  if (spec.max === spec.min) return 0;
  return (value - spec.min) / (spec.max - spec.min);
}

export interface MeterOptions {
  /** Segment levels in dB; one bar per entry, so two entries is a stereo meter. */
  levels: number[];
  height?: number;
  /**
   * Strip this meter belongs to. The meter ticker refreshes how much of each
   * bar is lit in place, so a moving signal never forces a full repaint of the
   * screen.
   */
  source?: string;
  /** One channel of a two-channel source, which the single bar shows. */
  lane?: number;
}

export function meter(options: MeterOptions): HTMLElement {
  // The colour bands belong to the bar, so they are laid over it whole and cut
  // off at the level (`--unlit`, the share of the bar above it); nothing is
  // painted over them to hide the unlit part. Filling upward with a gradient
  // instead would end every level in the top band's colour.
  // Each lane is a clip dot over a bar, lit on `levelBarShare`: the dot lights
  // when the level reaches the top of the bar.
  const bars = options.levels.map((db) => {
    const share = levelBarShare(db);
    const bar = el("div", { class: "meter-bar", style: { "--unlit": `${(1 - share) * 100}%` } });
    const clip = el("div", { class: `meter-clip${share >= 1 ? " is-on" : ""}` });
    return el("div", { class: "meter-lane", children: [clip, bar] });
  });
  const node = el("div", {
    class: "meter",
    style: options.height ? { height: `${options.height}px` } : {},
    attrs: { "aria-hidden": "true" },
    children: bars,
  });
  if (options.source) {
    node.dataset["meterSource"] = options.source;
    if (options.lane !== undefined) node.dataset["meterLane"] = String(options.lane);
  }
  return node;
}

/** A horizontal PAN / BALANCE slider, as drawn under the ON/CUE buttons. */
export function panSlider(value: number, min = -63, max = 63): HTMLElement {
  const f = clamp((value - min) / (max - min), 0, 1);
  return el("div", {
    class: "pan-slider",
    attrs: { "aria-hidden": "true" },
    children: [el("div", { class: "pan-thumb", style: { left: `${f * 100}%` } })],
  });
}

export interface ListRow {
  key: string;
  cells: (string | HTMLElement)[];
  selected?: boolean;
  onTap?: () => void;
}

export function listView(columns: string[], rows: ListRow[], extraClass = ""): HTMLElement {
  const head = el("div", {
    class: "list-head",
    children: columns.map((c) => el("div", { class: "list-cell", text: c })),
  });
  const body = el("div", { class: "list-body", attrs: { role: "listbox" } });
  for (const r of rows) {
    const row = el("div", {
      class: `list-row${r.selected ? " is-selected" : ""}`,
      attrs: { role: "option", "aria-selected": r.selected ? "true" : "false" },
      children: r.cells.map((c) =>
        typeof c === "string" ? el("div", { class: "list-cell", text: c }) : el("div", { class: "list-cell", children: [c] }),
      ),
    });
    if (r.onTap) makeTappable(row, r.onTap);
    body.appendChild(row);
  }
  return el("div", { class: `list-view ${extraClass}`.trim(), children: [head, body] });
}

export interface DialogOptions {
  message: string;
  okLabel?: string;
  cancelLabel?: string;
  /** Whether [OK] is the only answer, with no [Cancel] beside it. */
  okOnly?: boolean;
  /** Whether the dialog warns: its frame and mark take the warning colour, and the mark is the triangle. */
  caution?: boolean;
  onOk: () => void;
  onCancel?: () => void;
}

export interface DropdownSpec {
  /** What the box says. */
  label: string;
  value: string;
  options: readonly string[];
  onPick: (value: string) => void;
  /** Carries where the list opens and how its columns run. */
  listClass?: string;
  /** Options the list draws on a face that cannot be used, and that take nothing. */
  disabled?: readonly string[];
}

/** Where `node` sits inside `root`, in the frame's own pixels. */
function offsetWithin(node: HTMLElement, root: HTMLElement): { left: number; top: number; bottom: number } {
  let left = 0;
  let top = 0;
  let n: HTMLElement | null = node;
  while (n && n !== root) {
    left += n.offsetLeft;
    top += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return { left, top, bottom: top + node.offsetHeight };
}

interface OptionListSpec {
  value: string;
  options: readonly string[];
  onPick: (value: string) => void;
  /** Places the list. Without one it opens against `anchor`. */
  listClass?: string;
  anchor?: HTMLElement;
  /** Draws an option's face in place of its name, which stays its accessible label. */
  render?: (option: string) => Node;
  /** A class of the options' own, for options that take a shape of their own. */
  optionClass?: string;
  /** Options the list draws on a face that cannot be used, and that take nothing. */
  disabled?: readonly string[];
  /** Where an option stands in the list's own grid, for a list the unit lays out. */
  place?: (option: string, index: number) => { row: number; column: number };
}

/**
 * The list of values a box can take, over the screen. It closes on a pick, on a
 * tap outside it, or on Escape.
 */
function openOptions(ctx: AppContext, spec: OptionListSpec): void {
  const list = el("div", { class: `dropdown-list ${spec.listClass ?? ""}`.trim(), attrs: { role: "listbox" } });
  const sheet = el("div", { class: "dropdown-sheet", children: [list] });
  // The screen under it can go away while it is open, so the key it holds is
  // given up by the overlay rather than by the closer alone.
  const close = ctx.overlay(sheet, () => window.removeEventListener("keydown", onKey));
  function onKey(ev: KeyboardEvent): void {
    if (ev.key !== "Escape") return;
    ev.preventDefault();
    close();
  }
  for (const option of spec.options) {
    const out = spec.disabled?.includes(option) === true;
    const node = toggle(option, option === spec.value, () => {
      if (out) return;
      close();
      spec.onPick(option);
    }, `dropdown-option ${spec.optionClass ?? ""}${out ? " is-disabled" : ""}`.trim());
    if (out) node.setAttribute("aria-disabled", "true");
    const at = spec.place?.(option, list.childElementCount);
    if (at) {
      node.style.gridRow = String(at.row);
      node.style.gridColumn = String(at.column);
    }
    if (spec.render) {
      node.textContent = "";
      node.appendChild(spec.render(option));
      node.setAttribute("aria-label", option);
    }
    list.appendChild(node);
  }
  sheet.addEventListener("click", (ev) => {
    if ((ev.target as HTMLElement).closest(".dropdown-list")) return;
    close();
  });
  window.addEventListener("keydown", onKey);

  // A list with no place of its own opens under the box it belongs to, pulled
  // back onto the screen when it would run off an edge.
  const root = sheet.parentElement;
  if (!spec.listClass && spec.anchor && root) {
    const at = offsetWithin(spec.anchor, root);
    const room = { width: root.offsetWidth, height: root.offsetHeight };
    const below = at.bottom + 2;
    const above = at.top - 2 - list.offsetHeight;
    const lowest = room.height - 2 - list.offsetHeight;
    list.style.left = `${Math.max(2, Math.min(at.left, room.width - 2 - list.offsetWidth))}px`;
    list.style.top = `${Math.max(2, below > lowest ? (above >= 2 ? above : lowest) : below)}px`;
  }
}

/** A box that names a setting and opens the list of values it can take. */
export function dropdown(ctx: AppContext, spec: DropdownSpec): HTMLElement {
  return el("button", {
    class: "dropdown-box",
    attrs: { "aria-haspopup": "listbox", "aria-label": `${spec.label}: ${spec.value}` },
    children: [el("span", { text: spec.label }), el("span", { class: "dropdown-mark", text: "▼" })],
    onTap: () => openOptions(ctx, spec),
  });
}

/**
 * The confirmation box the guide describes under "Dialog box": a pale sheet
 * inside a blue frame, asking beside an information mark. Mount it with
 * ctx.overlay so it lands inside the screen frame.
 */
/**
 * The modal the unit holds up while a screen loads: the dialog's frame with a
 * turning ring where the question mark goes, and no way to answer it. It is not
 * a focus trap — nothing in it can be operated, and it takes itself down.
 */
export function loadingDialog(message = "Loading..."): HTMLElement {
  return el("div", {
    class: "dialog-overlay",
    attrs: { role: "status", "aria-live": "polite" },
    children: [
      el("div", {
        class: "dialog",
        children: [
          el("div", {
            class: "dialog-ask",
            children: [
              el("span", { class: "dialog-mark dialog-spinner", children: [Icons.spinner()] }),
              el("p", { class: "dialog-text", text: message }),
            ],
          }),
        ],
      }),
    ],
  });
}

export function dialog(options: DialogOptions): HTMLElement {
  const close = (): void => overlay.remove();
  const overlay = el("div", {
    class: "dialog-overlay",
    attrs: { role: "dialog", "aria-modal": "true", "aria-label": options.message },
  });
  const ok = button(options.okLabel ?? "OK", () => {
    close();
    options.onOk();
  });
  const cancel = button(options.cancelLabel ?? "Cancel", () => {
    close();
    options.onCancel?.();
  });
  const focusable = options.okOnly === true ? [ok] : [cancel, ok];
  overlay.appendChild(
    el("div", {
      class: options.caution === true ? "dialog is-caution" : "dialog",
      children: [
        el("div", {
          class: "dialog-ask",
          children: [
            el("span", { class: "dialog-mark", children: [options.caution === true ? Icons.caution() : Icons.info()] }),
            el("p", { class: "dialog-text", text: options.message }),
          ],
        }),
        el("div", { class: "dialog-actions", children: focusable }),
      ],
    }),
  );
  // Focus trap: the guide's dialog blocks the screen behind it, so Tab has to
  // stay inside and Escape has to be the same as Cancel.
  overlay.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      // A modal takes the key: whatever is behind it must not act on it too.
      ev.stopPropagation();
      close();
      options.onCancel?.();
      return;
    }
    if (ev.key !== "Tab") return;
    const idx = focusable.indexOf(document.activeElement as HTMLElement);
    ev.preventDefault();
    const next = focusable[(idx + (ev.shiftKey ? -1 : 1) + focusable.length) % focusable.length];
    next?.focus();
  });
  queueMicrotask(() => ok.focus());
  return overlay;
}

