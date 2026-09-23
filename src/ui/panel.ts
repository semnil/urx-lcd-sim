// The frame the 480x272 screen sits in.
//
// The simulator draws the screen and nothing else. The unit's physical controls
// are not reproduced, so every value is reached on the glass: touch a value and
// drag it, turn the wheel over it, or use the arrow keys.

import type { Shell } from "../app/shell";
import { el } from "./dom";

/** Mount the screen in the frame that carries the display scale. */
export function buildPanel(shell: Shell): HTMLElement {
  // .lcd is transform-scaled, which does not reserve layout space; .lcd-frame is
  // the box that does.
  const frame = el("div", { class: "lcd-frame", children: [shell.root] });
  return el("div", { class: "panel", children: [frame] });
}
