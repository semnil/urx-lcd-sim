// SCENE screen — the scene list, and store / recall (user guide, "SCENE screen"
// and "Other operations > Storing a scene").

import type { AppContext } from "../app/context";
import type { ParamValue } from "../device/path";
import { factoryState } from "../model/defaults";
import { applyScene, captureScene, inScene, readScene } from "../model/scene-state";
import { dropInsertsOverRate } from "./insert-fx";
import { followRecall, pairStates } from "./stereo-link";
import { el } from "../ui/dom";
import { Icons } from "../ui/icons";
import { LIST_THUMB_MIN_PX, button, dialog, listView, menuButton, menuGrid, scrollbar, sideTab, toggle } from "../ui/widgets";
import { openTitleEntry } from "./title-entry";
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

/** A scene's title: a preset's name, what a bank has stored under the number, or No Scene. */
export function sceneTitle(ctx: AppContext, no: number): string {
  if (isPreset(no)) return SIMPLE_PRESETS[no - PRESET_BASE - 1] ?? "No Scene";
  if (no === 0) return ctx.store.str("scene.0.title", "Initial Data");
  const bank = storedBank(ctx, no);
  return bank ? ctx.store.str(`scene.${bank}.${no}.title`, "") : "No Scene";
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
 * Put a scene's mixer on the unit and mark it as the one recalled. Scene 00
 * holds the mixer the unit ships with, which nothing stores over, so it is put
 * back from the factory state rather than from a stored copy.
 */
export async function recallScene(ctx: AppContext, no: number): Promise<void> {
  const bank = storedBank(ctx, no);
  const stored = bank ? readScene(ctx.store, statePath(bank, no)) : undefined;
  const pairs = pairStates(ctx);
  if (stored) await applyScene(ctx.store, stored);
  else if (no === 0) {
    const factory: Record<string, ParamValue> = {};
    for (const [path, value] of factoryState(ctx.model)) if (inScene(path)) factory[path] = value;
    await applyScene(ctx.store, factory);
  }
  followRecall(ctx, pairs);
  await ctx.store.set("scene.current", no);
  // A scene carries the mixer and not the sampling frequency, so a stored insert
  // can come back onto a unit that is running too fast for it.
  dropInsertsOverRate(ctx, ctx.store.num("setup.samplingFrequency", 48000));
  ctx.repaint();
}

/** Take the mixer as it stands into a scene number, and recall it. */
export async function storeScene(ctx: AppContext, bank: string, no: number): Promise<void> {
  await ctx.store.set(statePath(bank, no), toJson(captureScene(ctx.store)));
  await ctx.store.set("scene.current", no);
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

/** A button on the Edit tab named by a glyph. One that cannot be used does nothing. */
function glyphButton(label: string, glyph: SVGSVGElement, enabled: boolean, onTap: () => void): HTMLElement {
  return el("button", {
    class: `btn scene-edit-btn${enabled ? "" : " is-disabled"}`,
    attrs: { "aria-label": label },
    children: [glyph],
    onTap: () => {
      if (enabled) onTap();
    },
  });
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
    const bank = ctx.store.str("scene.bank", "Standard");
    const listed = sceneRows(ctx, bank);
    // A selection the bank does not list falls to its first row.
    const picked = ctx.store.num("scene.selected", 0);
    const selected = listed.includes(picked) ? picked : (listed[0] ?? 0);
    const current = ctx.store.num("scene.current", 0);
    const menu = ctx.store.str("ui.sceneMenu", "Store/Recall");
    // In Standard Mode, Simple's list can be recalled from but not stored to or edited.
    const readOnly = bank === "Simple" && ctx.store.str("setup.operationMode", "Standard") === "Standard";
    const owner = storedBank(ctx, selected);
    const guarded = isProtected(ctx, selected);

    const rows = listed.map((no) => {
      const factory = isFactoryLocked(no);
      const lock = factory ? Icons.factory() : isProtected(ctx, no) ? Icons.lock() : null;
      return {
        key: String(no),
        selected: no === selected,
        onTap: () => void ctx.store.set("scene.selected", no),
        cells: [
          el("span", {
            class: `scene-no${isPreset(no) && no !== selected ? " is-preset" : ""}`,
            // The mark stands on the Store/Recall tab only.
            children: [no === current && menu === "Store/Recall" && Icons.recalled(), document.createTextNode(sceneNumber(no))],
          }) as HTMLElement,
          sceneTitle(ctx, no),
          lock ? (el("span", { class: `scene-lock${factory ? "" : " is-protected"}`, children: [lock] }) as HTMLElement) : "",
        ],
      };
    });

    const recall = button("Recall", () => {
      ctx.overlay(
        dialog({
          message: `Recall scene "${sceneTitle(ctx, selected)}"?`,
          onOk: () => void recallScene(ctx, selected),
        }),
      );
    });

    const storeShut = isFactoryLocked(selected) || guarded || readOnly;
    const store = button("Store", () => {
      if (storeShut) return;
      // A number with nothing stored is named on the title entry sheet, starting from the recalled scene's title.
      if (owner === null) {
        openTitleEntry(ctx, `scene.${bank}.${selected}.title`, sceneTitle(ctx, current), selected);
        return;
      }
      ctx.overlay(
        dialog({
          message: `Store to "Scene Memory #${sceneNumber(selected)}"?`,
          onOk: () => void storeScene(ctx, bank, selected),
        }),
      );
    }, storeShut ? "is-disabled" : "");

    // Only a stored scene can be protected, and only one left unprotected deleted or renamed.
    const editable = owner !== null && !readOnly;
    const protectPath = `scene.${owner}.${selected}.protect`;
    const titlePath = `scene.${owner}.${selected}.title`;
    const edit = [
      glyphButton("Protect", Icons.lock(), editable, () => void ctx.store.set(protectPath, guarded ? 0 : 1)),
      glyphButton("Delete", Icons.trash(), editable && !guarded, () => {
        ctx.overlay(
          dialog({
            message: `Delete "Scene Memory #${sceneNumber(selected)}"?`,
            onOk: () => {
              void ctx.store.set(titlePath, "");
              void ctx.store.set(protectPath, 0);
            },
          }),
        );
      }),
      glyphButton("Title", Icons.rename(), editable && !guarded, () => openTitleEntry(ctx, titlePath, sceneTitle(ctx, selected))),
    ];

    const list = listView(["No.", "Title", "Lock"], rows, "list-carded scene-list");
    const body = list.querySelector<HTMLElement>(".list-body");
    // The padding and the gaps between rows come to whole rows, as on the card's list.
    const bar = body ? scrollbar(body, SCENE_TRACK_PX, SCENE_ROW_PITCH_PX, false, 0, LIST_THUMB_MIN_PX, { ctx, key: "scene.list" }) : null;
    bar?.classList.add("scene-scrollbar");

    const main = el("div", {
      class: "scene-screen",
      children: [
        el("div", {
          class: "scene-banks",
          children: (["Standard", "Simple"] as const).map((b) =>
            toggle(b, b === bank, () => {
              void ctx.store.set("scene.bank", b);
              // The selection is dropped, so the other bank opens at its first row.
              void ctx.store.set("scene.selected", 0);
            }, "scene-bank"),
          ),
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
      // A factory scene cannot be edited, nor can Simple's list in Standard Mode, so the Edit menu is shut.
      side: (["Store/Recall", "Edit"] as const).map((m) =>
        sideTab(
          m.replace("/", "/\n"),
          m === menu,
          () => void ctx.store.set("ui.sceneMenu", m),
          m === "Edit" ? Icons.edit() : Icons.archive(),
          [m === "Edit" ? "is-name-lifted" : "is-name-close", m === "Edit" && (isFactoryLocked(selected) || readOnly) ? "is-disabled" : ""].join(" ").trim(),
        ),
      ),
      headerLeft: el("div", {
        class: "scene-box scene-box-static",
        children: [
          el("span", { class: `scene-no${isPreset(current) ? " is-preset" : ""}`, text: sceneNumber(current) }),
          el("span", { class: "scene-title", text: sceneTitle(ctx, current) }),
        ],
      }),
    };
  },
};
