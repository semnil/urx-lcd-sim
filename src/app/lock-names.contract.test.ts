import { afterEach, describe, expect, it } from "vitest";
import type { ParamPath, ParamValue } from "../device/path";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { type CardEntry, writeCard } from "../model/card";
import { factoryState } from "../model/defaults";
import { FX_EFFECTS, INPUT_INSERT_EFFECTS, NO_EFFECT, OUTPUT_INSERT_EFFECTS, effectParams } from "../model/effects";
import type { Strip, StripKind } from "../model/types";
import { carriesInsert, findStrip } from "../model/types";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { startPlayback } from "../screens/recording";
import { screenOnly } from "../screens/screen-only";
import { lockNames } from "../ui/dom";
import type { Route } from "./navigator";
import { Shell } from "./shell";

// A page holds a control shut by the values the control names as the ones it writes
// (src/ui/locks.ts). A press that writes a value its control does not name is drawn as
// usable while the store refuses it, so every value a press on a screen writes has to be
// one its control names. A control that hands the unit an operation is held by the
// operation, which `perform` refuses whole, so what the operation writes is its own.

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

const MODEL = unitById("URX44V");
const registry = buildRegistry();

/** One strip of each kind, the first the unit lists. */
const STRIPS: Strip[] = (() => {
  const seen = new Set<StripKind>();
  return [...MODEL.inputs, ...MODEL.outputs].filter((s) => !seen.has(s.kind) && seen.add(s.kind));
})();

const channelScreen = (id: string): boolean => id === "channel-view" || id.startsWith("ch.");

const entry = (name: string, kind: CardEntry["kind"], dir: string): CardEntry => ({
  name,
  kind,
  seconds: kind === "take" ? 10 : 0,
  tracks: kind === "take" ? 2 : 0,
  stamp: kind === "folder" ? "" : "04/30/2026\n15:29:28",
  dir,
});

type Seed = (store: DeviceStore) => Promise<void>;

/** Take effect `name` on the effect `base` holds, with the values it comes up at, the way a pick on its sheet does. */
const takenEffect =
  (base: string, namePath: string, onPath: string, name: string, extra: [ParamPath, ParamValue][] = []): Seed =>
  async (store) => {
    await store.set(namePath, name);
    if (onPath) await store.set(onPath, name !== NO_EFFECT);
    for (const p of effectParams(name)) await store.set(`${base}.${p.key}`, p.fallback);
    for (const [path, value] of extra) await store.set(path, value);
  };

/** Every effect the strip `id` can carry, taken, and again with its 1-knob on where it has one. */
function effectStates(id: string): Record<string, Seed> {
  const strip = findStrip(MODEL, id);
  const out: Record<string, Seed> = {};
  if (!strip) return out;
  const fx = FX_EFFECTS[id];
  const taking = fx
    ? fx.map((o) => ({ name: o.name, base: `ch.${id}.effect`, namePath: `ch.${id}.effect.type`, onPath: "" }))
    : carriesInsert(strip)
      ? (strip.side === "output" ? OUTPUT_INSERT_EFFECTS : INPUT_INSERT_EFFECTS).map((o) => ({ name: o.name, base: `ch.${id}.insFx`, namePath: `ch.${id}.insFx.effect`, onPath: `ch.${id}.insFx.on` }))
      : [];
  for (const t of taking) {
    if (t.name === NO_EFFECT) continue;
    out[`with ${t.name} taken`] = takenEffect(t.base, t.namePath, t.onPath, t.name);
    if (effectParams(t.name).some((p) => p.key === "oneKnobOn"))
      out[`with ${t.name} taken, 1-knob on`] = takenEffect(t.base, t.namePath, t.onPath, t.name, [[`${t.base}.oneKnobOn`, true]]);
  }
  return out;
}

/**
 * The units a route's presses start from: as it ships, and in the states that bring controls
 * the factory state leaves out of reach or undrawn into reach on that route — a strip in the
 * cue and a card holding an open folder with a take in it playing, 1-knob on, Follow USB off,
 * and each effect a channel can carry.
 */
function statesFor(route: Route): Record<string, Seed> {
  const states: Record<string, Seed> = { "as shipped": async () => undefined };
  const id = route.id;
  if (["home", "bank-select", "sends-select", "channel-view"].includes(id) || id.startsWith("microsd") || id.startsWith("monitor"))
    states["in use"] = async (store) => {
      await store.set("ch.ch1.cue", true);
      await writeCard(store, [entry("Recordings", "folder", "/"), entry("take.wav", "take", "/Recordings/"), entry("other.wav", "take", "/Recordings/")]);
      await store.set("sd.path", "/Recordings/");
      startPlayback(store, 1);
    };
  if (["channel-view", "ch.eq", "ch.comp"].includes(id))
    states["with 1-knob on"] = async (store) => {
      for (const path of store.paths()) if (/\.(eq|comp)\.oneKnob\.on$/.test(path)) await store.set(path, true);
    };
  if (id === "setup.rate") states["with Follow USB off"] = async (store) => void (await store.set("setup.followUsb", false));
  if ((id === "ch.insfx" || id === "ch.effect") && route.strip) Object.assign(states, effectStates(route.strip));
  return states;
}

/** Every screen, on every kind of strip a channel screen is drawn for, in each state that matters to it. */
const CASES: [string, string, Route][] = registry
  .ids()
  .sort()
  .flatMap((id): Route[] => (channelScreen(id) ? STRIPS.map((s) => ({ id, strip: s.id })) : [{ id }]))
  .flatMap((route) => Object.keys(statesFor(route)).map((state) => [route.strip ? `${route.id} on ${route.strip}` : route.id, state, route] as [string, string, Route]));

/** What a press on a control can be: a touch, or a turn of a value by the keys. */
const PRESSABLE = 'button, [role="button"], [role="switch"], [role="option"], [role="tab"], [role="radio"], [role="checkbox"]';
const TURNABLE = '[role="slider"], [role="spinbutton"]';

/** How many screen states a route is pressed in at most: the one it opens on, and those its own tabs and pages lead to. */
const STATES_PER_ROUTE = 8;

/**
 * How many controls of a run built alike — the same kind of element under the same parent or
 * in the same run of rows, such as the rows of a list or the tiles of a sheet — are pressed:
 * the first and the last two, since one piece of code builds every one of them.
 */
const RUN_ENDS = 2;

/** The screens' own values that move the screen onto another strip, which a route of its own covers. */
const OTHER_STRIP = /^ui\.(selectedStrip|lane\.)/;

/** The screens' own values the glass's frame keeps on every screen, followed on one route alone. */
const FRAME = /^ui\.userDefinedKnobs$/;
const FRAME_ROUTE: Route = { id: "ch.eq", strip: "ch1" };

/** Whether `route` follows a press that moves `path` onto another state of its screen. */
const follows = (route: Route, path: ParamPath): boolean =>
  !OTHER_STRIP.test(path) && (!FRAME.test(path) || (route.id === FRAME_ROUTE.id && route.strip === FRAME_ROUTE.strip));

const alive: Shell[] = [];

afterEach(() => {
  for (const shell of alive.splice(0)) shell.destroy();
});

type Edit = [ParamPath, ParamValue];

/** A unit in `state`, with the screens' own values `shown` put back, on `route`. */
async function mount(route: Route, seed: Seed, shown: readonly Edit[]): Promise<{ shell: Shell; edits: Edit[] }> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(MODEL)));
  await seed(store);
  if (route.id.startsWith("ch.ssmcs") && STRIPS.find((s) => s.id === route.strip)?.kind === "monoIn") {
    await store.set(`ch.${route.strip}.compEqOrder`, "SSMCS");
  }
  for (const [path, value] of shown) await store.set(path, value);
  const shell = new Shell(registry, store, MODEL, [route]);
  alive.push(shell);
  await flush();
  // What a press writes, less what a control counts as it is drawn (`writesOf`), which writes nothing.
  const edits: Edit[] = [];
  let counting = 0;
  const set = store.set.bind(store);
  const writesOf = store.writesOf.bind(store);
  store.writesOf = (op: () => void): ParamPath[] => {
    counting++;
    try {
      return writesOf(op);
    } finally {
      counting--;
    }
  };
  store.set = (path: ParamPath, value: ParamValue): Promise<void> => {
    if (counting === 0) edits.push([path, value]);
    return set(path, value);
  };
  return { shell, edits };
}

const release = (): void => {
  for (const shell of alive.splice(0)) shell.destroy();
};

/** The controls in reach on the glass, in the order the screen draws them. */
const controls = (root: HTMLElement): HTMLElement[] =>
  [...root.querySelectorAll<HTMLElement>(`${PRESSABLE}, ${TURNABLE}`)].filter(
    (n) => !n.classList.contains("is-disabled") && n.getAttribute("aria-disabled") !== "true",
  );

/** What a run of controls built alike stands in: their parent, or the parent's own parent where the parent is one of a run of rows built alike. */
function holderOf(node: HTMLElement): Element | null {
  const row = node.parentElement;
  const rows = row?.parentElement;
  if (!row || !rows) return row;
  return [...rows.children].filter((c) => c.tagName === row.tagName && c.className === row.className).length > 1 ? rows : row;
}

/** The indexes of `nodes` pressed: every one, but only the ends of a run built alike. */
function sampled(nodes: readonly HTMLElement[]): number[] {
  const runs = new Map<string, number[]>();
  const holders = new Map<Element, number>();
  nodes.forEach((n, i) => {
    const holder = holderOf(n);
    if (holder && !holders.has(holder)) holders.set(holder, holders.size);
    const kind = [...n.classList].filter((c) => !c.startsWith("is-")).join(".");
    const key = `${holder ? holders.get(holder) : -1}|${n.tagName}|${n.getAttribute("role") ?? ""}|${kind}`;
    runs.set(key, [...(runs.get(key) ?? []), i]);
  });
  return [...runs.values()]
    .flatMap((run) => (run.length <= RUN_ENDS * 2 ? run : [...run.slice(0, RUN_ENDS), ...run.slice(-RUN_ENDS)]))
    .sort((a, b) => a - b);
}

const describeNode = (node: HTMLElement): string =>
  `${node.tagName.toLowerCase()}.${[...node.classList].join(".")} "${(node.getAttribute("aria-label") ?? node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 30)}"`;

const isShown = (path: ParamPath): boolean => path.startsWith("ui.");

interface Sweep {
  /** Each press that wrote a value its control does not name. */
  unnamed: string[];
  /** How many presses the sweep made. */
  presses: number;
  /** How many of them were on a control a list or a sheet opened. */
  picks: number;
}

/** Press `node` the way its kind is pressed. */
function press(node: HTMLElement): void {
  if (node.matches(TURNABLE)) {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft"])
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  } else node.click();
}

/** The controls a list or a sheet laid over the screen carries that `before` did not hold. */
const layered = (root: HTMLElement, before: ReadonlySet<HTMLElement>): HTMLElement[] =>
  controls(root).filter((n) => !before.has(n) && n.closest("[data-overlay]") !== null);

/**
 * Press the controls on `route` in `seed`'s state, one press to a unit, and again in each
 * state of the screen's own values a press leads to — a tab, a page — up to STATES_PER_ROUTE
 * of them. A press that writes nothing and opens a list or a sheet on the same screen has its
 * controls pressed in turn, and what that writes is named by the control pressed or by the one
 * that opened it: the page draws either shut, the one that opened it before the list is up and
 * the one in the list while it is.
 */
async function sweep(route: Route, seed: Seed): Promise<Sweep> {
  const out: Sweep = { unnamed: [], presses: 0, picks: 0 };
  const queue: Edit[][] = [[]];
  const seen = new Set<string>([JSON.stringify([])]);
  const check = (node: HTMLElement, written: ParamPath[], opener?: HTMLElement): void => {
    const by = opener ? [opener, node] : [node];
    const names = by.flatMap((n) => lockNames(n, "path"));
    const missed = by.some((n) => lockNames(n, "op").length) ? [] : written.filter((p) => !screenOnly(p) && !names.includes(p));
    const what = opener ? `${describeNode(node)} on what ${describeNode(opener)} opens` : describeNode(node);
    if (missed.length) out.unnamed.push(`${what} names [${names.join(", ")}] and writes ${missed.join(", ")}`);
  };
  for (let s = 0; s < queue.length && s < STATES_PER_ROUTE; s++) {
    const shown = queue[s] ?? [];
    const first = await mount(route, seed, shown);
    const drawn = first.shell.root.dataset["screen"] === route.id ? sampled(controls(first.shell.root)) : [];
    release();
    for (const i of drawn) {
      const at = await mount(route, seed, shown);
      const before = new Set(controls(at.shell.root));
      const node = [...before][i];
      if (!node) continue;
      press(node);
      await flush();
      out.presses++;
      const written = [...new Set(at.edits.map(([p]) => p))];
      check(node, written);
      const sameScreen = at.shell.root.dataset["screen"] === route.id;
      // A press that moves only the screen's own showing leads to another state of the same screen.
      if (written.length && written.every(isShown) && written.every((p) => follows(route, p)) && sameScreen) {
        const next = [...shown.filter(([p]) => !written.includes(p)), ...at.edits.filter(([p]) => isShown(p))];
        const key = JSON.stringify([...next].sort(([a], [b]) => a.localeCompare(b)));
        if (!seen.has(key)) {
          seen.add(key);
          queue.push(next);
        }
      }
      const opened = sameScreen && written.every(isShown) ? sampled(layered(at.shell.root, before)) : [];
      release();
      for (const j of opened) {
        const again = await mount(route, seed, shown);
        const prior = new Set(controls(again.shell.root));
        const opener = [...prior][i];
        if (!opener) continue;
        press(opener);
        await flush();
        const pick = layered(again.shell.root, prior)[j];
        if (!pick) continue;
        again.edits.length = 0;
        press(pick);
        await flush();
        out.presses++;
        out.picks++;
        check(pick, [...new Set(again.edits.map(([p]) => p))], opener);
        release();
      }
    }
  }
  return out;
}

describe("a press on a control", () => {
  it("reaches the values a pulldown's list writes", async () => {
    expect((await sweep({ id: "ch.eq", strip: "ch1" }, async () => undefined)).picks).toBeGreaterThan(0);
  });

  it.each(CASES)("on %s, the unit %s, writes only values the control names", async (_, state, route) => {
    const seed = statesFor(route)[state];
    if (!seed) throw new Error(`no state ${state} for ${route.id}`);
    const { unnamed, presses } = await sweep(route, seed);
    expect(presses, "the screen was drawn and pressed").toBeGreaterThan(0);
    expect(unnamed).toEqual([]);
  });
});
