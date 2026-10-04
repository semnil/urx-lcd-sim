import { describe, expect, it } from "vitest";
import { el, makeTappable, tappedControl } from "./dom";

describe("a tappable area", () => {
  function area(): { node: HTMLElement; fired: () => number } {
    const node = document.createElement("div");
    let count = 0;
    makeTappable(node, () => {
      count += 1;
    });
    return { node, fired: () => count };
  }

  it("answers a tap on itself", () => {
    const { node, fired } = area();
    node.click();
    expect(fired()).toBe(1);
  });

  it("answers a tap on its own decoration", () => {
    const { node, fired } = area();
    const label = document.createElement("span");
    node.appendChild(label);
    label.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(fired()).toBe(1);
  });

  it("leaves a control inside it to answer for itself", () => {
    // The head-amp cell opens a screen and holds AUTO / SAFE and a value box:
    // without this, pressing one of those would also open the screen.
    for (const inner of [document.createElement("button"), Object.assign(document.createElement("div"), {})]) {
      if (inner.tagName !== "BUTTON") inner.setAttribute("role", "spinbutton");
      const { node, fired } = area();
      node.appendChild(inner);
      inner.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(fired(), `${inner.tagName}${inner.getAttribute("role") ?? ""} should keep its click`).toBe(0);
    }
  });

  it("answers Enter and Space when the key is let go, as a finger answers when it leaves the glass", () => {
    const key = (node: HTMLElement, type: string, k: string): void => {
      node.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
    };
    const counts: number[] = [];
    for (const k of ["Enter", " "]) {
      const { node, fired } = area();
      key(node, "keydown", k);
      counts.push(fired());
      key(node, "keyup", k);
      counts.push(fired());
    }
    // The key went down on another control, or on the one a redraw replaced.
    const { node, fired } = area();
    key(node, "keyup", "Enter");
    counts.push(fired());

    // The key went down on the area and was let go on a control inside it.
    const area2 = area();
    const inner = document.createElement("button");
    area2.node.appendChild(inner);
    document.body.appendChild(area2.node);
    area2.node.focus();
    key(area2.node, "keydown", "Enter");
    inner.focus();
    key(inner, "keyup", "Enter");
    counts.push(area2.fired());
    area2.node.remove();
    expect(counts).toEqual([0, 1, 0, 1, 0, 0]);
  });

  it("leaves Enter and Space on a control inside it to that control, as it leaves the control's tap", () => {
    // The channel view's blocks open their screens and carry their own switches:
    // without this, Enter on a switch would also open the block's screen.
    const key = (node: HTMLElement, type: string, k: string): void => {
      node.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
    };
    const counts: number[] = [];
    for (const k of ["Enter", " "]) {
      const outer = area();
      const inner = area();
      outer.node.appendChild(inner.node);
      key(inner.node, "keydown", k);
      key(inner.node, "keyup", k);
      counts.push(inner.fired(), outer.fired());
    }

    // The key went down on a control inside it and was let go on the area itself.
    const outer = area();
    const inner = area();
    outer.node.appendChild(inner.node);
    document.body.appendChild(outer.node);
    inner.node.focus();
    key(inner.node, "keydown", "Enter");
    outer.node.focus();
    key(outer.node, "keyup", "Enter");
    counts.push(inner.fired(), outer.fired());
    outer.node.remove();
    expect(counts).toEqual([1, 0, 1, 0, 0, 0]);
  });

  it("is the control being answered while its handler runs, by a tap or a key, and none once its handler is done, a failed one included", () => {
    const seen: (string | null | undefined)[] = [];
    const tapped = (): string => tappedControl()?.getAttribute("aria-label") ?? "none";
    const named = (name: string, then: () => void): HTMLElement =>
      el("button", {
        attrs: { "aria-label": name },
        onTap: () => {
          seen.push(tapped());
          then();
          seen.push(tapped());
        },
      });
    const inner = named("inner", () => undefined);
    const outer = named("outer", () => inner.click());
    outer.click();
    seen.push(tapped());
    for (const type of ["keydown", "keyup"]) inner.dispatchEvent(new KeyboardEvent(type, { key: "Enter", bubbles: true, cancelable: true }));
    seen.push(tapped());
    expect(seen).toEqual(["outer", "inner", "inner", "outer", "none", "inner", "inner", "none"]);

    const failing = el("button", {
      attrs: { "aria-label": "failing" },
      onTap: () => {
        throw new Error("the handler failed");
      },
    });
    // The failure is reported on the window rather than thrown out of the click.
    const reported: unknown[] = [];
    const onError = (ev: ErrorEvent): void => {
      reported.push(ev.error);
      ev.preventDefault();
    };
    window.addEventListener("error", onError);
    try {
      failing.click();
    } finally {
      window.removeEventListener("error", onError);
    }
    expect([reported.length, tapped()]).toEqual([1, "none"]);
  });
});

describe("the inline styles an element is built with", () => {
  it("sets a custom property as one, not as a plain style name", () => {
    // The strip rail and the channel chip's underline are painted from a custom
    // property. Assigned as a plain name it lands nowhere and says nothing.
    const node = el("div", { style: { "--rail": "#1965ff", width: "12px" } });
    expect(node.style.getPropertyValue("--rail")).toBe("#1965ff");
    expect(node.style.width).toBe("12px");
  });
});
