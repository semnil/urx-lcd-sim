// The mark for where the keys stand. The unit has no keyboard and draws nothing
// like it, so the simulator draws it itself, in a layer over the glass: no control
// can cover it, and it holds the shape of the control the focus is on.

/** How far the ring stands off the control, and how thick its own line is. */
const GAP = 1;
const LINE = 1;

/** The box the ring draws around, in the glass's own pixels. */
interface Place {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: string;
  clip: string;
}

/** The four corners of a box, in the order `border-radius` names them. */
type Corners = [number, number, number, number];

/** A `background-position` list split at the commas outside `calc()`. */
function positions(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= list.length; i++) {
    const ch = list[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === "," && depth === 0) || i === list.length) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  return out.filter(Boolean);
}

/** How far a cell stands from an edge, and which of the two edges it is measured from. */
function edge(part: string): { far: boolean; at: number } {
  return { far: part.includes("100%"), at: Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(part)?.[1] ?? "0") };
}

/**
 * The corners a control draws for itself, read from the map of 1px cells its
 * `::after` paints: a corner runs as wide as its furthest cell across. One cell
 * alone is a shade where two edges meet, not a curve, so it counts as square.
 * `sizes` is the `background-size` beside the positions, which tells the 1px
 * cells of a corner map from a layer drawn for something else.
 */
export function drawnCorners(list: string, sizes = "1px 1px"): Corners {
  const reach: Corners = [0, 0, 0, 0];
  const cells: Corners = [0, 0, 0, 0];
  // A layer that is not a single pixel belongs to some other drawing: the side
  // tabs, for one, round their corners with a box of their own at each end.
  const sized = positions(sizes);
  const places = positions(list).filter((_, i) => sized[i % sized.length] === "1px 1px");
  for (const cell of places) {
    let depth = 0;
    let split = -1;
    for (let i = 0; i < cell.length; i++) {
      if (cell[i] === "(") depth++;
      else if (cell[i] === ")") depth--;
      else if (cell[i] === " " && depth === 0) split = i;
    }
    if (split < 0) continue;
    const x = edge(cell.slice(0, split));
    const y = edge(cell.slice(split + 1));
    const corner = y.far ? (x.far ? 2 : 3) : x.far ? 1 : 0;
    // How wide the corner runs. Its rows down the side belong to the same curve,
    // and the rows a band adds below it stay within that width.
    reach[corner] = Math.max(reach[corner], x.at);
    cells[corner]++;
  }
  const size = (i: 0 | 1 | 2 | 3): number => (cells[i] > 1 ? reach[i] + 1 : 0);
  return [size(0), size(1), size(2), size(3)];
}

/** The radii of a control's corners, each grown by how far the ring stands out. */
function ringRadius(node: Element, style: CSSStyleDeclaration, height: number): string {
  // A handle drawn in the graph is a circle, and carries no radius of its own.
  if (node instanceof SVGElement) return `${height / 2 + GAP + LINE}px`;
  const own = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
    .map((corner) => Number.parseFloat(corner) || 0) as Corners;
  // A control that draws its corners a pixel at a time carries no radius for the
  // browser to round by, so the ring takes the shape from the map instead.
  // A control that draws its corners somewhere other than a map over its face
  // names them in `--ring-corners`, as four lengths.
  const named = style.getPropertyValue("--ring-corners").trim();
  const after = own.some((at) => at > 0) || named ? null : getComputedStyle(node, "::after");
  const told = named ? (named.split(/\s+/).map((at) => Number.parseFloat(at) || 0) as Corners) : ([0, 0, 0, 0] as Corners);
  const drawn = after ? drawnCorners(after.backgroundPosition, after.backgroundSize) : told;
  const at = (i: 0 | 1 | 2 | 3): number => own[i] || drawn[i];
  return [at(0), at(1), at(2), at(3)].map((corner) => (corner > 0 ? `${corner + GAP + LINE}px` : "0px")).join(" ");
}

/**
 * What of the ring is left after the boxes that clip the control: a list row
 * scrolled under the head of its list shows only as much ring as row.
 */
function clipTo(node: Element, place: Omit<Place, "clip" | "radius">, scale: number, root: HTMLElement): string {
  // In the ring's own box, which starts whole and is taken in by each clipping box.
  let top = 0;
  let left = 0;
  let right = place.width;
  let bottom = place.height;
  for (let parent = node.parentElement; parent && parent !== root.parentElement; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    // A box that merely holds the control tight is no reason to cut the ring; the
    // glass's own edge and a box the control scrolls inside of are.
    const scrolls = parent.scrollHeight > parent.clientHeight + 1 || parent.scrollWidth > parent.clientWidth + 1;
    if (parent !== root && !scrolls) continue;
    const box = parent.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    const x = (box.left - rootBox.left) / scale - place.left;
    const y = (box.top - rootBox.top) / scale - place.top;
    top = Math.max(top, y);
    left = Math.max(left, x);
    right = Math.min(right, x + box.width / scale);
    bottom = Math.min(bottom, y + box.height / scale);
  }
  if (right <= left || bottom <= top) return "inset(50%)";
  return `inset(${top}px ${place.width - right}px ${place.height - bottom}px ${left}px)`;
}

/** Where the ring goes for the control holding the focus, or null where it draws none. */
function placeOf(node: Element, root: HTMLElement): Place | null {
  if (!node.getClientRects().length) return null;
  const rootBox = root.getBoundingClientRect();
  // The glass is drawn scaled; the ring lives inside it, in the glass's own pixels.
  const scale = rootBox.width / root.offsetWidth || 1;
  const box = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  // A control held down stands the depth of its band lower; the ring stays where the control is.
  const sunk = Number.parseFloat(style.getPropertyValue("--press")) || 0;
  const out = GAP + LINE;
  const place = {
    left: (box.left - rootBox.left) / scale - out,
    top: (box.top - rootBox.top) / scale - sunk - out,
    width: box.width / scale + out * 2,
    height: box.height / scale + out * 2,
  };
  return { ...place, radius: ringRadius(node, style, box.height / scale), clip: clipTo(node, place, scale, root) };
}

/**
 * Draw the ring around whatever inside `root` the keys are on, following it as the
 * screen is drawn again, as a list scrolls, and as a control is held down. Returns
 * the step that takes the ring away.
 */
export function attachFocusRing(root: HTMLElement): () => void {
  const ring = document.createElement("div");
  ring.className = "focus-ring";
  ring.setAttribute("aria-hidden", "true");
  ring.hidden = true;
  root.appendChild(ring);
  let frame = 0;
  const draw = (): boolean => {
    const node = document.activeElement;
    const on = node instanceof Element && node !== root && root.contains(node) && node.matches(":focus-visible");
    const place = on && node instanceof Element ? placeOf(node, root) : null;
    if (!place) {
      ring.hidden = true;
      return node instanceof Element && root.contains(node);
    }
    ring.hidden = false;
    // On whole pixels: a line across half a pixel is drawn in half its colour.
    ring.style.left = `${Math.round(place.left)}px`;
    ring.style.top = `${Math.round(place.top)}px`;
    ring.style.width = `${Math.round(place.width)}px`;
    ring.style.height = `${Math.round(place.height)}px`;
    ring.style.borderRadius = place.radius;
    ring.style.clipPath = place.clip;
    return true;
  };
  // The control can move without saying so — a list scrolls, a screen is drawn
  // again — so while the keys are on the glass the ring reads its place back
  // every frame, and it stops once they leave.
  const follow = (): void => {
    frame = draw() ? requestAnimationFrame(follow) : 0;
  };
  const start = (): void => {
    if (!frame) follow();
  };
  root.addEventListener("focusin", start);
  start();
  return () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    root.removeEventListener("focusin", start);
    ring.remove();
  };
}
