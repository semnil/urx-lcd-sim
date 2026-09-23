import { beforeAll, describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { declarations, readStyle, selectorList, styleRules } from "./css-read";

// `.lcd button, .lcd input, .lcd select { font: inherit; color: inherit }` hands every
// control the font and the colour of what it stands in, and it outranks a rule of one
// class. A size, weight or colour such a rule gives a control is never drawn.

const CSS = readStyle("lcd.css");
const FONT = ["font", "font-family", "font-size", "font-style", "font-weight"];
const COLOUR = ["color"];
const CONTROLS = new Set(["BUTTON", "INPUT", "SELECT"]);
// One strip of each kind: what a channel screen draws depends on it.
const STRIPS = ["ch1", "ch_5_6", "fx1", "bus.stereo"];
// What a finger can touch on the glass, some of which open something over the screen.
const OPENERS = "button, [role='button']";
// How many of the selectors the reset outranks the sweep has to find on the drawn screens.
const REACHING_FLOOR = 50;

type Specificity = [number, number, number];

/** Where a name (a class, an id, a type, a pseudo-class) that starts at `i` ends. */
function nameEnd(text: string, i: number): number {
  while (i < text.length && /[\w-]/.test(text[i] ?? "")) i++;
  return i;
}

/** Where the parenthesis that opens at `i` closes. */
function parenEnd(text: string, i: number): number {
  let depth = 0;
  for (let j = i; j < text.length; j++) {
    if (text[j] === "(") depth++;
    else if (text[j] === ")" && --depth === 0) return j;
  }
  return text.length;
}

/** A selector's specificity: ids, then classes, attributes and pseudo-classes, then types and pseudo-elements. */
function specificity(selector: string): Specificity {
  const s: Specificity = [0, 0, 0];
  let i = 0;
  while (i < selector.length) {
    const ch = selector[i] ?? "";
    if (ch === "#") {
      s[0]++;
      i = nameEnd(selector, i + 1);
    } else if (ch === ".") {
      s[1]++;
      i = nameEnd(selector, i + 1);
    } else if (ch === "[") {
      s[1]++;
      i = selector.indexOf("]", i) + 1;
    } else if (ch === ":" && selector[i + 1] === ":") {
      s[2]++;
      i = nameEnd(selector, i + 2);
    } else if (ch === ":") {
      const start = i + 1;
      i = nameEnd(selector, start);
      const name = selector.slice(start, i);
      if (selector[i] !== "(") {
        s[1]++;
        continue;
      }
      const end = parenEnd(selector, i);
      const inner = selector.slice(i + 1, end);
      i = end + 1;
      if (name === "where") continue;
      if (name === "is" || name === "not" || name === "has") {
        const most = selectorList(inner).map(specificity).sort((a, b) => (outranks(a, b) ? -1 : 1))[0] ?? [0, 0, 0];
        s[0] += most[0];
        s[1] += most[1];
        s[2] += most[2];
      } else {
        s[1]++;
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      s[2]++;
      i = nameEnd(selector, i);
    } else {
      i++;
    }
  }
  return s;
}

function outranks(a: Specificity, b: Specificity): boolean {
  for (let k = 0; k < 3; k++) if ((a[k] ?? 0) !== (b[k] ?? 0)) return (a[k] ?? 0) > (b[k] ?? 0);
  return false;
}

/**
 * Every registered screen, drawn once for each kind of strip, and with each sheet,
 * list or dialog a control on it opens over the screen with the first strip.
 */
async function drawScreens(): Promise<HTMLElement[]> {
  const roots: HTMLElement[] = [];
  const registry = buildRegistry();
  const draw = async (id: string, strip: string): Promise<HTMLElement> => {
    const model = unitById("URX44V");
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(model)));
    const shell = new Shell(registry, store, model);
    shell.ctx.nav.push({ id, strip });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return shell.root;
  };
  for (const id of registry.ids()) {
    for (const strip of STRIPS) roots.push(await draw(id, strip));
    // One control of each kind is touched, each on a screen of its own, so one
    // opening cannot hide another.
    const controls = (root: HTMLElement): Element[] => [...root.querySelectorAll(OPENERS)];
    const kinds = new Map<string, number>();
    for (const [i, node] of controls(await draw(id, STRIPS[0] ?? "ch1")).entries()) {
      const kind = `${node.tagName} ${node.getAttribute("class") ?? ""}`;
      if (!kinds.has(kind)) kinds.set(kind, i);
    }
    for (const i of kinds.values()) {
      const root = await draw(id, STRIPS[0] ?? "ch1");
      controls(root)[i]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (root.querySelector("[data-overlay]")) roots.push(root);
    }
  }
  return roots;
}

/**
 * The selectors the reset outranks that set one of `props` and reach only controls,
 * and so are overridden on everything they reach, with how many of the selectors the
 * reset outranks reached anything.
 */
function overridden(css: string, roots: HTMLElement[], props = FONT): { dead: string[]; reaching: number } {
  const reset = specificity(".lcd button");
  const dead: string[] = [];
  let reaching = 0;
  for (const rule of styleRules(css)) {
    if (rule.selectors.includes(".lcd button")) continue;
    const font = props.filter((p) => rule.body[p] !== undefined && !rule.body[p]?.includes("!important"));
    if (font.length === 0) continue;
    for (const selector of rule.selectors) {
      if (outranks(specificity(selector), reset)) continue;
      // A colour set on a pseudo-element is its own: the reset reaches only the control.
      if (props === COLOUR && /::?(before|after)\b/.test(selector)) continue;
      // A pseudo-element's box takes the font its element has.
      const subject = selector.replace(/::?(before|after)\b/g, "");
      let controls = 0;
      let others = 0;
      for (const root of roots) {
        let hits: Element[];
        try {
          hits = [...(root.matches(subject) ? [root] : []), ...root.querySelectorAll(subject)];
        } catch {
          continue;
        }
        for (const node of hits) {
          if (CONTROLS.has(node.tagName)) controls++;
          else others++;
        }
      }
      if (controls + others > 0) reaching++;
      if (controls > 0 && others === 0) {
        dead.push(`${selector} { ${font.map((p) => `${p}: ${rule.body[p]}`).join("; ")} }`);
      }
    }
  }
  return { dead, reaching };
}

let roots: HTMLElement[] = [];
beforeAll(async () => {
  roots = await drawScreens();
});

describe("the colour a rule gives a control", () => {
  it("is not taken back by the reset that hands every control its surroundings' colour", () => {
    expect(declarations(CSS, ".lcd button")["color"]).toBe("inherit");
    const { dead, reaching } = overridden(CSS, roots, COLOUR);
    expect(dead).toEqual([]);
    expect(reaching, "the sweep found rules the reset outranks that set a colour on the drawn screens").toBeGreaterThan(REACHING_FLOOR);
  });

  it("finds a one-class colour on a control, so the sweep cannot pass vacuously", () => {
    const { dead } = overridden(`${CSS}\n.patch-default { color: #123456; }`, roots, COLOUR);
    expect(dead).toEqual([".patch-default { color: #123456 }"]);
  });

  it("leaves a colour set on a control's pseudo-element to it", () => {
    const { dead } = overridden(`${CSS}\n.patch-default::after { color: #123456; }`, roots, COLOUR);
    expect(dead).toEqual([]);
  });
});

describe("the font a rule gives a control", () => {
  it("is not taken back by the reset that hands every control its surroundings' font", () => {
    expect(declarations(CSS, ".lcd button")["font"]).toBe("inherit");
    const { dead, reaching } = overridden(CSS, roots);
    expect(dead).toEqual([]);
    expect(reaching, "the sweep found rules the reset outranks that set a font on the drawn screens").toBeGreaterThan(REACHING_FLOOR);
  });

  it("reads specificity the way the cascade does", () => {
    expect(specificity(".lcd button")).toEqual([0, 1, 1]);
    expect(specificity(".btn.patch-default")).toEqual([0, 2, 0]);
    expect(specificity(".menu-grid.menu-grid-wide .menu-btn > span")).toEqual([0, 3, 1]);
    expect(specificity(":where(.menu-btn, .lang-btn) .x")).toEqual([0, 1, 0]);
    expect(specificity(".pulldown:not(.eq-screen > .pulldown)")).toEqual([0, 3, 0]);
    expect(specificity(".side-tab::after")).toEqual([0, 1, 1]);
    expect(outranks(specificity(".btn.patch-default"), specificity(".lcd button"))).toBe(true);
    expect(outranks(specificity(".patch-default"), specificity(".lcd button"))).toBe(false);
  });

  it("reads the rules inside an at-rule, and no keyframe step as a rule", () => {
    const read = styleRules("@media (x) {\n  .a { font-size: 1px; }\n}\n@keyframes k {\n  from { opacity: 0; }\n  50% { opacity: 1; }\n}\n.b { font-weight: 700; }");
    expect(read).toEqual([
      { selectors: [".a"], body: { "font-size": "1px" } },
      { selectors: [".b"], body: { "font-weight": "700" } },
    ]);
  });

  it("finds a one-class font on a control, so the sweep cannot pass vacuously", () => {
    const { dead } = overridden(`${CSS}\n.patch-default { font-weight: 600; }`, roots);
    expect(dead).toEqual([".patch-default { font-weight: 600 }"]);
  });
});
