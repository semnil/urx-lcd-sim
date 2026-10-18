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
// A list or a sheet a press opens is drawn over the screen, and while it is up the page
// holds the controls it carries by what they name, not by what the box that opened it names.

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

/** What a press on a control can be: a touch on a button or on an element in one of the touched roles, or a turn of a value by the keys. */
const PRESSED_ROLES = new Set(["button", "switch", "option", "tab", "radio", "checkbox"]);
const TURNED_ROLES = new Set(["slider", "spinbutton"]);

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

const turned = (node: Element): boolean => TURNED_ROLES.has(node.getAttribute("role") ?? "");

/** The controls in reach on the glass, in the order the screen draws them. */
const controls = (root: HTMLElement): HTMLElement[] =>
  [...root.getElementsByTagName("*")].filter(
    (n): n is HTMLElement =>
      (n.tagName === "BUTTON" || PRESSED_ROLES.has(n.getAttribute("role") ?? "") || turned(n)) &&
      !n.classList.contains("is-disabled") &&
      n.getAttribute("aria-disabled") !== "true",
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

/** One piece of a survey's work: drawing a state of the screen, a press on a control it draws, or a press on a control a list or a sheet that press opens carries. */
type Task =
  | { kind: "draw"; shown: Edit[] }
  | { kind: "press"; shown: Edit[]; i: number }
  | { kind: "pick"; shown: Edit[]; i: number; j: number };

/** What each piece of work weighs against a case's share, roughly in proportion to the time it takes. */
const COST: Record<Task["kind"], number> = { draw: 1, press: 1, pick: 2 };

/** How much work one case takes on, and how many cases share a route's survey in one state. */
const SHARE = 35;
const PARTS = 5;

/** Pressing the controls of a route in one state, one press to a unit, taken a case's share at a time. */
interface Survey {
  route: Route;
  seed: Seed;
  /** The work still to take, in order. */
  tasks: Task[];
  /** The states of the screen reached so far, by the screen's own values that put it there. */
  seen: Set<string>;
  /** How many states of the screen the survey has queued. */
  states: number;
  presses: number;
  /** How many controls of the lists and sheets the presses open the survey has pressed. */
  picks: number;
  /** How much work the survey has taken. */
  spent: number;
  /** Each press that wrote a value its control does not name, with where in the survey's work it was taken. */
  unnamed: { at: number; text: string }[];
}

/** Press `node` the way its kind is pressed. */
function press(node: HTMLElement): void {
  if (turned(node)) {
    for (const key of ["ArrowUp", "ArrowDown", "ArrowRight", "ArrowLeft"])
      node.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  } else node.click();
}

/** The controls a list or a sheet laid over the screen carries that `before` did not hold. */
const layered = (root: HTMLElement, before: ReadonlySet<HTMLElement>): HTMLElement[] =>
  controls(root).filter((n) => !before.has(n) && n.closest("[data-overlay]") !== null);

/** The written values of `written` that `node` does not name, unless it hands the unit an operation. */
function unnamedBy(node: HTMLElement, written: readonly ParamPath[]): string | null {
  const names = lockNames(node, "path");
  const missed = lockNames(node, "op").length ? [] : written.filter((p) => !screenOnly(p) && !names.includes(p));
  return missed.length ? `${describeNode(node)} names [${names.join(", ")}] and writes ${missed.join(", ")}` : null;
}

/** Queue the state of the screen `shown` puts it in, where the survey has not reached it and has room for it. */
function reach(survey: Survey, shown: Edit[]): void {
  const key = JSON.stringify([...shown].sort(([a], [b]) => a.localeCompare(b)));
  if (survey.seen.has(key) || survey.states >= STATES_PER_ROUTE) return;
  survey.seen.add(key);
  survey.states++;
  survey.tasks.push({ kind: "draw", shown });
}

/**
 * Take one piece of `survey`'s work. A press that moves only the screen's own showing leads to
 * another state of the same screen, which the survey goes on to, and a press that opens a list or
 * a sheet leads to the controls it carries, whose writes are their own to name: while the list is
 * up the page draws it, and not the one that opened it, shut.
 */
async function take(survey: Survey, task: Task): Promise<string | null> {
  const { route, seed } = survey;
  const at = await mount(route, seed, task.shown);
  try {
    const root = at.shell.root;
    if (task.kind === "draw") {
      if (root.dataset["screen"] === route.id)
        for (const i of sampled(controls(root))) survey.tasks.push({ kind: "press", shown: task.shown, i });
      return null;
    }
    const before = new Set(controls(root));
    const node = [...before][task.i];
    if (!node) throw new Error(`no control ${task.i} on ${route.id}`);
    press(node);
    await flush();
    if (task.kind === "pick") {
      const pick = layered(root, before)[task.j];
      if (!pick) throw new Error(`no control ${task.j} on what ${describeNode(node)} opens`);
      at.edits.length = 0;
      press(pick);
      await flush();
      survey.picks++;
      const missed = unnamedBy(pick, [...new Set(at.edits.map(([p]) => p))]);
      return missed && `${missed}, on what ${describeNode(node)} opens`;
    }
    survey.presses++;
    const written = [...new Set(at.edits.map(([p]) => p))];
    const sameScreen = root.dataset["screen"] === route.id;
    if (written.length && written.every(isShown) && written.every((p) => follows(route, p)) && sameScreen)
      reach(survey, [...task.shown.filter(([p]) => !written.includes(p)), ...at.edits.filter(([p]) => isShown(p))]);
    if (sameScreen && written.every(isShown))
      for (const j of sampled(layered(root, before))) survey.tasks.push({ kind: "pick", shown: task.shown, i: task.i, j });
    return unnamedBy(node, written);
  } finally {
    release();
  }
}

/** Take `survey`'s work until it has taken `units` of it or has none left. */
async function advance(survey: Survey, units: number): Promise<void> {
  while (survey.spent < units) {
    const task = survey.tasks.shift();
    if (!task) return;
    const at = survey.spent;
    survey.spent += COST[task.kind];
    const missed = await take(survey, task);
    if (missed) survey.unnamed.push({ at, text: missed });
  }
}

/** Each route's survey in each state, shared by the cases that take its work. */
const surveys = new Map<string, Survey>();

function surveyOf(route: Route, state: string): Survey {
  const key = `${route.id}|${route.strip ?? ""}|${state}`;
  let found = surveys.get(key);
  if (!found) {
    const seed = statesFor(route)[state];
    if (!seed) throw new Error(`no state ${state} for ${route.id}`);
    found = { route, seed, tasks: [], seen: new Set(), states: 0, presses: 0, picks: 0, spent: 0, unnamed: [] };
    reach(found, []);
    surveys.set(key, found);
  }
  return found;
}

describe("a press on a control", () => {
  it.each(CASES.flatMap(([name, state, route]) => Array.from({ length: PARTS }, (_, part) => [name, state, part + 1, route] as const)))(
    "on %s, the unit %s, or on what it opens, writes only values the control names (part %i)",
    async (_, state, part, route) => {
      const survey = surveyOf(route, state);
      await advance(survey, part * SHARE);
      expect(survey.unnamed.filter(({ at }) => at >= (part - 1) * SHARE && at < part * SHARE).map(({ text }) => text)).toEqual([]);
      if (part === PARTS) {
        expect(survey.tasks, "the survey's work fits in its cases").toEqual([]);
        expect(survey.presses, "the screen was drawn and pressed").toBeGreaterThan(0);
      }
    },
  );

  it("reaches the controls a pulldown's list carries", async () => {
    const survey = surveyOf({ id: "ch.eq", strip: "ch1" }, "as shipped");
    await advance(survey, PARTS * SHARE);
    expect(survey.picks).toBeGreaterThan(0);
  });
});
