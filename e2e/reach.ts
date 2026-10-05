// Which controls on the page a touch cannot land on.

import type { Page } from "@playwright/test";

/** A control a touch at the middle of its showing part lands elsewhere from. */
export interface Unreached {
  control: string;
  landsOn: string;
}

/**
 * Every control showing on the page, or inside `scope` where it is given, that a touch at the middle of its showing
 * part does not reach: the element on top there is neither it nor inside it.
 * A control the page holds out of reach on purpose is left out: one under
 * `inert` (the screen behind a dialog), one under the dark a sheet lays over
 * the screen, and one scrolled out of its list. jsdom draws nothing, so only a
 * browser can say what lies on top.
 */
export function unreached(page: Page, scope = "body"): Promise<Unreached[]> {
  return page.evaluate((scope) => {
    const CONTROLS =
      "button, select, input, textarea, [role='button'], [role='slider'], [role='spinbutton'], [role='option'], [role='tab'], [role='menuitem'], [role='switch'], [role='checkbox']";
    // What is laid over the screen, and the dark it lays: a control under them is held out of reach.
    const LAYERS = "[data-overlay], .lcd-dim";
    const describe = (node: Element): string => {
      const name = node.getAttribute("aria-label") ?? node.textContent?.trim().replace(/\s+/g, " ").slice(0, 40) ?? "";
      const cls = typeof node.className === "string" && node.className ? `.${node.className.trim().split(/\s+/).join(".")}` : "";
      return `${node.tagName.toLowerCase()}${cls} "${name}"`;
    };
    const out: { control: string; landsOn: string }[] = [];
    for (const control of document.querySelector(scope)?.querySelectorAll(CONTROLS) ?? []) {
      if (control.closest("[inert], [hidden], [aria-hidden='true']") || control.matches(":disabled, [aria-disabled='true']")) continue;
      const style = getComputedStyle(control);
      if (style.visibility !== "visible" || Number(style.opacity) === 0) continue;
      // The part of it that shows: inside the window and inside every box that clips it.
      let { left, top, right, bottom } = control.getBoundingClientRect();
      left = Math.max(left, 0);
      top = Math.max(top, 0);
      right = Math.min(right, window.innerWidth);
      bottom = Math.min(bottom, window.innerHeight);
      for (let box = control.parentElement; box; box = box.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(box);
        if (overflowX === "visible" && overflowY === "visible") continue;
        const clip = box.getBoundingClientRect();
        left = Math.max(left, clip.left);
        top = Math.max(top, clip.top);
        right = Math.min(right, clip.right);
        bottom = Math.min(bottom, clip.bottom);
      }
      if (right - left < 1 || bottom - top < 1) continue;
      const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (hit && control.contains(hit)) continue;
      const layer = hit?.closest(LAYERS);
      if (layer && !layer.contains(control)) continue;
      out.push({ control: describe(control), landsOn: hit ? describe(hit) : "nothing" });
    }
    return out;
  }, scope);
}
