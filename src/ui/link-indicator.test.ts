import { describe, expect, it } from "vitest";
import { BindingTable } from "../device/binding";
import { BridgeTransport, type DeviceLink } from "../device/bridge-transport";
import { SimTransport } from "../device/sim-transport";
import { DeviceStore } from "../device/store";
import { buildLinkIndicator } from "./link-indicator";

/** A link to a unit with nothing bound yet. */
const link: DeviceLink = {
  get: () => Promise.resolve(0),
  set: () => Promise.resolve(),
  getStr: () => Promise.resolve(""),
  setStr: () => Promise.resolve(),
  subscribe: () => Promise.resolve(() => {}),
};

describe("the chrome's indicator of what the screen drives", () => {
  it("follows the store onto a connected unit and back", async () => {
    const store = new DeviceStore();
    await store.attach(new SimTransport([["ch.ch1.level", 0]]));
    const indicator = buildLinkIndicator(store);
    const shown = (): [string | null, string] => [indicator.root.textContent, indicator.root.className];
    expect(shown()).toEqual(["Simulated device", "chrome-link chrome-link-sim"]);

    await store.attach(new BridgeTransport(link, new BindingTable()));
    store.flush();
    expect(shown(), "attached to a unit after it was built").toEqual(["Connected unit", "chrome-link chrome-link-bridge"]);

    await store.attach(new SimTransport([["ch.ch1.level", 0]]));
    store.flush();
    expect(shown(), "and back").toEqual(["Simulated device", "chrome-link chrome-link-sim"]);
    indicator.stop();
  });
});
