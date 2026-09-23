// Toolbar and strip icons, drawn as inline SVG so the project keeps no image
// assets and no icon dependency.

const NS = "http://www.w3.org/2000/svg";

/**
 * `fit` scales the drawing about the middle of the box and nudges it, for a
 * glyph whose path was drawn smaller than the unit draws it.
 */
function svg(viewBox: string, paths: string[], filled = false, fit?: { s: number; sy?: number; dx?: number; dy?: number }): SVGSVGElement {
  const node = document.createElementNS(NS, "svg");
  node.setAttribute("viewBox", viewBox);
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  const host = fit ? document.createElementNS(NS, "g") : node;
  if (fit) {
    host.setAttribute("transform", `translate(${fit.dx ?? 0} ${fit.dy ?? 0}) translate(12 12) scale(${fit.s} ${fit.sy ?? fit.s}) translate(-12 -12)`);
    node.appendChild(host);
  }
  for (const d of paths) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", filled ? "currentColor" : "none");
    // A filled glyph can cut a hole with a second subpath — the knob's mark.
    if (filled) p.setAttribute("fill-rule", "evenodd");
    if (!filled) {
      p.setAttribute("stroke", "currentColor");
      p.setAttribute("stroke-width", "1.6");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    host.appendChild(p);
  }
  return node;
}

/**
 * A glyph that is part outline and part solid, drawn at its own size: `strokes`
 * take a 2px line, `fills` are painted.
 */
function mixed(viewBox: string, strokes: string[], fills: string[], name: string): SVGSVGElement {
  const node = svg(viewBox, strokes);
  for (const p of node.querySelectorAll("path")) {
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "butt");
    p.setAttribute("stroke-linejoin", "miter");
  }
  for (const d of fills) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    path.setAttribute("fill-rule", "evenodd");
    node.appendChild(path);
  }
  node.setAttribute("class", name);
  return node;
}

/** Name a glyph so the stylesheet can give it the box it is drawn for. */
function sized(node: SVGSVGElement, name: string): SVGSVGElement {
  node.setAttribute("class", name);
  return node;
}

/** A glyph given as whole pixels: each key is a coverage, each value the rows of pixels drawn at it. */
function pixelGlyph(layers: Record<string, string>, name: string): SVGSVGElement {
  const node = document.createElementNS(NS, "svg");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("aria-hidden", "true");
  node.setAttribute("focusable", "false");
  node.setAttribute("overflow", "visible");
  node.setAttribute("shape-rendering", "crispEdges");
  for (const [coverage, d] of Object.entries(layers)) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "currentColor");
    path.setAttribute("fill-opacity", coverage);
    path.setAttribute("stroke", "none");
    node.appendChild(path);
  }
  node.setAttribute("class", name);
  return node;
}

/** One channel step arrow: a 7x12 chevron with a 2px stroke and flat ends. */
function chevron(d: string): SVGSVGElement {
  const node = svg("0 0 7 12", [d]);
  const path = node.querySelector("path");
  path?.setAttribute("stroke-width", "2");
  path?.setAttribute("stroke-linecap", "butt");
  return node;
}

/**
 * The note values tempo sync counts in, as the unit draws them: seven rows of
 * pixels, a head at the foot of the stem, flags or beams at its top, the triplet's
 * 3 beside the beam and the dot beside the head. `#` is a pixel drawn.
 */
const NOTE_PIXELS: Readonly<Record<string, readonly string[]>> = {
  "1/32T": ["..#########.###", "..#.#.#.#.#...#", "..#########..#.", "..#...#...#...#", ".##..##..##.##.", "###.###.###....", "##..##..##....."],
  "1/16T": ["..#########.###", "..#...#...#...#", "..#########..#.", "..#...#...#...#", ".##..##..##.##.", "###.###.###....", "##..##..##....."],
  "1/16": ["..#..", "..##.", "..#.#", "..##.", ".##.#", "###..", "##..."],
  "1/8T": ["..#########.###", "..#...#...#...#", "..#...#...#..#.", "..#...#...#...#", ".##..##..##.##.", "###.###.###....", "##..##..##....."],
  "1/16.": ["..#.....", "..##....", "..#.#...", "..##....", ".##.#.##", "###...##", "##......"],
  "1/8": ["..#..", "..##.", "..#.#", "..#.#", ".##.#", "###..", "##..."],
  "1/4T": ["..#...#...#.###", "..#...#...#...#", "..#...#...#..#.", "..#...#...#...#", ".##..##..##.##.", "###.###.###....", "##..##..##....."],
  "1/8.": ["..#.....", "..##....", "..#.#...", "..#.#...", ".##.#.##", "###...##", "##......"],
  "1/4": ["..#", "..#", "..#", "..#", ".##", "###", "##."],
  "1/4.": ["..#....", "..#....", "..#....", "..#....", ".##..##", "###..##", "##....."],
  "1/2": ["...#", "...#", "...#", "...#", ".###", "#..#", ".##."],
  "1/2.": ["...#.....", "...#.....", "...#.....", "...#.....", ".###...##", "#..#...##", ".##......"],
  whole: ["....", "....", "....", "....", "###.", "#..#", ".###"],
  "whole x2": [".........", ".........", ".........", ".........", "###..###.", "#..#.#..#", ".###..###"],
};

/** A page with its top-right corner folded down, as the card browser draws a file. */
const PAGE_OUTLINE = "M0 0H10L16 6V20H0Z M2 2H9V7H14V18H2Z";

export const Icons = {
  /** Take the card out: the card's outline, with the eject mark on it. */
  eject: (): SVGSVGElement => {
    const node = document.createElementNS(NS, "svg");
    node.setAttribute("viewBox", "0 0 16 20");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    // The card is a rectangle with the corner cut off, as the slot keys it.
    const card = document.createElementNS(NS, "path");
    card.setAttribute("d", "M6.5 1 L15 1 L15 19 L1 19 L1 6.5 Z");
    card.setAttribute("fill", "none");
    card.setAttribute("stroke", "currentColor");
    card.setAttribute("stroke-width", "2");
    card.setAttribute("stroke-linejoin", "round");
    const mark = document.createElementNS(NS, "path");
    mark.setAttribute("d", "M8 6H9V7H10V8H11V10H12V11H5V10H6V8H7V7H8Z");
    mark.setAttribute("fill", "currentColor");
    const bar = document.createElementNS(NS, "rect");
    bar.setAttribute("x", "5");
    bar.setAttribute("y", "12");
    bar.setAttribute("width", "7");
    bar.setAttribute("height", "1");
    bar.setAttribute("fill", "currentColor");
    node.append(card, mark, bar);
    return node;
  },

  /** The mark a dialog that warns asks with: a triangle inside a dark one, carrying an "!". */
  caution: (): SVGSVGElement => {
    const node = document.createElementNS(NS, "svg");
    node.setAttribute("viewBox", "0 0 44 44");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    node.setAttribute("class", "icon-caution");
    const face = document.createElementNS(NS, "polygon");
    face.setAttribute("points", "22,1 43,41 1,41");
    face.setAttribute("fill", "var(--dialog-mark-face)");
    const edge = document.createElementNS(NS, "polygon");
    edge.setAttribute("points", "22,8 37,37.5 7,37.5");
    edge.setAttribute("fill", "none");
    edge.setAttribute("stroke", "currentColor");
    edge.setAttribute("stroke-width", "3");
    edge.setAttribute("stroke-linejoin", "round");
    node.append(face, edge);
    for (const [y, h] of [[17, 10], [29, 3]] as const) {
      const bar = document.createElementNS(NS, "rect");
      bar.setAttribute("x", "20.5");
      bar.setAttribute("y", String(y));
      bar.setAttribute("width", "3");
      bar.setAttribute("height", String(h));
      bar.setAttribute("fill", "currentColor");
      node.appendChild(bar);
    }
    return node;
  },

  /** The mark the dialog box asks with: a ringed disc carrying an "i". */
  info: (): SVGSVGElement => {
    const node = document.createElementNS(NS, "svg");
    node.setAttribute("viewBox", "0 0 44 44");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    const disc = document.createElementNS(NS, "circle");
    disc.setAttribute("cx", "22");
    disc.setAttribute("cy", "22");
    disc.setAttribute("r", "22");
    disc.setAttribute("fill", "var(--dialog-mark-face)");
    const ring = document.createElementNS(NS, "circle");
    ring.setAttribute("cx", "22");
    ring.setAttribute("cy", "22");
    ring.setAttribute("r", "18.5");
    ring.setAttribute("fill", "none");
    ring.setAttribute("stroke", "currentColor");
    ring.setAttribute("stroke-width", "3");
    node.append(disc, ring);
    for (const [x, y, h] of [[20, 13, 3], [21, 20, 12]] as const) {
      const bar = document.createElementNS(NS, "rect");
      bar.setAttribute("x", String(x));
      bar.setAttribute("y", String(y));
      bar.setAttribute("width", "3");
      bar.setAttribute("height", String(h));
      bar.setAttribute("fill", "currentColor");
      node.appendChild(bar);
    }
    return node;
  },
  /**
   * What a dialog waits with: a dark ring the size of the info mark, and an arc
   * of the dialog's own blue that runs round it. The arc's length and angle are
   * animated in CSS, so the shape here is the full circle.
   */
  spinner: (): SVGSVGElement => {
    const node = document.createElementNS(NS, "svg");
    node.setAttribute("viewBox", "0 0 44 44");
    node.setAttribute("aria-hidden", "true");
    node.setAttribute("focusable", "false");
    for (const cls of ["spin-track", "spin-arc"]) {
      const ring = document.createElementNS(NS, "circle");
      ring.setAttribute("cx", "22");
      ring.setAttribute("cy", "22");
      ring.setAttribute("r", "18.5");
      ring.setAttribute("fill", "none");
      ring.setAttribute("stroke-width", "3");
      ring.setAttribute("class", cls);
      node.appendChild(ring);
    }
    return node;
  },

  // The six-tooth gear drawn pixel by pixel: one path per coverage level over the
  // 24px box, the rightmost column one pixel past its edge.
  setup: (): SVGSVGElement =>
    pixelGlyph({
      "0.25": "M6 4h2v1h-2ZM20 4h2v1h-2ZM9 5h1v1h-1ZM18 5h1v1h-1ZM4 7h1v1h-1ZM8 7h1v1h-1ZM11 7h1v1h-1ZM16 7h1v1h-1ZM19 7h1v1h-1ZM23 7h1v1h-1ZM21 8h1v1h-1ZM3 9h1v1h-1ZM11 9h1v1h-1ZM16 9h1v1h-1ZM24 9h1v1h-1ZM6 10h1v1h-1ZM10 10h1v1h-1ZM17 10h1v1h-1ZM21 10h1v1h-1ZM7 11h1v1h-1ZM20 11h1v1h-1ZM7 14h1v1h-1ZM20 14h1v1h-1ZM6 15h1v1h-1ZM10 15h1v1h-1ZM17 15h1v1h-1ZM21 15h1v1h-1ZM3 16h1v1h-1ZM11 16h1v1h-1ZM16 16h1v1h-1ZM24 16h1v1h-1ZM6 17h1v1h-1ZM21 17h1v1h-1ZM4 18h1v1h-1ZM8 18h1v1h-1ZM11 18h1v1h-1ZM16 18h1v1h-1ZM19 18h1v1h-1ZM23 18h1v1h-1ZM9 20h1v1h-1ZM18 20h1v1h-1ZM6 21h2v1h-2ZM20 21h2v1h-2Z",
      "0.5": "M10 2h1v1h-1ZM17 2h1v1h-1ZM6 8h1v1h-1ZM12 11h1v1h-1ZM15 11h1v1h-1ZM5 12h1v1h-1ZM22 12h1v1h-1ZM5 13h1v1h-1ZM22 13h1v1h-1ZM12 14h1v1h-1ZM15 14h1v1h-1ZM5 19h1v1h-1ZM10 23h1v1h-1ZM17 23h1v1h-1Z",
      "0.75": "M10 3h1v1h-1ZM17 3h1v1h-1ZM10 4h1v1h-1ZM17 4h1v1h-1ZM8 5h1v1h-1ZM19 5h1v1h-1ZM5 6h1v1h-1ZM22 6h1v1h-1ZM9 7h2v1h-2ZM17 7h2v1h-2ZM4 8h1v1h-1ZM23 8h1v1h-1ZM5 9h1v1h-1ZM12 9h1v1h-1ZM15 9h1v1h-1ZM22 9h1v1h-1ZM3 10h1v1h-1ZM5 10h1v1h-1ZM22 10h1v1h-1ZM24 10h1v1h-1ZM4 11h1v1h-1ZM10 11h1v1h-1ZM17 11h1v1h-1ZM23 11h1v1h-1ZM4 14h1v1h-1ZM10 14h1v1h-1ZM17 14h1v1h-1ZM23 14h1v1h-1ZM3 15h1v1h-1ZM5 15h1v1h-1ZM22 15h1v1h-1ZM24 15h1v1h-1ZM5 16h1v1h-1ZM12 16h1v1h-1ZM15 16h1v1h-1ZM22 16h1v1h-1ZM4 17h1v1h-1ZM23 17h1v1h-1ZM9 18h2v1h-2ZM17 18h2v1h-2ZM22 19h1v1h-1ZM8 20h1v1h-1ZM10 20h1v1h-1ZM19 20h1v1h-1ZM10 21h1v1h-1ZM17 21h1v1h-1ZM10 22h1v1h-1ZM17 22h1v1h-1Z",
      "1.0": "M11 2h6v1h-6ZM11 3h6v1h-6ZM11 4h1v1h-1ZM16 4h1v1h-1ZM6 5h2v1h-2ZM10 5h2v1h-2ZM16 5h2v1h-2ZM20 5h2v1h-2ZM6 6h6v1h-6ZM16 6h6v1h-6ZM5 7h2v1h-2ZM21 7h2v1h-2ZM5 8h1v1h-1ZM22 8h1v1h-1ZM4 9h1v1h-1ZM13 9h2v1h-2ZM23 9h1v1h-1ZM4 10h1v1h-1ZM11 10h6v1h-6ZM23 10h1v1h-1ZM5 11h2v1h-2ZM11 11h1v1h-1ZM16 11h1v1h-1ZM21 11h2v1h-2ZM6 12h2v1h-2ZM10 12h2v1h-2ZM16 12h2v1h-2ZM20 12h2v1h-2ZM6 13h2v1h-2ZM10 13h2v1h-2ZM16 13h2v1h-2ZM20 13h2v1h-2ZM5 14h2v1h-2ZM11 14h1v1h-1ZM16 14h1v1h-1ZM21 14h2v1h-2ZM4 15h1v1h-1ZM11 15h6v1h-6ZM23 15h1v1h-1ZM4 16h1v1h-1ZM13 16h2v1h-2ZM23 16h1v1h-1ZM5 17h1v1h-1ZM22 17h1v1h-1ZM5 18h2v1h-2ZM21 18h2v1h-2ZM6 19h6v1h-6ZM16 19h6v1h-6ZM6 20h2v1h-2ZM11 20h1v1h-1ZM16 20h2v1h-2ZM20 20h2v1h-2ZM11 21h1v1h-1ZM16 21h1v1h-1ZM11 22h6v1h-6ZM11 23h6v1h-6Z",
    }, "icon-setup"),
  // An SD card drawn pixel by pixel: the corner cut off the top left, three
  // contacts under the top edge and a label panel at the bottom.
  storage: (): SVGSVGElement =>
    pixelGlyph({
      "0.25": "M10 4h1v1h-1Z",
      "0.75": "M9 2h1v1h-1ZM8 3h1v1h-1ZM7 4h1v1h-1ZM9 4h1v1h-1ZM6 5h1v1h-1ZM8 5h1v1h-1ZM5 6h1v1h-1ZM7 6h1v1h-1ZM4 7h1v1h-1ZM6 7h1v1h-1Z",
      "1.0": "M10 2h14v1h-14ZM9 3h15v1h-15ZM8 4h1v1h-1ZM22 4h2v1h-2ZM7 5h1v1h-1ZM22 5h2v1h-2ZM6 6h1v1h-1ZM10 6h2v1h-2ZM14 6h2v1h-2ZM18 6h2v1h-2ZM22 6h2v1h-2ZM5 7h1v1h-1ZM10 7h2v1h-2ZM14 7h2v1h-2ZM18 7h2v1h-2ZM22 7h2v1h-2ZM4 8h2v1h-2ZM10 8h2v1h-2ZM14 8h2v1h-2ZM18 8h2v1h-2ZM22 8h2v1h-2ZM4 9h2v1h-2ZM10 9h2v1h-2ZM14 9h2v1h-2ZM18 9h2v1h-2ZM22 9h2v1h-2ZM4 10h2v1h-2ZM22 10h2v1h-2ZM4 11h2v1h-2ZM22 11h2v1h-2ZM4 12h2v1h-2ZM22 12h2v1h-2ZM4 13h2v1h-2ZM22 13h2v1h-2ZM4 14h2v1h-2ZM22 14h2v1h-2ZM4 15h2v1h-2ZM22 15h2v1h-2ZM4 16h2v1h-2ZM9 16h10v1h-10ZM22 16h2v1h-2ZM4 17h2v1h-2ZM9 17h10v1h-10ZM22 17h2v1h-2ZM4 18h2v1h-2ZM9 18h2v1h-2ZM17 18h2v1h-2ZM22 18h2v1h-2ZM4 19h2v1h-2ZM9 19h2v1h-2ZM17 19h2v1h-2ZM22 19h2v1h-2ZM4 20h2v1h-2ZM9 20h2v1h-2ZM17 20h2v1h-2ZM22 20h2v1h-2ZM4 21h2v1h-2ZM9 21h2v1h-2ZM17 21h2v1h-2ZM22 21h2v1h-2ZM4 22h20v1h-20ZM4 23h20v1h-20Z",
    }, "icon-storage"),
  // Headphones drawn pixel by pixel: the band and two open cups.
  monitor: (): SVGSVGElement =>
    pixelGlyph({
      "0.25": "M10 3h1v1h-1ZM17 3h1v1h-1ZM8 4h1v1h-1ZM19 4h1v1h-1ZM7 5h1v1h-1ZM12 5h1v1h-1ZM15 5h1v1h-1ZM20 5h1v1h-1ZM6 6h1v1h-1ZM21 6h1v1h-1ZM5 8h1v1h-1ZM22 8h1v1h-1ZM7 10h1v1h-1ZM20 10h1v1h-1Z",
      "0.5": "M11 3h1v1h-1ZM16 3h1v1h-1ZM11 5h1v1h-1ZM16 5h1v1h-1ZM9 6h1v1h-1ZM18 6h1v1h-1ZM8 7h1v1h-1ZM19 7h1v1h-1ZM5 9h1v1h-1ZM7 9h1v1h-1ZM20 9h1v1h-1ZM22 9h1v1h-1Z",
      "0.75": "M12 3h1v1h-1ZM15 3h1v1h-1ZM9 4h1v1h-1ZM18 4h1v1h-1ZM6 7h1v1h-1ZM21 7h1v1h-1ZM5 10h1v1h-1ZM22 10h1v1h-1Z",
      "1.0": "M13 3h2v1h-2ZM10 4h8v1h-8ZM8 5h3v1h-3ZM17 5h3v1h-3ZM7 6h2v1h-2ZM19 6h2v1h-2ZM7 7h1v1h-1ZM20 7h1v1h-1ZM6 8h2v1h-2ZM20 8h2v1h-2ZM6 9h1v1h-1ZM21 9h1v1h-1ZM6 10h1v1h-1ZM21 10h1v1h-1ZM5 11h2v1h-2ZM21 11h2v1h-2ZM5 12h2v1h-2ZM21 12h2v1h-2ZM5 13h2v1h-2ZM21 13h2v1h-2ZM5 14h7v1h-7ZM16 14h7v1h-7ZM5 15h7v1h-7ZM16 15h7v1h-7ZM5 16h2v1h-2ZM10 16h2v1h-2ZM16 16h2v1h-2ZM21 16h2v1h-2ZM5 17h2v1h-2ZM10 17h2v1h-2ZM16 17h2v1h-2ZM21 17h2v1h-2ZM5 18h2v1h-2ZM10 18h2v1h-2ZM16 18h2v1h-2ZM21 18h2v1h-2ZM5 19h2v1h-2ZM10 19h2v1h-2ZM16 19h2v1h-2ZM21 19h2v1h-2ZM5 20h2v1h-2ZM10 20h2v1h-2ZM16 20h2v1h-2ZM21 20h2v1h-2ZM5 21h7v1h-7ZM16 21h7v1h-7ZM5 22h7v1h-7ZM16 22h7v1h-7Z",
    }, "icon-monitor"),
  // One outline: the roof slopes stop where the walls start rather than
  // overhanging them, and the baseline breaks for the doorway.
  home: (): SVGSVGElement => svg("0 0 24 24", ["M12 4L4 9.5V22H9V15H15V22H20V9.5Z"]),
  /**
   * The way back. Drawn at its own size so the ink fills the box: a 45-degree
   * head at the left, a shaft, a half turn down the right and a short return
   * under it. The stroke reaches a pixel past the box on every side, so the
   * stylesheet lets it overflow.
   */
  back: (): SVGSVGElement =>
    sized(
      svg("0 0 18 14", ["M5.44 0.46 0.98 4.92 5.24 9.16", "M0.98 4.87H12.67A4.35 4.35 0 0 1 12.67 13.56H11.74"]),
      "icon-back",
    ),
  edit: (): SVGSVGElement =>
    mixed(
      "0 0 24 24",
      ["M4 20H7L20 7L16.88 3.88L4 16.75Z", "M14.13 6.63L17.25 9.75"],
      ["M14.13 6.63L17.25 9.75L20 7L16.88 3.88Z"],
      "icon-edit",
    ),
  /** A factory preset's lock: a works under a sawtooth roof, its chimney, and a row of windows, drawn at its own size. */
  factory: (): SVGSVGElement =>
    sized(
      svg("0 0 20 20", [
        "M0 8.25L7 4.75V7.25L12 4.75V8H15.1L16 0H19L19.9 8H20V20H0Z M2 9.25L5 7.75V10.25L10 7.75V10H18V18H2Z M5 12H7V16H5Z M9 12H11V16H9Z M13 12H15V16H13Z",
      ], true),
      "icon-factory",
    ),
  /** Protect: a padlock, its shackle over a body with a round keyhole, drawn at its own size. */
  lock: (): SVGSVGElement =>
    sized(
      svg("0 0 16 21", [
        "M3 7V5A5 5 0 0 1 13 5V7H11V5A3 3 0 0 0 5 5V7Z",
        "M1.5 7H14.5A1.5 1.5 0 0 1 16 8.5V19.5A1.5 1.5 0 0 1 14.5 21H1.5A1.5 1.5 0 0 1 0 19.5V8.5A1.5 1.5 0 0 1 1.5 7Z M2 9V19H14V9Z M8 12A2 2 0 1 0 8 16A2 2 0 1 0 8 12Z",
      ], true),
      "icon-lock",
    ),
  /** The mark beside the last recalled scene in the scene list: a small triangle pointing right. */
  recalled: (): SVGSVGElement => sized(svg("0 0 8 9", ["M0 0.3L7.8 4.5L0 8.7Z"], true), "icon-recalled"),
  // The card browser's rows and its edit buttons.
  folder: (): SVGSVGElement => sized(svg("0 0 20 16", ["M0 16V0H7L9 3H20V16Z"], true), "icon-folder"),
  /** A settings file: the page outline, its corner folded down, with two lines on it. */
  file: (): SVGSVGElement => sized(svg("0 0 16 20", [PAGE_OUTLINE, "M4 10H12V12H4Z M4 14H12V16H4Z"], true), "icon-file"),
  /** A file that can be played back: the page outline, its corner folded down, with a note on it. */
  audioFile: (): SVGSVGElement =>
    sized(
      svg("0 0 16 20", [
        PAGE_OUTLINE,
        "M8 9H12V11H9V15H8Z",
        "M4.44 15.49A2.3 2 -20 1 0 8.76 13.91A2.3 2 -20 1 0 4.44 15.49Z",
      ], true),
      "icon-audio",
    ),
  /** The file playing: a speaker, with two arcs of sound off its right. */
  speaker: (): SVGSVGElement =>
    sized(
      svg("0 0 18 18", [
        "M0 6H3.9L9 0.9V16.8L4.2 12H0Z",
        "M11 5.3H12.1A5.59 5.59 0 0 1 12.1 12.7H11Z",
        "M11.33 0.31A9 9 0 0 1 11.33 17.69L10.81 15.76A7 7 0 0 0 10.81 2.24Z",
      ], true),
      "icon-speaker",
    ),
  /** The way up out of a folder: an arrow whose shaft turns right along its foot. */
  upFolder: (): SVGSVGElement => mixed("0 0 17 15", ["M0.7 6.7 5.95 1.45 11.2 6.7"], ["M5 2H7V13H17V15H5Z"], "icon-up"),
  /** New folder: the folder's outline with a plus inside it, drawn at its own size. */
  newFolder: (): SVGSVGElement =>
    sized(svg("0 0 20 16", ["M0 0H8L10 2H20V16H0Z M2 2H7.5L9.5 4H18V14H2Z", "M12 6H14V8H16V10H14V12H12V10H10V8H12Z"], true), "icon-new-folder"),
  /** Delete: a bin under its lid and handle, two slots down its body, drawn at its own size. */
  trash: (): SVGSVGElement =>
    sized(
      svg("0 0 16 18", [
        "M5 0H11V1H5Z",
        "M0 1H16V3H0Z",
        "M1 3H15V16A2 2 0 0 1 13 18H3A2 2 0 0 1 1 16Z M3 3H13V16H3Z",
        "M5 5H7V14H5Z",
        "M9 5H11V14H9Z",
      ], true),
      "icon-trash",
    ),
  /**
   * The phase mark on a HOME strip, drawn at its own size: a ring 10 wide and 7
   * high with 2px sides, and a 2px stem through it from top to bottom.
   */
  phase: (): SVGSVGElement =>
    sized(
      svg("0 0 10 11", [
        "M3 2H7C8.7 2 10 3.6 10 5.5C10 7.4 8.7 9 7 9H3C1.3 9 0 7.4 0 5.5C0 3.6 1.3 2 3 2Z M3.2 3C2.4 3 2 4.1 2 5.5C2 6.9 2.4 8 3.2 8H6.8C7.6 8 8 6.9 8 5.5C8 4.1 7.6 3 6.8 3Z",
        "M4 0H6V11H4Z",
      ], true),
      "icon-phase",
    ),
  /** Rename: a box, and a pencil laid across its open corner, drawn at its own size. */
  rename: (): SVGSVGElement =>
    sized(
      svg("0 0 20 20", [
        "M2 2H10.8L8.8 4H2V18H16V11.3L18 9.3V18A2 2 0 0 1 16 20H2A2 2 0 0 1 0 18V4A2 2 0 0 1 2 2Z",
        "M5.85 10L16.53 -0.68L20.6 3.4L10 14H5.85Z M7.65 10.95L13.8 4.8L15.2 6.2L9.05 12.35Z",
      ], true),
      "icon-rename",
    ),
  /** Backspace: a tag pointing left, a cross cut out of it, drawn at its own size. */
  backspace: (): SVGSVGElement =>
    sized(
      svg("0 0 20 12", [
        "M5 0H19A1 1 0 0 1 20 1V11A1 1 0 0 1 19 12H5L0 6Z M9.4 2.6L8 4L10 6L8 8L9.4 9.4L11.4 7.4L13.4 9.4L14.8 8L12.8 6L14.8 4L13.4 2.6L11.4 4.6Z",
      ], true),
      "icon-backspace",
    ),
  /** Clear a field: a disc, a cross cut out of it, drawn at its own size. */
  clear: (): SVGSVGElement =>
    sized(
      svg("0 0 20 20", [
        "M10 0A10 10 0 1 1 10 20A10 10 0 1 1 10 0Z M6.5 5.1L5.1 6.5L8.6 10L5.1 13.5L6.5 14.9L10 11.4L13.5 14.9L14.9 13.5L11.4 10L14.9 6.5L13.5 5.1L10 8.6Z",
      ], true),
      "icon-clear",
    ),
  /**
   * The same bin at the size the cue meter carries it: drawn filled and at its
   * own size, so its edges land on whole pixels instead of greying out. The two
   * slots are cut out of the body.
   */
  trashSmall: (): SVGSVGElement =>
    svg("0 0 12 14", ["M4 0H8V1H12V3H11V14H1V3H0V1H4Z M4 5H5V11H4Z M7 5H8V11H7Z"], true),
  // The stereo-link mark, drawn between the pan sliders of a linked pair: a
  // filled heart, symmetric about the vertical axis, with a shallow notch.
  link: (): SVGSVGElement =>
    svg(
      "0 0 24 24",
      [
        "M12 24C5 17.5 0 12.5 0 7.2C0 2.9 3.1 0 6.7 0C9.2 0 11.1 1.2 12 2.6C12.9 1.2 14.8 0 17.3 0C20.9 0 24 2.9 24 7.2C24 12.5 19 17.5 12 24Z",
      ],
      true,
    ),
  /**
   * Copy the channel's settings: a square with the corner of the one behind it
   * showing. Drawn at its own size, so the strokes land on whole pixels.
   */
  copy: (): SVGSVGElement => {
    const node = svg("0 0 10 10", ["M2.5 0.5H9.5V7.5H2.5Z", "M0.5 2.5V9.5H7.5"]);
    for (const p of node.querySelectorAll("path")) {
      p.setAttribute("stroke-width", "1");
      p.setAttribute("stroke-linejoin", "miter");
    }
    return node;
  },
  // A knob seen from above: a filled dial with its mark cut out at the top.
  // --- Side-rail tabs. The unit sets one of these above each tab's name. ---
  /**
   * MONITOR Setting: a solid gear with its hub punched out, drawn at its own
   * size. Six teeth, one of them straight up, cut deep between them. The
   * toolbar's gear is an outline and is drawn separately.
   */
  gearSolid: (): SVGSVGElement =>
    sized(
      svg(
        "0 0 20 20",
        [
          "M6.91 0.49A10.0 10.0 0 0 1 13.09 0.49L13.45 3.23A7.6 7.6 0 0 1 14.14 3.63L16.69 2.57"
          + "A10.0 10.0 0 0 1 19.78 7.92L17.59 9.60A7.6 7.6 0 0 1 17.59 10.40L19.78 12.08"
          + "A10.0 10.0 0 0 1 16.69 17.43L14.14 16.37A7.6 7.6 0 0 1 13.45 16.77L13.09 19.51"
          + "A10.0 10.0 0 0 1 6.91 19.51L6.55 16.77A7.6 7.6 0 0 1 5.86 16.37L3.31 17.43"
          + "A10.0 10.0 0 0 1 0.22 12.08L2.41 10.40A7.6 7.6 0 0 1 2.41 9.60L0.22 7.92"
          + "A10.0 10.0 0 0 1 3.31 2.57L5.86 3.63A7.6 7.6 0 0 1 6.55 3.23Z"
          + " M10 7A3 3 0 1 1 10 13A3 3 0 1 1 10 7Z",
        ],
        true,
      ),
      "icon-gear-solid",
    ),
  /**
   * MONITOR Level: three sliders, each with its cap at its own height. The track
   * breaks for the cap rather than running behind it.
   */
  fader: (): SVGSVGElement =>
    mixed(
      "0 0 18 16",
      ["M3 0V5", "M3 9V16", "M0 8H6", "M9 0V3", "M6 4H12", "M9 7V16", "M15 0V9", "M12 12H18", "M15 13V16"],
      [],
      "icon-fader",
    ),
  /** OSCILLATOR: one cycle of a sine, the crest first. */
  sine: (): SVGSVGElement =>
    mixed("0 0 16 13", ["M0.5 5.4C2.5 -1.3 5.5 -0.8 7.8 6 9.5 13 12.5 13.5 15.5 4.6"], [], "icon-sine"),
  /** Its Assign tab: a clipboard, three lines written on it. */
  clipboard: (): SVGSVGElement =>
    mixed("0 0 18 20", ["M1 3H17V19H1Z"], ["M7 0H11V2H7Z", "M4 6H14V8H4Z", "M4 10H14V12H4Z", "M4 14H11V16H4Z"], "icon-clipboard"),
  /** OUTPUT PATCH Analog: a jack seen side on, its lead curling away. */
  plug: (): SVGSVGElement =>
    mixed(
      "0 0 24 10",
      ["M2 2.7H20", "M1.1 1.7V7.25A1.5 1.5 0 0 0 2.6 8.75H12.25"],
      ["M7 0.3H17V4.8H7Z", "M20.6 1.65H23.4V3.8H20.6Z"],
      "icon-plug",
    ),
  /** Its USB tab, and Peripheral's: the USB trident. */
  usb: (): SVGSVGElement =>
    sized(
      svg(
        "0 0 14 20",
        [
          "M6 1H8V20H6Z",
          "M4 4 7 0 10 4Z",
          "M2 6A2 2 0 1 1 2 10A2 2 0 1 1 2 6Z M1 9H3V12H1Z",
          "M10 6H14V10H10Z M11 9H13V12H11Z",
          "M1 12H13L12 14H2Z",
          "M7 16A2 2 0 1 1 7 20A2 2 0 1 1 7 16Z",
        ],
        true,
      ),
      "icon-usb",
    ),
  /** Peripheral HDMI: the connector stood on end, its flange across the middle. */
  hdmi: (): SVGSVGElement =>
    mixed(
      "0 0 14 20",
      ["M2 1H12V5", "M2 5V1", "M1 7V10.6L4.4 19H9.6L13 10.6V7", "M0 6H14"],
      ["M5 3H6V5H5Z", "M8 3H9V5H8Z"],
      "icon-hdmi",
    ),
  /** SAVE/LOAD: a disk, its shutter above the hub. */
  save: (): SVGSVGElement =>
    mixed(
      "0 0 18 18",
      ["M1 1H14L17 4V17H1Z"],
      ["M3 3H12V7H3Z", "M9 9A3 3 0 1 1 9 15A3 3 0 1 1 9 9Z"],
      "icon-save",
    ),
  /**
   * SCENE Store/Recall: a filled box with its lid slot and a pair of arrows cut
   * out of it, one going in and one coming out. Drawn at its own size.
   */
  archive: (): SVGSVGElement =>
    sized(svg("0 0 18 18", [
      "M2 0H16A2 2 0 0 1 18 2V16A2 2 0 0 1 16 18H2A2 2 0 0 1 0 16V2A2 2 0 0 1 2 0Z"
      + " M3 2H15V3H3Z"
      + " M4 8.5H6V12.5H9L5 16.5L1 12.5H4Z"
      + " M13 4L16 8H14V12.5H12V8H10Z",
    ], true), "icon-archive"),
  /** TOOLS Format: a ring broken at the top right, with an arrow into the break. */
  refresh: (): SVGSVGElement =>
    mixed("0 0 16 16", ["M12.95 3.05A7 7 0 1 0 14.89 9.22"], ["M13.6 -0.4H16V6.6H8.4L10.6 3.6H13.6Z"], "icon-refresh"),
  /**
   * Its Test tab: a gauge. One closed outline — the two sides, the flat bottom
   * and the dial over them — broken at the top right where the needle points
   * out of it.
   */
  gauge: (): SVGSVGElement =>
    mixed(
      "0 0 24 24",
      ["M22.5 8.5V20.5A2 2 0 0 1 20.5 22.5H3.5A2 2 0 0 1 1.5 20.5V12A10.5 10.5 0 0 1 18.75 3.96"],
      ["M19.5 5L8.94 14.41L13.06 17.59Z"],
      "icon-gauge",
    ),
  /** RECORDER Record: a filled disc. */
  record: (): SVGSVGElement => sized(svg("0 0 14 14", ["M7 0A7 7 0 1 1 7 14A7 7 0 1 1 7 0Z"], true), "icon-record"),
  /** Its Play tab: a filled disc with the triangle cut out of it. */
  play: (): SVGSVGElement =>
    sized(
      svg("0 0 20 20", ["M10 -0.2A10.2 10.2 0 1 1 10 20.2A10.2 10.2 0 1 1 10 -0.2Z M7.4 5.6V14.4L14.2 9.8Z"], true),
      "icon-play",
    ),
  /** The transport's stop: a filled square, drawn at its own size. */
  stop: (): SVGSVGElement => sized(svg("0 0 12 12", ["M0 0H12V12H0Z"], true), "icon-stop"),
  /** Its play: a triangle pointing right, drawn at its own size. */
  transportPlay: (): SVGSVGElement => sized(svg("0 0 11 14", ["M0 0L10.5 7L0 14Z"], true), "icon-transport-play"),
  /** Its pause: two bars, drawn at their own size. */
  pause: (): SVGSVGElement => sized(svg("0 0 12 14", ["M0 0H4V14H0Z", "M8 0H12V14H8Z"], true), "icon-pause"),
  /** Bring the cursor to the file playing: three lines of a list, a play mark beside the last. */
  toPlaying: (): SVGSVGElement =>
    sized(svg("0 0 19 15", ["M0 0H12V2H0Z", "M0 4H12V6H0Z", "M0 8H8V10H0Z", "M13 7L19 11L13 15Z"], true), "icon-to-playing"),

  /**
   * The channel step arrows. Drawn at their own size rather than set as a
   * character, so the stroke lands on whole pixels at the size the unit uses.
   */
  chevronLeft: (): SVGSVGElement => chevron("M6.5 0 1 6 6.5 12"),
  chevronRight: (): SVGSVGElement => chevron("M0.5 0 6 6 0.5 12"),

  /** The step to the readout bar's next page of knobs: a solid chevron, 8x12, its arms 3px thick. */
  pageBack: (): SVGSVGElement => sized(svg("0 0 8 12", ["M8 0H5L0 6L5 12H8L3 6Z"], true), "icon-page-step"),
  pageOn: (): SVGSVGElement => sized(svg("0 0 8 12", ["M0 0H3L8 6L3 12H0L5 6Z"], true), "icon-page-step"),

  /**
   * The mark on [SEND TO]: a lead rising from below that turns right into a
   * pair of chevrons.
   */
  /** The curve in EQ's lit title box: five dots joined by a 2px line, the first cut by the box's edge. */
  eqBadgeCurve: (): SVGSVGElement => {
    const points = [[-0.5, 9.5], [9.5, 28.5], [20, 9.5], [30, 24.5], [40, 17.5]] as const;
    const node = svg("0 0 44 36", [`M${points.map(([x, y]) => `${x} ${y}`).join(" ")}`]);
    const line = node.querySelector("path");
    line?.setAttribute("stroke-width", "2");
    line?.setAttribute("stroke-linecap", "butt");
    for (const [cx, cy] of points) {
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "4");
      dot.setAttribute("fill", "currentColor");
      node.appendChild(dot);
    }
    node.setAttribute("class", "icon-eq-badge-curve");
    return node;
  },

  sendTo: (): SVGSVGElement =>
    svg("0 0 16 11", ["M1.2 11V8.4A3 3 0 0 1 4.2 5.4H10", "M6 0.8 10 4.9 6 9", "M10 0.8 14 4.9 10 9"]),

  /**
   * The outline the EQ shape box names a band's filter with, 30x20 on a 2px
   * line: a bell is a lens on the flat line, a shelf opens towards its side, a
   * pass filter climbs from the side it cuts.
   */
  eqShape: (shape: string): SVGSVGElement => {
    const outlines: Record<string, string[]> = {
      Bell: ["M0 10H12", "M18 10H30", "M14.75 1L12 6.5V13.5L14.75 19L17.5 13.5V6.5Z"],
      "L.Shelf": ["M0 3H11L18 10H30", "M0 17H11L18 10"],
      "H.Shelf": ["M30 3H19L12 10H0", "M30 17H19L12 10"],
      HPF: ["M0 19L13 3H30"],
      LPF: ["M30 19L17 3H0"],
    };
    const node = svg("0 0 30 20", outlines[shape] ?? outlines["Bell"] ?? []);
    for (const p of node.querySelectorAll("path")) {
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "butt");
      p.setAttribute("stroke-linejoin", "miter");
    }
    node.setAttribute("class", "icon-eq-shape");
    return node;
  },

  /** A note value drawn as the unit draws it, one unit a pixel; nothing for a value it writes in words. */
  note: (name: string): SVGSVGElement | null => {
    const rows = NOTE_PIXELS[name];
    if (!rows) return null;
    const width = Math.max(...rows.map((r) => r.length));
    const d = rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === "#" ? [`M${x} ${y}h1v1h-1Z`] : []))).join("");
    const node = svg(`0 0 ${width} ${rows.length}`, [d], true);
    node.setAttribute("shape-rendering", "crispEdges");
    node.setAttribute("class", "icon-note");
    return node;
  },

  knob: (): SVGSVGElement =>
    svg("0 0 28 28", ["M14 4A10 10 0 1 1 14 24A10 10 0 1 1 14 4ZM13 6H15V12H13Z"], true),
} as const;

export type IconName = keyof typeof Icons;
