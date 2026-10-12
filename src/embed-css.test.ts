import { describe, expect, it } from "vitest";
import tokensCss from "./style/tokens.css?raw";
import lcdCss from "./style/lcd.css?raw";
import { embedStylesheet } from "./embed-css";

describe("the embedded stylesheet", () => {
  it("puts every style rule in the shadow tree, :root reading as the glass's root", () => {
    const { page, shadow } = embedStylesheet(":root { --text: #fff; }\n.btn { color: var(--text); }\n:root:not(.is-turning) .btn:hover { color: red; }", "glass");
    expect(page.trim()).toBe("");
    expect(shadow).toContain(".glass { --text: #fff; }");
    expect(shadow).toContain(".btn { color: var(--text); }");
    expect(shadow).toContain(".glass:not(.is-turning) .btn:hover");
    expect(shadow).not.toMatch(/:root(?![\w-])/);
  });

  it("starts the glass's root from the initial values, ahead of the rules that set its own", () => {
    const { shadow } = embedStylesheet(":root { color: white; }", "glass");
    const reset = shadow.indexOf(".glass { all: initial; display: block; }");
    expect(reset).toBe(0);
    expect(shadow.indexOf(".glass { color: white; }")).toBeGreaterThan(reset);
  });

  it("keeps a rule nested in @media and a @keyframes in the shadow tree", () => {
    const { page, shadow } = embedStylesheet("@media (prefers-reduced-motion: reduce) { .meter { transition: none; } }\n@keyframes spin { to { rotate: 1turn; } }", "glass");
    expect(shadow).toContain("@media (prefers-reduced-motion: reduce) { .meter { transition: none; } }");
    expect(shadow).toContain("@keyframes spin");
    expect(page.trim()).toBe("");
  });

  it("puts @font-face and @property on the page, a font file loading from the URL given for it", () => {
    const { page, shadow } = embedStylesheet(
      [
        '@font-face { font-family: "Plex"; src: url("/fonts/Plex-Regular.ttf") format("truetype"); }',
        "@property --turn { syntax: '<angle>'; inherits: false; initial-value: 0deg; }",
        ".spinner { color: red; }",
      ].join("\n"),
      "glass",
      { "Plex-Regular.ttf": "blob:plex" },
    );
    expect(page).toContain('src: url("blob:plex") format("truetype")');
    expect(page).toContain("@property --turn");
    expect(page).not.toContain(".spinner");
    expect(shadow).not.toContain("@font-face");
    expect(shadow).not.toContain("@property");
  });

  it("loads a font file no URL is given for from /fonts/", () => {
    const { page } = embedStylesheet('@font-face { src: url("/fonts/Other.ttf"); }', "glass", { "Plex.ttf": "x" });
    expect(page).toContain('url("/fonts/Other.ttf")');
  });

  it("drops comments, a brace inside one included", () => {
    const { shadow } = embedStylesheet("/* { not a rule */\n.a { color: red; /* } */ }\n", "glass");
    expect(shadow).not.toContain("not a rule");
    expect(shadow).toContain(".a { color: red;");
  });

  it("leaves no :root in the simulator's own sheets and nothing but fonts and properties on the page", () => {
    const { page, shadow } = embedStylesheet(`${tokensCss}\n${lcdCss}`, "embed-glass");
    expect(shadow).not.toMatch(/:root(?![\w-])/);
    expect(page.replace(/@(font-face|property)[^{]*\{[^{}]*\}/g, "").trim()).toBe("");
  });
});
