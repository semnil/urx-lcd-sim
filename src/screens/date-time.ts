// The two popups the DATE / TIME screen's top pair of buttons drop (user guide,
// "Date/Time menu"): "Set the date and time on the screen that appears. Touch
// the item you want to change and operate the [TOUCH AND TURN] knob. When
// you've finished making the settings, touch the [OK] button to apply the
// settings and close the popup window. To close the popup window without
// applying the settings, touch the [Cancel] button." and "Selects the name of
// the city representing the time zone on the screen that's shown."

import type { AppContext } from "../app/context";
import type { DeviceStore, WriteRule } from "../device/store";
import { clockParts, daysInMonth, setClock, type ClockTime } from "../model/clock";
import { TIME_ZONE_CITIES, TIME_ZONE_SHIPPED } from "../model/time-zone";
import { el } from "../ui/dom";
import { intSpec } from "../ui/param-spec";
import { pickColumn, pickDialog, valueBox } from "../ui/widgets";
import type { ScreenBody, ScreenDef } from "./types";

/** The parts of the clock the popup sets one at a time. */
const FIELDS = [
  { key: "year", label: "Year", min: 2000, max: 2099, fallback: 2020, width: 4 },
  { key: "month", label: "Month", min: 1, max: 12, fallback: 1, width: 2 },
  { key: "day", label: "Day", min: 1, max: 31, fallback: 1, width: 2 },
  { key: "hour", label: "Hour", min: 0, max: 23, fallback: 9, width: 2 },
  { key: "minute", label: "Min", min: 0, max: 59, fallback: 0, width: 2 },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

/** Where the popup edits, so [Cancel] can leave the clock as it was. */
const DRAFT = "ui.dateTimeDraft";

const pad = (value: number, width: number): string => String(value).padStart(width, "0");

/** One part of the time the popup holds until [OK]. */
function draft(ctx: AppContext, key: FieldKey): number {
  const field = FIELDS.find((f) => f.key === key);
  return ctx.store.num(`${DRAFT}.${key}`, field?.fallback ?? 0);
}

/** The date, in the order the screen's Display Format is set to. */
function dateText(store: DeviceStore, time: ClockTime): string {
  const y = pad(time.year, 4);
  const m = pad(time.month, 2);
  const d = pad(time.day, 2);
  const format = store.str("setup.dateTime.dateFormat", "MM/DD/YYYY");
  if (format === "DD/MM/YYYY") return `${d} / ${m} / ${y}`;
  if (format === "YYYY/MM/DD") return `${y} / ${m} / ${d}`;
  return `${m} / ${d} / ${y}`;
}

/** The time, on the 24- or 12-hour clock the screen is set to. */
function timeText(store: DeviceStore, time: ClockTime): string {
  const h = time.hour;
  const m = pad(time.minute, 2);
  if (store.str("setup.dateTime.timeFormat", "24h") === "12h") {
    const hour = h % 12 === 0 ? 12 : h % 12;
    return `${pad(hour, 2)} : ${m} ${h < 12 ? "AM" : "PM"}`;
  }
  return `${pad(h, 2)} : ${m}`;
}

/**
 * What the [Date/Time] button reads: the date at one end, the time at the other,
 * each marked so the clock ticker can move it on without a repaint.
 */
export function dateTimeSpans(ctx: AppContext): HTMLElement[] {
  const now = clockParts(ctx.store);
  return [
    el("span", { text: dateText(ctx.store, now), attrs: { "data-clock": "date" } }),
    el("span", { text: timeText(ctx.store, now), attrs: { "data-clock": "time" } }),
  ];
}

/** Move the [Date/Time] button's reading on to the clock as it stands. */
export function refreshDateTime(store: DeviceStore, root: ParentNode, at = Date.now()): void {
  const now = clockParts(store, at);
  const write = (selector: string, text: string): void => {
    for (const node of root.querySelectorAll<HTMLElement>(selector)) if (node.textContent !== text) node.textContent = text;
  };
  write('[data-clock="date"]', dateText(store, now));
  write('[data-clock="time"]', timeText(store, now));
}

/** Keep the [Date/Time] button's reading running with the clock. */
export function startDateTimeClock(store: DeviceStore, root: HTMLElement, intervalMs = 1000): () => void {
  const id = window.setInterval(() => refreshDateTime(store, root), intervalMs);
  return () => window.clearInterval(id);
}

/** Open the [Date/Time] dialog on the clock as it stands. */
export function openDateTimeSet(ctx: AppContext): void {
  const now = clockParts(ctx.store);
  for (const f of FIELDS) void ctx.store.set(`${DRAFT}.${f.key}`, now[f.key]);
  ctx.nav.push({ id: "setup.datetime.set" });
}

/** A day past the end of the month the popup holds comes down to its last day as the year or month turns. */
export function dateDraftWriteRule(store: DeviceStore): WriteRule {
  return (path, value) => {
    if (path !== `${DRAFT}.year` && path !== `${DRAFT}.month`) return [];
    const year = path === `${DRAFT}.year` ? Number(value) : store.num(`${DRAFT}.year`, 2020);
    const month = path === `${DRAFT}.month` ? Number(value) : store.num(`${DRAFT}.month`, 1);
    const last = daysInMonth(year, month);
    return store.num(`${DRAFT}.day`, 1) > last ? [[`${DRAFT}.day`, last]] : [];
  };
}

/**
 * The dialog the [Date/Time] button opens: the parts of the clock on one row in
 * the middle of the sheet, each a value box that takes the TOUCH AND TURN focus.
 * [OK] writes them to the clock; [Cancel] leaves it as it was.
 */
export const dateTimeSetScreen: ScreenDef = {
  id: "setup.datetime.set",
  toolbar: "sub",
  shellExits: false,
  knobToggle: false,
  build(ctx): ScreenBody {
    // A day stops at the last day of the month the popup holds.
    const lastDay = daysInMonth(draft(ctx, "year"), draft(ctx, "month"));
    const box = (f: (typeof FIELDS)[number]): HTMLElement =>
      el("div", {
        class: "dt-field",
        children: [
          el("span", { class: "dt-field-caption", text: f.label }),
          valueBox(
            ctx,
            {
              ...intSpec(`${DRAFT}.${f.key}`, f.label, f.min, f.key === "day" ? lastDay : f.max, f.fallback),
              format: (v) => pad(v, f.width),
            },
            "dt-box",
            // A popup's own fields wear no border.
            false,
          ),
        ],
      });
    // The date's parts are split by a slash and the time's by a colon; the
    // date and the time stand a slash's width apart.
    const sep = (text: string): HTMLElement => el("span", { class: "dt-sep", text });
    const [year, month, day, hour, minute] = FIELDS;
    return {
      main: pickDialog({
        title: "DATE / TIME",
        onCancel: () => ctx.nav.back(),
        onOk: () => {
          void setClock(ctx.store, {
            year: draft(ctx, "year"),
            month: draft(ctx, "month"),
            day: draft(ctx, "day"),
            hour: draft(ctx, "hour"),
            minute: draft(ctx, "minute"),
          });
          ctx.nav.back();
        },
        body: [
          el("div", {
            class: "pick-dialog-body",
            children: [
              el("div", {
                class: "dt-fields",
                children: [box(year), sep("/"), box(month), sep("/"), box(day), sep(""), box(hour), sep(":"), box(minute)],
              }),
            ],
          }),
        ],
      }),
    };
  },
};

/** Where the [Time Zone] dialog holds its pick until [OK]. */
const ZONE_PICK = "ui.timeZonePick";

/** Open the [Time Zone] dialog on the zone the unit is set to. */
export function openTimeZone(ctx: AppContext): void {
  void ctx.store.set(ZONE_PICK, ctx.store.str("setup.dateTime.timeZone", TIME_ZONE_SHIPPED));
  ctx.nav.push({ id: "setup.datetime.zone" });
}

/**
 * The dialog the [Time Zone] button opens: the cities as one column in the
 * middle of the sheet. A touched row is the pick; [OK] sets the zone to it.
 */
export const timeZoneScreen: ScreenDef = {
  id: "setup.datetime.zone",
  toolbar: "sub",
  shellExits: false,
  knobToggle: false,
  build(ctx): ScreenBody {
    const pick = ctx.store.str(ZONE_PICK, ctx.store.str("setup.dateTime.timeZone", TIME_ZONE_SHIPPED));
    return {
      main: pickDialog({
        title: "TIME ZONE",
        onCancel: () => ctx.nav.back(),
        onOk: () => {
          void ctx.store.set("setup.dateTime.timeZone", pick);
          ctx.nav.back();
        },
        body: [
          el("div", {
            class: "pick-dialog-cols is-centred",
            children: [
              pickColumn(null, TIME_ZONE_CITIES, pick, (v) => {
                void ctx.store.set(ZONE_PICK, v);
                ctx.repaint();
              }, "is-wide", { ctx, key: "pick.timeZone" }),
            ],
          }),
        ],
      }),
    };
  },
};
