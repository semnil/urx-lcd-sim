// SCENE screen — the scene list, and store / recall (user guide, "SCENE screen"
// and "Other operations > Storing a scene").

import type { AppContext } from "../app/context";
import { perform } from "../app/perform";
import type { SceneBank, UnitOp } from "../device/unit";
import { applyScene, asPutBack, captureScene, readScene } from "../model/scene-state";
import { shippedScene } from "../model/scene-presets";
import { onlyHeld } from "../model/defaults";
import { onDynamicsTimeStops } from "../model/dynamics-times";
import { onPitchMidiControl } from "../model/effects";
import { dropInsertsOverRate } from "./insert-fx";
import { followRecall, pairStates } from "./stereo-link";
import { settlePanLink } from "./mix-bus";
import { onSsmcsStops } from "./ssmcs";
import { aimOf, aimed, el, lockable, markShut, writing } from "../ui/dom";
import { Icons } from "../ui/icons";
import { LIST_THUMB_MIN_PX, SHORT_PROGRESS_MS, button, dialog, listView, loadingDialog, menuButton, menuGrid, scrollbar, sideTab, toggle } from "../ui/widgets";
import { draftTitle, openTitleEntry } from "./title-entry";
import type { ScreenBody, ScreenDef } from "./types";
import { toJson } from "../device/value-json";
import { dropGeqOverRate } from "./geq";
import { keptByRecallSafe } from "./recall-safe";
import type { ParamValue } from "../device/path";
import type { DeviceStore } from "../device/store";
import { follows, type FollowState } from "./scene-follow";

function followState(store: DeviceStore): FollowState {
  let st = follows.get(store);
  if (st) return st;
  const state: FollowState = { pending: false, moved: false, writes: 0 };
  follows.set(store, state);
  // The unit's own move of the selection is followed, onto whatever row it lands, a row a touch
  // is waiting on included. It ends the touches before it: the next touch starts from the row it
  // moved to, and a refusal of a write made before it holds the list to nothing.
  store.onDeviceValue((path) => {
    if (path !== "scene.selected") return;
    state.moved = true;
    state.tap = undefined;
  });
  // A refusal that put back a row the touches stood on — the one before them, or one an earlier
  // touch's write took — leaves the list where it is; it is heard before the redraw that shows it.
  // A refusal that put nothing back is a later write's or the unit's to settle, and a value put
  // back that no touch stood on is the unit's own.
  store.onWriteFailure((f) => {
    if (f.path !== "scene.selected" || !f.putBack || !state.tap) return;
    if (typeof f.restored === "number" && state.tap.rows.has(f.restored)) state.followed = f.restored;
    state.tap = undefined;
  });
  return state;
}

/**
 * Scroll the list by whole rows until `row` stands in it entire, the least
 * that takes, and leave it where it is when the row is in view already.
 */
function bringIntoView(body: HTMLElement, row: HTMLElement): void {
  const view = body.getBoundingClientRect();
  const at = row.getBoundingClientRect();
  // The glass may be drawn scaled: the rectangles are in the page's pixels, the scroll in the list's own.
  const scale = view.height / body.clientHeight || 1;
  const above = (view.top - at.top) / scale;
  const below = (at.bottom - view.bottom) / scale;
  if (above > 0.5) body.scrollTop -= Math.ceil(above / SCENE_ROW_PITCH_PX) * SCENE_ROW_PITCH_PX;
  else if (below > 0.5) body.scrollTop += Math.ceil(below / SCENE_ROW_PITCH_PX) * SCENE_ROW_PITCH_PX;
}

/**
 * Bring the selected row into view and count the selection as followed, once
 * the list stands in the page with a height; a list drawn while it cannot be
 * shown waits until it can, on one watch per unit that a later draw replaces.
 */
function follow(st: FollowState, body: HTMLElement, row: HTMLElement | undefined, selected: number): void {
  st.watch?.disconnect();
  st.watch = undefined;
  const apply = (): boolean => {
    if (st.body !== body) return true;
    if (!row || !body.isConnected || body.clientHeight === 0) return false;
    bringIntoView(body, row);
    st.followed = selected;
    st.pending = false;
    st.moved = false;
    return true;
  };
  if (apply() || typeof ResizeObserver === "undefined") return;
  const watch = new ResizeObserver(() => {
    if (apply()) watch.disconnect();
  });
  st.watch = watch;
  watch.observe(body);
}

/** The numbers a unit stores scenes under run from 1 to this. */
const SCENE_COUNT = 63;

/** How far the thumb travels, a pixel in from each end of the bar's well, and the pitch one row of the list takes. */
const SCENE_TRACK_PX = 111;
const SCENE_ROW_PITCH_PX = 38;

/**
 * Preset scenes the unit ships with: P01 to P03, one per Simple Mode use case,
 * listed on the Simple tab, and P04 to P07, which System firmware V1.5 lists on
 * the Standard tab between 00 and 01. They take the numbers past the base, P01 first.
 */
const SIMPLE_PRESETS = ["Live Music 0", "Streaming 0", "DAW Rec 0"];
const STANDARD_PRESETS = ["Music Production", "DAW Streaming", "Sing&Talk Stream", "Game Streaming"];
const PRESETS = [...SIMPLE_PRESETS, ...STANDARD_PRESETS];
const PRESET_BASE = 100;

/** The banks a scene is stored on, in the order a number is looked up. */
const BANKS = ["Standard", "Simple"] as const;

/** A preset, numbered from P01. */
function isPreset(no: number): boolean {
  return no > PRESET_BASE;
}

/**
 * One of Simple Mode's presets, P01 to P03, whose number the unit draws green
 * (D0 p073-1). P04 to P07 are numbered as a user scene is drawn (p076-1).
 */
function isSimplePreset(no: number): boolean {
  return isPreset(no) && no <= PRESET_BASE + SIMPLE_PRESETS.length;
}

/**
 * A factory scene — 00 Initial Data and the presets: marked with the factory
 * icon in the Lock column, and never stored over, protected, deleted or renamed.
 */
function isFactoryLocked(no: number): boolean {
  return no === 0 || isPreset(no);
}

/**
 * A scene's number as the unit prints it: 00 to 63, and P01 upwards for a
 * preset. The HOME toolbar shows "00 Initial Data" on a factory unit.
 */
export function sceneNumber(no: number): string {
  return isPreset(no) ? `P${String(no - PRESET_BASE).padStart(2, "0")}` : String(no).padStart(2, "0");
}

/** The bank holding a scene under the number, or null where neither does. */
function storedBank(ctx: AppContext, no: number): (typeof BANKS)[number] | null {
  return BANKS.find((b) => ctx.store.str(`scene.${b}.${no}.title`, "")) ?? null;
}

/** How many scene numbers, 01 to 63, hold a stored scene. */
export function storedSceneCount(ctx: AppContext): number {
  return Array.from({ length: SCENE_COUNT }, (_, i) => i + 1).filter((no) => storedBank(ctx, no) !== null).length;
}

/** A scene's title: a preset's name, what a bank has stored under the number, or nothing where no scene is stored. */
export function sceneTitle(ctx: AppContext, no: number): string {
  if (isPreset(no)) return PRESETS[no - PRESET_BASE - 1] ?? "";
  if (no === 0) return ctx.store.str("scene.0.title", "Initial Data");
  const bank = storedBank(ctx, no);
  return bank ? ctx.store.str(`scene.${bank}.${no}.title`, "") : "";
}

/** Whether the scene stored under the number is protected from being stored over, deleted or renamed. */
function isProtected(ctx: AppContext, no: number): boolean {
  const bank = storedBank(ctx, no);
  return bank !== null && ctx.store.num(`scene.${bank}.${no}.protect`, 0) === 1;
}

/** Where a bank keeps the mixer it stored under a number. */
function statePath(bank: string, no: number): string {
  return `scene.${bank}.${no}.state`;
}

/**
 * Put a scene's mixer on the unit and mark it as the one recalled. The factory
 * scenes — 00 and the presets — hold the mixers the unit ships with, which
 * nothing stores over, so they are put back from those rather than from a stored
 * copy. A source whose digital gain the scene does not name comes back to 0 dB,
 * a BALANCE it does not name to the centre, and a GATE, COMP or DUCKER time or an
 * SSMCS frequency, Attack or Release it holds off its stops on the stop nearest it.
 * A value the unit does not hold is not put back.
 */
export async function recallScene(ctx: AppContext, no: number): Promise<void> {
  const bank = storedBank(ctx, no);
  const state = bank ? readScene(ctx.store, statePath(bank, no)) : isFactoryLocked(no) ? shippedScene(ctx.model, isPreset(no) ? no - PRESET_BASE : 0) : undefined;
  const pairs = pairStates(ctx);
  if (state) await applyScene(ctx.store, withoutKept(ctx, onSsmcsStops(onDynamicsTimeStops(onPitchMidiControl(asPutBack(ctx.store, onlyHeld(ctx.model, state)))))));
  followRecall(ctx, pairs);
  // A scene stored while Pan Link left each send's own placing where it was, or
  // kept Pan Link on over a FIXED bus, comes back as the unit would hold it.
  settlePanLink(ctx);
  await ctx.store.set("scene.current", no);
  // A scene carries the mixer and not the sampling frequency, so a stored insert
  // or Flex12GEQ can come back onto a unit that is running too fast for it.
  dropInsertsOverRate(ctx, ctx.store.num("setup.samplingFrequency", 48000));
  dropGeqOverRate(ctx, ctx.store.num("setup.samplingFrequency", 48000));
  ctx.repaint();
}

/** A recalled mixer less what RECALL SAFE keeps as it stands. */
function withoutKept(ctx: AppContext, state: Record<string, ParamValue>): Record<string, ParamValue> {
  const kept = keptByRecallSafe(ctx, Object.keys(state));
  return Object.fromEntries(Object.entries(state).filter(([path]) => !kept.has(path)));
}

/**
 * What [Store] does once it is answered: the mixer goes in under the number with
 * the title typed for it and becomes the scene recalled, the title, the mixer and
 * the number in one operation of the store, and `Scene store is in progress...`
 * stands over the list as long as the other short progress modals.
 */
function storeTitled(ctx: AppContext, bank: SceneBank, no: number, title: string): void {
  ctx.store.operation(() => {
    void ctx.store.set(`scene.${bank}.${no}.title`, title);
    void storeScene(ctx, bank, no);
  });
  let close = (): void => undefined;
  const timer = window.setTimeout(() => close(), SHORT_PROGRESS_MS);
  close = ctx.overlay(loadingDialog("Scene store is in progress..."), () => window.clearTimeout(timer));
}

/** Take the mixer as it stands into a scene number, and recall it, the scene and the number in one operation of the store. */
export async function storeScene(ctx: AppContext, bank: string, no: number): Promise<void> {
  const writes: Promise<void>[] = [];
  ctx.store.operation(() => {
    writes.push(ctx.store.set(statePath(bank, no), toJson(captureScene(ctx.store))), ctx.store.set("scene.current", no));
  });
  await Promise.all(writes);
  ctx.repaint();
}

/**
 * The scenes a bank lists: on Standard, 00, P04 to P07 and every number; on
 * Simple, P01 to P03 and the numbers Standard has not stored a scene under.
 */
function sceneRows(ctx: AppContext, bank: string): number[] {
  const numbers = Array.from({ length: SCENE_COUNT }, (_, i) => i + 1);
  const presets = (first: number, names: readonly string[]): number[] => names.map((_, i) => PRESET_BASE + first + i);
  if (bank !== "Simple") return [0, ...presets(SIMPLE_PRESETS.length + 1, STANDARD_PRESETS), ...numbers];
  return [...presets(1, SIMPLE_PRESETS), ...numbers.filter((n) => !ctx.store.str(`scene.Standard.${n}.title`, ""))];
}

/**
 * Once a settings file has put SCENE LIST's cursor back, open the tab that lists
 * its row where the tab standing open does not; a tab that lists it stays.
 */
export function followSceneCursor(ctx: AppContext): void {
  const bank = ctx.store.str("scene.bank", "Standard");
  const picked = ctx.store.num("scene.selected", 0);
  if (sceneRows(ctx, bank).includes(picked)) return;
  const other = bank === "Simple" ? "Standard" : "Simple";
  if (sceneRows(ctx, other).includes(picked)) void ctx.store.set("scene.bank", other);
}

/** In Standard Mode, Simple's list can be recalled from but not stored to or edited. */
function readOnlyBank(ctx: AppContext, bank: string): boolean {
  return bank === "Simple" && ctx.store.str("setup.operationMode", "Standard") === "Standard";
}

/** The bank SCENE LIST lists: Simple's alone in Simple Mode, else the tab last picked. */
function openBank(ctx: AppContext): SceneBank {
  return ctx.store.str("setup.operationMode", "Standard") === "Simple" || ctx.store.str("scene.bank", "Standard") === "Simple" ? "Simple" : "Standard";
}

/** The row SCENE LIST's cursor stands on. A selection the bank does not list falls to its first row. */
function pickedRow(ctx: AppContext, listed: number[]): number {
  const picked = ctx.store.num("scene.selected", 0);
  return listed.includes(picked) ? picked : (listed[0] ?? 0);
}

/**
 * Fill a scene box, HOME's or SCENE LIST's, with the number and title of the
 * scene on SCENE LIST's cursor rather than the scene recalled. The number of
 * P01 to P03 is green, the number blinks while the scene on the cursor is not the one
 * recalled, and while it is, the box is described as recalled and carries the
 * list's recalled mark, which stands in for the blink where motion is reduced.
 */
export function nameCursorScene<T extends HTMLElement>(ctx: AppContext, box: T): T {
  const selected = pickedRow(ctx, sceneRows(ctx, openBank(ctx)));
  const current = ctx.store.num("scene.current", 0);
  box.append(
    el("span", {
      class: `scene-no${isSimplePreset(selected) ? " is-preset" : ""}${selected === current ? "" : " is-pending"}`,
      children: [selected === current && Icons.recalled(), document.createTextNode(sceneNumber(selected))],
    }),
    el("span", { class: "scene-title", text: sceneTitle(ctx, selected) }),
  );
  if (selected === current) box.setAttribute("aria-description", "recalled");
  return box;
}

/** A button on the Edit tab named by a glyph. One that cannot be used does nothing. One that switches something on and off says which it stands at. */
function glyphButton(label: string, glyph: SVGSVGElement, enabled: boolean, onTap: () => void, pressed?: boolean): HTMLElement {
  const node = el("button", {
    class: "btn scene-edit-btn",
    attrs: { "aria-label": label, ...(pressed === undefined ? {} : { "aria-pressed": String(pressed) }) },
    children: [glyph],
    onTap: () => {
      if (enabled) onTap();
    },
  });
  for (const aim of aimOf(onTap)) lockable(node, aim);
  return markShut(node, !enabled);
}

/** The SCENE menu the HOME scene box opens; the list is one step under it. */
export const sceneTopScreen: ScreenDef = {
  id: "scene",
  toolbar: "sub",
  title: () => "SCENE",
  build(ctx): ScreenBody {
    const simple = ctx.store.str("setup.operationMode", "Standard") === "Simple";
    return {
      main: menuGrid(
        [
          menuButton("Scene List", aimed(() => ctx.nav.push({ id: "scene.list" }), { kind: "screen", id: "scene.list" })),
          // Recall Safe works in Standard Mode alone (the guide's "Recall Safe menu").
          markShut(
            menuButton(
              "Recall Safe",
              aimed(() => {
                if (!simple) ctx.nav.push({ id: "scene.safe" });
              }, { kind: "screen", id: "scene.safe" }),
            ),
            simple,
          ),
        ],
        "menu-grid-wide",
      ),
    };
  },
};

export const sceneScreen: ScreenDef = {
  id: "scene.list",
  toolbar: "sub",
  title: () => "SCENE LIST",
  build(ctx): ScreenBody {
    // In Simple Mode only Simple's list opens, and the Standard tab cannot be used.
    const simpleMode = ctx.store.str("setup.operationMode", "Standard") === "Simple";
    const bank = openBank(ctx);
    const listed = sceneRows(ctx, bank);
    const selected = pickedRow(ctx, listed);
    const current = ctx.store.num("scene.current", 0);
    const readOnly = readOnlyBank(ctx, bank);
    // A list that cannot be edited stands on the Store/Recall tab.
    const menu = readOnly ? "Store/Recall" : ctx.store.str("ui.sceneMenu", "Store/Recall");
    const owner = storedBank(ctx, selected);
    const guarded = isProtected(ctx, selected);

    const rows = listed.map((no) => {
      const factory = isFactoryLocked(no);
      const guard = !factory && isProtected(ctx, no);
      const lock = factory ? Icons.factory() : guard ? Icons.lock() : null;
      // The mark stands on the Store/Recall tab only.
      const recalled = no === current && menu === "Store/Recall";
      const marks = [recalled && "recalled", factory && "factory scene", guard && "protected"].filter(Boolean);
      return {
        key: String(no),
        selected: no === selected,
        onTap: writing("scene.selected", () => {
          // The row touched is in view: neither its own selection nor a refusal that puts the
          // one before it back moves the list. Once the write has settled, a move is from outside.
          const st = followState(ctx.store);
          const rows = st.tap ? st.tap.rows : new Set([selected]);
          rows.add(no);
          st.tap = { no, rows };
          st.followed = no;
          st.moved = false;
          st.writes++;
          void ctx.store.set("scene.selected", no).then(() => {
            st.writes--;
            if (st.writes > 0 || !st.tap) return;
            st.tap = undefined;
          });
          // A path the unit cannot take at all is put back at once, before its refusal is heard.
          const now = ctx.store.num("scene.selected", no);
          if (now !== no && st.tap) {
            if (st.tap.rows.has(now)) st.followed = now;
            st.tap = undefined;
          }
        }),
        description: marks.join(", ") || undefined,
        cells: [
          el("span", {
            class: `scene-no${isSimplePreset(no) && no !== selected ? " is-preset" : ""}`,
            children: [recalled && Icons.recalled(), document.createTextNode(sceneNumber(no))],
          }) as HTMLElement,
          sceneTitle(ctx, no),
          lock ? (el("span", { class: `scene-lock${factory ? "" : " is-protected"}`, children: [lock] }) as HTMLElement) : "",
        ],
      };
    });

    // Only a number holding a scene can be recalled.
    const recallShut = owner === null && !isFactoryLocked(selected);
    const recall = markShut(button("Recall", aimed(() => {
      if (recallShut) return;
      ctx.overlay(
        dialog({
          message: `Recall scene "${sceneTitle(ctx, selected)}"?`,
          onOk: aimed(() => void perform(ctx, { kind: "scene.recall", scene: selected }), { kind: "op", op: "scene.recall" }),
        }),
      );
    }, { kind: "op", op: "scene.recall" })), recallShut);

    const storeShut = isFactoryLocked(selected) || guarded || readOnly;
    const store = markShut(button("Store", aimed(() => {
      if (storeShut) return;
      // Any number is named on the title entry sheet first, starting from the
      // recalled scene's title, and [OK] there asks before anything is stored.
      draftTitle(ctx, {
        path: "",
        title: sceneTitle(ctx, current),
        onOk: (typed) => {
          ctx.overlay(
            dialog({
              message: `Store to "Scene Memory #${sceneNumber(selected)}"?`,
              onOk: aimed(() => void perform(ctx, { kind: "scene.store", bank, scene: selected, title: typed }), { kind: "op", op: "scene.store" }),
            }),
          );
        },
      });
      ctx.nav.push({ id: "scene.title" });
    }, { kind: "op", op: "scene.store" })), storeShut);

    // Only a stored scene can be protected, and only one left unprotected deleted or renamed.
    const editable = owner !== null && !readOnly;
    const titlePath = `scene.${owner}.${selected}.title`;
    const edit = [
      glyphButton(
        "Protect",
        Icons.lock(),
        editable,
        aimed(() => void (owner && perform(ctx, { kind: "scene.protect", bank: owner, scene: selected, protect: !guarded })), { kind: "op", op: "scene.protect" }),
        guarded,
      ),
      glyphButton("Delete", Icons.trash(), editable && !guarded, aimed(() => {
        ctx.overlay(
          dialog({
            message: `Delete "Scene Memory #${sceneNumber(selected)}"?`,
            onOk: aimed(() => void (owner && perform(ctx, { kind: "scene.delete", bank: owner, scene: selected })), { kind: "op", op: "scene.delete" }),
          }),
        );
      }, { kind: "op", op: "scene.delete" })),
      glyphButton("Title", Icons.rename(), editable && !guarded, aimed(() => openTitleEntry(ctx, titlePath, sceneTitle(ctx, selected)), { kind: "screen", id: "scene.title" })),
    ];

    const list = listView("Scene List", ["No.", "Title", "Lock"], rows, "list-carded scene-list");
    const body = list.querySelector<HTMLElement>(".list-body");
    // The padding and the gaps between rows come to whole rows, as on the card's list.
    // A touch on a row leaves the list where it was scrolled; the other bank starts from its top.
    const bar = body ? scrollbar(body, SCENE_TRACK_PX, SCENE_ROW_PITCH_PX, false, 0, LIST_THUMB_MIN_PX, { ctx, key: "scene.list", keep: bank }) : null;
    bar?.classList.add("scene-scrollbar");
    // A list that starts afresh — opened, or on the other tab — brings the selected row into view,
    // and so does a list drawn again in its place once the selection has moved from outside the
    // list (the connected unit's cursor, a settings file): after the redraw has put the list back
    // where it was scrolled. A row touched on the list stays where it was touched, and a list
    // scrolled by hand stays where it is while the selection does not move.
    if (body) {
      const st = followState(ctx.store);
      st.body = body;
      const row = body.querySelectorAll<HTMLElement>(".list-row")[listed.indexOf(selected)];
      queueMicrotask(() => {
        const carried = body.hasAttribute("data-scroll-carried");
        // The row touched, on the list it was touched on, stays where it was touched, unless the
        // unit has moved the selection of its own since.
        if (carried && !st.moved && st.tap && selected === st.tap.no) return;
        // A follow this draw asked for passes to a draw that replaced it before it could run.
        if (!carried || st.moved || st.followed !== selected) st.pending = true;
        if (st.pending && st.body === body) follow(st, body, row, selected);
      });
    }

    const main = el("div", {
      class: "scene-screen",
      children: [
        el("div", {
          class: "scene-banks",
          children: (["Standard", "Simple"] as const).map((b) => {
            const shut = simpleMode && b === "Standard";
            const node = toggle(b, b === bank, writing(["scene.bank", "scene.selected"], () => {
              if (shut) return;
              ctx.store.operation(() => {
                void ctx.store.set("scene.bank", b);
                // The selection is dropped, so the other bank opens at its first row.
                void ctx.store.set("scene.selected", 0);
                // The menu shown is kept, and a bank whose list cannot be edited moves it to Store/Recall.
                void ctx.store.set("ui.sceneMenu", readOnlyBank(ctx, b) ? "Store/Recall" : menu);
              });
            }), "scene-bank");
            return markShut(node, shut);
          }),
        }),
        list,
        ...(bar ? [bar] : []),
        menu === "Edit"
          ? el("div", { class: "scene-actions is-edit", children: edit })
          : el("div", { class: "scene-actions", children: [store, recall] }),
      ],
    });

    return {
      main,
      // Simple's list in Standard Mode cannot be edited, so the Edit menu is shut.
      side: (["Store/Recall", "Edit"] as const).map((m) => {
        const tab = sideTab(
          m.replace("/", "/\n"),
          m === menu,
          () => {
            if (m !== "Edit" || !readOnly) void ctx.store.set("ui.sceneMenu", m);
          },
          m === "Edit" ? Icons.edit() : Icons.archive(),
          m === "Edit" ? "is-name-lifted" : "is-name-close",
        );
        return markShut(tab, m === "Edit" && readOnly);
      }),
      headerLeft: nameCursorScene(ctx, el("div", { class: "scene-box scene-box-static" })),
    };
  },
};

/** The simulated unit's scene memory carrying `op` out. */
export function emulateSceneOp(ctx: AppContext, op: Extract<UnitOp, { kind: `scene.${string}` }>): boolean {
  switch (op.kind) {
    case "scene.recall":
      void recallScene(ctx, op.scene);
      return true;
    case "scene.store":
      storeTitled(ctx, op.bank, op.scene, op.title);
      return true;
    case "scene.protect":
      void ctx.store.set(`scene.${op.bank}.${op.scene}.protect`, op.protect ? 1 : 0);
      return true;
    case "scene.delete":
      void ctx.store.set(`scene.${op.bank}.${op.scene}.title`, "");
      void ctx.store.set(`scene.${op.bank}.${op.scene}.protect`, 0);
      void ctx.store.set(statePath(op.bank, op.scene), "");
      return true;
  }
}
