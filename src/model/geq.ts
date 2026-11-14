// Flex12GEQ (System firmware V1.5): the 31-band graphic EQ the stereo bus and the
// two MIX buses can run in place of their 4-band EQ, with at most twelve bands of
// a side away from 0 dB at once (user guide, "GEQ screen").
//
// Each side of a bus (L, R) holds its own [GEQ] switch, GEQ Limit and band gains;
// the bus holds the EQ Type and the GEQ Link. What the unit does to them on its own
// (confirmed on a URX44V):
//   - switching the EQ Type to Flex12GEQ turns the bus's EQ on, and on a MIX turns
//     the GEQ Link off; switching back to 4band PEQ changes nothing else;
//   - narrowing the GEQ Limit pulls every band of that side into the new range,
//     and widening it again does not restore them;
//   - while the GEQ Link is on, a band or a limit written on one side is written
//     on the other too;
//   - at 88.2 kHz the bus goes back to 4band PEQ with every band at 0 dB, and
//     stays there back at 48 kHz.

import type { ParamPath } from "../device/path";
import { biquadDb, peakingBiquad } from "./eq-response";
import type { Strip } from "./types";

/** The EQ Types, as the unit names them. */
export const EQ_TYPES = ["4band PEQ", "Flex12GEQ"] as const;
export type EqType = (typeof EQ_TYPES)[number];
export const EQ_TYPE_SHIPPED: EqType = "4band PEQ";

/** The GEQ Limits, as the unit names them, and the window each allows a band (dB). */
export const GEQ_LIMITS = ["±15dB", "±12dB", "±6dB", "-24dB"] as const;
export type GeqLimit = (typeof GEQ_LIMITS)[number];
export const GEQ_LIMIT_SHIPPED: GeqLimit = "±15dB";
const LIMIT_RANGE: Record<GeqLimit, readonly [number, number]> = {
  "±15dB": [-15, 15],
  "±12dB": [-12, 12],
  "±6dB": [-6, 6],
  "-24dB": [-24, 0],
};

/** The bands, 20 Hz to 20 kHz on the 1/3-octave series, as the unit's GEQ screen names them. */
export const GEQ_BANDS = [
  "20", "25", "31.5", "40", "50", "63", "80", "100", "125", "160", "200", "250", "315", "400", "500", "630",
  "800", "1k", "1.25k", "1.6k", "2k", "2.5k", "3.15k", "4k", "5k", "6.3k", "8k", "10k", "12.5k", "16k", "20k",
] as const;

/** Each band's centre, in Hz, in the order of GEQ_BANDS. */
export const GEQ_BAND_HZ = [
  20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
  800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
] as const;

/**
 * The Q each band is drawn with: a peaking biquad per band, the bands adding in
 * dB. Fitted to the response the guide's GEQ screen draws (p122-1), where it
 * lands half a pixel from the figure's curve on average.
 */
export const GEQ_BAND_Q = 3;

/** How many bands the GEQ screen's sliders show at once. */
export const GEQ_PAGE_SIZE = 4;

/** How many pages of sliders the bands fill: seven of four and a last one of three. */
export const GEQ_PAGES = Math.ceil(GEQ_BANDS.length / GEQ_PAGE_SIZE);

/** The bands a page of sliders shows, by their index in GEQ_BANDS. */
export function geqPageBands(page: number): number[] {
  const first = Math.min(GEQ_PAGES - 1, Math.max(0, Math.trunc(page))) * GEQ_PAGE_SIZE;
  return Array.from({ length: Math.min(GEQ_PAGE_SIZE, GEQ_BANDS.length - first) }, (_, i) => first + i);
}

/** How many bands of a side may be away from 0 dB at once. */
export const GEQ_MAX_ACTIVE = 12;

/** One step of a band's gain, in dB. */
export const GEQ_STEP_DB = 0.5;

/** The GEQ Link: off, or the side whose settings the other side takes. */
export const GEQ_LINKS = ["Off", "L>R", "R>L"] as const;
export type GeqLink = (typeof GEQ_LINKS)[number];

/** The highest sampling frequency a bus runs Flex12GEQ at. */
export const GEQ_MAX_RATE = 48000;

/** Whether the strip can run Flex12GEQ: the stereo bus and the MIX buses. */
export function carriesGeq(strip: Pick<Strip, "kind">): boolean {
  return strip.kind === "stereo" || strip.kind === "mix";
}

/** The GEQ Link a bus ships on: L>R on a MIX, off on the stereo bus. */
export function geqLinkShipped(strip: Pick<Strip, "kind">): GeqLink {
  return strip.kind === "mix" ? "L>R" : "Off";
}

/** The two sides of a bus, as their paths name them. */
export const GEQ_SIDES = ["l", "r"] as const;
export type GeqSide = (typeof GEQ_SIDES)[number];

export const eqTypePath = (base: string): ParamPath => `${base}.eqType`;
export const geqLinkPath = (base: string): ParamPath => `${base}.geq.link`;
export const geqOnPath = (base: string, side: GeqSide): ParamPath => `${base}.geq.${side}.on`;
export const geqLimitPath = (base: string, side: GeqSide): ParamPath => `${base}.geq.${side}.limit`;
export const geqBandPath = (base: string, side: GeqSide, band: number): ParamPath => `${base}.geq.${side}.band.${band}`;

/** The window a GEQ Limit allows a band; a value off the list reads as the shipped ±15dB. */
export function geqLimitRange(limit: string): readonly [number, number] {
  return LIMIT_RANGE[limit as GeqLimit] ?? LIMIT_RANGE[GEQ_LIMIT_SHIPPED];
}

/** A gain pulled into a limit's window and onto the 0.5 dB steps. */
export function geqClamp(db: number, limit: string): number {
  const [lo, hi] = geqLimitRange(limit);
  return Math.min(hi, Math.max(lo, Math.round(db / GEQ_STEP_DB) * GEQ_STEP_DB)) + 0;
}

/** Whether a sampling frequency leaves Flex12GEQ out of reach. */
export function geqOverRate(rate: number): boolean {
  return rate > GEQ_MAX_RATE;
}

/** How many of a side's bands stand away from 0 dB. */
export function geqActive(gains: readonly number[]): number {
  return gains.filter((db) => db !== 0).length;
}

/** The side's response in dB, as a function of frequency: each band a peaking biquad, the bands adding. */
export function geqResponse(gains: readonly number[]): (hz: number) => number {
  const parts = gains.flatMap((db, band) => {
    const hz = GEQ_BAND_HZ[band];
    if (db === 0 || hz === undefined) return [];
    const c = peakingBiquad(hz, GEQ_BAND_Q, db);
    return [(at: number) => biquadDb(c, at)];
  });
  return (hz) => parts.reduce((sum, p) => sum + p(hz), 0);
}
