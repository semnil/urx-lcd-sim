// The simulator's stylesheet as an embedded glass carries it.
//
// The simulator alone styles the whole page: its tokens stand on :root and its
// rules match anywhere. Embedded in another page, the glass is drawn inside a
// shadow tree, so the page's rules do not reach the elements inside it and the
// glass's rules do not reach the page's:
//
// - every rule but the two below goes into the shadow tree, and :root inside
//   them becomes the glass's own root element, which starts from the initial
//   value of every property rather than from what the page around it passes in;
// - @font-face and @property, which a shadow tree does not take, stand on the
//   page, and a font file is loaded from the URL the page passes in for it.

/** The URLs of the simulator's font files, by the file name they carry in `/fonts/`. */
export type FontUrls = Record<string, string>;

const ON_PAGE = /^@(font-face|property)\b/;

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

/** The two halves of the embedded stylesheet: the one the page carries and the one inside the glass's shadow tree. */
export interface EmbeddedStylesheet {
  page: string;
  shadow: string;
}

/**
 * `css` split for a glass drawn in a shadow tree under an element carrying the
 * class `root`: @font-face and @property for the page, each font file named in
 * `fonts` loaded from the URL given for it, and everything else for the shadow
 * tree, :root reading as `.<root>`, which starts from the initial values.
 */
export function embedStylesheet(css: string, root: string, fonts: FontUrls = {}): EmbeddedStylesheet {
  const font = (text: string): string =>
    text.replace(/url\(\s*(["']?)\/fonts\/([^"')]+)\1\s*\)/g, (whole, _q: string, file: string) => (fonts[file] ? `url("${fonts[file]}")` : whole));
  const page: string[] = [];
  const shadow: string[] = [`.${root} { all: initial; display: block; }`];
  for (const block of topLevel(css)) {
    if (ON_PAGE.test(block)) page.push(font(block));
    else shadow.push(block.replace(/:root(?![\w-])/g, `.${root}`));
  }
  return { page: `${page.join("\n")}\n`, shadow: `${shadow.join("\n")}\n` };
}
