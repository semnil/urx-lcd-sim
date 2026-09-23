// Values written out as JSON text, and read back.
//
// JSON has no number for an infinite value and writes one as null. The SSMCS
// Ratio's last stop is one, so an infinite number is written as an object
// carrying its sign and read back as the number.

/** The key of the object an infinite number is written as; its value is the sign. */
const INFINITE = "infinite";

/** JSON text for `value`, its infinite numbers kept. */
export function toJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "number" && !Number.isFinite(v) && !Number.isNaN(v) ? { [INFINITE]: Math.sign(v) } : v,
  );
}

/** What `toJson` wrote. Text that is not JSON throws, as `JSON.parse` does. */
export function fromJson(text: string): unknown {
  return JSON.parse(text, (_key, v: unknown) => {
    if (typeof v !== "object" || v === null || Object.keys(v).length !== 1) return v;
    const sign = (v as Record<string, unknown>)[INFINITE];
    return sign === 1 || sign === -1 ? sign * Number.POSITIVE_INFINITY : v;
  });
}
