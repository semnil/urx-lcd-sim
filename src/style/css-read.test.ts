import { describe, expect, it } from "vitest";
import { declarationsOn } from "./css-read";

describe("the declarations that land on an element", () => {
  it("gathers every rule ending on an element with all the classes, with .lcd before it or not, and no rule naming only one of them", () => {
    const css = [
      ".a.b { top: 1px; }",
      ".lcd .a.b { left: 2px; }",
      ".a { width: 3px; }",
      ".lcd .b { height: 4px; }",
      ".lcd .a.b .c { color: red; }",
      ".a.b::after { background: red; }",
    ].join("\n");
    expect(declarationsOn(css, ".a.b")).toEqual({ top: "1px", left: "2px" });
  });

  it("keeps a pseudo-element's rules to that pseudo-element", () => {
    const css = ".lcd .a.b { top: 1px; }\n.lcd .a.b::after { background: red; }\n.a::after { color: red; }";
    expect(declarationsOn(css, ".a.b::after")).toEqual({ background: "red" });
    expect(declarationsOn(css, ".lcd .a.b::after"), "whatever stands before the element").toEqual({ background: "red" });
  });

  it("reads a rule in a list, behind a child combinator, with a state of its own or inside @media, and not the classes a :not() names or a combinator steps past", () => {
    const css = [
      ".x, .lcd > .a.b.c:hover { margin: 0; }",
      "@media (x) {\n  .a.b { padding: 0; }\n}",
      ".d:not(.a.b) { border: 0; }",
      ".a.b>.c, .a.b+.c, .a.b~.c { outline: 0; }",
    ].join("\n");
    expect(declarationsOn(css, ".a.b")).toEqual({ margin: "0", padding: "0" });
  });
});
