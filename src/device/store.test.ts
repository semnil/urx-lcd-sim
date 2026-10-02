import { describe, expect, it, vi } from "vitest";
import { DeviceStore, type WriteFailure } from "./store";
import { SimTransport } from "./sim-transport";
import type { DeviceTransport, Notify } from "./transport";
import type { ParamPath, ParamValue } from "./path";

function simStore(initial: [ParamPath, ParamValue][] = []): { store: DeviceStore; transport: SimTransport } {
  const transport = new SimTransport(initial);
  const store = new DeviceStore();
  return { store, transport };
}

/** A device whose writes wait until the test takes or refuses each one, and that can announce a value, its own change or an echo. */
function heldDevice(initial: [ParamPath, ParamValue][]): {
  transport: DeviceTransport;
  writes: { take: () => void; refuse: () => void }[];
  announce: (path: ParamPath, value: ParamValue, echo?: boolean) => void;
} {
  const writes: { take: () => void; refuse: () => void }[] = [];
  let listener: ((n: Notify) => void) | null = null;
  const transport: DeviceTransport = {
    kind: "bridge",
    snapshot: () => Promise.resolve(new Map(initial)),
    write: () =>
      new Promise<void>((resolve, reject) => {
        writes.push({ take: resolve, refuse: () => reject(new Error("device said no")) });
      }),
    onNotify: (l) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    close: () => {},
  };
  return { transport, writes, announce: (path, value, echo = false) => listener?.({ path, value, echo }) };
}

/** A store on `device`, and each refusal it reports as [attempted, restored]. */
async function storeOn(device: { transport: DeviceTransport }): Promise<{ store: DeviceStore; failures: [ParamValue, ParamValue | undefined][] }> {
  const store = new DeviceStore();
  await store.attach(device.transport);
  const failures: [ParamValue, ParamValue | undefined][] = [];
  store.onWriteFailure((f: WriteFailure) => failures.push([f.attempted, f.restored]));
  return { store, failures };
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

  it("tells its listeners of the values a transport it moves onto does not hold", async () => {
    const store = new DeviceStore();
    await store.attach(new SimTransport([["a", 1], ["b", 2]]));
    const changed: ParamPath[] = [];
    store.onChange((paths) => changed.push(...paths));

    await store.attach(new SimTransport([]));
    store.flush();

    expect(store.has("a")).toBe(false);
    expect([...changed].sort()).toEqual(["a", "b"]);
  });

  it("stays on its transport when the new one's snapshot cannot be read", async () => {
    const { store, transport: sim } = simStore([["ch.ch1.gain", 20]]);
    await store.attach(sim);
    const sent: ParamValue[] = [];
    let unsubscribed = false;
    const unreadable: DeviceTransport = {
      kind: "bridge",
      snapshot: () => Promise.reject(new Error("read timed out")),
      write: (_path, value) => {
        sent.push(value);
        return Promise.resolve();
      },
      onNotify: () => () => {
        unsubscribed = true;
      },
      close: () => {},
    };

    await expect(store.attach(unreadable)).rejects.toThrow("read timed out");
    expect([store.kind, store.num("ch.ch1.gain")]).toEqual(["sim", 20]);
    expect(unsubscribed, "it no longer listens to the transport it could not read").toBe(true);

    await store.set("ch.ch1.gain", 21);
    expect(sent, "nothing is sent to the transport it could not read").toEqual([]);
    expect(sim.peek("ch.ch1.gain"), "the edit goes where the store still is").toBe(21);
  });

  it("drops a snapshot that comes in after a later attach", async () => {
    const store = new DeviceStore();
    let answer: (snap: Map<ParamPath, ParamValue>) => void = () => {};
    let unsubscribed = false;
    const slow: DeviceTransport = {
      kind: "bridge",
      snapshot: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      write: () => Promise.resolve(),
      onNotify: () => () => {
        unsubscribed = true;
      },
      close: () => {},
    };

    const first = store.attach(slow);
    await store.attach(new SimTransport([["p1", 0], ["p2", 0]]));
    answer(new Map([["p1", -40]]));
    await first;

    expect([store.kind, store.num("p1", 99), store.has("p2")]).toEqual(["sim", 0, true]);
    expect(unsubscribed, "it no longer listens to the transport it moved past").toBe(true);
  });

  it("takes what the transport announces while its snapshot is read", async () => {
    const store = new DeviceStore();
    let answer: (snap: Map<ParamPath, ParamValue>) => void = () => {};
    let announce: (n: Notify) => void = () => {};
    const unit: DeviceTransport = {
      kind: "bridge",
      snapshot: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
      write: () => Promise.resolve(),
      onNotify: (listener) => {
        announce = listener;
        return () => {};
      },
      close: () => {},
    };

    const attaching = store.attach(unit);
    announce({ path: "p", value: 55, echo: false });
    answer(new Map([["p", 10]]));
    await attaching;

    expect(store.num("p")).toBe(55);
  });

  it("leaves the new transport's value alone when a write to the old one is refused", async () => {
    const old = heldDevice([["p", 0]]);
    const { store } = await storeOn(old);
    const write = store.set("p", 5);
    await store.attach(new SimTransport([["p", 5]]));

    old.writes[0]!.refuse();
    await write;

    expect(store.num("p")).toBe(5);
  });

  it("goes back to what the new transport holds when writes on both sides of the move are refused", async () => {
    const old = heldDevice([["p", 0]]);
    const { store } = await storeOn(old);
    const before = store.set("p", 5);
    const next = heldDevice([["p", 7]]);
    await store.attach(next.transport);
    const second = store.set("p", 8);

    old.writes[0]!.refuse();
    await before;
    const third = store.set("p", 9);
    next.writes[0]!.refuse();
    await second;
    next.writes[1]!.refuse();
    await third;

    expect(store.num("p")).toBe(7);
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

  it("takes every notify that differs from the mirror, whether it is an echo or not", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store } = await storeOn(device);
    const shown: number[] = [];
    store.onChange(() => shown.push(store.num("ch.ch1.level")));

    void store.set("ch.ch1.level", -2);
    store.flush();
    device.announce("ch.ch1.level", -1, true);
    store.flush();
    device.announce("ch.ch1.level", -3, false);
    store.flush();
    device.announce("ch.ch1.level", -3, true);
    store.flush();

    expect(shown).toEqual([-2, -1, -3]);
  });

  it("keeps a later write the device took when an earlier one is refused", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const first = store.set("ch.ch1.level", -1);
    const second = store.set("ch.ch1.level", -2);

    device.writes[1]!.take();
    await second;
    device.writes[0]!.refuse();
    await first;

    expect(store.num("ch.ch1.level")).toBe(-2);
    expect(failures).toEqual([[-1, -2]]);
  });

  it("keeps what the device announced while a refused write waited", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const write = store.set("ch.ch1.level", -1);

    device.announce("ch.ch1.level", -40);
    device.writes[0]!.refuse();
    await write;

    expect(store.num("ch.ch1.level")).toBe(-40);
    expect(failures).toEqual([[-1, -40]]);
  });

  it("goes back to what the device holds when every write is refused", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const first = store.set("ch.ch1.level", -1);
    const second = store.set("ch.ch1.level", -2);

    device.writes[0]!.refuse();
    await first;
    device.writes[1]!.refuse();
    await second;

    expect(store.num("ch.ch1.level")).toBe(0);
    expect(failures).toEqual([[-1, -2], [-2, 0]]);
  });

  it("goes back to the write the device took when a later one is refused", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const first = store.set("ch.ch1.level", -1);
    const second = store.set("ch.ch1.level", -2);

    device.writes[0]!.take();
    await first;
    device.writes[1]!.refuse();
    await second;

    expect(store.num("ch.ch1.level")).toBe(-1);
    expect(failures).toEqual([[-2, -1]]);
  });

  it("goes back to what the device announced when a later write is refused", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const first = store.set("ch.ch1.level", -1);
    device.announce("ch.ch1.level", -40);
    const second = store.set("ch.ch1.level", -3);

    device.writes[0]!.refuse();
    await first;
    device.writes[1]!.refuse();
    await second;

    expect(store.num("ch.ch1.level")).toBe(-40);
    expect(failures).toEqual([[-1, -3], [-3, -40]]);
  });

  it("keeps a newer write of the same value when an earlier one is refused", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const first = store.set("ch.ch1.level", -1);
    void store.set("ch.ch1.level", -2);
    const third = store.set("ch.ch1.level", -1);

    device.writes[0]!.refuse();
    await first;
    expect(store.num("ch.ch1.level"), "while the newer write waits").toBe(-1);
    device.writes[1]!.take();
    device.writes[2]!.take();
    await third;

    expect(store.num("ch.ch1.level")).toBe(-1);
    expect(failures).toEqual([[-1, -1]]);
  });

  it("keeps what the device announced after the refused write was sent", async () => {
    const device = heldDevice([["ch.ch1.level", 0]]);
    const { store, failures } = await storeOn(device);
    const first = store.set("ch.ch1.level", -1);
    const second = store.set("ch.ch1.level", -2);
    device.announce("ch.ch1.level", -40);

    device.writes[0]!.take();
    await first;
    device.writes[1]!.refuse();
    await second;

    expect(store.num("ch.ch1.level")).toBe(-40);
    expect(failures).toEqual([[-2, -40]]);
  });

  it("drops a path the device never held when its write is refused", async () => {
    const device = heldDevice([]);
    const { store, failures } = await storeOn(device);
    const write = store.set("ch.ch9.level", -6);

    device.writes[0]!.refuse();
    await write;

    expect(store.has("ch.ch9.level")).toBe(false);
    expect(failures).toEqual([[-6, undefined]]);
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
