// Controls the page the glass is embedded in holds shut.
//
// A page carrying the glass (src/embed.ts) can say that a control is out of use
// for now, and why. A control names what it does when it is built — the value it
// writes, the screen it opens or the operation it hands the unit (`lockable`,
// `writes` and `aimed` in src/ui/dom.ts) — and each time the glass is drawn, a
// control whose target the page holds is drawn shut, with a padlock at its top
// right corner and the page's reason as its tooltip and its description. It
// answers no touch and no key, and the store, the navigator and `perform` refuse
// what it would have done, however it is reached.

import type { ParamPath } from "../device/path";
import type { UnitOp } from "../device/unit";
import { LOCKED_CLASS, LOCK_KEYS } from "./dom";
import { Icons } from "./icons";
import { setSpokenAttr } from "./spoken";

/** What a page can hold shut: a value, a screen, or an operation the unit carries out. */
export type LockTarget =
  | { kind: "path"; path: ParamPath }
  | { kind: "screen"; id: string }
  | { kind: "op"; op: UnitOp["kind"] };

/** A target the page holds shut, with the words it gives for it. */
export interface SimLock {
  target: LockTarget;
  reason: string;
}

/** The class of the padlock drawn on a control held shut. */
export const LOCK_MARK_CLASS = "lock-mark";

const keyOf = (kind: LockTarget["kind"], name: string): string => `${kind}\u0000${name}`;

const nameOf = (target: LockTarget): string =>
  target.kind === "path" ? target.path : target.kind === "screen" ? target.id : target.op;

/** The targets held shut, with their reasons. The first lock given for a target is the one that holds it. */
export class Locks {
  private held = new Map<string, string>();

  constructor(locks: readonly SimLock[] = []) {
    this.set(locks);
  }

  /** Hold `locks` and nothing else. */
  set(locks: readonly SimLock[]): void {
    const held = new Map<string, string>();
    for (const lock of locks) {
      const key = keyOf(lock.target.kind, nameOf(lock.target));
      if (!held.has(key)) held.set(key, lock.reason);
    }
    this.held = held;
  }

  get empty(): boolean {
    return this.held.size === 0;
  }

  /** The reason `target` is held shut, or undefined where it is not. */
  reason(target: LockTarget): string | undefined {
    return this.held.get(keyOf(target.kind, nameOf(target)));
  }

  path(path: ParamPath): boolean {
    return this.held.has(keyOf("path", path));
  }

  screen(id: string): boolean {
    return this.held.has(keyOf("screen", id));
  }

  op(op: UnitOp["kind"]): boolean {
    return this.held.has(keyOf("op", op));
  }

  /** The reason the control `node` is held shut, from the first of its targets that is held. */
  of(node: HTMLElement | SVGElement): string | undefined {
    for (const kind of ["path", "screen", "op"] as const) {
      const name = node.dataset[LOCK_KEYS[kind]];
      if (name === undefined) continue;
      const reason = this.held.get(keyOf(kind, name));
      if (reason !== undefined) return reason;
    }
    return undefined;
  }
}

/** What a control carried before it was held shut, so letting it go puts back only what the lock added. */
const WAS = {
  disabled: "lockWasDisabled",
  ariaDisabled: "lockWasAriaDisabled",
  title: "lockWasTitle",
  description: "lockWasDescription",
  readOnly: "lockWasReadOnly",
} as const;

const SELECTOR = [...Object.values(LOCK_KEYS).map((k) => `[data-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`), `.${LOCKED_CLASS}`].join(", ");

/** Draw every control under `root` the page holds shut as shut, and let go of one it no longer holds. */
export function drawLocks(root: Element, locks: Locks): void {
  if (locks.empty && !root.querySelector(`.${LOCKED_CLASS}`)) return;
  const nodes = [...(root.matches(SELECTOR) ? [root] : []), ...root.querySelectorAll(SELECTOR)];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement || node instanceof SVGElement)) continue;
    const reason = locks.of(node);
    if (reason !== undefined) shut(node, reason);
    else if (node.classList.contains(LOCKED_CLASS)) lift(node);
  }
}

function remember(node: HTMLElement | SVGElement, key: string, value: string | null): void {
  if (value !== null) node.dataset[key] = value;
  else delete node.dataset[key];
}

function shut(node: HTMLElement | SVGElement, reason: string): void {
  if (!node.classList.contains(LOCKED_CLASS)) {
    remember(node, WAS.disabled, node.classList.contains("is-disabled") ? "" : null);
    remember(node, WAS.ariaDisabled, node.getAttribute("aria-disabled"));
    remember(node, WAS.title, node.getAttribute("title"));
    remember(node, WAS.description, node.getAttribute("aria-description"));
    // A field held shut keeps its text and takes no typing.
    if (node instanceof HTMLInputElement) {
      remember(node, WAS.readOnly, node.readOnly ? "" : null);
      node.readOnly = true;
    }
    node.classList.add(LOCKED_CLASS, "is-disabled");
    node.setAttribute("aria-disabled", "true");
    const mark = document.createElement("span");
    mark.className = LOCK_MARK_CLASS;
    mark.setAttribute("aria-hidden", "true");
    mark.appendChild(Icons.lock());
    // A field holds no children, so its padlock stands just after it, in the box it sits in.
    if (node instanceof HTMLInputElement) node.after(mark);
    else node.appendChild(mark);
  }
  node.setAttribute("title", reason);
  setSpokenAttr(node, "aria-description", reason);
}

function lift(node: HTMLElement | SVGElement): void {
  node.classList.remove(LOCKED_CLASS);
  if (node.dataset[WAS.disabled] === undefined) node.classList.remove("is-disabled");
  for (const [key, attr] of [
    [WAS.ariaDisabled, "aria-disabled"],
    [WAS.title, "title"],
    [WAS.description, "aria-description"],
  ] as const) {
    const was = node.dataset[key];
    if (was === undefined) node.removeAttribute(attr);
    else node.setAttribute(attr, was);
    delete node.dataset[key];
  }
  delete node.dataset[WAS.disabled];
  if (node instanceof HTMLInputElement) {
    if (node.dataset[WAS.readOnly] === undefined) node.readOnly = false;
    delete node.dataset[WAS.readOnly];
  }
  for (const mark of node.querySelectorAll(`:scope > .${LOCK_MARK_CLASS}`)) mark.remove();
  if (node instanceof HTMLInputElement && node.nextElementSibling?.classList.contains(LOCK_MARK_CLASS)) node.nextElementSibling.remove();
}
