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
import { el, markShut, writes } from "./dom";
import { LOCK_MARK_CLASS, type SimLock } from "./locks";

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
    const shell = await shellOn([{ id: "setup" }, { id: "setup.rate" }], [{ target: { kind: "path", path: "setup.followUsb" }, reason: REASON }]);
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
