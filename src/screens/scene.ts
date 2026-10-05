// SCENE screen — the scene list, and store / recall (user guide, "SCENE screen"
// and "Other operations > Storing a scene").

import type { AppContext } from "../app/context";
import { applyScene, asPutBack, captureScene, readScene } from "../model/scene-state";
import { shippedScene } from "../model/scene-presets";
import { onDynamicsTimeStops } from "../model/dynamics-times";
import { dropInsertsOverRate } from "./insert-fx";
import { followRecall, pairStates } from "./stereo-link";
import { settlePanLink } from "./mix-bus";
import { onSsmcsStops } from "./ssmcs";
import { el, markShut } from "../ui/dom";
import { Icons } from "../ui/icons";
import { LIST_THUMB_MIN_PX, SHORT_PROGRESS_MS, button, dialog, listView, loadingDialog, menuButton, menuGrid, scrollbar, sideTab, toggle } from "../ui/widgets";
import { draftTitle, openTitleEntry } from "./title-entry";
import type { ScreenBody, ScreenDef } from "./types";
import { toJson } from "../device/value-json";

/** The numbers a unit stores scenes under run from 1 to this. */
const SCENE_COUNT = 63;

/** How far the thumb travels, a pixel in from each end of the bar's well, and the pitch one row of the list takes. */
const SCENE_TRACK_PX = 111;
const SCENE_ROW_PITCH_PX = 38;

/** Preset scenes the unit ships with, one per Simple Mode use case. They take the numbers past the base, P01 first. */
const SIMPLE_PRESETS = ["Live Music 0", "Streaming 0", "DAW Rec 0"];
const PRESET_BASE = 100;

/** The banks a scene is stored on, in the order a number is looked up. */
const BANKS = ["Standard", "Simple"] as const;

/** A Simple Mode preset, numbered from P01. */
function isPreset(no: number): boolean {
  return no > PRESET_BASE;
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

/** A scene's title: a preset's name, what a bank has stored under the number, or nothing where no scene is stored. */
export function sceneTitle(ctx: AppContext, no: number): string {
  if (isPreset(no)) return SIMPLE_PRESETS[no - PRESET_BASE - 1] ?? "";
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
 */
export async function recallScene(ctx: AppContext, no: number): Promise<void> {
  const bank = storedBank(ctx, no);
  const state = bank ? readScene(ctx.store, statePath(bank, no)) : isFactoryLocked(no) ? shippedScene(ctx.model, isPreset(no) ? no - PRESET_BASE : 0) : undefined;
  const pairs = pairStates(ctx);
  if (state) await applyScene(ctx.store, onSsmcsStops(onDynamicsTimeStops(asPutBack(ctx.store, state))));
  followRecall(ctx, pairs);
  // A scene stored while Pan Link left each send's own placing where it was, or
  // kept Pan Link on over a FIXED bus, comes back as the unit would hold it.
  settlePanLink(ctx);
  await ctx.store.set("scene.current", no);
  // A scene carries the mixer and not the sampling frequency, so a stored insert
  // can come back onto a unit that is running too fast for it.
  dropInsertsOverRate(ctx, ctx.store.num("setup.samplingFrequency", 48000));
  ctx.repaint();
}

/**
 * What [Store] does once it is answered: the mixer goes in under the number with
 * the title typed for it and becomes the scene recalled, the title, the mixer and
 * the number in one operation of the store, and `Scene store is in progress...`
 * stands over the list as long as the other short progress modals.
 */
function storeTitled(ctx: AppContext, bank: string, no: number, title: string): void {
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
 * The scenes a bank lists: 00 and every number on Standard; on Simple, the
 * presets and the numbers Standard has not stored a scene under.
 */
function sceneRows(ctx: AppContext, bank: string): number[] {
  const numbers = Array.from({ length: SCENE_COUNT }, (_, i) => i + 1);
  if (bank !== "Simple") return [0, ...numbers];
  return [...SIMPLE_PRESETS.map((_, i) => PRESET_BASE + i + 1), ...numbers.filter((n) => !ctx.store.str(`scene.Standard.${n}.title`, ""))];
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
function openBank(ctx: AppContext): string {
  return ctx.store.str("setup.operationMode", "Standard") === "Simple" ? "Simple" : ctx.store.str("scene.bank", "Standard");
}

/** The row SCENE LIST's cursor stands on. A selection the bank does not list falls to its first row. */
function pickedRow(ctx: AppContext, listed: number[]): number {
  const picked = ctx.store.num("scene.selected", 0);
  return listed.includes(picked) ? picked : (listed[0] ?? 0);
}

/**
 * Fill a scene box, HOME's or SCENE LIST's, with the number and title of the
 * scene on SCENE LIST's cursor rather than the scene recalled. A preset's number
 * is green, the number blinks while the scene on the cursor is not the one
 * recalled, and while it is, the box is described as recalled and carries the
 * list's recalled mark, which stands in for the blink where motion is reduced.
 */
export function nameCursorScene<T extends HTMLElement>(ctx: AppContext, box: T): T {
  const selected = pickedRow(ctx, sceneRows(ctx, openBank(ctx)));
  const current = ctx.store.num("scene.current", 0);
  box.append(
    el("span", {
      class: `scene-no${isPreset(selected) ? " is-preset" : ""}${selected === current ? "" : " is-pending"}`,
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
  return markShut(node, !enabled);
}

/** The SCENE menu the HOME scene box opens; the list is one step under it. */
export const sceneTopScreen: ScreenDef = {
  id: "scene",
  toolbar: "sub",
  title: () => "SCENE",
  build(ctx): ScreenBody {
    return { main: menuGrid([menuButton("Scene List", () => ctx.nav.push({ id: "scene.list" }))], "menu-grid-wide") };
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
        onTap: () => void ctx.store.set("scene.selected", no),
        description: marks.join(", ") || undefined,
        cells: [
          el("span", {
            class: `scene-no${isPreset(no) && no !== selected ? " is-preset" : ""}`,
            children: [recalled && Icons.recalled(), document.createTextNode(sceneNumber(no))],
          }) as HTMLElement,
          sceneTitle(ctx, no),
          lock ? (el("span", { class: `scene-lock${factory ? "" : " is-protected"}`, children: [lock] }) as HTMLElement) : "",
        ],
      };
    });

    // Only a number holding a scene can be recalled.
    const recallShut = owner === null && !isFactoryLocked(selected);
    const recall = markShut(button("Recall", () => {
      if (recallShut) return;
      ctx.overlay(
        dialog({
          message: `Recall scene "${sceneTitle(ctx, selected)}"?`,
          onOk: () => void recallScene(ctx, selected),
        }),
      );
    }), recallShut);

    const storeShut = isFactoryLocked(selected) || guarded || readOnly;
    const store = markShut(button("Store", () => {
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
              onOk: () => storeTitled(ctx, bank, selected, typed),
            }),
          );
        },
      });
      ctx.nav.push({ id: "scene.title" });
    }), storeShut);

    // Only a stored scene can be protected, and only one left unprotected deleted or renamed.
    const editable = owner !== null && !readOnly;
    const protectPath = `scene.${owner}.${selected}.protect`;
    const titlePath = `scene.${owner}.${selected}.title`;
    const edit = [
      glyphButton("Protect", Icons.lock(), editable, () => void ctx.store.set(protectPath, guarded ? 0 : 1), guarded),
      glyphButton("Delete", Icons.trash(), editable && !guarded, () => {
        ctx.overlay(
          dialog({
            message: `Delete "Scene Memory #${sceneNumber(selected)}"?`,
            onOk: () => {
              void ctx.store.set(titlePath, "");
              void ctx.store.set(protectPath, 0);
              void ctx.store.set(statePath(`${owner}`, selected), "");
            },
          }),
        );
      }),
      glyphButton("Title", Icons.rename(), editable && !guarded, () => openTitleEntry(ctx, titlePath, sceneTitle(ctx, selected))),
    ];

    const list = listView("Scene List", ["No.", "Title", "Lock"], rows, "list-carded scene-list");
    const body = list.querySelector<HTMLElement>(".list-body");
    // The padding and the gaps between rows come to whole rows, as on the card's list.
    // A touch on a row leaves the list where it was scrolled; the other bank starts from its top.
    const bar = body ? scrollbar(body, SCENE_TRACK_PX, SCENE_ROW_PITCH_PX, false, 0, LIST_THUMB_MIN_PX, { ctx, key: "scene.list", keep: bank }) : null;
    bar?.classList.add("scene-scrollbar");

    const main = el("div", {
      class: "scene-screen",
      children: [
        el("div", {
          class: "scene-banks",
          children: (["Standard", "Simple"] as const).map((b) => {
            const shut = simpleMode && b === "Standard";
            const node = toggle(b, b === bank, () => {
              if (shut) return;
              ctx.store.operation(() => {
                void ctx.store.set("scene.bank", b);
                // The selection is dropped, so the other bank opens at its first row.
                void ctx.store.set("scene.selected", 0);
                // The menu shown is kept, and a bank whose list cannot be edited moves it to Store/Recall.
                void ctx.store.set("ui.sceneMenu", readOnlyBank(ctx, b) ? "Store/Recall" : menu);
              });
            }, "scene-bank");
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
