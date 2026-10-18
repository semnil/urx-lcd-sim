import { afterEach, describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import type { Route } from "../app/navigator";
import { perform } from "../app/perform";
import { SimTransport } from "../device/sim-transport";
import { DeviceStore } from "../device/store";
import type { UnitActions, UnitOp } from "../device/unit";
import { emulatedActions } from "../device/unit";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { openTimeZone } from "../screens/date-time";
import { openTitleEntry } from "../screens/title-entry";
import { UDK_KNOBS, udkPath } from "../model/udk";
import { el, markShut, writes } from "./dom";
import { LOCK_MARK_CLASS, Locks, type SimLock, drawLocks } from "./locks";

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const shells: Shell[] = [];

async function shellOn(routes: Route[], locks: readonly SimLock[] = [], actions: UnitActions = emulatedActions): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model, routes, { actions, ownsDocument: false, locks });
  shells.push(shell);
  document.body.appendChild(shell.root);
  await flush();
  return shell;
}

afterEach(() => {
  for (const shell of shells.splice(0)) shell.destroy();
  document.body.replaceChildren();
});

const REASON = "Held by the page for now";

/** Whether `node` is drawn as a control the page holds shut, for `reason`. */
function drawnShut(node: Element | null | undefined, reason = REASON): void {
  expect(node, "the control is on the glass").toBeTruthy();
  expect(node?.classList.contains("is-held-shut")).toBe(true);
  expect(node?.classList.contains("is-disabled"), "with the face of a control out of reach").toBe(true);
  expect(node?.getAttribute("aria-disabled")).toBe("true");
  expect(node?.getAttribute("title"), "the reason as its tooltip").toBe(reason);
  expect(node?.getAttribute("aria-description"), "and as its description").toBe(reason);
  const mark = [...(node?.children ?? [])].find((c) => c.classList.contains(LOCK_MARK_CLASS));
  expect(mark, "a padlock on it").toBeTruthy();
  expect(mark?.getAttribute("aria-hidden")).toBe("true");
  expect(mark?.querySelector("svg"), "drawn inline").not.toBeNull();
}

/** Whether `node` carries nothing of a lock. */
function drawnOpen(node: Element | null | undefined): void {
  expect(node, "the control is on the glass").toBeTruthy();
  expect(node?.classList.contains("is-held-shut")).toBe(false);
  expect(node?.classList.contains("is-disabled")).toBe(false);
  expect(node?.hasAttribute("aria-disabled")).toBe(false);
  expect(node?.hasAttribute("title")).toBe(false);
  expect(node?.hasAttribute("aria-description")).toBe(false);
  expect(node?.querySelector(`.${LOCK_MARK_CLASS}`)).toBeNull();
}

const key = (node: Element | null | undefined, k: string): void => {
  node?.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  node?.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true }));
};

const byText = (shell: Shell, selector: string, text: string): HTMLElement | undefined =>
  [...shell.root.querySelectorAll<HTMLElement>(selector)].find((n) => n.textContent === text);

describe("a screen the page holds shut", () => {
  const icon = (shell: Shell, label: string): HTMLElement | null => shell.root.querySelector<HTMLElement>(`.icon-btn[aria-label='${label}']`);

  it("draws HOME's button for it shut, and opens nothing on a touch, Enter or Space", async () => {
    const shell = await shellOn([], [{ target: { kind: "screen", id: "setup" }, reason: REASON }]);
    drawnShut(icon(shell, "SETUP"));
    icon(shell, "SETUP")?.click();
    key(icon(shell, "SETUP"), "Enter");
    key(icon(shell, "SETUP"), " ");
    await flush();
    expect(shell.ctx.nav.current.id).toBe("home");
  });

  it("leaves the buttons for other screens as they were", async () => {
    const shell = await shellOn([], [{ target: { kind: "screen", id: "setup" }, reason: REASON }]);
    drawnOpen(icon(shell, "MONITOR"));
    icon(shell, "MONITOR")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("monitor");
  });

  it("draws SETUP's menu entry for it shut and refuses the screen however it is asked for", async () => {
    const shell = await shellOn([{ id: "setup" }], [{ target: { kind: "screen", id: "setup.language" }, reason: REASON }]);
    const entry = (): HTMLElement | undefined => byText(shell, ".menu-btn", "Language");
    drawnShut(entry());
    drawnOpen(byText(shell, ".menu-btn", "Brightness"));
    entry()?.click();
    shell.ctx.nav.push({ id: "setup.language" });
    await flush();
    expect(shell.ctx.nav.current.id).toBe("setup");
  });

  it("opens again once the page lets it go", async () => {
    const shell = await shellOn([], [{ target: { kind: "screen", id: "setup" }, reason: REASON }]);
    shell.setLocks([]);
    drawnOpen(icon(shell, "SETUP"));
    icon(shell, "SETUP")?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("setup");
  });

  it("takes the reason the page gives last", async () => {
    const shell = await shellOn([], [{ target: { kind: "screen", id: "setup" }, reason: REASON }]);
    shell.setLocks([{ target: { kind: "screen", id: "setup" }, reason: "Another reason" }]);
    drawnShut(icon(shell, "SETUP"), "Another reason");
    expect(icon(shell, "SETUP")?.querySelectorAll(`.${LOCK_MARK_CLASS}`).length, "one padlock").toBe(1);
  });
});

describe("a value the page holds shut", () => {
  const BRIGHTNESS = "setup.brightness";
  const brightness = (shell: Shell): number => shell.ctx.store.num(BRIGHTNESS, Number.NaN);
  const box = (shell: Shell): HTMLElement | null => shell.root.querySelector<HTMLElement>(".param-cell .value-box");

  async function brightnessShut(): Promise<Shell> {
    const shell = await shellOn([{ id: "setup" }, { id: "setup.brightness" }]);
    await shell.ctx.store.set(BRIGHTNESS, 5);
    shell.setLocks([{ target: { kind: "path", path: BRIGHTNESS }, reason: REASON }]);
    await flush();
    return shell;
  }

  it("draws the box and the knob that turn it shut", async () => {
    const shell = await brightnessShut();
    drawnShut(box(shell));
    drawnShut(shell.root.querySelector(".param-cell .knob-graphic.is-control"));
  });

  it("turns nothing by a key, the wheel or a drag", async () => {
    const shell = await brightnessShut();
    key(box(shell), "ArrowDown");
    key(box(shell), "Home");
    box(shell)?.dispatchEvent(new WheelEvent("wheel", { deltaY: 100, bubbles: true, cancelable: true }));
    box(shell)?.dispatchEvent(new MouseEvent("pointerdown", { clientX: 100, clientY: 100, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointermove", { clientX: 100, clientY: 160, bubbles: true }));
    window.dispatchEvent(new MouseEvent("pointerup", { clientX: 100, clientY: 160, bubbles: true }));
    await flush();
    expect(brightness(shell)).toBe(5);
  });

  it("turns by the key once the page lets it go", async () => {
    const shell = await brightnessShut();
    shell.setLocks([]);
    await flush();
    drawnOpen(box(shell));
    key(box(shell), "ArrowDown");
    await flush();
    expect(brightness(shell)).toBe(4);
  });

  it("draws the switch that writes it shut, and the switch writes nothing", async () => {
    const shell = await shellOn([{ id: "setup" }, { id: "setup.rate" }]);
    // The unit on its own clock before the page holds the switch, so the rates beside it are the ones to press.
    await shell.ctx.store.set("setup.followUsb", false);
    shell.setLocks([{ target: { kind: "path", path: "setup.followUsb" }, reason: REASON }]);
    await flush();
    const follow = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".follow-usb");
    drawnShut(follow());
    follow()?.click();
    key(follow(), "Enter");
    await flush();
    expect(shell.ctx.store.bool("setup.followUsb", true)).toBe(false);
    drawnOpen(byText(shell, ".rate-btn", "96kHz"));
  });

  it("draws the pulldown that picks it shut, and opens no list", async () => {
    const shell = await shellOn([{ id: "setup" }, { id: "setup.datetime" }], [{ target: { kind: "path", path: "setup.dateTime.dateFormat" }, reason: REASON }]);
    const boxes = [...shell.root.querySelectorAll<HTMLElement>(".pulldown")];
    const date = boxes.find((n) => n.getAttribute("aria-label")?.startsWith("Date:"));
    const time = boxes.find((n) => n.getAttribute("aria-label")?.startsWith("Time:"));
    drawnShut(date);
    drawnOpen(time);
    date?.click();
    await flush();
    expect(date?.getAttribute("aria-expanded")).toBe("false");
    expect(shell.root.querySelector("[data-overlay]")).toBeNull();
  });

  it("draws RECORDER's Track Count box shut, opens no list, and keeps the count", async () => {
    const shell = await shellOn([{ id: "microsd" }, { id: "microsd.recorder" }], [{ target: { kind: "path", path: "sd.trackCount" }, reason: REASON }]);
    const box = shell.root.querySelector<HTMLElement>(".dropdown-box");
    expect(box?.getAttribute("aria-label")).toBe("Track Count: 16 Tracks");
    drawnShut(box);
    box?.click();
    key(box, "Enter");
    await flush();
    expect(box?.getAttribute("aria-expanded")).toBe("false");
    expect(shell.root.querySelector(".rec-track-list")).toBeNull();
    expect(shell.ctx.store.num("sd.trackCount", Number.NaN)).toBe(16);
  });

  it("opens RECORDER's Track Count list once the page lets the count go", async () => {
    const shell = await shellOn([{ id: "microsd" }, { id: "microsd.recorder" }], [{ target: { kind: "path", path: "sd.trackCount" }, reason: REASON }]);
    shell.setLocks([]);
    await flush();
    const box = shell.root.querySelector<HTMLElement>(".dropdown-box");
    drawnOpen(box);
    box?.click();
    await flush();
    expect(box?.getAttribute("aria-expanded")).toBe("true");
    expect(shell.root.querySelector(".rec-track-list")).not.toBeNull();
  });

  it("is written by no edit, nor by one that carries a write onto it", async () => {
    const shell = await shellOn([], [{ target: { kind: "path", path: "ch.ch2.level" }, reason: REASON }]);
    const { store } = shell.ctx;
    await store.set("ch.ch2.level", -20);
    expect(store.num("ch.ch2.level", Number.NaN)).toBe(0);
    // A linked pair carries an edit of one channel's fader onto the other, so the edit is refused whole.
    await store.set("ch.ch1.signalType", "STEREO");
    await store.set("ch.ch2.signalType", "STEREO");
    const before = store.num("ch.ch1.level", Number.NaN);
    await store.set("ch.ch1.level", -12);
    expect(store.carries("ch.ch1.level", -12), "the edit carries onto the locked channel").toContain("ch.ch2.level");
    expect([store.num("ch.ch1.level", Number.NaN), store.num("ch.ch2.level", Number.NaN)]).toEqual([before, 0]);
    // The other channels' faders are written as before.
    await store.set("ch.ch3.level", -12);
    expect(store.num("ch.ch3.level", Number.NaN)).toBe(-12);
  });
});

describe("an effect setting the page holds shut", () => {
  const INS = "ch.ch1.insFx";

  /** CH 1's INS FX screen running `effect`, on page `page`, with `path` held. */
  async function effectShut(effect: string, page: number, path: string): Promise<Shell> {
    const shell = await shellOn([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }]);
    shell.root.querySelector<HTMLElement>(".insfx-effect")?.click();
    await flush();
    byText(shell, ".source-sheet .source-btn", effect)?.click();
    await flush();
    await shell.ctx.store.set("ui.effectPage", page);
    shell.setLocks([{ target: { kind: "path", path }, reason: REASON }]);
    await flush();
    return shell;
  }

  const pulldownFor = (shell: Shell, label: string): HTMLElement | undefined =>
    [...shell.root.querySelectorAll<HTMLElement>(".pulldown")].find((n) => n.getAttribute("aria-label")?.startsWith(`${label}:`));

  it("draws a row of buttons shut, and no button in it takes its value", async () => {
    const shell = await effectShut("Clean", 1, `${INS}.mod`);
    const vib = (): HTMLElement | undefined => byText(shell, ".efx-buttons .efx-button", "Vib");
    for (const name of ["Cho", "Off", "Vib"]) drawnShut(byText(shell, ".efx-buttons .efx-button", name));
    drawnOpen(byText(shell, ".efx-buttons .efx-button", "Gate"));
    vib()?.click();
    key(vib(), "Enter");
    await flush();
    expect(shell.ctx.store.str(`${INS}.mod`, "")).toBe("Off");
  });

  it("takes a button's value once the page lets the row go", async () => {
    const shell = await effectShut("Clean", 1, `${INS}.mod`);
    drawnShut(byText(shell, ".efx-buttons .efx-button", "Vib"));
    shell.setLocks([]);
    await flush();
    drawnOpen(byText(shell, ".efx-buttons .efx-button", "Vib"));
    byText(shell, ".efx-buttons .efx-button", "Vib")?.click();
    await flush();
    expect(shell.ctx.store.str(`${INS}.mod`, "")).toBe("Vib");
  });

  it("draws an effect's switch shut, and the switch writes nothing", async () => {
    const shell = await effectShut("Clean", 1, `${INS}.gate`);
    const gate = (): HTMLElement | undefined => byText(shell, ".efx-buttons .efx-button", "Gate");
    drawnShut(gate());
    drawnOpen(byText(shell, ".efx-buttons .efx-button", "Vib"));
    gate()?.click();
    key(gate(), "Enter");
    await flush();
    expect(shell.ctx.store.bool(`${INS}.gate`, true)).toBe(false);
  });

  it("flips an effect's switch once the page lets it go", async () => {
    const shell = await effectShut("Clean", 1, `${INS}.gate`);
    drawnShut(byText(shell, ".efx-buttons .efx-button", "Gate"));
    shell.setLocks([]);
    await flush();
    drawnOpen(byText(shell, ".efx-buttons .efx-button", "Gate"));
    byText(shell, ".efx-buttons .efx-button", "Gate")?.click();
    await flush();
    expect(shell.ctx.store.bool(`${INS}.gate`, false)).toBe(true);
  });

  it("draws an effect's pulldown shut, and opens no list", async () => {
    const shell = await effectShut("Clean", 1, `${INS}.spType`);
    const box = pulldownFor(shell, "SP Type");
    drawnShut(box);
    drawnOpen(pulldownFor(shell, "Mic Position"));
    box?.click();
    key(box, "Enter");
    await flush();
    expect(box?.getAttribute("aria-expanded")).toBe("false");
    expect(shell.root.querySelector("[data-overlay]")).toBeNull();
    expect(shell.ctx.store.str(`${INS}.spType`, "")).toBe("JC 2x12");
  });

  it("opens an effect's pulldown once the page lets it go", async () => {
    const shell = await effectShut("Clean", 1, `${INS}.spType`);
    drawnShut(pulldownFor(shell, "SP Type"));
    shell.setLocks([]);
    await flush();
    const box = pulldownFor(shell, "SP Type");
    drawnOpen(box);
    box?.click();
    await flush();
    expect(box?.getAttribute("aria-expanded")).toBe("true");
  });

  it("draws Pitch Fix's Scale list shut, and opens no list", async () => {
    const shell = await effectShut("Pitch Fix", 1, `${INS}.scale`);
    const box = pulldownFor(shell, "Scale");
    drawnShut(box);
    drawnOpen(pulldownFor(shell, "Key"));
    box?.click();
    key(box, "Enter");
    await flush();
    expect(box?.getAttribute("aria-expanded")).toBe("false");
    expect(shell.root.querySelector("[data-overlay]")).toBeNull();
    expect(shell.ctx.store.str(`${INS}.scale`, "")).toBe("Chromatic");
  });

  it("opens Pitch Fix's Scale list once the page lets it go", async () => {
    const shell = await effectShut("Pitch Fix", 1, `${INS}.scale`);
    drawnShut(pulldownFor(shell, "Scale"));
    shell.setLocks([]);
    await flush();
    const box = pulldownFor(shell, "Scale");
    drawnOpen(box);
    box?.click();
    await flush();
    expect(box?.getAttribute("aria-expanded")).toBe("true");
  });

  it("draws a key of Pitch Fix's keyboard shut, and the key turns no note over", async () => {
    const shell = await effectShut("Pitch Fix", 1, `${INS}.note2`);
    const d = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".pitch-key[aria-label='D']");
    drawnShut(d());
    drawnOpen(shell.root.querySelector(".pitch-key[aria-label='E']"));
    d()?.click();
    key(d(), "Enter");
    await flush();
    expect([shell.ctx.store.bool(`${INS}.note2`, false), shell.ctx.store.str(`${INS}.scale`, "")]).toEqual([true, "Chromatic"]);
  });

  it("turns a key's note over once the page lets it go", async () => {
    const shell = await effectShut("Pitch Fix", 1, `${INS}.note2`);
    drawnShut(shell.root.querySelector(".pitch-key[aria-label='D']"));
    shell.setLocks([]);
    await flush();
    drawnOpen(shell.root.querySelector(".pitch-key[aria-label='D']"));
    shell.root.querySelector<HTMLElement>(".pitch-key[aria-label='D']")?.click();
    await flush();
    expect([shell.ctx.store.bool(`${INS}.note2`, true), shell.ctx.store.str(`${INS}.scale`, "")]).toEqual([false, "Custom"]);
  });

  it("draws every key of Pitch Fix's keyboard shut where the page holds the Scale a touch takes to Custom", async () => {
    const shell = await effectShut("Pitch Fix", 1, `${INS}.scale`);
    for (const name of ["C", "D", "C#"]) drawnShut(shell.root.querySelector(`.pitch-keys [aria-label='${name}']`));
    shell.root.querySelector<HTMLElement>(".pitch-key[aria-label='D']")?.click();
    await flush();
    expect([shell.ctx.store.bool(`${INS}.note2`, false), shell.ctx.store.str(`${INS}.scale`, "")]).toEqual([true, "Chromatic"]);
  });

  it("draws the INS FX block's switch shut, and the switch writes nothing", async () => {
    const shell = await effectShut("Crunch", 0, `${INS}.on`);
    const title = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".badge-title");
    drawnShut(title());
    title()?.click();
    key(title(), "Enter");
    await flush();
    expect(shell.ctx.store.bool(`${INS}.on`, false)).toBe(true);
  });

  it("switches the INS FX block once the page lets it go", async () => {
    const shell = await effectShut("Crunch", 0, `${INS}.on`);
    drawnShut(shell.root.querySelector(".badge-title"));
    shell.setLocks([]);
    await flush();
    drawnOpen(shell.root.querySelector(".badge-title"));
    shell.root.querySelector<HTMLElement>(".badge-title")?.click();
    await flush();
    expect(shell.ctx.store.bool(`${INS}.on`, true)).toBe(false);
  });
});

describe("a control that writes several values", () => {
  it("draws EQ's [1-knob] shut where the page holds the curve's level switching it on takes, and the switch writes nothing", async () => {
    const shell = await shellOn([{ id: "ch.eq", strip: "ch1" }], [{ target: { kind: "path", path: "ch.ch1.eq.oneKnob.level" }, reason: REASON }]);
    const button = shell.root.querySelector<HTMLElement>(".oneknob");
    drawnShut(button);
    button?.click();
    await flush();
    expect(shell.ctx.store.bool("ch.ch1.eq.oneKnob.on", false)).toBe(false);
  });

  it.each(["freq", "gain"])("draws an EQ band's grip shut where the page holds its %s", async (value) => {
    const shell = await shellOn([{ id: "ch.eq", strip: "ch1" }], [{ target: { kind: "path", path: `ch.ch1.eq.low.${value}` }, reason: REASON }]);
    drawnShut(shell.root.querySelector(".eq-grip[aria-label='LOW band']"));
    drawnOpen(shell.root.querySelector(".eq-grip[aria-label='HIGH band']"));
  });

  it.each([
    ["bus.stereo", "an output's, which takes the input cue out", true],
    ["ch2", "another input's, which leaves it in", false],
  ])("draws %s [CUE] — %s — by whether the page holds CH 1's cue", async (strip, _, shut) => {
    const shell = await shellOn([{ id: "channel-view", strip }]);
    await shell.ctx.store.set("ch.ch1.cue", true);
    shell.setLocks([{ target: { kind: "path", path: "ch.ch1.cue" }, reason: REASON }]);
    await flush();
    const cue = shell.root.querySelector(".btn-cue");
    if (shut) drawnShut(cue);
    else drawnOpen(cue);
  });
});

describe("an effect's name the page holds shut", () => {
  const sheet = (shell: Shell): Element | null => shell.root.querySelector(".source-sheet");

  async function insertShut(): Promise<Shell> {
    return shellOn([{ id: "channel-view", strip: "ch1" }, { id: "ch.insfx", strip: "ch1" }], [{ target: { kind: "path", path: "ch.ch1.insFx.effect" }, reason: REASON }]);
  }

  it("draws the button that names the effect shut, and drops no sheet", async () => {
    const shell = await insertShut();
    const button = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".insfx-effect");
    drawnShut(button());
    button()?.click();
    key(button(), "Enter");
    await flush();
    expect(sheet(shell)).toBeNull();
  });

  it("draws the block's name shut while it opens the sheet, and drops no sheet", async () => {
    const shell = await insertShut();
    const title = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".badge-title");
    drawnShut(title());
    title()?.click();
    key(title(), "Enter");
    await flush();
    expect(sheet(shell)).toBeNull();
  });

  it.each([".insfx-effect", ".badge-title"])("drops the sheet from %s once the page lets the name go", async (selector) => {
    const shell = await insertShut();
    drawnShut(shell.root.querySelector(selector));
    shell.setLocks([]);
    await flush();
    drawnOpen(shell.root.querySelector(selector));
    shell.root.querySelector<HTMLElement>(selector)?.click();
    await flush();
    expect(sheet(shell)).not.toBeNull();
  });
});

describe("a 1-knob switch the page holds shut", () => {
  const SCREENS: { name: string; routes: Route[]; path: string; take?: string }[] = [
    { name: "COMP", routes: [{ id: "channel-view", strip: "ch1" }, { id: "ch.comp", strip: "ch1" }], path: "ch.ch1.comp.oneKnob.on" },
    { name: "EQ", routes: [{ id: "channel-view", strip: "ch1" }, { id: "ch.eq", strip: "ch1" }], path: "ch.ch1.eq.oneKnob.on" },
    {
      name: "M.B.Comp",
      routes: [{ id: "channel-view", strip: "bus.stereo" }, { id: "ch.insfx", strip: "bus.stereo" }],
      path: "ch.bus.stereo.insFx.oneKnobOn",
      take: "M.B.Comp",
    },
  ];

  async function screenShut(screen: (typeof SCREENS)[number]): Promise<Shell> {
    const shell = await shellOn(screen.routes);
    if (screen.take) {
      shell.root.querySelector<HTMLElement>(".insfx-effect")?.click();
      await flush();
      byText(shell, ".source-sheet .source-btn", screen.take)?.click();
      await flush();
    }
    shell.setLocks([{ target: { kind: "path", path: screen.path }, reason: REASON }]);
    await flush();
    return shell;
  }

  it.each(SCREENS)("draws $name's switch shut, and the switch writes nothing", async (screen) => {
    const shell = await screenShut(screen);
    const button = (): HTMLElement | null => shell.root.querySelector<HTMLElement>(".oneknob");
    drawnShut(button());
    button()?.click();
    key(button(), "Enter");
    await flush();
    expect(shell.ctx.store.bool(screen.path, true)).toBe(false);
  });

  it.each(SCREENS)("switches $name's 1-knob on once the page lets it go", async (screen) => {
    const shell = await screenShut(screen);
    drawnShut(shell.root.querySelector(".oneknob"));
    shell.setLocks([]);
    await flush();
    drawnOpen(shell.root.querySelector(".oneknob"));
    shell.root.querySelector<HTMLElement>(".oneknob")?.click();
    await flush();
    expect(shell.ctx.store.bool(screen.path, false)).toBe(true);
  });
});

describe("an operation the page holds shut", () => {
  const button = (shell: Shell, text: string): HTMLElement | undefined => byText(shell, ".scene-actions .btn", text);

  async function sceneList(locks: readonly SimLock[], actions: UnitActions = emulatedActions): Promise<Shell> {
    const shell = await shellOn([{ id: "scene" }, { id: "scene.list" }], locks, actions);
    [...shell.root.querySelectorAll<HTMLElement>(".scene-list .list-row")][0]?.click();
    await flush();
    return shell;
  }

  it("draws the button that hands it to the unit shut, and asks nothing on a touch or a key", async () => {
    const shell = await sceneList([{ target: { kind: "op", op: "scene.recall" }, reason: REASON }]);
    drawnShut(button(shell, "Recall"));
    button(shell, "Recall")?.click();
    key(button(shell, "Recall"), "Enter");
    await flush();
    expect(shell.root.querySelector(".dialog-actions"), "no question is put").toBeNull();
  });

  it("leaves the buttons for other operations as they were", async () => {
    const shell = await sceneList([{ target: { kind: "op", op: "scene.recall" }, reason: REASON }]);
    // Scene 00 is the factory's, so Store stands out of reach of its own accord, and carries nothing of a lock.
    const store = button(shell, "Store");
    expect(store?.classList.contains("is-disabled"), "out of reach as the screen draws it").toBe(true);
    expect(store?.classList.contains("is-held-shut")).toBe(false);
    expect(store?.hasAttribute("title")).toBe(false);
    expect(store?.querySelector(`.${LOCK_MARK_CLASS}`)).toBeNull();
  });

  it("is not handed to the unit, however it is reached", async () => {
    const handed = vi.fn((_: UnitOp) => true);
    const shell = await sceneList([{ target: { kind: "op", op: "scene.recall" }, reason: REASON }], { kind: "device", perform: handed });
    expect(perform(shell.ctx, { kind: "scene.recall", scene: 0 })).toBe(false);
    expect(handed).not.toHaveBeenCalled();
    expect(perform(shell.ctx, { kind: "card.test" }), "an operation the page holds open goes through").toBe(true);
    expect(handed).toHaveBeenCalledWith({ kind: "card.test" });
  });

  it("asks before recalling once the page lets it go", async () => {
    const shell = await sceneList([{ target: { kind: "op", op: "scene.recall" }, reason: REASON }]);
    shell.setLocks([]);
    await flush();
    drawnOpen(button(shell, "Recall"));
    button(shell, "Recall")?.click();
    await flush();
    expect(shell.root.querySelector(".dialog-actions")).not.toBeNull();
  });

  it("draws the recorder's button for it shut in the state that would start it", async () => {
    const shell = await shellOn([{ id: "microsd" }, { id: "microsd.recorder" }], [{ target: { kind: "op", op: "recorder.arm" }, reason: REASON }]);
    const record = (): HTMLElement | null => shell.root.querySelector<HTMLElement>("[aria-label='Record']");
    drawnShut(record());
    record()?.click();
    await flush();
    expect(shell.ctx.store.str("sd.rec", "idle")).toBe("idle");
    drawnOpen(shell.root.querySelector("[aria-label='Stop']"));
  });
});

describe("an overlay up while the page changes what it holds", () => {
  it("draws its controls shut as it goes up and as the page changes, and gives each back what it carried", async () => {
    const shell = await shellOn([], [{ target: { kind: "path", path: "osc.on" }, reason: REASON }]);
    const own = writes(el("button", { class: "btn", title: "Its own tooltip", onTap: () => undefined }), "osc.on");
    const other = writes(el("button", { class: "btn", onTap: () => undefined }), "osc.mode");
    shell.ctx.overlay(el("div", { children: [own, other] }));
    drawnShut(own);
    drawnOpen(other);
    shell.setLocks([{ target: { kind: "path", path: "osc.mode" }, reason: REASON }]);
    drawnShut(other);
    expect(own.classList.contains("is-held-shut")).toBe(false);
    expect(own.getAttribute("title"), "its own tooltip back").toBe("Its own tooltip");
    expect(own.querySelector(`.${LOCK_MARK_CLASS}`)).toBeNull();
    expect(own.hasAttribute("aria-disabled") || own.classList.contains("is-disabled")).toBe(false);
  });

  it("keeps a control the screen had already put out of reach out of reach when the page lets it go", async () => {
    const shell = await shellOn([], [{ target: { kind: "path", path: "osc.on" }, reason: REASON }]);
    const shut = markShut(writes(el("button", { class: "btn", onTap: () => undefined }), "osc.on"), true);
    shell.ctx.overlay(el("div", { children: [shut] }));
    drawnShut(shut);
    shell.setLocks([]);
    expect(shut.classList.contains("is-disabled")).toBe(true);
    expect(shut.getAttribute("aria-disabled")).toBe("true");
    expect(shut.hasAttribute("title")).toBe(false);
  });
});

describe("a field the page holds shut", () => {
  const held = (path: string): Locks => new Locks([{ target: { kind: "path", path }, reason: REASON }]);

  it("keeps its text and takes no typing, its padlock standing just after it, and lets it go as it was", () => {
    const box = el("div");
    const field = writes(el("input"), "ch.ch1.name") as HTMLInputElement;
    field.value = "Vocal";
    box.appendChild(field);

    drawLocks(box, held("ch.ch1.name"));
    expect(field.classList.contains("is-held-shut")).toBe(true);
    expect(field.getAttribute("aria-disabled")).toBe("true");
    expect(field.getAttribute("title")).toBe(REASON);
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe("Vocal");
    expect(field.childElementCount, "a field holds no children").toBe(0);
    expect(field.nextElementSibling?.classList.contains(LOCK_MARK_CLASS), "its padlock stands after it").toBe(true);

    drawLocks(box, new Locks());
    expect(field.readOnly).toBe(false);
    expect(field.classList.contains("is-held-shut")).toBe(false);
    expect(box.querySelector(`.${LOCK_MARK_CLASS}`)).toBeNull();
  });

  it("stays read-only once let go when it was read-only before it was held", () => {
    const box = el("div");
    const field = writes(el("input"), "ch.ch1.name") as HTMLInputElement;
    field.readOnly = true;
    box.appendChild(field);

    drawLocks(box, held("ch.ch1.name"));
    drawLocks(box, new Locks());
    expect(field.readOnly).toBe(true);
  });
});

describe("a dialog's [OK] the page holds shut", () => {
  // Each opens its dialog with the value open, then the page holds the value it sets: [OK] stays on the
  // glass drawn shut and sets nothing, and sets the pick once the page lets the value go.
  const okOf = (shell: Shell): HTMLElement | undefined =>
    byText(shell, ".pick-dialog-ok", "OK") ?? byText(shell, ".dialog-overlay .btn", "OK");
  const pickOther = async (shell: Shell): Promise<void> => {
    const row = [...shell.root.querySelectorAll<HTMLElement>(".pick-dialog-row")].find((n) => n.getAttribute("aria-pressed") === "false");
    row?.click();
    await flush();
  };
  const cases: { name: string; path: string; routes: Route[]; open: (shell: Shell) => Promise<void>; read: (shell: Shell) => unknown }[] = [
    {
      name: "USER DEFINED KNOBS' assignment",
      path: udkPath(1, UDK_KNOBS[0]),
      routes: [{ id: "setup" }, { id: "setup.udk" }],
      open: async (shell) => {
        shell.root.querySelector<HTMLElement>(".udk-knob")?.click();
        await flush();
        await pickOther(shell);
      },
      read: (shell) => shell.ctx.store.str(udkPath(1, UDK_KNOBS[0]), ""),
    },
    {
      name: "TIME ZONE",
      path: "setup.dateTime.timeZone",
      routes: [{ id: "setup" }, { id: "setup.datetime" }],
      open: async (shell) => {
        openTimeZone(shell.ctx);
        await flush();
        await pickOther(shell);
      },
      read: (shell) => shell.ctx.store.str("setup.dateTime.timeZone", ""),
    },
    {
      name: "Auto Power Off's warning",
      path: "setup.power.autoPowerOff",
      routes: [{ id: "setup" }, { id: "setup.power" }],
      open: async (shell) => {
        byText(shell, ".btn-toggle", "Enable")?.click();
        await flush();
      },
      read: (shell) => shell.ctx.store.bool("setup.power.autoPowerOff", true),
    },
    {
      name: "USB Storage Mode's question",
      path: "sd.usbStorage",
      routes: [{ id: "microsd" }],
      open: async (shell) => {
        shell.root.querySelector<HTMLElement>(".usb-storage")?.click();
        await flush();
      },
      read: (shell) => shell.ctx.store.bool("sd.usbStorage", false),
    },
  ];

  it.each(cases)("draws $name's [OK] shut once the page holds its value, and [OK] sets nothing", async ({ path, routes, open, read }) => {
    const shell = await shellOn(routes);
    await open(shell);
    const before = read(shell);
    drawnOpen(okOf(shell));
    shell.setLocks([{ target: { kind: "path", path }, reason: REASON }]);
    await flush();
    drawnShut(okOf(shell));
    okOf(shell)?.click();
    key(okOf(shell), "Enter");
    await flush();
    expect(read(shell)).toEqual(before);
    expect(okOf(shell), "the dialog stays up").toBeTruthy();
  });

  it.each(cases)("sets $name's pick once the page lets its value go", async ({ path, routes, open, read }) => {
    const shell = await shellOn(routes);
    await open(shell);
    const before = read(shell);
    shell.setLocks([{ target: { kind: "path", path }, reason: REASON }]);
    await flush();
    shell.setLocks([]);
    await flush();
    drawnOpen(okOf(shell));
    okOf(shell)?.click();
    await flush();
    expect(read(shell)).not.toEqual(before);
    expect(okOf(shell), "the dialog closes").toBeUndefined();
  });
});

describe("a dialog's [OK] that hands the unit an operation the page holds", () => {
  const okOf = (shell: Shell): HTMLElement | undefined => byText(shell, ".dialog-overlay .btn", "OK");
  const cases: { name: string; op: UnitOp["kind"]; routes: Route[]; open: (shell: Shell) => Promise<void> }[] = [
    {
      name: "Recall",
      op: "scene.recall",
      routes: [{ id: "scene" }, { id: "scene.list" }],
      open: async (shell) => {
        byText(shell, ".scene-actions .btn", "Recall")?.click();
        await flush();
      },
    },
    {
      name: "inserting the card",
      op: "card.insert",
      routes: [{ id: "microsd" }],
      open: async (shell) => {
        await shell.ctx.store.set("sd.mounted", false);
        shell.ctx.repaint();
        await flush();
        shell.root.querySelector<HTMLElement>(".sd-no-card")?.click();
        await flush();
      },
    },
  ];

  it.each(cases)("draws the [OK] asking about $name shut once the page holds it, and [OK] answers nothing", async ({ op, routes, open }) => {
    const shell = await shellOn(routes);
    await open(shell);
    drawnOpen(okOf(shell));
    shell.setLocks([{ target: { kind: "op", op }, reason: REASON }]);
    await flush();
    drawnShut(okOf(shell));
    okOf(shell)?.click();
    key(okOf(shell), "Enter");
    await flush();
    expect(okOf(shell), "the dialog stays up").toBeTruthy();
  });

  it.each(cases)("answers the [OK] asking about $name once the page lets it go", async ({ op, routes, open }) => {
    const shell = await shellOn(routes);
    await open(shell);
    shell.setLocks([{ target: { kind: "op", op }, reason: REASON }]);
    await flush();
    shell.setLocks([]);
    await flush();
    drawnOpen(okOf(shell));
    okOf(shell)?.click();
    await flush();
    expect(okOf(shell), "the dialog closes").toBeUndefined();
  });
});

describe("the title entry's [OK] the page holds shut", () => {
  const PATH = "scene.a.1.title";
  const okOf = (shell: Shell): HTMLElement | undefined => byText(shell, ".pick-dialog-ok", "OK");
  const opened = async (): Promise<Shell> => {
    const shell = await shellOn([{ id: "scene" }]);
    openTitleEntry(shell.ctx, PATH, "Mine");
    await flush();
    return shell;
  };

  it("draws [OK] shut once the page holds the path it writes, and [OK] writes nothing", async () => {
    const shell = await opened();
    const before = shell.ctx.store.str(PATH, "");
    drawnOpen(okOf(shell));
    shell.setLocks([{ target: { kind: "path", path: PATH }, reason: REASON }]);
    await flush();
    drawnShut(okOf(shell));
    okOf(shell)?.click();
    await flush();
    expect(shell.ctx.store.str(PATH, "")).toBe(before);
    expect(okOf(shell), "the sheet stays up").toBeTruthy();
  });

  it("writes what is typed once the page lets the path go", async () => {
    const shell = await opened();
    shell.setLocks([{ target: { kind: "path", path: PATH }, reason: REASON }]);
    await flush();
    shell.setLocks([]);
    await flush();
    okOf(shell)?.click();
    await flush();
    expect(shell.ctx.store.str(PATH, "")).toBe("Mine");
  });
});

describe("the locks a page gives", () => {
  it("answers the reason of the first lock given for a target, and none for a target it does not hold", () => {
    const locks = new Locks([
      { target: { kind: "op", op: "scene.recall" }, reason: "first" },
      { target: { kind: "op", op: "scene.recall" }, reason: "second" },
      { target: { kind: "screen", id: "setup" }, reason: "screen" },
    ]);
    expect(locks.reason({ kind: "op", op: "scene.recall" })).toBe("first");
    expect(locks.reason({ kind: "screen", id: "setup" })).toBe("screen");
    expect(locks.reason({ kind: "path", path: "ch.ch1.on" })).toBeUndefined();
  });
});
