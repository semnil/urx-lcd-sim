import { afterEach, describe, expect, it, vi } from "vitest";
import { DeviceStore } from "../device/store";
import { SimTransport } from "../device/sim-transport";
import { startDateTimeClock } from "../screens/date-time";
import { el } from "../ui/dom";
import { CLOCK_OFFSET, clockParts, setClock } from "./clock";
import { factoryState } from "./defaults";
import { TIME_ZONE_CITIES } from "./time-zone";
import { unitById } from "./units";

// The unit's clock runs with the computer's, moved by however far it was set apart.

async function unit(): Promise<DeviceStore> {
  const store = new DeviceStore();
  await store.attach(new SimTransport(factoryState(unitById("URX44V"))));
  return store;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the unit's clock", () => {
  it("reads the computer's clock in Tokyo on a unit as it ships", async () => {
    const store = await unit();
    const at = Date.UTC(2026, 8, 21, 11, 7, 42);
    expect(clockParts(store, at)).toEqual({ year: 2026, month: 9, day: 21, hour: 20, minute: 7, second: 42 });
  });

  it("reads the same moment in the time zone the unit is set to", async () => {
    const store = await unit();
    await store.set("setup.dateTime.timeZone", "London");
    expect(clockParts(store, Date.UTC(2026, 0, 15, 11, 7, 42))).toMatchObject({ day: 15, hour: 11, minute: 7 });
    // 21:15 in Tokyo reads 12:15 in London in September, as the unit reads it.
    await store.set("setup.dateTime.timeZone", "Tokyo");
    expect(clockParts(store, Date.UTC(2026, 8, 21, 12, 15))).toMatchObject({ hour: 21, minute: 15 });
    await store.set("setup.dateTime.timeZone", "London");
    expect(clockParts(store, Date.UTC(2026, 8, 21, 12, 15)), "nine hours behind, summer or not").toMatchObject({ hour: 12, minute: 15 });
    await store.set("setup.dateTime.timeZone", "New Delhi");
    expect(clockParts(store, Date.UTC(2026, 0, 15, 11, 7, 42)), "half an hour off the hour").toMatchObject({ hour: 16, minute: 37 });
  });

  it("is set in the time zone the unit is set to", async () => {
    const store = await unit();
    await store.set("setup.dateTime.timeZone", "London");
    await setClock(store, { year: 2026, month: 1, day: 15, hour: 9, minute: 0 }, 0);
    await store.set("setup.dateTime.timeZone", "Tokyo");
    expect(clockParts(store, 0), "9:00 in London is 18:00 in Tokyo").toMatchObject({ day: 15, hour: 18, minute: 0 });
  });

  it("is set to the start of a minute, and runs on from there", async () => {
    const store = await unit();
    const at = Date.UTC(2026, 8, 21, 11, 7, 42);
    await setClock(store, { year: 2030, month: 1, day: 2, hour: 3, minute: 4 }, at);
    expect(clockParts(store, at)).toEqual({ year: 2030, month: 1, day: 2, hour: 3, minute: 4, second: 0 });
    expect(clockParts(store, at + 90_000)).toEqual({ year: 2030, month: 1, day: 2, hour: 3, minute: 5, second: 30 });
  });

  it("keeps one time for a city in every year, as the unit does", async () => {
    const store = await unit();
    // Each is a time set in the DATE/TIME dialog, and the moment the unit took it for (URX44V, 2026-10-03).
    const seen = [
      ["Samoa", { year: 2011, month: 7, day: 1, hour: 12, minute: 0 }, Date.UTC(2011, 5, 30, 23, 0)],
      ["Samoa", { year: 2012, month: 7, day: 1, hour: 12, minute: 0 }, Date.UTC(2012, 5, 30, 23, 0)],
      ["Volgograd", { year: 2019, month: 7, day: 1, hour: 12, minute: 0 }, Date.UTC(2019, 6, 1, 9, 0)],
      ["Tokyo", { year: 2099, month: 12, day: 31, hour: 23, minute: 59 }, Date.UTC(2099, 11, 31, 14, 59)],
    ] as const;
    for (const [city, time, utc] of seen) {
      await store.set("setup.dateTime.timeZone", city);
      await setClock(store, time, 0);
      expect(new Date(store.num(CLOCK_OFFSET, 0)).toISOString(), `${city} ${time.year}`).toBe(new Date(utc).toISOString());
    }
  });

  it("reads back the first and the last minute of every year from 2000 to 2099 it is set to, in every city", async () => {
    const store = await unit();
    const missed: string[] = [];
    for (const city of TIME_ZONE_CITIES) {
      await store.set("setup.dateTime.timeZone", city);
      for (let year = 2000; year <= 2099; year++) {
        for (const time of [
          { year, month: 1, day: 1, hour: 0, minute: 0 },
          { year, month: 12, day: 31, hour: 23, minute: 59 },
        ]) {
          await setClock(store, time, 0);
          const read = clockParts(store, 0);
          if (read.year !== year || read.month !== time.month || read.day !== time.day || read.hour !== time.hour || read.minute !== time.minute) {
            missed.push(`${city} ${year}-${time.month}-${time.day} ${time.hour}:${time.minute}`);
          }
        }
      }
    }
    expect(missed).toEqual([]);
  });

  it("runs on a minute a minute across the turn of every year, in every city", async () => {
    const store = await unit();
    const jumps: string[] = [];
    for (const city of TIME_ZONE_CITIES) {
      await store.set("setup.dateTime.timeZone", city);
      for (let year = 2001; year <= 2099; year++) {
        const before = clockParts(store, Date.UTC(year, 0, 1) - 60_000);
        const after = clockParts(store, Date.UTC(year, 0, 1));
        const minutes = (p: typeof before): number => Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) / 60_000;
        if (minutes(after) - minutes(before) !== 1) jumps.push(`${city} ${year}`);
      }
    }
    expect(jumps).toEqual([]);
  });

  it("takes a day past the end of its month as the month's last day", async () => {
    const store = await unit();
    await setClock(store, { year: 2026, month: 2, day: 31, hour: 12, minute: 0 }, 0);
    expect(clockParts(store, 0)).toMatchObject({ month: 2, day: 28 });
    await setClock(store, { year: 2028, month: 2, day: 31, hour: 12, minute: 0 }, 0);
    expect(clockParts(store, 0), "a leap year's February").toMatchObject({ month: 2, day: 29 });
  });

  it("moves the [Date/Time] reading on while the screen stands", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(Date.UTC(2026, 8, 21, 0, 59, 30));
    const store = await unit();
    const root = el("div", {
      children: [el("span", { attrs: { "data-clock": "date" } }), el("span", { attrs: { "data-clock": "time" } })],
    });
    const stop = startDateTimeClock(store, root);
    vi.advanceTimersByTime(1_000);
    expect(root.querySelector('[data-clock="time"]')?.textContent).toBe("09 : 59");
    vi.advanceTimersByTime(30_000);
    expect([root.querySelector('[data-clock="date"]')?.textContent, root.querySelector('[data-clock="time"]')?.textContent]).toEqual([
      "09 / 21 / 2026",
      "10 : 00",
    ]);
    stop();
  });
});
