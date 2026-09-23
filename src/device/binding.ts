// Path → device address binding.
//
// A semantic path ("ch.1.level") means nothing to a URX unit; the unit answers
// to an address of its own and to a value encoding per parameter. That mapping
// is hardware knowledge, not simulator knowledge,
// and only addresses confirmed against a real unit may be written — a guessed
// address is a write to an unknown parameter.
//
// So the table below starts EMPTY and is filled at startup by whoever supplies
// the validated catalog. An unbound path is not writable to hardware:
// BridgeTransport refuses it rather than guessing. Nothing here fabricates an
// id.

import type { ParamPath, ParamValue } from "./path";

/** How a decoded value is carried on the wire, mirroring the unit's encodings. */
export interface Codec {
  /** Semantic value → the integer the device stores. */
  encode(value: ParamValue): number;
  /** The integer the device reports → semantic value. */
  decode(raw: number): ParamValue;
}

export interface Binding {
  /** The address the unit answers to, supplied by the validated catalog. */
  addr: string;
  codec: Codec;
  /** A string parameter (channel name, scene title) uses the str verbs. */
  isString?: boolean;
}

export class BindingTable {
  private readonly byPath = new Map<ParamPath, Binding>();
  private readonly byAddr = new Map<string, ParamPath>();

  /** Register one binding. Re-registering a path replaces it. */
  bind(path: ParamPath, binding: Binding): void {
    const existing = this.byPath.get(path);
    if (existing) this.byAddr.delete(existing.addr);
    this.byPath.set(path, binding);
    this.byAddr.set(binding.addr, path);
  }

  bindAll(entries: Iterable<[ParamPath, Binding]>): void {
    for (const [p, b] of entries) this.bind(p, b);
  }

  forPath(path: ParamPath): Binding | undefined {
    return this.byPath.get(path);
  }

  /** Reverse lookup, for turning a device notify back into a path. */
  pathForAddr(addr: string): ParamPath | undefined {
    return this.byAddr.get(addr);
  }

  /** Every bound path — the exact set a bridge can read, write and follow. */
  boundPaths(): ParamPath[] {
    return [...this.byPath.keys()];
  }

  get size(): number {
    return this.byPath.size;
  }
}

/** Values that are already integers on the wire (enum index, on/off as 0/1). */
export const identityCodec: Codec = {
  encode: (v) => (typeof v === "boolean" ? (v ? 1 : 0) : Number(v)),
  decode: (raw) => raw,
};

/** A fixed-point codec: the device stores `value * scale` as an integer. */
export function scaledCodec(scale: number): Codec {
  return {
    encode: (v) => Math.round(Number(v) * scale),
    decode: (raw) => raw / scale,
  };
}

export const boolCodec: Codec = {
  encode: (v) => (v ? 1 : 0),
  decode: (raw) => raw !== 0,
};
