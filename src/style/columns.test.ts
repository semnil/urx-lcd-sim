import { describe, expect, it } from "vitest";
import { KNOB_SIZE } from "../ui/param-spec";
import { columnGap, declarations, px, readStyle, styleRules } from "./css-read";

// A value has to read under the panel it belongs to. The HOME bank, the knob
// readout strip and the head-amp column of a channel view therefore stand on one
// set of edges: the same box, the same four columns, the same gap.

const CSS = readStyle("lcd.css");
const TOKENS = readStyle("tokens.css");

/** The rule that draws the unit's switch: a block's name, and the head amp's AUTO / SAFE. */
const SWITCH =
  ".lcd :is(.badge.badge-switch, .cv-gain-buttons .btn, .cv-sendto, .btn.input-flag, .btn.follow-usb, .btn.rec-slot-src, .btn.wizard-btn, .eq-screen > .eq-band, .oneknob)";
/** The shades a switch on a block's face takes while it is unlit. */
const SWITCH_OFF = ".lcd .badge.badge-switch";

const main = declarations(CSS, ".main");
/** What the main area gives up to a screen that fills the side rail. */
const railed = declarations(CSS, ".lcd.has-side .main");
const strip = declarations(CSS, ".knob-strip");
const bank = declarations(CSS, ".home-main");
const channel = declarations(CSS, ".cv-main");
const screenWidth = px(declarations(TOKENS, ":root")["--lcd-w"]);

/** What one of the four columns comes to, in the unit's own screen pixels. */
const columnWidth = (): number =>
  (screenWidth - px(main["left"]) - px(railed["right"]) - 3 * columnGap(bank["gap"])) / 4;

describe("the four columns the screens share", () => {
  it("runs the readout strip from the screen's own left edge to the side rail", () => {
    // The bar starts where the main area starts and reaches past the main
    // area's right edge, up to the side rail.
    const rail = declarations(CSS, ".side");
    expect(px(strip["left"])).toBe(px(main["left"]));
    expect(px(strip["right"])).toBe(px(rail["right"]) + px(rail["width"]));
    expect(px(strip["right"]), "which puts it past the screen above it").toBeLessThan(px(railed["right"]));
    expect(screenWidth - px(strip["left"]) - px(strip["right"]), "420px wide").toBe(420);
  });

  it("divides it into as many parts as the bank has strips", () => {
    const parts = (strip["grid-template-columns"] ?? "").trim().split(/\s+/).length;
    const bankParts = Number(/repeat\((\d+)/.exec(bank["grid-template-columns"] ?? "")?.[1]);
    expect(parts).toBe(bankParts);
  });

  it("draws the knob bar and the USER DEFINED KNOBS bar as one shape in two colours", () => {
    // The mode override may recolour the bar and lift it over the screen; the
    // moment it sets a length the two stop being the same bar.
    const allowed = new Set(["background", "border-color", "z-index"]);
    const override = declarations(CSS, ".lcd.is-udk .knob-strip");
    expect(Object.keys(override).length, "the override exists").toBeGreaterThan(0);
    expect(Object.keys(override).filter((k) => !allowed.has(k))).toEqual([]);
    expect(Object.keys(declarations(CSS, ".lcd.is-udk .knob-cell + .knob-cell"))).toEqual(["border-left-color"]);
    expect(Object.keys(declarations(CSS, ".lcd.is-udk .knob-cell-label"))).toEqual(["background", "color"]);
  });

  it("cuts the oscillator's modes on the bank's columns and its output on a channel view's", () => {
    // The mode buttons take the width of a HOME strip, and the output panel the
    // width of a channel view's column.
    expect(px(declarations(CSS, ".osc-mode")["width"])).toBe(columnWidth());
    const width = screenWidth - px(main["left"]) - px(main["right"]) - px((channel["grid-template-columns"] ?? "").split(/\s+/)[0]);
    expect(px(declarations(CSS, ".osc-output")["width"])).toBe((width - 4 * columnGap(bank["gap"])) / 4);
  });

  it("centres each oscillator box over the division of the readout strip that turns it", () => {
    // A division's label is centred between the bar's inner edge or the divider
    // before it and the next divider. The tracks are laid inside the bar's border.
    const tracks = (strip["grid-template-columns"] ?? "").trim().split(/\s+/).map(px);
    const divider = px(declarations(CSS, ".knob-cell + .knob-cell")["border-left"]);
    const origin = px(strip["left"]) + px(strip["border"]);
    const sum = (n: number): number => tracks.slice(0, n).reduce((a, b) => a + b, 0);
    const divisions = tracks.map((_, i) => (origin + sum(i) + (i > 0 ? divider : 0) + origin + sum(i + 1)) / 2);

    // The mode's boxes take the first two divisions, Level the fourth.
    const cell = px(declarations(CSS, ".param-cell")["width"]);
    const params = declarations(CSS, ".osc-params");
    expect(params["grid-template-columns"]).toBe(`repeat(2, ${cell}px)`);
    const lefts = [0, 1].map((i) => px(main["left"]) + px(params["left"]) + i * (cell + px(params["column-gap"])));
    expect(lefts, "Width and Interval at glass x12 and x116 (p070-2)").toEqual([12, 116]);
    const output = declarations(CSS, ".osc-output");
    const boxes = [...lefts.map((l) => l + cell / 2), px(main["left"]) + px(output["left"]) + px(output["width"]) / 2];

    // A division whose width is odd leaves an even box half a pixel off its middle.
    for (const [i, division] of [0, 1, 3].entries()) {
      const offset = Math.abs((boxes[i] ?? NaN) - (divisions[division] ?? NaN));
      expect(offset, `box ${i + 1} over division ${division + 1}`).toBeLessThanOrEqual(0.5);
    }
  });

  it("stands the readout bar level with the button beside it, clear of the screen", () => {
    const strip = declarations(CSS, ".knob-strip");
    const toggle = declarations(CSS, ".udk-toggle");
    expect(px(strip["height"]), "the bar and the knob-mode button share a top edge").toBe(px(toggle["height"]));

    // The main area stops where the bar starts: the unit's screens draw right up
    // to its top edge rather than holding a margin off it.
    const clearance = px(declarations(CSS, ".lcd.has-knobs .main")["bottom"]);
    expect(clearance).toBe(px(strip["height"]));
  });

  it("lays a channel view's blocks on the columns of the controls under them", () => {
    const blocks = declarations(CSS, ".cv-blocks");
    expect(blocks["display"], "the blocks join the main grid instead of making one").toBe("contents");
    expect(blocks["grid-template-columns"], "a grid of its own is what left the two rows ragged").toBeUndefined();

    // Filled from the right: INS FX is the last block on every channel, and it
    // stands over the ON/CUE column at the edge of the screen.
    expect(declarations(CSS, ".cv-block:nth-last-child(1)")["grid-column"]).toBe("-2");
    expect(declarations(CSS, ".cv-block:nth-last-child(4)")["grid-column"]).toBe("-5");

    // Equal middles, so no block is widened by what it happens to contain.
    expect(channel["grid-template-columns"], "no column is widened by what it contains").toContain(
      "repeat(4, minmax(0, 1fr))",
    );
  });

  it("keeps the side rail only for the screens that fill it", () => {
    // A channel view's fifth column and SETUP's widest box reach past where the
    // rail would stand, so only the screens that fill the rail keep it.
    expect(px(main["right"]), "the main area reaches the far margin by default").toBe(px(main["left"]));
    expect(px(railed["right"]), "and gives up the rail only under .has-side").toBeGreaterThan(px(main["right"]));
  });

  it("separates every row of controls by the one gutter", () => {
    // The captures put an 8px gutter between controls whatever the row holds, so
    // a row with a gutter of its own is a row that will not line up with another.
    // The readout bar is not among them: it divides itself with a drawn line
    // rather than a gap, which is how the captures show it.
    const rows = [".home-main", ".mon-main", ".menu-grid", ".btn-row", ".language-row", ".bank-row"];
    const gutters = Object.fromEntries(rows.map((r) => [r, columnGap(declarations(CSS, r)["gap"])]));
    expect(gutters).toEqual(Object.fromEntries(rows.map((r) => [r, columnGap(bank["gap"])])));
    // The oscillator's mode row is not one of them: its buttons keep a narrower
    // gap of their own.
    expect(columnGap(declarations(CSS, ".osc-mode-row")["gap"])).toBe(2);
  });

  it("cuts a channel view the way the captures cut it", () => {
    expect(columnWidth(), "four 98px columns and three 8px gaps fill the 416px bank").toBe(98);

    // A channel view fills the glass with no rail beside it, so it has a cut of
    // its own: a 100px head amp and four equal columns, on the same 8px gutter.
    const [first] = (channel["grid-template-columns"] ?? "").split(/\s+/);
    expect(px(first)).toBe(100);
    expect(columnGap(channel["gap"]), "the gutter is the one every screen uses").toBe(columnGap(bank["gap"]));
    const width = screenWidth - px(main["left"]) - px(main["right"]) - px(first) - 4 * columnGap(bank["gap"]);
    expect(width / 4, "and the four that follow come to 86 each").toBe(86);
  });
});

describe("the mark that says a control opens a popup", () => {
  it("stands at the inset the unit draws it at, on each control that carries it", () => {
    // The popup mark stands in from the control's top right corner by one
    // distance across and down, set per control.
    const inset = (rule: string): [number, number] => {
      const d = declarations(CSS, rule);
      return [px(d["right"]), px(d["top"])];
    };
    expect(inset(".ch-chip-copy"), "the channel chip").toEqual([5, 5]);
    expect(inset(".input-source-btn .ch-chip-copy"), "INPUT's source button").toEqual([3, 3]);
    expect(inset(".chs-mark"), "CH SETTING's fields").toEqual([4, 4]);
    expect(inset(".insfx-effect-copy"), "the INS FX effect name").toEqual([3, 3]);
    expect(inset(".rec-slot-copy"), "a RECORDER track's source").toEqual([1, 1]);
    expect(inset(".udk-knob-copy"), "a knob assignment card").toEqual([5, 5]);
  });

  it("gives the glyph its own size in every one of them", () => {
    // The mark drifted a pixel down wherever the box was left to size itself
    // from the svg's intrinsic size instead of being given one.
    for (const host of [".ch-chip-copy", ".chs-mark", ".insfx-effect-copy", ".rec-slot-copy", ".udk-knob-copy"]) {
      const box = declarations(CSS, host);
      expect(box["display"], `${host} lays the glyph out`).toBeDefined();
      const glyph = declarations(CSS, `${host} svg`);
      expect([px(glyph["width"]), px(glyph["height"])], `${host} sizes the glyph`).toEqual([10, 10]);
    }
  });
});

describe("the way out of a sheet", () => {
  it("is the toolbar's icon band in miniature", () => {
    // The way out of a sheet takes the icon band's face, height and left and
    // bottom edges, and draws its corner over the same box as the band's. Every
    // sheet that has a way out uses this one control.
    const band = declarations(CSS, ".toolbar-icons");
    const back = declarations(CSS, ".source-back");
    expect(back["background"]).toBe(band["background"]);
    expect(px(back["height"])).toBe(px(band["height"]));
    for (const side of ["border-left", "border-bottom"]) {
      expect(back[side], `the ${side} edge`).toBe(band[side]);
    }
    // The curve is drawn in pixels where the two edges meet, over the same six
    // by six at the same corner on both.
    const [bandCorner, backCorner] = [declarations(CSS, ".toolbar-icons::before"), declarations(CSS, ".source-back::before")];
    for (const p of ["position", "left", "bottom", "width", "height"]) expect(backCorner[p], p).toBe(bandCorner[p]);
  });
});

describe("the back arrow", () => {
  it("is one glyph at one size wherever it is drawn", () => {
    // The toolbar and a sheet's corner draw the same arrow at the same size. The
    // two hosts give it different boxes, so the size comes from the glyph rather
    // than from the box.
    const sheet = declarations(CSS, ".source-back svg");
    const bar = declarations(CSS, ".icon-btn .icon-back");
    expect([px(sheet["width"]), px(sheet["height"])]).toEqual([18, 14]);
    expect([px(bar["width"]), px(bar["height"])]).toEqual([px(sheet["width"]), px(sheet["height"])]);
    // The stroke reaches a pixel past that box on every side.
    expect([sheet["overflow"], bar["overflow"]]).toEqual(["visible", "visible"]);
  });

  it("takes its 2px line on the path, which is what carries a width of its own", () => {
    // icons.ts writes stroke-width on each path as an attribute. A rule naming
    // the svg only reaches the path by inheritance and loses to that attribute,
    // which is what left the sheet's arrow drawn at 1.5px.
    for (const rule of [".source-back svg path", ".icon-btn svg path"]) {
      expect(declarations(CSS, rule)["stroke-width"], `${rule} sets the line`).toBe("2");
    }
    expect(declarations(CSS, ".source-back svg")["stroke-width"], "and the svg does not try to").toBeUndefined();
  });
});

describe("what answers a touch", () => {
  // A band laid out wider than what it draws covers its neighbours. Nothing
  // shows it — the capture is right and the control simply does nothing under a
  // finger — so the bands that do it say so, and the parts that draw take their
  // touches back. `work/hit-test.mjs` walks every screen and checks the same
  // thing against a real layout.
  const passesThrough = (band: string, parts: string) => {
    expect(declarations(CSS, band)["pointer-events"], `${band} lets a touch through`).toBe("none");
    expect(declarations(CSS, parts)["pointer-events"], `${parts} takes it back`).toBe("auto");
  };

  it("lets a touch through the side rail, which a channel view draws under", () => {
    const rail = declarations(CSS, ".side");
    // The rail is the full height of the glass whether or not it carries a tab,
    // and the channel view's last column runs under it.
    expect(px(rail["top"]) + px(rail["bottom"] ?? "0px")).toBeLessThan(px(declarations(TOKENS, ":root")["--lcd-h"]));
    expect(px(main["right"]), "the main area does not stand clear of it by default").toBeLessThan(px(rail["width"]));
    passesThrough(".side", ".side > *");
  });

  it("lets a touch through a CH SETTING field, which reaches across the fields left of it", () => {
    // Every field starts at the left edge and ends where its own box ends, so
    // the wider ones lie over the narrower.
    expect(px(declarations(CSS, ".chs-field")["left"])).toBe(0);
    expect(px(declarations(CSS, ".chs-name-field")["width"])).toBeGreaterThan(
      px(declarations(CSS, ".chs-color-field")["width"]),
    );
    passesThrough(".chs-field", ".chs-field > *");
  });

  it("lets a touch through the knob dialog's two lines, which run over its buttons", () => {
    for (const line of [".pick-dialog-title", ".pick-dialog-sub"]) {
      expect(declarations(CSS, line)["pointer-events"], `${line} lets a touch through`).toBe("none");
    }
    // They run the width of the sheet; the buttons stand in its corners.
    expect([px(declarations(CSS, ".pick-dialog-title")["left"]), px(declarations(CSS, ".pick-dialog-title")["right"])]).toEqual([0, 0]);
    expect(px(declarations(CSS, ".pick-dialog-cancel")["left"])).toBe(0);
    expect(px(declarations(CSS, ".pick-dialog-ok")["right"])).toBe(0);
  });

  it("lets a touch through the backlight", () => {
    expect(declarations(CSS, ".lcd-dim")["pointer-events"]).toBe("none");
  });
});

describe("the knob readout bar", () => {
  it("starts where the screen above it starts", () => {
    expect(px(strip["left"])).toBe(px(main["left"]));
  });

  it("gives the bar and the knob-mode button the unit's own box", () => {
    // The bar and the knob-mode button share one height; the glyph box and the
    // button's top padding set the glyph a little below the button's middle.
    const toggle = declarations(CSS, ".udk-toggle");
    expect(px(strip["height"])).toBe(39);
    expect(px(toggle["height"])).toBe(39);
    expect(px(toggle["width"])).toBe(52);
    expect(px(declarations(CSS, ".udk-toggle svg")["width"])).toBe(28);
    expect(px(toggle["padding-top"]), "which sets the glyph below the middle").toBe(3);
    expect(px(declarations(CSS, ".knob-bank")["width"]), "the page badge").toBe(26);
  });

  it("writes the label band in the ink the unit uses on it", () => {
    // Black on the band is what the bar had; the unit tints the text towards the
    // band's own colour in both modes.
    expect(px(declarations(TOKENS, ":root")["--readout-label"])).toBeNaN();
    expect(declarations(TOKENS, ":root")["--readout-label"]).toBe("#3a3d42");
    expect(declarations(TOKENS, ":root")["--accent-udk-label"]).toBe("#290c3a");
    expect(declarations(CSS, ".knob-cell-label")["color"]).toBe("var(--readout-label)");
    expect(declarations(CSS, ".lcd.is-udk .knob-cell-label")["color"]).toBe("var(--accent-udk-label)");
  });

  it("draws the page steps in the bar's own colour, large enough to read", () => {
    // The reset that makes a button take its colour from the screen is more
    // specific than one class, so the step carries two or it comes out white.
    expect(Object.keys(declarations(CSS, ".knob-bank-step")), "one class loses to that reset").toEqual([]);
    const step = declarations(CSS, ".knob-strip .knob-bank-step");
    // The mark is the face colour of the bar it steps, a shade up from the ink
    // of the band it sits in.
    expect(step["color"]).toBe(declarations(CSS, ".lcd.is-udk .knob-strip")["background"]);
    expect(step["color"]).not.toBe(declarations(CSS, ".lcd.is-udk .knob-cell-label")["color"]);
    // The chevron is a small part of its em; 28px draws it the size the unit's is.
    expect(px(step["font-size"])).toBe(28);
  });

  it("centres the page badge on the middle divider", () => {
    const divider = px(declarations(CSS, ".knob-cell + .knob-cell")["border-left"]);
    const tracks = (strip["grid-template-columns"] ?? "").trim().split(/\s+/).map(px);
    const badge = declarations(CSS, ".knob-bank");
    // The tracks are laid inside the bar's own border, so the count starts there.
    expect(px(badge["left"])).toBe(px(strip["border"]) + (tracks[0] ?? 0) + (tracks[1] ?? 0) + divider / 2);
    expect(badge["transform"], "and stands on that point rather than beside it").toBe("translate(-50%, -50%)");
  });

  it("stands each divider in the gutter between the strips above it", () => {
    // Each divider's two columns fall inside the gap after the strip above it,
    // five and six columns past the gap's first column.
    const gap = columnGap(bank["gap"]);
    const pitch = columnWidth() + gap;
    const tracks = (strip["grid-template-columns"] ?? "").trim().split(/\s+/).map(px);

    let edge = px(strip["left"]) + px(strip["border"]) + (tracks[0] ?? 0);
    for (const [i, track] of tracks.slice(1).entries()) {
      // The gutter after strip i+1, on the glass.
      const gutter = px(main["left"]) + (i + 1) * pitch - gap;
      expect([edge, edge + 1], `divider ${i + 1} lies in the gutter`).toEqual([gutter + 5, gutter + 6]);
      edge += track;
    }

    // And they add up to the bar, so nothing is left over at either end.
    const width = screenWidth - px(strip["left"]) - px(strip["right"]) - 2 * px(strip["border"]);
    expect(tracks.reduce((a, b) => a + b)).toBe(width);
  });
});

describe("the channel-bank marks on the toolbar", () => {
  it("widens the mark of the bank in view, at the unit's widths and spacing", () => {
    // The lit mark is 25px and the others 14px, 6px apart and 15 rows high, so a
    // side of three banks fills the 65px from the button's left padding.
    expect(declarations(CSS, ".bank-cell")["flex"]).toBe("0 0 14px");
    expect(declarations(CSS, ".bank-cell.is-active")["flex"]).toBe("0 0 25px");
    const cells = declarations(CSS, ".bank-cells");
    expect([px(cells["gap"]), px(cells["height"])]).toEqual([6, 15]);
    expect(25 + 14 + 14 + 2 * px(cells["gap"])).toBe(65);
    expect(declarations(CSS, ".bank-input .bank-cell")["background"], "an INPUT bank not in view").toBe("var(--accent-bank-cell)");
  });

  it("draws the down mark beside the name a row at a time", () => {
    const mark = declarations(CSS, ".bank-mark");
    expect([px(mark["width"]), px(mark["height"])]).toEqual([9, 6]);
    const rows = [...(mark["background"] ?? "").matchAll(/\) (\d+)(?:px)? (\d+)(?:px)? \/ (\d+)px (\d+)px/g)].map((m) => m.slice(1).map(Number));
    // Two full rows, then two pixels fewer on each row down to a point.
    expect(rows).toEqual([[0, 0, 9, 2], [1, 2, 7, 1], [2, 3, 5, 1], [3, 4, 3, 1], [4, 5, 1, 1]]);
    expect(declarations(TOKENS, ":root")["--drop-mark"]).toBe("#dedbde");
  });

  it("splits the row in half on a unit with two banks a side", () => {
    // A URX22's input side holds two banks. Both marks take the same half of
    // the row there, so neither reads as a wider page of its own.
    const pair = ".bank-cell:first-child:nth-last-child(2)";
    expect(declarations(CSS, pair)["flex"]).toBe("1 1 0");
    expect(declarations(CSS, `${pair} ~ .bank-cell`)["flex"]).toBe("1 1 0");
  });

  it("centres the mark on the button on a side of one bank", () => {
    // The OUTPUT side holds one bank. Its mark stands as far from the button's
    // left edge as from its right, on whole pixels.
    const button = declarations(CSS, ".bank-btn");
    const [, right = 0, , left = 0] = (button["padding"] ?? "").split(/\s+/).map(px);
    const row = declarations(CSS, ".bank-cells:has(> .bank-cell:only-child)");
    expect(row["justify-content"]).toBe("center");
    const width = px(button["width"]);
    const mark = px(declarations(CSS, ".bank-cell.is-active")["flex"]);
    const inset = left + (width - left - right - px(row["margin-right"] ?? "0") - mark) / 2;
    expect([inset, width - inset - mark]).toEqual([24, 24]);
  });
});

describe("the rows a HOME strip is cut into", () => {
  const height = (selector: string, key = "height"): number => px(declarations(CSS, selector)[key]);

  it("fills the strip with the rows the unit shows and nothing over", () => {
    // The strip's rows, the gaps between them and the padding under the last
    // add up to the height the main area gives the strip.
    const rows = [
      height(".strip-name"),
      px(declarations(CSS, ".strip-mid")["flex"]),
      height(".btn.btn-switch"),
      height(".pan-slider"),
      height(".strip-level"),
    ];
    const gaps = [".strip-mid", ".strip-buttons", ".strip-pan", ".strip-level"].map((s) =>
      height(s, "margin-top"),
    );
    const below = px((declarations(CSS, ".strip")["padding"] ?? "").trim().split(/\s+/)[2]);
    const strip = px(declarations(TOKENS, ":root")["--lcd-h"]) - px(main["top"]) - px(main["bottom"]);

    expect(rows).toEqual([36, 69, 40, 4, 36]);
    expect(gaps).toEqual([6, 7, 9, 5]);
    expect(rows.reduce((a, b) => a + b) + gaps.reduce((a, b) => a + b) + below).toBe(strip);
  });

  it("keeps an option list on the glass however long it is", () => {
    const list = declarations(CSS, ".dropdown-list");
    expect(list["max-height"], "a list longer than the screen scrolls").toContain("--lcd-h");
    expect(list["overflow-y"]).toBe("auto");
  });

  it("shades the bottom of the ON and CUE buttons in their own colour", () => {
    // The unit darkens the last 4px of the button rather than drawing a border.
    const button = declarations(CSS, ".btn.btn-switch");
    const shadow = (button["box-shadow"] ?? "").trim().split(/\s+/);
    expect(shadow[0]).toBe("inset");
    expect(px(shadow[2])).toBe(-4);

    // The label stands in the middle of the lit face, so it gives up the band.
    const pad = (button["padding"] ?? "").trim().split(/\s+/);
    expect(px(pad[2]) - px(pad[0])).toBe(-px(shadow[2]));
  });

  it("draws [ON], [CUE] and [PRE] as one 40px switch wherever they stand", () => {
    const button = declarations(CSS, ".btn.btn-switch");
    expect([px(button["width"]), px(button["height"])], "the unit's box, on every screen").toEqual([40, 40]);
    expect(px(button["border-radius"]), "its corner fits a 3px circle").toBe(3);

    // The pale face CUE carries when it is off is PRE's too, and both light the
    // same as ON, so the three are one control with one set of colours.
    const off = declarations(CSS, ".btn.btn-pre");
    expect(off["background"]).toBe("var(--accent-cue)");
    // [ON] is the same switch, so it carries the same pale face when it is off.
    expect(declarations(CSS, ".btn.btn-on")["background"]).toBe("var(--accent-cue)");
    expect(declarations(CSS, ".btn.btn-on.is-on")["background"]).toBe("var(--accent-on)");
    const lit = declarations(CSS, ".btn.btn-pre.is-on");
    expect(lit["background"]).toBe("var(--accent-on)");
    expect(declarations(CSS, ".btn-toggle.is-on")["background"], "and ON lights the same").toBe("var(--accent-on)");

    // A lit switch and a selected row are near but not the same blue.
    expect(declarations(TOKENS, ":root")["--accent-on"]).toBe("#84e3ff");
    expect(declarations(TOKENS, ":root")["--accent-selected"]).toBe("#84dfff");
    expect(declarations(CSS, ".list-row.is-selected")["background"]).toBe("var(--accent-selected)");
  });

  it("cuts the level value box the way the unit cuts it", () => {
    const value = declarations(CSS, ".strip-level-value");
    expect(value["border-radius"], "the unit's corner fits a 4px circle").toBe("var(--radius-md)");
    // The unit centres the value in the box both ways; a value laid out as plain
    // text sits above the middle, since the box is taller than its line.
    expect(value["text-align"]).toBe("center");
    expect(value["display"]).toBe("grid");
    expect(value["place-items"]).toBe("center");
    // The box is a pixel below the middle of the level row on the unit.
    expect(px(value["top"])).toBe(1);
  });

  it("gives the level box what the rotary leaves, whatever the value reads", () => {
    // The unit's box is 38 wide in every strip, with or without a sign in front
    // of the value, so the box is the leftover of the row rather than the width
    // of its text: 6px inset + 38px rotary + 10px + 38px box + 6px inset = 98.
    const value = declarations(CSS, ".strip-level-value");
    expect(value["flex"]).toBe("1 1 auto");
    expect(px(value["min-width"]), "so a longer value shrinks it back").toBe(0);

    // 6px inset + 38px rotary + 10px + 38px box + 6px inset fills the 98px strip.
    expect(px((declarations(CSS, ".strip")["padding"] ?? "").trim().split(/\s+/)[1])).toBe(6);
    expect(px(declarations(CSS, ".strip-level")["gap"])).toBe(10);
  });

  it("sets the strip's text where the unit's reads", () => {
    // The second name line, the ON / CUE labels and the level value share one size;
    // the channel's number line and the indicator badges are a step down from them.
    expect(declarations(CSS, ".strip-id")["font-size"], "the number line").toBe("12.5px");
    for (const s of [".strip-title", ".btn.btn-switch", ".strip-level-value"]) {
      expect(declarations(CSS, s)["font-size"], s).toBe("var(--fs-lg)");
    }
    expect(declarations(CSS, ".ind-row .badge")["font-size"]).toBe("12.5px");
  });

  it("cuts the indicator row into a block and the channel's meter", () => {
    // The block runs to the meter, the meter is two 4px lanes wide whether or
    // not the channel fills both, and the gutter between them is 4px.
    const inset = px((declarations(CSS, ".strip")["padding"] ?? "").trim().split(/\s+/)[1]);
    const meter = px(declarations(CSS, ".meter")["min-width"]);
    expect(columnWidth() - 2 * inset - meter - px(declarations(CSS, ".strip-mid")["gap"])).toBe(74);
  });
});

describe("the dialog box", () => {
  const box = declarations(CSS, ".dialog");
  const mark = declarations(CSS, ".dialog-mark");
  const action = declarations(CSS, ".dialog-actions .btn");
  const screenHeight = px(declarations(TOKENS, ":root")["--lcd-h"]);

  it("sits centred on the glass at the size the unit draws it", () => {
    expect(px(box["width"])).toBe(414);
    expect(px(box["height"])).toBe(240);
    // Centred is a consequence, not a declaration: the margins the sheet leaves
    // on each side have to come out equal.
    expect((screenWidth - px(box["width"])) / 2).toBe(33);
    expect((screenHeight - px(box["height"])) / 2).toBe(16);
  });

  it("frames a warning in a colour of its own, and marks it in the same colour", () => {
    expect(declarations(CSS, ".dialog.is-caution")["border-color"]).toBe("var(--dialog-caution)");
    expect(declarations(CSS, ".dialog.is-caution .dialog-mark")["color"]).toBe("var(--dialog-caution)");
    // The operator chose the yellow the lit bank cell carries.
    expect(declarations(TOKENS, ":root")["--dialog-caution"]).toBe(declarations(TOKENS, ":root")["--accent-bank-active"]);
  });

  it("frames the sheet rather than shadowing it", () => {
    expect(box["border"]).toBe("4px solid var(--dialog-edge)");
    expect(box["background"]).toBe("var(--dialog-sheet)");
    expect(box["box-shadow"], "the unit draws no drop shadow under it").toBeUndefined();
  });

  it("asks beside a mark the size of the unit's", () => {
    expect(px(mark["width"])).toBe(44);
    expect(px(mark["height"])).toBe(44);
    // Padding, mark and gap put the question where the unit prints it.
    const pad = (box["padding"] ?? "").trim().split(/\s+/);
    expect(px(pad[0])).toBe(74);
    expect(px(pad[1])).toBe(25);
    expect(px(declarations(CSS, ".dialog-ask")["gap"])).toBe(15);
  });

  it("gives its two buttons the unit's size and spacing", () => {
    expect(px(action["width"])).toBe(86);
    expect(px(action["min-height"])).toBe(39);
    expect(px(declarations(CSS, ".dialog-actions")["gap"])).toBe(25);
    // The face stands 3px above the bevel, so the label centres above it.
    expect(action["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel)");
  });
});

describe("the SETUP screen", () => {
  it("stands the GENERAL row on a tray of its own", () => {
    const tray = declarations(CSS, ".menu-grid.setup-general");
    const menu = declarations(CSS, ".menu-grid.setup-menu");
    expect(tray["background"]).toBe("var(--menu-tray)");
    expect([px(tray["left"]), px(tray["top"]), px(tray["width"]), px(tray["height"])]).toEqual([29, 4, 418, 54]);
    expect(tray["grid-template-columns"]).toBe("repeat(4, 1fr)");
    // The rows below it are the same three columns the whole-screen menus use.
    expect(menu["grid-template-columns"]).toBe(declarations(CSS, ".menu-grid-wide")["grid-template-columns"]);
    expect(px(menu["top"])).toBeGreaterThan(px(tray["top"]) + px(tray["height"]));
  });

  it("names itself over the section the menus belong to", () => {
    const main = declarations(CSS, ".setup-title-main");
    const sub = declarations(CSS, ".setup-title-sub");
    expect(main["text-align"]).toBe("center");
    expect(main["font-size"]).toBe(sub["font-size"]);
    expect(px(sub["top"]) - px(main["top"]), "one line under the other").toBe(25);
  });

  it("gives every button on the screens under it the shadow band", () => {
    const band = "inset 0 -3px 0 var(--btn-bevel)";
    // The pulldown takes a band of its own shade, so only the band's shape is
    // read on it. The wizard's white buttons are on the switch's list, which
    // draws their band from the shades that list carries.
    for (const selector of [".btn", ".lang-btn", ".mode-card", ".dropdown-box", ".pulldown"]) {
      const rule = declarations(CSS, selector);
      const shadow = rule["box-shadow"] ?? "";
      expect(shadow, `${selector} carries a band`).toMatch(/inset 0 -3px 0/);
      if (selector !== ".pulldown") expect(shadow).toBe(band);
      // The name centres in the face above the band, so the box pads for it.
      const pad = px(rule["padding-bottom"] ?? (rule["padding"] ?? "").trim().split(/\s+/).at(-1));
      expect(pad, `${selector} pads for it`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("a menu that fills the screen", () => {
  const grid = declarations(CSS, ".menu-grid-wide");
  const btn = declarations(CSS, ".menu-btn");

  it("stands its columns at the unit's width, centred with the unit's gutter", () => {
    expect(grid["grid-template-columns"]).toBe("repeat(3, 120px)");
    expect(px(grid["gap"])).toBe(13);
    expect(grid["justify-content"]).toBe("center");
    // Three columns and two gutters leave the same margin the unit leaves.
    expect((screenWidth - (3 * 120 + 2 * 13)) / 2).toBe(47);
  });

  it("gives every menu entry the unit's box, with the bevel along the bottom", () => {
    // SETUP's menus are the same box as microSD's and MONITOR's.
    expect(px(btn["min-height"])).toBe(46);
    expect(btn["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel)");
    // The caption centres in the face above the bevel, not in the whole box.
    expect(px(btn["padding-bottom"])).toBe(3);
    expect(btn["font-size"], "a one-class size loses to the button reset").toBeUndefined();
    expect(declarations(CSS, ".menu-grid .menu-btn")["font-size"]).toBe("var(--fs-lg)");
  });

  it("stands clear of the toolbar only where it is the whole screen", () => {
    expect(px(declarations(CSS, ".main > .menu-grid-wide")["padding-top"])).toBe(25);
    expect(grid["padding-top"], "a screen with something above the menu spaces it itself").toBeUndefined();
  });
});

describe("the toolbar", () => {
  const bar = declarations(CSS, ".toolbar");
  const icons = declarations(CSS, ".toolbar-icons");
  const btn = declarations(CSS, ".icon-btn");
  const eject = declarations(CSS, ".sd-eject");

  it("runs its icon row to the edge of the glass and no further", () => {
    // `inset: 0 0 auto 2px` — the bar clears the left edge but not the right,
    // because the unit's icon row is flush with the glass there.
    expect(bar["inset"]).toBe("0 0 auto 2px");
    expect(icons["margin-left"]).toBe("auto");
  });

  it("spaces the icons at the unit's pitch", () => {
    // The cells, their gaps, the band's rule and padding and HOME's divider with
    // its margin add up to the HOME band's width.
    expect(px(btn["width"])).toBe(40);
    expect(px(btn["height"])).toBe(40);
    expect(px(icons["gap"])).toBe(4);
    const pad = (icons["padding"] ?? "").trim().split(/\s+/);
    const homeSep = declarations(CSS, ".toolbar-icons.is-home .toolbar-sep");
    const rule = px(icons["border-left"]?.split(/\s+/)[0]);
    expect(rule + px(pad[3]) + 4 * px(btn["width"]) + 4 * px(icons["gap"]) + px(homeSep["margin-left"]) + px(homeSep["width"]) + px(pad[1])).toBe(185);
  });

  it("draws a band as wide as the unit's for each set of icons", () => {
    // With the back arrow the band holds two icons and the divider; with HOME
    // alone it holds one icon, its left rule standing where the divider stands.
    const pad = (icons["padding"] ?? "").trim().split(/\s+/);
    const rule = px(icons["border-left"]?.split(/\s+/)[0]);
    const sep = declarations(CSS, ".toolbar-sep");
    expect(rule + px(pad[3]) + 2 * px(btn["width"]) + 2 * px(icons["gap"]) + px(sep["width"]) + px(pad[1]), "back arrow and HOME").toBe(96);
    expect(rule + px(declarations(CSS, ".toolbar-icons.is-home-only")["padding-left"]) + px(btn["width"]) + px(pad[1]), "HOME alone").toBe(48);
    // HOME's divider is one column of its own colour with no shaded rows; the
    // other dividers carry a shaded row above and below.
    expect(declarations(CSS, ".toolbar-icons.is-home .toolbar-sep")["background"]).toBe("var(--toolbar-sep-home)");
    expect(declarations(CSS, ".toolbar-icons.is-home .toolbar-sep")["box-shadow"]).toBe("none");
    expect((sep["box-shadow"] ?? "").replace(/\s+/g, " ")).toBe("0 -1px 0 var(--toolbar-sep-end), 0 1px 0 var(--toolbar-sep-end)");
  });

  it("draws the band's lower left corner and a sheet's back button's in the unit's pixels", () => {
    // Both corners are a six-by-six box of one-pixel rows in named shades, laid
    // where the two edges meet.
    for (const sel of [".toolbar-icons::before", ".source-back::before"]) {
      const corner = declarations(CSS, sel);
      expect([corner["left"], corner["bottom"], corner["width"], corner["height"]], sel).toEqual(["-2px", "-2px", "6px", "6px"]);
      const rows = [...(corner["background"] ?? "").matchAll(/\)\s+0 (\S+) \/ 100% 1px no-repeat/g)].map((m) => m[1]);
      expect(rows, sel).toEqual(["0", "1px", "2px", "3px", "4px", "5px"]);
      expect(corner["background"], `${sel} names every shade by token`).not.toMatch(/#[0-9a-f]{3,8}\b|rgb/i);
    }
    expect(icons["border-bottom-left-radius"], "no curve is left to the browser").toBeUndefined();
    expect((declarations(CSS, ".source-back")["border-radius"] ?? "").split(/\s+/).at(-1)).toBe("0");
    const t = declarations(TOKENS, ":root");
    const names = ["--toolbar-sep-home", "--toolbar-sep-end", "--toolbar-corner-outer", "--toolbar-corner-fade", "--toolbar-corner-step", "--toolbar-corner-dark",
      "--toolbar-corner-inner", "--toolbar-corner-inner-fade", "--sheet-back-corner-outer", "--sheet-back-corner-step", "--sheet-back-corner-light",
      "--sheet-back-corner-inner", "--sheet-back-corner-inner-fade", "--sheet-back-corner-inner-soft"];
    expect(names.map((n) => t[n])).toEqual(["#737584", "#52515a", "#525563", "#293131", "#5a5d6b", "#101819", "#52555a", "#4a4d52",
      "#848a8c", "#636973", "#a5a6a5", "#52555a", "#4a4952", "#4a4d52"]);
  });

  it("centres the title on the glass rather than on what is left over", () => {
    const center = declarations(CSS, ".toolbar-center");
    expect(center["position"]).toBe("absolute");
    // The bar starts 2px in, so the title's box is pulled back to the edge.
    expect(px(center["left"])).toBe(-2);
    expect(px(center["right"])).toBe(0);
  });

  it("carries what a screen puts beside the row without moving the row", () => {
    // The eject button is placed at a fixed spot in the bar rather than flowed,
    // so what else the bar carries does not move it.
    expect(px(eject["width"])).toBe(46);
    expect(px(eject["height"])).toBe(40);
    expect(eject["position"]).toBe("absolute");
    expect(px(main["left"]) + px(eject["left"])).toBe(329);
    expect(px(eject["top"])).toBe(2);
  });
});

describe("the channel view's two rows", () => {
  const cv = declarations(CSS, ".cv-main");
  const rows = (cv["grid-template-rows"] ?? "").trim().split(/\s+/).map(px);
  const gap = px((cv["gap"] ?? "").trim().split(/\s+/)[0]);

  it("names an FX channel on its effect panel in white, centred across the panel", () => {
    const name = declarations(CSS, ".badge.cv-fx-name");
    expect([name["left"], name["width"], name["text-align"]]).toEqual(["0", "100%", "center"]);
    expect(name["color"]).toBe("var(--text)");
  });

  it("cuts the area into the two the unit draws, not into what is left over", () => {
    expect(rows).toEqual([84, 84]);
    expect(gap).toBe(10);
    expect(cv["align-content"], "the rows keep their height rather than filling").toBe("start");
  });

  it("stands clear of the readout bar under it", () => {
    // The main area runs down to the bar; the two rows stop 5px short of it.
    const area =
      px(declarations(TOKENS, ":root")["--lcd-h"]) -
      px(main["top"]) -
      px(declarations(CSS, ".knob-strip")["height"]);
    const used = rows.reduce((a, b) => a + b, 0) + gap * (rows.length - 1);
    expect(area - used).toBe(5);
  });
});

describe("the small type", () => {
  it("sets captions, notes and second lines at the sizes measured on the guide", () => {
    // Captions and headings take --fs-sm, the Peripheral note --fs-lg and the
    // language buttons' two lines p055-1's 13px.
    expect(declarations(TOKENS, ":root")["--fs-sm"]).toBe("11.5px");
    expect(declarations(CSS, ".peripheral-note")["font-size"]).toBe("var(--fs-lg)");
    expect([declarations(CSS, ".lang-top")["font-size"], declarations(CSS, ".lang-bottom")["font-size"]]).toEqual(["13px", "13px"]);
    // A caption's line box stays at 11px, so the controls under it keep their rows.
    for (const [sel, size] of [[".peripheral-caption", "13px"], [".integration-caption", "13px"], [".patch-caption", "13px"]] as const) {
      const d = declarations(CSS, sel);
      expect([d["font-size"], d["line-height"]], sel).toEqual([size, "11px"]);
    }
    // The ink rows the guide sets these on.
    expect(declarations(CSS, ".mode-caption")["translate"]).toBe("0 -2px");
    expect(declarations(CSS, ".sym")["translate"]).toBe("0 1px");
    // The Peripheral note is set four pixels right of and below its line box.
    expect(declarations(CSS, ".peripheral-note")["translate"]).toBe("4px 4px");
    // The LICENSE lines keep a fixed line pitch.
    expect(declarations(CSS, ".license-text")["line-height"]).toBe("17px");
  });
});

describe("the channel-bank list", () => {
  it("stands every bank on a darker cast of its own face, the one in view too", () => {
    // Each option shades its own face for its band, taken down as far as COLOR's
    // swatches take theirs: a darker green, red or yellow, neither the plain
    // buttons' bevel nor the lit switch's blue band.
    const band = "inset 0 -3px 0 rgb(0 0 0 / var(--px-band-cast))";
    expect(declarations(CSS, ".btn.color-swatch")["box-shadow"], "COLOR's swatches").toBe(band);
    expect(declarations(CSS, ".bank-option")["box-shadow"], "a bank not in view").toBe(band);
    const on = declarations(CSS, ".bank-option.is-on");
    expect(on["background"]).toBe("var(--accent-bank-active)");
    expect(on["box-shadow"], "the bank in view").toBe(band);
  });

  it("names the banks in white, as HOME's bank button does, and the one in view in black", () => {
    // No rule gives a bank not in view a colour of its own, so it takes the
    // glass's white; the one in view takes a lit switch's black.
    const own = styleRules(CSS).filter(
      (rule) => rule.selectors.some((s) => s.includes(".bank-option") && !s.includes(".is-on")) && rule.body["color"] !== undefined,
    );
    expect(own.map((rule) => rule.selectors.join(", "))).toEqual([]);
    expect(declarations(CSS, ".btn-toggle.is-on")["color"]).toBe("var(--text-inverse)");
  });
});

describe("the microSD screen", () => {
  it("sets USB Storage Mode on one line, its ink on the rows the guide sets it on", () => {
    // The name stays on one line, tightened, and the bottom padding lifts it
    // off the band.
    const d = declarations(CSS, ".btn.usb-storage");
    expect([d["font-size"], d["letter-spacing"], d["white-space"], d["padding-bottom"]]).toEqual(["13px", "-0.02em", "nowrap", "4px"]);
    expect([px(d["width"]), px(d["height"])]).toEqual([124, 40]);
  });

  it("darkens an entry out of reach to the face, name and band p078-1 draws", () => {
    const d = declarations(CSS, ".menu-btn.is-disabled");
    expect([d["background"], d["color"], d["box-shadow"], d["pointer-events"]]).toEqual([
      "var(--surface-disabled)",
      "var(--menu-text-disabled)",
      "inset 0 -3px 0 var(--btn-bevel-disabled)",
      "none",
    ]);
    const t = declarations(TOKENS, ":root");
    expect([t["--surface-disabled"], t["--menu-text-disabled"], t["--btn-bevel-disabled"]]).toEqual(["#212829", "#7b797b", "#191c19"]);
  });
});

describe("a block on the inset panel", () => {
  it("draws its corners in the unit's pixels rather than the browser's curve", () => {
    // The edge row gives its outer two pixels to the ground and its third to the
    // corner shade, the next row its outer pixel to the ground, the row after
    // its outer pixel to the shade.
    for (const sel of [".ind-block", ".cv-gain-flags"]) {
      const d = declarations(CSS, sel);
      expect(d["border-radius"], sel).toBeUndefined();
      expect(d["background"], sel).toBe("var(--inset-rows), var(--surface-inset)");
    }
    const rules = declarations(CSS, ".cv-gain-flags");
    expect(rules["--inset-ground"]).toBe("var(--surface)");
    const rows = [...(rules["--inset-rows"] ?? "").matchAll(/\)\s+(0 [^/]+?)\s*\/\s*100% 1px no-repeat/g)].map((m) => (m[1] ?? "").trim());
    expect(rows).toEqual(["0 0", "0 1px", "0 2px", "0 calc(100% - 2px)", "0 calc(100% - 1px)", "0 100%"]);
    const layers = (rules["--inset-rows"] ?? "").split("no-repeat,");
    expect(layers[0]).toContain("var(--inset-ground) 2px, var(--surface-inset-corner) 2px 3px");
    expect(layers[1]).toContain("var(--inset-ground) 1px, transparent 1px");
    expect(layers[2]).toContain("var(--surface-inset-corner) 1px, transparent 1px");
    expect(declarations(TOKENS, ":root")["--surface-inset-corner"]).toBe("#3a3d4a");
  });
});

describe("the channel view's head-amp column", () => {
  const gain = declarations(CSS, ".cv-gain");
  const row = declarations(CSS, ".cv-gain-row");
  const flags = declarations(CSS, ".cv-gain-flags");
  const buttons = declarations(CSS, ".cv-gain-buttons");

  it("stands the input meter beside the head amp at the unit's width", () => {
    // 6px in, a 44px stack, 15px across: the meter lands 69px into the column.
    expect(px(row["padding-left"])).toBe(6);
    expect(px(declarations(CSS, ".cv-gain-stack")["width"])).toBe(44);
    expect(px(row["gap"])).toBe(15);
    const meter = declarations(CSS, ".cv-gain-row .meter");
    expect([px(meter["width"]), px(meter["height"])]).toEqual([4, 56]);
    expect(px(declarations(CSS, ".cv-gain-row .meter-bar")["width"])).toBe(4);
  });

  it("keeps the flags panel where it stands when there is no gain to show", () => {
    // A 22px box, 4px apart from a 38px knob: a channel on no source keeps the
    // height, so the panel under it stays at y141.
    expect(px(declarations(CSS, ".cv-gain-stack")["min-height"])).toBe(22 + 4 + 38);
    expect(px(declarations(CSS, ".cv-gain-stack")["gap"])).toBe(4);
    expect(px(declarations(CSS, ".cv-gain-stack .value-box")["min-height"])).toBe(22);
  });

  it("lays the head-amp flags two to a row on their own panel", () => {
    expect(flags["grid-template-columns"]).toBe("1fr 1fr");
    expect(px(flags["height"])).toBe(46);
    expect(flags["background"]).toBe("var(--inset-rows), var(--surface-inset)");
    // At the name size, not the strip's small badge type.
    expect(declarations(CSS, ".flag")["font-size"]).toBe("var(--fs-lg)");
  });

  it("gives AUTO and SAFE the unit's box, drawn as the switch a block's name is", () => {
    const btn = declarations(CSS, ".cv-gain-buttons .btn");
    expect(buttons["grid-template-columns"]).toBe("44px 44px");
    expect(px(buttons["gap"])).toBe(3);
    expect(px(btn["height"])).toBe(24);
    expect(btn["background"]).toBe("var(--accent-cue)");
    expect([btn["padding-left"], btn["padding-right"]], "names wider than a padded face centre on the whole face").toEqual(["0", "0"]);
    // The pair carries no band of its own: it is on the switch's list, so it takes
    // the switch's band and the switch's corners (p090-1 unlit, p094-2 lit).
    expect(btn["box-shadow"], "the band comes from the shared rule").toBeUndefined();
    expect(declarations(CSS, SWITCH)["box-shadow"], "which names the pair").toBe("inset 0 -3px 0 var(--pb-band)");
    expect(declarations(CSS, ".lcd .cv-gain-buttons .btn")["--pb-band"], "unlit, in a block switch's shades").toBe("var(--badge-band-off)");
    const lit = declarations(CSS, ".lcd .cv-gain-buttons .btn.is-on");
    expect([lit["background"], lit["--pb-band"], lit["--pb-c"], lit["--pb-f"]], "lit, it takes a lit INS FX switch's colours").toEqual([
      "var(--block-fx)",
      "var(--badge-band-fx)",
      "var(--corner-badge-fx-c)",
      "var(--corner-badge-fx-f)",
    ]);
    const root = declarations(TOKENS, ":root");
    expect([root["--accent-cue"], root["--block-fx"], root["--badge-band-off"], root["--badge-band-fx"]]).toEqual([
      "#d6ced6",
      "#84d7ff",
      "#9c9e9c",
      "#63a2c5",
    ]);
  });

  it("carries the column's own bevel, as the blocks beside it do", () => {
    expect(gain["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel)");
    expect(declarations(CSS, ".cv-block")["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel)");
  });

  it("keeps an empty caption's line and stack's column, so a bus's meter stands where a channel's does", () => {
    const caption = declarations(CSS, ".cv-caption");
    expect(px(caption["min-height"]), "the line an empty caption keeps").toBe(px(caption["line-height"]));
    expect(px(declarations(CSS, ".cv-gain-stack")["width"]), "the column an empty stack keeps").toBe(44);
  });

  it("shows what each block is doing, at the size the unit draws it", () => {
    // GATE and DUCKER: three lamps in a row, one lit for what the block is doing.
    const lamp = declarations(CSS, ".block-lamp");
    expect([px(lamp["width"]), px(lamp["height"])]).toEqual([14, 14]);
    expect(px(declarations(CSS, ".block-lamps")["gap"])).toBe(5);
    expect(declarations(CSS, ".block-lamp.is-on")["background"]).toBe("var(--lamp-on)");
    expect(declarations(CSS, ".block-lamp.is-holding")["background"]).toBe("var(--lamp-hold)");
    expect(declarations(TOKENS, ":root")["--lamp-hold"], "the middle lamp's yellow").toBe("#f7f73a");

    // COMP: two bars with the threshold marked across both.
    const meters = declarations(CSS, ".comp-meters");
    expect(px(meters["width"])).toBe(68);
    expect(px(meters["gap"])).toBe(5);
    expect(px(declarations(CSS, ".comp-bar")["height"])).toBe(4);
    const thresh = declarations(CSS, ".comp-thresh");
    expect(px(thresh["width"])).toBe(2);
    // The mark reaches past the top and bottom bars by the same distance at each
    // end.
    expect([px(thresh["top"]), px(thresh["bottom"])], "it stands past both bars").toEqual([-3, -3]);
    // COMP stands its value and bars off the middle the other blocks use.
    expect(declarations(CSS, ".cv-block-comp .cv-block-body")["translate"]).toBe("1px -1px");
    expect(declarations(CSS, ".cv-block-comp .cv-block-body > :first-child")["translate"]).toBe("1px 0");

    // EQ: the curve over the panel the unit rules.
    const eq = declarations(CSS, ".eq-thumb");
    expect([px(eq["width"]), px(eq["height"])]).toEqual([78, 42]);
    expect(eq["background"]).toBe("var(--graph-bg)");
    expect(declarations(CSS, ".eq-grid")["stroke"]).toBe("var(--surface)");
  });

  it("draws a block's name as the switch the unit makes of it", () => {
    const badge = declarations(CSS, ".badge.badge-switch");
    // 17px of face over the 3px band the unit shades every button with.
    expect([px(badge["width"]), px(badge["height"])]).toEqual([60, 20]);
    expect(badge["box-shadow"]).toBe("inset 0 -3px 0 #00000045");
    expect(px(badge["padding-bottom"]), "so the name centres on the face").toBe(3);
    // Filled, and the name set against the fill so it stays readable.
    expect(badge["background"]).toBe("var(--badge-off)");
    expect(badge["color"]).toBe("var(--text-inverse)");
    expect(declarations(CSS, ".badge.badge-switch.badge-gate.is-on")["background"]).toBe("var(--block-gate)");
    const comp = declarations(CSS, ".badge.badge-switch.badge-comp.is-on");
    expect([comp["background"], comp["color"]], "the dark red carries a white name").toEqual([
      "var(--block-comp)",
      "var(--text)",
    ]);
    // 7px below the block's top, as the unit sets it.
    expect(px((declarations(CSS, ".cv-block")["padding"] ?? "").trim().split(/\s+/)[0])).toBe(7);
    // Drawn on the glass: the band in the switch's own colour, the corners from the guide's pixels.
    const drawn = { ...declarations(CSS, SWITCH), ...declarations(CSS, SWITCH_OFF) };
    expect([drawn["border-radius"], drawn["box-shadow"], drawn["--pb-band"]]).toEqual(["0", "inset 0 -3px 0 var(--pb-band)", "var(--badge-band-off)"]);
    expect(declarations(CSS, ".lcd .badge.badge-switch.badge-eq.is-on")["--pb-a"]).toBe("var(--corner-badge-eq-a)");
    expect(declarations(CSS, ".lcd .badge.badge-switch.badge-ducker.is-on")["--pb-band"], "DUCKER lights in GATE's orange").toBe("var(--badge-band-gate)");
    expect(declarations(CSS, ".lcd .badge.badge-switch:not(.badge-gate):not(.badge-ducker)")["translate"], "all but GATE and DUCKER a pixel right").toBe("1px 0");
    expect(declarations(CSS, `${SWITCH}::after`)["background"]).toContain("linear-gradient(var(--pb-f), var(--pb-f)) left 3px bottom 0px / 1px 1px no-repeat");
    const root = declarations(TOKENS, ":root");
    expect([root["--badge-band-off"], root["--badge-band-eq"], root["--corner-badge-gate-a"]]).toEqual(["#9c9e9c", "#219252", "#6b594a"]);
  });
});

describe("the channel view's SEND TO button", () => {
  it("stands on its own face, with the band every button on the glass carries", () => {
    const btn = declarations(CSS, ".cv-sendto");
    expect(px(btn["height"])).toBe(38);
    expect(btn["background"]).toBe("var(--surface-btn)");
    // It is on the switch's list, so its band and its corners come from there (p090-1).
    expect(btn["box-shadow"], "the band comes from the shared rule").toBeUndefined();
    const drawn = declarations(CSS, ".lcd .cv-sendto");
    expect([drawn["--pb-ground"], drawn["--pb-band"], drawn["--pb-c"]]).toEqual([
      "var(--lcd-bg)",
      "var(--btn-bevel-plain)",
      "var(--corner-sendto-c)",
    ]);
    expect(declarations(TOKENS, ":root")["--btn-bevel-plain"]).toBe("#3a3d42");
    // Its caption centres on the face, not on the box.
    expect(px((btn["padding"] ?? "").trim().split(/\s+/)[2])).toBe(3);
  });
});

describe("the channel view's on/off column", () => {
  const cell = declarations(CSS, ".cv-onoff");

  it("stands the meter in a lane of the unit's width beside the switches", () => {
    // 40px of switch and a 6px meter, 14px apart, 5px in from the column's edge.
    expect(cell["grid-template-columns"]).toBe("40px 6px");
    expect(px((cell["gap"] ?? "").trim().split(/\s+/)[1])).toBe(14);
    expect(px(cell["padding-left"])).toBe(5);
    expect(px(declarations(CSS, ".cv-onoff .meter")["min-width"])).toBe(6);
    expect(px(declarations(CSS, ".cv-onoff .meter-bar")["width"])).toBe(6);
  });
});

describe("the ON / CUE / PRE switch", () => {
  it("gives the band under a lit switch a colour of its own", () => {
    // A lit switch stands on a band of its own colour rather than the face
    // washed with black; CUE and PRE take the same band as ON.
    const lit = declarations(CSS, ".btn.btn-on.is-on");
    expect(lit["box-shadow"]).toBe("inset 0 -4px 0 var(--switch-band-lit)");
    expect(declarations(TOKENS, ":root")["--switch-band-lit"]).toBe("#6ba6bd");
    for (const rule of [".btn.btn-cue.is-on", ".btn.btn-pre.is-on"]) {
      expect(declarations(CSS, rule)["box-shadow"], `${rule} takes the same band`).toBe(lit["box-shadow"]);
    }
  });
});

describe("the SEND TO rail", () => {
  const rail = declarations(CSS, ".side");
  const tab = declarations(CSS, ".sendto-tab");

  it("stands its tabs where the unit stands every tab on the rail", () => {
    expect(px(rail["right"])).toBe(0);
    expect(px(rail["width"])).toBe(58);
    // Most screens leave 6px over the first tab; four hang it off the toolbar.
    expect(px(rail["top"])).toBe(56);
    expect(px(declarations(CSS, ".lcd.side-at-top .side")["top"])).toBe(50);
    // 57px: the 54px face plus the 3px band every button on the rail carries.
    expect(px(tab["height"])).toBe(57);
    // The rail's own gap carries these; the menus' tabs add to it.
    expect(px(rail["gap"]) + px(declarations(CSS, ".sendto-tab + .sendto-tab")["margin-top"])).toBe(3);
    expect(px(rail["gap"]) + px(declarations(CSS, ".side-tab + .side-tab")["margin-top"])).toBe(7);
    // A fixed height, not a minimum: two lines of name must not make the tab
    // taller than the ones beside it.
    const menu = declarations(CSS, ".side-tab");
    expect(px(menu["height"]), "a menu tab is shorter").toBe(52);
    expect(menu["min-height"], "and cannot grow").toBeUndefined();
  });

  it("meets the edge of the glass, so only the two corners facing the screen are shaped", () => {
    // The two right-hand corners stay square; the two left-hand corners are drawn
    // in one-pixel cells over the face and the band, in the shades of the tab's state.
    const tab = declarations(CSS, ".side-tab");
    expect([tab["border-radius"], tab["position"]]).toEqual(["0", "relative"]);
    const names = ["--corner-outer", "--corner-inner", "--corner-band", "--corner-band-top", "--corner-band-outer", "--corner-band-inner"];
    for (const [rule, s] of [[".side-tab", ""], [".side-tab.is-on", "-lit"], [".side-tab.is-disabled", "-disabled"]] as const) {
      const d = declarations(CSS, rule);
      expect(names.map((n) => d[n]), rule).toEqual([
        `var(--tab-corner-outer${s})`, `var(--tab-corner-inner${s})`, `var(--tab-band${s})`,
        `var(--tab-corner-band-top${s})`, `var(--tab-corner-band-outer${s})`, `var(--tab-corner-band-inner${s})`,
      ]);
    }
    const tokens = declarations(TOKENS, ":root");
    const shades = (s: string): (string | undefined)[] => ["outer", "inner", "band-top", "band-outer", "band-inner"].map((k) => tokens[`--tab-corner-${k}${s}`]);
    expect([shades(""), shades("-lit"), shades("-disabled")]).toEqual([
      ["#293131", "#424952", "#424952", "#292829", "#3a3d42"],
      ["#9c8629", "#efc642", "#d6b642", "#5a5129", "#8c793a"],
      ["#101819", "#192421", "#192021", "#081008", "#101810"],
    ]);
    expect(declarations(CSS, ".side-tab::before")["background"]).toContain("var(--corner-outer) 2px 3px");
    expect(declarations(CSS, ".side-tab::after")["background"]).toContain("var(--corner-band-top) 2px 3px");
  });

  it("gives the band under a tab a colour of its own in each state", () => {
    // Each tab state has a band colour of its own, and none of them is the
    // plain black wash .btn carries.
    const plain = declarations(CSS, ".btn")["box-shadow"];
    const band = (rule: string): string => declarations(CSS, rule)["box-shadow"] ?? "";
    expect(band(".side-tab")).toBe("inset 0 -3px 0 var(--tab-band)");
    expect(band(".side-tab.is-on")).toBe("inset 0 -3px 0 var(--tab-band-lit)");
    expect(band(".side-tab.is-disabled")).toBe("inset 0 -3px 0 var(--tab-band-disabled)");
    for (const rule of [".side-tab", ".side-tab.is-on", ".side-tab.is-disabled"]) {
      expect(band(rule), `${rule} does not take the plain wash`).not.toBe(plain);
    }
  });

  it("sets the name at the size the unit sets it, on the name itself", () => {
    // The unit's tab names stand 10px to the cap. `.lcd button { font: inherit }`
    // reaches the tab, so a size on the tab would not take; the name carries it.
    expect(px(declarations(CSS, ".side-tab-label")["font-size"])).toBe(14.5);
    expect(declarations(CSS, ".side-tab")["font-size"], "not on the tab").toBeUndefined();
  });

  it("colours the picked tab as the unit colours a picked side tab", () => {
    expect(declarations(CSS, ".side-tab")["background"]).toBe("var(--surface)");
    expect(declarations(CSS, ".side-tab.is-on")["background"]).toBe("var(--accent-menu)");
    expect(declarations(TOKENS, ":root")["--accent-menu"]).toBe("#ffd74a");
    // The glyph and the name part on a lit tab (p059-1's Analog, p087-1's Format).
    expect(declarations(CSS, ".side-tab.is-on")["color"], "the glyph").toBe("var(--surface-dim)");
    expect(declarations(CSS, ".side-tab.is-on .side-tab-label")["color"], "the name").toBe("var(--tab-name-lit)");
    expect([declarations(TOKENS, ":root")["--surface-dim"], declarations(TOKENS, ":root")["--tab-name-lit"]]).toEqual(["#3a3d42", "#31313a"]);
  });

  it("gives each destination a column of the screen's own grid", () => {
    const cell = declarations(CSS, ".sendto-cell");
    expect(px(cell["flex"]), "the column the four HOME strips are cut to").toBe(98);
    expect(px(cell["height"])).toBe(181);
    expect(px(declarations(CSS, ".sendto-screen")["gap"])).toBe(8);
  });

  it("cuts a destination cell into the rows the unit gives it", () => {
    const head = declarations(CSS, ".sendto-head");
    const body = declarations(CSS, ".sendto-body");
    // A raised band naming the destination, as a HOME strip names its channel.
    expect(px(head["height"])).toBe(36);
    expect(head["background"]).toBe("var(--surface-raised)");

    // Then the two switches, the send's own placing, and what it reads.
    const top = px((body["padding"] ?? "").trim().split(/\s+/)[0]);
    const pre = px(declarations(CSS, ".sendto-body .btn-pre")["margin-top"]);
    const slider = declarations(CSS, ".sendto-body .pan-slider");
    const bal = declarations(CSS, ".sendto-bal");
    expect([top, pre, px(slider["margin-top"]), px(bal["margin-top"])]).toEqual([9, 12, 11, 6]);
    expect(px(slider["width"])).toBe(88);
    const box = declarations(CSS, ".sendto-bal .value-box");
    expect(px(box["width"])).toBe(38);
    // The readout ends 6px short of the cell's right edge.
    const inset = (padding: string | undefined): number => px((padding ?? "").trim().split(/\s+/)[1]);
    expect(inset(body["padding"]) + inset(bal["padding"])).toBe(6);
    // The send's readout sits in the deeper well, as PAN and LEVEL do.
    expect(box["background"]).toBe("var(--well-deep)");

    // The rows fit the cell, so nothing is pushed past its foot: a row that
    // grew would push the readout off the bottom rather than shrink the cell.
    const switchHeight = px(declarations(CSS, ".btn.btn-switch")["height"]);
    const used =
      px(head["height"]) + top + switchHeight + pre + switchHeight +
      px(slider["margin-top"]) + px(declarations(CSS, ".pan-slider")["height"]) +
      px(bal["margin-top"]) + px(declarations(CSS, ".sendto-bal .value-box")["min-height"]);
    const cellHeight = px(declarations(CSS, ".sendto-cell")["height"]);
    expect(used).toBeLessThanOrEqual(cellHeight);
    expect(cellHeight - used, "and fills it, give or take the foot's own padding").toBeLessThan(2);
  });
});

describe("the scene name box", () => {
  const box = declarations(CSS, ".scene-box");

  it("stands on the toolbar at the unit's size, on the same face as a menu entry", () => {
    expect(px(box["width"])).toBe(135);
    expect(px(box["height"])).toBe(40);
    expect(box["background"]).toBe("var(--surface)");
    expect(box["border"], "the unit draws no line around it").toBe("0");
    expect(box["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel)");
  });

  it("prints its number and title at the size the unit does", () => {
    expect(declarations(CSS, ".scene-no")["font-size"]).toBe("var(--fs-md)");
    expect(declarations(CSS, ".scene-title")["font-size"]).toBe("var(--fs-lg)");
  });
});

describe("a sheet over the screen below it", () => {
  const scrim = declarations(CSS, ".lcd.is-dimmed::after");
  const above = declarations(CSS, ".lcd.is-dimmed .is-lit");

  it("covers the whole glass, not just the area the sheet sits in", () => {
    expect(scrim["inset"]).toBe("0");
    // It is drawn, not tapped through: the screen under it is out of reach.
    expect(scrim["pointer-events"]).toBe("none");
  });

  it("darkens what lies under it through the scrim filter, as the sheets and dialogs do", () => {
    for (const sel of [".lcd.is-dimmed::after", ".source-overlay", ".dialog-overlay"]) {
      const d = declarations(CSS, sel);
      expect([d["background"], d["backdrop-filter"]], sel).toEqual(["transparent", "url(#lcd-scrim)"]);
    }
    // Where backdrop-filter is missing, the plain wash stands in.
    const block = CSS.slice(CSS.indexOf("@supports not (backdrop-filter: none)"));
    expect(block.slice(0, block.indexOf("}")), "the fallback").toMatch(
      /\.dialog-overlay,\s*\.lcd\.is-dimmed::after,\s*\.source-overlay\s*\{\s*background: var\(--scrim\);/,
    );
  });

  it("keeps the sheet and the control it was opened from above it", () => {
    const z = Number(scrim["z-index"]);
    expect(Number(declarations(CSS, ".lcd.is-dimmed .main")["z-index"])).toBeGreaterThan(z);
    expect(Number(above["z-index"])).toBeGreaterThan(z);
    // A static element takes no z-index, so the lit control is positioned.
    expect(above["position"]).toBe("relative");
  });
});

describe("the send-destination sheet", () => {
  const sheet = declarations(CSS, ".sends-popup");
  const option = declarations(CSS, ".sends-option");

  it("covers the main area at the width the unit draws it", () => {
    expect(px(sheet["width"])).toBe(414);
    expect(sheet["background"]).toBe("var(--dialog-sheet)");
    // It starts at the main area's own left edge, so its inset is the column.
    const pad = (sheet["padding"] ?? "").trim().split(/\s+/);
    expect([px(pad[0]), px(pad[2]), px(pad[3])]).toEqual([9, 6, 49]);
    // A pixel above the main area's top, the destinations kept on their rows.
    expect(sheet["translate"]).toBe("0 -1px");
  });

  it("gives the destinations the unit's box", () => {
    expect(px(option["width"])).toBe(73);
    expect(px(option["min-height"])).toBe(40);
    expect(px(declarations(CSS, ".sends-row")["gap"])).toBe(8);
    // The effect returns stand apart from the buses, at the foot of the sheet.
    expect(declarations(CSS, ".sends-fx-row")["margin-top"]).toBe("auto");
  });
});

describe("the microSD menu", () => {
  it("hangs lower than the other whole-screen menus", () => {
    expect(px(declarations(CSS, ".main > .menu-grid-sd")["padding-top"])).toBe(33);
    expect(px(declarations(CSS, ".main > .menu-grid-wide")["padding-top"])).toBe(25);
  });

  it("puts USB Storage Mode where the toolbar starts, on the same box SETUP's mode uses", () => {
    const usb = declarations(CSS, ".btn.usb-storage");
    const mode = declarations(CSS, ".mode-box");
    expect([px(usb["width"]), px(usb["height"])]).toEqual([124, 40]);
    expect(px(usb["margin-left"])).toBe(5);
    expect([px(mode["width"]), px(mode["height"]), px(mode["margin-left"])]).toEqual([124, 40, 5]);
    // Dark like every other button until the mode it opens is actually on.
    expect(usb["background"]).toBe("var(--surface)");
    expect(declarations(CSS, ".btn.usb-storage.is-on")["background"], "the unit paints it the selection blue then").toBe(
      "var(--accent-selected)",
    );
  });
});

describe("the stereo-link mark between two strips", () => {
  const mark = declarations(CSS, ".strip-link");
  const strip = declarations(CSS, ".strip");
  const linked = declarations(CSS, ".strip.is-linked");
  /** `margin: t r b l` — the side the mark is pulled towards. */
  const margin = (side: 0 | 3): number => px((mark["margin"] ?? "").trim().split(/\s+/)[side]);

  it("gives the strip a corner of its own, rounder than the controls on it", () => {
    // The unit's strip corner fits a 6px circle; the buttons inside it are cut
    // to the shared radius, so the strip carries its own value.
    expect(strip["border-radius"]).toBe("var(--radius-strip)");
    expect(px(declarations(TOKENS, ":root")["--radius-strip"])).toBe(6);
  });

  it("centres the mark in the gutter, not against the strip that draws it", () => {
    // The mark belongs to neither channel, so it stands on the line between
    // them: half a gutter beyond the strip's own border and padding.
    const fromPanRow = px(mark["left"]) + margin(3) + px(mark["width"]) / 2;
    const stripEdge = px((strip["padding"] ?? "").trim().split(/\s+/)[1]);
    expect(fromPanRow).toBe(-(columnGap(bank["gap"]) / 2 + stripEdge));
  });

  it("runs the strip's colour rail to its own edge, against the frame", () => {
    // A border would inset the rail along with the content and stand it off the
    // frame, so the strip holds its content in padding instead.
    expect(strip["border"], "the strip carries no border of its own").toBeUndefined();
    const rail = declarations(CSS, ".strip::after");
    expect(rail["inset"]).toBe("0");
    // The rail is the strip's outline lifted by its own thickness, which is what
    // carries it round the corners; 4px is what the unit's rail measures across
    // the middle of a strip.
    const lift = (rail["box-shadow"] ?? "").trim().split(/\s+/);
    expect(lift[0]).toBe("inset");
    expect(px(lift[2])).toBe(-4);
    expect(rail["pointer-events"], "the rail covers the strip, so it takes no taps").toBe("none");
  });

  it("centres it on the pan slider the pair shares", () => {
    expect(declarations(CSS, ".strip-pan")["position"], "the mark is placed against the pan row").toBe("relative");
    expect(mark["top"]).toBe("50%");
    // It stands 2px below the slider's middle.
    expect(margin(0)).toBe(-px(mark["height"]) / 2 + 2);
  });

  it("stands the PAN / BAL pair under the Signal Type it belongs to", () => {
    // The pair starts at the Signal Type box's own left edge and stands one row
    // further down.
    const signal = declarations(CSS, ".chs-signal-field");
    const panBal = declarations(CSS, ".chs-panbal");
    const boxWidth = px(declarations(CSS, ".chs-field .pulldown")["width"]);
    expect(px(panBal["left"])).toBe(px(signal["width"]) - boxWidth);
    expect(px(panBal["top"]) - px(signal["top"])).toBe(52);
  });

  it("carries the selection frame round the mark rather than stopping at it", () => {
    const arc = declarations(CSS, ".strip-link.is-framed::before");
    const frame = declarations(CSS, ".strip.is-selected")["box-shadow"] ?? "";
    expect(arc["border"], "drawn in the frame's own colour").toContain("var(--text)");
    expect(frame).toContain("var(--text)");

    // It runs along the edge of the notch the way the straight frame runs along
    // the strip's, so its band straddles that edge instead of lying inside it.
    expect(px(arc["inset"])).toBe(-px(arc["border"]) / 2);

    // The frame stands outside the strip, and the arc reaches its far edge: half
    // the gutter in from the middle, less the frame's own width.
    const width = px(frame.split(/\s+/)[3]);
    const crossing = columnGap(bank["gap"]) / 2 - width;

    // Standing outside, the frame needs the margin around the main area, which
    // otherwise clips it away on the top, the bottom and the outermost strip.
    expect(px(main["overflow-clip-margin"]), "the frame's room outside the main area").toBe(width);
    expect(px(main["left"])).toBeGreaterThanOrEqual(width);
    expect(px(main["bottom"])).toBeGreaterThanOrEqual(width);
    for (const side of [".strip-link.is-framed-left::before", ".strip-link.is-framed-right::before"]) {
      const cut = /calc\(50% \+ ([\d.]+px)\)/.exec(declarations(CSS, side)["clip-path"] ?? "")?.[1];
      expect(px(cut), side).toBe(crossing);
    }
  });

  it("gives the frame its room by shrinking the mark under it", () => {
    const plain = px(declarations(CSS, ".strip-link svg")["width"]);
    const framed = px(declarations(CSS, ".strip-link.is-framed svg")["width"]);
    expect(plain - framed, "the mark gives up exactly the frame's width").toBe(
      px(declarations(CSS, ".strip-link.is-framed::before")["border"]),
    );
  });

  it("lets the mark out of the strip it is drawn in", () => {
    // A strip clips itself so its rail follows the rounded corner. The one that
    // carries the mark cannot, so it draws those corners on the rail instead.
    expect(strip["overflow"]).toBe("hidden");
    expect(linked["overflow"]).toBe("visible");
    // The strip that carries the mark cannot clip, so the rail draws the corner.
    expect(declarations(CSS, ".strip::after")["border-radius"]).toBe(strip["border-radius"]);
  });
});

describe("the compressor screen", () => {
  const gr = declarations(CSS, ".dyn-gr");
  const io = declarations(CSS, ".dyn-io");
  const col = declarations(CSS, ".dyn-io-col");
  const caption = declarations(CSS, ".dyn-io-caption");
  const bars = declarations(CSS, ".dyn-io .meter");

  it("runs the gain reduction and the input/output meters as one bar length", () => {
    // They read against each other: how far the block is holding the channel
    // down, beside what goes into it and what comes out.
    const meterTop = px(io["top"]) + px(caption["height"]) + columnGap(col["gap"]);
    expect(meterTop).toBe(px(gr["top"]));
    expect(px(bars["height"])).toBe(px(gr["height"]));
  });

  it("stacks the settings up from the bottom, so the last stands in one place", () => {
    // GATE has three of them, COMP two and DUCKER one; the lowest is level with
    // the foot of the plot on all three.
    const stack = declarations(CSS, ".dyn-sets");
    expect(stack["flex-direction"]).toBe("column");
    expect(px(stack["bottom"])).toBeGreaterThan(0);
    expect(stack["top"], "nothing pins the top, so the stack grows upward").toBeUndefined();
    expect(px(declarations(CSS, ".dyn-set")["height"])).toBeGreaterThan(0);
  });

  it("insets the value box from the end of the panel it stands in", () => {
    const set = declarations(CSS, ".dyn-set");
    const box = declarations(CSS, ".dyn-set .value-box");
    const [, right] = (set["padding"] ?? "").trim().split(/\s+/);
    expect(px(right), "the panel holds the box off its own edge").toBeGreaterThan(0);
    expect(px(box["width"])).toBeGreaterThan(0);
    expect(px(box["height"])).toBeLessThan(px(set["height"]));
  });

  it("stands the block's name at a fixed place in the bar, not centred on it", () => {
    // The bar centres a plain title; a block badge does not sit there.
    const badge = declarations(CSS, ".badge.badge-title");
    const centre = declarations(CSS, ".toolbar-center");
    expect(badge["position"]).toBe("absolute");
    expect(px(badge["left"])).toBeGreaterThan(px(centre["left"]));
    expect(centre["justify-content"], "and the title it holds is still centred").toBe("center");
  });

  it("puts the step to the rest of the parameters in the readout bar's label band", () => {
    const step = declarations(CSS, ".knob-strip .knob-page-step");
    const band = declarations(CSS, ".knob-cell-label");
    expect(px(step["height"])).toBe(px(band["min-height"]));
    expect(px(step["bottom"])).toBe(0);
  });
});

describe("the dynamics screens", () => {
  it("stands the plot, the reduction bar and the meters in one place on all three", () => {
    // GATE, COMP and DUCKER draw different things beside them, so the frame they
    // share is one set of rules rather than three.
    const plot = declarations(CSS, ".dyn-plot");
    const gr = declarations(CSS, ".dyn-gr");
    const io = declarations(CSS, ".dyn-io");
    expect([px(plot["width"]), px(plot["height"])]).toEqual([200, 173]);
    expect(px(gr["left"])).toBeGreaterThan(px(plot["left"]) + px(plot["width"]));
    expect(px(io["left"])).toBeGreaterThan(px(gr["left"]));
  });

  it("gives the DELAY cells the panel the channel view gives PAN and LEVEL", () => {
    const cell = declarations(CSS, ".delay-cell");
    const param = declarations(CSS, ".cv-param");
    expect(cell["background"]).toBe(param["background"]);
    expect([px(cell["width"]), px(cell["height"])]).toEqual([86, 84]);
    // Four of them across the same width as the bar that names what they carry.
    const cells = declarations(CSS, ".delay-cells");
    expect(px(cells["width"])).toBe(px(declarations(CSS, ".delay-title")["width"]));
    expect(px(cells["left"])).toBe(px(declarations(CSS, ".delay-title")["left"]));
  });

  it("runs the EQ plot the width of the screen, under the row that picks the band", () => {
    const plot = declarations(CSS, ".eq-plot");
    const band = declarations(CSS, ".eq-screen > .eq-band");
    expect(px(plot["width"])).toBe(416);
    expect(px(plot["top"])).toBeGreaterThan(px(band["top"]) + px(band["height"]));
    // The grips are centred on where the band's frequency and gain put them.
    expect(declarations(CSS, ".eq-grip")["margin"]).toBe("-16px 0 0 -16px");
    expect(band["font-size"], "the band's name").toBe("14px");
  });

  it("gives the INPUT buttons the shadow band every button carries, and centres over it", () => {
    const flag = declarations(CSS, ".btn.input-flag");
    // The flags are on the switch's list, which gives them a 3px band (p100-1).
    // The flags take an unlit block switch's band, the same 3px grey (p100-1).
    expect(declarations(CSS, ".lcd .btn.input-flag")["--pb-band"]).toBe("var(--badge-band-off)");
    expect(declarations(TOKENS, ":root")["--badge-band-off"]).toBe("#9c9e9c");
    expect(px((flag["padding"] ?? "").trim().split(/\s+/).at(-1))).toBe(3);
    expect(flag["place-items"]).toBe("center");
  });

  it("lights +48V and the phase switch in their own colours", () => {
    expect(declarations(CSS, ".btn.input-flag.is-phantom.is-on")["background"]).toBe("var(--accent-phantom)");
    expect(declarations(CSS, ".btn.input-flag.is-phase.is-on")["background"]).toBe("var(--accent-phase)");
    // Both take a colour the palette already carries rather than a second copy of it.
    const root = declarations(TOKENS, ":root");
    expect(root["--accent-phantom"]).toBe("var(--accent-sends)");
    expect(root["--accent-phase"]).toBe("var(--block-gate)");
  });

  it("draws Clip Safe holding the gain down in a lit GATE switch's face, band and corners", () => {
    expect(declarations(CSS, ".btn.input-flag.if-clip.is-on.is-engaged")["background"], "INPUT's [Clip Safe]").toBe("var(--block-gate)");
    for (const selector of [".lcd .btn.input-flag.if-clip.is-on.is-engaged", ".lcd .cv-gain-buttons .btn.is-on.is-engaged"]) {
      const drawn = declarations(CSS, selector);
      expect([drawn["--pb-a"], drawn["--pb-c"], drawn["--pb-f"], drawn["--pb-band"]], selector).toEqual([
        "var(--corner-badge-gate-a)", "var(--corner-badge-gate-c)", "var(--corner-badge-gate-f)", "var(--badge-band-gate)",
      ]);
    }
    expect(declarations(CSS, ".lcd .cv-gain-buttons .btn.is-on.is-engaged")["background"], "the channel view's [SAFE]").toBe("var(--block-gate)");
  });

  it("picks no weight by which way a switch is set", () => {
    // Only the face says which way a switch is set. A rule that thickened the
    // name as well made the two states different shapes.
    const stated = [...CSS.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, , body]) => /font-weight/.test(body ?? ""))
      .map(([, selector]) => (selector ?? "").trim())
      .filter((selector) => /\.is-(on|off)\b/.test(selector));
    expect(stated, "no rule reads the state to pick a weight").toEqual([]);
    for (const selector of [".lcd .oneknob", ".badge", ".btn.rate-btn"]) {
      expect(declarations(CSS, selector)["font-weight"], `${selector} is bold on its own`).toBe("700");
    }
    expect(declarations(CSS, ".btn.btn-switch")["font-weight"], "[ON] / [CUE] / [PRE] name themselves in the regular weight").toBe("400");
  });

  it("centres the block's name in its box, at a size of its own", () => {
    const badge = declarations(CSS, ".badge.badge-title");
    expect(badge["place-items"]).toBe("center");
    expect(badge["font-size"]).toBe("var(--fs-2xl)");
    expect(px(badge["padding-bottom"])).toBe(3);
    expect(px(declarations(TOKENS, ":root")["--fs-2xl"])).toBeGreaterThan(px(declarations(TOKENS, ":root")["--fs-xl"]));
  });

  it("keeps a long channel name inside its own box", () => {
    // The narrow box is not wide enough for every name; what does not fit is cut
    // off by the box rather than drawn over the arrow beside it.
    expect(declarations(CSS, ".ch-chip.is-narrow")["overflow"]).toBe("hidden");
    expect(declarations(CSS, ".badge.badge-title")["white-space"], "and a screen name never wraps").toBe("nowrap");
    // A long screen name is set at the size of the shorter ones; no rule sets it
    // a size down.
    expect(Object.keys(declarations(CSS, ".badge.badge-title.is-long"))).toEqual([]);
  });

  it("keeps the channel colour behind the name drawn over it", () => {
    const icon = declarations(CSS, ".ch-chip-icon");
    const labels = declarations(CSS, ".ch-chip-labels");
    expect(Number(icon["z-index"])).toBeLessThan(Number(labels["z-index"]));
    expect(labels["position"], "which only a positioned box can take").toBe("relative");
  });

  it("cuts the INPUT screen into two panels of one size", () => {
    const a = declarations(CSS, ".input-panel");
    const left = declarations(CSS, ".input-panel-a");
    const right = declarations(CSS, ".input-panel-b");
    expect(px(a["height"])).toBe(128);
    expect(px(right["left"])).toBe(px(left["left"]) + px(a["width"]) + 4);
    expect(a["background"]).toBe("var(--surface-sunken)");
  });
});

describe("the marks a strip and a channel view print", () => {
  const CSS = readStyle("lcd.css");
  const TOKENS = readStyle("tokens.css");
  const root = declarations(TOKENS, ":root");
  /** What a colour is worth once its token is looked up. */
  const shade = (value: string | undefined): string => {
    let out = value ?? "";
    for (let i = 0; i < 4 && out.startsWith("var("); i++) out = root[out.slice(4, -1)] ?? out;
    return out;
  };

  it("prints a mark in the colour of the button that sets it", () => {
    // +48V, Φ and HI-Z are marks on HOME's strip and in the channel view, and
    // buttons on the INPUT screen; INS FX is a mark and a button on its own block.
    const phantom = shade(declarations(CSS, ".btn.input-flag.is-phantom.is-on")["background"]);
    const phase = shade(declarations(CSS, ".btn.input-flag.is-phase.is-on")["background"]);
    const lit = shade(declarations(CSS, ".btn.input-flag.is-on")["background"]);
    const insert = shade(declarations(CSS, ".badge.badge-switch.badge-insfx.is-on")["background"]);
    expect([phantom, phase, lit, insert], "red, orange and the two cyans").toEqual([
      "#ce4529", "#ff8629", "#84e3ff", "#84d7ff",
    ]);

    expect(shade(declarations(CSS, ".sym.is-hot")["color"]), "+48V on the strip").toBe(phantom);
    expect(shade(declarations(CSS, ".sym-phase.is-on")["color"]), "Φ on the strip").toBe(phase);
    expect(shade(declarations(CSS, ".ind-row .badge-insfx.is-on")["color"]), "INS FX on the strip").toBe(insert);
    expect(shade(declarations(CSS, ".ind-row .badge-neutral.is-on")["color"]), "HPF on the strip").toBe(lit);
    expect(shade(declarations(CSS, ".flag.is-on.is-phantom")["color"]), "+48V in the channel view").toBe(phantom);
    expect(shade(declarations(CSS, ".flag.is-on.is-phase")["color"]), "Φ in the channel view").toBe(phase);
    // The Φ mark is one drawing at one size wherever it stands: HOME, the channel view and INPUT's button.
    for (const selector of [".sym-phase svg", ".flag.is-phase svg", ".btn.input-flag.is-phase svg"]) {
      const d = declarations(CSS, selector);
      expect([d["width"], d["height"]], selector).toEqual(["10px", "11px"]);
    }
    // HPF and HI-Z take the lit button's own cyan, which is what a mark takes
    // where nothing else claims it.
    expect(shade(declarations(CSS, ".flag.is-on")["color"]), "HPF and HI-Z in the channel view").toBe(lit);
  });
});

describe("an effect's grid of controls", () => {
  const CSS = readStyle("lcd.css");

  it("keeps every reading on one line, whatever kind of control holds it", () => {
    // A reading that wraps is drawn over the caption above it: the panel holds a
    // caption, a control and the knob that turns it, and nothing in it gives.
    const box = declarations(CSS, ".efx-cell .pulldown");
    expect(box["white-space"]).toBe("nowrap");
    expect(box["overflow"]).toBe("hidden");
    const cell = declarations(CSS, ".efx-cell");
    const caption = declarations(CSS, ".efx-cell-caption");
    const knob = declarations(CSS, ".efx-cell .knob-graphic");
    const gap = px(cell["gap"]);
    const top = px((cell["padding"] ?? "").trim().split(/\s+/)[0]);
    expect(px(cell["height"]), "caption, control and knob, one under the other").toBe(
      top + px(caption["height"]) + gap + px(box["height"]) + gap + px(knob["margin-top"]) + KNOB_SIZE,
    );
  });

  it("shows a value in the box the DELAY screen's cells show theirs in, corners and all", () => {
    // The corners are drawn on an overlay a pixel outside the box, which a box
    // that clips what it holds would cut away.
    const own = declarations(CSS, ".efx-cell .value-box");
    const delay = declarations(CSS, ".delay-cell .value-box");
    expect([own["width"], own["height"]]).toEqual([delay["width"], delay["height"]]);
    expect(own["overflow"]).toBeUndefined();
  });

  it("centres each panel over the division of the readout strip that reads it", () => {
    // The same rule the oscillator's boxes follow: a panel stands over the
    // division that prints its value, so the tracks carry the bar's own widths
    // and the panel is laid at the head of its track.
    const bar = declarations(CSS, ".knob-strip");
    const tracks = (bar["grid-template-columns"] ?? "").trim().split(/\s+/).map(px);
    const divider = px(declarations(CSS, ".knob-cell + .knob-cell")["border-left"]);
    const origin = px(bar["left"]) + px(bar["border"]);
    const sum = (n: number): number => tracks.slice(0, n).reduce((a, b) => a + b, 0);
    const divisions = tracks.map((_, i) => (origin + sum(i) + (i > 0 ? divider : 0) + origin + sum(i + 1)) / 2);

    const params = declarations(CSS, ".efx-params");
    const cell = px(declarations(CSS, ".efx-cell")["width"]);
    const own = (params["grid-template-columns"] ?? "").trim().split(/\s+/).map(px);
    expect(params["justify-items"], "a panel is laid at the head of its track").toBe("start");
    expect(own.length, "one track per division").toBe(tracks.length);
    const left = px(main["left"]) + px(params["left"]);
    for (const [i, division] of divisions.entries()) {
      const centre = left + own.slice(0, i).reduce((a, b) => a + b, 0) + cell / 2;
      expect(Math.abs(centre - division), `panel ${i + 1} over division ${i + 1}`).toBeLessThanOrEqual(0.5);
    }
  });

  it("stands the multi-band compressor's bands, meters and rows where the unit stands them", () => {
    // URX44V, 2026-09-23, read off the unit's own screens: the plot starts at the
    // left of the glass, the bands' page runs wider than a curve's, and the three
    // reduction bars sit in the gap between the plot and what stands to its right,
    // their feet level with the plot's.
    expect(px(declarations(CSS, ".mbc-screen .dyn-plot")["left"])).toBe(4);
    expect(px(declarations(CSS, ".mbc-bands")["width"])).toBe(265);
    const bars = declarations(CSS, ".mbc-gr");
    expect([px(bars["left"]), px(bars["bottom"])]).toEqual([211, 8]);
    expect(px(declarations(CSS, ".mbc-screen.is-bands .mbc-gr")["left"]), "the bands' page pushes them right").toBe(280.5);
    expect(px(declarations(CSS, ".mbc-gr-bars")["gap"]), "a bar's width between bars").toBe(6);
    expect(px(declarations(CSS, ".dyn-gr")["width"])).toBe(6);
    // `GR` is set in the white the screen's own names take; the band letters under
    // it stay in the secondary ink (the operator, 2026-09-23).
    expect(declarations(CSS, ".mbc-gr-caption")["color"]).toBe("var(--text)");
    expect(declarations(CSS, ".mbc-gr-letters")["color"]).toBe("var(--text-secondary)");
    // The band whose page is open is framed rather than filled differently.
    const lit = declarations(CSS, ".mbc-gr-bar.is-lit");
    expect(lit["outline"]).toBe("1px solid var(--mbc-gr-open)");
    expect(px(lit["outline-offset"])).toBe(1);
    expect(px(lit["border-radius"]), "and follows the bar's rounded ends").toBe(2);
  });

  it("draws Pitch Fix's notes in faces the screen already carries", () => {
    // The lit note takes [1 1-knob]'s own lit face; the rest take the face the
    // lists beside the keyboard stand on (the operator's instruction, 2026-09-23).
    const note = declarations(CSS, ".pitch-note");
    const lit = declarations(CSS, '[aria-pressed="true"] > .pitch-note');
    expect(note["background"]).toBe(declarations(CSS, ".pulldown")["background"]);
    expect(lit["background"]).toBe("var(--oneknob-lit)");
    expect(px(note["width"]), "and both are the same circle").toBe(px(note["height"]));
    // The circle is a face, not a button: the key under it takes the touch and
    // greys over while it is held (the operator, 2026-09-23).
    expect(note["box-shadow"], "no band under the circle").toBeUndefined();
    expect(declarations(CSS, ".pitch-key-black:active::after")["background"]).toBe("var(--key-held)");
  });

  it("ends a list name too long for its panel the way the other long names end", () => {
    const value = declarations(CSS, ".efx-cell .pulldown-value");
    expect(value["overflow"]).toBe("hidden");
    expect(value["text-overflow"], "the mark every name too long for its box takes").toBe("ellipsis");
  });

  it("draws the effect area in the panels the screen it opens uses", () => {
    // The INS FX screen's effect area is the same grid with nothing to turn, so
    // it carries no size of its own to drift from the screen it opens.
    expect(Object.keys(declarations(CSS, ".efx-params.is-rack"))).toEqual([]);
    expect(Object.keys(declarations(CSS, ".is-rack .efx-cell"))).toEqual([]);
    expect(Object.keys(declarations(CSS, ".efx-cell.is-wide"))).toEqual([]);
  });

  it("stretches a row of buttons over two panels, and stands a foot list at the foot of its panel", () => {
    // CLEAN's Cho / Off / Vib take the first two tracks and the gap between them.
    const tracks = (declarations(CSS, ".efx-params")["grid-template-columns"] ?? "").split(" ").map(px);
    expect(px(declarations(CSS, ".efx-cell.has-buttons")["width"])).toBe((tracks[0] ?? 0) + px(declarations(CSS, ".efx-cell")["width"]));
    expect(declarations(CSS, ".efx-cell.is-foot")["justify-content"]).toBe("flex-end");
    expect(declarations(CSS, ".efx-buttons .btn.efx-button.is-on")["background"], "the one taken lit cyan").toBe("var(--accent-selected)");
    // Gate stands alone, not one of a row: round on the left as on the right (URX44V, 2026-09-22).
    expect(declarations(CSS, ".efx-buttons .btn.efx-button:only-child")["border-radius"]).toBe("var(--radius-md)");
    expect(CSS.indexOf(".efx-buttons .btn.efx-button:only-child {"), "after the row's end rules, so it wins").toBeGreaterThan(
      CSS.indexOf(".efx-buttons .btn.efx-button:last-child {"),
    );
    // Gate and a delay's Note run the width of a panel: the cell drops the panel's padding, the
    // button fills the row, and a list on the glass is the panel's width.
    expect(declarations(CSS, ".efx-cell.is-bare:not(.is-foot, .has-buttons)")["padding-inline"]).toBe("0");
    expect(declarations(CSS, ".efx-buttons")["width"]).toBe("100%");
    const bareList = declarations(CSS, ".efx-cell.is-bare .pulldown");
    expect([px(bareList["width"]), px(bareList["min-width"])]).toEqual([px(declarations(CSS, ".efx-cell")["width"]), px(declarations(CSS, ".efx-cell")["width"])]);
    // A control on the glass has no panel, its box nine tenths of the toolbar's 40px effect name, a list's caption dark grey.
    expect(declarations(CSS, ".efx-cell.is-bare")["background"]).toBe("none");
    const tall = Math.round(px(declarations(CSS, ".insfx-effect")["height"]) * 0.9);
    for (const rule of [".efx-cell.is-bare .pulldown", ".efx-buttons .btn.efx-button"]) {
      expect(px(declarations(CSS, rule)["height"]), rule).toBe(tall);
    }
    expect(declarations(CSS, ".efx-cell.is-bare .efx-cell-caption")["color"]).toBe("var(--text-muted)");
    // A foot list on the glass is as wide as the readout bar's division under it: the
    // last division runs x317..420 (URX44V, 2026-09-22).
    const footList = declarations(CSS, ".efx-cell.is-bare.is-division .pulldown");
    expect(px(footList["width"])).toBe(420 - 317);
    // The last column's panel starts at x326 (12 + 104 + 106 + 104).
    const tracks4 = (declarations(CSS, ".efx-params")["grid-template-columns"] ?? "").split(" ").map(px);
    const lastPanelLeft = px(declarations(CSS, ".efx-params")["left"]) + 2 + (tracks4[0] ?? 0) + (tracks4[1] ?? 0) + (tracks4[2] ?? 0);
    expect(lastPanelLeft + px(footList["margin-left"]), "from the division's left edge").toBe(317);
    expect(declarations(CSS, ".efx-cell.is-bare.is-foot")["padding-inline"]).toBe("0");
    // The Note list opens to the left of the Note's box in the last column, 2px clear of it
    // and of the readout bar under it: five options of 48px across and three of 36px down.
    const noteList = declarations(CSS, ".efx-note-list");
    const option = declarations(CSS, ".btn.dropdown-option.efx-note-option");
    const list = declarations(CSS, ".dropdown-list");
    const across = (n: number, size: number): number => n * size + (n - 1) * px(list["gap"]) + 2 * px(list["padding"]);
    expect(noteList["grid-template-columns"]).toBe(`repeat(5, ${option["min-width"]})`);
    expect(px(noteList["left"]) + across(5, px(option["min-width"])), "2px short of the Note's box").toBe(lastPanelLeft - 2);
    const barTop = px(declarations(TOKENS, ":root")["--lcd-h"]) - px(declarations(CSS, ".knob-strip")["height"]);
    expect(px(noteList["top"]) + across(3, px(option["min-height"])), "2px over the readout bar").toBe(barTop - 2);
    // The upper foot list ends 8px over the lower foot list's caption, and the upper
    // row's other controls on the glass end where that list begins.
    const cell = declarations(CSS, ".efx-cell");
    const height = px(cell["height"]);
    const rowGap = px(declarations(CSS, ".efx-params")["gap"]?.split(" ")[0]);
    const footPad = px(declarations(CSS, ".efx-cell.is-foot")["padding-bottom"]);
    const caption = px(declarations(CSS, ".efx-cell-caption")["height"]);
    const footGap = px(declarations(CSS, ".efx-cell.is-bare.is-foot")["gap"]);
    expect(footGap, "a foot list's caption set apart from it").toBeGreaterThan(px(cell["gap"]));
    const lowerCaptionTop = height + rowGap + height - footPad - tall - footGap - caption;
    const drop = px(declarations(CSS, ".efx-cell.is-foot.is-upper")["translate"]?.split(" ")[1]);
    expect(lowerCaptionTop - (height - footPad + drop), "8px between the upper list and the lower caption").toBe(8);
    const upperListTop = height - footPad - tall + drop;
    expect(height - px(declarations(CSS, ".efx-cell.is-bare.is-upper:not(.is-foot)")["padding-bottom"]), "the others end on its top").toBe(upperListTop);
  });

  it("centres an effect's name on the block that opens it", () => {
    // A name too long for the block takes two lines, and a shrink-to-fit box
    // would leave the shorter of them against the left edge.
    const text = declarations(CSS, ".cv-block-text");
    expect(text["text-align"]).toBe("center");
    expect(px(text["width"]), "the block's own width, not the name's").toBe(86);
  });
});

describe("the black value boxes", () => {
  const CSS = readStyle("lcd.css");
  const VARIANTS = [
    ".cv-gain-stack .value-box",
    ".cv-param .value-box",
    ".sendto-bal .value-box",
    ".dyn-set .value-box",
    ".delay-cell .value-box",
    ".input-col .value-box",
    ".efx-cell .value-box",
  ];

  it("centres what it holds, on every screen that draws one", () => {
    // The value box and each of its variants centre the reading.
    expect(declarations(CSS, ".value-box")["text-align"]).toBe("center");
    for (const selector of VARIANTS) {
      const justify = declarations(CSS, selector)["justify-content"];
      // Only a flex box needs to say it; the rest take text-align.
      if (justify !== undefined) expect(justify, `${selector} centres`).toBe("center");
    }
  });

  it("takes its width from the guide and keeps the inset out of the reading", () => {
    // 6px of padding each side left the 44px INPUT box 30px of room, and its
    // widest reading (120.0) is 35px of ink.
    const pad = (declarations(CSS, ".value-box")["padding"] ?? "").trim().split(/\s+/);
    expect(px(pad.at(-1))).toBeLessThanOrEqual(2);
    for (const selector of VARIANTS) {
      const rule = declarations(CSS, selector);
      expect(px(rule["width"]), `${selector} is a fixed width`).toBeGreaterThan(0);
    }
  });
});

describe("the scroll bar the unit draws beside a list", () => {
  const CSS = readStyle("lcd.css");

  it("draws its rim only while the list holds the focus", () => {
    // The pink is the same one a value box takes when it is being turned, so a
    // list that nobody has touched carries none of it.
    // The ring itself is always drawn in the dark cast; the list holding the
    // focus turns its ring pink.
    const bar = declarations(CSS, ".scrollbar");
    expect(bar["border"]).toContain("var(--well-deep)");
    expect(declarations(CSS, ".scrollbar.is-focused")["border-color"]).toBe("var(--accent-focus)");
    expect(CSS, "the rim no longer follows the page's own focus").not.toContain(":focus-within + .scrollbar");
  });

  it("is one widget, not one per screen", () => {
    // The well and the thumb are sized once; a screen only says where it stands.
    expect(px(declarations(CSS, ".scrollbar")["width"]), "12px on the unit").toBe(12);
    expect(px(declarations(CSS, ".scroll-thumb")["width"]), "8px inside the 2px rim").toBe(8);
    const place = declarations(CSS, ".source-scrollbar");
    expect(Object.keys(place).sort(), "the sheet sets only its place").toEqual(["height", "left", "top"]);
  });
});

describe("the faces of the on/off buttons", () => {
  it("underlines a lit toggle with one band", () => {
    expect(declarations(CSS, ".btn-toggle.is-on")["box-shadow"]).toBe("inset 0 -3px 0 var(--toggle-band-lit)");
    expect(declarations(TOKENS, ":root")["--toggle-band-lit"]).toBe("#5a9eb5");
  });

  it("stands CUE Interrupt and MONO on a pale face while they are off, and leaves the lit face to the toggle rule", () => {
    const off = declarations(CSS, ".mon-btn:not(.is-on)");
    expect([off["background"], off["color"], off["box-shadow"]]).toEqual([
      "var(--mon-toggle-off)",
      "var(--mon-toggle-off-ink)",
      "inset 0 -3px 0 var(--mon-toggle-off-band)",
    ]);
    const tokens = declarations(TOKENS, ":root");
    expect([tokens["--mon-toggle-off"], tokens["--mon-toggle-off-band"], tokens["--mon-toggle-off-ink"]]).toEqual([
      "#cecace",
      "#948e94",
      "#3a3d3a",
    ]);
    for (const selector of [".mon-btn", ".mon-cue", ".mon-mono"]) {
      const face = declarations(CSS, selector);
      expect([face["background"], face["box-shadow"]], `${selector} paints no face of its own`).toEqual([undefined, undefined]);
    }
  });
});

describe("a pick dialog with one column", () => {
  it("stands the column in the middle of the dialog", () => {
    const centred = declarations(CSS, ".pick-dialog-cols.is-centred");
    expect([px(centred["left"]), px(centred["right"]), centred["justify-content"]]).toEqual([0, 0, "center"]);
  });

  it("widens the rows and moves the bar out with a wide tray", () => {
    const tray = (selector: string): [number, number, number] => [
      px(declarations(CSS, selector)["width"]),
      px(declarations(CSS, `${selector} .pick-dialog-row`)["width"] ?? declarations(CSS, ".btn.pick-dialog-row")["width"]),
      px(declarations(CSS, `${selector} .pick-dialog-bar`)["left"] ?? declarations(CSS, ".pick-dialog-bar")["left"]),
    ];
    const [narrow, narrowRow, narrowBar] = tray(".pick-dialog-col");
    const [wide, wideRow, wideBar] = tray(".pick-dialog-col.is-wide");
    expect(wide).toBeGreaterThan(narrow);
    expect([wide - wideRow, wideBar - wide], "the same inset and the same gap as a narrow tray").toEqual([narrow - narrowRow, narrowBar - narrow]);
  });
});

/** Every rule in a sheet, as its selectors and its declarations' text. */
const rules = (css: string): { selectors: string[]; body: string }[] =>
  css
    .split("}")
    .filter((block) => block.includes("{"))
    .map((block) => ({
      selectors: block.slice(0, block.indexOf("{")).split(",").map((s) => s.trim()).filter(Boolean),
      body: block.slice(block.indexOf("{") + 1),
    }));

describe("the browser's own scroll bars", () => {
  it("are hidden on every box that scrolls, since the glass draws its own", () => {
    const all = [...rules(CSS), ...rules(readStyle("app.css"))];
    const scrolling = all.filter((r) => /overflow(-[xy])?\s*:[^;]*\b(auto|scroll)\b/.test(r.body)).flatMap((r) => r.selectors);
    const hidden = new Set(all.filter((r) => /scrollbar-width\s*:\s*none/.test(r.body)).flatMap((r) => r.selectors));
    const webkit = new Set(
      all
        .filter((r) => /display\s*:\s*none/.test(r.body))
        .flatMap((r) => r.selectors)
        .filter((s) => s.endsWith("::-webkit-scrollbar"))
        .map((s) => s.slice(0, -"::-webkit-scrollbar".length)),
    );
    expect(scrolling.length, "the sheet has boxes that scroll").toBeGreaterThan(0);
    expect(scrolling.filter((s) => !hidden.has(s)), "scrollbar-width: none").toEqual([]);
    expect(scrolling.filter((s) => !webkit.has(s)), "::-webkit-scrollbar hidden").toEqual([]);
  });
});

describe("a meter's colours", () => {
  it("are changed for one meter only through custom properties", () => {
    // A rule that paints a clip dot or a bar itself outranks the lit dot's face,
    // so the dot on that meter would never light.
    const own = new Set([".meter-clip", ".meter-bar", ".meter-bar::before", ".meter-bar::after"]);
    const painted = rules(CSS)
      .filter((r) => /(^|;)\s*background(-color)?\s*:/.test(r.body))
      .flatMap((r) => r.selectors)
      .filter((s) => /\.meter-(clip|bar)\b/.test(s) && !own.has(s));
    expect(painted).toEqual([]);
    expect(declarations(CSS, ".meter-clip.is-on")["background"], "a lit dot changes its colours, not its layers").toBeUndefined();
    const literal = rules(CSS)
      .filter((r) => r.selectors.some((s) => /\.meter-(clip|bar)\b|\.dyn-gr\b/.test(s)))
      .filter((r) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(r.body))
      .flatMap((r) => r.selectors);
    expect(literal, "no colour is written into a meter part's own rule").toEqual([]);
  });

  it("stands a RECORDER meter on the card's own colour", () => {
    expect(declarations(CSS, ".rec-slot-meter .meter")["--meter-track"]).toBe("var(--lcd-bg)");
  });
});

describe("a meter's shape", () => {
  it("draws the ends of every bar and clip dot in rows of corner shades that fit its width", () => {
    const rows = (value: string | undefined): string[] =>
      [...(value ?? "").matchAll(/\)\s+(0 [^/]+?)\s*\/\s*100% 1px no-repeat/g)].map((m) => (m[1] ?? "").trim());
    for (const sel of [".meter-bar", ".meter-bar::before", ".meter-bar::after"]) {
      expect(rows(declarations(CSS, sel)["--meter-rows"]), `a 4px part: two rows at each end (${sel})`).toEqual([
        "0 0",
        "0 1px",
        "0 calc(100% - 1px)",
        "0 100%",
      ]);
    }
    const full = (k: number): string => `0 calc(${k}px + clamp(0px, (100cqh - 100% - 1px) * 1000, 1000px))`;
    expect(rows(declarations(CSS, ".meter-bar::before")["--meter-full-rows"]), "a 4px bar lit to its top").toEqual([0, 1].map(full));
    const wide = rules(CSS)
      .filter((r) => /(?:^|;)\s*width\s*:\s*6px/.test(r.body))
      .flatMap((r) => r.selectors)
      .filter((sel) => /\.meter-(clip|bar)$/.test(sel));
    expect(wide.length, "6px parts exist").toBeGreaterThan(4);
    const lit = wide.filter((sel) => sel.endsWith(".meter-bar")).flatMap((sel) => [`${sel}::before`, `${sel}::after`]);
    const parts = [...wide, ...lit, ".dyn-gr"];
    for (const sel of parts) {
      expect(rows(declarations(CSS, sel)["--meter-rows"]), sel).toEqual([
        "0 0",
        "0 1px",
        "0 2px",
        "0 calc(100% - 2px)",
        "0 calc(100% - 1px)",
        "0 100%",
      ]);
    }
    for (const sel of parts) {
      const top = (declarations(CSS, sel)["--meter-rows"] ?? "").split("no-repeat,")[0] ?? "";
      expect(top.match(/var\(--top-ground, var\(--meter-ground\)\)/g), `the end row's outer pixels (${sel})`).toHaveLength(2);
    }
    for (const sel of lit.filter((s) => s.endsWith("::before"))) {
      expect(rows(declarations(CSS, sel)["--meter-full-rows"]), `a 6px bar lit to its top (${sel})`).toEqual([0, 1, 2].map(full));
    }
    const rounded = rules(CSS)
      .filter((r) => r.selectors.some((sel) => /\.meter-(clip|bar)\b|\.dyn-gr\b/.test(sel)) && /border-radius/.test(r.body))
      .flatMap((r) => r.selectors);
    expect(rounded, "no end is left to the browser's rounding").toEqual([]);
  });

  it("gives each kind of meter the corner shades measured on its own ground", () => {
    const tokens = declarations(TOKENS, ":root");
    const measured: Record<string, string> = {
      "--meter-end-outer": "#3a454a",
      "--meter-end-inner": "#293131",
      "--meter-lit-outer": "#31514a",
      "--meter-lit-inner": "#31ce7b",
      "--meter-wide-end-outer": "#212429",
      "--meter-wide-end-inner": "#424552",
      "--meter-wide-lit-outer": "#215d4a",
      "--meter-wide-lit-inner": "#31db7b",
      "--meter-wide-top-outer": "#526142",
      "--meter-wide-top-inner": "#deeb52",
      "--meter-card-end-outer": "#212021",
      "--meter-card-end-inner": "#000400",
      "--meter-card-lit-outer": "#213121",
      "--meter-card-lit-inner": "#29ca7b",
      "--meter-input-lit-outer": "#215942",
      "--meter-sunk-end-outer": "#293131",
      "--meter-sunk-lit-outer": "#21614a",
      "--meter-sunk-lit-side": "#216552",
      "--meter-sunk-lit-right": "#195542",
      "--meter-clip-lit": "#f73d3a",
      "--meter-clip-outer": "#7b1c19",
      "--meter-clip-inner": "#e63931",
      "--gain-reduction": "#ff8229",
      "--gain-reduction-outer": "#3a2d29",
      "--gain-reduction-inner": "#d67529",
      "--meter-level-outer": "#63825a",
      "--meter-level-inner": "#deeb52",
      "--meter-level-green-outer": "#217d6b",
      "--meter-level-green-inner": "#31db7b",
      "--meter-wide-level-outer": "#94b673",
      "--meter-wide-level-inner": "#eff34a",
      "--meter-wide-level-green-outer": "#31ae8c",
      "--meter-wide-level-green-inner": "#31e373",
      "--meter-input-level-outer": "#8ca663",
      "--meter-sunk-level-green-outer": "#29a684",
    };
    for (const [name, value] of Object.entries(measured)) expect(tokens[name], name).toBe(value);
    const kind = (sel: string): string[] =>
      ["--meter-ground", "--meter-end-outer", "--meter-lit-outer", "--meter-top-outer"].map((p) => declarations(CSS, sel)[p] ?? "");
    const wide = ["var(--lcd-bg)", "var(--meter-wide-end-outer)", "var(--meter-wide-lit-outer)", "var(--meter-wide-top-outer)"];
    for (const sel of [".dyn-io .meter", ".master-meter .meter", ".cv-onoff .meter"]) expect(kind(sel), sel).toEqual(wide);
    expect(kind(".input-meter .meter")).toEqual([
      declarations(CSS, ".input-panel")["background"],
      "var(--meter-card-end-outer)",
      "var(--meter-input-lit-outer)",
      "var(--meter-wide-top-outer)",
    ]);
    expect(kind(".osc-meter .meter")).toEqual([
      declarations(CSS, ".osc-output")["background"],
      "var(--meter-sunk-end-outer)",
      "var(--meter-sunk-lit-outer)",
      "var(--meter-wide-top-outer)",
    ]);
    expect(kind(".rec-slot-meter .meter").slice(1, 3)).toEqual(["var(--meter-card-end-outer)", "var(--meter-card-lit-outer)"]);
    const ends = (sel: string): string[] => ["--top-outer", "--top-inner", "--foot-outer", "--foot-inner"].map((p) => declarations(CSS, sel)[p] ?? "");
    const endShades = ["var(--meter-end-outer)", "var(--meter-end-inner)", "var(--meter-end-outer)", "var(--meter-end-inner)"];
    for (const sel of [".meter-bar", ".meter-clip"]) expect(ends(sel), `${sel}: the unlit ends turn in the panel's end shades`).toEqual(endShades);
    expect(declarations(CSS, ".dyn-gr i")["background"], "the reduction bar's own face").toContain("var(--gain-reduction)");
    const level = (sel: string): string[] =>
      ["--meter-level-outer", "--meter-level-inner", "--meter-level-green-outer", "--meter-level-green-inner"].map((p) => declarations(CSS, sel)[p] ?? "");
    const wideLevel = ["var(--meter-wide-level-outer)", "var(--meter-wide-level-inner)", "var(--meter-wide-level-green-outer)", "var(--meter-wide-level-green-inner)"];
    for (const sel of [".dyn-io .meter", ".master-meter .meter", ".cv-onoff .meter"]) expect(level(sel), sel).toEqual(wideLevel);
    expect(level(".input-meter .meter")).toEqual(["var(--meter-input-level-outer)", "var(--meter-wide-level-inner)", "var(--meter-input-level-green-outer)", "var(--meter-wide-level-green-inner)"]);
    expect(level(".osc-meter .meter")).toEqual(["var(--meter-sunk-level-outer)", "var(--meter-wide-level-inner)", "var(--meter-sunk-level-green-outer)", "var(--meter-wide-level-green-inner)"]);
    expect(level(".rec-slot-meter .meter"), "the level shades are the panel's").toEqual(["", "", "", ""]);
    for (const name of ["--meter-input-level-green-outer", "--meter-sunk-level-outer"]) expect(tokens[name], name).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("stands the pair beside CUE and ON as far apart as the pair on the rail, a row below CUE's top", () => {
    const beside = declarations(CSS, ".cv-onoff .meter");
    expect(beside["gap"]).toBe(declarations(CSS, ".master-meter .meter")["gap"]);
    expect(px(beside["margin-top"])).toBe(1);
  });
});

describe("a 6px meter", () => {
  it("leaves 3px between its clip dot and its bar", () => {
    for (const sel of [".dyn-io .meter-lane", ".master-meter .meter-lane", ".cv-onoff .meter-lane", ".input-meter .meter-lane", ".osc-meter .meter-lane"]) {
      expect(px(declarations(CSS, sel)["gap"]), sel).toBe(3);
    }
  });
});

describe("colours measured on single controls", () => {
  it("draws the USER DEFINED KNOBS toggle in a face and border of its own, apart from the bar", () => {
    const t = declarations(TOKENS, ":root");
    expect([t["--accent-udk"], t["--accent-udk-edge"], t["--accent-udk-toggle"], t["--accent-udk-toggle-edge"]]).toEqual([
      "#5a3984",
      "#ceaeef",
      "#633984",
      "#d6b2f7",
    ]);
    const on = declarations(CSS, ".udk-toggle.is-on");
    expect(on["background"]).toBe("var(--accent-udk-toggle)");
    expect(on["box-shadow"]).toContain("var(--accent-udk-toggle-edge)");
    expect(on["box-shadow"], "not the bar's border").not.toContain("var(--accent-udk-edge)");
  });

  it("greys the name of a control that cannot be used, a side tab included", () => {
    expect(declarations(TOKENS, ":root")["--text-disabled"]).toBe("#848284");
    expect(declarations(CSS, ".side-tab.is-disabled")["color"]).toBe("var(--text-disabled)");
  });

  it("underlines a lit language button with the lit toggle band", () => {
    expect(declarations(CSS, ".lang-btn.is-on")["box-shadow"]).toBe("inset 0 -3px 0 var(--toggle-band-lit)");
  });
});

describe("the type each control sets", () => {
  // The screen's default stays small, and each control the unit prints at
  // another size names its own.
  const SIZES: [string, string][] = [
    [".scene-no", "var(--fs-md)"],
    [".cv-gain-buttons .btn", "12px"],
    [".patch-cell .btn", "12.5px"],
    [".rec-slot-caption", "13px"],
    [".cue-label", "12.5px"],
    [".delay-caption", "13px"],
    [".sd-free", "12px"],
    [".sd-actions .btn", "12.5px"],
    [".toolbar-left .dropdown-box", "13px"],
    [".cv-caption", "13px"],
    [".dyn-io-caption", "13px"],
    [".list-cell", "13px"],
    [".value-box", "12.5px"],
    [".dt-caption", "13px"],
    [".section-band", "13.5px"],
    [".peripheral-group .btn", "13px"],
    [".ch-chip-id", "12.5px"],
    [".ch-chip-name", "12.5px"],
    [".btn.input-flag", "12px"],
    [".input-col-caption", "12px"],
    [".sendto-title", "12px"],
    [".sendto-name", "12px"],
    [".delay-cell-caption", "13px"],
    [".version-grid", "13px"],
    [".sd-list .list-cell", "var(--fs-md)"],
    [".sd-transport-meta", "var(--fs-md)"],
    [".sd-tracks", "12.5px"],
    [".dyn-caption", "12.5px"],
    [".sends-label", "15px"],
    [".cv-block-text", "15px"],
    [".setup-title-main", "14px"],
    [".setup-title-sub", "14px"],
    [".sendto-bal-caption", "14.5px"],
    [".mode-caption", "9px"],
    [".knob-cell-value", "14px"],
    [".osc-caption", "13px"],
    [".input-caption", "13px"],
  ];

  // Buttons: `.lcd button { font: inherit }` outranks a rule of one class.
  const BUTTONS: [string, string][] = [
    [".scene-actions .btn", "13px"],
    [".btn.rate-btn", "12px"],
    [".btn.follow-usb", "12px"],
    [".btn.osc-mode", "13px"],
    [".btn.dropdown-option", "12px"],
    [".btn.scene-bank", "13px"],
    [".btn.sends-option", "12px"],
    [".btn.mon-btn", "13px"],
    [".btn.mon-source", "13px"],
    [".btn.panbal-btn", "13px"],
    [".btn.udk-bank", "12px"],
    [".tools-screen > .btn", "13px"],
    [".btn.patch-default", "13px"],
  ];

  it("leaves the screen's own text at the small size", () => {
    expect(declarations(CSS, ".lcd")["font-size"]).toBe("var(--fs-md)");
  });

  it("prints each control at its own size", () => {
    for (const [selector, size] of [...SIZES, ...BUTTONS]) {
      expect(declarations(CSS, selector)["font-size"], selector).toBe(size);
    }
  });

  it("sizes a button with two classes, where the button reset cannot reach it", () => {
    expect(declarations(CSS, ".lcd button")["font"]).toBe("inherit");
    for (const [selector] of BUTTONS) {
      expect(selector.match(/\./g)?.length, selector).toBeGreaterThanOrEqual(2);
    }
    for (const selector of [".rate-btn", ".dropdown-option", ".mon-source", ".mon-btn"]) {
      expect(declarations(CSS, selector)["font-size"], `${selector} carries no size the reset overrides`).toBeUndefined();
    }
  });

  it("sets each name on the row and column the unit prints it at", () => {
    const MOVES: [string, string][] = [
      [".scene-no", "2px 1px"],
      [".sends-label", "0 -3px"],
      [".cue-label", "0px 1px"],
      [".cv-block-text", "0 9px"],
      [".ch-chip-name", "1px 0"],
      [".cv-param .cv-caption", "-1px 1px"],
      [".dt-caption", "1px -2px"],
      [".btn.sends-option", "0 -1px"],
      [".rec-slot-caption", "3px 2px"],
      [".delay-cell-caption", "-1px -2px"],
      [".delay-caption", "-1px -1px"],
      [".sendto-title", "8px 1px"],
      [".sends-target", "3px 2px"],
      [".sends-mark", "1px -2px"],
      [".bank-label", "0 1px"],
      [".strip-level .knob-graphic", "0 1px"],
      [".chs-mark .icon-rename", "-1px 0"],
      [".knob-cell-value", "-1px 0px"],
      [".osc-caption", "-3px 0px"],
      [".sendto-name", "8px 1px"],
      [".sendto-bal-caption", "-1px 0px"],
      [".mon-source", "-1px 0"],
      [".flag.is-phase svg", "0 1px"],
      [".sd-list .list-head .list-cell:nth-child(2)", "-1px 0"],
      [".sd-transport-meta", "0 1px"],
      [".sd-transport-meta span:last-child", "-1px 0"],
      [".scene-list .scene-no", "0 -1px"],
      [".scene-box-static .scene-title", "2px 0px"],
      [".scene-box-static .scene-no", "0 -1px"],
      [".scene-list .list-head .list-cell:last-child", "4px 0"],
    ];
    for (const [selector, move] of MOVES) {
      expect(declarations(CSS, selector)["translate"], selector).toBe(move);
    }
  });

  it("keeps the larger names inside their boxes", () => {
    // OUT sits against the screen's right edge, and Store / Recall centre in the
    // face above the band.
    expect(px(declarations(CSS, ".dyn-io-col:last-child .dyn-io-caption")["margin-right"])).toBe(2);
    expect(px(declarations(CSS, ".scene-actions .btn")["padding-bottom"])).toBe(8);
  });
});

describe("the name box in the middle of the toolbar", () => {
  it("stands 116px wide wherever it is, leaving 14px to the bar's right-hand group", () => {
    const base = declarations(CSS, ".badge.badge-title");
    expect([px(base["left"]), px(base["width"])]).toEqual([254, 116]);
    // The bar's right-hand group starts at x384, so a box from x254 ends 14px short of it.
    expect(254 + 116 + 14, "the gap the unit leaves").toBe(384);
    // No screen's box is a size or a place of its own, CH SETTING's longest name included:
    // its 112px of ink stands at x256..367 in p092-1, inside this box with 2px to spare.
    for (const kind of ["badge-gate", "badge-comp", "badge-eq", "badge-insfx", "badge-ducker", "badge-delay", "badge-input", "badge-setting"]) {
      const box = declarations(CSS, `.badge.badge-title.${kind}`);
      expect([box["width"], box["left"]], kind).toEqual([undefined, undefined]);
    }
  });

  it("sets GATE, COMP and DUCKER a row lower in the box than the other names", () => {
    expect(px(declarations(CSS, ".badge.badge-title")["padding-bottom"])).toBe(3);
    for (const kind of ["badge-gate", "badge-comp", "badge-ducker"]) {
      expect(px(declarations(CSS, `.badge.badge-title.${kind}`)["padding-bottom"]), kind).toBe(1);
    }
    for (const kind of ["badge-eq", "badge-insfx", "badge-delay"]) {
      expect(declarations(CSS, `.badge.badge-title.${kind}`)["padding-bottom"], kind).toBeUndefined();
    }
  });

  it("draws an unlit block's name on a grey of its own", () => {
    expect(declarations(CSS, ".badge.badge-title")["background"]).toBe("var(--badge-title-off)");
    expect(declarations(TOKENS, ":root")["--badge-title-off"]).toBe("#cecace");
  });

  it("turns the title badge's corners in the pixels the guide's figures carry", () => {
    const SEL = ".lcd .badge.badge-title:not(.badge-plain)";
    const base = declarations(CSS, SEL);
    expect([base["border-radius"], base["box-shadow"], base["--pt-ground"]]).toEqual([
      "0",
      "inset 0 -3px 0 var(--pt-band)",
      "var(--lcd-bg)",
    ]);
    expect([base["--pt-a1"], base["--pt-in"], base["--pt-d1"], base["--pt-band"]], "unlit, from p113-1").toEqual([
      "var(--corner-title-off-a1)",
      "var(--corner-title-off-in)",
      "var(--corner-title-off-d1)",
      "var(--badge-title-band-off)",
    ]);
    // The turn runs the same way down the side and up from the foot unless a figure has it otherwise.
    expect([base["--pt-b1"], base["--pt-e2"], base["--pt-fin"]]).toEqual(["var(--pt-a1)", "var(--pt-d2)", "var(--pt-d3)"]);
    expect(declarations(CSS, ".lcd .badge.badge-title.badge-comp.is-on")["--pt-b1"], "COMP turns darker down the side").toBe(
      "var(--corner-title-comp-b1)",
    );
    expect(declarations(CSS, ".lcd .badge.badge-title.badge-eq.is-on")["--pt-b3"]).toBe("var(--corner-title-eq-b3)");
    expect(declarations(CSS, ".lcd .badge.badge-title.badge-ducker.is-on")["--pt-band"], "DUCKER lights in GATE's orange").toBe(
      "var(--badge-title-band-gate)",
    );
    // Sunk, the row where the face meets the band is the badge's foot.
    expect([base["--pt-step"], base["--pt-step-a1"], base["--pt-step-in"]], "up, that row is the one pixel").toEqual([
      "var(--pt-e3)",
      "transparent",
      "transparent",
    ]);
    const sunk = declarations(CSS, `${SEL}.is-pressed`);
    expect([sunk["--pt-step"], sunk["--pt-step-a1"], sunk["--pt-step-in"]], "down, it turns in the head's shades").toEqual([
      "var(--pt-ground)",
      "var(--pt-a1)",
      "var(--pt-in)",
    ]);
    const map = declarations(CSS, `${SEL}::after`)["background"] ?? "";
    for (const layer of [
      "linear-gradient(var(--pt-in), var(--pt-in)) left 1px top 1px / 1px 1px no-repeat",
      "linear-gradient(var(--pt-fin), var(--pt-fin)) right 1px bottom 1px / 1px 1px no-repeat",
      "linear-gradient(var(--pt-step-b3), var(--pt-step-b3)) left 0px bottom 6px / 1px 1px no-repeat",
    ]) {
      expect(map, "the turn and the foot it takes once it is down").toContain(layer);
    }
    const root = declarations(TOKENS, ":root");
    expect([root["--corner-title-off-in"], root["--badge-title-band-off"], root["--corner-title-gate-a1"], root["--corner-title-eq-d2"]]).toEqual([
      "#c5c2c5",
      "#6b696b",
      "#291800",
      "#105529",
    ]);
    expect(declarations(TOKENS, ":root")["--badge-off"], "not the block buttons' grey").toBe("#d6ced6");
  });
});

describe("the OUTPUT channel-bank button", () => {
  it("stands on its own face over the band a lit button of that face carries", () => {
    const out = declarations(CSS, ".bank-output");
    expect(out["background"]).toBe("var(--accent-bank-out)");
    expect(out["box-shadow"]).toBe("inset 0 -3px 0 var(--accent-bank-out-bevel)");
    expect(declarations(TOKENS, ":root")["--accent-bank-out-bevel"]).toBe("#9c393a");
  });
});

describe("the card browser's path row and the carded list", () => {
  const path = declarations(CSS, ".sd-path");
  const up = declarations(CSS, ".sd-up");
  const field = declarations(CSS, ".sd-path-field");

  it("keeps the end of a path too long for the field in view", () => {
    // The guide's "Folder name display": a path that does not fit is shown from
    // its end. The line runs from the right, so the start is what is cut off,
    // while the path itself keeps its own order inside it.
    expect([field["direction"], field["text-align"], field["overflow"], field["white-space"]]).toEqual([
      "rtl",
      "left",
      "hidden",
      "nowrap",
    ]);
    const text = declarations(CSS, ".sd-path-field > span");
    expect([text["direction"], text["unicode-bidi"]]).toEqual(["ltr", "isolate"]);
  });

  it("sets the up arrow, a strip of the tray and the path field side by side", () => {
    // Screen columns, counted from the glass's left edge.
    const arrowLeft = px(main["left"]) + px(path["left"]);
    const gap = columnGap(path["gap"]);
    const fieldLeft = arrowLeft + px(up["width"]) + gap;
    expect(arrowLeft).toBe(6);
    expect(arrowLeft + px(up["width"]) - 1, "the arrow's last column").toBe(59);
    expect(gap).toBe(2);
    expect(fieldLeft).toBe(62);
    expect(fieldLeft + px((field["flex"] ?? "").trim().split(/\s+/)[2]) - 1, "the field's last column").toBe(285);

    // The strip is a painted band in the gap, the full height of the row.
    const strip = /^linear-gradient\((var\([^)]*\)),\s*(var\([^)]*\))\)\s+(\S+)\s+(\S+)\s*\/\s*(\S+)\s+(\S+)\s+no-repeat$/.exec(
      path["background"] ?? "",
    );
    expect(strip, "the row paints the strip").not.toBeNull();
    const [, from, to, left, top, width, height] = strip ?? [];
    expect([from, to]).toEqual(["var(--surface-sunken)", "var(--surface-sunken)"]);
    expect(declarations(TOKENS, ":root")["--surface-sunken"]).toBe("#31313a");
    expect(px(left), "it starts where the arrow ends").toBe(px(up["width"]));
    expect(px(width), "and fills the gap").toBe(gap);
    expect([px(top), height]).toEqual([0, "100%"]);
  });

  it("names the columns in the pale grey and writes a selected row in the face colour", () => {
    const tokens = declarations(TOKENS, ":root");
    expect(declarations(CSS, ".list-carded .list-head")["color"]).toBe("var(--dialog-sheet)");
    expect(tokens["--dialog-sheet"]).toBe("#bdbebd");
    const selected = declarations(CSS, ".list-carded .list-row.is-selected .list-cell");
    expect(selected["background"]).toBe("var(--accent-selected)");
    expect(selected["color"]).toBe("var(--surface)");
    expect(tokens["--surface"]).toBe("#4a515a");
  });
});

/** The four sides of a padding or margin shorthand, top first. */
function sides(value: string | undefined): [number, number, number, number] {
  const [t = 0, r = t, b = t, l = r] = (value ?? "0").trim().split(/\s+/).map(px);
  return [t, r, b, l];
}

/**
 * The first column or row a mark covers when its box and margins are centred in
 * the content box of the button it stands in.
 */
function markStart(start: number, size: number, padStart: number, padEnd: number, box: number, marginStart: number, marginEnd: number): number {
  return start + padStart + (size - padStart - padEnd - box - marginStart - marginEnd) / 2 + marginStart;
}

describe("RECORDER's card browser", () => {
  const tokens = declarations(TOKENS, ":root");
  const list = declarations(CSS, ".sd-list");
  const recList = declarations(CSS, ".rec-browser .sd-list");
  const actions = declarations(CSS, ".sd-actions");
  const slot = px(declarations(CSS, ".sd-actions .btn")["min-width"]);
  const pitch = slot + columnGap(actions["gap"]);
  /** The screen column the bottom row's box starts at, and the row it starts on. */
  const rowLeft = px(main["left"]) + px(actions["left"]);
  const rowTop = px(tokens["--lcd-h"]) - px(main["bottom"]) - px(actions["bottom"]) - px(actions["height"]);
  const columnsOf = (selector: string): number[] =>
    (declarations(CSS, selector)["grid-template-columns"] ?? "").trim().split(/\s+/).map(px);

  it("draws a narrower list with the bar beside it, and leaves SAVE/LOAD's list and bar where they were", () => {
    const pad = px((declarations(CSS, ".list-carded .list-body")["padding"] ?? "").trim().split(/\s+/)[1]);
    const cellGap = columnGap(declarations(CSS, ".list-carded .list-row")["gap"]);
    const span = (cells: number[]): number => cells.reduce((a, b) => a + b, 0) + (cells.length - 1) * cellGap + 2 * pad;
    const left = px(main["left"]) + px(list["left"]);
    const barWidth = px(declarations(CSS, ".scrollbar")["width"]);
    expect(left).toBe(4);

    expect(columnsOf(".rec-browser .sd-list .list-head")).toEqual([54, 223, 54]);
    expect(columnsOf(".rec-browser .sd-list .list-row")).toEqual([54, 223, 54]);
    expect(span(columnsOf(".rec-browser .sd-list .list-row")), "the cells fill the list").toBe(px(recList["width"]));
    expect(left + px(recList["width"]) - 1, "the list's last column").toBe(342);
    const recBar = px(main["left"]) + px(declarations(CSS, ".rec-browser .sd-scrollbar")["left"]);
    expect([recBar, recBar + barWidth - 1]).toEqual([361, 372]);

    expect(columnsOf(".sd-list .list-row")).toEqual([54, 223, 100]);
    expect(span(columnsOf(".sd-list .list-row"))).toBe(px(list["width"]));
    expect(left + px(list["width"]) - 1).toBe(388);
    const bar = px(main["left"]) + px(declarations(CSS, ".sd-scrollbar")["left"]);
    expect([bar, bar + barWidth - 1]).toEqual([396, 407]);
  });

  it("stands Play's transport where the Record tab stands its own, at the same size", () => {
    const record = declarations(CSS, ".rec-transport");
    const recordBtn = declarations(CSS, ".rec-transport .btn");
    const stop = declarations(CSS, ".sd-actions .btn.rec-stop");
    const pause = declarations(CSS, ".sd-actions .btn.rec-pause");
    expect(rowLeft + px(stop["left"]), "the Record tab's first column").toBe(px(main["left"]) + px(record["left"]));
    expect(rowLeft + px(stop["left"])).toBe(253);
    expect(px(pause["left"]) - px(stop["left"]), "a button and the Record tab's gap").toBe(
      px(recordBtn["width"]) + columnGap(record["gap"]),
    );
    expect(rowLeft + px(pause["left"])).toBe(303);
    for (const button of [stop, pause]) {
      expect([px(button["width"]), px(button["height"])]).toEqual([px(recordBtn["width"]), px(recordBtn["height"])]);
      expect(px(button["min-width"]), "not held to a slot's width").toBe(0);
      expect(rowTop + px(button["top"]), "the Record tab's first row").toBe(px(main["top"]) + px(record["top"]));
      expect([rowTop + px(button["top"]), rowTop + px(button["top"]) + px(button["height"]) - 1]).toEqual([231, 270]);
    }
    expect([px(stop["width"]), px(stop["height"])]).toEqual([46, 40]);
    expect(stop["background"], "on the Record tab's face").toBe(recordBtn["background"]);
  });

  it("sets Play's counter over a bar as long as the counter's line, on the Record tab's tray", () => {
    const transport = declarations(CSS, ".sd-transport");
    const meta = declarations(CSS, ".sd-transport-meta");
    const bar = declarations(CSS, ".sd-progress");
    const recordBar = declarations(CSS, ".rec-progress");
    const left = rowLeft + px(transport["left"]);
    expect([left, left + px(transport["width"]) - 1]).toEqual([63, 235]);
    const barTop = rowTop + px(transport["top"]) + px(meta["line-height"]) + columnGap(transport["gap"]);
    expect([barTop, barTop + px(bar["height"]) - 1]).toEqual([252, 263]);
    // With nothing held the line is empty, and still takes its height, so the bar stays put.
    expect(meta["min-height"]).toBe("1lh");
    expect([bar["height"], bar["border-radius"], bar["background"]]).toEqual([
      recordBar["height"],
      recordBar["border-radius"],
      recordBar["background"],
    ]);

    const played = declarations(CSS, ".sd-progress::before");
    expect(played["width"], "the played share, on whole pixels").toBe("round(var(--played, 0%), 1px)");
    expect([played["height"], played["border-radius"]]).toEqual(["100%", "0"]);
    expect(played["background"]).toBe("var(--progress-played-ends), var(--progress-played)");
    expect(tokens["--progress-played"]).toBe("#2196f7");
  });

  it("leaves the first slot of Edit's row empty and puts a usable button on the plain face", () => {
    const first = px(declarations(CSS, ".rec-browser .sd-action:first-child")["margin-left"]);
    expect(first, "one slot and its gap").toBe(pitch);
    expect([rowLeft + first, rowLeft + first + slot - 1]).toEqual([129, 218]);
    expect([rowLeft + first + pitch, rowLeft + first + pitch + slot - 1]).toEqual([253, 342]);

    expect(declarations(CSS, ".sd-action")["background"]).toBe("var(--surface)");
    expect(tokens["--surface"]).toBe("#4a515a");
    // A button takes the colour of what it stands in, which is the glass's white.
    expect(declarations(CSS, ".lcd button")["color"], "and a white mark").toBe("inherit");
    expect(declarations(CSS, ".lcd")["color"]).toBe("var(--text)");
    expect(declarations(CSS, ".btn.is-disabled")["background"], "out of reach it darkens").toBe("var(--surface-disabled)");
  });

  it("starts Play's row with the button to the file playing, at the transport's size", () => {
    const locate = declarations(CSS, ".sd-actions .btn.sd-locate");
    const stop = declarations(CSS, ".sd-actions .btn.rec-stop");
    const left = rowLeft + px(locate["left"]);
    expect([left, left + px(locate["width"]) - 1]).toEqual([4, 49]);
    expect([px(locate["top"]), px(locate["width"]), px(locate["height"])]).toEqual([px(stop["top"]), px(stop["width"]), px(stop["height"])]);
    expect(locate["background"], "on the transport's face").toBe(stop["background"]);
  });

  it("centres each mark of the path row and the button row in its button's face, where the unit draws it", () => {
    const btnPad = sides(declarations(CSS, ".btn")["padding"]);
    const place = (button: Record<string, string>, left: number, top: number, width: number, height: number, ...svgSelectors: string[]): number[][] => {
      const svg: Record<string, string> = Object.assign({}, ...svgSelectors.map((sel) => declarations(CSS, sel)));
      const margin = sides(svg["margin"]);
      if (svg["margin-top"]) margin[0] = px(svg["margin-top"]);
      if (svg["margin-bottom"]) margin[2] = px(svg["margin-bottom"]);
      const padBottom = button["padding-bottom"] ? px(button["padding-bottom"]) : btnPad[2];
      const [w, h] = [px(svg["width"]), px(svg["height"])];
      const x = markStart(left, width, btnPad[3], btnPad[1], w, margin[3], margin[1]);
      const y = markStart(top, height, btnPad[0], padBottom, h, margin[0], margin[2]);
      return [[x, x + w - 1], [y, y + h - 1]];
    };
    const transport = (cls: string): [Record<string, string>, number, number, number, number] => {
      const b = declarations(CSS, `.sd-actions .btn.${cls}`);
      return [b, rowLeft + px(b["left"]), rowTop + px(b["top"]), px(b["width"]), px(b["height"])];
    };
    expect(place(...transport("sd-locate"), ".sd-actions .sd-locate svg"), "the list and play mark").toEqual([[18, 36], [245, 259]]);
    expect(place(...transport("rec-stop"), ".sd-actions .rec-stop svg"), "stop").toEqual([[270, 281], [245, 256]]);
    expect(place(...transport("rec-pause"), ".sd-actions .rec-pause svg"), "pause").toEqual([[320, 331], [243, 256]]);

    const slotBtn = declarations(CSS, ".sd-actions .btn");
    const first = rowLeft + px(declarations(CSS, ".rec-browser .sd-action:first-child")["margin-left"]);
    const slotRow: [number, number, number] = [rowTop, px(slotBtn["min-width"]), px(actions["height"])];
    expect(place(slotBtn, first, ...slotRow, ".sd-action .icon-trash"), "Delete").toEqual([[166, 181], [240, 257]]);
    expect(place(slotBtn, first + pitch, ...slotRow, ".sd-action svg", ".sd-action .icon-rename"), "Rename").toEqual([[288, 307], [239, 258]]);

    const path = declarations(CSS, ".sd-path");
    const up = declarations(CSS, ".sd-up");
    const upLeft = px(main["left"]) + px(path["left"]);
    const upTop = px(main["top"]) + px(path["top"]);
    expect(place(up, upLeft, upTop, px(up["width"]), px(path["height"]), ".sd-up svg"), "the up arrow").toEqual([[26, 42], [63, 77]]);
    expect(declarations(CSS, ".btn.sd-up.is-disabled")["color"], "grey as a menu entry out of reach").toBe("var(--menu-text-disabled)");
    // The button that brings the cursor to the file held greys its mark the same way, on the plain face.
    expect(declarations(CSS, ".btn.sd-locate.is-disabled")).toEqual(declarations(CSS, ".btn.sd-up.is-disabled"));

    for (const selector of [".sd-up", ".sd-actions .btn.rec-stop", ".sd-action"]) {
      const d = declarations(CSS, selector);
      expect([d["display"], d["place-items"]], selector).toEqual(["grid", "center"]);
    }
  });

  it("centres a file's mark in its row's first cell, where the unit draws the audio mark and the speaker", () => {
    const list = declarations(CSS, ".sd-list");
    const body = sides(declarations(CSS, ".list-carded .list-body")["padding"]);
    const row = declarations(CSS, ".list-carded .list-row");
    const rowPitch = px(row["min-height"]) + px(declarations(CSS, ".list-carded .list-row + .list-row")["margin-top"]);
    const cellPad = sides(declarations(CSS, ".list-carded .list-row .list-cell:first-child")["padding"]);
    const cellLeft = px(main["left"]) + px(list["left"]) + body[3];
    const cellWidth = columnsOf(".rec-browser .sd-list .list-row")[0] ?? 0;
    const rowStart = (i: number): number =>
      px(main["top"]) + px(list["top"]) + px(declarations(CSS, ".list-carded .list-head")["height"]) + body[0] + i * rowPitch;
    const place = (i: number, selector: string): number[][] => {
      const d = declarations(CSS, selector);
      const [w, h] = [px(d["width"]), px(d["height"])];
      const x = markStart(cellLeft, cellWidth, cellPad[3], cellPad[1], w, 0, 0);
      const y = markStart(rowStart(i), px(row["min-height"]), cellPad[0], cellPad[2], h, 0, 0);
      return [[x, x + w - 1], [y, y + h - 1]];
    };
    expect(place(1, ".sd-icon .icon-audio"), "the second row's audio mark").toEqual([[25, 40], [156, 175]]);
    expect(place(2, ".sd-icon .icon-speaker"), "the third row's speaker").toEqual([[24, 41], [195, 212]]);
    expect(declarations(CSS, ".sd-icon")["place-items"]).toBe("center");
  });

  it("stands the OUT meter beside the bar, as the dynamics screens draw their OUT column", () => {
    const out = declarations(CSS, ".dyn-io.sd-out");
    const col = declarations(CSS, ".dyn-io-col");
    const caption = declarations(CSS, ".dyn-io-caption");
    const left = px(main["left"]) + px(out["left"]);
    expect([left, left + px(col["width"]) - 1], "the meter's columns").toEqual([391, 406]);
    const meterTop = px(main["top"]) + px(out["top"]) + px(caption["height"]) + columnGap(col["gap"]);
    expect([meterTop, meterTop + px(declarations(CSS, ".dyn-io .meter")["height"]) - 1], "its rows").toEqual([114, 221]);
    const barRight = px(main["left"]) + px(declarations(CSS, ".rec-browser .sd-scrollbar")["left"]) + px(declarations(CSS, ".scrollbar")["width"]) - 1;
    expect(left, "clear of the list's bar").toBeGreaterThan(barRight);
    expect(
      px(declarations(CSS, ".sd-out .dyn-io-col:last-child .dyn-io-caption")["margin-right"]),
      "the caption centred over the meter",
    ).toBe(0);
  });
});

describe("the card-eject button", () => {
  const eject = declarations(CSS, ".sd-eject");
  const tokens = declarations(TOKENS, ":root");

  it("stands on the plain face over a band, down to the row the icon row ends on, its mark over the face", () => {
    const top = px(eject["top"]);
    expect([top, top + px(eject["height"]) - 1]).toEqual([2, 41]);
    expect(eject["background"]).toBe("var(--surface)");
    expect(eject["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel)");
    expect([tokens["--surface"], tokens["--btn-bevel"]]).toEqual(["#4a515a", "#31393a"]);
    const pad = sides(eject["padding"]);
    const svg = declarations(CSS, ".sd-eject svg");
    const markTop = markStart(top, px(eject["height"]), pad[0], pad[2], px(svg["height"]), px(svg["margin-top"]), 0);
    expect([markTop, markTop + px(svg["height"]) - 1], "the card mark's rows").toEqual([12, 31]);
    expect([eject["display"], eject["place-items"]]).toEqual(["grid", "center"]);
  });

  it("darkens to the face, mark and band of a control out of reach, and takes no touch", () => {
    const off = declarations(CSS, ".sd-eject.is-disabled");
    expect([off["background"], off["color"], off["box-shadow"]]).toEqual([
      "var(--surface-disabled)",
      "var(--menu-text-disabled)",
      "inset 0 -3px 0 var(--btn-bevel-disabled)",
    ]);
    expect([tokens["--surface-disabled"], tokens["--menu-text-disabled"], tokens["--btn-bevel-disabled"]]).toEqual([
      "#212829",
      "#7b797b",
      "#191c19",
    ]);
    expect(off["pointer-events"]).toBe("none");
  });
});

describe("the bands and marks the card screens draw", () => {
  const root = declarations(TOKENS, ":root");
  const band = (selector: string): string | undefined => declarations(CSS, selector)["box-shadow"];

  it("stands a plain button on the unit's bevel, one that cannot be used on the darker bevel, and the up arrow on the bevel either way", () => {
    expect(declarations(CSS, ".btn")["background"]).toBe("var(--surface)");
    expect(band(".btn")).toBe("inset 0 -3px 0 var(--btn-bevel)");
    expect(band(".btn.is-disabled")).toBe("inset 0 -3px 0 var(--btn-bevel-disabled)");
    expect(band(".btn.sd-up.is-disabled")).toBe("inset 0 -3px 0 var(--btn-bevel)");
  });

  it("gives a source button on the sunk face, a plain button and a user defined knob's card bands of their own", () => {
    expect(band(".mon-source"), ".mon-source").toBe("inset 0 -3px 0 var(--btn-bevel-sunk)");
    // The record source is on the switch's list, which draws its band from --pb-band.
    expect(declarations(CSS, ".lcd .btn.rec-slot-src")["--pb-band"], ".rec-slot-src").toBe("var(--btn-bevel-sunk)");
    expect(band(".udk-knob"), ".udk-knob").toBe("inset 0 -3px 0 var(--btn-bevel-plain)");
    // [Follow USB] is on the switch's list, which draws its band from --pb-band.
    expect(declarations(CSS, ".lcd .btn.follow-usb")["--pb-band"], ".follow-usb").toBe("var(--btn-bevel-plain)");
    expect([root["--btn-bevel"], root["--btn-bevel-sunk"], root["--btn-bevel-plain"], root["--btn-bevel-disabled"]]).toEqual(["#31393a", "#42494a", "#3a3d42", "#191c19"]);
  });

  it("draws a selected row's marks a shade darker than its text, and a scene number in the text's colour", () => {
    expect(declarations(CSS, ".list-carded .list-row.is-selected .list-cell")["color"]).toBe("var(--surface)");
    expect(declarations(CSS, ".list-carded .list-row.is-selected .list-cell svg")["color"]).toBe("var(--list-selected-mark)");
    expect(root["--list-selected-mark"]).toBe("#3a3d3a");
    expect(declarations(CSS, ".list-carded .list-row.is-selected .scene-no")["color"]).toBe("inherit");
  });

  it("draws the transport's play in its own green, nudged right of and above the middle of the face", () => {
    expect(declarations(CSS, ".icon-transport-play")["color"]).toBe("var(--transport-play)");
    expect(root["--transport-play"]).toBe("#31eb73");
    expect(declarations(CSS, ".rec-transport .icon-transport-play")["margin"]).toBe("0 0 2px 2px");
  });

  it("stands Track Count at the toolbar buttons' height, its name near the left and its mark against the right", () => {
    const box = declarations(CSS, ".toolbar-left .dropdown-box");
    expect([box["margin-left"], box["height"], box["justify-content"], box["padding"]]).toEqual(["5px", "40px", "space-between", "0 9px 3px 22px"]);
    const mark = declarations(CSS, ".toolbar-left .dropdown-mark");
    expect([mark["font-size"], mark["border-left"], mark["border-right"], mark["border-top"]], "a 10x6 triangle").toEqual(["0", "5px solid transparent", "5px solid transparent", "6px solid currentColor"]);
  });

  it("sets a RECORDER slot's number in the regular weight", () => {
    expect(declarations(CSS, ".rec-slot-id")["font-weight"] ?? "400").toBe("400");
  });

  it("sets SCENE LIST's Title near the start of its column", () => {
    const title = declarations(CSS, ".scene-list .list-head .list-cell:nth-child(2)");
    expect([title["text-align"], title["padding-left"]]).toEqual(["left", "62px"]);
  });

  it("holds the recalled scene's mark out of the flow, so the number stands where every row sets it", () => {
    const mark = declarations(CSS, ".scene-no .icon-recalled");
    expect([mark["position"], mark["left"], mark["translate"]]).toEqual(["absolute", "-10px", "0 calc(1px - 50%)"]);
    expect(declarations(CSS, ".scene-no")["position"]).toBe("relative");
  });
});

describe("a button this simulator does not build", () => {
  it("takes the face, name and band of Operation Mode's unusable card, so it still reads as a button", () => {
    const card = declarations(CSS, ".mode-card.is-disabled");
    const auto = declarations(CSS, ".lcd .cv-gain-buttons .btn.is-disabled");
    expect(declarations(CSS, ".lcd .btn.input-flag.is-disabled"), "the INPUT one the same way").toEqual(auto);
    expect([auto["background"], auto["color"]]).toEqual([card["background"], card["color"]]);
    // The band comes through the corner map on these two, so it is named there;
    // a band lighter than the face would stop it reading as a button.
    expect(auto["--pb-band"]).toBe("var(--btn-bevel-disabled)");
    expect(card["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel-disabled)");
    // Its corner turns in the steps the measured unlit family turns in.
    expect(auto["--pb-a"]).toBe("color-mix(in srgb, var(--surface-disabled) 18%, var(--surface))");
    expect(auto["--pb-d"]).toBe("var(--surface)");
    // It takes the touch instead of letting it through: the cell behind [AUTO]
    // opens the INPUT screen, and `.btn.is-disabled` would hand the touch to it.
    expect(auto["pointer-events"]).toBe("auto");
    expect(declarations(CSS, ".btn.is-disabled")["pointer-events"], "which the shared rule turns off").toBe("none");
  });
});

describe("a send that is switched off, shown on HOME", () => {
  const root = declarations(TOKENS, ":root");
  /** The WCAG contrast ratio between two `#rrggbb` colours. */
  const contrast = (a: string, b: string): number => {
    const lum = (hex: string): number => {
      const ch = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
      const [r = 0, g = 0, bl = 0] = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
  };

  it("darkens the knob, the arc around it and the value, and keeps the value readable", () => {
    expect(declarations(CSS, ".strip-level.is-send-off .knob-face")["background"]).toBe("var(--send-off)");
    expect(declarations(CSS, ".strip-level.is-send-off .knob-arc-fill")["stroke"]).toBe("var(--send-off)");
    expect(declarations(CSS, ".strip-level.is-send-off .strip-level-value")["color"]).toBe("var(--send-off-ink)");

    // The value can still be set, so its ink carries 4.5:1 over the well it
    // stands in where the knob and the arc, which carry no words, need not.
    expect([root["--send-off"], root["--send-off-ink"]]).toEqual(["#5a6169", "#8c949c"]);
    expect(contrast(root["--send-off-ink"] ?? "", root["--surface-well"] ?? "")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("corners the unit draws a pixel at a time", () => {
  const root = declarations(TOKENS, ":root");
  const blocks = CSS.split("}")
    .map((b) => b.split("{"))
    .filter((p): p is [string, string] => p.length === 2)
    .map(([sel, body]) => ({ sel: sel.replace(/\s+/g, " ").trim(), body }));
  type Cell = { v: string; side: string; x: number; edge: string; y: number; w: number };
  const cellsOf = (text: string): Cell[] =>
    [...text.matchAll(/linear-gradient\(var\((--[\w-]+)\), var\(\1\)\) (left|right) (\d+)px (top|bottom) (\d+)px \/ (\d+)px 1px no-repeat/g)].map((m) => ({
      v: m[1] ?? "", side: m[2] ?? "", x: Number(m[3]), edge: m[4] ?? "", y: Number(m[5]), w: Number(m[6]),
    }));
  const corner = (cells: Cell[], side: string, edge: string): string[] =>
    cells.filter((c) => c.side === side && c.edge === edge).map((c) => `${c.x},${c.y},${c.w},${c.v.replace("--px-", "")}`);
  const layered = (marker: string): { sel: string; body: string } | undefined => blocks.find((b) => b.sel.endsWith("::after") && b.body.includes(marker));

  it("cuts a radius of 4 out of the button rather than painting it, so the corner reads on any ground", () => {
    // Each corner takes away three pixels outright and lets the ground through
    // two more. Nothing is painted there, so a light face gets no dark rim and a
    // sunk button shows no colour of its own at the corners.
    const base = blocks.find((b) => b.body.includes("--px-mask-left:"));
    const mask = (name: string): string[] =>
      [...(base?.body ?? "").matchAll(new RegExp(`--px-mask-${name}:([^;]*);`, "gs"))]
        .flatMap((m) => (m[1] ?? "").split("no-repeat"))
        .map((layer) => {
          const cut = /rgb\(0 0 0 \/ var\(--px-cut-(out|in)\)\)/.exec(layer)?.[1] ?? (/#000, #000/.test(layer) ? "all" : "");
          const at = /(left|right) (\d+)px (top|bottom) ([^/]+)\/ (\d+)px/.exec(layer);
          return at ? `${at[2]},${at[3]} ${(at[4] ?? "").trim()},${at[5]},${cut}` : "";
        })
        .filter(Boolean);
    for (const side of ["left", "right"]) {
      expect(mask(side), side).toEqual([
        "0,top 0px,2,all",
        "0,top 1px,1,all",
        "2,top 0px,1,out",
        "1,top 1px,1,in",
        "0,top 2px,1,out",
        "0,bottom var(--px-foot-off),2,all",
        "0,bottom calc(var(--px-foot-off) + 1px),1,all",
        "2,bottom var(--px-foot-off),1,out",
        "1,bottom calc(var(--px-foot-off) + 1px),1,in",
        "0,bottom calc(var(--px-foot-off) + 2px),1,out",
      ]);
    }
    const rule = blocks.find((b) => b.body.includes("mask: var(--px-mask-left), var(--px-mask-right)"));
    expect(/mask-composite:\s*exclude;/.test(rule?.body ?? ""), "the layers are taken out of the whole box").toBe(true);
    expect(/linear-gradient\(#000, #000\);/.test(rule?.body ?? ""), "which is the layer under them").toBe(true);
    const curve = blocks.find((b) => b.sel.startsWith(":is(") && b.sel.includes(".menu-btn") && /border-radius:\s*0;/.test(b.body));
    expect(curve?.sel.replace(/^:is\(/, ":where("), "the same boxes lose the curve and gain the cut").toBe(rule?.sel);
  });

  it("steps the band's own corner inside the button, in casts of whatever face it has", () => {
    const rule = blocks.find((b) => b.sel.endsWith("::after") && b.sel.includes(".menu-btn"));
    const base = blocks.find((b) => b.body.includes("--px-left:"));
    const step = (side: string): string[] =>
      [...(base?.body ?? "").matchAll(new RegExp(`--px-${side}:([^;]*);`, "gs"))]
        .flatMap((m) => (m[1] ?? "").split("no-repeat"))
        .map((layer) => {
          const a = /rgb\(0 0 0 \/ (?:calc\(var\(--px-band-cast\) \* ([\d.]+)\)|var\(--px-band-cast\))\)/.exec(layer);
          const at = /(left|right) (\d+)px bottom (\d+)px \/ (\d+)px/.exec(layer);
          return at ? `${at[2]},${at[3]},${at[4]},${a?.[1] ?? "1"}` : "";
        })
        .filter(Boolean);
    for (const side of ["left", "right"]) {
      expect(step(side), side).toEqual(["0,3,2,1", "2,3,1,0.62", "0,4,1,1", "1,4,1,0.94", "0,5,1,0.62"]);
    }
    expect(rule?.body.match(/background:\s*([^;]*);/)?.[1], "the pseudo-element paints both sides").toBe("var(--px-left), var(--px-right)");
  });

  it("takes the corner and the band from three ratios rather than a colour for every face", () => {
    // The outer pixel of a corner shows this much of what stands behind the
    // button, the one inside it this much, and a band is the face taken down by
    // this much (measured: a face of 74,81,90 bands at 49,57,58 and one of
    // 132,223,255 at 90,158,181).
    expect([root["--px-cut-out"], root["--px-cut-in"], root["--px-band-cast"]]).toEqual(["40%", "8%", "31%"]);
    expect(root["--px-foot-off"], "the cut at the foot stands at the bottom edge until a press moves it").toBe("0px");
    expect(declarations(CSS, ".lcd .is-pressed")["--px-foot-off"], "and follows the sunk face down").toBe("var(--press)");
  });

  it("draws the switches' radius of 3 as three shades over four rows, in the same two places at the foot", () => {
    const rule = layered("var(--px-foot-c)");
    const cells = cellsOf(rule?.body ?? "");
    for (const side of ["left", "right"]) {
      expect(corner(cells, side, "top"), `${side} top`).toEqual(["0,0,1,ground", "1,0,1,a", "2,0,1,b", "3,0,1,c", "0,1,1,a", "1,1,1,c", "0,2,1,b", "0,3,1,c"]);
      expect(corner(cells, side, "bottom"), `${side} bottom`).toEqual(["0,0,1,ground", "1,0,1,foot-a", "2,0,1,foot-b", "3,0,1,foot-c", "0,1,1,foot-a", "1,1,1,foot-c", "0,2,1,foot-b", "0,3,1,foot-c", "0,4,1,band", "1,4,1,band-a", "2,4,1,band-b", "3,4,1,band-c", "0,5,1,band-a", "1,5,1,band-c", "0,6,1,band-b", "0,7,1,band-c"]);
    }
    expect(rule?.sel).toBe(":where(.btn.btn-switch)::after");
  });

  it("takes each set of shades from the guide's pixels", () => {
    const expected: Record<string, string> = {
      "--corner-switch-a": "#73757b",
      "--corner-switch-b": "#b5b6b5",
      "--corner-switch-c": "#cecece",
      "--corner-switch-band": "#9c969c",
      "--corner-switch-band-a": "#a5a2a5",
      "--corner-switch-band-b": "#c5bec5",
      "--corner-switch-band-c": "#cecece",
      "--corner-switch-foot-a": "#525d63",
      "--corner-switch-foot-b": "#7b7d84",
      "--corner-switch-foot-c": "#949294",
      "--corner-switch-glass-a": "#424142",
      "--corner-switch-glass-b": "#adaead",
      "--corner-switch-glass-c": "#cecece",
      "--corner-switch-glass-foot-a": "#191c19",
      "--corner-switch-glass-foot-b": "#6b656b",
      "--corner-switch-glass-foot-c": "#948e94",
      "--corner-switch-lit-a": "#52798c",
      "--corner-switch-lit-b": "#73c6e6",
      "--corner-switch-lit-c": "#84dfff",
      "--corner-switch-lit-band-a": "#6bb2ce",
      "--corner-switch-lit-band-b": "#7bceef",
      "--corner-switch-lit-band-c": "#84dfff",
      "--corner-switch-lit-foot-a": "#4a5d6b",
      "--corner-switch-lit-foot-b": "#5a8a9c",
      "--corner-switch-lit-foot-c": "#63a2b5",
      "--corner-switch-lit-glass-a": "#294952",
      "--corner-switch-lit-glass-b": "#6bbede",
      "--corner-switch-lit-glass-c": "#84dfff",
      "--corner-switch-lit-glass-foot-a": "#101c21",
      "--corner-switch-lit-glass-foot-b": "#42717b",
      "--corner-switch-lit-glass-foot-c": "#639eb5",
      "--corner-track-dark": "#101010",
      "--corner-track-mid": "#212429",
      "--corner-played-dark": "#101819",
      "--corner-played-mid": "#21557b",
      "--corner-played-inner": "#215d94",
      "--corner-played-end-light": "#2179c5",
      "--corner-played-end-dark": "#29557b",
      "--corner-played-end-inner": "#2182ce",
      "--corner-played-end-track": "#293542",
    };
    for (const [name, value] of Object.entries(expected)) expect(root[name], name).toBe(value);
  });

  it("changes the shades with the ground a button stands on and the state it is in", () => {
    expect(declarations(CSS, ".source-btn")["--px-ground"]).toBe("var(--dialog-sheet)");
    expect(declarations(CSS, ".setup-general .menu-btn")["--px-ground"]).toBe("var(--menu-tray)");
    expect(declarations(CSS, ".cv-onoff .btn-switch")["--px-ground"]).toBe("var(--lcd-bg)");
    expect(declarations(CSS, ".btn.btn-switch.is-on")["--px-band"]).toBe("var(--switch-band-lit)");
    expect(declarations(CSS, ".menu-btn.is-disabled")["box-shadow"]).toBe("inset 0 -3px 0 var(--btn-bevel-disabled)");
    expect(declarations(CSS, ".lang-btn.is-on")["box-shadow"]).toBe("inset 0 -3px 0 var(--toggle-band-lit)");
    expect(declarations(CSS, ".udk-knob")["box-shadow"], "a knob card on its own band").toBe("inset 0 -3px 0 var(--btn-bevel-plain)");
  });

  it("names the band's corner colour on the switches alone, the one control that draws it", () => {
    // `--px-band` colours the corner pixels of [ON] / [CUE] / [PRE]; every other
    // button turns its band's corner on a share of black over its own face.
    const stray = styleRules(CSS)
      .filter((rule) => rule.body["--px-band"] !== undefined)
      .flatMap((rule) => rule.selectors)
      .filter((s) => !s.includes("btn-switch") && !s.includes(".is-pressed"));
    expect(stray).toEqual([]);
  });

  it("stands the TOOLS button 7px in and 3px down from the corner of the main area", () => {
    expect(declarations(CSS, ".tools-screen > .btn")["margin"]).toBe("3px 0 0 7px");
  });

  it("lays OSCILLATOR's Assign out as the guide's figure has it", () => {
    // 90x40 boxes, four columns from glass x16 at a 98px pitch, rows at glass y57
    // and y155, [Clear All] under the last column at glass x310 / y225 (p071-1).
    // The main area starts at glass x2 / y50, so the grid's origin is 14 / 7 and
    // [Clear All] stands 294 / 168 inside it.
    const grid = declarations(CSS, ".osc-assign");
    expect([grid["position"], px(grid["left"]), px(grid["top"])]).toEqual(["absolute", 14, 7]);
    expect(grid["grid-template-columns"]).toBe("repeat(4, 90px)");
    expect([px(grid["column-gap"]), px(grid["row-gap"])]).toEqual([8, 58]);
    const target = declarations(CSS, ".osc-target");
    expect([px(target["width"]), px(target["height"]), target["background"]]).toEqual([90, 40, "var(--surface)"]);
    const clear = declarations(CSS, ".osc-clear");
    expect([clear["position"], px(clear["left"]), px(clear["top"]), px(clear["width"]), px(clear["height"])]).toEqual([
      "absolute",
      294,
      168,
      90,
      40,
    ]);
    const lit = declarations(CSS, ".lcd .osc-target.is-on");
    // The lit face and band are the red the OUTPUT bank button already carries.
    expect([lit["background"], lit["box-shadow"]]).toEqual(["var(--accent-bank-out)", "inset 0 -3px 0 var(--accent-bank-out-bevel)"]);
    const root = declarations(TOKENS, ":root");
    expect([root["--accent-bank-out"], root["--accent-bank-out-bevel"]]).toEqual(["#de5152", "#9c393a"]);
    // MIX and FX light in the colours HOME's [Sends] tab takes for them (URX44V, 2026-09-22).
    expect(declarations(CSS, ".lcd .osc-target.osc-mix.is-on")["background"]).toBe("var(--accent-sends-mix)");
    expect(declarations(CSS, ".lcd .osc-target.osc-fx.is-on")["background"]).toBe("var(--accent-sends-fx)");
    for (const bus of ["mix", "fx"]) {
      expect(declarations(CSS, `.lcd .osc-target.osc-${bus}.is-on`)["box-shadow"], `${bus} over the Sends tab's band`).toBe(
        declarations(CSS, ".sends-option.is-on")["box-shadow"],
      );
    }
  });

  it("rounds a joined row of buttons at its two ends only", () => {
    expect(declarations(CSS, ".udk-bank::after")["background"]).toBe("none");
    expect(declarations(CSS, ".rate-btn::after")["background"]).toBe("none");
    expect(declarations(CSS, ".udk-caption + .udk-bank::after")["background"], "the first bank").toBe("var(--px-left)");
    expect(declarations(CSS, ".rate-btn:first-child::after")["background"], "the first frequency").toBe("var(--px-left)");
    expect(declarations(CSS, ".udk-bank:last-child::after")["background"], "the last bank").toBe("var(--px-right)");
    expect(
      [".scene-bank::after", ".scene-bank:first-child::after", ".scene-bank:last-child::after"].map((s) => declarations(CSS, s)["background"]),
      "SCENE LIST's Standard and Simple join into one row",
    ).toEqual(["none", "var(--px-left)", "var(--px-right)"]);
    expect(declarations(CSS, ".rate-btn:last-child::after")["background"], "the last frequency").toBe("var(--px-right)");
    expect(
      [".osc-mode::after", ".osc-mode:first-child::after", ".osc-mode:last-child::after"].map((s) => declarations(CSS, s)["background"]),
      "OSCILLATOR's three modes join into one row (p070-1)",
    ).toEqual(["none", "var(--px-left)", "var(--px-right)"]);
  });

  it("ends RECORDER's progress bars and their played part in half-rounds drawn a pixel at a time", () => {
    const vars = declarations(CSS, ".sd-progress");
    const rows = (cells: Cell[], side: string): number[] => [...new Set(cells.filter((c) => c.side === side).map((c) => c.y))].sort((a, b) => a - b);
    const at = (cells: Cell[], side: string, y: number): string[] => cells.filter((c) => c.side === side && c.y === y).map((c) => `${c.x},${c.w},${c.v}`);
    const track = cellsOf(vars["--progress-ends"] ?? "");
    for (const side of ["left", "right"]) {
      expect(rows(track, side), `${side}: the two middle rows run to the edge`).toEqual([0, 1, 2, 3, 4, 7, 8, 9, 10, 11]);
      for (let y = 0; y < 6; y++) expect(at(track, side, 11 - y), `${side} row ${y} and its mirror`).toEqual(at(track, side, y));
    }
    expect(at(track, "left", 0)).toEqual(["0,3,--lcd-bg", "3,1,--corner-track-dark", "4,1,--corner-track-mid"]);
    expect(at(track, "right", 0)).toEqual(at(track, "left", 0));
    const played = cellsOf(vars["--progress-played-ends"] ?? "");
    expect(new Set(played.filter((c) => c.side === "left").map((c) => c.v)), "over the glass").toEqual(new Set(["--lcd-bg", "--corner-played-dark", "--corner-played-mid", "--corner-played-inner"]));
    expect(new Set(played.filter((c) => c.side === "right").map((c) => c.v)), "over the tray").toEqual(
      new Set(["--surface-sunken", "--corner-played-end-light", "--corner-played-end-dark", "--corner-played-end-inner", "--corner-played-end-track"]),
    );
  });
});

describe("the parts measured against the guide's figures", () => {
  it("stands the VERSION rows and columns where the unit prints them", () => {
    expect([0, 1].map((r) => px(declarations(CSS, `.version-row-${r}`)["top"]))).toEqual([20, 56]);
    expect(px(declarations(CSS, ".version-entry")["left"])).toBe(26);
    expect([".version-colon", ".version-value"].map((s) => px(declarations(CSS, s)["left"]))).toEqual([95, 101]);
    expect(declarations(CSS, ".version-key")["font-weight"], "the names are no heavier than the values").toBeUndefined();
  });

  it("leads a whole-screen menu's names 18px apart and lifts a one-line name a pixel", () => {
    expect(px(declarations(CSS, ".menu-grid .menu-btn")["line-height"])).toBe(18);
    const one = declarations(CSS, ".menu-grid .menu-btn.is-one-line > span");
    expect([one["position"], px(one["top"])]).toEqual(["relative", -1]);
  });

  it("starts Operation Mode's cards from the top and gives the chosen one a thinner band", () => {
    const card = declarations(CSS, ".mode-card");
    expect(card["justify-content"]).toBe("flex-start");
    expect(px((card["padding"] ?? "").split(/\s+/)[0])).toBe(9);
    const chosen = declarations(CSS, ".mode-card.is-on");
    expect([px(chosen["min-height"]), chosen["box-shadow"]]).toEqual([84, "inset 0 -2px 0 var(--btn-bevel)"]);
    expect(declarations(CSS, ".mode-caption")["color"]).toBe("var(--caption-pale)");
    expect(declarations(CSS, ".mode-value")["font-weight"]).toBe("400");
  });

  it("stacks a knob assignment's lines from the top of its card", () => {
    const knob = declarations(CSS, ".udk-knob");
    expect(knob["place-items"]).toBe("start center");
    expect(px((knob["padding"] ?? "").split(/\s+/)[0])).toBe(20);
    expect(declarations(CSS, ".udk-caption")["color"]).toBe("var(--dialog-sheet)");
  });

  it("prints the readout bar's labels a step heavier on a band that keeps its rows", () => {
    const label = declarations(CSS, ".knob-cell-label");
    expect(label["font-weight"]).toBe("500");
    expect(px(label["line-height"]) + px((label["padding"] ?? "").split(/\s+/)[0])).toBe(px(label["min-height"]));
  });

  it("gives HOME's rotary a face of its own", () => {
    expect(declarations(CSS, ".strip-level .knob-face")["background"]).toBe("#b5bece");
    expect(declarations(CSS, ".knob-face")["background"], "the knobs on the other screens").toBe("#bdc2d6");
  });

  it("draws the destination sheet's unlit buttons on the plain face and the lit one on a cast of its own", () => {
    expect(declarations(CSS, ".sends-option")["background"]).toBe("var(--surface)");
    // The band follows the face rather than naming one colour, so the three
    // destinations each band in their own (p051-1's red 206,69,41 over 140,49,25
    // and p157-1's orange 230,109,0 over 165,77,0 are both the face at 0.69).
    expect(declarations(CSS, ".sends-stereo.is-on")["box-shadow"]).toBe("inset 0 -3px 0 rgb(0 0 0 / var(--px-band-cast))");
    expect(declarations(CSS, ".sends-btn")["box-shadow"], "the tab the same way").toBe("inset 0 -3px 0 rgb(0 0 0 / var(--px-band-cast))");
  });

  it("turns the [Sends] tab at its left end alone, since its right runs into the frame", () => {
    expect(declarations(CSS, ".sends-btn::after")["background"], "the band's step").toBe("var(--px-left)");
    const cut = declarations(CSS, ".sends-btn");
    expect([cut["mask"], cut["mask-composite"]], "and the cut with it").toEqual([
      "var(--px-mask-left), linear-gradient(#000, #000)",
      "exclude",
    ]);
  });

  it("marks CH SETTING's fields in their own grey", () => {
    expect(declarations(CSS, ".chs-mark")["color"]).toBe("var(--field-mark)");
    const root = declarations(TOKENS, ":root");
    expect([root["--field-mark"], root["--accent-bank-cell"], root["--caption-pale"]]).toEqual(["#848a8c", "#318221", "#cecace"]);
  });

  it("sets SCENE LIST's Store and Recall 40 rows tall with their names on the rows they were", () => {
    const btn = declarations(CSS, ".scene-actions .btn");
    expect([px(btn["height"]), px(btn["padding-top"])]).toEqual([40, 5]);
    expect(px(declarations(CSS, ".scene-actions")["top"])).toBe(179);
  });
});

describe("the channel, monitor and microSD parts measured against the guide's figures", () => {
  it("runs a knob's pointer out towards its rim", () => {
    const pointer = declarations(CSS, ".knob-pointer::after");
    expect([pointer["top"], pointer["height"]]).toEqual(["8%", "37%"]);
  });

  it("marks the top of a centred knob's travel with a 3x3 cross", () => {
    const mark = declarations(CSS, ".knob-centre-mark");
    expect([px(mark["width"]), px(mark["height"]), px(mark["top"])]).toEqual([3, 3, 0]);
  });

  it("stands MONITOR's rotary a pixel lower than its value box", () => {
    expect(px(declarations(CSS, ".mon-level")["top"])).toBe(177);
    expect(px(declarations(CSS, ".mon-level .value-box")["top"])).toBe(0);
  });

  it("colours what the guide colours", () => {
    expect(declarations(CSS, ".osc-caption")["color"]).toBe("var(--dialog-sheet)");
    const usb = declarations(CSS, ".btn.usb-storage.is-on");
    expect([usb["color"], usb["box-shadow"]]).toEqual(["var(--ink-on-lit)", "inset 0 -3px 0 var(--toggle-band-lit)"]);
    expect(declarations(CSS, ".udk-knob-copy")["color"]).toBe("var(--knob-card-mark)");
    expect(declarations(CSS, ".cv-level .knob-face")["background"]).toBe("#b5bece");
    expect(declarations(CSS, ".eq-thumb")["color"]).toBe("var(--eq-thumb-line)");
    expect(declarations(CSS, ".eq-curve-line")["stroke"]).toBe("var(--eq-line)");
    expect(declarations(CSS, ".dyn-handle-arrow")).toEqual({ fill: "var(--handle-arrow)", visibility: "hidden" });
    expect(declarations(CSS, ".dyn-grid-lit .dyn-grid")["stroke"]).toBe("var(--graph-grid-lit)");
    expect(declarations(CSS, ".input-col .knob-arc-track")["stroke"]).toBe("var(--meter-track-input)");
    const root = declarations(TOKENS, ":root");
    expect([root["--knob-card-mark"], root["--ink-on-lit"], root["--test-pass"], root["--graph-grid-lit"], root["--handle-arrow"], root["--eq-line"], root["--eq-thumb-line"]]).toEqual([
      "#adaead", "#3a3d3a", "#01ff00", "#63695a", "#ce0484", "#6baa4a", "#7bba63",
    ]);
  });

  it("sets the channel chip's name in the regular weight and SEND TO on one line", () => {
    expect(declarations(CSS, ".ch-chip-id")["font-weight"]).toBe("400");
    const send = declarations(CSS, ".cv-sendto");
    expect([send["white-space"], send["padding"]]).toEqual(["nowrap", "0 8px 3px 7px"]);
    expect(declarations(CSS, ".dyn-set-caption")["font-weight"], "the dynamics captions are not bold").toBeUndefined();
  });

  it("marks the band TOUCH AND TURN holds with a triangle either side, 6x8", () => {
    for (const [side, edge] of [["::before", "border-right"], ["::after", "border-left"]] as const) {
      const mark = declarations(CSS, `.eq-grip.is-held${side}`);
      expect(mark[edge], side).toBe("6px solid var(--accent-focus)");
    }
    expect(px(declarations(CSS, ".eq-grip.is-held::before")["border-top"])).toBe(4);
    // A 32px ring with a 3px border: an 8px mark 9px down the inside stands level with its middle.
    const ring = px(/^(\d+)px/.exec(declarations(CSS, ".eq-grip")["width"] ?? "")?.[0]);
    const border = px(/^(\d+)px/.exec(declarations(CSS, ".eq-grip")["border"] ?? "")?.[0]);
    const top = px(declarations(CSS, ".eq-grip.is-held::before")["top"]);
    expect(border + top + 4, "the mark's middle on the ring's middle").toBe(ring / 2);
    const name = declarations(CSS, ".eq-plot > .eq-grip");
    expect([name["padding"], name["font-size"]], "the name centred on the ring at p106-1's size").toEqual(["0", "13.5px"]);
  });

  it("draws EQ's shape box as a pill with the shape's outline in it", () => {
    const box = declarations(CSS, ".eq-screen > .pulldown");
    expect([px(box["width"]), px(box["height"]), px(box["border-radius"]), px(box["padding-left"]), px(box["padding-right"])]).toEqual([94, 38, 19, 26, 11]);
    expect([box["border"], box["background"], box["box-shadow"]]).toEqual(["1px solid var(--shape-box-edge)", "var(--shape-box)", "none"]);
    expect(declarations(CSS, ".eq-screen > .pulldown .pulldown-mark")["translate"]).toBe("0 2px");
    const glyph = declarations(CSS, ".icon-eq-shape");
    expect([px(glyph["width"]), px(glyph["height"])]).toEqual([30, 20]);
  });

  it("sets the side tabs' names and gaps where the guide has them on each screen", () => {
    expect(declarations(CSS, ".side-tab.is-name-raised .side-tab-label")["translate"]).toBe("0 -3px");
    expect(declarations(CSS, ".side-tab.is-name-lifted .side-tab-label")["translate"]).toBe("0 -1px");
    expect(px(declarations(CSS, ".side-tab.is-name-close .side-tab-label")["line-height"])).toBe(12);
    const apart = declarations(CSS, ".side-tab.is-name-apart .side-tab-label");
    expect([px(apart["line-height"]), apart["translate"]]).toEqual([16, "0 -3px"]);
    expect(px(declarations(CSS, ".patch-tab + .patch-tab")["margin-top"])).toBe(3);
    const sendto = declarations(CSS, ".sendto-tab .side-tab-label");
    expect([px(sendto["line-height"]), sendto["translate"]]).toEqual([21, "0 -1px"]);
    expect(declarations(CSS, ".sendto-tab.side-tab-wrapped .side-tab-label")["translate"]).toBe("0 -2px");
    expect(declarations(CSS, ".side-tab-icon .icon-clipboard")["translate"]).toBe("0 -1px");
  });

  it("sets the list marks, the list boxes and the dynamics parts where the guide has them", () => {
    const mark = declarations(CSS, ".pulldown-mark");
    expect([px(mark["width"]), px(mark["height"]), mark["clip-path"]]).toEqual([9, 8, "polygon(0 0, 100% 0, 56% 100%, 44% 100%)"]);
    const rate = declarations(CSS, ".delay-rate .pulldown-mark");
    expect([px(rate["height"]), rate["background"]]).toEqual([6, "var(--drop-mark)"]);
    const flat = declarations(CSS, ".integration-screen .pulldown-mark");
    expect([px(flat["width"]), px(flat["height"])]).toEqual([10, 6]);
    expect(declarations(CSS, ".dt-screen .pulldown-mark")["background"]).toBe("var(--drop-mark)");
    const integration = declarations(CSS, ".integration-screen .pulldown");
    expect([px(integration["min-height"]), px(integration["padding-left"]), px(integration["padding-right"])]).toEqual([40, 16, 11]);
    expect(px(declarations(CSS, ".integration-screen .dt-row + .dt-row")["margin-top"])).toBe(-4);
    expect(declarations(CSS, ".dt-screen .pulldown")["box-shadow"]).toBe("inset 0 -4px 0 var(--btn-bevel)");
    expect([".dt-format:first-child .pulldown", ".dt-format:last-child .pulldown"].map((s) => px(declarations(CSS, s)["padding-right"]))).toEqual([12, 13]);
    const formats = declarations(CSS, ".dt-formats");
    expect([px(formats["margin-left"]), px(formats["gap"])]).toEqual([1, 15]);
    expect(px(declarations(CSS, ".dyn-row.dyn-row-knee .pulldown")["padding-right"])).toBe(10);
    const oneKnobName = declarations(CSS, ".lcd .oneknob > span:not(.oneknob-mark)");
    expect([oneKnobName["font-size"], oneKnobName["font-weight"], oneKnobName["translate"]]).toEqual(["14.5px", "600", "-3px 2px"]);
    expect(declarations(CSS, ".lcd .oneknob")["--pb-band"], "the band comes from the switch's list").toBe("var(--oneknob-band)");
    expect(declarations(CSS, ".delay-cell .value-box")["margin"]).toBe("-3px 0 3px");
    expect(px(declarations(CSS, ".strip-labels")["margin-right"])).toBe(-1);
    expect([declarations(CSS, ".eq-thumb-edge")["stroke"], declarations(CSS, ".eq-thumb-core")["stroke"]]).toEqual(["var(--eq-line)", "currentColor"]);
    const root = declarations(TOKENS, ":root");
    expect([root["--shape-box"], root["--shape-box-edge"], root["--oneknob-band"]]).toEqual(["#212421", "#636973", "#3a3942"]);
  });

  it("draws the corners of cells, blocks, wells, the knob toggle and the readout bar from the guide's pixels", () => {
    const cell = declarations(CSS, ".lcd .param-cell:not(.osc-output .param-cell)::after");
    expect([cell["--pc-g"], cell["--pc-a"], cell["--pc-b"], cell["--pc-c"]]).toEqual(["var(--lcd-bg)", "var(--corner-sunk-a)", "var(--corner-sunk-b)", "var(--corner-sunk-c)"]);
    expect(cell["background"], "the ground on three pixels of the edge row").toContain("linear-gradient(var(--pc-g), var(--pc-g)) left 0px top 0px / 3px 1px no-repeat");
    expect(cell["background"], "then the outer shade").toContain("linear-gradient(var(--pc-a), var(--pc-a)) left 3px top 0px / 1px 1px no-repeat");
    // An effect's panels turn as DELAY's cells do; a control on the glass has no panel to turn.
    expect(declarations(CSS, ".lcd .efx-cell:not(.is-bare)::after")["background"]).toBe(cell["background"]);
    expect(declarations(CSS, ".lcd .efx-cell:not(.is-bare)")["border-radius"]).toBe("0");
    expect(declarations(CSS, ".efx-cell")["border-radius"], "no curve of the browser's under the pixels").toBeUndefined();
    const placed = CSS.match(/:where\(\.param-cell[^{]*\{\s*position: relative;/)?.[0] ?? "";
    expect(placed, "each panel is the box its overlay is placed in").toContain(".efx-cell:not(.is-bare)");
    const block = declarations(CSS, ".lcd .cv-block::after");
    expect([block["--pc-a"], block["--pc-foot-a"], block["--pc-band"]]).toEqual(["var(--corner-block-a)", "var(--corner-sunk-a)", "var(--btn-bevel)"]);
    expect(block["background"], "the step onto the band").toContain("linear-gradient(var(--corner-block-band-top), var(--corner-block-band-top)) right 0px bottom 7px / 1px 1px no-repeat");
    expect(declarations(CSS, ".lcd .cv-block")["border-radius"]).toBe("0");
    const box = declarations(CSS, ".lcd .value-box::after");
    expect([box["inset"], box["--pc-m"]], "over the box's border").toEqual(["-1px", "var(--corner-well-on-sunk)"]);
    const focused = declarations(CSS, ".lcd .value-box.is-focused::after");
    expect([focused["--pc-fa"], focused["display"]], "a focused box runs its frame round the turn").toEqual(["var(--corner-focus-on-sunk)", undefined]);
    expect(focused["background"]).toContain("linear-gradient(var(--corner-focus-b), var(--corner-focus-b)) left 1px top 1px / 1px 1px no-repeat");
    expect(declarations(CSS, ".lcd .input-col .value-box::after")["--pc-m"], "INPUT's box turns on the panel alone").toBe("var(--well-deep)");
    expect(declarations(CSS, ".lcd .input-col .value-box.is-focused::after")["--pc-fa"], "INPUT's darker panel has its own shade").toBe("var(--corner-focus-on-sunken)");
    expect([declarations(TOKENS, ":root")["--corner-focus-on-sunk"], declarations(TOKENS, ":root")["--corner-focus-on-sunken"]]).toEqual(["#b51073", "#b50c73"]);
    // The cells set their boxes' face at the same weight as the focus rule, so the focus fill is restated above them.
    expect(declarations(CSS, ".lcd .value-box.is-focused")["background"], "a focused box fills in every cell").toBe("var(--accent-focus-fill)");
    expect(declarations(CSS, ".lcd .mon-level .value-box::after")["--pc-m"]).toBe("var(--corner-well-on-surface)");
    expect(declarations(CSS, ".lcd .rec-slot::after")["--pc-i"]).toBe("var(--corner-well-inner)");
    expect(declarations(CSS, ".lcd .udk-toggle.is-on::after")["background"]).toContain("var(--corner-toggle-lit-9)");
    const bar = declarations(CSS, ".lcd .knob-strip::after");
    expect([bar["inset"], bar["--pc-e"]]).toEqual(["-2px -2px 0", "var(--readout-edge)"]);
    expect(declarations(CSS, ".lcd.is-udk .knob-strip::after")["background"]).toContain("var(--corner-readout-udk-right-4)");
    const root = declarations(TOKENS, ":root");
    expect([root["--corner-sunk-a"], root["--corner-block-a"], root["--corner-well-on-surface"], root["--corner-toggle-1"], root["--corner-readout-2"]]).toEqual(["#101410", "#191c21", "#191c21", "#293131", "#949294"]);
  });

  it("rounds INPUT's panels over five pixels and the graphs' frames over three, in the guide's shades", () => {
    const panel = declarations(CSS, ".lcd .input-panel::after");
    expect([panel["--pc-a"], panel["--pc-b"], panel["--pc-c"]], "INPUT's panels in their own shades").toEqual(["var(--corner-panel-a)", "var(--corner-panel-b)", "var(--corner-panel-b)"]);
    expect(panel["background"], "on the sunk cells' five-pixel turn").toContain("linear-gradient(var(--pc-a), var(--pc-a)) left 3px top 0px / 1px 1px no-repeat");
    expect(panel["--pc-m"], "not a well's").toBeUndefined();
    const plot = declarations(CSS, ".lcd .eq-plot::after");
    expect([plot["inset"], plot["--pc-a"], plot["--pc-b"]], "over the frame").toEqual(["-1px", "var(--corner-plot-a)", "var(--corner-plot-b)"]);
    expect(plot["background"], "the ground on two pixels of the edge row").toContain("linear-gradient(var(--pc-g), var(--pc-g)) left 0px top 0px / 2px 1px no-repeat");
    expect(plot["background"], "the brighter shade inside the turn").toContain("linear-gradient(var(--pc-b), var(--pc-b)) right 1px top 1px / 1px 1px no-repeat");
    expect(declarations(CSS, ".lcd .dyn-plot::after")["background"], "the dynamics graphs the same").toBe(plot["background"]);
    expect(declarations(CSS, ".dyn-plot")["overflow"], "their corners are not clipped away").toBeUndefined();
    expect(plot["background"], "the same turn at the bottom, whatever the curve fills").toContain("linear-gradient(var(--pc-b), var(--pc-b)) right 1px bottom 1px / 1px 1px no-repeat");
    expect(plot["background"]).not.toContain("--graph-grid-lit");
    const root = declarations(TOKENS, ":root");
    expect([root["--corner-panel-a"], root["--corner-panel-b"], root["--corner-plot-a"], root["--corner-plot-b"]]).toEqual(["#101010", "#212429", "#31393a", "#424d52"]);
    const path = declarations(CSS, ".lcd .sd-path-field::after");
    expect(path["background"], "the path field marks a left corner with one shade").toContain("linear-gradient(var(--corner-path-left), var(--corner-path-left)) left 0px top 0px / 1px 1px no-repeat");
    expect(path["background"], "and rounds a right one over three pixels").toContain("linear-gradient(var(--corner-path-c), var(--corner-path-c)) right 0px bottom 2px / 1px 1px no-repeat");
    expect(CSS, "on a box of its own").toContain(".scene-box-static, .udk-toggle, .sd-path-field) {\n  position: relative;");
    const tray = declarations(CSS, ".lcd .menu-grid.setup-general::after");
    expect(tray["background"], "SETUP's tray rounds over five pixels").toContain("linear-gradient(var(--corner-tray-c), var(--corner-tray-c)) right 1px bottom 1px / 1px 1px no-repeat");
    expect([declarations(CSS, ".lcd .sd-path-field")["border-radius"], declarations(CSS, ".lcd .menu-grid.setup-general")["border-radius"]]).toEqual(["0", "0"]);
    expect([root["--corner-path-left"], root["--corner-path-a"], root["--corner-path-b"], root["--corner-path-c"], root["--corner-tray-a"], root["--corner-tray-b"], root["--corner-tray-c"], root["--corner-tray-d"]]).toEqual(["#31393a", "#3a454a", "#424952", "#293131", "#313131", "#636163", "#080808", "#6b696b"]);
  });

  it("sets the marks and names measured last against the guide at their weights, shades and places", () => {
    expect(declarations(CSS, ".rec-slot-copy")["color"], "RECORDER's copy mark in pale grey").toBe("var(--rec-copy-mark)");
    expect(declarations(CSS, ".rec-slot-copy svg path")["stroke-width"], "on a heavier stroke").toBe("1.5");
    expect(declarations(TOKENS, ":root")["--rec-copy-mark"]).toBe("#dedfde");
    expect(declarations(CSS, ".mode-caption")["font-weight"], "Operation Mode's caption").toBe("500");
    expect(declarations(CSS, ".chs-mark-edit")["color"], "CH SETTING's rename mark darker than its copy marks").toBe("var(--text-muted)");
    expect(declarations(CSS, ".side-tab-label")["font-weight"], "a side tab's name").toBe("600");
    expect(declarations(CSS, ".osc-tab .side-tab-label")["font-weight"], "OSCILLATOR's in the regular weight").toBe("400");
    expect(declarations(CSS, ".sendto-tab .side-tab-label")["font-weight"], "SEND TO's too").toBe("400");
  });

  it("draws the corners of HOME's unselected strips and MONITOR's strips from the guide's pixels", () => {
    const top = declarations(CSS, ".lcd .strip:not(.is-selected) .strip-name::after");
    expect([top["--pc-a"], top["--pc-b"], top["--pc-c"]]).toEqual(["var(--corner-raised-a)", "var(--corner-raised-b)", "var(--corner-raised-c)"]);
    expect(declarations(CSS, ".lcd .mon-head::after")["--pc-a"], "MONITOR's head in the same shades").toBe("var(--corner-raised-a)");
    const rail = declarations(CSS, ".lcd .strip:not(.is-selected):not(.strip-empty)::after");
    expect([rail["--pc-rail-36"], rail["--pc-rail-60"], rail["--pc-rail-18"]], "the rail mixed over the glass and over the face").toEqual([
      "color-mix(in srgb, var(--rail) 36%, var(--lcd-bg))",
      "color-mix(in srgb, var(--rail) 60%, var(--surface))",
      "color-mix(in srgb, var(--rail) 18%, var(--surface))",
    ]);
    expect(rail["background"], "the rail climbs the side").toContain("linear-gradient(var(--rail), var(--rail)) right 0px bottom 5px / 1px 1px no-repeat");
    expect(declarations(CSS, ".lcd .strip:not(.is-selected):not(.strip-empty)")["border-radius"]).toBe("0");
    expect(declarations(CSS, ".lcd .mon-strip::after")["background"], "the step onto MONITOR's band").toContain("var(--corner-mon-band-top)");
    const root = declarations(TOKENS, ":root");
    expect([root["--corner-raised-a"], root["--corner-mon-foot-a"], root["--corner-mon-band-mid"]]).toEqual(["#212021", "#101419", "#3a494a"]);
  });

  it("draws the SEND TO mark, GATE's badge row, EQ's box curve and Operation Mode's title as the guide does", () => {
    expect(declarations(CSS, ".cv-sendto-icon svg path")["stroke-width"]).toBe("1.5");
    expect(declarations(CSS, ".ind-row:has(.badge-gate)")["translate"]).toBe("0 1px");
    const curve = declarations(CSS, ".icon-eq-badge-curve");
    expect([curve["display"], curve["color"], px(curve["width"]), px(curve["height"])], "drawn while EQ is off, in the grip ring's grey").toEqual([undefined, "var(--handle-ring)", 44, 36]);
    expect(declarations(CSS, ".badge.badge-title.badge-eq.is-on .icon-eq-badge-curve")["color"], "green while it is on").toBe("var(--eq-badge-curve)");
    expect(declarations(TOKENS, ":root")["--eq-badge-curve"]).toBe("#219e52");
    const title = declarations(CSS, '.toolbar[data-screen="setup.mode"] .toolbar-title');
    expect([title["letter-spacing"], title["transform"]]).toEqual(["0.05em", "translateY(1px)"]);
  });

  it("holds the head amp panel to two rows, the top one 3px under its middle", () => {
    expect(declarations(CSS, ".cv-gain-flags")["grid-template-rows"]).toBe("1fr 1fr");
    expect(declarations(CSS, ".cv-gain-flags > :nth-child(1)")["translate"]).toBe("0 3px");
    expect(declarations(CSS, ".cv-gain-flags > :nth-child(2)")["translate"]).toBe("-1px 3px");
  });

  it("widens DELAY's value box and sets it where the lamp row would be", () => {
    const box = declarations(CSS, ".cv-block-value.cv-delay-value");
    expect([px(box["width"]), box["translate"]]).toEqual([60, "0 9px"]);
  });

  it("stands INPUT's right-hand buttons apart and its value boxes lower", () => {
    expect(px(declarations(CSS, ".btn.if-right.is-hiz")["left"])).toBe(109);
    expect(px(declarations(CSS, ".btn.if-right.is-hpf")["left"])).toBe(116);
    expect(px(declarations(CSS, ".input-col")["gap"])).toBe(5);
    expect(px(declarations(CSS, ".input-col .value-box")["margin-bottom"])).toBe(-1);
  });

  it("puts DELAY's frame rate box between its captions at the unit's spacing", () => {
    expect(px(declarations(CSS, ".delay-rate")["left"])).toBe(12);
    const box = declarations(CSS, ".delay-rate .pulldown");
    expect([box["margin"], box["padding"]]).toEqual(["0 -2px 0 11px", "3px 8px 6px 19px"]);
  });

  it("draws the readout bar's page step as an 8x12 glyph", () => {
    const glyph = declarations(CSS, ".knob-strip .icon-page-step");
    expect([px(glyph["width"]), px(glyph["height"])]).toEqual([8, 12]);
    expect(declarations(CSS, ".knob-strip .knob-page-step")["transform"], "no stretched character").toBeUndefined();
  });

  it("raises the names on the tabs after the first, where the screens set them higher", () => {
    expect(declarations(CSS, ".side-tab.is-name-raised .side-tab-label")["translate"]).toBe("0 -3px");
  });

  it("stands a take's frequency and time over RECORDER's progress bar", () => {
    const meta = declarations(CSS, ".rec-meta");
    expect([px(meta["left"]), px(meta["top"]), px(meta["width"])]).toEqual([13, 183, 220]);
  });

  it("sets the card's name and free space top right on every card screen, and a test's report a line every 25px", () => {
    const free = declarations(CSS, ".sd-free");
    expect([free["position"], px(free["left"]), px(free["top"]), free["text-align"]]).toEqual(["absolute", 312, 5, "left"]);
    expect(declarations(CSS, ".sd-free.tools-free"), "TOOLS takes the same place").toEqual({});
    expect([2, 3, 4, 5, 6, 7].map((n) => px(declarations(CSS, `.tools-report-row:nth-child(${n})`)["top"]))).toEqual([57, 82, 107, 132, 157, 182]);
    expect(px(declarations(CSS, ".tools-report-value")["left"])).toBe(146);
    expect(px(declarations(CSS, ".tools-report-row.is-sub .tools-report-value")["left"])).toBe(101);
  });
});

describe("SCENE LIST's Edit tab and the title entry sheet", () => {
  it("paints a protected scene's Lock cell green under a dark padlock", () => {
    expect(declarations(CSS, ".list-carded .list-row .list-cell:has(> .scene-lock.is-protected)")["background"]).toBe("var(--scene-protect)");
    expect(declarations(CSS, ".list-carded .list-row .scene-lock.is-protected")["color"]).toBe("var(--list-selected-mark)");
    expect(declarations(TOKENS, ":root")["--scene-protect"]).toBe("#32eb73");
  });

  it("stands the Edit buttons at the list's left edge, x149 and its right edge", () => {
    const bar = declarations(CSS, ".scene-actions.is-edit");
    expect([bar["left"], bar["width"], bar["gap"]]).toEqual(["4px", "375px", "53px"]);
    expect(declarations(CSS, ".scene-actions.is-edit .btn:last-child")["margin-left"]).toBe("auto");
  });

  it("lays the keys on forty quarter-key columns across the foot of the sheet, Shift lit cyan", () => {
    const keys = declarations(CSS, ".title-keys");
    expect([keys["left"], keys["top"], keys["width"], keys["grid-template-columns"], keys["grid-template-rows"], keys["gap"]]).toEqual([
      "3px", "92px", "464px", "repeat(40, minmax(0, 1fr))", "40px 40px 40px 39px", "1px 2px",
    ]);
    expect(declarations(CSS, ".btn.title-key.is-on")["background"]).toBe("var(--accent-selected)");
    const field = declarations(CSS, ".title-field");
    expect([field["left"], field["top"], field["width"], field["height"], field["background"]]).toEqual(["120px", "45px", "238px", "41px", "var(--lcd-bg)"]);
  });
});

describe("the bundled typeface", () => {
  it("declares IBM Plex Sans at every weight the glass uses, and puts it first in --font", () => {
    const faces = [...TOKENS.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1] ?? "");
    const weights = faces.map((f) => /font-weight:\s*(\d+)/.exec(f)?.[1] ?? "").sort();
    expect(weights).toEqual(["400", "500", "600", "700"]);
    const faceFor = (w: string): string | undefined =>
      /IBMPlexSans-(\w+)\.ttf/.exec(faces.find((f) => f.includes(`font-weight: ${w};`)) ?? "")?.[1];
    expect(["400", "500", "600", "700"].map(faceFor), "each weight drawn a step or two lighter").toEqual(["Regular", "Regular", "Medium", "Medium"]);
    expect(faces.every((f) => f.includes('font-family: "IBM Plex Sans"') && /url\("\/fonts\/IBMPlexSans-\w+\.ttf"\)/.test(f))).toBe(true);
    expect(declarations(TOKENS, ":root")["--font"]?.split(",")[0]).toBe('"IBM Plex Sans"');
    const used = new Set([...CSS.matchAll(/font-weight:\s*(\d+)/g)].map((m) => m[1] ?? ""));
    expect([...used].filter((w) => !weights.includes(w)), "a weight no face covers").toEqual([]);
  });
});

describe("the rotary's pointer", () => {
  it("turns about a point a pixel below the middle of the face", () => {
    expect(declarations(CSS, ".knob-pointer")["translate"]).toBe("0 1px");
  });
});

describe("the marks on the control holding the focus", () => {
  it("shows a handle's marks only while it holds the focus, fading them out and back in every two seconds", () => {
    expect(declarations(CSS, ".dyn-handle-marks")["pointer-events"], "the layer over the handles lets touches through").toBe("none");
    const held = declarations(CSS, ".dyn-handle-mark.is-held .dyn-handle-arrow");
    expect([held["visibility"], held["animation"]]).toEqual(["visible", "focus-mark-blink 2s ease-in-out infinite"]);
    expect(declarations(CSS, ".eq-grip.is-held::before")["animation"]).toBe("focus-mark-blink 2s ease-in-out infinite");
    expect(CSS).toMatch(/@keyframes focus-mark-blink\s*\{\s*50%\s*\{\s*opacity:\s*0;/);
    expect(CSS, "no blinking for a reader who asks for less motion").toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.dyn-handle-mark\.is-held \.dyn-handle-arrow,\s*\.eq-grip\.is-held::before,\s*\.eq-grip\.is-held::after\s*\{\s*animation: none;/,
    );
  });

  it("sets the toolbar title without letter spacing and the bank button's name at 12.5px", () => {
    expect(declarations(CSS, ".toolbar-title")["letter-spacing"]).toBe("0");
    expect(declarations(CSS, ".bank-label")["font-size"]).toBe("12.5px");
  });

  it("frames a channel view block's value as a value box, and EQ's panel under 1-knob a pixel clear, its curve in the focus colours throughout", () => {
    const value = declarations(CSS, ".cv-block-value.is-focused");
    expect([value["border"], value["background"]]).toEqual(["1px solid var(--accent-focus)", "var(--accent-focus-fill)"]);
    expect(CSS, "its corners turn as a focused box's do").toMatch(/\.lcd \.value-box\.is-focused::after,\s*\.lcd \.cv-block-value\.is-focused::after\s*\{/);
    const graph = declarations(CSS, ".cv-eq-oneknob.is-focused .eq-thumb");
    expect([graph["outline"], graph["outline-offset"]]).toEqual(["1px solid var(--accent-focus)", "1px"]);
    expect(declarations(CSS, ".cv-eq-oneknob .eq-area")["fill"]).toBe("var(--eq-focus-fill)");
    expect(declarations(CSS, ".cv-eq-oneknob .eq-thumb-edge")["stroke"]).toBe("var(--eq-focus-edge)");
    const root = declarations(TOKENS, ":root");
    expect([root["--eq-focus-edge"], root["--eq-focus-line"], root["--eq-focus-fill"]]).toEqual(["#b5086b", "#bd1884", "#4a1831"]);
  });

  it("draws every section heading on one square-cornered pale band with dark ink", () => {
    const band = declarations(CSS, ".section-band");
    expect([px(band["width"]), px(band["height"]), band["background"], band["color"], band["border-radius"]]).toEqual([384, 24, "var(--dialog-sheet)", "var(--surface-dim)", undefined]);
    expect(CSS, "no other rule paints a band of its own").not.toMatch(/\.peripheral-bar|\.patch-heading/);
    const delay = declarations(CSS, ".delay-title");
    expect([px(delay["width"]), delay["background"], delay["border-radius"]], "DELAY's is only wider").toEqual([400, undefined, undefined]);
  });

  it("colours an unlit switch's band opaquely, the same on every screen, OSCILLATOR's included", () => {
    expect(declarations(CSS, ".btn.btn-switch")["box-shadow"]).toBe("inset 0 -4px 0 var(--switch-band)");
    expect(declarations(TOKENS, ":root")["--switch-band"]).toBe("#9c969c");
    const osc = declarations(CSS, ".osc-on");
    expect([osc["width"], osc["height"], osc["min-height"]], "OSCILLATOR's switch keeps the shared 40px square").toEqual([undefined, undefined, undefined]);
    expect(declarations(CSS, ".btn.btn-switch.osc-on")["--px-ground"]).toBe("var(--surface-sunk)");
  });

  it("marks a held mid band above and below, and keeps the band box to one line", () => {
    expect(declarations(CSS, ".eq-grip.is-updown.is-held::before")["border-bottom"]).toBe("6px solid var(--accent-focus)");
    expect(declarations(CSS, ".eq-grip.is-updown.is-held::after")["border-top"]).toBe("6px solid var(--accent-focus)");
    expect([px(declarations(CSS, ".eq-grip.is-updown.is-held::before")["top"]), px(declarations(CSS, ".eq-grip.is-updown.is-held::after")["bottom"])]).toEqual([-12, -12]);
    expect(declarations(CSS, ".eq-screen > .eq-band")["white-space"]).toBe("nowrap");
  });

  it("sizes the pause mark a recording take shows as the Play tab's, a pixel above the face's middle", () => {
    const pause = declarations(CSS, ".rec-transport .icon-pause");
    expect([px(pause["width"]), px(pause["height"]), px(pause["margin-bottom"])]).toEqual([12, 14, 2]);
  });

  it("blinks the armed record mark at the pace of every other mark, reddens a paused take's pause mark, and keeps the browser's ring off a touched handle", () => {
    expect(declarations(CSS, ".rec-rec.is-armed svg")["animation"]).toBe("focus-mark-blink 2s ease-in-out infinite");
    expect(declarations(CSS, ".eq-grip.is-held::before")["animation"]).toBe("focus-mark-blink 2s ease-in-out infinite");
    expect(declarations(CSS, ".rec-play.is-paused svg")["color"]).toBe("var(--transport-rec)");
    expect(CSS, "no blinking for a reader who asks for less motion").toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.rec-rec\.is-armed svg\s*\{\s*animation: none;/);
    expect(declarations(CSS, ".dyn-handle:focus:not(:focus-visible)")["outline"]).toBe("none");
  });

  it("marks where the keys are with a ring of its own, over the glass and in no colour the unit gives a meaning", () => {
    expect(declarations(CSS, ".lcd :focus-visible")["outline"], "no control draws its own").toBe("none");
    const ring = declarations(CSS, ".focus-ring");
    expect([ring["position"], ring["z-index"], ring["pointer-events"], ring["border"]]).toEqual(["absolute", "11", "none", "1px dashed var(--focus-ring)"]);
    expect(ring["box-shadow"], "the dash carries the mark, with no line beside it").toBeUndefined();
    expect(TOKENS, "so no second colour is kept for one").not.toContain("--focus-ring-edge");
  });

  it("sinks a pressed control's face over its band, its foot keeping the corners of its head", () => {
    const pressed = declarations(CSS, ".lcd .is-pressed");
    expect([pressed["box-shadow"], pressed["clip-path"], pressed["transition"]]).toEqual([
      "none !important",
      "inset(0 0 var(--press) 0 round var(--press-radius))",
      "translate 30ms ease-out",
    ]);
    expect(
      [pressed["--px-band"], pressed["--px-band-a"], pressed["--px-band-b"], pressed["--px-band-c"]],
      "the pixel corners over the band take the shades of the top corners",
    ).toEqual(["var(--px-ground) !important", "var(--px-a) !important", "var(--px-b) !important", "var(--px-c) !important"]);
    expect([pressed["--corner-band"], pressed["--corner-band-top"], pressed["--corner-band-outer"], pressed["--corner-band-inner"]], "a tab's").toEqual([
      "transparent !important",
      "transparent !important",
      "var(--corner-outer) !important",
      "var(--corner-inner) !important",
    ]);
    expect(declarations(CSS, ".lcd .side-tab.is-pressed::after")["bottom"]).toBe("var(--press)");
    // A block's switch marks the row where its face meets its band with one
    // pixel of the band and nothing else, so it carries a set of its own for the
    // foot it stands on once it is down.
    const badge = { ...declarations(CSS, SWITCH), ...declarations(CSS, SWITCH_OFF) };
    expect(badge["--pb-ground"], "what a switch stands on").toBe("var(--surface)");
    expect([badge["--pb-step"], badge["--pb-step-a"], badge["--pb-step-b"], badge["--pb-step-c"]], "up, that row is the one pixel").toEqual([
      "var(--pb-f)",
      "transparent",
      "transparent",
      "transparent",
    ]);
    const sunkBadge = declarations(CSS, `${SWITCH}.is-pressed`);
    expect([sunkBadge["--pb-step"], sunkBadge["--pb-step-a"], sunkBadge["--pb-step-b"], sunkBadge["--pb-step-c"]], "down, it turns in the top corner's shades").toEqual([
      "var(--pb-ground)",
      "var(--pb-a)",
      "var(--pb-b)",
      "var(--pb-c)",
    ]);
    const badgeCorners = declarations(CSS, `${SWITCH}::after`)["background"] ?? "";
    for (const layer of [
      "linear-gradient(var(--pb-step), var(--pb-step)) left 0px bottom 3px / 1px 1px no-repeat",
      "linear-gradient(var(--pb-step-c), var(--pb-step-c)) left 0px bottom 6px / 1px 1px no-repeat",
      "linear-gradient(var(--pb-step), var(--pb-step)) right 0px bottom 3px / 1px 1px no-repeat",
      "linear-gradient(var(--pb-step-c), var(--pb-step-c)) right 0px bottom 6px / 1px 1px no-repeat",
    ]) {
      expect(badgeCorners, "the foot's four rows stand over the band").toContain(layer);
    }
    expect(CSS, "no sliding for a reader who asks for less motion").toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.lcd \.is-pressed\s*\{\s*transition: none;/);
  });

  it("sets the type and places chosen against the guide's figures, 2026-09-18 round", () => {
    const pick = (sel: string, keys: string[]): string[] => keys.map((k) => declarations(CSS, sel)[k] ?? "");
    const cases: [string, string[], string[]][] = [
      [".license-text", ["left", "width", "font-size", "line-height"], ["29px", "342px", "12px", "17px"]],
      [".power-screen > .btn", ["font-size", "translate"], ["13.5px", "0 -1px"]],
      [".power-screen > .btn:not(.is-on)", ["background", "box-shadow"], ["var(--surface-btn)", "inset 0 -3px 0 var(--btn-bevel-plain)"]],
      [".power-screen .param-cell .knob-graphic", ["translate"], ["0 1px"]],
      [".license-heading", ["height", "border-bottom", "font-size", "font-weight"], ["24px", "1px solid var(--text)", "15px", "700"]],
      [".license-heading + .license-para", ["margin-top"], ["15px"]],
      [".dt-format-head", ["bottom", "font-size"], ["calc(100% + 3px)", "13px"]],
      [".dt-screen .dt-value > span:not(.dt-copy)", ["font-size", "translate"], ["12px", "0px -2px"]],
      [".dt-screen .dt-value.dt-value-single > span:not(.dt-copy)", ["font-size", "translate"], ["13.5px", "1px -3px"]],
      [".dt-screen .pulldown .pulldown-value", ["font-size", "translate"], ["12.5px", "2px -1px"]],
      [".integration-caption", ["width", "font-size", "text-align", "color", "margin"], ["384px", "13px", "center", "var(--peripheral-text)", "21px 0 0 16px"]],
      [".integration-screen .dt-caption", ["font-size", "color", "text-align", "translate"], ["12.5px", "var(--peripheral-text)", "left", "28px 0px"]],
      ['.toolbar[data-screen="setup.integration"] .toolbar-title', ["font-size"], ["12.5px"]],
      [".lang-btn.is-on", ["color"], ["var(--ink-on-lit)"]],
      [".patch-caption", ["color"], ["var(--text)"]],
      [".oneknob-mark", ["color"], ["var(--surface-btn)"]],
      [".dyn-set-caption", ["font-size", "translate"], ["13px", "0 -1px"]],
      [".dyn-row-knee .dyn-caption", ["font-size", "translate"], ["13px", "0 -2px"]],
      [".dyn-row .pulldown .pulldown-value", ["font-size"], ["13px"]],
      [".chs-caption", ["font-size"], ["12.5px"]],
      [".chs-icon", ["left", "top", "width", "height"], ["29px", "16px", "14px", "14px"]],
      [".cv-sendto > span:not(.cv-sendto-icon)", ["translate"], ["2px 1px"]],
      [".menu-grid.menu-grid-wide .menu-btn > span", ["font-size"], ["12.5px"]],
    ];
    for (const [sel, keys, want] of cases) expect([sel, ...pick(sel, keys)]).toEqual([sel, ...want]);
  });

  it("dots an open take in the recorder's red, and darkens what it holds out of reach", () => {
    const dot = declarations(CSS, ".rec-dot");
    expect([dot["width"], dot["height"], dot["border-radius"], dot["background"]]).toEqual(["14px", "14px", "50%", "var(--transport-rec)"]);
    for (const sel of [".toolbar-left .dropdown-box.is-disabled", ".btn.usb-storage.is-disabled"]) {
      const d = declarations(CSS, sel);
      expect([sel, d["background"], d["color"], d["box-shadow"]]).toEqual([sel, "var(--surface-disabled)", "var(--menu-text-disabled)", "inset 0 -3px 0 var(--btn-bevel-disabled)"]);
    }
  });

  it("greys Simple Mode, which cannot be chosen", () => {
    const card = declarations(CSS, ".mode-card.is-disabled");
    expect([card["background"], card["color"], card["pointer-events"]]).toEqual(["var(--surface-disabled)", "var(--menu-text-disabled)", "none"]);
  });

  it("joins PAN and BAL into one row rounded at its two ends", () => {
    expect(declarations(CSS, ".panbal-btn::after")["background"]).toBe("none");
    expect(declarations(CSS, ".panbal-btn:first-child::after")["background"]).toBe("var(--px-left)");
    expect(declarations(CSS, ".panbal-btn:last-child::after")["background"]).toBe("var(--px-right)");
  });

  it("draws a knob picture under each USER DEFINED KNOBS column and greys the languages that cannot be chosen", () => {
    const dial = declarations(CSS, ".udk-dial");
    expect([px(dial["width"]), px(dial["height"]), dial["border-radius"]]).toEqual([55, 54, "50%"]);
    expect(px(declarations(CSS, ".udk-dial::before")["inset"])).toBe(9);
    const lang = declarations(CSS, ".lang-btn.is-disabled");
    expect([lang["background"], lang["color"], lang["pointer-events"]]).toEqual(["var(--surface-disabled)", "var(--menu-text-disabled)", "none"]);
  });

  it("keeps COMP's depth filled while 1-knob is on, and lights [1-knob] green on a panel of its own", () => {
    expect(declarations(CSS, ".cv-oneknob > .cv-block-value")["background"]).toBe("var(--accent-focus-fill)");
    const lit = declarations(CSS, ".lcd .oneknob.is-on");
    expect([lit["background"], lit["box-shadow"]]).toEqual(["var(--oneknob-lit)", "inset 0 -3px 0 var(--oneknob-lit-band)"]);
    const panel = declarations(CSS, ".oneknob-panel");
    expect([px(panel["height"]), panel["background"]]).toEqual([44, "var(--oneknob-panel)"]);
    const level = declarations(CSS, ".lcd .oneknob-panel > .oneknob-level");
    expect([px(level["width"]), px(level["height"])]).toEqual([55, 30]);
    const link = declarations(CSS, ".oneknob-link");
    expect([px(link["width"]), px(link["height"]), link["background"]]).toEqual([10, 2, "var(--oneknob-link)"]);
    expect(px(declarations(CSS, ".oneknob-panel > .pulldown")["width"]), "EQ's kind of curve is as wide as Knee").toBe(124);
    const grip = declarations(CSS, ".eq-grip.is-fixed");
    expect([px(grip["width"]), px(grip["border-width"])], "a fixed grip at about half the ring").toEqual([16, 1.5]);
    expect([grip["border-color"], grip["background"]], "hollow, in pale grey").toEqual(["var(--accent-cue)", "var(--graph-bg)"]);
    expect(declarations(CSS, ".eq-plot.is-oneknob .eq-curve-line")["stroke"], "the curve in magenta while 1-knob drives it").toBe("var(--accent-focus)");
    const root = declarations(TOKENS, ":root");
    expect([root["--oneknob-lit"], root["--oneknob-lit-band"], root["--oneknob-panel"], root["--oneknob-link"], root["--oneknob-type"]]).toEqual(["#4aaa31", "#317529", "#393c42", "#4aa631", "#636973"]);
  });
});

describe("the two corner maps", () => {
  /** The rule that draws a channel screen's title badge, the other map of the pair. */
  const TITLE = ".lcd .badge.badge-title:not(.badge-plain)";

  /** Where each 1px layer of a corner map paints, and the shade it takes. */
  const mapOf = (selector: string): { at: string; shade: string }[] =>
    (declarations(CSS, `${selector}::after`)["background"] ?? "")
      .split("no-repeat")
      .filter((layer) => layer.includes("linear-gradient"))
      .map((layer) => {
        const at = /(left|right)\s+(\d+)px\s+(top|bottom)\s+(\d+)px/.exec(layer);
        return { at: at ? `${at[1]} ${at[2]} ${at[3]} ${at[4]}` : layer.trim(), shade: /--[a-z0-9-]+/.exec(layer)?.[0] ?? "" };
      });

  // The switch and the title badge draw the corner in the same places, each from
  // shades of its own. A cell added to one map and not to the other is caught here.
  it("puts the two maps' layers in the same 46 places", () => {
    const switchMap = mapOf(SWITCH);
    const titleMap = mapOf(TITLE);
    expect([switchMap.length, titleMap.length]).toEqual([46, 46]);
    expect(switchMap.map((l) => l.at).sort()).toEqual(titleMap.map((l) => l.at).sort());
    expect(new Set(switchMap.map((l) => l.at)).size, "no place is drawn twice").toBe(46);
    const heads = switchMap.filter((l) => l.at.includes("top")).length;
    expect([heads, switchMap.length - heads], "a head of 8 and a foot of 15, on each side").toEqual([16, 30]);
  });

  it("names the side tab's corners for the ring, which cannot read them off a map", () => {
    // The tab draws its corners with a box at each end, not with cells over its
    // face, so `src/ui/focus-ring.ts` is told where they run.
    expect(declarations(CSS, ".side-tab")["--ring-corners"]).toBe("3px 0 0 3px");
  });

  it("keeps each map on its own shades", () => {
    expect(mapOf(SWITCH).filter((l) => !l.shade.startsWith("--pb-"))).toEqual([]);
    expect(mapOf(TITLE).filter((l) => !l.shade.startsWith("--pt-"))).toEqual([]);
  });
});

describe("the name on a lit face", () => {
  const color = (selector: string): [string, string | undefined] => [selector, declarations(CSS, selector)["color"]];

  // The chosen option is (58,61,58) in p040-1, p058-1, p059-2, p060-2, p061-1,
  // p062-1, p070-1, p093-1 and p100-2; a lit switch such as [ON] keeps black.
  it("sets a chosen option's name in the lit-name grey", () => {
    for (const selector of [
      ".rate-btn.is-on",
      ".peripheral-group:not(.peripheral-hdcp) .btn.is-on",
      ".source-btn.is-on",
      ".btn.pick-dialog-row.is-on",
      ".udk-bank.is-on",
      ".osc-mode.is-on",
      ".panbal-btn.is-on",
    ]) {
      expect(color(selector)).toEqual([selector, "var(--ink-on-lit)"]);
    }
    expect(declarations(TOKENS, ":root")["--ink-on-lit"]).toBe("#3a3d3a");
  });

  // CUE Interrupt and MONO (p068-1) and the lit SCENE LIST bank (p073-1) are (74,81,90).
  it("sets MONITOR's lit CUE Interrupt and MONO and the lit scene bank in the face grey", () => {
    for (const selector of [".mon-btn.is-on", ".scene-bank.is-on"]) {
      expect(color(selector)).toEqual([selector, "var(--surface)"]);
    }
  });

  // p068-1: CUE Interrupt x6..95, MONO x8..93.
  it("draws MONO 4px narrower than CUE Interrupt, on the same centre", () => {
    const btn = declarations(CSS, ".mon-btn");
    const mono = declarations(CSS, ".mon-mono");
    expect([px(mono["left"]) - px(btn["left"]), px(btn["width"]) - px(mono["width"])]).toEqual([2, 4]);
    expect(px(mono["width"])).toBe(86);
  });
});

describe("a picker sheet's silhouette", () => {
  // In p100-2, p059-2 and p060-2 the sheet darkens the first pixel outside its
  // right and bottom sides by 0.82 and the second by 0.35, and leaves the pixels
  // to its left and above it as they are.
  it("drops a two pixel shadow to its right and below", () => {
    expect(declarations(CSS, ".source-popup")["background"], "on the sheet every other picker opens").toBe("var(--dialog-sheet)");
    expect(declarations(CSS, ".source-popup")["box-shadow"]).toBe("1px 1px 0 var(--sheet-shadow-near), 2px 2px 0 var(--sheet-shadow-far)");
    const tokens = declarations(TOKENS, ":root");
    expect([tokens["--sheet-shadow-near"], tokens["--sheet-shadow-far"]]).toEqual(["#000000b8", "#00000059"]);
  });

  it("turns the two corners on the ground wider than the two on the toolbar", () => {
    expect(declarations(CSS, ".source-popup.source-sheet")["border-radius"]).toBe("5px 5px 6px 6px");
  });

  // The panel rounding its own top right corner would cut the way out's face
  // away and leave the panel's pale edge showing where the guide has the face.
  it("leaves the top right corner to the way out, which draws it in three pixels", () => {
    expect(declarations(CSS, ".source-popup.source-sheet")["overflow"]).toBe("visible");
    const back = declarations(CSS, ".source-back");
    expect(back["border-radius"]).toBe("0");
    expect(back["clip-path"], "the pixel at the very corner is the screen's").toBe(
      "polygon(0 0, calc(100% - 1px) 0, calc(100% - 1px) 1px, 100% 1px, 100% 100%, 0 100%)",
    );
    const map = declarations(CSS, ".source-back::after");
    expect([px(map["width"]), px(map["height"]), map["right"], map["top"]]).toEqual([3, 3, "0", "0"]);
    // Three rows, one pixel each: the face turns over two shades and the pixel
    // outside the turn is left to the screen behind.
    expect((map["background"] ?? "").replace(/\s+/g, " ").split(" no-repeat,").map((layer) => layer.trim())).toEqual([
      "linear-gradient(to right, var(--sheet-back-top-corner-inner) 1px, var(--sheet-back-top-corner-outer) 1px 2px, transparent 2px) 0 0 / 100% 1px",
      "linear-gradient(to right, var(--surface-toolbar) 2px, var(--sheet-back-top-corner-outer) 2px) 0 1px / 100% 1px",
      "linear-gradient(to right, var(--surface-toolbar) 2px, var(--sheet-back-top-corner-inner) 2px) 0 2px / 100% 1px no-repeat",
    ]);
    const tokens = declarations(TOKENS, ":root");
    expect([tokens["--sheet-back-top-corner-inner"], tokens["--sheet-back-top-corner-outer"]]).toEqual(["#3a454a", "#212d31"]);
  });
});

describe("the ducker's key list", () => {
  it("hangs under the box that opens it rather than in the corner of the glass", () => {
    // The Ducker Source box stands at x352..418 / y52..91, and the list is set
    // against its right edge and starts under it.
    const list = declarations(CSS, ".ducker-source-list");
    expect([list["top"], list["right"], list["left"]]).toEqual(["45px", "8px", "auto"]);
    expect(list["grid-template-columns"], "eight names across").toBe("repeat(8, 48px)");
    const option = declarations(CSS, ".ducker-source-list .dropdown-option");
    expect([option["min-width"], option["white-space"]], "wide enough for MIX 1, and never wrapped").toEqual([
      "48px",
      "nowrap",
    ]);
  });
});

describe("BUS Type's own list", () => {
  it("hangs under its box and reaches the foot of the glass", () => {
    // The box stands at x77..212 / y157..196, and FIXED's face meets the foot.
    const list = declarations(CSS, ".chs-bustype-list");
    expect([list["top"], list["bottom"], list["left"]]).toEqual(["auto", "0", "75px"]);
    const option = declarations(CSS, ".chs-bustype-list .dropdown-option");
    expect([option["min-width"], option["min-height"]], "as wide as the box and short enough to clear it").toEqual([
      "136px",
      "31px",
    ]);
  });
});

describe("a list of choices over the screen", () => {
  it("keeps its choices inside its own panel, 4px in at the top and the foot", () => {
    // p079-3, the Track Count list: the panel runs y54..233, its first tile
    // starts at y58 and its last ends at y229 — the padding the panel declares.
    const list = declarations(CSS, ".dropdown-list");
    expect([list["padding"], list["gap"]]).toEqual(["4px", "4px"]);
    expect(
      declarations(CSS, ".btn.dropdown-option")["translate"],
      "nothing lifts a choice out of the panel it stands in",
    ).toBeUndefined();
  });
});
