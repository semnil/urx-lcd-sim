import { afterEach, describe, expect, it } from "vitest";
import { activeIn, elementAt, originOf } from "./active";

afterEach(() => {
  document.body.replaceChildren();
});

/** A button drawn in a shadow tree under a host on the page, and a button on the page itself. */
function glassAndPage(): { host: HTMLElement; tree: ShadowRoot; inner: HTMLButtonElement; outer: HTMLButtonElement } {
  const host = document.createElement("div");
  const tree = host.attachShadow({ mode: "open" });
  const inner = document.createElement("button");
  tree.appendChild(inner);
  const outer = document.createElement("button");
  document.body.append(host, outer);
  return { host, tree, inner, outer };
}

describe("the focus and the events of a glass in a shadow tree", () => {
  it("reads the focus in the tree a node is in, where the document reads the host", () => {
    const { host, inner, outer } = glassAndPage();
    inner.focus();
    expect(document.activeElement, "the document reads the host").toBe(host);
    expect(activeIn(inner)).toBe(inner);
    outer.focus();
    expect(activeIn(outer)).toBe(outer);
    expect(activeIn(inner), "nothing in the glass holds it").toBeNull();
  });

  it("names the element an event was sent to inside the tree, and the target of one not sent at all", () => {
    const { inner } = glassAndPage();
    let seen: EventTarget | null = null;
    document.addEventListener("pointerdown", (ev) => (seen = originOf(ev)), { once: true });
    inner.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
    expect(seen, "inside the tree, where the document is told the host").toBe(inner);
    const unsent = new Event("pointerdown");
    expect(originOf(unsent)).toBe(unsent.target);
  });

  it("asks the tree a node is in for the element under a point", () => {
    const { tree, inner, outer } = glassAndPage();
    const asked: string[] = [];
    Object.defineProperty(tree, "elementFromPoint", { value: () => (asked.push("tree"), inner), configurable: true });
    Object.defineProperty(document, "elementFromPoint", { value: () => (asked.push("document"), outer), configurable: true });
    try {
      expect(elementAt(inner, 1, 2)).toBe(inner);
      expect(elementAt(outer, 1, 2)).toBe(outer);
      expect(asked).toEqual(["tree", "document"]);
    } finally {
      delete (document as { elementFromPoint?: unknown }).elementFromPoint;
    }
  });
});
