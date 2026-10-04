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
    for (const city of TIME_ZONE_CITIES) {
      const offset = zoneOffsetMs(city);
      expect(Math.abs(offset) <= 14 * HOUR && offset % (15 * 60_000) === 0, `${city} at ${offset}`).toBe(true);
    }
    expect(zoneOffsetMs("Tokyo")).toBe(9 * HOUR);
    expect(zoneOffsetMs("Coordinated Universal Time")).toBe(0);
    expect(zoneOffsetMs("Kathmandu")).toBe(5.75 * HOUR);
    expect(zoneOffsetMs("Nowhere"), "a name off the list reads as Tokyo").toBe(9 * HOUR);
  });

  it("keeps no summer time", () => {
    expect(zoneOffsetMs("London"), "London stays on UTC through the summer").toBe(0);
    expect(zoneOffsetMs("Pacific Time (US & Canada)")).toBe(-8 * HOUR);
    expect(zoneOffsetMs("Sydney"), "nor through the southern summer").toBe(10 * HOUR);
  });

  it("keeps Casablanca an hour ahead of UTC", () => {
    expect(zoneOffsetMs("Casablanca")).toBe(HOUR);
  });
});
