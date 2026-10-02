import { describe, expect, it } from "vitest";
import { BindingTable, boolCodec, identityCodec, scaledCodec } from "./binding";
import { BridgeTransport, UnboundPathError, type DeviceLink } from "./bridge-transport";
import { DeviceStore } from "./store";

/** What the stand-in unit holds before the test starts, and the addresses that do not answer a read. */
interface FakeUnit {
  values?: Record<string, number>;
  strings?: Record<string, string>;
  failing?: string[];
}

/** A stand-in for the device link, recording what a real unit would receive. Each subscription hears every notify. */
function fakeBridge(unit: FakeUnit = {}): DeviceLink & {
  writes: [string, number][];
  strWrites: [string, string][];
  fire: (addr: string, raw: number) => void;
} {
  const values = new Map<string, number>(Object.entries(unit.values ?? {}));
  const strings = new Map<string, string>(Object.entries(unit.strings ?? {}));
  const failing = new Set(unit.failing ?? []);
  const writes: [string, number][] = [];
  const strWrites: [string, string][] = [];
  const handlers = new Set<(addr: string, raw: number) => void>();
  const read = <T>(addr: string, value: T): Promise<T> =>
    failing.has(addr) ? Promise.reject(new Error(`no answer from ${addr}`)) : Promise.resolve(value);
  return {
    writes,
    strWrites,
    get: (addr) => read(addr, values.get(addr) ?? 0),
    set: (addr, value) => {
      values.set(addr, value);
      writes.push([addr, value]);
      return Promise.resolve();
    },
    getStr: (addr) => read(addr, strings.get(addr) ?? ""),
    setStr: (addr, value) => {
      strings.set(addr, value);
      strWrites.push([addr, value]);
      return Promise.resolve();
    },
    subscribe: (_addrs, onUpdate) => {
      const handler = (addr: string, raw: number): void => onUpdate(addr, raw);
      handlers.add(handler);
      return Promise.resolve(() => {
        handlers.delete(handler);
      });
    },
    fire: (addr, raw) => {
      for (const h of [...handlers]) h(addr, raw);
    },
  };
}

/** A unit that keeps a written value within [0, max] and announces what it kept before it answers the write. */
function clampingUnit(max: number): DeviceLink & { held: Map<string, number> } {
  const held = new Map<string, number>();
  let handler: ((addr: string, raw: number) => void) | null = null;
  return {
    held,
    get: (addr) => Promise.resolve(held.get(addr) ?? 0),
    set: (addr, value) => {
      const kept = Math.max(0, Math.min(value, max));
      held.set(addr, kept);
      handler?.(addr, kept);
      return Promise.resolve();
    },
    getStr: () => Promise.resolve(""),
    setStr: () => Promise.resolve(),
    subscribe: (_addrs, onUpdate) => {
      handler = onUpdate;
      return Promise.resolve(() => {
        handler = null;
      });
    },
  };
}

/** A store on a unit that clamps and announces, with ch.ch1.gain stored in tenths of a dB. */
async function storeOnClampingUnit(): Promise<{ store: DeviceStore; unit: ReturnType<typeof clampingUnit> }> {
  const unit = clampingUnit(100);
  const bindings = new BindingTable();
  bindings.bind("ch.ch1.gain", { addr: "gain-addr", codec: scaledCodec(10) });
  const store = new DeviceStore();
  await store.attach(new BridgeTransport(unit, bindings));
  return { store, unit };
}

describe("BridgeTransport", () => {
  it("refuses a path with no validated address rather than guessing one", async () => {
    const bridge = fakeBridge();
    const transport = new BridgeTransport(bridge, new BindingTable());

    await expect(transport.write("ch.ch1.level", -6)).rejects.toBeInstanceOf(UnboundPathError);
    expect(bridge.writes).toHaveLength(0);
  });

  it("encodes a bound value the way the binding says", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.level", { addr: "level-addr", codec: scaledCodec(100) });
    const transport = new BridgeTransport(bridge, bindings);

    await transport.write("ch.ch1.level", -6.5);

    expect(bridge.writes).toEqual([["level-addr", -650]]);
  });

  it("decodes a device notify back onto its path", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    const transport = new BridgeTransport(bridge, bindings);
    await transport.snapshot();

    const seen: { path: string; value: unknown; echo: boolean }[] = [];
    transport.onNotify((n) => seen.push(n));
    bridge.fire("on-addr", 0);

    expect(seen).toEqual([{ path: "ch.ch1.on", value: false, echo: false }]);
  });

  it("flags the notify that is our own write coming back", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("setup.brightness", { addr: "brightness-addr", codec: identityCodec });
    const transport = new BridgeTransport(bridge, bindings);
    await transport.snapshot();

    const seen: boolean[] = [];
    transport.onNotify((n) => seen.push(n.echo));
    await transport.write("setup.brightness", 7);
    bridge.fire("brightness-addr", 7); // the unit acknowledging the same value
    bridge.fire("brightness-addr", 3); // somebody turning the knob on the unit

    expect(seen).toEqual([true, true, false]);
  });

  it("leaves what the unit clamped a write to on screen when the unit announces it before answering", async () => {
    const { store, unit } = await storeOnClampingUnit();

    await store.set("ch.ch1.gain", 15);

    expect(unit.held.get("gain-addr")).toBe(100);
    expect(store.num("ch.ch1.gain")).toBe(10);
  });

  it("leaves what the unit rounded a write to on screen when the unit announces it before answering", async () => {
    const { store, unit } = await storeOnClampingUnit();

    await store.set("ch.ch1.gain", 1.25);

    expect(unit.held.get("gain-addr")).toBe(13);
    expect(store.num("ch.ch1.gain")).toBe(1.3);
  });

  it("echoes a write as encoded for the unit when the unit announces nothing", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.gain", { addr: "gain-addr", codec: scaledCodec(10) });
    const store = new DeviceStore();
    await store.attach(new BridgeTransport(bridge, bindings));

    await store.set("ch.ch1.gain", 1.25);

    expect(bridge.writes).toEqual([["gain-addr", 13]]);
    expect(store.num("ch.ch1.gain")).toBe(1.3);
  });

  it("sends no echo for a write a later write has overtaken", async () => {
    const answers: (() => void)[] = [];
    const link: DeviceLink = {
      ...fakeBridge(),
      set: () => new Promise<void>((resolve) => answers.push(resolve)),
    };
    const bindings = new BindingTable();
    bindings.bind("setup.brightness", { addr: "brightness-addr", codec: identityCodec });
    const transport = new BridgeTransport(link, bindings);
    await transport.snapshot();
    const seen: [unknown, boolean][] = [];
    transport.onNotify((n) => seen.push([n.value, n.echo]));

    const first = transport.write("setup.brightness", 7);
    const second = transport.write("setup.brightness", 3);
    answers[0]!();
    await first;
    answers[1]!();
    await second;

    expect(seen).toEqual([[3, true]]);
  });

  it("flags only the first notify of the value it wrote as its own", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("setup.brightness", { addr: "brightness-addr", codec: identityCodec });
    const transport = new BridgeTransport(bridge, bindings);
    await transport.snapshot();

    const seen: boolean[] = [];
    transport.onNotify((n) => seen.push(n.echo));
    await transport.write("setup.brightness", 7);
    bridge.fire("brightness-addr", 7); // the unit acknowledging the write
    bridge.fire("brightness-addr", 7); // the unit reporting the same value again, on its own

    expect(seen).toEqual([true, true, false]);
  });

  it("reads every bound path into the snapshot, decoded, and a string through the string verb", async () => {
    const bridge = fakeBridge({ values: { "on-addr": 1, "level-addr": -650, "name-addr": 9 }, strings: { "name-addr": "VocalMic" } });
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    bindings.bind("ch.ch1.level", { addr: "level-addr", codec: scaledCodec(100) });
    bindings.bind("ch.ch1.name", { addr: "name-addr", codec: identityCodec, isString: true });
    const transport = new BridgeTransport(bridge, bindings);

    const snap = await transport.snapshot();

    expect(Object.fromEntries(snap)).toEqual({ "ch.ch1.on": true, "ch.ch1.level": -6.5, "ch.ch1.name": "VocalMic" });
  });

  it("refuses a snapshot it cannot read completely", async () => {
    const bridge = fakeBridge({ values: { "on-addr": 1 }, failing: ["level-addr"] });
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    bindings.bind("ch.ch1.level", { addr: "level-addr", codec: scaledCodec(100) });
    const transport = new BridgeTransport(bridge, bindings);

    await expect(transport.snapshot()).rejects.toThrow("no answer from level-addr");
  });

  it("writes a string parameter through the string verb, and nothing through the number one", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.name", { addr: "name-addr", codec: identityCodec, isString: true });
    const transport = new BridgeTransport(bridge, bindings);

    await transport.write("ch.ch1.name", "VocalMic");

    expect([bridge.strWrites, bridge.writes]).toEqual([[["name-addr", "VocalMic"]], []]);
  });

  it("follows the unit once, however many snapshots it takes", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    const transport = new BridgeTransport(bridge, bindings);
    await transport.snapshot();
    await transport.snapshot();

    const seen: unknown[] = [];
    transport.onNotify((n) => seen.push(n.value));
    bridge.fire("on-addr", 1);

    expect(seen).toEqual([true]);
  });

  it("hears nothing more from the unit once closed", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    const transport = new BridgeTransport(bridge, bindings);
    await transport.snapshot();

    const seen: unknown[] = [];
    transport.onNotify((n) => seen.push(n.value));
    bridge.fire("on-addr", 1);
    transport.close();
    bridge.fire("on-addr", 0);

    expect(seen, "the notify before close, and none after").toEqual([true]);
  });

  it("takes a change the unit announces while the snapshot is read", async () => {
    const bridge = fakeBridge();
    const link: DeviceLink = {
      ...bridge,
      get: (addr) => {
        // CH1 is turned on the unit after it was read, while CH2 is read.
        if (addr === "level2-addr") bridge.fire("level1-addr", 55);
        return bridge.get(addr);
      },
    };
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.level", { addr: "level1-addr", codec: identityCodec });
    bindings.bind("ch.ch2.level", { addr: "level2-addr", codec: identityCodec });
    const store = new DeviceStore();

    await store.attach(new BridgeTransport(link, bindings));

    expect(store.num("ch.ch1.level")).toBe(55);
  });

  it("stops following the unit when a snapshot that started following it cannot be read", async () => {
    const bridge = fakeBridge();
    const link: DeviceLink = { ...bridge, get: () => Promise.reject(new Error("read failed")) };
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    const transport = new BridgeTransport(link, bindings);
    const seen: unknown[] = [];
    transport.onNotify((n) => seen.push(n.value));

    await expect(transport.snapshot()).rejects.toThrow("read failed");
    bridge.fire("on-addr", 0);

    expect(seen).toEqual([]);
  });

  it("keeps following the unit when a later snapshot cannot be read", async () => {
    const bridge = fakeBridge();
    let reads = 0;
    const link: DeviceLink = {
      ...bridge,
      get: (addr) => (++reads > 1 ? Promise.reject(new Error("read failed")) : bridge.get(addr)),
    };
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    const transport = new BridgeTransport(link, bindings);
    await transport.snapshot();
    const seen: unknown[] = [];
    transport.onNotify((n) => seen.push(n.value));

    await expect(transport.snapshot()).rejects.toThrow("read failed");
    bridge.fire("on-addr", 0);

    expect(seen).toEqual([false]);
  });
});

describe("BindingTable", () => {
  it("looks a path up by address and back again", () => {
    const t = new BindingTable();
    t.bind("ch.ch1.pan", { addr: "pan-addr", codec: identityCodec });
    expect(t.pathForAddr("pan-addr")).toBe("ch.ch1.pan");
    expect(t.forPath("ch.ch1.pan")?.addr).toBe("pan-addr");
  });

  it("drops the old address when a path is re-bound", () => {
    const t = new BindingTable();
    t.bind("ch.ch1.pan", { addr: "pan-addr", codec: identityCodec });
    t.bind("ch.ch1.pan", { addr: "pan-addr-2", codec: identityCodec });
    expect(t.pathForAddr("pan-addr")).toBeUndefined();
    expect(t.size).toBe(1);
  });

  it("starts with nothing bound, so nothing is writable to hardware", () => {
    expect(new BindingTable().boundPaths()).toEqual([]);
  });

  it("binds a list of paths as binding each one would", () => {
    const t = new BindingTable();
    t.bindAll([
      ["ch.ch1.pan", { addr: "pan-addr", codec: identityCodec }],
      ["ch.ch1.on", { addr: "on-addr", codec: boolCodec }],
    ]);
    expect([t.boundPaths(), t.forPath("ch.ch1.pan")?.addr, t.pathForAddr("on-addr")]).toEqual([["ch.ch1.pan", "ch.ch1.on"], "pan-addr", "ch.ch1.on"]);
  });
});

describe("scaledCodec", () => {
  it("carries a fixed-point value to the wire and back", () => {
    const codec = scaledCodec(100);
    expect([codec.encode(-6.5), codec.encode(-6.504), codec.decode(-650), codec.decode(codec.encode(12.25))]).toEqual([-650, -650, -6.5, 12.25]);
  });
});
