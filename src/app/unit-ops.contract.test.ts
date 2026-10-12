import { describe, expect, it } from "vitest";
import type { Route } from "./navigator";
import { Shell } from "./shell";
import type { ParamPath, ParamValue } from "../device/path";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import type { UnitActions, UnitOp } from "../device/unit";
import { emulatedActions } from "../device/unit";
import { filePath, writeCard, type CardEntry } from "../model/card";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";

// Every operation a screen hands the unit carries what the unit needs to carry
// it out, and a unit that refuses it leaves the simulator's own memory, card and
// recorder as they were. The host below answers from the operation alone: it
// reads nothing of the screens and runs nothing of the simulator.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(routes: Route[], actions: UnitActions, prep?: (shell: Shell) => Promise<void>): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model, [], { actions });
  await prep?.(shell);
  for (const route of routes) shell.ctx.nav.push(route);
  await flush();
  return shell;
}

const click = async (shell: Shell, selector: string, text?: string): Promise<void> => {
  const node = [...shell.root.querySelectorAll<HTMLElement>(selector)].find((n) => text === undefined || n.textContent === text);
  if (!node) throw new Error(`nothing at ${selector} ${text ?? ""}`);
  node.click();
  await flush();
};
const ok = (shell: Shell): Promise<void> => click(shell, ".dialog-actions .btn", "OK");
const typeName = async (shell: Shell, text: string): Promise<void> => {
  await shell.ctx.store.set("ui.titleEntry.text", text);
  await flush();
  await click(shell, ".pick-dialog-ok");
};
const set = (shell: Shell, values: Record<ParamPath, ParamValue>): Promise<void> =>
  Promise.all(Object.entries(values).map(([p, v]) => shell.ctx.store.set(p, v))).then(() => undefined);

const DATA: CardEntry = { name: "MIX.urxf", kind: "data", seconds: 0, tracks: 0, dir: "/" };
const TAKE: CardEntry = { name: "TAKE.wav", kind: "take", seconds: 30, tracks: 2, rate: 48_000, dir: "/" };
const STORED = { "scene.Standard.2.title": "Stored", "scene.Standard.2.state": "{}" };

interface Case {
  op: UnitOp;
  routes: Route[];
  /** The values the case starts from. */
  prep?: (shell: Shell) => Promise<void>;
  /** The gestures that lead up to the one that hands the operation over. */
  reach?: (shell: Shell) => Promise<void>;
  /** The gesture that hands the operation over. */
  hand: (shell: Shell) => Promise<void>;
}

const SCENE: Route[] = [{ id: "scene" }, { id: "scene.list" }];
const row = (no: number) => async (shell: Shell): Promise<void> => {
  await shell.ctx.store.set("scene.selected", no);
  await flush();
};

const CASES: Case[] = [
  { op: { kind: "scene.recall", scene: 2 }, routes: SCENE, prep: (s) => set(s, STORED), reach: async (s) => { await row(2)(s); await click(s, ".scene-actions .btn", "Recall"); }, hand: ok },
  {
    op: { kind: "scene.store", bank: "Standard", scene: 3, title: "Mix A" },
    routes: SCENE,
    reach: async (s) => {
      await row(3)(s);
      await click(s, ".scene-actions .btn", "Store");
      await typeName(s, "Mix A");
    },
    hand: ok,
  },
  { op: { kind: "scene.protect", bank: "Standard", scene: 2, protect: true }, routes: SCENE, prep: (s) => set(s, { ...STORED, "ui.sceneMenu": "Edit" }), reach: row(2), hand: (s) => click(s, "[aria-label='Protect']") },
  { op: { kind: "scene.delete", bank: "Standard", scene: 2 }, routes: SCENE, prep: (s) => set(s, { ...STORED, "ui.sceneMenu": "Edit" }), reach: async (s) => { await row(2)(s); await click(s, "[aria-label='Delete']"); }, hand: ok },
  {
    op: { kind: "settings.save", file: { dir: "/", name: "SET1.urxf" } },
    routes: [{ id: "microsd" }, { id: "microsd.saveload" }],
    prep: (s) => writeCard(s.ctx.store, []),
    reach: (s) => click(s, ".sd-actions .btn", "Save as"),
    hand: (s) => typeName(s, "SET1"),
  },
  {
    op: { kind: "settings.load", file: { dir: "/", name: "MIX.urxf" } },
    routes: [{ id: "microsd" }, { id: "microsd.saveload" }],
    // The card's list alone, as a unit reports it: the file's body is the unit's.
    prep: async (s) => {
      await writeCard(s.ctx.store, [DATA]);
      await set(s, { "sd.selectedFile": 0 });
    },
    hand: (s) => click(s, ".sd-actions .btn", "Load"),
  },
  { op: { kind: "card.insert" }, routes: [{ id: "microsd" }], prep: (s) => set(s, { "sd.mounted": false }), reach: (s) => click(s, ".sd-no-card"), hand: ok },
  { op: { kind: "card.eject" }, routes: [{ id: "microsd" }], reach: async (s) => { await click(s, ".sd-eject"); await ok(s); }, hand: ok },
  {
    op: { kind: "card.format", label: "CARD" },
    routes: [{ id: "microsd" }, { id: "microsd.tools" }],
    reach: async (s) => {
      await click(s, ".btn", "Format microSD");
      await typeName(s, "CARD");
    },
    hand: ok,
  },
  { op: { kind: "card.test" }, routes: [{ id: "microsd" }, { id: "microsd.tools" }], prep: (s) => set(s, { "ui.sdToolsTab": "Test" }), hand: (s) => click(s, ".btn", "Test microSD") },
  {
    op: { kind: "card.delete", file: { dir: "/", name: "MIX.urxf" } },
    routes: [{ id: "microsd" }, { id: "microsd.saveload" }],
    prep: async (s) => {
      await writeCard(s.ctx.store, [DATA]);
      await set(s, { "sd.selectedFile": 0, "ui.sdSaveTab": "Edit", [filePath(DATA)]: "{}" });
    },
    reach: (s) => click(s, ".sd-actions [aria-label='Delete']"),
    hand: ok,
  },
  {
    op: { kind: "card.rename", file: { dir: "/", name: "MIX.urxf" }, to: "LIVE.urxf" },
    routes: [{ id: "microsd" }, { id: "microsd.saveload" }],
    prep: async (s) => {
      await writeCard(s.ctx.store, [DATA]);
      await set(s, { "sd.selectedFile": 0, "ui.sdSaveTab": "Edit", [filePath(DATA)]: "{}" });
    },
    reach: (s) => click(s, ".sd-actions [aria-label='Rename']"),
    hand: (s) => typeName(s, "LIVE"),
  },
  {
    op: { kind: "card.newFolder", file: { dir: "/", name: "Gigs" } },
    routes: [{ id: "microsd" }, { id: "microsd.saveload" }],
    prep: (s) => set(s, { "ui.sdSaveTab": "Edit" }),
    reach: (s) => click(s, ".sd-actions [aria-label='New folder']"),
    hand: (s) => typeName(s, "Gigs"),
  },
  { op: { kind: "recorder.arm" }, routes: [{ id: "microsd" }, { id: "microsd.recorder" }], hand: (s) => click(s, "[aria-label='Record']") },
  { op: { kind: "recorder.record" }, routes: [{ id: "microsd" }, { id: "microsd.recorder" }], prep: (s) => set(s, { "sd.rec": "armed" }), hand: (s) => click(s, ".rec-transport [aria-label='Play']") },
  {
    op: { kind: "recorder.pause" },
    routes: [{ id: "microsd" }, { id: "microsd.recorder" }],
    prep: (s) => set(s, { "sd.rec": "recording", "sd.recSince": Date.now() }),
    hand: (s) => click(s, ".rec-transport [aria-label='Pause']"),
  },
  { op: { kind: "recorder.stop" }, routes: [{ id: "microsd" }, { id: "microsd.recorder" }], prep: (s) => set(s, { "sd.rec": "armed" }), hand: (s) => click(s, ".rec-transport [aria-label='Stop']") },
  {
    op: { kind: "playback.start", file: { dir: "/", name: "TAKE.wav" } },
    routes: [{ id: "microsd" }, { id: "microsd.recorder" }],
    prep: async (s) => {
      await writeCard(s.ctx.store, [TAKE]);
      await set(s, { "sd.selectedFile": 0, "ui.sdTab": "Play" });
    },
    hand: (s) => click(s, ".rec-pause"),
  },
  {
    op: { kind: "playback.pause" },
    routes: [{ id: "microsd" }, { id: "microsd.recorder" }],
    prep: async (s) => {
      await writeCard(s.ctx.store, [TAKE]);
      await set(s, { "sd.selectedFile": 0, "ui.sdTab": "Play", "sd.playingFile": 0, "sd.playing": true, "sd.playSince": Date.now() });
    },
    hand: (s) => click(s, ".rec-pause"),
  },
  {
    op: { kind: "playback.stop" },
    routes: [{ id: "microsd" }, { id: "microsd.recorder" }],
    prep: async (s) => {
      await writeCard(s.ctx.store, [TAKE]);
      await set(s, { "sd.selectedFile": 0, "ui.sdTab": "Play", "sd.playingFile": 0, "sd.playing": false });
    },
    hand: (s) => click(s, "[aria-label='Stop']"),
  },
];

/** Every value the store holds but the screens' own, by path. */
function values(shell: Shell): Map<ParamPath, ParamValue> {
  const store = shell.ctx.store;
  return new Map(store.paths().filter((p) => !p.startsWith("ui.")).map((p) => [p, store.get(p, null as unknown as ParamValue)]));
}

const kinds = (): string[] => CASES.map((c) => c.op.kind);

describe("the operations a screen hands the unit", () => {
  it("covers every kind of operation once", () => {
    const every: UnitOp["kind"][] = [
      "scene.recall", "scene.store", "scene.protect", "scene.delete", "settings.save", "settings.load",
      "card.insert", "card.eject", "card.format", "card.test", "card.delete", "card.rename", "card.newFolder",
      "recorder.arm", "recorder.record", "recorder.pause", "recorder.stop", "playback.start", "playback.pause", "playback.stop",
    ];
    expect(kinds().sort()).toEqual([...every].sort());
  });

  for (const c of CASES) {
    it(`${c.op.kind} carries its target and what was typed, and a unit refusing it leaves the simulator as it was`, async () => {
      const handed: UnitOp[] = [];
      const shell = await mount(c.routes, { kind: "device", perform: (op) => (handed.push(op), false) }, c.prep);
      await c.reach?.(shell);
      expect(handed, "nothing is handed over before the last gesture").toEqual([]);
      const before = values(shell);
      await c.hand(shell);
      for (let i = 0; i < 10; i++) await flush();
      expect(handed).toEqual([c.op]);
      expect(values(shell)).toEqual(before);
      expect(shell.root.textContent ?? "", "no progress modal of the simulator's").not.toContain("in progress");
    });

    it(`${c.op.kind} is carried out by the simulated unit`, async () => {
      const shell = await mount(c.routes, emulatedActions, async (s) => {
        await c.prep?.(s);
        // A settings file the simulated card holds a body for.
        if (c.op.kind === "settings.load") await s.ctx.store.set(filePath(DATA), "{}");
      });
      await c.reach?.(shell);
      const before = values(shell);
      await c.hand(shell);
      for (let i = 0; i < 10; i++) await flush();
      const progress = shell.root.textContent?.includes("in progress") === true;
      expect(progress || JSON.stringify([...values(shell)]) !== JSON.stringify([...before]), "the store moved or a progress modal came up").toBe(true);
    });
  }
});
