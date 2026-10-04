import { describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { BindingTable, boolCodec, type Codec } from "../device/binding";
import { BridgeTransport, UnboundPathError, type DeviceLink } from "../device/bridge-transport";
import type { ParamPath, ParamValue } from "../device/path";
import { DeviceStore, type WriteFailure } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { filePath, writeCard, type CardEntry } from "../model/card";
import { factoryState } from "../model/defaults";
import { findStrip } from "../model/types";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { takeInsert } from "./insert-fx";
import { setBusType } from "./mix-bus";
import { pausePlayback, pauseTake, playedSeconds, recordTake, startPlayback, stopPlayback, stopTake, takeSeconds } from "./recording";
import { storeScene } from "./scene";
import { screenOnly } from "./screen-only";
import { setPanBal, setSignalType } from "./stereo-link";

// An operation that sets one value together with the values that follow from it
// goes to a unit whole or not at all, the values the screens keep for themselves aside.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

type Ctx = Shell["ctx"];

interface Operation {
  name: string;
  /** The path the operation is about; the others follow from it. */
  main: ParamPath;
  prep?: (ctx: Ctx, shell: Shell) => Promise<void>;
  act: (ctx: Ctx, shell: Shell) => Promise<void>;
}

const strip = (ctx: Ctx, id: string) => {
  const s = findStrip(ctx.model, id);
  if (!s) throw new Error(`no strip ${id}`);
  return s;
};

const tap = async (shell: Shell, selector: string, text?: string): Promise<void> => {
  const node = [...shell.root.querySelectorAll<HTMLElement>(selector)].find((n) => text === undefined || (n.textContent ?? "").trim() === text);
  if (!node) throw new Error(`nothing to tap at ${selector} ${text ?? ""}`);
  node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  node.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await flush();
};

const open = async (shell: Shell, id: string, stripId = "ch1"): Promise<void> => {
  shell.ctx.nav.home();
  shell.ctx.nav.push({ id, strip: stripId });
  await flush();
};

const link = async (ctx: Ctx): Promise<void> => {
  setSignalType(ctx, strip(ctx, "ch1"), "STEREO");
  await flush();
};

const OPERATIONS: Operation[] = [
  { name: "BUS Type", main: "ch.bus.mix1.busType", act: async (ctx) => setBusType(ctx, strip(ctx, "bus.mix1"), "FIXED") },
  { name: "Signal Type", main: "ch.ch1.signalType", act: async (ctx) => setSignalType(ctx, strip(ctx, "ch1"), "STEREO") },
  {
    name: "PAN/BAL",
    main: "ch.ch1.panBal",
    prep: async (ctx) => {
      await link(ctx);
      setPanBal(ctx, strip(ctx, "ch1"), "PAN");
      await flush();
    },
    act: async (ctx) => setPanBal(ctx, strip(ctx, "ch1"), "BAL"),
  },
  {
    name: "COMP / EQ",
    main: "ch.ch1.compEqOrder",
    prep: async (_ctx, shell) => open(shell, "ch.setting"),
    act: async (_ctx, shell) => {
      await tap(shell, ".chs-field .pulldown", "COMP->EQ");
      await tap(shell, ".dropdown-option", "SSMCS");
    },
  },
  {
    name: "1-knob EQ",
    main: "ch.ch1.eq.oneKnob.on",
    prep: async (ctx, shell) => {
      await ctx.store.set("ch.ch1.eq.oneKnob.type", "Vocal");
      await ctx.store.set("ch.ch1.eq.oneKnob.level", 0);
      await open(shell, "ch.eq");
    },
    act: async (_ctx, shell) => tap(shell, "button.oneknob"),
  },
  { name: "an insert", main: "ch.ch1.insFx.effect", act: async (ctx) => takeInsert(ctx, strip(ctx, "ch1"), "Clean") },
  {
    name: "an input source",
    main: "ch.ch1.source",
    prep: async (_ctx, shell) => open(shell, "ch.input"),
    act: async (_ctx, shell) => {
      await tap(shell, "button.input-source-btn");
      await tap(shell, "button.source-btn", "None");
    },
  },
  {
    name: "the sampling frequency",
    main: "setup.samplingFrequency",
    prep: async (ctx, shell) => {
      takeInsert(ctx, strip(ctx, "ch1"), "Pitch Fix");
      await open(shell, "setup.rate");
    },
    act: async (_ctx, shell) => tap(shell, "button.rate-btn", "192kHz"),
  },
  {
    name: "playback",
    main: "sd.playing",
    prep: async (ctx) => {
      startPlayback(ctx.store, 2, 500);
      pausePlayback(ctx.store, 800);
      await flush();
    },
    act: async (ctx) => startPlayback(ctx.store, 0, 1_000),
  },
  {
    name: "recording on from a pause",
    main: "sd.rec",
    prep: async (ctx) => {
      recordTake(ctx.store, 1_000);
      pauseTake(ctx.store, 2_000);
      await flush();
    },
    act: async (ctx) => recordTake(ctx.store, 3_000),
  },
  {
    name: "SCENE's bank",
    main: "scene.bank",
    prep: async (ctx, shell) => {
      await ctx.store.set("scene.selected", 3);
      await ctx.store.set("ui.sceneMenu", "Edit");
      await open(shell, "scene.list");
    },
    act: async (_ctx, shell) => tap(shell, "button.scene-bank", "Simple"),
  },
];

/** How a value of this type goes over the link: a string as it is, anything else as an integer. */
function codecFor(value: ParamValue): { codec: Codec; isString?: boolean } {
  if (typeof value === "string") return { codec: { encode: () => 0, decode: () => "" }, isString: true };
  if (typeof value === "boolean") return { codec: boolCodec };
  return {
    codec: {
      encode: (v) => (v === -Infinity ? -32768 : Math.round(Number(v) * 1000)),
      decode: (raw) => (raw === -32768 ? -Infinity : raw / 1000),
    },
  };
}

function fakeLink(): DeviceLink & { values: Map<string, number>; strings: Map<string, string>; sent: string[] } {
  const values = new Map<string, number>();
  const strings = new Map<string, string>();
  const sent: string[] = [];
  return {
    values,
    strings,
    sent,
    get: (addr) => Promise.resolve(values.get(addr) ?? 0),
    set: (addr, value) => {
      values.set(addr, value);
      sent.push(addr);
      return Promise.resolve();
    },
    getStr: (addr) => Promise.resolve(strings.get(addr) ?? ""),
    setStr: (addr, value) => {
      strings.set(addr, value);
      sent.push(addr);
      return Promise.resolve();
    },
    subscribe: () => Promise.resolve(() => undefined),
  };
}

async function mount(): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  document.body.replaceChildren(shell.root);
  await flush();
  return shell;
}

/** What the operation writes on the simulator, path by path, and the value each ends on. */
async function onSimulator(op: Operation): Promise<Map<ParamPath, ParamValue>> {
  const shell = await mount();
  await op.prep?.(shell.ctx, shell);
  const written = new Map<ParamPath, ParamValue>();
  const off = shell.ctx.store.onChange((paths) => {
    for (const p of paths) written.set(p, shell.ctx.store.get(p, null as never));
  });
  shell.ctx.store.flush();
  await op.act(shell.ctx, shell);
  shell.ctx.store.flush();
  off();
  shell.destroy();
  return written;
}

/**
 * The operation on a unit with `bound` bound, each carried as the type of the value
 * the operation writes there, the unit starting from the simulator's state; `watch`
 * names more paths to read on the store before and after.
 */
async function onUnit(op: Operation, bound: ParamPath[], written: ReadonlyMap<ParamPath, ParamValue>, watch: ParamPath[] = []) {
  const shell = await mount();
  await op.prep?.(shell.ctx, shell);
  const store = shell.ctx.store;
  const unit = fakeLink();
  const bindings = new BindingTable();
  for (const p of bound) {
    const { codec, isString } = codecFor(written.get(p) ?? 0);
    bindings.bind(p, { addr: p, codec, ...(isString ? { isString } : {}) });
    if (!store.has(p)) continue;
    const value = store.get(p, 0 as ParamValue);
    if (isString) unit.strings.set(p, String(value));
    else unit.values.set(p, codec.encode(value));
  }
  await store.attach(new BridgeTransport(unit, bindings));
  const failures: WriteFailure[] = [];
  store.onWriteFailure((f) => failures.push(f));
  const read = (paths: ParamPath[]) => new Map(paths.map((p) => [p, store.get(p, null as never)]));
  const before = read(bound);
  const watchedBefore = read(watch);
  await op.act(shell.ctx, shell);
  await flush();
  const after = read(bound);
  const watchedAfter = read(watch);
  shell.destroy();
  return { sent: unit.sent, failures, before, after, watchedBefore, watchedAfter, store };
}

describe("an operation that sets one value and the values that follow from it", () => {
  for (const op of OPERATIONS) {
    it(`goes to a unit whole or not at all, the screens' own values aside: ${op.name}`, async () => {
      const written = await onSimulator(op);
      const paths = [...written.keys()];
      expect(paths, "on the simulator it writes its value and others with it").toContain(op.main);
      expect(paths.length, "on the simulator it writes more than one value").toBeGreaterThan(1);
      const unit = paths.filter((p) => !screenOnly(p));
      const own = paths.filter(screenOnly);

      const others = unit.filter((p) => p !== op.main);
      const unbound = await onUnit(op, others, written, own);
      expect(unbound.sent, "with its own path unbound, nothing reaches the unit").toEqual([]);
      expect(unbound.after, "and the values that follow from it stay where the unit holds them").toEqual(unbound.before);
      expect(unbound.watchedAfter, "as do the screens' own values").toEqual(unbound.watchedBefore);
      const refused = unbound.failures.map((f) => f.path);
      expect(refused, "the refusal of its own path is reported").toContain(op.main);
      expect(
        unbound.failures.filter((f) => others.includes(f.path) || !(f.error instanceof UnboundPathError)),
        "and no other refusal than of a path with no address",
      ).toEqual([]);

      // Every path of the unit's the operation writes: those it changes on the simulator,
      // and those a unit refuses it for, written with a value the simulator already held.
      // The screens' own values stay unbound.
      const targets = new Map([...written].filter(([p]) => !screenOnly(p)));
      let onUnitOnly = await onUnit(op, [...targets.keys()], targets, own);
      for (let round = 0; onUnitOnly.failures.some((f) => !screenOnly(f.path)) && round < 3; round++) {
        for (const f of onUnitOnly.failures) if (!screenOnly(f.path)) targets.set(f.path, f.attempted);
        onUnitOnly = await onUnit(op, [...targets.keys()], targets, own);
      }
      expect(onUnitOnly.failures.map((f) => f.path), "with every path of the unit's bound, nothing is refused").toEqual([]);
      expect(onUnitOnly.watchedAfter, "and the screens' own values stay on the screen with the operation's values").toEqual(
        new Map(own.map((p) => [p, written.get(p)])),
      );
      const changing = [...targets.keys()].filter((p) => onUnitOnly.before.get(p) !== targets.get(p));
      expect(changing, "the unit holds its own value otherwise before").toContain(op.main);
      expect(new Set(onUnitOnly.sent), "and each of its values the operation changes reaches the unit").toEqual(new Set(changing));
      expect(onUnitOnly.after.get(op.main), "and the unit holds the operation's own value").toBe(written.get(op.main));

      for (const p of own) targets.set(p, written.get(p) as ParamValue);
      const whole = await onUnit(op, [...targets.keys()], targets);
      expect(whole.failures, "with the screens' own values bound as well, nothing is refused").toEqual([]);
    });
  }
});

describe("a value the screens keep for themselves", () => {
  it("is anything under ui., and the recorder's and playback's clocks", () => {
    const own = ["ui.sceneMenu", "ui.bank", "sd.recSeconds", "sd.recSince", "sd.playSeconds", "sd.playSince"];
    const unit = ["sd.rec", "sd.playing", "sd.playingFile", "scene.bank", "scene.selected", "ch.ch1.level", "sd.card"];
    expect([...own, ...unit].map((p) => [p, screenOnly(p)])).toEqual([...own.map((p) => [p, true]), ...unit.map((p) => [p, false])]);
  });

  const unitWith = async (op: Operation, bound: [ParamPath, ParamValue][]) => onUnit(op, bound.map(([p]) => p), new Map(bound));
  const recordingOn = OPERATIONS.find((o) => o.name === "recording on from a pause");
  const playback = OPERATIONS.find((o) => o.name === "playback");
  const sceneBank = OPERATIONS.find((o) => o.name === "SCENE's bank");

  it("holds no recording back, and keeps its clock running, where the clock alone has no address", async () => {
    if (!recordingOn) throw new Error("no recording operation");
    // The take goes on at 3 s and is read 3 s later.
    const onlyRec = await unitWith(recordingOn, [["sd.rec", "paused"]]);
    expect(onlyRec.sent, "the recorder's own state reaches the unit").toEqual(["sd.rec"]);
    expect(onlyRec.after.get("sd.rec"), "and the unit records").toBe("recording");
    expect(onlyRec.failures, "nothing is refused").toEqual([]);
    expect(takeSeconds(onlyRec.store, 6_000), "and the take's counter runs").toBe(3);

    const withClock = await unitWith(recordingOn, [
      ["sd.rec", "paused"],
      ["sd.recSince", 0],
    ]);
    expect(withClock.sent).toEqual(["sd.recSince", "sd.rec"]);
    expect(withClock.failures).toEqual([]);
    expect(takeSeconds(withClock.store, 6_000), "control: the clock bound as well").toBe(3);
  });

  it("keeps playback's clock running where the clock alone has no address", async () => {
    if (!playback) throw new Error("no playback operation");
    // The file goes on at 1 s and is read 3 s later.
    const bound: [ParamPath, ParamValue][] = [
      ["sd.playing", false],
      ["sd.playingFile", 0],
    ];
    const noClock = await unitWith(playback, bound);
    expect(new Set(noClock.sent), "playback's own state reaches the unit").toEqual(new Set(["sd.playing", "sd.playingFile"]));
    expect(noClock.failures, "nothing is refused").toEqual([]);
    expect(playedSeconds(noClock.store, 4_000), "and the file's counter runs").toBe(3);

    const withClock = await unitWith(playback, [...bound, ["sd.playSeconds", 0], ["sd.playSince", 0]]);
    expect(withClock.failures).toEqual([]);
    expect(playedSeconds(withClock.store, 4_000), "control: the clock bound as well").toBe(3);
  });

  it("keeps an edit to one of them alone on the screen where it has no address", async () => {
    const menu: Operation = { name: "SCENE's menu", main: "ui.sceneMenu", act: async (ctx) => ctx.store.set("ui.sceneMenu", "Edit") };
    const alone = await unitWith(menu, []);
    expect([alone.sent, alone.failures, alone.store.str("ui.sceneMenu", "")], "nothing sent, nothing refused, the menu on the screen").toEqual([[], [], "Edit"]);
  });

  it("holds no change of SCENE's bank back where it alone has no address", async () => {
    if (!sceneBank) throw new Error("no SCENE bank operation");
    const bound: [ParamPath, ParamValue][] = [
      ["scene.bank", "Standard"],
      ["scene.selected", 0],
    ];
    const noMenu = await unitWith(sceneBank, bound);
    expect(new Set(noMenu.sent), "the bank and the selected row reach the unit").toEqual(new Set(["scene.bank", "scene.selected"]));
    expect(noMenu.after.get("scene.bank"), "and the bank changes").toBe("Simple");
    expect(noMenu.failures, "nothing is refused").toEqual([]);
    expect(noMenu.store.str("ui.sceneMenu", ""), "and the menu the bank leaves up stays on the screen").toBe((await onSimulator(sceneBank)).get("ui.sceneMenu"));

    const withMenu = await unitWith(sceneBank, [...bound, ["ui.sceneMenu", "Edit"]]);
    expect(withMenu.failures).toEqual([]);
    expect(withMenu.after.get("scene.bank")).toBe("Simple");
  });
});

/** The simulated unit, which once shut declares one path it cannot write and refuses a write to it. */
class OnePathShut extends SimTransport {
  private shutting = false;

  constructor(
    initial: Map<ParamPath, ParamValue>,
    private readonly path: ParamPath,
  ) {
    super(initial);
  }

  shut(): void {
    this.shutting = true;
  }

  writable(path: ParamPath): boolean {
    return !(this.shutting && path === this.path);
  }

  override write(path: ParamPath, value: ParamValue): ReturnType<SimTransport["write"]> {
    return this.writable(path) ? super.write(path, value) : Promise.reject(new Error(`"${path}" cannot be written`));
  }
}

interface ScreenOperation {
  name: string;
  /** A path the operation writes; the simulated unit refuses it. */
  main: ParamPath;
  /** Up to the touch that makes the operation, the card on the unit first. */
  prep?: (shell: Shell) => Promise<void>;
  card?: CardEntry[];
  act: (shell: Shell) => Promise<void>;
}

const CARD_WITH_FILES: CardEntry[] = [
  { name: "Recordings", kind: "folder", seconds: 0, tracks: 0, stamp: "", dir: "/" },
  { name: "take.wav", kind: "take", seconds: 10, tracks: 2, stamp: "", dir: "/" },
];

const okDialog = async (shell: Shell): Promise<void> => tap(shell, ".dialog-actions .btn", "OK");

const typeTitle = async (shell: Shell, text: string): Promise<void> => {
  await shell.ctx.store.set("ui.titleEntry.text", text);
  await flush();
};

const playing = async (shell: Shell): Promise<void> => {
  startPlayback(shell.ctx.store, 0, 1_000);
  await flush();
};

const SCREEN_OPERATIONS: ScreenOperation[] = [
  {
    name: "a key of Pitch Fix",
    main: "ch.ch1.insFx.note0",
    prep: async (shell) => {
      takeInsert(shell.ctx, strip(shell.ctx, "ch1"), "Pitch Fix");
      await open(shell, "ch.insfx");
      await tap(shell, "button.ssmcs-page-next");
    },
    act: async (shell) => tap(shell, "button.pitch-key", "C"),
  },
  {
    name: "Pitch Fix's scale",
    main: "ch.ch1.insFx.scale",
    prep: async (shell) => {
      takeInsert(shell.ctx, strip(shell.ctx, "ch1"), "Pitch Fix");
      await open(shell, "ch.insfx");
      await tap(shell, "button.ssmcs-page-next");
      await tap(shell, ".pitch-notes .pulldown", "Chromatic");
    },
    act: async (shell) => tap(shell, "button.source-btn", "Major"),
  },
  {
    name: "1-knob EQ's curve",
    main: "ch.ch1.eq.oneKnob.type",
    prep: async (shell) => {
      await shell.ctx.store.set("ch.ch1.eq.oneKnob.on", true);
      await shell.ctx.store.set("ch.ch1.eq.oneKnob.level", 50);
      await open(shell, "ch.eq");
      await tap(shell, ".pulldown", "Intensity");
    },
    act: async (shell) => tap(shell, ".dropdown-option", "Vocal"),
  },
  {
    name: "SCENE's bank",
    main: "scene.bank",
    prep: async (shell) => open(shell, "scene.list"),
    act: async (shell) => tap(shell, "button.scene-bank", "Simple"),
  },
  {
    name: "storing a scene",
    main: "scene.Standard.3.state",
    act: async (shell) => storeScene(shell.ctx, "Standard", 3),
  },
  {
    name: "naming a scene number that holds nothing",
    main: "scene.Standard.4.title",
    prep: async (shell) => {
      await shell.ctx.store.set("scene.selected", 4);
      await open(shell, "scene.list");
      await tap(shell, "button.btn", "Store");
      await typeTitle(shell, "Fresh");
    },
    act: async (shell) => tap(shell, ".pick-dialog-ok"),
  },
  { name: "recording", main: "sd.rec", act: async (shell) => recordTake(shell.ctx.store, 1_000) },
  {
    name: "pausing a take",
    main: "sd.rec",
    prep: async (shell) => recordTake(shell.ctx.store, 1_000),
    act: async (shell) => pauseTake(shell.ctx.store, 4_000),
  },
  {
    name: "stopping a take",
    main: "sd.rec",
    prep: async (shell) => recordTake(shell.ctx.store, 1_000),
    act: async (shell) => stopTake(shell.ctx.store, 4_000),
  },
  { name: "pausing playback", main: "sd.playing", prep: playing, act: async (shell) => pausePlayback(shell.ctx.store, 4_000) },
  { name: "stopping playback", main: "sd.playing", prep: playing, act: async (shell) => stopPlayback(shell.ctx.store) },
  {
    name: "ejecting the card",
    main: "sd.mounted",
    prep: async (shell) => {
      await shell.ctx.store.set("sd.tested", true);
      await open(shell, "microsd");
      await tap(shell, "button.sd-eject");
      await okDialog(shell);
    },
    act: okDialog,
  },
  {
    name: "deleting a file",
    main: "sd.card",
    card: CARD_WITH_FILES,
    prep: async (shell) => {
      await shell.ctx.store.set("ui.sdSaveTab", "Edit");
      await shell.ctx.store.set("sd.selectedFile", 1);
      await open(shell, "microsd.saveload");
      await tap(shell, '.sd-actions [aria-label="Delete"]');
    },
    act: okDialog,
  },
  {
    name: "renaming a file",
    main: "sd.card",
    card: CARD_WITH_FILES,
    prep: async (shell) => {
      await shell.ctx.store.set("ui.sdSaveTab", "Edit");
      await shell.ctx.store.set("sd.selectedFile", 1);
      await open(shell, "microsd.saveload");
      await shell.ctx.store.set(filePath({ dir: "/", name: "take.wav" }), "the take");
      await tap(shell, '.sd-actions [aria-label="Rename"]');
      await typeTitle(shell, "keeper");
    },
    act: async (shell) => tap(shell, ".pick-dialog-ok"),
  },
  {
    name: "making a folder",
    main: "sd.card",
    card: CARD_WITH_FILES,
    prep: async (shell) => {
      await shell.ctx.store.set("ui.sdSaveTab", "Edit");
      await shell.ctx.store.set("sd.selectedFile", 1);
      await open(shell, "microsd.saveload");
      await tap(shell, '.sd-actions [aria-label="New folder"]');
      await typeTitle(shell, "a");
    },
    act: async (shell) => tap(shell, ".pick-dialog-ok"),
  },
  {
    name: "opening a folder",
    main: "sd.path",
    card: CARD_WITH_FILES,
    prep: async (shell) => {
      await shell.ctx.store.set("sd.selectedFile", 0);
      await open(shell, "microsd.saveload");
    },
    act: async (shell) => {
      shell.root.querySelector<HTMLElement>(".list-body .list-row")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await flush();
    },
  },
  {
    name: "saving the settings",
    main: "sd.card",
    card: CARD_WITH_FILES,
    prep: async (shell) => {
      await open(shell, "microsd.saveload");
      await tap(shell, ".sd-actions .btn", "Save as");
      await typeTitle(shell, "mine");
    },
    act: async (shell) => tap(shell, ".pick-dialog-ok"),
  },
  {
    name: "formatting the card",
    main: "sd.card",
    card: CARD_WITH_FILES,
    prep: async (shell) => {
      await open(shell, "microsd.tools");
      await tap(shell, ".tools-screen .btn");
      await typeTitle(shell, "blank");
      await tap(shell, ".pick-dialog-ok");
    },
    act: async (shell) => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
      try {
        [...shell.root.querySelectorAll<HTMLElement>(".dialog-actions .btn")].find((b) => b.textContent === "OK")?.click();
        for (let i = 0; i < 5; i++) await Promise.resolve();
        vi.advanceTimersByTime(60_000);
      } finally {
        vi.useRealTimers();
      }
      await flush();
    },
  },
];

/** The operation on `transport`: what reaches it once the touch is made, and what the store holds before and after. */
async function onTransport(op: ScreenOperation, transport: SimTransport) {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(transport);
  const shell = new Shell(buildRegistry(), store, model);
  document.body.replaceChildren(shell.root);
  if (op.card) await writeCard(store, op.card);
  await flush();
  await op.prep?.(shell);
  if (transport instanceof OnePathShut) transport.shut();
  const sent: ParamPath[] = [];
  const write = transport.write.bind(transport);
  transport.write = (p, v) => {
    sent.push(p);
    return write(p, v);
  };
  const failures: WriteFailure[] = [];
  store.onWriteFailure((f) => failures.push(f));
  const snapshot = (): Map<ParamPath, ParamValue | null> => new Map(store.paths().map((p) => [p, store.get(p, null as never)]));
  const before = snapshot();
  await op.act(shell);
  await flush();
  const after = snapshot();
  shell.destroy();
  return { sent, failures, before, after };
}

describe("an operation made on a screen that sets one value and the values that follow from it", () => {
  for (const op of SCREEN_OPERATIONS) {
    it(`sends none of them when the unit cannot take one: ${op.name}`, async () => {
      const model = unitById("URX44V");
      const free = await onTransport(op, new SimTransport(factoryState(model)));
      const own = [...new Set(free.sent)].filter((p) => !p.startsWith("ui."));
      expect(own, "on the simulator it writes the value and others with it").toContain(op.main);
      expect(own.length, "on the simulator it writes more than one value").toBeGreaterThan(1);

      const shut = await onTransport(op, new OnePathShut(factoryState(model), op.main));
      // The shut path's own write goes to the unit only to be refused.
      expect(
        shut.sent.filter((p) => own.includes(p) && p !== op.main),
        "with one of its paths shut, none of the others reaches the unit",
      ).toEqual([]);
      expect(
        own.map((p) => shut.after.get(p)),
        "and each stays where the unit holds it",
      ).toEqual(own.map((p) => shut.before.get(p)));
      expect(shut.failures.map((f) => f.path), "and the refusal is reported").toEqual([op.main]);
    });
  }
});
