import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { attachFocusRing, drawnCorners } from "./focus-ring";

// The glass is 480 wide on the page here, so a length on it is a length in its own pixels.
const GLASS = { x: 0, y: 0, w: 480, h: 272 };

/** A box the element reports, the way the browser would. */
function stub(node: Element, box: { x: number; y: number; w: number; h: number }): void {
  const rect = { left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h, width: box.w, height: box.h, x: box.x, y: box.y };
  node.getBoundingClientRect = () => ({ ...rect, toJSON: () => rect }) as DOMRect;
  node.getClientRects = () => [rect] as unknown as DOMRectList;
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));

describe("the ring marking where the keys are", () => {
  const cleanups: (() => void)[] = [];
  // jsdom follows how the focus arrived, which `:focus-visible` reads, only from the
  // first selector it matches in the document on: match one before any control takes the focus.
  beforeAll(() => {
    document.body.matches(":focus-visible");
  });
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = "";
  });

  function glass(): HTMLElement {
    const root = document.createElement("div");
    stub(root, GLASS);
    Object.defineProperty(root, "offsetWidth", { value: GLASS.w, configurable: true });
    document.body.appendChild(root);
    return root;
  }

  const ringOf = (root: HTMLElement): HTMLElement => root.querySelector<HTMLElement>(".focus-ring") as HTMLElement;
  const place = (ring: HTMLElement): string[] => [ring.style.left, ring.style.top, ring.style.width, ring.style.height];

  it("stands the ring off the control, taking the shape of its corners", async () => {
    const root = glass();
    const button = document.createElement("button");
    // jsdom reads back only the longhands, as the browser resolves them.
    for (const corner of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"] as const) {
      button.style[corner] = "4px";
    }
    root.appendChild(button);
    stub(button, { x: 100, y: 60, w: 80, h: 40 });
    cleanups.push(attachFocusRing(root));
    button.focus();
    await frame();
    const ring = ringOf(root);
    expect([ring.hidden, ...place(ring), ring.style.borderRadius, ring.style.clipPath]).toEqual([
      false,
      "98px",
      "58px",
      "84px",
      "44px",
      "6px 6px 6px 6px",
      "inset(0px 0px 0px 0px)",
    ]);
  });

  it("stays where the control stands while the control is held down", async () => {
    const root = glass();
    const button = document.createElement("button");
    button.style.setProperty("--ring-corners", "0 0 0 0");
    root.appendChild(button);
    stub(button, { x: 100, y: 63, w: 80, h: 40 });
    button.style.setProperty("--press", "3px");
    cleanups.push(attachFocusRing(root));
    button.focus();
    await frame();
    expect(place(ringOf(root))).toEqual(["98px", "58px", "84px", "44px"]);
  });

  it("draws a round ring for a handle in a graph", async () => {
    const root = glass();
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "g");
    handle.tabIndex = 0;
    root.appendChild(handle);
    stub(handle, { x: 200, y: 100, w: 40, h: 40 });
    cleanups.push(attachFocusRing(root));
    handle.focus();
    await frame();
    expect(ringOf(root).style.borderRadius).toBe("22px");
  });

  it("cuts the ring to the list the control scrolls inside of, and leaves a box that only holds it alone", async () => {
    const root = glass();
    // jsdom computes the longhands only from themselves, not from the `overflow` shorthand.
    const list = document.createElement("div");
    list.style.overflowX = "hidden";
    list.style.overflowY = "hidden";
    Object.defineProperty(list, "scrollHeight", { value: 400, configurable: true });
    Object.defineProperty(list, "clientHeight", { value: 100, configurable: true });
    stub(list, { x: 90, y: 60, w: 300, h: 100 });
    const tight = document.createElement("div");
    tight.style.overflowX = "hidden";
    tight.style.overflowY = "hidden";
    stub(tight, { x: 100, y: 130, w: 80, h: 40 });
    const row = document.createElement("button");
    row.style.setProperty("--ring-corners", "0 0 0 0");
    stub(row, { x: 100, y: 130, w: 80, h: 40 });
    tight.appendChild(row);
    list.appendChild(tight);
    root.appendChild(list);
    cleanups.push(attachFocusRing(root));
    row.focus();
    await frame();
    // The row runs 10px past the foot of the list: the ring is cut there, not at the box around the row.
    expect(ringOf(root).style.clipPath).toBe("inset(0px 0px 12px 0px)");
  });

  it("draws nothing where the browser says the focus is not one the keys put there", async () => {
    const root = glass();
    const button = document.createElement("button");
    button.style.setProperty("--ring-corners", "0 0 0 0");
    root.appendChild(button);
    stub(button, { x: 100, y: 60, w: 80, h: 40 });
    // A control touched with a pointer holds the focus without showing it.
    const matches = button.matches.bind(button);
    button.matches = (sel: string) => (sel === ":focus-visible" ? false : matches(sel));
    cleanups.push(attachFocusRing(root));
    button.focus();
    await frame();
    const quiet = ringOf(root).hidden;
    button.matches = matches;
    await frame();
    expect([quiet, ringOf(root).hidden]).toEqual([true, false]);
  });

  it("takes the ring away when the keys leave the glass", async () => {
    const root = glass();
    const button = document.createElement("button");
    button.style.setProperty("--ring-corners", "0 0 0 0");
    root.appendChild(button);
    stub(button, { x: 100, y: 60, w: 80, h: 40 });
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    cleanups.push(attachFocusRing(root));
    button.focus();
    await frame();
    const shown = ringOf(root).hidden;
    outside.focus();
    await frame();
    expect([shown, ringOf(root).hidden]).toEqual([false, true]);
  });
  it("takes the corners a control names when it draws them somewhere else", async () => {
    const root = glass();
    const tab = document.createElement("button");
    tab.style.setProperty("--ring-corners", "3px 0 0 3px");
    root.appendChild(tab);
    stub(tab, { x: 100, y: 60, w: 58, h: 52 });
    cleanups.push(attachFocusRing(root));
    tab.focus();
    await frame();
    expect(ringOf(root).style.borderRadius, "rounded on the side the tab rounds, square where it meets the edge").toBe("5px 0px 0px 5px");
  });
});

describe("the corners a control draws for itself", () => {
  // The `background-position` the page computes for three of the unit's shapes:
  // a switch with a band under it, a value box, and the card's path field, which
  // rounds its right corners and marks each left one with a single shade.
  const BANDED = "0px 0px, 1px 0px, 2px 0px, 3px 0px, 0px 1px, 1px 1px, 0px 2px, 0px 3px, 100% 0px, calc(100% - 1px) 0px, calc(100% - 2px) 0px, calc(100% - 3px) 0px, 100% 1px, calc(100% - 1px) 1px, 100% 2px, 100% 3px, 0px 100%, 1px 100%, 2px 100%, 3px 100%, 0px calc(100% - 1px), 1px calc(100% - 1px), 0px calc(100% - 2px), 0px calc(100% - 3px), 1px calc(100% - 3px), 2px calc(100% - 3px), 3px calc(100% - 3px), 0px calc(100% - 4px), 1px calc(100% - 4px), 0px calc(100% - 5px), 0px calc(100% - 6px), 100% 100%, calc(100% - 1px) 100%, calc(100% - 2px) 100%, calc(100% - 3px) 100%, 100% calc(100% - 1px), calc(100% - 1px) calc(100% - 1px), 100% calc(100% - 2px), 100% calc(100% - 3px), calc(100% - 1px) calc(100% - 3px), calc(100% - 2px) calc(100% - 3px), calc(100% - 3px) calc(100% - 3px), 100% calc(100% - 4px), calc(100% - 1px) calc(100% - 4px), 100% calc(100% - 5px), 100% calc(100% - 6px)";
  const VALUE_BOX = "0px 0px, 2px 0px, 0px 1px, 1px 1px, 0px 2px, 100% 0px, calc(100% - 2px) 0px, 100% 1px, calc(100% - 1px) 1px, 100% 2px, 0px 100%, 2px 100%, 0px calc(100% - 1px), 1px calc(100% - 1px), 0px calc(100% - 2px), 100% 100%, calc(100% - 2px) 100%, 100% calc(100% - 1px), calc(100% - 1px) calc(100% - 1px), 100% calc(100% - 2px)";
  const PATH_FIELD = "0px 0px, 0px 100%, 100% 0px, calc(100% - 2px) 0px, 100% 1px, calc(100% - 1px) 1px, 100% 2px, 100% 100%, calc(100% - 2px) 100%, 100% calc(100% - 1px), calc(100% - 1px) calc(100% - 1px), 100% calc(100% - 2px)";

  it("takes the width of the corner, leaving the rows a band adds below it out of it", () => {
    expect(drawnCorners(BANDED), "four pixels across at the head and at the foot").toEqual([4, 4, 4, 4]);
    expect(drawnCorners(VALUE_BOX)).toEqual([3, 3, 3, 3]);
  });

  it("calls a corner with one cell a shade, not a curve", () => {
    expect(drawnCorners(PATH_FIELD), "rounded on the right, square on the left").toEqual([0, 3, 3, 0]);
  });

  it("finds no corner where the control draws no map", () => {
    expect(drawnCorners("0% 0%")).toEqual([0, 0, 0, 0]);
  });

  it("leaves a drawing that is not a map of single pixels alone", () => {
    // The side tab's own corner box: four rows the width of the box, which say
    // nothing about where the tab's corners run.
    expect(drawnCorners("0px 0px, 0px 1px, 0px 2px, 0px 3px", "4px 1px, 4px 1px, 4px 1px, 4px 1px")).toEqual([0, 0, 0, 0]);
  });
});
