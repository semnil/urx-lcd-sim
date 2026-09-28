// The synthetic signal the meters read, as a sum of the signals that make it up.
//
// A lane of a bus or a channel carries parts, each one signal at its own level:
// an input source's side, the oscillator, an FX channel's return. Parts of the
// same signal add as amplitudes, so a signal reaching a bus twice reads 6 dB
// higher and one of the two inverted cancels the other. Parts of different
// signals add as powers, but for a steady tone, whose peaks line up with every
// other part's and so add as amplitudes. The meters read a lane's peak.

/** A lane reading nothing. */
export const SILENT_DB = -96;

/** One signal in a lane. */
export interface Part {
  /** Which signal it is: parts sharing a key add as amplitudes. */
  key: string;
  /** Its peak as a linear amplitude, negative where it is inverted. */
  amp: number;
  /** Whether it is a steady tone rather than a noise-like signal. */
  tone: boolean;
  /** A steady tone's frequency in Hz, where it is one frequency. */
  hz?: number;
}

/** What one lane carries. */
export type Lane = readonly Part[];

export const dbToAmp = (db: number): number => (db === Number.NEGATIVE_INFINITY ? 0 : 10 ** (db / 20));

/** Parts quieter than this are dropped: no meter reads them. */
const FLOOR_AMP = dbToAmp(-160);

/** One signal at `db` on its own; a steady tone of one frequency carries it in `hz`. */
export function part(key: string, db: number, tone = false, hz?: number): Lane {
  const amp = dbToAmp(db);
  return amp > FLOOR_AMP ? [{ key, amp, tone, ...(hz === undefined ? {} : { hz }) }] : [];
}

/** `lane` taken up (or down) by `db`. */
export function gain(lane: Lane, db: number): Lane {
  if (db === 0) return lane;
  const k = dbToAmp(db);
  return lane.filter((p) => Math.abs(p.amp * k) > FLOOR_AMP).map((p) => ({ ...p, amp: p.amp * k }));
}

/**
 * `lane` through a filter: a tone of one frequency by the filter's `response`
 * at that frequency, every other part by `db`, what the filter does to pink noise.
 */
export function filtered(lane: Lane, db: number, response: () => (hz: number) => number): Lane {
  if (!lane.some((p) => p.hz !== undefined)) return gain(lane, db);
  const at = response();
  return lane.flatMap((p) => gain([p], p.hz === undefined ? db : at(p.hz)));
}

/** `lane` with every part inverted. */
export function invert(lane: Lane): Lane {
  return lane.map((p) => ({ ...p, amp: -p.amp }));
}

/** Lanes summed into one, parts of the same signal merged into one part. */
export function mix(...lanes: Lane[]): Lane {
  const merged = new Map<string, Part>();
  for (const lane of lanes) {
    for (const p of lane) {
      const had = merged.get(p.key);
      merged.set(p.key, had ? { ...had, amp: had.amp + p.amp } : p);
    }
  }
  return [...merged.values()].filter((p) => Math.abs(p.amp) > FLOOR_AMP);
}

/** A lane's peak in dB, and SILENT_DB where it carries nothing. */
export function levelDb(lane: Lane): number {
  let tones = 0;
  let power = 0;
  for (const p of mix(lane)) {
    if (p.tone) tones += Math.abs(p.amp);
    else power += p.amp * p.amp;
  }
  const peak = tones + Math.sqrt(power);
  // Rounded to a billionth of a dB, so a level taken to amplitude and back reads what it was.
  return peak > 0 ? Math.max(SILENT_DB, Math.round(20 * Math.log10(peak) * 1e9) / 1e9) : SILENT_DB;
}

/** Whether `lane`'s peak is more steady tone than noise-like signal. */
export function mostlyTone(lane: Lane): boolean {
  let tones = 0;
  let power = 0;
  for (const p of mix(lane)) {
    if (p.tone) tones += Math.abs(p.amp);
    else power += p.amp * p.amp;
  }
  return tones > Math.sqrt(power);
}

/**
 * The level a detector hears on `lane`: each part moved by what the detector
 * hears a tone or a noise-like signal off the meter's reading, then summed.
 */
export function heardDb(lane: Lane, offset: { tone: number; noise: number }): number {
  return levelDb(lane.map((p) => ({ ...p, amp: p.amp * dbToAmp(p.tone ? offset.tone : offset.noise) })));
}
