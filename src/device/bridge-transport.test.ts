import { describe, expect, it } from "vitest";
import { BindingTable, boolCodec, identityCodec, scaledCodec } from "./binding";
import { BridgeTransport, UnboundPathError, type DeviceLink } from "./bridge-transport";

/** A stand-in for the device link, recording what a real unit would receive. */
function fakeBridge(): DeviceLink & { writes: [string, number][]; fire: (addr: string, raw: number) => void } {
  const values = new Map<string, number>();
  const strings = new Map<string, string>();
  const writes: [string, number][] = [];
  let handler: ((addr: string, raw: number) => void) | null = null;
  return {
    writes,
    get: (addr) => Promise.resolve(values.get(addr) ?? 0),
    set: (addr, value) => {
      values.set(addr, value);
      writes.push([addr, value]);
      return Promise.resolve();
    },
    getStr: (addr) => Promise.resolve(strings.get(addr) ?? ""),
    setStr: (addr, value) => {
      strings.set(addr, value);
      return Promise.resolve();
    },
    subscribe: (_addrs, onUpdate) => {
      handler = onUpdate;
      return Promise.resolve(() => {
        handler = null;
      });
    },
    fire: (addr, raw) => handler?.(addr, raw),
  };
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

  it("reads every bound path into the snapshot", async () => {
    const bridge = fakeBridge();
    const bindings = new BindingTable();
    bindings.bind("ch.ch1.on", { addr: "on-addr", codec: boolCodec });
    bindings.bind("ch.ch1.name", { addr: "name-addr", codec: identityCodec, isString: true });
    const transport = new BridgeTransport(bridge, bindings);

    const snap = await transport.snapshot();

    expect([...snap.keys()].sort()).toEqual(["ch.ch1.name", "ch.ch1.on"]);
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
});
