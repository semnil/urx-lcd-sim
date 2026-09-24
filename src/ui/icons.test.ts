import { describe, expect, it } from "vitest";
import { declarations, px, readStyle } from "../style/css-read";
import { Icons } from "./icons";


/** Every endpoint in a path: the target of an M, an L or an elliptical arc. */
function endpoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  const pattern = /[ML]\s*(-?[\d.]+) (-?[\d.]+)|A[\d. ]+[01] [01] [01] (-?[\d.]+) (-?[\d.]+)/g;
  for (const m of d.matchAll(pattern)) {
    const x = m[1] ?? m[3];
    const y = m[2] ?? m[4];
    if (x !== undefined && y !== undefined) out.push([Number(x), Number(y)]);
  }
  return out;
}

function pathData(icon: SVGSVGElement): string[] {
  return [...icon.querySelectorAll("path")].map((p) => p.getAttribute("d") ?? "");
}



describe("the copy mark", () => {
  it("fills whole pixels at its ends and corners", () => {
    expect(Icons.copy().getAttribute("shape-rendering")).toBe("crispEdges");
  });

  it("draws RECORDER's softened mark a pixel at a time, in shares of the mark's colour (p079-2)", () => {
    const icon = Icons.copySoft();
    expect(icon.getAttribute("shape-rendering")).toBe("crispEdges");
    expect(icon.querySelectorAll("path")).toHaveLength(0);
    const share = (x: number, y: number): number => Number(icon.querySelector(`rect[x="${x}"][y="${y}"]`)?.getAttribute("fill-opacity") ?? 0);
    // The front square's top edge, its brightest corner, the back square's corner, and the hollow middle.
    expect([share(3, 1), share(8, 1), share(1, 8), share(5, 4), share(0, 0)]).toEqual([0.87, 1, 1, 0, 0]);
    // The top right pixel stands on the source button's corner cut, which dims it with the button.
    expect(share(9, 0)).toBe(0.04);
    expect(icon.querySelectorAll("rect")).toHaveLength(76);
  });
});

describe("the card-eject mark", () => {
  const icon = Icons.eject();

  it("is a keyed card outline, not a plain rectangle", () => {
    expect(icon.getAttribute("viewBox")).toBe("0 0 16 20");
    const card = icon.querySelector("path");
    const pts = endpoints(card?.getAttribute("d") ?? "");
    // Five corners: a rectangle has four, and the fifth is the cut that keys
    // the card to its slot.
    expect(pts).toHaveLength(5);
    const [x0, y0] = pts[0] ?? [0, 0];
    const [, y4] = pts[4] ?? [0, 0];
    expect(x0, "the cut starts along the top edge").toBeGreaterThan(1);
    expect(y4, "and ends down the left one").toBeGreaterThan(y0);
    expect(card?.getAttribute("fill")).toBe("none");
  });

  it("carries the eject mark: a stepped triangle over a bar", () => {
    const [, mark] = [...icon.querySelectorAll("path")];
    const bar = icon.querySelector("rect");
    // Rows of 1, 3, 5, 5 and 7 pixels, from y6 down to y10.
    expect(mark?.getAttribute("d")).toBe("M8 6H9V7H10V8H11V10H12V11H5V10H6V8H7V7H8Z");
    expect(mark?.getAttribute("fill")).toBe("currentColor");
    expect(bar, "the bar under it").not.toBeNull();
    // The bar sits below the triangle rather than through it.
    expect(Number(bar?.getAttribute("y"))).toBeGreaterThanOrEqual(11);
  });
});

describe("the dialog's warning mark", () => {
  const mark = Icons.caution();
  const [face, edge] = [...mark.querySelectorAll("polygon")];
  const bars = [...mark.querySelectorAll("rect")];

  it("is a triangle inside a triangle, carrying an exclamation mark in the frame's colour", () => {
    expect(mark.getAttribute("viewBox")).toBe("0 0 44 44");
    expect(mark.getAttribute("class")).toBe("icon-caution");
    expect(face?.getAttribute("fill")).toBe("var(--dialog-mark-face)");
    expect([edge?.getAttribute("fill"), edge?.getAttribute("stroke")]).toEqual(["none", "currentColor"]);
    // The stem over the dot, both on the triangle's middle.
    expect(bars).toHaveLength(2);
    const [stem, dot] = bars;
    expect(Number(stem?.getAttribute("y")) + Number(stem?.getAttribute("height"))).toBeLessThan(Number(dot?.getAttribute("y")));
    for (const b of bars) expect(Number(b.getAttribute("x")) + Number(b.getAttribute("width")) / 2).toBe(22);
  });
});

describe("the dialog's information mark", () => {
  const mark = Icons.info();
  const circles = [...mark.querySelectorAll("circle")];
  const bars = [...mark.querySelectorAll("rect")];

  it("is a ring inside a disc, both centred on the mark", () => {
    expect(mark.getAttribute("viewBox")).toBe("0 0 44 44");
    expect(circles).toHaveLength(2);
    for (const c of circles) {
      expect([c.getAttribute("cx"), c.getAttribute("cy")]).toEqual(["22", "22"]);
    }
    const [disc, ring] = circles;
    // The disc fills the mark; the ring stands inside its edge and is stroked,
    // so a filled ring would swallow the "i".
    expect(disc?.getAttribute("r")).toBe("22");
    expect(disc?.getAttribute("fill")).toBe("var(--dialog-mark-face)");
    expect(ring?.getAttribute("r")).toBe("18.5");
    expect(ring?.getAttribute("fill")).toBe("none");
    expect(ring?.getAttribute("stroke-width")).toBe("3");
    expect(Number(ring?.getAttribute("r")) + Number(ring?.getAttribute("stroke-width")) / 2).toBeLessThan(22);
  });

  it("carries an i: a dot over a stem, of one width", () => {
    expect(bars).toHaveLength(2);
    expect(bars.map((b) => b.getAttribute("width"))).toEqual(["3", "3"]);
    const [dot, stem] = bars;
    expect(Number(dot?.getAttribute("height"))).toBe(3);
    expect(Number(stem?.getAttribute("height"))).toBe(12);
    // The dot stands clear above the stem rather than touching it.
    expect(Number(dot?.getAttribute("y")) + 3).toBeLessThan(Number(stem?.getAttribute("y")));
    for (const b of bars) expect(b.getAttribute("fill")).toBe("currentColor");
  });
});

describe("the knob on the USER DEFINED KNOBS toggle", () => {
  // A disc centred in the toggle's glyph box, with a notch cut down from just
  // under its top.
  const icon = Icons.knob();
  const [d = ""] = pathData(icon);
  const box = declarations(readStyle("lcd.css"), ".udk-toggle svg");

  it("draws one view-box unit to a pixel of the toggle's glyph box", () => {
    const [, , w, h] = (icon.getAttribute("viewBox") ?? "").split(" ").map(Number);
    expect([w, h]).toEqual([px(box["width"]), px(box["height"])]);
  });

  it("is a disc 20 across, centred in the box", () => {
    const radii = [...d.matchAll(/A(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(radii).toEqual([[10, 10], [10, 10]]);
    const [top, bottom] = endpoints(d);
    expect(top).toEqual([14, 4]);
    expect(bottom).toEqual([14, 24]);
  });

  it("cuts a notch 2 wide and 6 long, 2 under the top", () => {
    const notch = /M(-?[\d.]+) (-?[\d.]+)H(-?[\d.]+)V(-?[\d.]+)H(-?[\d.]+)Z/.exec(d);
    const [x0 = NaN, y0 = NaN, x1 = NaN, y1 = NaN] = (notch ?? []).slice(1, 5).map(Number);
    expect([x1 - x0, y1 - y0]).toEqual([2, 6]);
    expect((x0 + x1) / 2).toBe(14);
    expect(y0).toBe(6);
  });
});

describe("the SETUP gear icon", () => {
  // Every pixel the glyph draws, keyed "x,y", with the coverage it is drawn at.
  const pixels = new Map<string, number>();
  const layers = [...Icons.setup().querySelectorAll("path")];
  for (const p of layers) {
    for (const m of (p.getAttribute("d") ?? "").matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+Z/g)) {
      const [x, y, w] = [Number(m[1]), Number(m[2]), Number(m[3])];
      for (let i = 0; i < w; i++) pixels.set(`${x + i},${y}`, Number(p.getAttribute("fill-opacity")));
    }
  }
  const at = (x: number, y: number): number => pixels.get(`${x},${y}`) ?? 0;

  it("draws whole pixels at four coverages", () => {
    expect(layers.map((p) => Number(p.getAttribute("fill-opacity")))).toEqual([0.25, 0.5, 0.75, 1]);
  });

  it("spans the guide's 22 columns and 22 rows, the full pixels from (4,2) to (23,23)", () => {
    const full = [...pixels].filter(([, c]) => c === 1).map(([k]) => k.split(",").map(Number) as [number, number]);
    const xs = full.map(([x]) => x);
    const ys = full.map(([, y]) => y);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([4, 23, 2, 23]);
    const any = [...pixels.keys()].map((k) => k.split(",").map(Number) as [number, number]);
    expect([Math.min(...any.map(([x]) => x)), Math.max(...any.map(([x]) => x))]).toEqual([3, 24]);
  });

  it("flattens the top tooth to six full pixels over an open hub", () => {
    expect([10, 11, 12, 13, 14, 15, 16, 17].map((x) => at(x, 2))).toEqual([0.5, 1, 1, 1, 1, 1, 1, 0.5]);
    expect(at(13, 12), "the hub's middle").toBe(0);
  });
});

describe("the side-rail tab glyphs", () => {
  // Every glyph the rail's tabs carry, by the name it is drawn under.
  const RAIL: Record<string, () => SVGSVGElement> = {
    plug: Icons.plug, usb: Icons.usb, hdmi: Icons.hdmi, fader: Icons.fader,
    gearSolid: Icons.gearSolid, sine: Icons.sine, clipboard: Icons.clipboard,
    archive: Icons.archive, edit: Icons.edit, record: Icons.record,
    play: Icons.play, save: Icons.save, refresh: Icons.refresh, gauge: Icons.gauge,
  };

  it("ends every line square, the way the unit ends them", () => {
    // A stroked path in a rail glyph ends with a butt cap.
    for (const [name, make] of Object.entries(RAIL)) {
      for (const p of make().querySelectorAll("path")) {
        if (p.getAttribute("stroke") !== "currentColor") continue;
        expect(p.getAttribute("stroke-linecap"), `${name} ends its line`).toBe("butt");
      }
    }
  });

  it("gives the Setting gear six deep-cut teeth, one of them straight up", () => {
    // The outline alternates between a tip radius and a root radius under 0.8 of
    // it: six teeth, one every 60 degrees, one of them straight up.
    const [gearOutline, hubHole] = (pathData(Icons.gearSolid())[0] ?? "").split(/(?= M)/);
    const at = (p: [number, number]): { r: number; a: number } => ({
      r: Math.round(Math.hypot(p[0] - 10, p[1] - 10) * 10) / 10,
      a: Math.round(((Math.atan2(p[0] - 10, 10 - p[1]) * 180) / Math.PI + 360) % 360),
    });
    const pts = endpoints(gearOutline ?? "").map(at);
    const radii = [...new Set(pts.map((p) => p.r))].sort((a, b) => a - b);
    expect(radii, "a root radius and a tip radius").toHaveLength(2);
    const [root, tip] = radii as [number, number];
    expect(root / tip, "the cut between two teeth is deep").toBeLessThan(0.8);
    expect(pts.filter((p) => p.r === tip), "two corners to a tooth").toHaveLength(12);
    // The outline runs tooth by tooth: a tip's two corners, then the root's two.
    // Each pair's centre is where that tip or that root stands.
    const centres = (offset: number): number[] =>
      Array.from({ length: pts.length / 4 }, (_, k) => {
        const [p, q] = [pts[4 * k + offset], pts[4 * k + offset + 1]];
        const span = (((q?.a ?? 0) - (p?.a ?? 0)) + 360) % 360;
        return Math.round((p?.a ?? 0) + span / 2) % 360;
      }).sort((x, y) => x - y);
    expect(pts.filter((_, i) => i % 4 < 2).every((p) => p.r === tip), "tips first in each tooth").toBe(true);
    expect(centres(0)).toEqual([0, 60, 120, 180, 240, 300]);
    expect(centres(2)).toEqual([30, 90, 150, 210, 270, 330]);
    // The hole is centred on the gear and stands clear of the roots.
    const hub = endpoints(hubHole ?? "").map(at);
    expect([...new Set(hub.map((p) => p.r))]).toEqual([3]);
    expect(3).toBeLessThan(root);
  });
});

/** The corners of an absolute path of M, L, H, V and A steps, one list per subpath. */
function corners(d: string): [number, number][][] {
  const out: [number, number][][] = [];
  let [x, y] = [0, 0];
  for (const m of d.matchAll(/([MLHVAZ])([^MLHVAZ]*)/g)) {
    const cmd = m[1];
    const n = (m[2] ?? "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (cmd === "M") out.push([]);
    const pts = out.at(-1);
    if (!pts) continue;
    if (cmd === "M" || cmd === "L") {
      for (let i = 0; i + 1 < n.length; i += 2) {
        [x, y] = [n[i] ?? x, n[i + 1] ?? y];
        pts.push([x, y]);
      }
    } else if (cmd === "H") {
      x = n[0] ?? x;
      pts.push([x, y]);
    } else if (cmd === "V") {
      y = n[0] ?? y;
      pts.push([x, y]);
    } else if (cmd === "A") {
      [x, y] = [n[5] ?? x, n[6] ?? y];
      pts.push([x, y]);
    }
  }
  return out;
}

describe("the card browser's marks", () => {
  const css = readStyle("lcd.css");
  const box = (...selectors: string[]): number[] => {
    const d: Record<string, string> = Object.assign({}, ...selectors.map((s) => declarations(css, s)));
    return [px(d["width"]), px(d["height"])];
  };
  const size = (icon: SVGSVGElement): number[] => (icon.getAttribute("viewBox") ?? "").split(" ").slice(2).map(Number);
  const span = (pts: [number, number][], axis: 0 | 1): [number, number] => [
    Math.min(...pts.map((p) => p[axis])),
    Math.max(...pts.map((p) => p[axis])),
  ];

  it("draws each one view-box unit to a pixel of the box the stylesheet gives it", () => {
    expect(size(Icons.upFolder()), "up arrow").toEqual(box(".sd-up svg"));
    expect(size(Icons.audioFile()), "audio file").toEqual(box(".sd-icon .icon-audio"));
    expect(size(Icons.speaker()), "speaker").toEqual(box(".sd-icon .icon-speaker"));
    expect(size(Icons.toPlaying()), "to the file playing").toEqual(box(".sd-actions .sd-locate svg"));
    expect(size(Icons.stop()), "stop").toEqual(box(".sd-actions .rec-stop svg"));
    expect(size(Icons.pause()), "pause").toEqual(box(".sd-actions .rec-pause svg"));
    expect(size(Icons.trash()), "delete").toEqual(box(".sd-action .icon-trash"));
    expect(size(Icons.rename()), "rename").toEqual(box(".sd-action svg", ".sd-action .icon-rename"));
    expect(size(Icons.file()), "settings file").toEqual(box(".sd-icon .icon-file"));
    expect(size(Icons.newFolder()), "new folder").toEqual(box(".sd-action svg", ".sd-action .icon-new-folder"));
    expect(size(Icons.transportPlay()), "play").toEqual(box(".rec-transport .icon-transport-play"));
    expect(size(Icons.factory()), "factory preset").toEqual(box(".scene-lock svg"));
    expect(size(Icons.recalled()), "last recalled scene").toEqual(box(".scene-no .icon-recalled"));
  });

  it("marks a settings file with two lines of one length inside the outline the audio mark uses", () => {
    const [page = "", lines = ""] = pathData(Icons.file());
    expect(page, "the same folded page").toBe(pathData(Icons.audioFile())[0]);
    const hole = corners(page)[1] ?? [];
    const bars = corners(lines);
    expect(bars, "two lines").toHaveLength(2);
    const widths = bars.map((bar) => span(bar, 0)[1] - span(bar, 0)[0]);
    expect(widths[1], "of one length").toBe(widths[0]);
    for (const [x, y] of bars.flat()) {
      expect(x).toBeGreaterThan(span(hole, 0)[0]);
      expect(x).toBeLessThan(span(hole, 0)[1]);
      expect(y).toBeGreaterThan(span(hole, 1)[0]);
      expect(y).toBeLessThan(span(hole, 1)[1]);
    }
  });

  it("makes a new folder with a plus of two equal arms inside the folder's outline", () => {
    const [folder = "", plus = ""] = pathData(Icons.newFolder());
    const [, hole = []] = corners(folder);
    const cross = corners(plus)[0] ?? [];
    expect(cross, "a plus has twelve corners").toHaveLength(12);
    const [x0, x1] = span(cross, 0);
    const [y0, y1] = span(cross, 1);
    expect(x1 - x0, "the arms are as long across as down").toBe(y1 - y0);
    expect(x0).toBeGreaterThan(span(hole, 0)[0]);
    expect(x1).toBeLessThan(span(hole, 0)[1]);
    expect(y0).toBeGreaterThan(span(hole, 1)[0]);
    expect(y1).toBeLessThan(span(hole, 1)[1]);
  });

  it("plays with a triangle pointing right, as tall as the pause beside it", () => {
    const mark = corners(pathData(Icons.transportPlay())[0] ?? "")[0] ?? [];
    expect(mark).toHaveLength(3);
    const [top, bottom] = span(mark, 1);
    const tip = [...mark].sort((p, q) => q[0] - p[0])[0] ?? [0, 0];
    expect(tip[1], "the tip level with the middle").toBe((top + bottom) / 2);
    expect(bottom - top, "as tall as the pause").toBe(size(Icons.pause())[1]);
  });

  it("marks the last recalled scene with a triangle pointing right", () => {
    const mark = corners(pathData(Icons.recalled())[0] ?? "")[0] ?? [];
    expect(mark).toHaveLength(3);
    const [top, bottom] = span(mark, 1);
    const tip = [...mark].sort((p, q) => q[0] - p[0])[0] ?? [0, 0];
    expect(tip[1], "the tip level with the middle").toBeCloseTo((top + bottom) / 2, 5);
  });

  it("locks a factory preset with a works under a two-tooth sawtooth roof, its chimney past the teeth, and three windows inside its walls", () => {
    const [works = [], hole = [], ...windows] = corners(pathData(Icons.factory())[0] ?? "");
    const [w = 0] = size(Icons.factory());
    expect(windows, "three windows").toHaveLength(3);
    const sizes = windows.map((win) => [span(win, 0)[1] - span(win, 0)[0], span(win, 1)[1] - span(win, 1)[0]]);
    for (const s of sizes) expect(s, "of one size").toEqual(sizes[0]);
    for (const [x, y] of windows.flat()) {
      expect(x).toBeGreaterThan(span(hole, 0)[0]);
      expect(x).toBeLessThan(span(hole, 0)[1]);
      expect(y).toBeLessThan(span(hole, 1)[1]);
    }
    // The chimney reaches the top of the box, right of both teeth.
    const [top] = span(works, 1);
    const chimney = works.filter(([, y]) => y === top);
    expect(top).toBe(0);
    const tipHeight = Math.min(...works.map(([, y]) => y).filter((y) => y > top));
    const tips = works.filter(([, y]) => y === tipHeight);
    expect(tips, "two teeth").toHaveLength(2);
    expect(Math.min(...chimney.map(([x]) => x)), "right of the teeth").toBeGreaterThan(Math.max(...tips.map(([x]) => x)));
    expect(span(works, 0), "the walls span the box").toEqual([0, w]);
  });

  it("pauses with two bars of one width, as far apart as each is wide", () => {
    const bars = pathData(Icons.pause()).map((d) => corners(d)[0] ?? []);
    expect(bars).toHaveLength(2);
    const [[a0, a1], [b0, b1]] = bars.map((p) => span(p, 0)) as [[number, number], [number, number]];
    expect(b1 - b0, "one width").toBe(a1 - a0);
    expect(b0 - a1, "a bar's width apart").toBe(a1 - a0);
    for (const p of bars) expect(span(p, 1), "each the full height").toEqual([0, size(Icons.pause())[1]]);
  });

  it("brings the cursor back with three lines of a list, the last one short, and a play mark beside it pointing right", () => {
    const [l1 = [], l2 = [], l3 = [], mark = []] = pathData(Icons.toPlaying()).map((d) => corners(d)[0] ?? []);
    const width = (pts: [number, number][]): number => span(pts, 0)[1] - span(pts, 0)[0];
    expect(width(l2), "two full lines").toBe(width(l1));
    expect(width(l3), "and a short one").toBeLessThan(width(l1));
    expect(mark).toHaveLength(3);
    const tip = [...mark].sort((p, q) => q[0] - p[0])[0] ?? [0, 0];
    const [top, bottom] = span(mark, 1);
    expect(tip[1], "the tip level with the middle").toBe((top + bottom) / 2);
    expect(span(mark, 0)[0], "beside the lines").toBeGreaterThan(span(l3, 0)[1]);
  });

  it("deletes with a lid across the mark, a handle centred on it, and two slots inside the body", () => {
    const [handle = [], lid = [], body = [], ...slots] = pathData(Icons.trash()).map((d) => corners(d));
    const [w = 0] = size(Icons.trash());
    expect(span(lid[0] ?? [], 0), "the lid").toEqual([0, w]);
    const [h0, h1] = span(handle[0] ?? [], 0);
    expect((h0 + h1) / 2, "the handle").toBe(w / 2);
    const hole = body[1] ?? [];
    expect(slots, "two slots").toHaveLength(2);
    for (const slot of slots) {
      const [x0, x1] = span(slot[0] ?? [], 0);
      const [y0, y1] = span(slot[0] ?? [], 1);
      expect(x0).toBeGreaterThan(span(hole, 0)[0]);
      expect(x1).toBeLessThan(span(hole, 0)[1]);
      expect(y0).toBeGreaterThan(span(hole, 1)[0]);
      expect(y1).toBeLessThan(span(hole, 1)[1]);
    }
  });

  it("renames with a pencil laid at 45 degrees across the box's open corner, hollow down its middle", () => {
    const [box = [], pencil = []] = pathData(Icons.rename()).map((d) => corners(d));
    const [outline = [], hollow = []] = pencil;
    const sum = (p: [number, number] | undefined): number => (p?.[0] ?? 0) + (p?.[1] ?? 0);
    // Each long side keeps x + y constant along it: a 45-degree line.
    expect(sum(outline[1]), "the upper side").toBeCloseTo(sum(outline[0]), 5);
    expect(sum(outline[3]), "the lower side").toBeCloseTo(sum(outline[2]), 5);
    expect(sum(hollow[1])).toBeCloseTo(sum(hollow[0]), 5);
    expect(sum(hollow[3])).toBeCloseTo(sum(hollow[2]), 5);
    expect((sum(hollow[0]) + sum(hollow[2])) / 2, "the hollow down the middle").toBeCloseTo((sum(outline[0]) + sum(outline[2])) / 2, 0);
    // The box's top and right sides stop short of the pencil, cut parallel to it.
    const edge = box[0] ?? [];
    expect(sum(edge[2]), "the top's cut").toBeCloseTo(sum(edge[1]), 5);
    expect(sum(edge[7]), "the right side's cut").toBeCloseTo(sum(edge[6]), 5);
    expect(sum(edge[1]), "the top stops before the pencil").toBeLessThan(sum(outline[0]));
    expect(sum(edge[6]), "the right side starts after it").toBeGreaterThan(sum(outline[2]));
  });

  it("marks a playable file with a note inside the page's folded outline", () => {
    const [page = [], ...note] = pathData(Icons.audioFile()).map((d) => corners(d));
    expect(page, "the outline and the hole it is cut round").toHaveLength(2);
    const hole = page[1] ?? [];
    expect(note, "a stem with its flag, and a head").toHaveLength(2);
    for (const [x, y] of note.flat(2)) {
      expect(x).toBeGreaterThan(span(hole, 0)[0]);
      expect(x).toBeLessThan(span(hole, 0)[1]);
      expect(y).toBeGreaterThan(span(hole, 1)[0]);
      expect(y).toBeLessThan(span(hole, 1)[1]);
    }
  });

  it("marks the file playing with a speaker and two arcs of sound clear to its right, the outer one the taller", () => {
    const [cone = [], inner = [], outer = []] = pathData(Icons.speaker()).map((d) => corners(d)[0] ?? []);
    const right = span(cone, 0)[1];
    for (const arc of [inner, outer]) expect(span(arc, 0)[0], "clear of the cone").toBeGreaterThan(right);
    expect(span(outer, 1)[0], "the outer arc starts higher").toBeLessThan(span(inner, 1)[0]);
    expect(span(outer, 1)[1], "and ends lower").toBeGreaterThan(span(inner, 1)[1]);
  });

  it("climbs out of a folder with an arrow whose foot runs along the bottom to the right edge", () => {
    const icon = Icons.upFolder();
    const [w = 0, h = 0] = size(icon);
    const [head = "", shaft = ""] = pathData(icon);
    const foot = corners(shaft)[0] ?? [];
    expect([span(foot, 0)[1], span(foot, 1)[1]], "the foot's far corner").toEqual([w, h]);
    const [left = [0, 0], apex = [0, 0], right = [0, 0]] = corners(head)[0] ?? [];
    const [shaftLeft, shaftRight] = [foot[0]?.[0] ?? 0, foot[1]?.[0] ?? 0];
    expect(apex[0], "the head over the shaft").toBeGreaterThan(shaftLeft);
    expect(apex[0]).toBeLessThan(shaftRight);
    expect(apex[0] - left[0], "each arm at 45 degrees").toBeCloseTo(left[1] - apex[1], 5);
    expect(right[0] - apex[0]).toBeCloseTo(right[1] - apex[1], 5);
  });
});

describe("the toolbar's HOME and headphone glyphs", () => {
  it("stands HOME's door lintel and eaves on whole rows", () => {
    const [d = ""] = pathData(Icons.home());
    expect(d, "the lintel on a whole row").toContain("V15H15");
    expect(d, "the eaves a row above the half").toContain("L4 9.5");
  });

  it("draws the headphones and the SD card pixel by pixel, the cups open under a two-row top", () => {
    for (const icon of [Icons.monitor(), Icons.storage()]) {
      expect(icon.getAttribute("shape-rendering")).toBe("crispEdges");
      expect([...icon.querySelectorAll("path")].map((p) => p.getAttribute("fill-opacity"))).toContain("1.0");
    }
    const full = Icons.monitor().querySelector('path[fill-opacity="1.0"]')?.getAttribute("d") ?? "";
    expect(full, "each cup's top on two rows").toContain("M5 14h7v1h-7Z");
    expect(full).toContain("M5 15h7v1h-7Z");
    expect(full, "the cup open under its top").toContain("M5 16h2v1h-2Z");
    const card = Icons.storage().querySelector('path[fill-opacity="1.0"]')?.getAttribute("d") ?? "";
    expect(card, "the label panel's top edge").toContain("M9 16h10v1h-10Z");
  });
});

describe("the channel screens' glyphs", () => {
  it("runs the channel step chevrons to the edges of their box", () => {
    expect(pathData(Icons.chevronLeft())).toEqual(["M6.5 0 1 6 6.5 12"]);
    expect(pathData(Icons.chevronRight())).toEqual(["M0.5 0 6 6 0.5 12"]);
  });

  it("rounds SEND TO's lead into its turn", () => {
    expect(pathData(Icons.sendTo())[0]).toBe("M1.2 11V8.4A3 3 0 0 1 4.2 5.4H10");
  });

  it("draws a bell as a lens on the flat line, 30x20", () => {
    const bell = Icons.eqShape("Bell");
    expect(bell.getAttribute("viewBox")).toBe("0 0 30 20");
    expect(pathData(bell)).toEqual(["M0 10H12", "M18 10H30", "M14.75 1L12 6.5V13.5L14.75 19L17.5 13.5V6.5Z"]);
    expect(pathData(Icons.eqShape("L.Shelf")), "a shelf's two levels meet past the middle").toEqual(["M0 3H11L18 10H30", "M0 17H11L18 10"]);
    expect(pathData(Icons.eqShape("HPF")), "a pass filter climbs over the left four tenths").toEqual(["M0 19L13 3H30"]);
  });
});

describe("the note values", () => {
  it("draws each on seven rows of whole pixels, and leaves a value written in words to the words", () => {
    const quarter = Icons.note("1/4");
    expect(quarter?.getAttribute("viewBox"), "a stem over a head, three pixels wide").toBe("0 0 3 7");
    expect(quarter?.getAttribute("shape-rendering")).toBe("crispEdges");
    // Four pixels of stem, and the head's seven over its last three rows.
    expect((quarter?.querySelector("path")?.getAttribute("d")?.match(/M/g) ?? []).length).toBe(11);
    for (const name of ["1/32T", "1/16T", "1/16", "1/8T", "1/16.", "1/8", "1/4T", "1/8.", "1/4", "1/4.", "1/2", "1/2.", "whole", "whole x2"]) {
      expect(Icons.note(name)?.getAttribute("viewBox")?.endsWith(" 7"), name).toBe(true);
    }
    expect(Icons.note("---")).toBeNull();
  });

  it("takes two screen pixels a glyph pixel, and stands in the middle of its option in the Note list", () => {
    const css = readStyle("lcd.css");
    expect(px(declarations(css, ".icon-note")["height"]), "seven rows at two pixels each").toBe(14);
    const option = declarations(css, ".btn.dropdown-option.efx-note-option");
    expect([option["display"], option["place-items"]]).toEqual(["grid", "center"]);
    // Each option the size of the ducker's key list's.
    const ducker = declarations(css, ".ducker-source-list .dropdown-option");
    expect([option["min-width"], option["min-height"]]).toEqual([ducker["min-width"], ducker["min-height"]]);
  });
});
