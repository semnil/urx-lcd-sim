import { describe, expect, it } from "vitest";
import type { Route } from "../app/navigator";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { allStrips, findStrip } from "../model/types";
import { unitById } from "../model/units";
import { applySettings, captureSettings } from "../model/settings-file";
import { CUE_MODE, cueGroup, setCueMode, toggleCue } from "./cue";
import { buildRegistry } from "./index";
import { recallScene, storeScene } from "./scene";
import { setSignalType } from "./stereo-link";

// The unit's CUE runs in two groups, the inputs and the outputs. Within a group
// cues add up; cueing a strip of the other group takes the previous group out;
// taking a cue out leaves every other cue alone.

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function mount(start: Route[] = []): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model, start);
  await flush();
  return shell;
}

/** Every strip in the cue, in device order. */
const cued = (shell: Shell): string[] => allStrips(shell.ctx.model).filter((s) => shell.ctx.store.bool(`ch.${s.id}.cue`, false)).map((s) => s.id);

async function press(shell: Shell, id: string): Promise<void> {
  const strip = findStrip(shell.ctx.model, id);
  if (!strip) throw new Error(`no strip ${id}`);
  toggleCue(shell.ctx, strip);
  await flush();
}

describe("the CUE groups", () => {
  it("puts the inputs, mono and stereo channels and FX, in one group and the outputs in the other", () => {
    const model = unitById("URX44V");
    const byGroup = (side: string): string[] => allStrips(model).filter((s) => cueGroup(s) === side).map((s) => s.id);
    expect(byGroup("input")).toEqual(model.inputs.map((s) => s.id));
    expect(byGroup("output")).toEqual(model.outputs.map((s) => s.id));
  });

  it.each([
    ["inputs", ["fx1", "ch1", "ch_7_8"]],
    ["outputs", ["bus.stereo", "bus.mix1", "bus.stream"]],
  ])("adds up cues within the %s", async (_group, ids) => {
    const shell = await mount();
    for (const id of ids) await press(shell, id);
    expect(cued(shell)).toEqual(allStrips(shell.ctx.model).map((s) => s.id).filter((id) => ids.includes(id)));
  });

  it.each([
    ["the outputs", ["fx1", "ch1", "ch_7_8"], "bus.stereo"],
    ["the inputs", ["bus.stereo", "bus.mix1", "bus.stream"], "ch2"],
  ])("takes every cue of the previous group out when one of %s is cued", async (_group, before, next) => {
    const shell = await mount();
    for (const id of before) await press(shell, id);
    await press(shell, next);
    expect(cued(shell)).toEqual([next]);
  });

  it("takes a cue out and leaves every other cue, in its own group and in the other, as it stands", async () => {
    const shell = await mount();
    // Both groups in the cue at once, as values put back can leave them.
    for (const id of ["ch1", "fx1", "bus.mix1", "bus.stereo"]) await shell.ctx.store.restore(`ch.${id}.cue`, true);
    await press(shell, "ch1");
    expect(cued(shell)).toEqual(["fx1", "bus.mix1", "bus.stereo"]);
    await press(shell, "bus.stereo");
    expect(cued(shell)).toEqual(["fx1", "bus.mix1"]);
  });

  it("cues and takes out a linked pair whole, by either channel and by the other group", async () => {
    const shell = await mount();
    const ch1 = findStrip(shell.ctx.model, "ch1");
    if (!ch1) throw new Error("no CH 1");
    setSignalType(shell.ctx, ch1, "STEREO");
    await flush();

    await press(shell, "fx1");
    await press(shell, "ch2");
    expect(cued(shell), "the pair joins FX1 in the cue").toEqual(["ch1", "ch2", "fx1"]);
    await press(shell, "bus.stereo");
    expect(cued(shell), "and leaves it with FX1 when STEREO is cued").toEqual(["bus.stereo"]);
    await press(shell, "ch1");
    expect(cued(shell), "the lower channel brings both back and takes STEREO out").toEqual(["ch1", "ch2"]);
    await press(shell, "ch2");
    expect(cued(shell), "and either takes both out, which brings STEREO back").toEqual(["bus.stereo"]);
  });
});

describe("the outputs an input cue takes out", () => {
  it("come back, every one of them, once the input cues are all taken out", async () => {
    const shell = await mount();
    for (const id of ["bus.stereo", "bus.mix1", "bus.stream"]) await press(shell, id);
    await press(shell, "ch1");
    expect(cued(shell)).toEqual(["ch1"]);
    await press(shell, "ch1");
    expect(cued(shell)).toEqual(["bus.mix1", "bus.stereo", "bus.stream"]);
    await press(shell, "bus.stereo");
    expect(cued(shell), "and each goes out again on its own [CUE]").toEqual(["bus.mix1", "bus.stream"]);
  });

  it("come back on the last input cue taken out, not on an earlier one", async () => {
    const shell = await mount();
    await press(shell, "bus.stereo");
    await press(shell, "ch1");
    await press(shell, "ch2");
    await press(shell, "ch1");
    expect(cued(shell), "CH 2 still in the cue").toEqual(["ch2"]);
    await press(shell, "ch2");
    expect(cued(shell)).toEqual(["bus.stereo"]);
  });

  /**
   * Keep a scene and a settings file holding CH 1 alone in the cue, and return
   * what puts it back by `route`: values put back cue an input without its [CUE].
   */
  async function inputCueKept(shell: Shell, route: "a scene" | "a settings file"): Promise<() => Promise<void>> {
    await press(shell, "ch1");
    await shell.ctx.store.set("scene.Standard.1.title", "CH 1 cued");
    await storeScene(shell.ctx, "Standard", 1);
    const settings = captureSettings(shell.ctx.store);
    await press(shell, "ch1");
    return async () => {
      if (route === "a scene") await recallScene(shell.ctx, 1);
      else await applySettings(shell.ctx.store, settings);
      await flush();
      expect(cued(shell), `${route} puts CH 1 back in the cue`).toEqual(["ch1"]);
    };
  }

  it.each(["a scene", "a settings file"] as const)("are forgotten once an output is cued, also for an input cue %s puts back", async (route) => {
    const shell = await mount();
    const putBack = await inputCueKept(shell, route);
    await press(shell, "bus.stereo");
    await press(shell, "ch1");
    await press(shell, "bus.mix1");
    expect(cued(shell)).toEqual(["bus.mix1"]);
    await press(shell, "bus.mix1");
    expect(cued(shell)).toEqual([]);
    await putBack();
    await press(shell, "ch1");
    expect(cued(shell), "STEREO stays out").toEqual([]);
  });

  it.each(["a scene", "a settings file"] as const)("are forgotten once they come back, also for an input cue %s puts back", async (route) => {
    const shell = await mount();
    const putBack = await inputCueKept(shell, route);
    await press(shell, "bus.stereo");
    await press(shell, "ch1");
    await press(shell, "ch1");
    expect(cued(shell)).toEqual(["bus.stereo"]);
    await press(shell, "bus.stereo");
    await putBack();
    await press(shell, "ch1");
    expect(cued(shell), "STEREO stays out").toEqual([]);
  });

  it("are forgotten by CLEAR CUE, so taking out an input cue put back afterwards brings nothing back", async () => {
    const shell = await mount();
    await press(shell, "bus.stereo");
    await press(shell, "ch1");
    shell.root.querySelector<HTMLElement>(".cue-clear")?.click();
    await flush();
    expect(cued(shell), "the bin leaves nothing in the cue").toEqual([]);
    // Values put back, as a scene or a settings file does, can cue an input without its [CUE].
    await shell.ctx.store.restore("ch.ch1.cue", true);
    await press(shell, "ch1");
    expect(cued(shell)).toEqual([]);
  });

  it("come back on an input cue taken out, not on an output cue a scene puts back", async () => {
    const shell = await mount();
    await press(shell, "bus.mix1");
    await shell.ctx.store.set("scene.Standard.1.title", "MIX 1 cued");
    await storeScene(shell.ctx, "Standard", 1);
    await press(shell, "bus.mix1");
    await press(shell, "bus.stereo");
    await press(shell, "ch1");
    await recallScene(shell.ctx, 1);
    await flush();
    expect(cued(shell), "the scene puts MIX 1 alone back in the cue").toEqual(["bus.mix1"]);
    await press(shell, "bus.mix1");
    expect(cued(shell), "STEREO stays out").toEqual([]);
  });

  it("have no counterpart: the inputs an output cue takes out stay out", async () => {
    const shell = await mount();
    for (const id of ["ch1", "fx1"]) await press(shell, id);
    await press(shell, "bus.stereo");
    expect(cued(shell)).toEqual(["bus.stereo"]);
    await press(shell, "bus.stereo");
    expect(cued(shell)).toEqual([]);
  });
});

describe("[CUE] on the screens", () => {
  it("on HOME takes the outputs out when an input is cued", async () => {
    const shell = await mount();
    await shell.ctx.store.set("ch.bus.stereo.cue", true);
    await shell.ctx.store.set("ch.bus.mix2.cue", true);
    await flush();
    const button = shell.root.querySelector<HTMLElement>('[data-lamp-source="ch1@input"]')?.closest(".strip")?.querySelector<HTMLElement>(".btn-cue");
    if (!button) throw new Error("no [CUE] on CH 1");
    button.click();
    await flush();
    expect(cued(shell)).toEqual(["ch1"]);
  });

  it("on a channel's screen takes the inputs out when an output is cued", async () => {
    const shell = await mount([{ id: "channel-view", strip: "bus.stereo" }]);
    await shell.ctx.store.set("ch.ch1.cue", true);
    await shell.ctx.store.set("ch.fx2.cue", true);
    await flush();
    const button = shell.root.querySelector<HTMLElement>(".cv-onoff .btn-cue");
    if (!button) throw new Error("no [CUE] on STEREO's screen");
    button.click();
    await flush();
    expect(cued(shell)).toEqual(["bus.stereo"]);
  });
});

describe("Last CUE", () => {
  async function lastCue(): Promise<Shell> {
    const shell = await mount();
    setCueMode(shell.ctx, "Last CUE");
    await flush();
    return shell;
  }

  it.each([
    ["inputs", ["fx1", "ch1", "ch_7_8"]],
    ["outputs", ["bus.stereo", "bus.mix1", "bus.stream"]],
  ])("keeps the last of the %s put in the cue and takes the others of its group out", async (_group, ids) => {
    const shell = await lastCue();
    for (const id of ids) await press(shell, id);
    expect(cued(shell)).toEqual([ids[ids.length - 1]]);
  });

  it("still takes the other group out, and puts back the output the input cues took out once the last is taken out", async () => {
    const shell = await lastCue();
    await press(shell, "bus.mix1");
    await press(shell, "ch1");
    expect(cued(shell), "CH 1 takes MIX 1 out").toEqual(["ch1"]);
    await press(shell, "ch2");
    expect(cued(shell), "CH 2 takes CH 1's place").toEqual(["ch2"]);
    await press(shell, "ch2");
    expect(cued(shell), "and taking it out brings MIX 1 back").toEqual(["bus.mix1"]);
  });

  it("takes an input out for a linked pair and keeps both channels of the pair", async () => {
    const shell = await lastCue();
    const ch1 = findStrip(shell.ctx.model, "ch1");
    if (!ch1) throw new Error("no CH 1");
    setSignalType(shell.ctx, ch1, "STEREO");
    await flush();
    await press(shell, "fx1");
    await press(shell, "ch2");
    expect(cued(shell)).toEqual(["ch1", "ch2"]);
    await press(shell, "ch_7_8");
    expect(cued(shell)).toEqual(["ch_7_8"]);
  });

  it("is left by switching back to Mix CUE, after which the cues of a group add up again", async () => {
    const shell = await lastCue();
    setCueMode(shell.ctx, "Mix CUE");
    await flush();
    for (const id of ["ch1", "ch2"]) await press(shell, id);
    expect(cued(shell)).toEqual(["ch1", "ch2"]);
  });
});

describe("switching the CUE Mode", () => {
  it.each(["Last CUE", "Mix CUE"] as const)("to %s takes every cue out as one operation", async (mode) => {
    const shell = await mount();
    if (mode === "Mix CUE") {
      setCueMode(shell.ctx, "Last CUE");
      await flush();
    }
    // Both groups in the cue at once, as values put back can leave them.
    for (const id of ["ch1", "bus.mix1"]) await shell.ctx.store.restore(`ch.${id}.cue`, true);
    const writes = shell.ctx.store.writesOf(() => setCueMode(shell.ctx, mode));
    expect(writes.sort()).toEqual([CUE_MODE, "ch.bus.mix1.cue", "ch.ch1.cue", "ui.cueOutputMemory"].sort());
    setCueMode(shell.ctx, mode);
    await flush();
    expect(shell.ctx.store.str(CUE_MODE, "")).toBe(mode);
    expect(cued(shell)).toEqual([]);
  });

  it("forgets the outputs the input cues took out", async () => {
    const shell = await mount();
    await press(shell, "bus.stereo");
    await press(shell, "ch1");
    setCueMode(shell.ctx, "Last CUE");
    await flush();
    // Values put back, as a scene or a settings file does, can cue an input without its [CUE].
    await shell.ctx.store.restore("ch.ch1.cue", true);
    await press(shell, "ch1");
    expect(cued(shell), "STEREO stays out").toEqual([]);
  });

  it("to the mode the unit stands in writes nothing and leaves the cues", async () => {
    const shell = await mount();
    await press(shell, "ch1");
    expect(shell.ctx.store.writesOf(() => setCueMode(shell.ctx, "Mix CUE"))).toEqual([]);
    setCueMode(shell.ctx, "Mix CUE");
    await flush();
    expect(cued(shell)).toEqual(["ch1"]);
  });
});

describe("the MONITOR CUE tab", () => {
  async function cueTab(): Promise<Shell> {
    const shell = await mount([{ id: "monitor" }, { id: "monitor.level" }]);
    await shell.ctx.store.set("ui.monitorTab", "CUE");
    await flush();
    return shell;
  }
  const lamps = (shell: Shell): boolean[] => [...shell.root.querySelectorAll(".active-cue-row")].map((r) => r.classList.contains("is-cued"));
  const lit = (shell: Shell): string[] =>
    [...shell.root.querySelectorAll<HTMLElement>(".cue-mode-btn")].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent ?? "");

  it("puts the CUE tab under Level and Setting, its name alone on it", async () => {
    const shell = await cueTab();
    const tabs = [...shell.root.querySelectorAll<HTMLElement>(".side-tab")];
    expect(tabs.map((t) => t.textContent)).toEqual(["Level", "Setting", "CUE"]);
    expect(tabs[2]?.getAttribute("aria-pressed")).toBe("true");
    expect(tabs[2]?.querySelector(".side-tab-icon svg"), "no glyph").toBeNull();
  });

  it("lights the Input and Output lamps by the group in the cue", async () => {
    const shell = await cueTab();
    expect(lamps(shell), "nothing cued").toEqual([false, false]);
    await press(shell, "ch1");
    expect(lamps(shell), "an input").toEqual([true, false]);
    await press(shell, "bus.stereo");
    expect(lamps(shell), "an output").toEqual([false, true]);
    // Both groups in the cue at once, as values put back can leave them.
    await shell.ctx.store.restore("ch.ch1.cue", true);
    await flush();
    expect(lamps(shell), "both").toEqual([true, true]);
  });

  it("lights [Clear CUE] while anything is in the cue and leaves it grey while nothing is", async () => {
    const shell = await cueTab();
    const clear = (): boolean => shell.root.querySelector(".active-cue-clear")?.classList.contains("is-cued") ?? true;
    expect(clear(), "nothing cued").toBe(false);
    await press(shell, "ch1");
    expect(clear(), "an input").toBe(true);
    await press(shell, "bus.stereo");
    expect(clear(), "an output").toBe(true);
    await press(shell, "bus.stereo");
    expect(clear(), "nothing again").toBe(false);
  });

  it("takes every cue out with [Clear CUE]", async () => {
    const shell = await cueTab();
    for (const id of ["ch1", "ch2"]) await press(shell, id);
    shell.root.querySelector<HTMLElement>(".active-cue-clear")?.click();
    await flush();
    expect(cued(shell)).toEqual([]);
    expect(lamps(shell)).toEqual([false, false]);
  });

  it("lights the CUE Mode the unit stands in and switches it, taking the cues out", async () => {
    const shell = await cueTab();
    expect(lit(shell), "as the unit ships").toEqual(["Mix CUE"]);
    await press(shell, "ch1");
    [...shell.root.querySelectorAll<HTMLElement>(".cue-mode-btn")].find((b) => b.textContent === "Last CUE")?.click();
    await flush();
    expect(lit(shell)).toEqual(["Last CUE"]);
    expect(shell.ctx.store.str(CUE_MODE, "")).toBe("Last CUE");
    expect(cued(shell)).toEqual([]);
  });
});
