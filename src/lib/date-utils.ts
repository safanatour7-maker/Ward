/**
 * Date helpers for وَرْد.
 * The week starts on Saturday and ends on Friday, everywhere in the app.
 * Dates are shown in Arabic (Gregorian names).
 */

const AR_WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];

const AR_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Saturday (0..6 => Sun..Sat). Returns the Saturday that starts this week. */
export function startOfWeek(d: Date = new Date()): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = copy.getDay(); // 0..6 (Sun..Sat)
  // Days since previous Saturday: Sat=0, Sun=1, Mon=2, ..., Fri=6
  const diff = (day + 1) % 7;
  copy.setDate(copy.getDate() - diff);
  return copy;
}

export function endOfWeek(d: Date = new Date()): Date {
  const s = startOfWeek(d);
  const e = new Date(s);
  e.setDate(s.getDate() + 6);
  return e;
}

/** Days of the current week (Sat..Fri) as ISO date strings. */
export function weekDays(d: Date = new Date()): string[] {
  const s = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(s);
    x.setDate(s.getDate() + i);
    return isoDate(x);
  });
}

export function formatArabicDate(input: Date | string = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return typeof input === "string" ? input : "";
  const wd = AR_WEEKDAYS[d.getDay()];
  const m = AR_MONTHS[d.getMonth()];
  return `${wd}، ${d.getDate()} ${m}`;
}

export function formatArabicDateFull(d: Date = new Date()): string {
  const wd = AR_WEEKDAYS[d.getDay()];
  const m = AR_MONTHS[d.getMonth()];
  return `${wd}، ${d.getDate()} ${m} ${d.getFullYear()}`;
}

export function arabicMonthYear(d: Date = new Date()): string {
  return `${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export { AR_WEEKDAYS, AR_MONTHS };
