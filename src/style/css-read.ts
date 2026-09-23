// Reading the stylesheets from a test.
//
// The screens' geometry lives in the CSS, so the guards read the declarations
// rather than a second copy of the numbers. Shared by every suite that does it:
// a second parser drifts from the first, and the two then disagree about what a
// value means.

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** One stylesheet from src/style, with its comments taken out. */
export function readStyle(file: string): string {
  return readFileSync(join(process.cwd(), "src", "style", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** A selector list split at its own commas, not at the ones inside `:is()`, `:where()` or `:not()`. */
export function selectorList(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.replace(/\s+/g, " ").trim());
}

/** The declarations of the rule whose selector list holds `selector`. */
export function declarations(css: string, selector: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of css.split("}")) {
    const brace = block.indexOf("{");
    if (brace < 0) continue;
    const selectors = selectorList(block.slice(0, brace));
    if (!selectors.includes(selector)) continue;
    Object.assign(out, readBody(block.slice(brace + 1)));
  }
  return out;
}

/** A rule's declarations, later ones over earlier ones. */
function readBody(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of body.split(";")) {
    const colon = decl.indexOf(":");
    if (colon > 0) out[decl.slice(0, colon).trim()] = decl.slice(colon + 1).trim();
  }
  return out;
}

/** Every style rule in the sheet, the ones inside `@media` and `@supports` too, in source order. */
export function styleRules(css: string): { selectors: string[]; body: Record<string, string> }[] {
  const out: { selectors: string[]; body: Record<string, string> }[] = [];
  for (const block of css.split("}")) {
    const brace = block.lastIndexOf("{");
    if (brace < 0) continue;
    // A rule opened inside an at-rule shares its block with the at-rule's own header.
    const head = block.slice(block.lastIndexOf("{", brace - 1) + 1, brace).trim();
    // `@keyframes` steps (`from`, `to`, `50%`) select no element.
    if (!head || head.startsWith("@") || /^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(head)) continue;
    out.push({ selectors: selectorList(head), body: readBody(block.slice(brace + 1)) });
  }
  return out;
}

/** A CSS length in screen pixels. A zero carries no unit, so it is read as one. */
export const px = (value: string | undefined): number =>
  (value ?? "").trim() === "0" ? 0 : Number(/(-?[\d.]+)px/.exec(value ?? "")?.[1] ?? NaN);

/** The last length in a `gap` shorthand: `4px 8px` is a row gap and a column gap. */
export const columnGap = (value: string | undefined): number => px((value ?? "").trim().split(/\s+/).at(-1));
