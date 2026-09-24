// The 4-band EQ's frequency response, the curve the EQ screen draws, and the
// biquad filters it is made of, which the SSMCS strip's EQ draws with too.
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

/** A biquad's coefficients. */
export interface Biquad {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

/** A biquad's level at `hz`, in dB. */
export function biquadDb(c: Biquad, hz: number): number {
  const w = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const [cos1, sin1, cos2, sin2] = [Math.cos(w), Math.sin(w), Math.cos(2 * w), Math.sin(2 * w)];
  const zeroReal = c.b0 + c.b1 * cos1 + c.b2 * cos2;
  const zeroImag = -(c.b1 * sin1 + c.b2 * sin2);
  const poleReal = c.a0 + c.a1 * cos1 + c.a2 * cos2;
  const poleImag = -(c.a1 * sin1 + c.a2 * sin2);
  const zeros = zeroReal * zeroReal + zeroImag * zeroImag;
  const poles = poleReal * poleReal + poleImag * poleImag;
  return poles === 0 || zeros === 0 ? 0 : 10 * Math.log10(zeros / poles);
}

/** A peaking filter at `hz` with the biquad Q `q`. */
export function peakingBiquad(hz: number, q: number, gain: number): Biquad {
  const a = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cos0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  return { b0: 1 + alpha * a, b1: -2 * cos0, b2: 1 - alpha * a, a0: 1 + alpha / a, a1: -2 * cos0, a2: 1 - alpha / a };
}

function passBiquad(hz: number, highPass: boolean): Biquad {
  const w0 = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cos0 = Math.cos(w0);
  const alpha = Math.sin(w0) / Math.SQRT2;
  const poles = { a0: 1 + alpha, a1: -2 * cos0, a2: 1 - alpha };
  return highPass
    ? { b0: (1 + cos0) / 2, b1: -(1 + cos0), b2: (1 + cos0) / 2, ...poles }
    : { b0: (1 - cos0) / 2, b1: 1 - cos0, b2: (1 - cos0) / 2, ...poles };
}

/** A shelf of slope 1 designed at `hz`. */
export function shelfBiquad(hz: number, gain: number, high: boolean): Biquad {
  const a = 10 ** (gain / 40);
  const w0 = (2 * Math.PI * hz) / EQ_RESPONSE_RATE;
  const cos0 = Math.cos(w0);
  const rootTerm = 2 * Math.sqrt(a) * (Math.sin(w0) / Math.SQRT2);
  if (high) {
    return {
      b0: a * (a + 1 + (a - 1) * cos0 + rootTerm),
      b1: -2 * a * (a - 1 + (a + 1) * cos0),
      b2: a * (a + 1 + (a - 1) * cos0 - rootTerm),
      a0: a + 1 - (a - 1) * cos0 + rootTerm,
      a1: 2 * (a - 1 - (a + 1) * cos0),
      a2: a + 1 - (a - 1) * cos0 - rootTerm,
    };
  }
  return {
    b0: a * (a + 1 - (a - 1) * cos0 + rootTerm),
    b1: 2 * a * (a - 1 - (a + 1) * cos0),
    b2: a * (a + 1 - (a - 1) * cos0 - rootTerm),
    a0: a + 1 + (a - 1) * cos0 + rootTerm,
    a1: -2 * (a - 1 + (a + 1) * cos0),
    a2: a + 1 + (a - 1) * cos0 - rootTerm,
  };
}

/**
 * The frequency a shelf is designed at so that it stands |gain| - 3 dB at
 * `nominal`: never inside it (below it for a high shelf, above it for a low one).
 */
export function shelfDesignFreq(nominal: number, gain: number, high: boolean): number {
  const target = Math.abs(gain) - 3;
  if (target <= 0) return nominal;
  const at = (f: number): number => Math.abs(biquadDb(shelfBiquad(f, gain, high), nominal));
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
    const c = passBiquad(b.freq, b.shape === "HPF");
    return (hz) => biquadDb(c, hz);
  }
  if (b.gain === 0) return () => 0;
  if (b.shape === "L.Shelf" || b.shape === "H.Shelf") {
    const high = b.shape === "H.Shelf";
    const c = shelfBiquad(shelfDesignFreq(b.freq, b.gain, high), b.gain, high);
    return (hz) => biquadDb(c, hz);
  }
  const c = peakingBiquad(b.freq, b.q / 2, b.gain);
  return (hz) => biquadDb(c, hz);
}

/** The four bands' response in dB: the sum of each band's. */
export function eqResponse(bands: readonly EqBandResponse[]): (hz: number) => number {
  const parts = bands.map(bandResponse);
  return (hz) => parts.reduce((sum, p) => sum + p(hz), 0);
}
