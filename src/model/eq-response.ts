// The 4-band EQ's frequency response, the curve the EQ screen draws.
//
// Each band is a biquad at 48 kHz and the bands add in dB. A Bell is a peaking
// filter whose biquad Q is half the Q the screen shows. HPF and LPF are fixed
// second-order Butterworth filters, 3 dB down at their frequency, and read no Q
// and no gain. L.Shelf and H.Shelf are shelves of slope 1 whose frequency is the
// point 3 dB short of the plateau, and read no Q.

/** The rate the response is drawn at. */
export const EQ_RESPONSE_RATE = 48000;

/** One band as the response reads it: frequency in Hz, gain in dB, Q as the screen shows it. */
export interface EqBandResponse {
  on: boolean;
  shape: string;
  freq: number;
  q: number;
  gain: number;
}

interface Coefs {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

/** A biquad's magnitude at `hz`, in dB. */
function magDb(c: Coefs, hz: number): number {
  const w = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cw = Math.cos(w);
  const sw = Math.sin(w);
  const c2 = Math.cos(2 * w);
  const s2 = Math.sin(2 * w);
  const nRe = c.b0 + c.b1 * cw + c.b2 * c2;
  const nIm = -(c.b1 * sw + c.b2 * s2);
  const dRe = c.a0 + c.a1 * cw + c.a2 * c2;
  const dIm = -(c.a1 * sw + c.a2 * s2);
  const num = nRe * nRe + nIm * nIm;
  const den = dRe * dRe + dIm * dIm;
  if (num === 0 || den === 0) return 0;
  return 10 * Math.log10(num / den);
}

function bellCoefs(hz: number, q: number, gain: number): Coefs {
  const a = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * (q / 2));
  return { b0: 1 + alpha * a, b1: -2 * cw, b2: 1 - alpha * a, a0: 1 + alpha / a, a1: -2 * cw, a2: 1 - alpha / a };
}

function passCoefs(hz: number, highPass: boolean): Coefs {
  const w0 = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cw = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const den = { a0: 1 + alpha, a1: -2 * cw, a2: 1 - alpha };
  return highPass
    ? { b0: (1 + cw) / 2, b1: -(1 + cw), b2: (1 + cw) / 2, ...den }
    : { b0: (1 - cw) / 2, b1: 1 - cw, b2: (1 - cw) / 2, ...den };
}

function shelfCoefs(hz: number, gain: number, high: boolean): Coefs {
  const a = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cw = Math.cos(w0);
  const tsa = 2 * Math.sqrt(a) * (Math.sin(w0) / Math.SQRT2);
  if (high) {
    return {
      b0: a * (a + 1 + (a - 1) * cw + tsa),
      b1: -2 * a * (a - 1 + (a + 1) * cw),
      b2: a * (a + 1 + (a - 1) * cw - tsa),
      a0: a + 1 - (a - 1) * cw + tsa,
      a1: 2 * (a - 1 - (a + 1) * cw),
      a2: a + 1 - (a - 1) * cw - tsa,
    };
  }
  return {
    b0: a * (a + 1 - (a - 1) * cw + tsa),
    b1: 2 * a * (a - 1 - (a + 1) * cw),
    b2: a * (a + 1 - (a - 1) * cw - tsa),
    a0: a + 1 + (a - 1) * cw + tsa,
    a1: -2 * (a - 1 + (a + 1) * cw),
    a2: a + 1 + (a - 1) * cw - tsa,
  };
}

/**
 * The frequency a shelf is designed at so that it stands |gain| - 3 dB at
 * `nominal`: never inside it (below it for a high shelf, above it for a low one).
 */
export function shelfDesignFreq(nominal: number, gain: number, high: boolean): number {
  const target = Math.abs(gain) - 3;
  if (target <= 0) return nominal;
  const at = (f: number): number => Math.abs(magDb(shelfCoefs(f, gain, high), nominal));
  let lo = nominal / 20;
  let hi = Math.min(nominal * 20, EQ_RESPONSE_RATE / 2 - 1);
  const rising = at(hi) > at(lo);
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (rising ? at(mid) < target : at(mid) > target) lo = mid;
    else hi = mid;
  }
  const solved = Math.sqrt(lo * hi);
  return high ? Math.min(solved, nominal) : Math.max(solved, nominal);
}

/** One band's response in dB, as a function of frequency. A band switched off adds nothing. */
export function bandResponse(b: EqBandResponse): (hz: number) => number {
  if (!b.on) return () => 0;
  if (b.shape === "HPF" || b.shape === "LPF") {
    const c = passCoefs(b.freq, b.shape === "HPF");
    return (hz) => magDb(c, hz);
  }
  if (b.gain === 0) return () => 0;
  if (b.shape === "L.Shelf" || b.shape === "H.Shelf") {
    const high = b.shape === "H.Shelf";
    const c = shelfCoefs(shelfDesignFreq(b.freq, b.gain, high), b.gain, high);
    return (hz) => magDb(c, hz);
  }
  const c = bellCoefs(b.freq, b.q, b.gain);
  return (hz) => magDb(c, hz);
}

/** The four bands' response in dB: the sum of each band's. */
export function eqResponse(bands: readonly EqBandResponse[]): (hz: number) => number {
  const parts = bands.map(bandResponse);
  return (hz) => parts.reduce((sum, p) => sum + p(hz), 0);
}
