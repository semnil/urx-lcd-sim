// Per-model strip inventories.
//
// A URX44V and a URX44 carry twelve mono input channel instances, laid out as
// four mono strips (CH 1 - 4) and four stereo strips (CH 5/6 … CH 11/12); the
// URX22 has two mono channels fewer, so two mono strips and the same four
// stereo ones. The unit has eight outputs (STEREO, MIX 1-2, FX 1-2,
// STREAMING, MONITOR 1-2); the strips the HOME banks page through are FX 1
// and FX 2 on the input side and MIX 1, MIX 2, STEREO and STREAMING on the
// output side.
//
// Bank GROUPING is fixed groups of four (STRIPS_PER_BANK), which is what the
// guide states under "HOME screen (Overview) > Main area > Channel bank":
// "Four channels are shown at once in the main area. A group of channels shown
// at once is called a channel bank."
//
// On a URX44V the INPUT button steps CH 1 - 4 -> CH 5 - 12 -> FX 1 - 2, and a further
// step crosses to OUTPUT, which holds MIX / ST / STREAMING in a single bank.
// The strip lists below produce exactly that: the inputs fall into three banks
// and the outputs into one.
//
// The guide's "Channel view variations" figure shows a PAD strip alongside
// FX 1 and FX 2 in that third input bank. The unit's own third bank holds
// FX 1 and FX 2, so PAD is not a HOME strip here.

import type { Strip, UnitModel } from "./types";

/** Default channel colours, sampled from the user guide's HOME captures. */
/**
 * The colours a channel can be given, in the order the unit lists them. A
 * channel can also carry none, which leaves its rail and its mark unpainted.
 */
export const CH_COLOR_PALETTE = [
  { name: "Blue", hex: "#1965ff" },
  { name: "Orange", hex: "#ff8200" },
  { name: "Yellow", hex: "#e6e710" },
  { name: "Purple", hex: "#8c4ade" },
  { name: "Cyan", hex: "#29b5d6" },
  { name: "Magenta", hex: "#ff499c" },
  { name: "Red", hex: "#ce4529" },
  { name: "Green", hex: "#29c26b" },
  { name: "LtGreen", hex: "#8ce63a" },
  { name: "White", hex: "#e6e6e6" },
] as const;

/** What a channel carrying no colour is kept as. */
export const CH_COLOR_OFF = "Off";

/** The face the button that takes a colour away is drawn on, and its name. */
export const CH_COLOR_NONE = "#232326";

const CH_COLOR = {
  blue: "#1965ff",
  orange: "#ff8200",
  red: "#ce4529",
} as const;

/** The id of the mono channel numbered `n`. */
export const monoStripId = (n: number): string => `ch${n}`;

/** The input channel numbers a strip id names: one for a mono channel, two for a stereo one, none for any other strip. */
export function inputChannels(id: string): number[] {
  const mono = /^ch(\d+)$/.exec(id);
  if (mono) return [Number(mono[1])];
  const stereo = /^ch_(\d+)_(\d+)$/.exec(id);
  return stereo ? [Number(stereo[1]), Number(stereo[2])] : [];
}

function monoStrip(n: number, hiZ: boolean): Strip {
  return {
    id: monoStripId(n),
    label: `CH ${n}`,
    kind: "monoIn",
    side: "input",
    color: CH_COLOR.blue,
    channels: [n],
    ...(hiZ ? { hiZ: true } : {}),
  };
}

function stereoStrip(a: number): Strip {
  return {
    id: `ch_${a}_${a + 1}`,
    label: `CH ${a}/${a + 1}`,
    kind: "stIn",
    side: "input",
    color: CH_COLOR.blue,
    channels: [a, a + 1],
  };
}

function buildUnit(params: {
  id: UnitModel["id"];
  monoCount: number;
  stereoStart: number;
  stereoCount: number;
  /** Card slot: gates the microSD screen, not the strip list. */
  hasSD: boolean;
  hasHDMI: boolean;
  hasLineOut: boolean;
  hasDateTime: boolean;
  /** Mono channels whose connector takes a high-impedance source. */
  hiZChannels: number[];
}): UnitModel {
  const inputs: Strip[] = [];
  for (let n = 1; n <= params.monoCount; n++) inputs.push(monoStrip(n, params.hiZChannels.includes(n)));
  for (let k = 0; k < params.stereoCount; k++) inputs.push(stereoStrip(params.stereoStart + 2 * k));
  inputs.push({ id: "fx1", label: "FX1", kind: "fx", side: "input", color: CH_COLOR.blue, channels: [] });
  inputs.push({ id: "fx2", label: "FX2", kind: "fx", side: "input", color: CH_COLOR.blue, channels: [] });

  const outputs: Strip[] = [
    { id: "bus.mix1", label: "MIX 1", kind: "mix", side: "output", color: CH_COLOR.orange, channels: [] },
    { id: "bus.mix2", label: "MIX 2", kind: "mix", side: "output", color: CH_COLOR.orange, channels: [] },
    { id: "bus.stereo", label: "STEREO", kind: "stereo", side: "output", color: CH_COLOR.red, channels: [] },
    // The narrow chip on a dedicated channel screen holds about seven characters,
    // so the unit carries a short name for this one.
    { id: "bus.stream", label: "STREAMING", shortLabel: "STR", kind: "streaming", side: "output", color: CH_COLOR.orange, channels: [] },
  ];

  return {
    id: params.id,
    inputs,
    outputs,
    hasSD: params.hasSD,
    hasHDMI: params.hasHDMI,
    hasLineOut: params.hasLineOut,
    hasDateTime: params.hasDateTime,
    monitorBuses: 2,
  };
}

export const URX22: UnitModel = buildUnit({
  id: "URX22",
  monoCount: 2,
  stereoStart: 3,
  stereoCount: 4,
  hasSD: false,
  hasHDMI: false,
  hasLineOut: false,
  hasDateTime: false,
  hiZChannels: [2],
});

export const URX44: UnitModel = buildUnit({
  id: "URX44",
  monoCount: 4,
  stereoStart: 5,
  stereoCount: 4,
  hasSD: true,
  hasHDMI: false,
  hasLineOut: true,
  hasDateTime: true,
  hiZChannels: [3, 4],
});

export const URX44V: UnitModel = buildUnit({
  id: "URX44V",
  monoCount: 4,
  stereoStart: 5,
  stereoCount: 4,
  hasSD: true,
  hasHDMI: true,
  hasLineOut: true,
  hasDateTime: true,
  hiZChannels: [3, 4],
});

const UNITS = { URX22, URX44, URX44V } as const;

export function unitById(id: UnitModel["id"]): UnitModel {
  return UNITS[id];
}
