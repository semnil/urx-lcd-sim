import { describe, expect, it } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { stepBank } from "./strip-state";

async function mount(id: "URX44V" | "URX22"): Promise<Shell> {
  const model = unitById(id);
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(model)));
  return new Shell(buildRegistry(), store, model);
}

/** The bank on display after each step of `deltas`, from the side's first bank. */
async function steps(id: "URX44V" | "URX22", side: "input" | "output", deltas: number[]): Promise<number[]> {
  const shell = await mount(id);
  await shell.ctx.store.set("ui.bankSide", side);
  await shell.ctx.store.set("ui.bank", 0);
  const banks = deltas.map((d) => {
    stepBank(shell.ctx, d);
    return shell.ctx.store.num("ui.bank", -1);
  });
  shell.destroy();
  return banks;
}

describe("stepping the channel bank", () => {
  it("moves one bank within the side on display and stops at its first and last bank", async () => {
    // URX44V: swipes to the left on HOME went from CH 1 - 4 to CH 5 - 12 and FX 1 - 2 and stayed on FX 1 - 2,
    // swipes to the right came back to CH 1 - 4 and stayed there, and the OUTPUT side's one bank stayed.
    expect(await steps("URX44V", "input", [1, 1, 1, -1, -1, -1]), "URX44V INPUT").toEqual([1, 2, 2, 1, 0, 0]);
    expect(await steps("URX44V", "output", [1, -1]), "URX44V OUTPUT").toEqual([0, 0]);
    expect(await steps("URX22", "input", [1, 1, -1, -1]), "URX22 INPUT").toEqual([1, 1, 0, 0]);
  });
});
