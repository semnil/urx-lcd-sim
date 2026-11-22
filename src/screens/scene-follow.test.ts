// SCENE LIST following its selection, on a glass whose layout jsdom does not compute: the list's
// body is given a 114px view over rows 38px apart, a glass whose host is out of the page or not
// displayed has no height, and a ResizeObserver delivers a change of height on each frame().
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mountSim, type EmbeddedSim } from "../embed";
import { SimTransport } from "../device/sim-transport";
import { computerClock, emulatedActions } from "../device/unit";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import type { ParamPath, ParamValue } from "../device/path";

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const pitch = 38;
const rowHeight = 36;
const viewHeight = 114;
const scrolls = new WeakMap<HTMLElement, number>();
const originalScroll = Object.getOwnPropertyDescriptor(Element.prototype, "scrollTop")!;
const originalHeight = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight")!;
const originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight")!;
const originalRect = HTMLElement.prototype.getBoundingClientRect;
const bodySelector = ".scene-list .list-body";
const rect = (y: number, height: number) => new DOMRect(0, y, 379, height);
const hasLayout = (element: HTMLElement) => {
  const shadow = element.getRootNode();
  return element.isConnected && shadow instanceof ShadowRoot &&
    (shadow.host.parentElement?.style.display !== "none");
};

// Match size-change delivery. A frame is explicit so hidden draws can be separated.
class ObservedSizes {
  static observations = new Map<ObservedSizes, { target: HTMLElement; height: number }>();
  static initialHeight = -1;
  static delivered = 0;
  constructor(private readonly callback: () => void) {}
  observe(target: HTMLElement) {
    ObservedSizes.observations.set(this, { target, height: ObservedSizes.initialHeight });
  }
  disconnect() {
    ObservedSizes.observations.delete(this);
  }
  static frame() {
    for (const [observer, seen] of this.observations) {
      const height = seen.target.clientHeight;
      if (height !== seen.height) {
        seen.height = height;
        this.delivered++;
        observer.callback();
      }
    }
  }
}

beforeEach(() => {
  ObservedSizes.observations.clear();
  ObservedSizes.delivered = 0;
  ObservedSizes.initialHeight = -1;
  vi.stubGlobal("ResizeObserver", ObservedSizes);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function(this: HTMLElement) {
    return this.matches(bodySelector) ? (hasLayout(this) ? viewHeight : 0) : originalHeight.get!.call(this);
  });
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function(this: HTMLElement) {
    return this.matches(bodySelector) && hasLayout(this) ? Math.max(viewHeight, pitch * this.childElementCount) : originalScrollHeight.get!.call(this);
  });
  vi.spyOn(Element.prototype, "scrollTop", "get").mockImplementation(function(this: HTMLElement) {
    return this.matches(bodySelector) ? (hasLayout(this) ? scrolls.get(this) ?? 0 : 0) : originalScroll.get!.call(this);
  });
  vi.spyOn(Element.prototype, "scrollTop", "set").mockImplementation(function(this: HTMLElement, top: number) {
    if (!this.matches(bodySelector)) return originalScroll.set!.call(this, top);
    if (!hasLayout(this)) return;
    const before = scrolls.get(this) ?? 0;
    const after = Math.round(Math.max(0, Math.min(this.scrollHeight - this.clientHeight, top)));
    scrolls.set(this, after);
    if (before !== after) queueMicrotask(() => this.dispatchEvent(new Event("scroll")));
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function(this: HTMLElement) {
    if (this.matches(bodySelector)) return rect(0, this.clientHeight);
    if (this.matches(".scene-list .list-row")) {
      const body = this.parentElement!;
      return rect(pitch * [...body.children].indexOf(this) - body.scrollTop, rowHeight);
    }
    return originalRect.call(this);
  });
});

const sims: EmbeddedSim[] = [];
afterEach(() => {
  for (const sim of sims.splice(0)) sim.dispose();
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function mount(entries: [ParamPath, ParamValue][] = []) {
  const host = document.createElement("div");
  document.body.append(host);
  const initial = factoryState(unitById("URX44V"));
  for (const [path, value] of entries) initial.set(path, value);
  const transport = new SimTransport(initial);
  const failures: unknown[] = [];
  const sim = await mountSim(host, {
    model: "URX44V",
    onWriteFailure: (f) => failures.push([f.path, f.attempted, f.restored]),
    unit: { params: transport, levels: { kind: "simulated" }, clock: computerClock, actions: emulatedActions },
  });
  sims.push(sim);
  const shadow = sim.root.shadowRoot!;
  const one = (selector: string) => {
    const node = shadow.querySelector<HTMLElement>(selector);
    if (!node) throw new Error("Missing " + selector + " on " + shadow.querySelector(".lcd")?.getAttribute("data-screen"));
    return node;
  };
  const click = (selector: string) => one(selector).click();
  const button = (selector: string, name: string) => {
    const node = [...shadow.querySelectorAll<HTMLElement>(selector)].find((n) => [n.textContent, n.getAttribute("aria-label")].includes(name));
    if (!node) throw new Error("Missing " + name + " among " + [...shadow.querySelectorAll<HTMLElement>(selector)].map((n) => n.textContent + "/" + n.getAttribute("aria-label")));
    node.click();
  };
  const list = () => one(bodySelector);
  // A row by the number it shows, so the presets the Standard tab lists between 00 and 01 do not move it.
  const rows = () => [...list().querySelectorAll<HTMLElement>(".list-row")];
  const rowIndex = (no: string) => {
    const index = rows().findIndex((r) => r.querySelector(".scene-no")?.textContent === no);
    if (index < 0) throw new Error("Missing row " + no);
    return index;
  };
  const row = (no: string) => rows()[rowIndex(no)]!;
  const menu = () => button(".menu-grid .menu-btn", "Scene List");
  const open = async () => {
    click(".scene-box");
    await flush();
    menu();
    await flush();
  };
  const state = () => {
    const view = list().getBoundingClientRect();
    const row = one(".scene-list .is-selected");
    const r = row.getBoundingClientRect();
    return { selected: row.querySelector(".scene-no")!.textContent, bank: one(".scene-bank.is-on").textContent,
      scroll: list().scrollTop, span: [r.top - view.top, r.bottom - view.top],
      inView: r.top >= view.top - 0.5 && r.bottom <= view.bottom + 0.5 };
  };
  return { host, sim, transport, one, click, button, list, row, rowIndex, open, menu, state, failures };
}

type Mounted = Awaited<ReturnType<typeof mount>>;



const refuseSelection = (g: Mounted, when: "unwritable" | "at once" | "later"): (() => void) => {
  const ordinaryWrite = g.transport.write.bind(g.transport);
  let refuse = (): void => undefined;
  if (when === "unwritable") Object.assign(g.transport, { writable: (path: string) => path !== "scene.selected" });
  g.transport.write = (path, value, sent) => {
    if (path !== "scene.selected") return ordinaryWrite(path, value, sent);
    sent?.();
    if (when === "later") return new Promise((_, fail) => (refuse = () => fail(new Error("refused"))));
    return Promise.reject(new Error("refused"));
  };
  return () => refuse();
};

/**
 * Writes to the selection that wait for an answer; `answer(i, taken)` takes or refuses the i-th, in
 * the order they were made. With `queued`, a write goes out to the unit only once it is answered.
 */
const holdSelection = (g: Mounted, queued = false): ((index: number, taken: boolean) => Promise<void>) => {
  const ordinaryWrite = g.transport.write.bind(g.transport);
  const out: ((taken: boolean) => void)[] = [];
  g.transport.write = (path, value, sent) => {
    if (path !== "scene.selected") return ordinaryWrite(path, value, sent);
    if (!queued) sent?.();
    return new Promise<ParamValue>((resolve, reject) =>
      out.push((taken) => {
        if (queued) sent?.();
        if (taken) resolve(value);
        else reject(new Error("refused"));
      }),
    );
  };
  return async (index, taken) => {
    out[index]!(taken);
    await flush();
  };
};

it.each(["unwritable", "at once", "later"] as const)("leaves the list where it was scrolled when a row touched is refused %s", async (when) => {
  const g = await mount([["scene.selected", 40]]);
  const refuse = refuseSelection(g, when);
  await g.open();
  expect(g.state().inView, "the selection in view on opening").toBe(true);
  g.list().scrollTop = 10;
  g.row("03").click();
  await flush();
  refuse();
  await flush();
  expect([g.state().selected, g.list().scrollTop, g.failures]).toEqual(["40", 10, [["scene.selected", 3, 40]]]);
});

it("follows the unit's own move onto the number of a touch it refused", async () => {
  const g = await mount([["scene.selected", 40]]);
  refuseSelection(g, "unwritable");
  await g.open();
  g.list().scrollTop = 10;
  g.row("03").click();
  expect(g.sim.store.num("scene.selected", 0), "put back at once").toBe(40);
  g.transport.inject("scene.selected", 3);
  await flush();
  expect([g.state().selected, g.state().inView]).toEqual(["03", true]);
});

it("keeps a selection the unit moved to while a touch waited, after the touch is refused", async () => {
  const g = await mount([["scene.selected", 40]]);
  const refuse = refuseSelection(g, "later");
  await g.open();
  g.list().scrollTop = 10;
  g.row("03").click();
  await flush();
  expect([g.state().selected, g.list().scrollTop], "the touch's row where it was touched").toEqual(["03", 10]);
  g.transport.inject("scene.selected", 30);
  await flush();
  const moved = g.state();
  expect(moved.inView, "the unit's move in view").toBe(true);
  refuse();
  await flush();
  expect(g.state()).toEqual(moved);
});

it.each(["visible", "hidden"] as const)("brings the selection into view on a list opened again, though it is drawn again before it could while %s", async (shown) => {
  const g = await mount([["scene.selected", 40]]);
  await g.open();
  expect(g.state().inView).toBe(true);
  g.click('[aria-label="Back"]');
  await flush();
  g.menu();
  if (shown === "visible") queueMicrotask(() => g.sim.setLocks([]));
  else g.host.style.display = "none";
  await flush();
  if (shown === "hidden") {
    ObservedSizes.frame();
    g.transport.inject("ch.ch1.level", -6);
    await flush();
    g.host.style.display = "";
  }
  ObservedSizes.frame();
  await flush();
  expect(g.state().inView).toBe(true);
});

it("brings a selection moved while the glass could not be shown into view once it can, on one watch however often the list is drawn", async () => {
  const g = await mount();
  await g.open();
  g.host.style.display = "none";
  const watches: number[] = [];
  for (const no of [40, 50, 40]) {
    g.transport.inject("scene.selected", no);
    await flush();
    ObservedSizes.frame();
    watches.push(ObservedSizes.observations.size);
  }
  g.host.style.display = "";
  ObservedSizes.frame();
  await flush();
  expect([g.state().selected, g.state().inView]).toEqual(["40", true]);
  expect([Math.max(...watches), ObservedSizes.observations.size]).toEqual([1, 0]);
});

it("brings the selection into view on a list opened again while a touch's write is out", async () => {
  const g = await mount([["scene.selected", 2]]);
  const refuse = refuseSelection(g, "later");
  await g.open();
  g.list().scrollTop = pitch * (g.rowIndex("40") - 2);
  g.row("40").click();
  await flush();
  g.click('[aria-label="Back"]');
  await flush();
  g.menu();
  await flush();
  expect([g.state().selected, g.state().inView], "40, on the list opened again").toEqual(["40", true]);
  refuse();
  await flush();
});

it("follows the unit's move back onto the row selected before a touch whose write is out", async () => {
  const g = await mount([["scene.selected", 40]]);
  refuseSelection(g, "later");
  await g.open();
  g.list().scrollTop = 10;
  g.row("03").click();
  await flush();
  g.transport.inject("scene.selected", 40);
  await flush();
  expect([g.state().selected, g.state().inView]).toEqual(["40", true]);
});

it("leaves the list where it was scrolled when two touches in a row are refused in turn", async () => {
  const g = await mount([["scene.selected", 40]]);
  const ordinaryWrite = g.transport.write.bind(g.transport);
  const refusals: (() => void)[] = [];
  g.transport.write = (path, value, sent) => {
    if (path !== "scene.selected") return ordinaryWrite(path, value, sent);
    sent?.();
    return new Promise((_, fail) => refusals.push(() => fail(new Error("refused"))));
  };
  await g.open();
  g.list().scrollTop = 10;
  g.row("03").click();
  await flush();
  g.row("03").click();
  await flush();
  for (const refuse of refusals) {
    refuse();
    await flush();
  }
  expect([g.state().selected, g.list().scrollTop]).toEqual(["40", 10]);
});

it.each(["leaving it for another screen", "giving the glass up"] as const)("keeps no watch for a list waiting to be shown after %s", async (how) => {
  const g = await mount();
  await g.open();
  g.host.style.display = "none";
  g.transport.inject("scene.selected", 40);
  await flush();
  ObservedSizes.frame();
  expect(ObservedSizes.observations.size, "a watch while the list waits").toBe(1);
  if (how === "leaving it for another screen") g.click('[aria-label="Back"]');
  else g.sim.dispose();
  await flush();
  expect(ObservedSizes.observations.size).toBe(0);
});

it("starts no watch from a draw made just before the glass is given up", async () => {
  const g = await mount();
  await g.open();
  g.host.style.display = "none";
  g.transport.inject("scene.selected", 40);
  g.sim.setLocks([]);
  g.sim.dispose();
  await flush();
  ObservedSizes.frame();
  expect(ObservedSizes.observations.size).toBe(0);
});

it("brings the selection into view on SCENE LIST opened again after it was left while waiting to be shown", async () => {
  const g = await mount();
  await g.open();
  g.host.style.display = "none";
  g.transport.inject("scene.selected", 40);
  await flush();
  g.click('[aria-label="Back"]');
  await flush();
  g.host.style.display = "";
  g.menu();
  await flush();
  expect([g.state().selected, g.state().inView]).toEqual(["40", true]);
});

it.each(["an outside change", "a change through the store", "opening the list"] as const)("starts no watch from a redraw %s scheduled just before the glass is given up", async (by) => {
  const g = await mount();
  await g.open();
  if (by === "opening the list") {
    g.click('[aria-label="Back"]');
    await flush();
  }
  g.host.style.display = "none";
  if (by === "an outside change") g.transport.inject("scene.selected", 40);
  else if (by === "a change through the store") void g.sim.store.set("scene.selected", 40);
  else g.menu();
  // A change reaches the shell a turn later, which then schedules its redraw.
  if (by !== "opening the list") await Promise.resolve();
  g.sim.dispose();
  await flush();
  ObservedSizes.frame();
  expect(ObservedSizes.observations.size).toBe(0);
});

it.each([["03", "30"], ["30", "03"]] as const)("leaves the list where it was scrolled when of two touches, %s then %s, the first is taken and the second refused", async (first, second) => {
  const g = await mount([["scene.selected", 40]]);
  const answer = holdSelection(g);
  await g.open();
  g.list().scrollTop = pitch * (g.rowIndex(first) - 1);
  g.row(first).click();
  await flush();
  g.list().scrollTop = pitch * (g.rowIndex(second) - 1);
  g.row(second).click();
  await flush();
  const scroll = g.list().scrollTop;
  await answer(0, true);
  await answer(1, false);
  expect([g.state().selected, g.list().scrollTop]).toEqual([first, scroll]);
});

it.each([["03", 3], ["P06", 106]] as const)("brings the unit's own moves into view while the write of a touch on %s is out, onto that row as well", async (no, value) => {
  const g = await mount([["scene.selected", 40]]);
  holdSelection(g);
  await g.open();
  g.list().scrollTop = pitch * (g.rowIndex(no) - 1);
  g.row(no).click();
  await flush();
  g.transport.inject("scene.selected", 30);
  await flush();
  expect([g.state().selected, g.state().inView], "30, the unit's move").toEqual(["30", true]);
  g.transport.inject("scene.selected", value);
  await flush();
  expect([g.state().selected, g.state().inView], "the unit's move back onto the row touched").toEqual([no, true]);
});

it.each(["before", "after"] as const)("brings the unit's move into view when a touch's refusal comes %s the redraw it asked for", async (when) => {
  const g = await mount([["scene.selected", 40]]);
  const answer = holdSelection(g);
  await g.open();
  g.list().scrollTop = pitch * (g.rowIndex("03") - 1);
  g.row("03").click();
  await flush();
  g.transport.inject("scene.selected", 40);
  if (when === "after") await flush();
  await answer(0, false);
  expect([g.state().selected, g.state().inView]).toEqual(["40", true]);
});

it("brings the touched row in entire when the unit moves onto it of its own while the touch's write is out", async () => {
  const g = await mount([["scene.selected", 40]]);
  holdSelection(g);
  await g.open();
  // 03 stands cut by the list's lower edge.
  g.list().scrollTop = pitch * g.rowIndex("03") - 100;
  g.row("03").click();
  await flush();
  expect(g.state().inView, "the row touched, where it was touched").toBe(false);
  g.transport.inject("scene.selected", 3);
  await flush();
  expect([g.state().selected, g.state().inView]).toEqual(["03", true]);
});

it.each([["30", 30], ["03", 3]] as const)("follows the unit's move to %s heard while two touches' writes were yet to go out only once their refusals put it on screen", async (no, value) => {
  const g = await mount([["scene.selected", 40]]);
  const answer = holdSelection(g, true);
  await g.open();
  // 04 stands cut by the list's lower edge.
  g.list().scrollTop = pitch * g.rowIndex("04") - 100;
  g.row("03").click();
  await flush();
  g.row("04").click();
  await flush();
  const scroll = g.list().scrollTop;
  g.transport.inject("scene.selected", value);
  await flush();
  g.sim.setLocks([]);
  await flush();
  expect([g.state().selected, g.list().scrollTop], "held behind the write, the list stays").toEqual(["04", scroll]);
  await answer(0, false);
  await answer(1, false);
  expect([g.state().selected, g.state().inView], "put on screen by the refusals").toEqual([no, true]);
});

it("leaves a hand scroll where it is when a touch the unit then moved onto of its own is refused", async () => {
  const g = await mount([["scene.selected", 40]]);
  const answer = holdSelection(g);
  await g.open();
  g.list().scrollTop = pitch * g.rowIndex("03") - 100;
  g.row("03").click();
  await flush();
  g.transport.inject("scene.selected", 3);
  await flush();
  expect(g.state().inView, "the unit's move onto the row touched, in entire").toBe(true);
  g.list().scrollTop = 700;
  await flush();
  await answer(0, false);
  expect([g.state().selected, g.list().scrollTop]).toEqual(["03", 700]);
});

it.each([true, false])("leaves a hand scroll where it is when a touch after the unit's own move is refused back onto that move (the touch before it taken: %s)", async (taken) => {
  const g = await mount([["scene.selected", 40]]);
  const answer = holdSelection(g);
  await g.open();
  g.row("03").click();
  await flush();
  g.transport.inject("scene.selected", 30);
  await flush();
  expect([g.state().selected, g.state().inView], "the unit's move").toEqual(["30", true]);
  g.list().scrollTop = pitch * (g.rowIndex("04") - 1);
  await flush();
  g.row("04").click();
  await flush();
  const scroll = g.list().scrollTop;
  await answer(0, taken);
  await answer(1, false);
  expect([g.state().selected, g.list().scrollTop]).toEqual(["30", scroll]);
});
