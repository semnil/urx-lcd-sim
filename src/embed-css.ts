// The simulator's stylesheet as an embedded glass carries it.
//
// The simulator alone styles the whole page: its tokens stand on :root and its
// rules match anywhere. Embedded in another page, the same sheets are closed
// under the glass's root element, so neither page's rules reach into the other:
//
// - every style rule is wrapped in `@scope (.<root>)`, and :root inside them
//   becomes :scope, the glass's root;
// - the rules that cannot sit inside a scope (@font-face, @keyframes, @property)
//   stand at the top level, a keyframes name carrying the root's name in front
//   of it so it meets no name of the page's own;
// - a font file is loaded from the URL the page passes in for it.

/** The URLs of the simulator's font files, by the file name they carry in `/fonts/`. */
export type FontUrls = Record<string, string>;

const HOISTED = /^@(font-face|keyframes|property)\b/;

/** The top-level blocks and statements of `css`, comments dropped. */
function topLevel(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "/" && css[i + 1] === "*") {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      if (depth === 0) {
        out.push(css.slice(start, i));
        start = stop;
      } else {
        css = css.slice(0, i) + " ".repeat(stop - i) + css.slice(stop);
      }
      i = stop - 1;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        out.push(css.slice(start, i + 1));
        start = i + 1;
      }
    } else if (c === ";" && depth === 0) {
      out.push(css.slice(start, i + 1));
      start = i + 1;
    }
  }
  out.push(css.slice(start));
  return out.map((block) => block.trim()).filter((block) => block.length > 0);
}

/**
 * `css` closed under `.<root>`: the style rules scoped to it, the hoisted rules
 * at the top level, keyframes renamed `<root>-<name>`, and each font file named
 * in `fonts` loaded from the URL given for it.
 */
export function scopeStylesheet(css: string, root: string, fonts: FontUrls = {}): string {
  const blocks = topLevel(css);
  const names = blocks.flatMap((block) => /^@keyframes\s+([\w-]+)/.exec(block)?.[1] ?? []);
  const rename = (text: string): string =>
    names.reduce((acc, name) => acc.replace(new RegExp(`(?<![\\w-])${name}(?![\\w-])`, "g"), `${root}-${name}`), text);
  const font = (text: string): string =>
    text.replace(/url\(\s*(["']?)\/fonts\/([^"')]+)\1\s*\)/g, (whole, _q: string, file: string) => (fonts[file] ? `url("${fonts[file]}")` : whole));
  const hoisted: string[] = [];
  const scoped: string[] = [];
  for (const block of blocks) {
    if (HOISTED.test(block)) hoisted.push(font(rename(block)));
    else scoped.push(rename(block).replace(/:root(?![\w-])/g, ":scope"));
  }
  return `${hoisted.join("\n")}\n@scope (.${root}) {\n${scoped.join("\n")}\n}\n`;
}
