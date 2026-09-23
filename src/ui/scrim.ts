// The darkening a sheet or a dialog lays over the screen under it. The overlays
// take what lies behind them through an SVG filter: each colour channel is
// scaled (with a small offset on blue) and then taken down to 32 / 64 / 32
// steps, which is how the guide's darkened captures come out.

const NS = "http://www.w3.org/2000/svg";

/** The id the overlays' backdrop-filter refers to. */
export const SCRIM_FILTER_ID = "lcd-scrim";

/** Per-channel scale and offset (0..1) applied before the steps, and the steps per channel. */
export const SCRIM = {
  scale: [0.204, 0.202, 0.192],
  offset: [0, 0, 0.00196],
  steps: [32, 64, 32],
} as const;

/** The SVG holding the filter, to sit inside the LCD so the overlays can refer to it. */
export function scrimFilter(): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "lcd-filters");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  const filter = document.createElementNS(NS, "filter");
  filter.setAttribute("id", SCRIM_FILTER_ID);
  filter.setAttribute("color-interpolation-filters", "sRGB");
  const [r, g, b] = SCRIM.scale;
  const [or, og, ob] = SCRIM.offset;
  const matrix = document.createElementNS(NS, "feColorMatrix");
  matrix.setAttribute("type", "matrix");
  matrix.setAttribute("values", `${r} 0 0 0 ${or}  0 ${g} 0 0 ${og}  0 0 ${b} 0 ${ob}  0 0 0 1 0`);
  const transfer = document.createElementNS(NS, "feComponentTransfer");
  const channels = [
    ["feFuncR", SCRIM.steps[0]],
    ["feFuncG", SCRIM.steps[1]],
    ["feFuncB", SCRIM.steps[2]],
  ] as const;
  for (const [tag, steps] of channels) {
    const fn = document.createElementNS(NS, tag);
    fn.setAttribute("type", "discrete");
    fn.setAttribute("tableValues", Array.from({ length: steps }, (_, i) => (i / (steps - 1)).toFixed(5)).join(" "));
    transfer.appendChild(fn);
  }
  filter.append(matrix, transfer);
  svg.appendChild(filter);
  return svg;
}
