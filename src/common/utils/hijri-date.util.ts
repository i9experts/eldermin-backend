// Gregorian -> Hijri (Islamic lunar calendar) conversion, for schools that
// opt in via School.showHijriDates. Uses the tabular ("Kuwaiti algorithm")
// civil Hijri calendar - the same well-known arithmetic conversion used by
// most civil Hijri calendars and libraries (e.g. moment-hijri) - rather
// than true lunar-sighting, since there is no universal sighting authority
// to defer to and a deterministic calendar is what a school printing dates
// on a circular or consent form actually needs. This is a reference date,
// not a religious ruling on when a specific month began - schools that
// need to adjust by a day or two for local moon-sighting can do so when
// scheduling the specific event.

const HIJRI_MONTHS = [
  'Muharram', 'Safar', "Rabi' al-Awwal", "Rabi' al-Thani",
  'Jumada al-Awwal', 'Jumada al-Thani', 'Rajab', "Sha'ban",
  'Ramadan', 'Shawwal', "Dhu al-Qi'dah", 'Dhu al-Hijjah',
];

export interface HijriDate {
  year: number;
  month: number; // 1-12
  day: number;
  monthName: string;
}

/**
 * Converts a Gregorian calendar date to its Hijri equivalent (tabular/Kuwaiti
 * algorithm). `dayAdjustment` shifts the result by whole days (default 0) -
 * a pure tabular calendar can run a day off from a given region's actual
 * moon-sighting-based calendar (e.g. Umm al-Qura), so this lets a school
 * correct for that without changing the conversion math itself.
 */
export function toHijri(date: Date, dayAdjustment = 0): HijriDate {
  // Julian day number for the given Gregorian date (midnight UTC).
  const adjusted = new Date(date.getTime() + dayAdjustment * 86400000);
  const y = adjusted.getUTCFullYear();
  const m = adjusted.getUTCMonth() + 1;
  const d = adjusted.getUTCDate();
  const a = Math.floor((14 - m) / 12);
  const yy = y + 4800 - a;
  const mm = m + 12 * a - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4)
    - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;

  // Kuwaiti algorithm: Julian day -> Hijri (epoch JDN 1948440 = 1 Muharram 1 AH).
  const l1 = jdn - 1948440 + 10632;
  const n = Math.floor((l1 - 1) / 10631);
  const l2 = l1 - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719)
    + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const month = Math.floor((24 * l3) / 709);
  const day = l3 - Math.floor((709 * month) / 24);
  const year = 30 * n + j - 30;

  return { year, month, day, monthName: HIJRI_MONTHS[month - 1] };
}

/** "9 Rabi' al-Awwal 1448" style reference string. */
export function formatHijri(date: Date | string | null | undefined, dayAdjustment = 0): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const h = toHijri(d, dayAdjustment);
  return `${h.day} ${h.monthName} ${h.year} AH`;
}
