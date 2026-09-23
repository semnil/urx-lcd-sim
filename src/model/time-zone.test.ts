import { describe, expect, it } from "vitest";
import { TIME_ZONE_CITIES, TIME_ZONE_SHIPPED, zoneOffsetMs } from "./time-zone";

// The cities the [Time Zone] dialog lists, each with the time it keeps.

const HOUR = 3_600_000;

describe("the time zone cities", () => {
  it("lists the unit's cities in its own order", () => {
    expect(TIME_ZONE_CITIES.length).toBe(154);
    expect([TIME_ZONE_CITIES[0], TIME_ZONE_CITIES[139], TIME_ZONE_CITIES[140], TIME_ZONE_CITIES.at(-1)]).toEqual([
      "Abu Dhabi",
      "Tokyo",
      "Ulaan Bataar",
      "Zagreb",
    ]);
    expect(TIME_ZONE_SHIPPED).toBe("Tokyo");
  });

  it("keeps a time for every city", () => {
    const january = Date.UTC(2026, 0, 15);
    for (const city of TIME_ZONE_CITIES) {
      const offset = zoneOffsetMs(city, january);
      expect(Math.abs(offset) <= 14 * HOUR && offset % (15 * 60_000) === 0, `${city} at ${offset}`).toBe(true);
    }
    expect(zoneOffsetMs("Tokyo", january)).toBe(9 * HOUR);
    expect(zoneOffsetMs("Coordinated Universal Time", january)).toBe(0);
    expect(zoneOffsetMs("Kathmandu", january)).toBe(5.75 * HOUR);
    expect(zoneOffsetMs("Nowhere", january), "a name off the list reads as Tokyo").toBe(9 * HOUR);
  });

  it("keeps no summer time", () => {
    const july = Date.UTC(2026, 6, 15);
    expect(zoneOffsetMs("London", july), "London stays on UTC through the summer").toBe(0);
    expect(zoneOffsetMs("Pacific Time (US & Canada)", july)).toBe(-8 * HOUR);
    expect(zoneOffsetMs("Sydney", Date.UTC(2026, 0, 15)), "nor through the southern summer").toBe(10 * HOUR);
  });
});
