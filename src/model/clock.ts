// The unit's clock.
//
// It keeps a moment in time that runs with the computer's own clock, moved by
// however far the DATE / TIME dialog last set it apart, and shows that moment
// in the time zone the unit is set to. The clock keeps running through a
// reload, and a settings file does not carry it.

import type { ParamPath } from "../device/path";
import type { DeviceStore } from "../device/store";
import { TIME_ZONE_SHIPPED, zoneOffsetMs } from "./time-zone";

/** How far the unit's clock stands from the computer's, in milliseconds. */
export const CLOCK_OFFSET: ParamPath = "setup.dateTime.offsetMs";

/** Where a state written while the clock stood still kept it, one part to a path. */
export const LEGACY_CLOCK = /^setup\.dateTime\.(year|month|day|hour|minute)$/;

/** Whether the value at this path is the clock itself rather than a setting. */
export function isClockPath(path: ParamPath): boolean {
  return path === CLOCK_OFFSET || LEGACY_CLOCK.test(path);
}

export interface ClockTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface ClockParts extends ClockTime {
  second: number;
}

/** How many days `month` of `year` has. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

const zoneOf = (store: DeviceStore): string => store.str("setup.dateTime.timeZone", TIME_ZONE_SHIPPED);

/** The unit's clock at `at`, as its time zone reads it. */
export function clockParts(store: DeviceStore, at = Date.now()): ClockParts {
  const instant = at + store.num(CLOCK_OFFSET, 0);
  const d = new Date(instant + zoneOffsetMs(zoneOf(store), instant));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/**
 * Set the clock to the start of the given minute of its time zone as of `at`. A
 * day past the end of its month is taken as that month's last day.
 */
export function setClock(store: DeviceStore, time: ClockTime, at = Date.now()): Promise<void> {
  const zone = zoneOf(store);
  const day = Math.min(time.day, daysInMonth(time.year, time.month));
  const wall = Date.UTC(time.year, time.month - 1, day, time.hour, time.minute, 0, 0);
  const guess = wall - zoneOffsetMs(zone, wall);
  const instant = wall - zoneOffsetMs(zone, guess);
  return store.set(CLOCK_OFFSET, instant - at);
}
