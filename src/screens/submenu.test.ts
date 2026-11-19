// Which screens carry the submenu, what stands where in it, and what lights its
// [Paste] buttons: the readings on a URX44V that `submenu.ts` carries.

import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { effectParams } from "../model/effects";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { INCOMING_COPY, submenuFor, type SubmenuSpec } from "./submenu";

async function mount(): Promise<Shell> {
  const model = unitById("URX44V");
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  return new Shell(buildRegistry(), store, model);
}

/** A column's faces, `—` for an empty row and `(x)` for a button that cannot be pressed. */
const faces = (column: SubmenuSpec["left"]): string[] =>
  column.map((b) => (b === null ? "—" : `${b.label}${b.sub ? ` ${b.sub}` : ""}${b.enabled ? "" : " (x)"}`));

describe("the submenu", () => {
  it.each([
    ["home", undefined],
    ["channel-view", "ch1"],
  ])("on %s carries the channel's own operations", async (id, strip) => {
    const shell = await mount();
    const spec = submenuFor(shell.ctx, strip ? { id, strip } : { id })!;
    expect(faces(spec.left)).toEqual(["CH Copy", "CH Paste (x)", "—", "CH Default"]);
    expect(faces(spec.right)).toEqual(["—", "—", "—", "—"]);
    expect(spec.wideGapBefore).toBe(3);
  });

  it("on a MIX bus adds CH Copy Incoming Sends at the top of the right column", async () => {
    const shell = await mount();
    const spec = submenuFor(shell.ctx, { id: "channel-view", strip: "bus.mix1" })!;
    expect(faces(spec.right)).toEqual(["CH Copy Incoming Sends", "—", "—", "—"]);
  });

  it.each(["ch.gate", "ch.comp", "ch.ducker", "ch.delay", "ch.effect", "ch.ssmcs", "ch.ssmcs.comp", "ch.ssmcs.sc"])(
    "on %s carries Copy, Paste, Compare and Default in the left column",
    async (id) => {
      const shell = await mount();
      const spec = submenuFor(shell.ctx, { id, strip: "ch1" })!;
      expect(faces(spec.left)).toEqual(["Copy", "Paste (x)", "Compare (x)", "Default"]);
      expect(faces(spec.right)).toEqual(["—", "—", "—", "—"]);
    },
  );

  it("on INS FX only while the insert holds an effect", async () => {
    const shell = await mount();
    expect(submenuFor(shell.ctx, { id: "ch.insfx", strip: "ch1" })).toBeUndefined();
    await shell.ctx.store.set("ch.ch1.insFx.effect", "Compander-H");
    expect(faces(submenuFor(shell.ctx, { id: "ch.insfx", strip: "ch1" })!.left)).toEqual(["Copy", "Paste (x)", "Compare (x)", "Default"]);
  });

  it("keeps an effect's copy to the same effect", async () => {
    const shell = await mount();
    const kind = submenuFor(shell.ctx, { id: "ch.effect", strip: "fx1" })!.copy!.kind;
    const pasteOn = (strip: string) => submenuFor(shell.ctx, { id: "ch.effect", strip }, new Set([kind]))!.left[1]?.enabled;
    expect(pasteOn("fx1")).toBe(true);
    expect(shell.ctx.store.str("ch.fx2.effect.type", "")).not.toBe(shell.ctx.store.str("ch.fx1.effect.type", ""));
    expect(pasteOn("fx2")).toBe(false);
  });

  it.each(["ch.eq", "ch.ssmcs.eq"])("on %s adds Gain Flat at the top of the right column", async (id) => {
    const shell = await mount();
    expect(faces(submenuFor(shell.ctx, { id, strip: "ch1" })!.right)).toEqual(["Gain Flat", "—", "—", "—"]);
  });

  it("on a MIX bus's SEND FROM carries the send operations, with the wide gap above the third row", async () => {
    const shell = await mount();
    const spec = submenuFor(shell.ctx, { id: "ch.sendfrom", strip: "bus.mix1" })!;
    expect(faces(spec.left)).toEqual(["Copy", "Paste (x)", "—", "—"]);
    expect(faces(spec.right)).toEqual(["All Pre", "All Post", "All Nominal", "Dup.Stereo"]);
    expect(spec.wideGapBefore).toBe(2);
  });

  it.each([
    ["ch.sendto", "ch1"],
    ["ch.sendfrom", "bus.stereo"],
    ["ch.input", "ch1"],
    ["ch.setting", "ch1"],
  ])("is not on %s (%s)", async (id, strip) => {
    const shell = await mount();
    expect(submenuFor(shell.ctx, { id, strip })).toBeUndefined();
  });

  it("lights Paste and Compare for a copy of the same kind only, and SSMCS's pages share theirs", async () => {
    const shell = await mount();
    const lit = (id: string, copied: string[]): boolean[] =>
      submenuFor(shell.ctx, { id, strip: "ch2" }, new Set(copied))!.left.slice(1, 3).map((b) => b?.enabled ?? false);
    expect(lit("ch.gate", ["ch.gate"])).toEqual([true, true]);
    expect(lit("ch.comp", ["ch.gate"])).toEqual([false, false]);
    expect(lit("ch.ssmcs.eq", ["ch.ssmcs"])).toEqual([true, true]);
  });

  it("names a MIX bus's CH Paste for the sends once a copy holds them", async () => {
    const shell = await mount();
    const paste = (copied: string[]) => submenuFor(shell.ctx, { id: "channel-view", strip: "bus.mix2" }, new Set(copied))!.left[1];
    expect(paste(["channel"])?.sub).toBeUndefined();
    expect(paste(["channel", INCOMING_COPY])?.sub).toBe("Incoming Sends");
  });
});

describe("the submenu's buttons", () => {
  const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

  async function at(shell: Shell, id: string, strip: string): Promise<void> {
    shell.ctx.nav.push({ id, strip });
    await flush();
  }

  /** Open the submenu as the keys do, and press the button whose words are `label` (and `sub`). */
  async function press(shell: Shell, label: string, sub?: string): Promise<void> {
    const tab = shell.root.querySelector<HTMLElement>(".submenu-tab");
    tab?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    const node = [...shell.root.querySelectorAll<HTMLElement>(".submenu-btn")].find(
      (n) => n.querySelector(".submenu-label")?.textContent === label && (n.querySelector(".submenu-sub")?.textContent ?? undefined) === sub,
    );
    if (!node) throw new Error(`no ${label} in the submenu`);
    node.click();
    await flush();
  }

  async function ok(shell: Shell): Promise<void> {
    const node = [...shell.root.querySelectorAll<HTMLElement>(".dialog button")].find((n) => n.textContent === "OK");
    if (!node) throw new Error("no [OK]");
    node.click();
    await flush();
  }

  it("CH Paste and CH Default act on the connector the channel reads, not the one of its number", async () => {
    const shell = await mount();
    const { store } = shell.ctx;
    await store.set("ch.ch1.gain", 12);
    await store.set("ch.ch1.phantom", true);
    // CH 2 on MIC/LINE 3/4 reads connector 4.
    await store.set("ch.ch2.source", "MIC/LINE 3/4");
    await at(shell, "channel-view", "ch1");
    await press(shell, "CH Copy");
    await at(shell, "channel-view", "ch2");
    await press(shell, "CH Paste");
    expect([store.num("ch.ch4.gain"), store.bool("ch.ch4.phantom")]).toEqual([12, true]);
    expect([store.num("ch.ch2.gain"), store.bool("ch.ch2.phantom")]).toEqual([-8, false]);
    await press(shell, "CH Default");
    await ok(shell);
    expect([store.num("ch.ch4.gain"), store.bool("ch.ch4.phantom")]).toEqual([-8, false]);
    expect(store.str("ch.ch2.source")).toBe("MIC/LINE 3/4");
  });

  it("GEQ's Copy takes its bands, and Paste, Compare and Default act on them", async () => {
    const shell = await mount();
    const { store } = shell.ctx;
    await store.set("ch.bus.stereo.eqType", "Flex12GEQ");
    const band = "ch.bus.stereo.geq.l.band.0";
    await store.set(band, 6);
    await at(shell, "ch.geq", "bus.stereo");
    await press(shell, "Copy");
    await store.set(band, -3);
    await press(shell, "Paste");
    expect(store.num(band)).toBe(6);
    await store.set(band, -3);
    await press(shell, "Compare");
    expect(store.num(band)).toBe(6);
    await press(shell, "Compare");
    expect(store.num(band)).toBe(-3);
    await press(shell, "Default");
    await ok(shell);
    expect(store.num(band)).toBe(0);
  });

  it.each([
    ["ch.effect", "fx1", "effect", "type"],
    ["ch.insfx", "ch1", "insFx", "effect"],
  ])("Default on %s puts the effect's own values back and keeps the effect chosen", async (screen, strip, block, nameKey) => {
    const shell = await mount();
    const { store } = shell.ctx;
    // An effect other than the one the strip comes up with, so a Default that took the factory's would show.
    await store.set(`ch.${strip}.${block}.${nameKey}`, block === "insFx" ? "Compander-H" : "Rev-X Room");
    const name = store.str(`ch.${strip}.${block}.${nameKey}`);
    const param = effectParams(name).find((p) => typeof p.fallback === "number")!;
    const path = `ch.${strip}.${block}.${param.key}`;
    await store.set(path, (param.fallback as number) + 1);
    await at(shell, screen, strip);
    await press(shell, "Default");
    await ok(shell);
    expect(store.num(path)).toBe(param.fallback);
    expect(store.str(`ch.${strip}.${block}.${nameKey}`)).toBe(name);
  });
});
