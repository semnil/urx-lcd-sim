import { afterEach, describe, expect, it } from "vitest";
import { TOUR } from "../../e2e/tour";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { factoryState } from "../model/defaults";
import { unitById } from "../model/units";
import { buildRegistry } from "../screens";
import { Shell } from "./shell";

// The end-to-end tests (`pnpm test:e2e`) open every screen by touches in a real
// browser and look for controls a touch cannot land on. They find the screen
// up by the glass's `data-screen`, and reach only the screens their tour names.

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const alive: Shell[] = [];

afterEach(() => {
  for (const shell of alive.splice(0)) shell.destroy();
});

describe("the end-to-end tour", () => {
  it("has a way onto every screen the simulator registers, and onto none it does not", () => {
    const ids = TOUR.map((stop) => stop.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(buildRegistry().ids().sort());
  });

  it("goes on from stops it has", () => {
    const ids = new Set(TOUR.map((stop) => stop.id));
    for (const stop of TOUR) if (stop.from !== undefined) expect(ids, stop.id).toContain(stop.from);
  });
});

describe("the glass's data-screen", () => {
  it("names the screen up, and follows the moves", async () => {
    const model = unitById("URX44V");
    const store = new DeviceStore();
    await store.attach(new SimTransport(factoryState(model)));
    const shell = new Shell(buildRegistry(), store, model);
    alive.push(shell);
    await flush();
    expect(shell.root.dataset["screen"]).toBe("home");
    shell.ctx.nav.openTop({ id: "setup" });
    await flush();
    expect(shell.root.dataset["screen"]).toBe("setup");
    shell.ctx.nav.back();
    await flush();
    expect(shell.root.dataset["screen"]).toBe("home");
  });
});
