// Element construction. Small on purpose: the screens are laid out in CSS, and
// this only removes the createElement / append boilerplate around that.

export interface ElOptions {
  class?: string;
  text?: string;
  title?: string;
  /** Inline styles. A name that starts with `--` sets a custom property. */
  style?: Partial<CSSStyleDeclaration> & Record<string, string>;
  attrs?: Record<string, string>;
  /** Makes the element a button-like control: role, tabindex and Enter/Space. */
  onTap?: (ev: Event) => void;
  children?: (Node | null | undefined | false)[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElOptions = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.title) node.title = options.title;
  if (options.style) {
    // A custom property has to go through setProperty; assigning it as a plain
    // key sets nothing and reports no error.
    for (const [name, value] of Object.entries(options.style)) {
      if (typeof value !== "string") continue;
      if (name.startsWith("--")) node.style.setProperty(name, value);
      else Object.assign(node.style, { [name]: value });
    }
  }
  if (options.attrs) for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  if (options.onTap) makeTappable(node, options.onTap);
  if (options.children) {
    for (const c of options.children) if (c) node.appendChild(c);
  }
  return node;
}

/** Anything that answers a pointer for itself. */
export const INTERACTIVE = "button, [role='button'], [role='slider'], [role='spinbutton']";

/**
 * Turn any element into an activatable control. The unit's screen is a touch
 * panel with no keyboard, but the simulator runs in a browser, so every touch
 * target is also reachable by Tab and activated by Enter or Space.
 */
export function makeTappable(node: HTMLElement, handler: (ev: Event) => void): void {
  if (!node.hasAttribute("role") && node.tagName !== "BUTTON") node.setAttribute("role", "button");
  if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
  node.addEventListener("click", (ev) => {
    // A control inside a tappable area owns its own clicks: without this, a
    // button or a value box would also fire whatever the area does.
    const inner = (ev.target as HTMLElement).closest(INTERACTIVE);
    if (inner && inner !== node) return;
    handler(ev);
  });
  // A key acts where a finger would: the control answers when the key is let go,
  // not when it goes down, and only where the same control took the key.
  let taken = false;
  node.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    ev.preventDefault();
    taken = true;
  });
  node.addEventListener("keyup", (ev) => {
    if ((ev.key !== "Enter" && ev.key !== " ") || !taken) return;
    ev.preventDefault();
    taken = false;
    handler(ev);
  });
  node.addEventListener("blur", () => {
    taken = false;
  });
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function setPressed(node: HTMLElement, on: boolean): void {
  node.classList.toggle("is-on", on);
  node.setAttribute("aria-pressed", on ? "true" : "false");
}

/** What the unit prints where a level is off rather than at a number of dB. */
export const OFF_MARK = "-\u221e";

/**
 * Format a level in dB the way the unit's value boxes do. Only the fader's off
 * notch reads -∞; -96.0 is the lowest level it can actually hold and prints as
 * a number.
 */
export function formatDb(value: number, digits = 2): string {
  if (value < -96) return OFF_MARK;
  return value.toFixed(digits);
}

/** The level below which a fader prints one decimal instead of two. */
const LEVEL_COARSE_DB = -10;

/** Format a fader level the way the unit does: two decimals, one from -10 dB down. */
export function formatLevel(value: number): string {
  return formatDb(value, value <= LEVEL_COARSE_DB ? 1 : 2);
}

/** Format a head-amp gain the way the unit does: whole dB, with a sign over zero. */
export function formatGain(value: number): string {
  const v = Math.round(value);
  return v > 0 ? `+${v}` : String(v);
}

/** Format a pan/balance position the way the unit labels it: L63 … C … R63. */
export function formatPan(value: number): string {
  const v = Math.round(value);
  if (v === 0) return "C";
  return v < 0 ? `L${-v}` : `R${v}`;
}

/** The unit a frequency is printed in: Hz up to a kilohertz, kHz above it. */
export function hzUnit(hz: number): string {
  return hz >= HZ_IN_KHZ ? "kHz" : "Hz";
}

/** A frequency the way the unit prints one, to one decimal in whichever unit. */
/** A frequency to three significant figures, in kHz from a kilohertz up. */
export function formatHz(hz: number): string {
  const v = hz >= HZ_IN_KHZ ? hz / HZ_IN_KHZ : hz;
  return v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
}

const HZ_IN_KHZ = 1000;
