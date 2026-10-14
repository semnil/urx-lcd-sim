import { describe, expect, it, vi } from "vitest";
import { Shell } from "../app/shell";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { findStrip } from "../model/types";
import { unitById } from "../model/units";
import { buildRegistry } from "./index";
import { takeInsert } from "./insert-fx";

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The paths an insert's selection writes on CH 1, under the given shell options. */
async function written(insertValuesFromPage?: boolean): Promise<string[]> {
  const model = unitById("URX44V");
  const transport = new SimTransport(factoryState(model));
  const store = new DeviceStore();
  await store.attach(transport);
  const shell = new Shell(buildRegistry(), store, model, [], insertValuesFromPage ? { insertValuesFromPage } : {});
  const write = vi.spyOn(transport, "write");
  takeInsert(shell.ctx, findStrip(model, "ch1")!, "Compander-S");
  await flush();
  return write.mock.calls.map(([path]) => path as string).sort();
}

describe("an insert effect's values as one is chosen", () => {
  it("are the effect's own settings on a page of its own", async () => {
    const paths = await written();
    expect(paths).toContain("ch.ch1.insFx.effect");
    expect(paths).toContain("ch.ch1.insFx.threshold");
    expect(paths).toContain("ch.ch1.insFx.width");
  });

  it("are left to the page where the page gives them: only the effect and its switch are written", async () => {
    expect(await written(true)).toEqual(["ch.ch1.insFx.effect", "ch.ch1.insFx.on"]);
  });
});
