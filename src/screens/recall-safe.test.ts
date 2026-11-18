import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { recallScene, storeScene } from "./scene";
import { digitalGainPath } from "../model/source-gain";

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

async function mount(id: "URX44V" | "URX44" | "URX22" = "URX44V", tab?: "Input" | "Output" | "Others"): Promise<Shell> {
  const model = unitById(id);
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  if (tab) await store.set("ui.recallSafeTab", tab);
  const shell = new Shell(buildRegistry(), store, model, [{ id: "scene" }, { id: "scene.safe" }]);
  await flush();
  return shell;
}

const name = (n: Element): string => n.getAttribute("aria-label") ?? n.textContent ?? "";
const button = (shell: Shell, label: string): HTMLElement => {
  const found = [...shell.root.querySelectorAll<HTMLElement>(".main button")].find((b) => name(b) === label);
  if (!found) throw new Error(`no button "${label}"`);
  return found;
};
const tap = async (shell: Shell, label: string): Promise<void> => {
  button(shell, label).click();
  await flush();
};
/** A button's face: its words and whether it is lit, and on a row whose Safe is on. */
const face = (shell: Shell, label: string): string => {
  const b = button(shell, label);
  return `${b.textContent}|${b.classList.contains("is-on") ? "on" : b.classList.contains("is-some") ? "some" : "off"}${b.classList.contains("is-safe") ? "|safe" : ""}`;
};
/** The rows as the screen stands them: each row's name, the buttons that stay and its parameter cells. */
const rowsOf = (shell: Shell): { id: string; fixed: Element[]; cells: Element[] }[] => {
  const ids = [...shell.root.querySelectorAll(".safe-row-id")].map((n) => n.textContent ?? "");
  const fixed = [...shell.root.querySelectorAll(".safe-fixed-rows > .safe-fixed")];
  const cells = [...shell.root.querySelectorAll(".safe-rows .safe-cells")];
  return ids.map((id, i) => ({ id, fixed: [...(fixed[i]?.children ?? [])], cells: [...(cells[i]?.children ?? [])] }));
};
const mark = (c: Element): string => (c.classList.contains("is-none") ? "-" : c.classList.contains("is-on") ? "x" : "o");
/** Each row's name, and its cells left to right: a button `o`, `x` where it is lit, `-` where the cell is black. */
const grid = (shell: Shell): string[] => rowsOf(shell).map((r) => `${r.id} ${r.cells.map(mark).join("")}`);

describe("RECALL SAFE", () => {
  it("is opened from SCENE's menu, beside Scene List", async () => {
    const model = unitById("URX44V");
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(model)));
    const shell = new Shell(buildRegistry(), store, model, [{ id: "scene" }]);
    await flush();
    expect([...shell.root.querySelectorAll(".main .menu-btn")].map((b) => b.textContent)).toEqual(["Scene List", "Recall Safe"]);
    await tap(shell, "Recall Safe");
    expect(shell.ctx.nav.current.id).toBe("scene.safe");
    expect(shell.root.textContent).toContain("RECALL SAFE");
  });

  it("lists Input's rows and columns as the unit does, HA black until Source is selected", async () => {
    const shell = await mount();
    expect([...shell.root.querySelectorAll(".side .side-tab")].map((t) => t.textContent)).toEqual(["Input", "Output", "Others"]);
    expect([...shell.root.querySelectorAll(".safe-heading")].map((h) => h.textContent)).toEqual([
      "Safe",
      "All",
      "Name",
      "Source",
      "HA",
      "Process-\ning",
      "Rec\nPoint",
      "To MIX",
      "To FX",
      "CH ON",
      "CH\nLevel",
      "To\nST/Pan",
    ]);
    // Name Source HA Processing RecPoint ToMIX ToFX CHON CHLevel ToST
    expect(grid(shell)).toEqual([
      "CH 1 oo-ooooooo",
      "CH 2 oo-ooooooo",
      "CH 3 oo-ooooooo",
      "CH 4 oo-ooooooo",
      "CH 5/6 oo-ooooooo",
      "CH 7/8 oo-ooooooo",
      "CH 9/10 oo-ooooooo",
      "CH 11/12 oo-ooooooo",
      "FX 1 o----o-ooo",
      "FX 2 o----o-ooo",
    ]);
  });

  it("lists Output's rows and columns as the unit does", async () => {
    const shell = await mount("URX44V", "Output");
    expect([...shell.root.querySelectorAll(".safe-heading")].map((h) => h.textContent)).toEqual([
      "Safe",
      "Incoming\nSends",
      "All",
      "Name",
      "Source",
      "Process-\ning",
      "CH ON",
      "CH\nLevel",
      "To\nST/Bal",
    ]);
    // Incoming, then Name Source Processing CHON CHLevel ToST
    const rows = rowsOf(shell).map((r) => `${r.id} ${mark(r.fixed[1] as Element).replace("x", "o")}${r.cells.map(mark).join("")}`);
    expect(rows).toEqual(["MIX 1 oo-oooo", "MIX 2 oo-oooo", "ST -o-oooo", "STR -ooo---"]);
  });

  it("lays Others out in its three bands", async () => {
    const shell = await mount("URX44V", "Others");
    expect([...shell.root.querySelectorAll(".safe-band")].map((b) => b.textContent)).toEqual(["EFFECT", "BUS TYPE", "OTHERS"]);
    expect([...shell.root.querySelectorAll(".safe-others-row")].map((r) => [...r.querySelectorAll("button")].map((b) => b.textContent))).toEqual([
      ["FX 1", "FX 2", "INS FX\n(Input)", "INS FX\n(Output)"],
      ["MIX1", "MIX2"],
      ["Output\nPatch"],
    ]);
    await tap(shell, "EFFECT FX 1");
    expect(button(shell, "EFFECT FX 1").classList.contains("is-on")).toBe(true);
    expect(shell.ctx.store.bool("safe.others.fx1", false)).toBe(true);
  });

  it("selects Source by the input source's pair, opens HA with it, and drops HA's selection with it", async () => {
    const shell = await mount();
    await tap(shell, "C H 1 Source");
    expect(grid(shell).slice(0, 4)).toEqual(["CH 1 oxoooooooo", "CH 2 oxoooooooo", "CH 3 oo-ooooooo", "CH 4 oo-ooooooo"]);
    await tap(shell, "C H 1 HA");
    expect(grid(shell).slice(0, 2)).toEqual(["CH 1 oxxooooooo", "CH 2 oxoooooooo"]);
    expect(face(shell, "HA on every input channel")).toBe("...|on");
    // Clearing Source shuts HA again and forgets it was selected.
    await tap(shell, "C H 2 Source");
    expect(grid(shell).slice(0, 2)).toEqual(["CH 1 oo-ooooooo", "CH 2 oo-ooooooo"]);
    await tap(shell, "C H 1 Source");
    expect(grid(shell).slice(0, 2)).toEqual(["CH 1 oxoooooooo", "CH 2 oxoooooooo"]);
  });

  it("steps a row's All from some to all and from all to none, its pair's Source going with it", async () => {
    const shell = await mount();
    await tap(shell, "C H 1 Name");
    expect(face(shell, "Every parameter of C H 1")).toBe("...|on");
    expect(face(shell, "Name on every input channel")).toBe("...|on");
    expect(face(shell, "Every parameter of every input channel")).toBe("...|on");
    await tap(shell, "Every parameter of C H 1");
    expect(grid(shell).slice(0, 2)).toEqual(["CH 1 xxxxxxxxxx", "CH 2 oxoooooooo"]);
    expect(face(shell, "Every parameter of C H 1")).toBe("All|on");
    expect(face(shell, "Every parameter of C H 2")).toBe("...|on");
    await tap(shell, "Every parameter of C H 1");
    expect(grid(shell).slice(0, 2)).toEqual(["CH 1 oo-ooooooo", "CH 2 oo-ooooooo"]);
    expect(face(shell, "Every parameter of C H 1")).toBe("All|off");
    expect(face(shell, "Every parameter of every input channel")).toBe("All|off");
  });

  it("selects a column on every row from its heading, and clears it once all are", async () => {
    const shell = await mount();
    await tap(shell, "Name on every input channel");
    expect(grid(shell).every((r) => r.split(" ").pop()?.startsWith("x"))).toBe(true);
    expect(face(shell, "Name on every input channel")).toBe("All|on");
    await tap(shell, "Name on every input channel");
    expect(face(shell, "Name on every input channel")).toBe("All|off");
  });

  it("turns Safe on a row and on the whole tab, the tab's own rows alone", async () => {
    const shell = await mount();
    await tap(shell, "C H 1 Safe");
    expect(face(shell, "C H 1 Safe")).toBe("ON|on");
    expect(face(shell, "Safe on every input channel")).toBe("...|some");
    // A row whose Safe is on draws its buttons on the paler face, and the headings with it.
    expect(face(shell, "C H 1 Name")).toBe("|off|safe");
    expect(face(shell, "C H 2 Name")).toBe("|off");
    expect(face(shell, "Name on every input channel")).toBe("All|off|safe");
    await tap(shell, "C H 1 Name");
    expect(face(shell, "C H 1 Name")).toBe("|on|safe");
    await tap(shell, "Safe on every input channel");
    expect(face(shell, "Safe on every input channel")).toBe("ALL|on");
    expect(shell.ctx.model.outputs.some((s) => shell.ctx.store.bool(`safe.${s.id}.on`, false))).toBe(false);
    await tap(shell, "Safe on every input channel");
    expect(face(shell, "Safe on every input channel")).toBe("ALL|off");
  });

  it("selects Incoming Sends on a MIX bus and on both from the heading", async () => {
    const shell = await mount("URX44V", "Output");
    await tap(shell, "MIX 1 Incoming Sends");
    expect(face(shell, "Incoming Sends of every MIX bus")).toBe("...|on");
    await tap(shell, "Incoming Sends of every MIX bus");
    expect(face(shell, "Incoming Sends of every MIX bus")).toBe("All|on");
    expect(face(shell, "MIX 2 Incoming Sends")).toBe("|on");
  });

  it("scrolls the columns a column at a time and keeps the place across a redraw", async () => {
    const shell = await mount("URX44V", "Output");
    const track = (): string => shell.root.querySelector<HTMLElement>(".safe-rows .safe-track")?.style.transform ?? "";
    expect(track()).toBe("translateX(0px)");
    const host = shell.root.querySelector<HTMLElement>(".safe-rows .safe-window") as HTMLElement;
    host.dispatchEvent(new WheelEvent("wheel", { deltaX: 30, cancelable: true }));
    expect(track()).toBe("translateX(-46px)");
    await tap(shell, "MIX 1 Safe");
    expect(track()).toBe("translateX(-46px)");
    // Output's six columns show four at a time, so two steps reach the end.
    for (let i = 0; i < 4; i++) shell.root.querySelector<HTMLElement>(".safe-rows .safe-window")?.dispatchEvent(new WheelEvent("wheel", { deltaX: 30, cancelable: true }));
    expect(track()).toBe("translateX(-92px)");
  });

  it("frames the row whose name was tapped, one row at a time and for good, and selects nothing else with it", async () => {
    const shell = await mount();
    const framed = (): string[] => [...shell.root.querySelectorAll(".safe-row-name.is-selected")].map((n) => name(n));
    expect(framed()).toEqual([]);
    const before = grid(shell);
    await tap(shell, "C H 2");
    expect(framed()).toEqual(["C H 2"]);
    expect(button(shell, "C H 2").getAttribute("aria-pressed")).toBe("true");
    await tap(shell, "C H 2");
    expect(framed(), "a tap on the framed row keeps it framed").toEqual(["C H 2"]);
    const sideTab = async (label: string): Promise<void> => {
      [...shell.root.querySelectorAll<HTMLElement>(".side .side-tab")].find((t) => t.textContent === label)!.click();
      await flush();
    };
    await sideTab("Output");
    expect(framed(), "Output frames none of its rows").toEqual([]);
    await sideTab("Input");
    expect(framed(), "back on Input, the row is framed still").toEqual(["C H 2"]);
    await sideTab("Output");
    await tap(shell, "MIX 1");
    expect(framed()).toEqual(["MIX 1"]);
    await sideTab("Input");
    expect(framed(), "one row is framed across the tabs").toEqual([]);
    await sideTab("Output");
    expect(framed()).toEqual(["MIX 1"]);
    await sideTab("Input");
    await tap(shell, "C H 3");
    expect(framed()).toEqual(["C H 3"]);
    expect(grid(shell)).toEqual(before);
    expect(face(shell, "C H 3 Safe")).toBe("ON|off");
  });

  it("carries no USER DEFINED KNOBS toggle on its side rail", async () => {
    const shell = await mount();
    expect(shell.root.querySelector(".side .knob-toggle, .knob-toggle")).toBeNull();
  });
});

describe("what a recall keeps", () => {
  async function stored(): Promise<Shell> {
    const shell = await mount();
    await shell.ctx.store.set("scene.Standard.13.title", "RS TEST");
    await storeScene(shell.ctx, "Standard", 13);
    return shell;
  }
  const set = (shell: Shell, path: string, value: number | string | boolean): Promise<void> => shell.ctx.store.set(path, value);

  it("keeps a parameter only where the row's Safe is on and the parameter is selected", async () => {
    const shell = await stored();
    // CH 1: Safe and CH ON; CH 2: Safe alone; CH 3: CH ON alone.
    await set(shell, "safe.ch1.on", true);
    await set(shell, "safe.ch1.chOn", true);
    await set(shell, "safe.ch2.on", true);
    await set(shell, "safe.ch3.chOn", true);
    for (const ch of ["ch1", "ch2", "ch3"]) await set(shell, `ch.${ch}.on`, false);
    await set(shell, "ch.ch1.level", -6);
    await recallScene(shell.ctx, 13);
    expect(["ch1", "ch2", "ch3"].map((ch) => shell.ctx.store.bool(`ch.${ch}.on`, true))).toEqual([false, true, true]);
    // CH 1's level is not selected, so it comes back.
    expect(shell.ctx.store.num("ch.ch1.level", 0)).not.toBe(-6);
  });

  it("keeps the sends into a MIX bus whose Safe and Incoming Sends are on, and those alone", async () => {
    const shell = await stored();
    const before = [shell.ctx.store.num("ch.ch1.send.bus.mix1.level", 0), shell.ctx.store.num("ch.ch1.send.bus.mix2.level", 0)];
    await set(shell, "safe.bus.mix1.incoming", true);
    await set(shell, "safe.bus.mix2.on", true);
    await set(shell, "safe.bus.mix2.incoming", true);
    await set(shell, "ch.ch1.send.bus.mix1.level", 0.4);
    await set(shell, "ch.ch1.send.bus.mix2.level", -36);
    await recallScene(shell.ctx, 13);
    expect(shell.ctx.store.num("ch.ch1.send.bus.mix1.level", 0)).toBe(before[0]);
    expect(shell.ctx.store.num("ch.ch1.send.bus.mix2.level", 0)).toBe(-36);
  });

  it("keeps a kept HA's D.Gain, which the channel's input source carries", async () => {
    const shell = await stored();
    const gain = digitalGainPath(shell.ctx.store.str("ch.ch1.source", ""));
    await set(shell, "safe.ch1.on", true);
    await set(shell, "safe.ch1.source", true);
    await set(shell, "safe.ch1.ha", true);
    await set(shell, gain, 6);
    await set(shell, "ch.ch1.phantom", true);
    await recallScene(shell.ctx, 13);
    expect(shell.ctx.store.num(gain, 0)).toBe(6);
    expect(shell.ctx.store.bool("ch.ch1.phantom", false)).toBe(true);
  });

  it("keeps nothing in Simple Mode, where SCENE's [Recall Safe] is out of reach", async () => {
    const shell = await stored();
    await set(shell, "safe.ch1.on", true);
    await set(shell, "safe.ch1.chOn", true);
    await set(shell, "ch.ch1.on", false);
    await set(shell, "setup.operationMode", "Simple");
    await recallScene(shell.ctx, 13);
    expect(shell.ctx.store.bool("ch.ch1.on", false)).toBe(true);
    shell.ctx.nav.home();
    shell.ctx.nav.push({ id: "scene" });
    await flush();
    const entry = [...shell.root.querySelectorAll<HTMLElement>(".main .menu-btn")].find((b) => b.textContent === "Recall Safe");
    expect(entry?.getAttribute("aria-disabled")).toBe("true");
    entry?.click();
    await flush();
    expect(shell.ctx.nav.current.id).toBe("scene");
  });

  it("keeps what a lit Others button names: the output patch, a bus's type and an effect", async () => {
    const shell = await stored();
    const patch = shell.ctx.store.str("setup.outputPatch.mainOut", "");
    await set(shell, "safe.others.outputPatch", true);
    await set(shell, "safe.others.busTypeMix1", true);
    await set(shell, "safe.others.fx1", true);
    await set(shell, "setup.outputPatch.mainOut", patch === "MIX 1" ? "MIX 2" : "MIX 1");
    await set(shell, "ch.bus.mix1.busType", "FIXED");
    await set(shell, "ch.fx1.effect.revTime", 5);
    await set(shell, "ch.bus.mix2.busType", "FIXED");
    await recallScene(shell.ctx, 13);
    expect(shell.ctx.store.str("setup.outputPatch.mainOut", "")).toBe(patch === "MIX 1" ? "MIX 2" : "MIX 1");
    expect(shell.ctx.store.str("ch.bus.mix1.busType", "")).toBe("FIXED");
    expect(shell.ctx.store.num("ch.fx1.effect.revTime", 0)).toBe(5);
    expect(shell.ctx.store.str("ch.bus.mix2.busType", "")).not.toBe("FIXED");
  });
});
