// The title entry sheet: a keyboard that takes the glass over to rename a scene.

import type { AppContext } from "../app/context";
import { captureScene } from "../model/scene-state";
import { el } from "../ui/dom";
import { Icons } from "../ui/icons";
import { button } from "../ui/widgets";
import type { ScreenBody, ScreenDef } from "./types";
import { toJson } from "../device/value-json";

/** Where the sheet keeps the title being typed, and where it goes, until [OK]. */
const DRAFT = "ui.titleEntry";

/** The most characters a title takes; a key typed past it changes nothing. */
const TITLE_MAX = 16;

type Layout = "letters" | "numbers" | "symbols";

type Action =
  | { kind: "type"; text: string }
  | { kind: "layout"; to: Layout }
  | { kind: "shift" }
  | { kind: "backspace" }
  | { kind: "left" }
  | { kind: "right" };

/** A key: its face, what a tap does, and the quarter-key column it starts at and how many it spans. */
interface Key {
  face: string;
  action: Action;
  col: number;
  span: number;
}

/** Keys that each type their face, a key apart from a quarter-key column on. */
function typing(chars: string, from: number): Key[] {
  return [...chars].map((c, i) => ({ face: c, action: { kind: "type", text: c }, col: from + i * 4, span: 4 }));
}

/** The foot row every layout shares, led by the key that changes the layout. */
function footRow(lead: Key): Key[] {
  return [
    lead,
    { face: "space", action: { kind: "type", text: " " }, col: 6, span: 12 },
    ...typing("@.", 18),
    { face: "<", action: { kind: "left" }, col: 26, span: 7 },
    { face: ">", action: { kind: "right" }, col: 33, span: 7 },
  ];
}

const BACKSPACE: Key = { face: "", action: { kind: "backspace" }, col: 32, span: 8 };

/** Each layout's four rows. The keys of the rows above the foot stand a key wide, the second row of letters half a key in. */
const LAYOUTS: Record<Layout, Key[][]> = {
  letters: [
    typing("qwertyuiop", 0),
    typing("asdfghjkl", 2),
    [{ face: "Shift", action: { kind: "shift" }, col: 0, span: 4 }, ...typing("zxcvbnm", 4), BACKSPACE],
    footRow({ face: "123", action: { kind: "layout", to: "numbers" }, col: 0, span: 6 }),
  ],
  numbers: [
    typing("1234567890", 0),
    typing("-/:;()\\&", 4),
    [{ face: "#+-", action: { kind: "layout", to: "symbols" }, col: 0, span: 4 }, ...typing(".,?!'", 8), BACKSPACE],
    footRow({ face: "ABC", action: { kind: "layout", to: "letters" }, col: 0, span: 6 }),
  ],
  symbols: [
    typing("[]{}#%^*+=", 0),
    typing("_|~<>$\\\"", 4),
    [{ face: "123", action: { kind: "layout", to: "numbers" }, col: 0, span: 4 }, ...typing(".,?!'", 8), BACKSPACE],
    footRow({ face: "ABC", action: { kind: "layout", to: "letters" }, col: 0, span: 6 }),
  ],
};

/** Every character the unit's own keys can type, in either case. */
const TYPABLE = new Set(
  Object.values(LAYOUTS)
    .flat(2)
    .flatMap((k) => (k.action.kind === "type" ? [k.action.text, k.action.text.toUpperCase()] : [])),
);

/** What a key without a readable face is called. */
const KEY_NAMES: Partial<Record<Action["kind"], string>> = { backspace: "Backspace", left: "Move left", right: "Move right" };

/** What [OK] hands the name to, where the caller takes it itself. */
let pendingOk: ((text: string) => void) | null = null;

/** What the sheet is opened on. */
export interface TitleDraft {
  /** Where [OK] writes what is typed; an empty path writes nowhere. */
  path: string;
  /** What the field holds when the sheet opens. */
  title: string;
  /** The scene number [OK] makes the recalled scene, or -1 for none. */
  recall?: number;
  /** What [OK] hands what is typed to. */
  onOk?: (text: string) => void;
  /** What stands at the top of the sheet. */
  heading?: string;
  /** The most characters the field takes. */
  max?: number;
  /** Whether [OK] goes on with the field empty. */
  empty?: boolean;
}

/** Put a title in the sheet, with the letters up and Shift off. */
export function draftTitle(ctx: AppContext, draft: TitleDraft): void {
  const { path, title } = draft;
  pendingOk = draft.onOk ?? null;
  void ctx.store.set(`${DRAFT}.heading`, draft.heading ?? "");
  void ctx.store.set(`${DRAFT}.max`, draft.max ?? TITLE_MAX);
  void ctx.store.set(`${DRAFT}.empty`, draft.empty === true ? 1 : 0);
  void ctx.store.set(`${DRAFT}.path`, path);
  void ctx.store.set(`${DRAFT}.recall`, draft.recall ?? -1);
  void ctx.store.set(`${DRAFT}.text`, title);
  void ctx.store.set(`${DRAFT}.cursor`, title.length);
  void ctx.store.set(`${DRAFT}.layout`, "letters");
  void ctx.store.set(`${DRAFT}.shift`, 0);
}

/**
 * Open the sheet on a title. [OK] writes what is typed to `path` and, given a
 * scene number in `recall`, makes it the recalled scene.
 */
export function openTitleEntry(ctx: AppContext, path: string, title: string, recall = -1): void {
  draftTitle(ctx, { path, title, recall });
  ctx.nav.push({ id: "scene.title" });
}

/**
 * The sheet [Title] opens: [Cancel] and [OK] in its top corners, the title in a
 * black field with a clear button at its right end, and the keyboard across the
 * foot. Shift stays on until it is tapped again. A title takes up to 16 characters.
 * Nothing is written before [OK], and [OK] does nothing while the field is empty.
 * The unit's keys are touched rather than tabbed, so they hold no Tab stop; the
 * field does, and it takes what a browser's keyboard sends.
 */
export const titleEntryScreen: ScreenDef = {
  id: "scene.title",
  toolbar: "sub",
  shellExits: false,
  knobToggle: false,
  build(ctx): ScreenBody {
    const text = ctx.store.str(`${DRAFT}.text`, "");
    const cursor = Math.min(Math.max(ctx.store.num(`${DRAFT}.cursor`, text.length), 0), text.length);
    const drafted = ctx.store.str(`${DRAFT}.layout`, "letters");
    const layout: Layout = drafted === "numbers" || drafted === "symbols" ? drafted : "letters";
    const shift = ctx.store.num(`${DRAFT}.shift`, 0) === 1;
    const heading = ctx.store.str(`${DRAFT}.heading`, "");
    const max = ctx.store.num(`${DRAFT}.max`, TITLE_MAX);
    const empty = ctx.store.num(`${DRAFT}.empty`, 0) === 1;

    const edit = (next: string, at: number): void => {
      void ctx.store.set(`${DRAFT}.text`, next);
      void ctx.store.set(`${DRAFT}.cursor`, at);
    };
    const insert = (typed: string): void => {
      if (text.length + typed.length > max) return;
      edit(text.slice(0, cursor) + typed + text.slice(cursor), cursor + typed.length);
    };
    const act = (action: Action): void => {
      switch (action.kind) {
        case "type":
          insert(shift ? action.text.toUpperCase() : action.text);
          return;
        case "backspace":
          if (cursor > 0) edit(text.slice(0, cursor - 1) + text.slice(cursor), cursor - 1);
          return;
        case "left":
          void ctx.store.set(`${DRAFT}.cursor`, Math.max(0, cursor - 1));
          return;
        case "right":
          void ctx.store.set(`${DRAFT}.cursor`, Math.min(text.length, cursor + 1));
          return;
        case "shift":
          void ctx.store.set(`${DRAFT}.shift`, shift ? 0 : 1);
          return;
        case "layout":
          void ctx.store.set(`${DRAFT}.layout`, action.to);
      }
    };

    const keyNode = (k: Key, row: number): HTMLElement => {
      // A letter's face follows Shift; the named keys keep theirs.
      const face = shift && k.action.kind === "type" && k.face.length === 1 ? k.face.toUpperCase() : k.face;
      const node =
        k.action.kind === "backspace"
          ? el("button", { class: "btn title-key", children: [Icons.backspace()], onTap: () => act(k.action) })
          : button(face, () => act(k.action), `title-key${k.action.kind === "shift" && shift ? " is-on" : ""}`);
      const name = KEY_NAMES[k.action.kind];
      if (name) node.setAttribute("aria-label", name);
      node.style.gridColumn = `${k.col + 1} / span ${k.span}`;
      node.style.gridRow = String(row + 1);
      node.tabIndex = -1;
      return node;
    };

    const field = el("div", {
      class: "title-field",
      attrs: { role: "textbox", "aria-label": "Title" },
      children: [
        el("span", {
          class: "title-text",
          children: [
            document.createTextNode(text.slice(0, cursor)),
            el("span", { class: "title-caret", attrs: { "aria-hidden": "true" } }),
            document.createTextNode(text.slice(cursor)),
          ],
        }),
        el("button", { class: "title-clear", attrs: { "aria-label": "Clear" }, children: [Icons.clear()], onTap: () => edit("", 0) }),
      ],
    });
    field.tabIndex = 0;
    // A key the browser sends lands where the unit's own key of the same face would,
    // and a character the unit cannot type is left alone.
    field.addEventListener("keydown", (ev) => {
      if (ev.target !== field || ev.isComposing || ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (ev.key === "Backspace") act({ kind: "backspace" });
      else if (ev.key === "ArrowLeft") act({ kind: "left" });
      else if (ev.key === "ArrowRight") act({ kind: "right" });
      else if (TYPABLE.has(ev.key)) insert(ev.key);
      else return;
      ev.preventDefault();
    });

    return {
      main: el("div", {
        class: "pick-dialog title-entry",
        children: [
          ...(heading ? [el("h1", { class: "pick-dialog-title", text: heading })] : []),
          button("Cancel", () => {
            pendingOk = null;
            ctx.nav.back();
          }, "pick-dialog-btn pick-dialog-cancel"),
          button("OK", () => {
            // [OK] does nothing until something is typed, unless the draft goes on empty.
            if (!text && !empty) return;
            const path = ctx.store.str(`${DRAFT}.path`, "");
            if (path) void ctx.store.set(path, text);
            const recall = ctx.store.num(`${DRAFT}.recall`, -1);
            // Naming a number that holds nothing is the first half of storing to
            // it: the mixer goes in with the name.
            if (recall >= 0 && path.startsWith("scene.") && path.endsWith(".title")) {
              void ctx.store.set(path.replace(/\.title$/, ".state"), toJson(captureScene(ctx.store)));
            }
            if (recall >= 0) void ctx.store.set("scene.current", recall);
            const handOver = pendingOk;
            pendingOk = null;
            ctx.nav.back();
            handOver?.(text);
          }, "pick-dialog-btn pick-dialog-ok"),
          field,
          el("div", { class: "title-keys", children: LAYOUTS[layout].flatMap((row, i) => row.map((k) => keyNode(k, i))) }),
        ],
      }),
    };
  },
};
