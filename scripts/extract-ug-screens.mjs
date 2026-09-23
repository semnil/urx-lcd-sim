#!/usr/bin/env node
// Rebuild the local rendering reference: pull the screen captures out of the
// Yamaha user guide PDF into reference/ug-lcd/ and reference/ug-lcd/wide/.
//
// The extracted images are Yamaha's copyright. reference/ is gitignored and the
// output is never committed, published or shipped in a build — it exists so a
// colour or a length can be measured off the real screen instead of guessed.
// The PDF itself is not in this repo; point --pdf at your own copy.
//
//   node scripts/extract-ug-screens.mjs --pdf <path to user guide PDF>
//
// Requires poppler (`brew install poppler`) for pdfimages.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "reference", "ug-lcd");
const WIDE_OUT = join(OUT, "wide");

/** The unit's screen is 480x272. The guide also embeds the same captures on a
 *  padded canvas, with white added around the screen. Those are kept as they
 *  are: the screen is the 480x272 region at the canvas's left edge, and on some
 *  canvas heights it does not start at the top row. The canvases wider than the
 *  screen go to wide/, and are numbered per page there on their own. */
const LCD_WIDTH = 480;
const LCD_HEIGHTS = [272, 281, 289];
const WIDE_WIDTHS = [685, 686];
const WIDE_HEIGHTS = [281, 289, 297];

/** The guide also crops part of a screen where it is calling one control out.
 *  A crop is no larger than the screen and no smaller than this, which leaves
 *  out the glyphs and marks the guide sets in its own text. */
const CROP_MIN = 88;

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** The directory a whole screen of this size is written to, or null. */
function destination(width, height) {
  if (width === LCD_WIDTH && LCD_HEIGHTS.includes(height)) return OUT;
  if (WIDE_WIDTHS.includes(width) && WIDE_HEIGHTS.includes(height)) return WIDE_OUT;
  return null;
}

/** Whether an image of this size is a crop of part of a screen. */
function isCrop(width, height) {
  if (destination(width, height)) return false;
  return width <= LCD_WIDTH && height <= 272 && width >= CROP_MIN && height >= CROP_MIN;
}

const pdf = arg("--pdf", "");
if (!pdf || !existsSync(pdf)) {
  console.error("usage: node scripts/extract-ug-screens.mjs --pdf <user guide PDF>");
  process.exit(2);
}

const firstPage = Number(arg("--from", "1"));
const lastPage = Number(arg("--to", "200"));

const listing = execFileSync("pdfimages", ["-list", "-f", String(firstPage), "-l", String(lastPage), pdf], {
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});

const rows = listing
  .split("\n")
  .slice(2)
  .filter((l) => l.trim())
  .map((l) => l.trim().split(/\s+/));

const staging = join(OUT, ".staging");
rmSync(staging, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });
mkdirSync(WIDE_OUT, { recursive: true });
execFileSync("pdfimages", ["-png", "-f", String(firstPage), "-l", String(lastPage), pdf, join(staging, "pg")]);

// pdfimages numbers its output files across the whole page range, counting both
// image and smask entries in listing order — so walking the listing in the same
// order recovers which file belongs to which page.
let index = 0;
const screens = [];
const crops = [];
for (const row of rows) {
  const [page, , type, width, height] = row;
  const src = join(staging, `pg-${String(index).padStart(3, "0")}.png`);
  if (type !== "image" && type !== "smask") continue;
  if (type === "image" && existsSync(src)) {
    const w = Number(width);
    const h = Number(height);
    const dir = destination(w, h);
    if (dir) screens.push({ page, src, dir });
    else if (isCrop(w, h)) crops.push({ page, src, dir: OUT });
  }
  index += 1;
}

// A page's whole screens take their numbers before any crop on it does, so a
// crop can be added to the set without moving the name of a screen already
// measured from.
const perPage = new Map();
let kept = 0;
for (const { page, src, dir } of [...screens, ...crops]) {
  const key = `${dir}:${page}`;
  const n = (perPage.get(key) ?? 0) + 1;
  perPage.set(key, n);
  copyFileSync(src, join(dir, `p${String(page).padStart(3, "0")}-${n}.png`));
  kept += 1;
}

rmSync(staging, { recursive: true, force: true });
console.log(`extracted ${kept} screen captures to ${OUT}`);
if (kept === 0) {
  console.error("no 480x272 images found — check the PDF revision and the page range");
  process.exit(1);
}
