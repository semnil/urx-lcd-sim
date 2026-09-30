import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { LEVEL_MIN_DB } from "../ui/param-spec";
import { buildRegistry } from "./index";
import { sendLocks } from "./mix-bus";
import { setPanBal, setSignalType } from "./stereo-link";

// BUS Type and Pan Link belong to a MIX bus and decide what the sends into it
// are given: a FIXED bus takes them at one level, and a bus on Pan Link places
// them by their source channel.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

interface Mounted {
  shell: Shell;
  store: DeviceStore;
}

async function mount(): Promise<Mounted> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  const shell = new Shell(buildRegistry(), store, model);
  await flush();
  return { shell, store };
}

async function open(shell: Shell, id: string, strip: string): Promise<void> {
  shell.ctx.nav.push({ id, strip });
  await flush();
}

const captions = (shell: Shell): string[] =>
  [...shell.root.querySelectorAll(".chs-caption")].map((c) => c.textContent ?? "");

/** Take the BUS Type pulldown to `value`. */
async function pickBusType(shell: Shell, value: string): Promise<void> {
  shell.root.querySelector<HTMLElement>(".chs-bustype-field .pulldown")?.click();
  await flush();
  [...shell.root.querySelectorAll<HTMLElement>(".dropdown-option")].find((o) => o.textContent === value)?.click();
  await flush();
}

describe("a MIX bus's BUS Type and Pan Link", () => {
  it("carries them on the MIX bus alone, on the rows the guide's figure has them", async () => {
    const { shell } = await mount();
    await open(shell, "ch.setting", "bus.mix1");
    expect(captions(shell)).toEqual(["Color", "Icon", "Name", "BUS Type"]);
    expect(shell.root.querySelector(".chs-bustype-field .pulldown")?.textContent).toContain("VARI");
    expect(shell.root.querySelector(".chs-panlink .btn")?.textContent).toBe("Pan Link");
    expect(shell.root.querySelector(".chs-panlink .btn")?.getAttribute("aria-pressed")).toBe("false");

    // The other buses carry the name and the colour and nothing else.
    for (const id of ["bus.stereo", "bus.stream"]) {
      await open(shell, "ch.setting", id);
      expect(captions(shell), id).toEqual(["Color", "Icon", "Name"]);
      expect(shell.root.querySelector(".chs-panlink"), id).toBeNull();
    }
    // Nor does a channel.
    await open(shell, "ch.setting", "ch1");
    expect(captions(shell)).not.toContain("BUS Type");
  });

  it("empties the bank into the bus when the type is taken, and does not fill it again", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.send.bus.mix1.level", -6);
    await store.set("ch.ch1.send.bus.mix1.pre", true);
    await store.set("ch.ch2.send.bus.mix1.on", false);
    await store.set("ch.fx1.send.bus.mix1.level", -10);
    await store.set("ch.ch1.send.bus.mix2.level", -8);
    await open(shell, "ch.setting", "bus.mix1");
    await pickBusType(shell, "FIXED");

    expect(store.num("ch.ch1.send.bus.mix1.level", 0), "every level into the bus").toBe(LEVEL_MIN_DB);
    expect(store.num("ch.fx1.send.bus.mix1.level", 0), "an FX return's too").toBe(LEVEL_MIN_DB);
    expect(store.bool("ch.ch1.send.bus.mix1.on", true), "and every switch").toBe(false);
    expect(store.bool("ch.ch2.send.bus.mix1.on", true)).toBe(false);
    expect(store.num("ch.ch1.send.bus.mix2.level", 0), "the other bus is untouched").toBe(-8);
    expect(store.bool("ch.ch1.send.bus.mix1.pre", false), "the tap is not reset").toBe(true);

    await store.set("ch.ch1.send.bus.mix1.level", -4);
    await pickBusType(shell, "VARI");
    expect(store.num("ch.ch1.send.bus.mix1.level", 0), "taking the type back empties it again").toBe(LEVEL_MIN_DB);
    // URX44V, 2026-09-29: [PRE] comes back lit, as it was before FIXED.
    expect(store.bool("ch.ch1.send.bus.mix1.pre", false), "and the tap is back as it was").toBe(true);
    // The switches go to what the type takes them to, not to what they held:
    // a send that was off before the round trip comes back on.
    expect(
      ["ch1", "ch2", "fx1"].map((id) => store.bool(`ch.${id}.send.bus.mix1.on`, false)),
      "VARI switches the bank on",
    ).toEqual([true, true, true]);

    await pickBusType(shell, "FIXED");
    expect(
      ["ch1", "ch2", "fx1"].map((id) => store.bool(`ch.${id}.send.bus.mix1.on`, true)),
      "and FIXED switches it off",
    ).toEqual([false, false, false]);
  });

  it("takes the tap, the placing and the level off a send into a fixed bus", async () => {
    const { shell, store } = await mount();
    await store.set("ch.bus.mix1.busType", "FIXED");
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.sendto", "ch1");

    const cell = (n: number): Element | undefined => [...shell.root.querySelectorAll(".sendto-cell")][n];
    expect(cell(0)?.querySelector(".btn-on"), "the switch stays").not.toBeNull();
    expect(cell(0)?.querySelector(".btn-pre"), "the tap goes").toBeNull();
    expect(cell(0)?.querySelector(".pan-slider")).toBeNull();
    expect(cell(0)?.querySelector(".sendto-bal")).toBeNull();
    expect(cell(0)?.querySelectorAll(".sendto-empty")).toHaveLength(3);
    // MIX 2 is still VARI, so its cell keeps all of them.
    expect(cell(1)?.querySelector(".btn-pre")).not.toBeNull();
    expect(cell(1)?.querySelector(".sendto-bal")).not.toBeNull();

    // The division over a fixed destination reads `Fixed` under the level, as bright
    // as the one beside it, and its knob turns nothing (URX44V, 2026-09-29).
    const knobCells = [...shell.root.querySelectorAll<HTMLElement>(".knob-cell")];
    const mix1 = knobCells[0];
    expect([mix1?.querySelector(".knob-cell-label")?.textContent, mix1?.querySelector(".knob-cell-value")?.textContent]).toEqual([
      "Level",
      "Fixed",
    ]);
    expect(mix1?.classList.contains("is-driven"), "not dimmed").toBe(false);
    expect(mix1?.getAttribute("role"), "not a control").toBeNull();
    const before = store.num("ch.ch1.send.bus.mix1.level", 0);
    mix1?.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await flush();
    expect(store.num("ch.ch1.send.bus.mix1.level", 0), "and a key moves nothing").toBe(before);
    expect(knobCells[1]?.querySelector(".knob-cell-value")?.textContent, "and the level for MIX 2").toBe("-∞");
  });

  it("reads HOME's level as Fixed and keeps it out of reach while the bus in view is fixed", async () => {
    const { shell, store } = await mount();
    await store.set("ui.sendsTarget", "MIX1");
    await store.set("ch.ch1.send.bus.mix1.level", -6);
    await flush();
    const level = (): HTMLElement | null | undefined =>
      shell.root.querySelector('[data-lamp-source="ch1@input"]')?.closest(".strip")?.querySelector<HTMLElement>(".strip-level");
    expect(level()?.querySelector(".strip-level-value")?.textContent).toBe("-6.00");
    expect(level()?.classList.contains("is-locked")).toBe(false);
    expect(level()?.tabIndex).toBe(0);

    // URX44V, 2026-09-29: the value reads `Fixed`, and the knob stays as bright
    // as the send's switch has it.
    await store.set("ch.bus.mix1.busType", "FIXED");
    await flush();
    expect(level()?.querySelector(".strip-level-value")?.textContent).toBe("Fixed");
    expect(level()?.getAttribute("aria-valuetext")).toBe("Fixed");
    expect(level()?.classList.contains("is-send-off"), "a send switched on is not dark").toBe(false);
    expect(level()?.classList.contains("is-locked")).toBe(true);
    expect(level()?.getAttribute("aria-disabled")).toBe("true");
    expect(level()?.tabIndex, "and takes no key").toBe(-1);

    await store.set("ch.ch1.send.bus.mix1.on", false);
    await flush();
    expect(level()?.classList.contains("is-send-off"), "a send switched off is").toBe(true);
    expect(level()?.querySelector(".strip-level-value")?.textContent).toBe("Fixed");
  });

  it("places a send from its source channel while the bus is on Pan Link, and leaves it there when Pan Link goes off", async () => {
    const { shell, store } = await mount();
    await store.set("ch.ch1.pan", -40);
    await store.set("ch.ch1.send.bus.mix1.balance", 21);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.sendto", "ch1");
    const bal = (): HTMLElement | null | undefined =>
      [...shell.root.querySelectorAll(".sendto-cell")][0]?.querySelector<HTMLElement>(".sendto-bal .value-box");
    expect(bal()?.textContent, "the send's own placing").toBe("R21");
    expect(bal()?.tabIndex).toBe(0);

    await store.set("ch.bus.mix1.panLink", true);
    await flush();
    expect(bal()?.textContent, "the source channel's PAN").toBe("L40");
    expect(bal()?.tabIndex, "and turns, as the unit's does").toBe(0);
    expect(store.num("ch.ch1.send.bus.mix1.balance", 0), "the send's own placing moves to its source's").toBe(-40);
    await store.set("ch.ch1.pan", -10);
    await flush();
    expect([bal()?.textContent, store.num("ch.ch1.send.bus.mix1.balance", 0)], "and follows it while Pan Link is on").toEqual(["L10", -10]);

    await store.set("ch.bus.mix1.panLink", false);
    await flush();
    expect(bal()?.textContent, "switched off, the send stays where its source was").toBe("L10");
    await store.set("ch.ch1.pan", 30);
    await flush();
    expect(bal()?.textContent, "and moves no more with its source").toBe("L10");
  });

  it("reads the source's position on Pan Link, whatever the send's own placing was put back to", async () => {
    // A scene recall puts values back without the writes an edit carries.
    const { shell, store } = await mount();
    await store.set("ch.ch1.pan", -40);
    await store.set("ch.bus.mix1.panLink", true);
    await store.restore("ch.ch1.send.bus.mix1.balance", 21);
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.sendto", "ch1");
    const bal = [...shell.root.querySelectorAll(".sendto-cell")][0]?.querySelector<HTMLElement>(".sendto-bal .value-box");
    expect(bal?.textContent).toBe("L40");
  });

  it("places a linked pair's sends by the pair's balance on BAL and by each channel's PAN on PAN, and leaves them there", async () => {
    // URX44V, 2026-09-29, CH 3/4 linked: the pair comes up on BAL, where its two sends hold one
    // placing; Pan Link puts both at the pair's balance, and on PAN each at its channel's PAN.
    const { shell, store } = await mount();
    const ch3 = shell.ctx.model.inputs.find((s) => s.id === "ch3");
    if (!ch3) throw new Error("model has no CH 3");
    const sends = (): number[] => ["ch3", "ch4"].map((id) => store.num(`ch.${id}.send.bus.mix1.balance`, 0));
    setSignalType(shell.ctx, ch3, "STEREO");
    await flush();
    expect(store.str("ch.ch3.panBal", "PAN"), "linked, the pair comes up on its balance").toBe("BAL");
    await store.set("ch.ch3.send.bus.mix1.balance", 40);
    await store.set("ch.ch4.send.bus.mix1.balance", -40);
    expect(sends(), "on BAL the two sends hold one placing").toEqual([-40, -40]);
    await store.set("ch.ch3.balance", -25);
    await store.set("ch.bus.mix1.panLink", true);
    expect(sends(), "Pan Link: the pair's balance").toEqual([-25, -25]);
    await store.set("ch.bus.mix1.panLink", false);
    expect(sends(), "and off, where Pan Link put them").toEqual([-25, -25]);

    setPanBal(shell.ctx, ch3, "PAN");
    await flush();
    expect(["ch3", "ch4"].map((id) => store.num(`ch.${id}.pan`, 0)), "PAN puts the two at the ends").toEqual([-63, 63]);
    await store.set("ch.ch3.pan", -20);
    await store.set("ch.ch4.pan", 30);
    await store.set("ch.ch3.send.bus.mix1.balance", 40);
    await store.set("ch.ch4.send.bus.mix1.balance", -40);
    expect(sends(), "on PAN each send holds its own placing").toEqual([40, -40]);
    await store.set("ch.bus.mix1.panLink", true);
    expect(sends(), "Pan Link: each channel's PAN").toEqual([-20, 30]);
    await store.set("ch.bus.mix1.panLink", false);
    expect(sends(), "and off, where Pan Link put them").toEqual([-20, 30]);
  });

  it("switches Pan Link off and out of reach while the bus is fixed, and leaves it off back on VARI", async () => {
    // URX44V: taking FIXED on the unit's screen switched Pan Link off and shut its button, and it
    // stayed off when the bus went back to VARI.
    const { shell, store } = await mount();
    await store.set("ch.bus.mix1.panLink", true);
    await store.set("ch.bus.mix1.busType", "FIXED");
    await open(shell, "ch.setting", "bus.mix1");

    const wrap = shell.root.querySelector(".chs-panlink");
    const btn = wrap?.querySelector<HTMLElement>(".btn");
    expect(wrap?.classList.contains("is-locked")).toBe(true);
    expect(btn?.getAttribute("aria-disabled")).toBe("true");
    expect(btn?.getAttribute("aria-pressed"), "switched off").toBe("false");
    btn?.click();
    await flush();
    expect(store.bool("ch.bus.mix1.panLink", true), "and it takes no press").toBe(false);

    // And a fixed bus places its sends by nothing, so Pan Link has no effect.
    await open(shell, "channel-view", "ch1");
    await open(shell, "ch.sendto", "ch1");
    expect([...shell.root.querySelectorAll(".sendto-cell")][0]?.querySelector(".sendto-bal")).toBeNull();

    await store.set("ch.bus.mix1.busType", "VARI");
    expect(store.bool("ch.bus.mix1.panLink", true), "back on VARI it stays off").toBe(false);
  });
});

describe("what a MIX bus locks on the sends into it", () => {
  it("answers for the four states a bus can be in, and for no other destination", async () => {
    const { shell, store } = await mount();
    const mix = shell.ctx.model.outputs.find((o) => o.id === "bus.mix1");
    const stereo = shell.ctx.model.outputs.find((o) => o.id === "bus.stereo");
    if (!mix || !stereo) throw new Error("model has no MIX 1 or STEREO bus");

    expect(sendLocks(shell.ctx, mix), "as it ships").toEqual({ busFixed: false, panLinked: false });
    await store.set("ch.bus.mix1.panLink", true);
    expect(sendLocks(shell.ctx, mix), "on Pan Link").toEqual({ busFixed: false, panLinked: true });
    await store.set("ch.bus.mix1.busType", "FIXED");
    // A fixed bus takes its sends at one level, so there is no placing for Pan
    // Link to take over, and taking FIXED switches it off.
    expect(sendLocks(shell.ctx, mix), "fixed").toEqual({ busFixed: true, panLinked: false });
    expect(store.bool("ch.bus.mix1.panLink", true)).toBe(false);
    await store.set("ch.bus.mix1.busType", "VARI");
    expect(sendLocks(shell.ctx, mix), "and back on VARI with Pan Link off").toEqual({ busFixed: false, panLinked: false });

    expect(sendLocks(shell.ctx, stereo), "the stereo bus locks nothing").toEqual({ busFixed: false, panLinked: false });
  });

  it("ships both MIX buses taking a variable level with their sends placed by themselves", () => {
    for (const id of ["URX44V", "URX44", "URX22"] as const) {
      const state = factoryState(unitById(id));
      for (const bus of ["bus.mix1", "bus.mix2"]) {
        expect(state.get(`ch.${bus}.busType`), `${id} ${bus}`).toBe("VARI");
        expect(state.get(`ch.${bus}.panLink`), `${id} ${bus}`).toBe(false);
      }
      expect(state.has("ch.bus.stereo.busType"), "and no other bus carries one").toBe(false);
    }
  });
});
