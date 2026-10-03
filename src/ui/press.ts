// A control drawn with a band under its face sinks while a pointer or the Enter
// or Space key holds it down: the face slides down the depth of the band and
// covers it.

import { INTERACTIVE } from "./dom";

/**
 * The depth of the band a computed `box-shadow` draws along an element's bottom
 * edge: the deepest inset shadow standing straight up from the bottom with no
 * blur. 0 where there is none.
 */
export function bandDepth(boxShadow: string): number {
  let depth = 0;
  for (const shadow of splitShadows(boxShadow)) {
    if (!/\binset\b/.test(shadow)) continue;
    // Colours carry numbers of their own, so they go before the lengths are read.
    const lengths = shadow
      .replace(/rgba?\([^)]*\)|hsla?\([^)]*\)|var\([^)]*\)|#[0-9a-f]{3,8}\b|\binset\b|\b[a-z]+\b/gi, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((v) => Number.parseFloat(v));
    const [x = Number.NaN, y = Number.NaN, blur = 0] = lengths;
    if (x === 0 && y < 0 && blur === 0) depth = Math.max(depth, -y);
  }
  return depth;
}

/** The shadows of a `box-shadow` list, split at the commas outside parentheses. */
function splitShadows(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((s) => s.trim()).filter((s) => s && s !== "none");
}

/** The keys that press the control holding the focus. */
const PRESS_KEYS = new Set(["Enter", " "]);

/** The holder of a sunk control that is the key rather than a pointer. */
const KEY = "key";

/**
 * Sink the banded control each pointer presses inside `root` until that pointer
 * lets go or is cancelled, and the one holding the focus while Enter or Space is
 * down: `is-pressed` on it, the band's depth in `--press`, its four corner radii
 * in `--press-radius`, and its translate moved down by the depth. A pointer that
 * presses again lets its last control rise first, and a control two of them hold
 * sinks once and rises when the last of them lets go. While the key is
 * down, the control the focus comes back to after the screen is drawn again sinks
 * in the place of the one the key went down on; the focus moving to another
 * control while that one is still on the glass, a dialog the key opened taking it
 * included, lets it rise and sinks nothing. A control out of reach, and one
 * carrying `data-press="none"` because this touch only brings the focus to it,
 * does not sink. The window losing the focus lets every control rise. Returns the
 * step that stops listening.
 */
export function attachPress(root: HTMLElement): () => void {
  // The control each pointer, by its id, and the key keep down.
  const held = new Map<number | typeof KEY, HTMLElement>();
  // The control the key went down on, band or none.
  let keyed: Element | null = null;
  const release = (holder: number | typeof KEY): void => {
    const node = held.get(holder);
    held.delete(holder);
    if (!node || [...held.values()].includes(node)) return;
    node.classList.remove("is-pressed");
    for (const prop of ["--press", "--press-radius", "translate"]) node.style.removeProperty(prop);
  };
  const sink = (holder: number | typeof KEY, target: EventTarget | null): void => {
    release(holder);
    const node = target instanceof Element ? target.closest<HTMLElement>(INTERACTIVE) : null;
    if (!node || !root.contains(node) || node.matches(":disabled, [aria-disabled='true'], [data-press='none']")) return;
    // A control another holder keeps down is down already.
    if (![...held.values()].includes(node)) {
      const style = getComputedStyle(node);
      const depth = bandDepth(style.boxShadow);
      if (depth <= 0) return;
      const [x = "0px", y = "0px"] = !style.translate || style.translate === "none" ? [] : style.translate.split(/\s+/);
      node.style.setProperty("--press", `${depth}px`);
      const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
      node.style.setProperty("--press-radius", corners.map((r) => r || "0px").join(" "));
      node.style.setProperty("translate", `${x} calc(${y} + ${depth}px)`);
      node.classList.add("is-pressed");
    }
    held.set(holder, node);
  };
  const onPointer = (ev: PointerEvent): void => sink(ev.pointerId, ev.target);
  const onPointerEnd = (ev: PointerEvent): void => release(ev.pointerId);
  // The keyed control sinks while it holds the focus. Once a redraw has replaced
  // it, the element the focus lands on takes its place.
  const follow = (focused: Element | null): void => {
    if (keyed && !keyed.isConnected && focused) keyed = focused;
    if (keyed && keyed === focused) sink(KEY, focused);
    else release(KEY);
  };
  const onKeyDown = (ev: KeyboardEvent): void => {
    if (!PRESS_KEYS.has(ev.key) || ev.isComposing || keyed?.isConnected) return;
    keyed = ev.target instanceof Element ? ev.target : null;
    follow(document.activeElement);
  };
  const onFocus = (ev: Event): void => {
    if (keyed) follow(ev.target instanceof Element ? ev.target : null);
  };
  const onKeyUp = (ev: KeyboardEvent): void => {
    if (!PRESS_KEYS.has(ev.key)) return;
    keyed = null;
    release(KEY);
  };
  const onBlur = (): void => {
    keyed = null;
    for (const holder of [...held.keys()]) release(holder);
  };
  root.addEventListener("pointerdown", onPointer);
  root.addEventListener("keydown", onKeyDown);
  root.addEventListener("focusin", onFocus);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("pointerup", onPointerEnd);
  window.addEventListener("pointercancel", onPointerEnd);
  window.addEventListener("blur", onBlur);
  return () => {
    onBlur();
    root.removeEventListener("pointerdown", onPointer);
    root.removeEventListener("keydown", onKeyDown);
    root.removeEventListener("focusin", onFocus);
    window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("pointerup", onPointerEnd);
    window.removeEventListener("pointercancel", onPointerEnd);
    window.removeEventListener("blur", onBlur);
  };
}
