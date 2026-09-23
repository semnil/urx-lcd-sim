// The cities the unit names its time zones by, in its own order, and the time each keeps.
//
// A few cities between the ends of the list are not confirmed against a unit. The time a city
// keeps is its standard time, read through the browser's own time-zone data: the unit keeps no
// summer time.

/** Each city the [Time Zone] dialog lists, with the time zone it keeps. */
const ZONES: readonly (readonly [string, string])[] = [
  ["Abu Dhabi", "Asia/Dubai"],
  ["Adelaide", "Australia/Adelaide"],
  ["Alaska", "America/Anchorage"],
  ["Almaty", "Asia/Almaty"],
  ["Amman", "Asia/Amman"],
  ["Amsterdam", "Europe/Amsterdam"],
  ["Arizona", "America/Phoenix"],
  ["Astana", "Asia/Almaty"],
  ["Asuncion", "America/Asuncion"],
  ["Athens", "Europe/Athens"],
  ["Atlantic Time (Canada)", "America/Halifax"],
  ["Auckland", "Pacific/Auckland"],
  ["Azores", "Atlantic/Azores"],
  ["Baghdad", "Asia/Baghdad"],
  ["Baja California", "America/Tijuana"],
  ["Baku", "Asia/Baku"],
  ["Bangkok", "Asia/Bangkok"],
  ["Beijing", "Asia/Shanghai"],
  ["Beirut", "Asia/Beirut"],
  ["Belgrade", "Europe/Belgrade"],
  ["Berlin", "Europe/Berlin"],
  ["Bern", "Europe/Zurich"],
  ["Bogota", "America/Bogota"],
  ["Brasilia", "America/Sao_Paulo"],
  ["Bratislava", "Europe/Bratislava"],
  ["Brisbane", "Australia/Brisbane"],
  ["Brussels", "Europe/Brussels"],
  ["Bucharest", "Europe/Bucharest"],
  ["Budapest", "Europe/Budapest"],
  ["Buenos Aires", "America/Argentina/Buenos_Aires"],
  ["Cairo", "Africa/Cairo"],
  ["Canberra", "Australia/Sydney"],
  ["Cape Verde Is.", "Atlantic/Cape_Verde"],
  ["Caracas", "America/Caracas"],
  ["Casablanca", "Africa/Casablanca"],
  ["Cayenne", "America/Cayenne"],
  ["Central America", "America/Guatemala"],
  ["Central Time (US & Canada)", "America/Chicago"],
  ["Chennai", "Asia/Kolkata"],
  ["Chihuahua", "America/Chihuahua"],
  ["Chongqing", "Asia/Shanghai"],
  ["Coordinated Universal Time", "UTC"],
  ["Copenhagen", "Europe/Copenhagen"],
  ["Darwin", "Australia/Darwin"],
  ["Dhaka", "Asia/Dhaka"],
  ["Dublin", "Europe/Dublin"],
  ["Eastern Time (US & Canada)", "America/New_York"],
  ["Edinburgh", "Europe/London"],
  ["Ekaterinburg", "Asia/Yekaterinburg"],
  ["Fiji", "Pacific/Fiji"],
  ["Georgetown", "America/Guyana"],
  ["Greenland", "America/Nuuk"],
  ["Guadalajara", "America/Mexico_City"],
  ["Guam", "Pacific/Guam"],
  ["Hanoi", "Asia/Bangkok"],
  ["Harare", "Africa/Harare"],
  ["Hawaii", "Pacific/Honolulu"],
  ["Helsinki", "Europe/Helsinki"],
  ["Hobart", "Australia/Hobart"],
  ["Hong Kong", "Asia/Hong_Kong"],
  ["Indiana (East)", "America/Indiana/Indianapolis"],
  ["International Date Line West", "Etc/GMT+12"],
  ["Irkutsk", "Asia/Irkutsk"],
  ["Islamabad", "Asia/Karachi"],
  ["Istanbul", "Europe/Istanbul"],
  ["Jakarta", "Asia/Jakarta"],
  ["Jerusalem", "Asia/Jerusalem"],
  ["Kabul", "Asia/Kabul"],
  ["Karachi", "Asia/Karachi"],
  ["Kathmandu", "Asia/Kathmandu"],
  ["Kolkata", "Asia/Kolkata"],
  ["Krasnoyarsk", "Asia/Krasnoyarsk"],
  ["Kuala Lumpur", "Asia/Kuala_Lumpur"],
  ["Kuwait", "Asia/Kuwait"],
  ["Kyiv", "Europe/Kyiv"],
  ["La Paz (Mexico)", "America/Mazatlan"],
  ["La Paz (Bolivia)", "America/La_Paz"],
  ["Lima", "America/Lima"],
  ["Lisbon", "Europe/Lisbon"],
  ["Ljubljana", "Europe/Ljubljana"],
  ["London", "Europe/London"],
  ["Madrid", "Europe/Madrid"],
  ["Magadan", "Asia/Magadan"],
  ["Manaus", "America/Manaus"],
  ["Marshall Is.", "Pacific/Majuro"],
  ["Mazatlan", "America/Mazatlan"],
  ["Melbourne", "Australia/Melbourne"],
  ["Mexico City", "America/Mexico_City"],
  ["Mid-Atlantic", "Etc/GMT+2"],
  ["Midway Island", "Pacific/Midway"],
  ["Minsk", "Europe/Minsk"],
  ["Monrovia", "Africa/Monrovia"],
  ["Monterrey", "America/Monterrey"],
  ["Montevideo", "America/Montevideo"],
  ["Moscow", "Europe/Moscow"],
  ["Mountain Time (US & Canada)", "America/Denver"],
  ["Mumbai", "Asia/Kolkata"],
  ["Muscat", "Asia/Muscat"],
  ["Nairobi", "Africa/Nairobi"],
  ["New Caledonia", "Pacific/Noumea"],
  ["New Delhi", "Asia/Kolkata"],
  ["Newfoundland", "America/St_Johns"],
  ["Novosibirsk", "Asia/Novosibirsk"],
  ["Nuku'alofa", "Pacific/Tongatapu"],
  ["Osaka", "Asia/Tokyo"],
  ["Pacific Time (US & Canada)", "America/Los_Angeles"],
  ["Paris", "Europe/Paris"],
  ["Perth", "Australia/Perth"],
  ["Petropavlovsk-Kamchatsky", "Asia/Kamchatka"],
  ["Port Louis", "Indian/Mauritius"],
  ["Port Moresby", "Pacific/Port_Moresby"],
  ["Prague", "Europe/Prague"],
  ["Pretoria", "Africa/Johannesburg"],
  ["Quito", "America/Guayaquil"],
  ["Reykjavik", "Atlantic/Reykjavik"],
  ["Riga", "Europe/Riga"],
  ["Riyadh", "Asia/Riyadh"],
  ["Rome", "Europe/Rome"],
  ["Samoa", "Pacific/Apia"],
  ["San Juan", "America/Puerto_Rico"],
  ["Santiago", "America/Santiago"],
  ["Sapporo", "Asia/Tokyo"],
  ["Sarajevo", "Europe/Sarajevo"],
  ["Saskatchewan", "America/Regina"],
  ["Seoul", "Asia/Seoul"],
  ["Singapore", "Asia/Singapore"],
  ["Skopje", "Europe/Skopje"],
  ["Sofia", "Europe/Sofia"],
  ["Solomon Is.", "Pacific/Guadalcanal"],
  ["Sri Jayawardenepura", "Asia/Colombo"],
  ["St. Petersburg", "Europe/Moscow"],
  ["Stockholm", "Europe/Stockholm"],
  ["Sydney", "Australia/Sydney"],
  ["Taipei", "Asia/Taipei"],
  ["Tallinn", "Europe/Tallinn"],
  ["Tashkent", "Asia/Tashkent"],
  ["Tbilisi", "Asia/Tbilisi"],
  ["Tehran", "Asia/Tehran"],
  ["Tijuana", "America/Tijuana"],
  ["Tokyo", "Asia/Tokyo"],
  ["Ulaan Bataar", "Asia/Ulaanbaatar"],
  ["Urumqi", "Asia/Shanghai"],
  ["Vienna", "Europe/Vienna"],
  ["Vilnius", "Europe/Vilnius"],
  ["Vladivostok", "Asia/Vladivostok"],
  ["Volgograd", "Europe/Volgograd"],
  ["Warsaw", "Europe/Warsaw"],
  ["Wellington", "Pacific/Auckland"],
  ["West Central Africa", "Africa/Lagos"],
  ["Windhoek", "Africa/Windhoek"],
  ["Yakutsk", "Asia/Yakutsk"],
  ["Yangon (Rangoon)", "Asia/Yangon"],
  ["Yerevan", "Asia/Yerevan"],
  ["Zagreb", "Europe/Zagreb"],
];

/** The cities, in the order the dialog lists them. */
export const TIME_ZONE_CITIES: readonly string[] = ZONES.map(([city]) => city);

const ZONE_OF = new Map(ZONES);

/** The city a unit as it ships is set to. */
export const TIME_ZONE_SHIPPED = "Tokyo";

const formats = new Map<string, Intl.DateTimeFormat>();

/** How far `zone` stands ahead of UTC at `instant`, in milliseconds, summer time and all. */
function offsetAt(zone: string, instant: number): number {
  let format = formats.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      timeZone: zone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formats.set(zone, format);
  }
  const parts = format.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return wall - Math.floor(instant / 1000) * 1000;
}

/**
 * How far `city`'s standard time stands ahead of UTC in the year of `instant`, in
 * milliseconds. A name the list does not hold is read as the city the unit ships with.
 */
export function zoneOffsetMs(city: string, instant: number): number {
  const zone = ZONE_OF.get(city) ?? ZONE_OF.get(TIME_ZONE_SHIPPED) ?? "UTC";
  const year = new Date(instant).getUTCFullYear();
  // The standard time is the smaller of the offsets at midwinter and at midsummer.
  return Math.min(offsetAt(zone, Date.UTC(year, 0, 1)), offsetAt(zone, Date.UTC(year, 6, 1)));
}
