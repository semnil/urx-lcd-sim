// The EQs a strip carries, read off the store: the 4-band EQ every strip has,
// and the 3-band EQ of the SSMCS strip and the bell its compressor listens
// through. The screens draw the EQs' responses and the synthetic signal takes
// their level through them.

import type { DeviceStore } from "../device/store";
import { EQ_BAND_SHAPE_SHIPPED, SSMCS_DEFAULTS } from "./defaults";
import { type EqBandResponse, biquadDb, eqResponse, peakingBiquad, shelfBiquad } from "./eq-response";
import type { StripKind } from "./types";

/** Whether the sampling frequency puts a strip's 4-band EQ out of use: a stereo channel's above 96 kHz. */
export function eqOutOfUse(kind: StripKind, rate: number): boolean {
  return kind === "stIn" && rate > 96000;
}

/** The 4-band EQ's bands, low to high. */
export const EQ_BAND_KEYS = ["low", "lowMid", "highMid", "high"] as const;

export type EqBandKey = (typeof EQ_BAND_KEYS)[number];

/** The filter shapes each EQ band can take: the outer bands a shelf and a pass filter besides the bell, the mid bands the bell alone. */
export const EQ_SHAPES: Record<EqBandKey, readonly string[]> = {
  low: ["Bell", "L.Shelf", "HPF"],
  lowMid: ["Bell"],
  highMid: ["Bell"],
  high: ["Bell", "H.Shelf", "LPF"],
};

/** The filter shape an EQ band holds, or its first shape where it holds one the band cannot take. */
export function eqBandShape(store: DeviceStore, base: string, key: EqBandKey): string {
  const shapes = EQ_SHAPES[key];
  const stored = store.str(`${base}.eq.${key}.shape`, EQ_BAND_SHAPE_SHIPPED[key] ?? "Bell");
  return shapes.includes(stored) ? stored : (shapes[0] ?? "Bell");
}

/** Whether an EQ band is on; the band box switches it, and a band switched off shapes no curve. */
export function eqBandOn(store: DeviceStore, base: string, key: string): boolean {
  return store.bool(`${base}.eq.${key}.on`, true);
}

/** The 4-band EQ's bands, low to high, as the strip under `base` holds them. */
export function fourBands(store: DeviceStore, base: string): EqBandResponse[] {
  return EQ_BAND_KEYS.map((key) => ({
    on: eqBandOn(store, base, key),
    shape: eqBandShape(store, base, key),
    freq: store.num(`${base}.eq.${key}.freq`, 1000),
    q: store.num(`${base}.eq.${key}.q`, 0.71),
    gain: store.num(`${base}.eq.${key}.gain`, 0),
  }));
}

/** The 4-band EQ's response in dB, as the strip under `base` holds it, whether or not the EQ is on. */
export function fourBandResponse(store: DeviceStore, base: string): (hz: number) => number {
  return eqResponse(fourBands(store, base));
}

/** The SSMCS strip's three bands, low to high: LOW and HIGH are shelves, MID a bell. */
export const SSMCS_BAND_KEYS = ["low", "mid", "high"] as const;

/** The bell the strip draws for its MID band stands wider than the number it is set by. */
export const SSMCS_BELL_Q_SCALE = 0.696;

/** One SSMCS band's own values. */
export interface SsmcsBand {
  on: boolean;
  q: number;
  freq: number;
  gain: number;
}

export function ssmcsBand(store: DeviceStore, b: string, key: (typeof SSMCS_BAND_KEYS)[number]): SsmcsBand {
  const p = `${b}.ssmcs.eq.${key}`;
  const factory = SSMCS_DEFAULTS.eq[key];
  return {
    on: store.bool(`${p}.on`, true),
    q: store.num(`${p}.q`, SSMCS_DEFAULTS.eq.mid.q),
    freq: store.num(`${p}.freq`, factory.freq),
    gain: store.num(`${p}.gain`, factory.gain),
  };
}

/** The SSMCS strip's three bands summed. A band that is off adds nothing. */
export function ssmcsEqResponse(store: DeviceStore, b: string): (hz: number) => number {
  const parts = SSMCS_BAND_KEYS.map((key) => {
    const s = ssmcsBand(store, b, key);
    if (!s.on || s.gain === 0) return null;
    const filter = key === "mid" ? peakingBiquad(s.freq, s.q * SSMCS_BELL_Q_SCALE, s.gain) : shelfBiquad(s.freq, s.gain, key === "high");
    return (hz: number) => biquadDb(filter, hz);
  });
  return (hz) => parts.reduce((sum, part) => sum + (part ? part(hz) : 0), 0);
}

/**
 * The side chain's bell stands wider than the Q it shows: its biquad Q is the Q
 * shown times this, times A to the power below, A being 10^(|gain| / 40).
 */
const SSMCS_SC_Q_SCALE = 0.238;
const SSMCS_SC_Q_GAIN_POWER = 0.39;

/** The SSMCS side chain's bell: its Q, Frequency and Gain. */
export type SsmcsSideChain = Omit<SsmcsBand, "on">;

/** The side chain's bell as the strip under `b` holds it. */
export function ssmcsSideChain(store: DeviceStore, b: string): SsmcsSideChain {
  const p = `${b}.ssmcs.sc`;
  const factory = SSMCS_DEFAULTS.sc;
  return { q: store.num(`${p}.q`, factory.q), freq: store.num(`${p}.freq`, factory.freq), gain: store.num(`${p}.gain`, factory.gain) };
}

/** The bell the SSMCS compressor listens through, in dB: a peak of its Gain at its Frequency, passing everything at no gain. */
export function ssmcsSideChainResponse(sc: SsmcsSideChain): (hz: number) => number {
  if (sc.gain === 0) return () => 0;
  const filter = peakingBiquad(sc.freq, sc.q * SSMCS_SC_Q_SCALE * 10 ** ((Math.abs(sc.gain) / 40) * SSMCS_SC_Q_GAIN_POWER), sc.gain);
  return (hz) => biquadDb(filter, hz);
}

/** The band pink noise is taken across, in Hz. */
const PINK_BAND: readonly [number, number] = [20, 20000];

/** How many points across the band the average is taken at, evenly spaced in log frequency. */
const PINK_POINTS = 97;

/**
 * What a response does to pink noise, in dB: its power gain averaged across the
 * band with every octave weighted alike.
 */
export function pinkGainDb(response: (hz: number) => number): number {
  const [lo, hi] = PINK_BAND;
  let sum = 0;
  for (let i = 0; i < PINK_POINTS; i++) sum += 10 ** (response(lo * (hi / lo) ** (i / (PINK_POINTS - 1))) / 10);
  return 10 * Math.log10(sum / PINK_POINTS);
}
