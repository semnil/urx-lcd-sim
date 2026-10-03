import { afterEach, describe, expect, it } from "vitest";
import type { Press } from "./press";
import { attachPress, bandDepth } from "./press";

describe("the band a control's shadow draws", () => {
  it("reads the depth of an inset shadow straight up from the bottom edge", () => {
    expect(bandDepth("rgb(49, 57, 58) 0px -3px 0px 0px inset")).toBe(3);
    expect(bandDepth("rgba(0, 0, 0, 0.27) 0px -4px 0px 0px inset")).toBe(4);
    expect(bandDepth("inset 0 -3px 0 #00000045"), "as declared").toBe(3);
    expect(bandDepth("rgb(0, 0, 0) 0px 2px 4px 0px, rgb(49, 57, 58) 0px -3px 0px 0px inset"), "among other shadows").toBe(3);
  });

  it("finds no band in a shadow that is not one", () => {
    expect(bandDepth("none")).toBe(0);
    expect(bandDepth("")).toBe(0);
    expect(bandDepth("rgb(0, 0, 0) 0px -3px 0px 0px"), "not inset").toBe(0);
    expect(bandDepth("rgb(0, 0, 0) 2px -3px 0px 0px inset"), "sideways").toBe(0);
    expect(bandDepth("rgb(0, 0, 0) 0px 3px 0px 0px inset"), "from the top").toBe(0);
    expect(bandDepth("rgb(0, 0, 0) 0px -3px 2px 0px inset"), "blurred").toBe(0);
  });
});

describe("a pressed control", () => {
  const cleanups: (() => void)[] = [];
  afterEach(() => {
    for (const c of cleanups.splice(0)) c();
    document.body.innerHTML = "";
  });

  const mount = (): { root: HTMLElement; banded: HTMLButtonElement; plain: HTMLButtonElement; off: HTMLButtonElement; press: Press } => {
    const root = document.createElement("div");
    const button = (shadow: string): HTMLButtonElement => {
      const b = document.createElement("button");
      b.style.boxShadow = shadow;
      b.appendChild(document.createElement("span"));
      root.appendChild(b);
      return b;
    };
    const banded = button("inset 0 -3px 0 rgb(49, 57, 58)");
    banded.style.translate = "2px -1px";
    const plain = button("none");
    const off = button("inset 0 -3px 0 rgb(49, 57, 58)");
    off.setAttribute("aria-disabled", "true");
    document.body.appendChild(root);
    const press = attachPress(root);
    cleanups.push(() => press.off());
    return { root, banded, plain, off, press };
  };

  const down = (node: Element | null): void => {
    node?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  };

  it("sinks the depth of its band while held, from where its own translate put it, and rises when let go", () => {
    const { banded } = mount();
    // The cut follows the face: each corner is rounded as the control has it.
    banded.style.borderTopLeftRadius = "4px";
    banded.style.borderBottomRightRadius = "3px";
    banded.style.borderBottomLeftRadius = "2px";
    down(banded.firstElementChild);
    // The corner it leaves square reads back as `0px` in the browser and as `0` in jsdom.
    expect([banded.classList.contains("is-pressed"), banded.style.getPropertyValue("--press"), banded.style.getPropertyValue("--press-radius").split(" "), banded.style.translate]).toEqual([
      true,
      "3px",
      ["4px", expect.stringMatching(/^0(px)?$/), "3px", "2px"],
      "2px calc(-1px + 3px)",
    ]);
    window.dispatchEvent(new MouseEvent("pointerup"));
    expect([banded.classList.contains("is-pressed"), banded.style.getPropertyValue("--press"), banded.style.translate]).toEqual([false, "", ""]);
  });

  it("leaves a control with no band, or one out of reach, where it stands", () => {
    const { plain, off } = mount();
    down(plain);
    down(off);
    expect([plain.classList.contains("is-pressed"), off.classList.contains("is-pressed")]).toEqual([false, false]);
  });

  it("leaves a control whose touch only brings the focus to it where it stands", () => {
    const { banded } = mount();
    banded.setAttribute("data-press", "none");
    down(banded);
    expect(banded.classList.contains("is-pressed"), "the touch that brings the focus").toBe(false);
    // The next touch acts, so the control sinks for it.
    banded.removeAttribute("data-press");
    down(banded);
    expect(banded.classList.contains("is-pressed"), "the touch that opens").toBe(true);
  });

  it("sinks the control holding the focus while Enter or Space is down, and the one the focus comes back to after a redraw", () => {
    const { banded, root } = mount();
    const key = (type: string, k: string, target: EventTarget = document.activeElement ?? window): void => {
      target.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true }));
    };
    banded.focus();
    key("keydown", "a");
    expect(banded.classList.contains("is-pressed"), "another key").toBe(false);
    key("keydown", "Enter");
    expect([banded.classList.contains("is-pressed"), banded.style.getPropertyValue("--press")]).toEqual([true, "3px"]);
    // The key repeating while held leaves the sunk control as it is, so the slide does not start over.
    const watch = new MutationObserver(() => undefined);
    watch.observe(banded, { attributes: true });
    key("keydown", "Enter");
    expect(watch.takeRecords(), "the key repeating").toEqual([]);
    watch.disconnect();
    // The screen is drawn again: the control is replaced and the focus goes back to the new one.
    const next = document.createElement("button");
    next.style.boxShadow = "inset 0 -3px 0 rgb(49, 57, 58)";
    banded.replaceWith(next);
    next.focus();
    expect(next.classList.contains("is-pressed"), "the control drawn in its place").toBe(true);
    key("keyup", "Enter", window);
    expect(next.classList.contains("is-pressed"), "let go").toBe(false);
    next.focus();
    key("keydown", " ");
    const spaceHeld = next.classList.contains("is-pressed");
    key("keyup", " ", window);
    expect([spaceHeld, next.classList.contains("is-pressed"), root.contains(next)]).toEqual([true, false, true]);
  });

  it("lets the keyed control rise, and sinks nothing else, when the focus moves on while it stays on the glass", () => {
    const { banded, plain, root } = mount();
    const banding = (b: HTMLButtonElement): HTMLButtonElement => {
      b.style.boxShadow = "inset 0 -3px 0 rgb(49, 57, 58)";
      return b;
    };
    const ok = banding(document.createElement("button"));
    const enter = (node: HTMLElement): void => {
      node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    };
    const up = (): void => {
      window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    };
    const pressedOf = (...nodes: HTMLElement[]): boolean[] => nodes.map((n) => n.classList.contains("is-pressed"));

    // A dialog the key opened after the glass saw the key takes the focus to its own button.
    plain.focus();
    enter(plain);
    root.appendChild(ok);
    ok.focus();
    const late = pressedOf(ok);
    up();
    ok.remove();

    // The control's own handler opens the dialog before the key reaches the glass.
    banded.addEventListener(
      "keydown",
      () => {
        root.appendChild(ok);
        ok.focus();
      },
      { once: true },
    );
    banded.focus();
    enter(banded);
    const early = pressedOf(banded, ok);
    up();
    ok.remove();

    // The key held on a sunk control, then the focus moves to another one.
    banded.focus();
    enter(banded);
    const held = pressedOf(banded);
    root.appendChild(ok);
    ok.focus();
    const moved = pressedOf(banded, ok);
    up();

    // The control's own handler draws it again before the key reaches the glass.
    const next = banding(document.createElement("button"));
    banded.addEventListener(
      "keydown",
      () => {
        banded.replaceWith(next);
        next.focus();
      },
      { once: true },
    );
    banded.focus();
    enter(banded);
    expect({ late, early, held, moved, redrawn: pressedOf(next) }).toEqual({
      late: [false],
      early: [false, false],
      held: [true],
      moved: [false, false],
      redrawn: [true],
    });
  });

  it("lets go of one control when the pointer goes down on another", () => {
    const { banded, root } = mount();
    const second = document.createElement("button");
    second.style.boxShadow = "inset 0 -4px 0 rgb(0, 0, 0)";
    root.appendChild(second);
    down(banded);
    down(second);
    expect([banded.classList.contains("is-pressed"), second.classList.contains("is-pressed"), second.style.getPropertyValue("--press")]).toEqual([false, true, "4px"]);
  });

  it("keeps each finger's control down until that finger is let go", () => {
    const { banded, root } = mount();
    const second = document.createElement("button");
    second.style.boxShadow = "inset 0 -4px 0 rgb(0, 0, 0)";
    root.appendChild(second);
    const finger = (type: string, node: EventTarget, pointerId: number): void => {
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: "touch" }));
    };
    const sunk = (): boolean[] => [banded, second].map((b) => b.classList.contains("is-pressed"));

    finger("pointerdown", banded, 1);
    finger("pointerdown", second, 2);
    expect(sunk(), "a second finger on another control").toEqual([true, true]);
    finger("pointerup", window, 2);
    expect(sunk(), "the second finger let go").toEqual([true, false]);

    // Two fingers on one control: it sinks once, and rises when the last of them is let go.
    finger("pointerdown", banded, 3);
    expect(banded.style.translate, "sunk once").toBe("2px calc(-1px + 3px)");
    finger("pointercancel", window, 1);
    expect(sunk(), "the first finger cancelled").toEqual([true, false]);
    finger("pointerup", window, 3);
    expect([...sunk(), banded.style.translate], "both let go").toEqual([false, false, ""]);
  });

  it("leaves the control the key holds down while a pointer presses another and lets go", () => {
    const { banded, root } = mount();
    const second = document.createElement("button");
    second.style.boxShadow = "inset 0 -4px 0 rgb(0, 0, 0)";
    root.appendChild(second);
    banded.focus();
    banded.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    second.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "mouse" }));
    const pressing = [banded.classList.contains("is-pressed"), second.classList.contains("is-pressed")];
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse" }));
    const released = [banded.classList.contains("is-pressed"), second.classList.contains("is-pressed")];
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter" }));
    expect({ pressing, released, keyUp: banded.classList.contains("is-pressed") }).toEqual({
      pressing: [true, true],
      released: [true, false],
      keyUp: false,
    });
  });

  it("keeps each pointer's control down in the control drawn in its place, until that pointer is let go", () => {
    const { banded, root, press } = mount();
    const second = document.createElement("button");
    second.className = "second";
    second.style.boxShadow = "inset 0 -4px 0 rgb(0, 0, 0)";
    root.appendChild(second);
    const finger = (type: string, node: EventTarget, pointerId: number): void => {
      node.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId, pointerType: "touch" }));
    };
    // A control of the same kind drawn anew in the place of `old`, as the screen draws it.
    const redraw = (old: HTMLButtonElement, shadow: string, translate = ""): HTMLButtonElement => {
      const next = document.createElement("button");
      next.className = old.className.replace(/\bis-\S+/g, "").trim();
      next.style.boxShadow = shadow;
      if (translate) next.style.translate = translate;
      old.replaceWith(next);
      return next;
    };

    finger("pointerdown", banded, 1);
    finger("pointerdown", second, 2);
    const both = press.carry();
    const first = redraw(banded, "inset 0 -3px 0 rgb(49, 57, 58)", "2px -1px");
    const other = redraw(second, "inset 0 -4px 0 rgb(0, 0, 0)");
    both();
    const sunk = (): boolean[] => [first, other].map((b) => b.classList.contains("is-pressed"));
    expect([...sunk(), first.style.translate], "drawn again under two fingers").toEqual([true, true, "2px calc(-1px + 3px)"]);
    expect([first, other].map((b) => b.classList.contains("is-carried")), "down already, so they do not slide down again").toEqual([true, true]);
    finger("pointerup", window, 2);
    expect([...sunk(), other.classList.contains("is-carried")], "the second finger let go").toEqual([true, false, false]);

    const one = press.carry();
    const again = redraw(first, "inset 0 -3px 0 rgb(49, 57, 58)");
    one();
    expect(again.classList.contains("is-pressed"), "drawn again under one finger").toBe(true);
    finger("pointercancel", window, 1);
    expect(again.classList.contains("is-pressed"), "the finger cancelled").toBe(false);
  });

  it("sinks nothing in the place of a held control drawn again as a control of another kind", () => {
    const { banded, press } = mount();
    banded.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
    const carried = press.carry();
    const next = document.createElement("button");
    next.className = "another";
    next.style.boxShadow = "inset 0 -3px 0 rgb(49, 57, 58)";
    banded.replaceWith(next);
    carried();
    expect(next.classList.contains("is-pressed")).toBe(false);
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "touch" }));
  });

  it("lets every control rise when the window loses the focus", () => {
    const { banded, root } = mount();
    const second = document.createElement("button");
    second.style.boxShadow = "inset 0 -4px 0 rgb(0, 0, 0)";
    root.appendChild(second);
    banded.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, pointerType: "touch" }));
    second.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 2, pointerType: "touch" }));
    window.dispatchEvent(new Event("blur"));
    expect([banded.classList.contains("is-pressed"), second.classList.contains("is-pressed")]).toEqual([false, false]);
  });
});
