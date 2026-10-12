import { describe, expect, it } from "vitest";
import tokensCss from "./style/tokens.css?raw";
import lcdCss from "./style/lcd.css?raw";
import { scopeStylesheet } from "./embed-css";

/** The text inside the stylesheet's `@scope` block, and what stands before it. */
function split(css: string): { outside: string; inside: string } {
  const at = css.indexOf("@scope (");
  const open = css.indexOf("{", at);
  return { outside: css.slice(0, at), inside: css.slice(open + 1, css.lastIndexOf("}")) };
}

describe("the embedded stylesheet", () => {
  it("scopes every style rule under the root, :root reading as the root itself", () => {
    const css = scopeStylesheet(":root { --text: #fff; }\n.btn { color: var(--text); }\n:root:not(.is-turning) .btn:hover { color: red; }", "glass");
    const { outside, inside } = split(css);
    expect(css).toContain("@scope (.glass) {");
    expect(outside.trim()).toBe("");
    expect(inside).toContain(":scope { --text: #fff; }");
    expect(inside).toContain(".btn { color: var(--text); }");
    expect(inside).toContain(":scope:not(.is-turning) .btn:hover");
    expect(inside).not.toMatch(/:root(?![\w-])/);
  });

  it("keeps a rule nested in @media inside the scope", () => {
    const { inside } = split(scopeStylesheet("@media (prefers-reduced-motion: reduce) { .meter { transition: none; } }", "glass"));
    expect(inside).toContain("@media (prefers-reduced-motion: reduce) { .meter { transition: none; } }");
  });

  it("stands @font-face, @keyframes and @property at the top level, a keyframes name carrying the root's", () => {
    const css = scopeStylesheet(
      [
        '@font-face { font-family: "Plex"; src: url("/fonts/Plex-Regular.ttf") format("truetype"); }',
        "@property --turn { syntax: '<angle>'; inherits: false; initial-value: 0deg; }",
        "@keyframes spin { to { rotate: 1turn; } }",
        ".spinner { animation: spin 1s linear infinite; }",
        ".spinning { animation-name: spin; }",
        ".spin-label { color: red; }",
      ].join("\n"),
      "glass",
      { "Plex-Regular.ttf": "blob:plex" },
    );
    const { outside, inside } = split(css);
    expect(outside).toContain('src: url("blob:plex") format("truetype")');
    expect(outside).toContain("@property --turn");
    expect(outside).toContain("@keyframes glass-spin");
    expect(inside).toContain("animation: glass-spin 1s linear infinite");
    expect(inside).toContain("animation-name: glass-spin;");
    expect(inside, "a class that merely starts with the name keeps its own").toContain(".spin-label");
    expect(inside).not.toContain("@keyframes");
  });

  it("loads a font file no URL is given for from /fonts/", () => {
    const { outside } = split(scopeStylesheet('@font-face { src: url("/fonts/Other.ttf"); }', "glass", { "Plex.ttf": "x" }));
    expect(outside).toContain('url("/fonts/Other.ttf")');
  });

  it("drops comments, a brace inside one included", () => {
    const { inside } = split(scopeStylesheet("/* { not a rule */\n.a { color: red; /* } */ }\n", "glass"));
    expect(inside).not.toContain("not a rule");
    expect(inside).toContain(".a { color: red;");
    expect(inside.trim().endsWith("}")).toBe(true);
  });

  it("leaves no :root and no top-level style rule in the simulator's own sheets", () => {
    const css = scopeStylesheet(`${tokensCss}\n${lcdCss}`, "urx-lcd-sim");
    const { outside, inside } = split(css);
    expect(inside).not.toMatch(/:root(?![\w-])/);
    expect(outside.replace(/@(font-face|keyframes|property)[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "").trim()).toBe("");
    for (const name of ["spin-turn", "spin-stretch", "title-caret-blink", "focus-mark-blink"]) {
      expect(outside).toContain(`@keyframes urx-lcd-sim-${name}`);
      expect(inside).not.toMatch(new RegExp(`(?<![\\w-])${name}(?![\\w-])`));
    }
  });
});
