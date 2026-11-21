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
  return { host, sim, transport, one, click, button, list, open, menu, state, failures };
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

it.each(["unwritable", "at once", "later"] as const)("leaves the list where it was scrolled when a row touched is refused %s", async (when) => {
  const g = await mount([["scene.selected", 40]]);
  const refuse = refuseSelection(g, when);
  await g.open();
  expect(g.state().inView, "the selection in view on opening").toBe(true);
  g.list().scrollTop = 10;
  g.list().querySelectorAll<HTMLElement>(".list-row")[3]!.click();
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
  g.list().querySelectorAll<HTMLElement>(".list-row")[3]!.click();
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
  g.list().querySelectorAll<HTMLElement>(".list-row")[3]!.click();
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
