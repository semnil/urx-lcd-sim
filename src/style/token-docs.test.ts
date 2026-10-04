import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readStyle } from "./css-read";

// design-tokens.md, in English and in Japanese, says where each value in
// tokens.css comes from or what it draws: a table row that names the token in its
// first cell, or a paragraph that names it.

const TOKENS = readStyle("tokens.css");

/** Every custom property tokens.css declares. */
const DECLARED = [...new Set([...TOKENS.matchAll(/(?:^|[;{\s])(--[a-z0-9-]+)\s*:/g)].map((m) => m[1] ?? ""))];

const DOCS = ["en", "ja"].map((lang) => ({
  lang,
  text: readFileSync(join(process.cwd(), "docs", lang, "design-tokens.md"), "utf8"),
}));

const named = (text: string): string[] => [...text.matchAll(/`(--[a-z0-9-]+)`/g)].map((m) => m[1] ?? "");

/** The tokens a document gives an entry of their own: in a row's first cell, and in its paragraphs. */
function entries(doc: string): { rows: Set<string>; paragraphs: Set<string> } {
  const rows = new Set<string>();
  const paragraphs = new Set<string>();
  for (const line of doc.split("\n")) {
    if (line.startsWith("|")) for (const name of named(line.split("|")[1] ?? "")) rows.add(name);
    else for (const name of named(line)) paragraphs.add(name);
  }
  return { rows, paragraphs };
}

describe("where the design tokens came from", () => {
  it("gives every token tokens.css declares an entry, in English and in Japanese", () => {
    expect(DECLARED, "the palette's ground is among those read").toContain("--lcd-bg");
    for (const { lang, text } of DOCS) {
      const { rows, paragraphs } = entries(text);
      const missing = DECLARED.filter((name) => !rows.has(name) && !paragraphs.has(name));
      expect(missing, `design-tokens.md (${lang})`).toEqual([]);
    }
  });

  it("names in a row only tokens that tokens.css declares", () => {
    for (const { lang, text } of DOCS) {
      const stale = [...entries(text).rows].filter((name) => !DECLARED.includes(name));
      expect(stale, `design-tokens.md (${lang})`).toEqual([]);
    }
  });
});
