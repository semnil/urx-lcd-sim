// How a position places a signal across the two sides (user guide, "PAN" and
// "BALANCE" under the channel view).
//
// One law serves every position on the unit: a mono channel's PAN into the
// stereo bus, a send's own position into a MIX bus, and every BALANCE, which
// sets each side's level on its own side and sends nothing across. The table
// is the unit's own, read at every step on a URX44V, and the two sides mirror
// each other.

/** What the side a position leans to gains, in dB, by how far it leans (0 = centre, 63 = the end). */
const TOWARD_DB: readonly number[] = [
  0, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 0.75, 0.75, 1, 1, 1, 1, 1, 1.25, 1.25, 1.25, 1.25,
  1.25, 1.25, 1.5, 1.5, 1.5, 1.5, 1.5, 1.75, 1.75, 1.75, 1.75, 1.75, 2, 2, 2, 2, 2, 2.25, 2.25, 2.25, 2.25, 2.25, 2.5, 2.5, 2.5, 2.5, 2.5,
  2.5, 2.75, 2.75, 2.75, 2.75, 2.75, 3, 3, 3, 3, 3,
];

/** What the side a position leans away from gains, in dB, by how far it leans. At the end that side carries nothing. */
const AWAY_DB: readonly number[] = [
  0, 0, -0.25, -0.25, -0.5, -0.75, -0.75, -1, -1, -1.25, -1.5, -1.5, -1.75, -2, -2, -2.25, -2.5, -2.75, -2.75, -3, -3.25, -3.5, -3.75,
  -3.75, -4, -4.25, -4.5, -4.75, -5, -5.25, -5.5, -5.75, -6, -6.25, -6.75, -7, -7.25, -7.5, -8, -8.25, -8.75, -9, -9.5, -9.75, -10.25,
  -10.75, -11.25, -11.75, -12.5, -13, -13.75, -14.25, -15, -16, -16.75, -17.75, -19, -20.25, -22, -23.75, -26.25, -30, -36,
  Number.NEGATIVE_INFINITY,
];

/** The furthest a position goes either way. */
const PAN_END = 63;

/**
 * What a position of `value` (-63 = L63 .. 0 = centre .. +63 = R63) gains on the
 * left side and on the right, in dB.
 */
export function panLawDb(value: number): [number, number] {
  const lean = Math.min(PAN_END, Math.round(Math.abs(value)));
  const toward = TOWARD_DB[lean] ?? 0;
  const away = AWAY_DB[lean] ?? 0;
  return value < 0 ? [toward, away] : [away, toward];
}
