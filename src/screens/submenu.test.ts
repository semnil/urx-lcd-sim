// Which screens carry the submenu, what stands where in it, and what lights its
// [Paste] buttons: the readings on a URX44V that `submenu.ts` carries.

import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
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

  it.each(["ch.gate", "ch.comp", "ch.insfx", "ch.ducker", "ch.delay", "ch.effect", "ch.ssmcs", "ch.ssmcs.comp", "ch.ssmcs.sc"])(
    "on %s carries Copy, Paste, Compare and Default in the left column",
    async (id) => {
      const shell = await mount();
      const spec = submenuFor(shell.ctx, { id, strip: "ch1" })!;
      expect(faces(spec.left)).toEqual(["Copy", "Paste (x)", "Compare (x)", "Default"]);
      expect(faces(spec.right)).toEqual(["—", "—", "—", "—"]);
    },
  );

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
