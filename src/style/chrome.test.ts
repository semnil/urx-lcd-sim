import { describe, expect, it } from "vitest";
import { declarations, readStyle } from "./css-read";

// The chrome around the glass — the title row and the notes under it — is as
// wide as the glass, so its text wraps where the screen ends rather than at some
// width of its own.

const APP = readStyle("app.css");
const TOKENS = readStyle("tokens.css");
const LCD = readStyle("lcd.css");

describe("the chrome around the glass", () => {
  it("takes its width from the screen, not from a width of its own", () => {
    const width = declarations(APP, ".chrome")["width"];
    expect(width, ".chrome and .chrome-foot share a width rule").toBeDefined();
    expect(width).toContain("var(--lcd-w)");
    expect(width).toContain("var(--scale)");
    expect(width, "a narrow window still bounds it").toContain("100%");
    // A literal width is what this replaced: it wrapped the text short of the glass.
    expect(/\b\d+px\b/.test(width ?? ""), `no fixed width in ${width}`).toBe(false);
  });

  it("centres on the glass, which the frame around it is wider than", () => {
    expect(declarations(APP, ".chrome")["margin-inline"]).toBe("auto");
  });

  it("reads the display scale from the one place that sets it", () => {
    expect(declarations(TOKENS, ":root")["--scale"], "the token file owns the value").toBe("2");
    expect(declarations(LCD, ".lcd-frame")["--scale"], "the frame uses it, it does not redefine it").toBeUndefined();
    expect(declarations(LCD, ".lcd-frame")["width"]).toContain("var(--scale)");
  });

  it("scales the glass through one transform, the display zoom included", () => {
    expect(declarations(LCD, ".lcd-frame")["width"]).toContain("var(--zoom, 1)");
    expect(declarations(LCD, ".lcd-frame")["height"]).toContain("var(--zoom, 1)");
    expect(declarations(LCD, ".lcd")["transform"]).toBe("scale(calc(var(--scale) * var(--zoom, 1)))");
    expect(declarations(APP, ".panel")["zoom"], "no second scale on the frame around it").toBeUndefined();
  });

  it("centres the frame around the glass in the column", () => {
    const panel = declarations(APP, ".panel");
    expect([panel["width"], panel["margin-inline"]]).toEqual(["fit-content", "auto"]);
  });
});
