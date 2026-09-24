import { describe, expect, it, vi } from "vitest";
import { DeviceStore } from "./store";
import { SimTransport } from "./sim-transport";
import type { DeviceTransport, Notify } from "./transport";
import type { ParamPath, ParamValue } from "./path";

function simStore(initial: [ParamPath, ParamValue][] = []): { store: DeviceStore; transport: SimTransport } {
  const transport = new SimTransport(initial);
  const store = new DeviceStore();
  return { store, transport };
}

describe("DeviceStore", () => {
  it("serves the transport snapshot after attach", async () => {
    const { store, transport } = simStore([
      ["ch.ch1.level", -3.2],
      ["ch.ch1.on", true],
      ["ch.ch1.name", "VocalMic"],
    ]);
    await store.attach(transport);

    expect(store.num("ch.ch1.level")).toBe(-3.2);
    expect(store.bool("ch.ch1.on")).toBe(true);
    expect(store.str("ch.ch1.name")).toBe("VocalMic");
  });

  it("returns the fallback for a path the device never reported", async () => {
    const { store, transport } = simStore();
    await store.attach(transport);
    expect(store.num("ch.ch9.level", -96)).toBe(-96);
    expect(store.has("ch.ch9.level")).toBe(false);
  });

  it("writes through to the transport and reads back the same value", async () => {
    const { store, transport } = simStore([["ch.ch1.level", 0]]);
    await store.attach(transport);

    await store.set("ch.ch1.level", -6);

    expect(store.num("ch.ch1.level")).toBe(-6);
    expect(transport.peek("ch.ch1.level")).toBe(-6);
  });

  it("adopts a change the device made on its own", async () => {
    const { store, transport } = simStore([["ch.ch1.on", true]]);
    await store.attach(transport);

    transport.inject("ch.ch1.on", false);

    expect(store.bool("ch.ch1.on")).toBe(false);
  });

  it("reverts the mirror when the device refuses the write", async () => {
    const failing: DeviceTransport = {
      kind: "sim",
      snapshot: () => Promise.resolve(new Map<ParamPath, ParamValue>([["ch.ch1.level", -3]])),
      write: () => Promise.reject(new Error("device said no")),
      onNotify: () => () => {},
      close: () => {},
    };
    const store = new DeviceStore();
    await store.attach(failing);
    const failures: unknown[] = [];
    store.onWriteFailure((f) => failures.push(f));

    await store.set("ch.ch1.level", 5);

    expect(store.num("ch.ch1.level")).toBe(-3);
    expect(failures).toHaveLength(1);
  });

  it("clamps a stepped value to the parameter range", async () => {
    const { store, transport } = simStore([["setup.brightness", 9]]);
    await store.attach(transport);

    expect(store.step("setup.brightness", 5, 0, 10)).toBe(10);
    expect(store.step("setup.brightness", -20, 0, 10)).toBe(0);
  });

  it("carries the values a write rule names along with the write", async () => {
    const { store, transport } = simStore([
      ["ch.ch1.level", 0],
      ["ch.ch2.level", 0],
    ]);
    await store.attach(transport);
    store.setWriteRule((path, value) => (path === "ch.ch1.level" ? [["ch.ch2.level", value]] : []));

    await store.set("ch.ch1.level", -9);
    expect([store.num("ch.ch1.level"), store.num("ch.ch2.level")]).toEqual([-9, -9]);
    expect(transport.peek("ch.ch2.level"), "and it reached the device").toBe(-9);

    store.setWriteRule(null);
    await store.set("ch.ch1.level", -4);
    expect([store.num("ch.ch1.level"), store.num("ch.ch2.level")]).toEqual([-4, -9]);
  });

  it("puts a restored value back alone, without the writes a rule names", async () => {
    const { store, transport } = simStore([
      ["ch.ch1.level", 0],
      ["ch.ch2.level", 0],
    ]);
    await store.attach(transport);
    store.setWriteRule((path, value) => (path === "ch.ch1.level" ? [["ch.ch2.level", value]] : []));

    await store.restore("ch.ch1.level", -9);
    expect([store.num("ch.ch1.level"), store.num("ch.ch2.level")]).toEqual([-9, 0]);
    expect(transport.peek("ch.ch1.level"), "and it reached the device").toBe(-9);
  });

  it("settles rather than looping when a rule points back at the write", async () => {
    const { store, transport } = simStore([
      ["a", 0],
      ["b", 0],
    ]);
    await store.attach(transport);
    const changed: ParamPath[] = [];
    store.onChange((paths) => changed.push(...paths));
    // Each path answers with the other, which is the shape a mirrored pair has.
    store.setWriteRule((path, value) => [[path === "a" ? "b" : "a", value]]);

    await store.set("a", 5);
    expect([store.num("a"), store.num("b")]).toEqual([5, 5]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect([...changed].sort()).toEqual(["a", "b"]);
  });

  it("coalesces a burst of changes into one notification", async () => {
    const { store, transport } = simStore([["a", 1]]);
    await store.attach(transport);
    const listener = vi.fn();
    store.onChange(listener);

    void store.set("a", 2);
    void store.set("b", 3);
    void store.set("c", 4);
    store.flush();

    expect(listener).toHaveBeenCalledTimes(1);
    expect([...(listener.mock.calls[0]?.[0] as Set<string>)]).toEqual(["a", "b", "c"]);
  });

  it("enumerates a subtree without matching a same-prefixed sibling", async () => {
    const { store, transport } = simStore([
      ["ch.ch1.level", 0],
      ["ch.ch1.gate.on", false],
      ["ch.ch11.level", 0],
    ]);
    await store.attach(transport);

    expect(store.pathsUnder("ch.ch1").sort()).toEqual(["ch.ch1.gate.on", "ch.ch1.level"]);
  });
});

describe("SimTransport", () => {
  it("marks its own write echoes and a device-side change differently", async () => {
    const transport = new SimTransport([["p", 1]]);
    const seen: Notify[] = [];
    transport.onNotify((n) => seen.push(n));

    await transport.write("p", 2);
    transport.inject("p", 3);

    expect(seen.map((n) => n.echo)).toEqual([true, false]);
  });

  it("stops notifying after close", async () => {
    const transport = new SimTransport([["p", 1]]);
    const seen: Notify[] = [];
    transport.onNotify((n) => seen.push(n));
    transport.close();

    transport.inject("p", 2);
    await expect(transport.write("p", 3)).rejects.toThrow("transport closed");

    expect(seen).toHaveLength(0);
  });
});
