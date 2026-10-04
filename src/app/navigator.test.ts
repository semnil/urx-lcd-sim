import { describe, expect, it, vi } from "vitest";
import { Navigator } from "./navigator";

describe("Navigator", () => {
  it("starts on HOME", () => {
    expect(new Navigator().current.id).toBe("home");
  });

  it("pops one screen per back, and never past HOME", () => {
    const nav = new Navigator();
    nav.push({ id: "setup" });
    nav.push({ id: "setup.version" });

    nav.back();
    expect(nav.current.id).toBe("setup");
    nav.back();
    expect(nav.current.id).toBe("home");
    nav.back();
    expect(nav.current.id).toBe("home");
    expect(nav.canGoBack).toBe(false);
    expect(nav.depth, "HOME stays on the stack").toBe(1);
  });

  it("empties the stack down to HOME", () => {
    const nav = new Navigator();
    nav.push({ id: "setup" });
    nav.push({ id: "setup.udk" });

    nav.home();

    expect(nav.current.id).toBe("home");
    expect(nav.depth).toBe(1);
  });

  it("leaves a top-level screen one back-step from HOME", () => {
    const nav = new Navigator();
    nav.push({ id: "setup" });
    nav.push({ id: "setup.version" });

    nav.openTop({ id: "monitor" });

    expect(nav.current.id).toBe("monitor");
    nav.back();
    expect(nav.current.id).toBe("home");
  });

  it("keeps the strip argument when a channel screen switches channels", () => {
    const nav = new Navigator();
    nav.push({ id: "ch.gate", strip: "ch1" });

    nav.replace({ id: "ch.gate", strip: "ch2" });

    expect(nav.current).toEqual({ id: "ch.gate", strip: "ch2" });
    expect(nav.depth).toBe(2);
  });

  it("notifies once per move", () => {
    const nav = new Navigator();
    const listener = vi.fn();
    nav.onChange(listener);

    nav.push({ id: "scene" });
    nav.back();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("names each move by the method that made it", () => {
    const nav = new Navigator();
    const moves: string[] = [];
    nav.onChange((_route, change) => moves.push(change));

    nav.push({ id: "setup" });
    nav.replace({ id: "monitor" });
    nav.back();
    nav.home();
    nav.openTop({ id: "scene" });

    expect(moves).toEqual(["push", "replace", "back", "home", "openTop"]);
  });

  it("does not stack a top-level screen on itself", () => {
    const nav = new Navigator();
    nav.openTop({ id: "home" });
    expect(nav.depth).toBe(1);
  });
});
