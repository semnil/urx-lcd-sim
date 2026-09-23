// The unit's shape: which strips exist, what kind each one is, and what the
// screens are allowed to show for it. Immutable per hardware model — the
// operator's editable values live in the DeviceStore, never here.

export type ModelId = "URX22" | "URX44" | "URX44V";

/**
 * Strip kinds, in the sense the guide's "Channel view variations" uses: each
 * one draws a different set of indicator blocks in the channel area.
 */
export type StripKind =
  | "monoIn" // GATE / COMP / EQ / SSMCS / INS FX, PAN
  | "stIn" // EQ / DUCKER, BALANCE
  | "fx" // FX return
  | "stereo" // STEREO (MAIN) out
  | "mix" // MIX bus out
  | "streaming"; // STREAMING out (carries DELAY)

export type StripSide = "input" | "output";

export interface Strip {
  /** Store key and screen id fragment, e.g. "ch1", "ch_5_6", "bus.stereo". */
  id: string;
  /** Top line of the channel name area, e.g. "CH 1", "CH 5/6", "STEREO". */
  label: string;
  /** What the narrow channel chip carries instead, for a name too long for it. */
  shortLabel?: string;
  kind: StripKind;
  side: StripSide;
  /** Rail colour along the bottom of the strip, per the unit's channel colours. */
  color: string;
  /** Underlying mono channel numbers this strip owns (1-based, device order). */
  channels: number[];
  /** Whether the connector this strip is on can be switched to high impedance. */
  hiZ?: boolean;
}

export interface UnitModel {
  id: ModelId;
  /** Strips the HOME (Overview) INPUT banks page through, in device order. */
  inputs: Strip[];
  /** Strips the HOME (Overview) OUTPUT banks page through, in device order. */
  outputs: Strip[];
  hasSD: boolean;
  hasHDMI: boolean;
  hasLineOut: boolean;
  /** Date/Time menu is absent on the URX22 (user guide, SETUP > Top menu). */
  hasDateTime: boolean;
  monitorBuses: number;
}

/** How many strips one HOME bank shows at once (user guide, "Channel bank"). */
export const STRIPS_PER_BANK = 4;

export function bankCount(strips: readonly Strip[]): number {
  return Math.max(1, Math.ceil(strips.length / STRIPS_PER_BANK));
}

export function bankStrips(strips: readonly Strip[], bank: number): Strip[] {
  const start = bank * STRIPS_PER_BANK;
  return strips.slice(start, start + STRIPS_PER_BANK);
}

export function findStrip(model: UnitModel, id: string): Strip | undefined {
  return model.inputs.find((s) => s.id === id) ?? model.outputs.find((s) => s.id === id);
}

/**
 * The input channel pairs a record track can be fed from, in device order.
 *
 * The recorder names a pair `CH 1/2` whatever the strips are called: a URX44V
 * carries CH 1 - 4 as mono strips and CH 5/6 upward as stereo ones, and both kinds
 * fold into the same two-channel pair here.
 */
export function channelPairs(model: UnitModel): string[] {
  const channels = model.inputs.filter((s) => s.kind === "monoIn" || s.kind === "stIn").flatMap((s) => s.channels);
  const pairs: string[] = [];
  for (let i = 0; i + 1 < channels.length; i += 2) pairs.push(`CH ${channels[i]}/${channels[i + 1]}`);
  return pairs;
}

/** Every strip on the unit, inputs before outputs. */
export function allStrips(model: UnitModel): Strip[] {
  return [...model.inputs, ...model.outputs];
}

/**
 * Whether `from` has a send to `to` (user guide, "SEND TO screen", the table
 * under the side menu's send switch buttons). A channel reaches the stereo
 * bus, both MIX buses and both FX returns; an FX return reaches the stereo bus
 * and both MIX buses; a MIX bus reaches the stereo bus; the streaming bus
 * sends nowhere.
 */
export function sendsTo(from: Strip, to: Strip): boolean {
  if (from.id === to.id || from.kind === "streaming") return false;
  if (from.kind === "monoIn" || from.kind === "stIn") return true;
  if (from.kind === "fx") return to.kind === "stereo" || to.kind === "mix";
  return to.kind === "stereo";
}
