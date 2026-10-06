import { describe, expect, it, vi } from "vitest";
import { Navigator } from "./navigator";

describe("Navigator", () => {
  it("starts on HOME", () => {
    expect(new Navigator().current.id).toBe("home");
  });

  it("starts on the top of what it is given over HOME, and steps back down to HOME", () => {
    const nav = new Navigator({ id: "home" }, [{ id: "channel-view", strip: "ch1" }, { id: "ch.eq", strip: "ch1" }]);
    expect([nav.current, nav.depth]).toEqual([{ id: "ch.eq", strip: "ch1" }, 3]);
    nav.back();
    expect(nav.current).toEqual({ id: "channel-view", strip: "ch1" });
    nav.back();
    expect([nav.current.id, nav.canGoBack]).toEqual(["home", false]);
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

  it("steps the screen on top and every channel screen under it onto a strip, and leaves the rest", () => {
    const nav = new Navigator();
    const listener = vi.fn();
    nav.push({ id: "channel-view", strip: "ch1" });
    nav.push({ id: "ch.gate" });
    nav.onChange(listener);

    nav.stepStrip("ch3");

    expect(listener).toHaveBeenCalledTimes(1);
    expect([nav.current, nav.depth]).toEqual([{ id: "ch.gate", strip: "ch3" }, 3]);
    nav.back();
    expect(nav.current).toEqual({ id: "channel-view", strip: "ch3" });
    nav.back();
    expect(nav.current, "HOME carries no strip").toEqual({ id: "home" });
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
