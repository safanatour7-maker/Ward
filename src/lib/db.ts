import Dexie, { type Table } from "dexie";

/**
 * Local database for وَرْد app.
 * All data lives on-device (IndexedDB via Dexie). No auth, no cloud.
 */

export interface WeeklyQuranSelection {
  id?: number;
  week_start: string; // ISO date of Saturday
  surah_ids: number[];
}

export interface DailyQuranSelection {
  id?: number;
  date: string; // ISO date (yyyy-mm-dd)
  surah_ids: number[];
}

export interface QuranReadingProgress {
  id?: number;
  surah_id: number;
  last_page_read: number; // max page reached, monotonically increasing
  percent_complete: number; // 0..100
  date: string; // ISO yyyy-mm-dd (Saturday-based day)
}

export interface SurahPagesReference {
  id?: number;
  surah_id: number; // 1..114
  name_ar: string;
  total_pages: number;
  start_page: number; // page index in mushaf (1..604)
}

export interface ThikrGroup {
  id?: number;
  name: string;
  created_at: string;
}

export interface ThikrItem {
  id?: number;
  global_id?: string;
  group_id: number | null; // null => بدون مجموعة
  name: string;
  target_count: number;
  duration_scope?: "week" | "month" | "lifetime";
  created_at: string;
}

export interface ThikrProgress {
  id?: number;
  thikr_item_id: number;
  date: string; // yyyy-mm-dd
  current_count: number;
  completed: boolean;
}

export interface ThikrWeeklyEvaluation {
  id?: number;
  week_start: string;
  week_end: string;
  commitment_percent: number;
  message: string;
}

export interface ThikrMonthlyEvaluation {
  id?: number;
  month: number; // 1..12
  year: number;
  commitment_percent: number;
  message: string;
}

export type TrackingType = "once_daily" | "counter";
export type DurationType = "week" | "month" | "custom" | "once" | "lifetime";
export type HabitStatus = "active" | "archived";

export interface CustomHabit {
  id?: number;
  global_id?: string;
  name: string;
  description?: string;
  tracking_type: TrackingType;
  target_count: number; // for counter type; 1 for once_daily
  duration_type: DurationType;
  duration_days: number;
  start_date: string; // yyyy-mm-dd
  status: HabitStatus;
  created_at: string;
  flower_type?: "tulip" | "jasmine" | "jouri" | "violet" | "daffodil";
}

export interface CustomHabitProgress {
  id?: number;
  habit_id: number;
  date: string;
  completed: boolean;
  count: number | null;
}

export interface CustomHabitWeeklyEvaluation {
  id?: number;
  habit_id: number;
  week_start: string;
  week_end: string;
  commitment_percent: number;
  message: string;
  archived: boolean;
}

export interface CustomHabitMonthlyEvaluation {
  id?: number;
  habit_id: number;
  month: number;
  year: number;
  commitment_percent: number;
  message: string;
}

export interface WisdomQuote {
  id?: number;
  text: string;
  source?: string;
}

export interface PrayerLog {
  id?: number;
  date: string; // yyyy-mm-dd
  fajr: boolean;
  dhuhr: boolean;
  asr: boolean;
  maghrib: boolean;
  isha: boolean;
}

/** Cached Quran text per surah (fetched once from a public source). */
export interface SurahText {
  surah_id: number;
  ayahs: Array<{
    number_in_surah: number;
    text: string;
    page: number;
    juz: number;
  }>;
  pages: number[];
  fetched_at: string;
}

/** Overall reading state per surah — max page ever reached. */
export interface QuranSurahState {
  surah_id: number;
  max_page_reached: number; // relative page (1..total_pages)
  current_page?: number;     // actual page user is currently reading
  percent_complete: number;
  updated_at: string;
}

/** Daily log of new pages reached — used to fill calendar cells. */
export interface QuranDailyReading {
  id?: number;
  surah_id: number;
  date: string;
  pages_read: number;
}

class WardDatabase extends Dexie {
  weekly_quran_selection!: Table<WeeklyQuranSelection, number>;
  daily_quran_selection!: Table<DailyQuranSelection, number>;
  quran_reading_progress!: Table<QuranReadingProgress, number>;
  surah_pages_reference!: Table<SurahPagesReference, number>;
  surah_text!: Table<SurahText, number>;
  quran_surah_state!: Table<QuranSurahState, number>;
  quran_daily_reading!: Table<QuranDailyReading, number>;
  thikr_groups!: Table<ThikrGroup, number>;
  thikr_items!: Table<ThikrItem, number>;
  thikr_progress!: Table<ThikrProgress, number>;
  thikr_weekly_evaluation!: Table<ThikrWeeklyEvaluation, number>;
  thikr_monthly_evaluation!: Table<ThikrMonthlyEvaluation, number>;
  custom_habits!: Table<CustomHabit, number>;
  custom_habit_progress!: Table<CustomHabitProgress, number>;
  custom_habit_weekly_evaluation!: Table<CustomHabitWeeklyEvaluation, number>;
  custom_habit_monthly_evaluation!: Table<CustomHabitMonthlyEvaluation, number>;
  wisdom_quotes!: Table<WisdomQuote, number>;
  prayer_logs!: Table<PrayerLog, number>;

  constructor() {
    super("ward_db");
    this.version(1).stores({
      weekly_quran_selection: "++id, week_start",
      quran_reading_progress: "++id, surah_id, date, [surah_id+date]",
      surah_pages_reference: "++id, &surah_id",
      thikr_groups: "++id, name",
      thikr_items: "++id, group_id, name",
      thikr_progress: "++id, thikr_item_id, date, [thikr_item_id+date]",
      thikr_weekly_evaluation: "++id, week_start",
      thikr_monthly_evaluation: "++id, [year+month]",
      custom_habits: "++id, status, start_date",
      custom_habit_progress: "++id, habit_id, date, [habit_id+date]",
      custom_habit_weekly_evaluation: "++id, habit_id, week_start",
      custom_habit_monthly_evaluation: "++id, habit_id, [year+month]",
      wisdom_quotes: "++id",
    });
    this.version(2).stores({
      surah_text: "&surah_id",
      quran_surah_state: "&surah_id",
      quran_daily_reading: "++id, [surah_id+date], date",
    });
    this.version(3).stores({
      daily_quran_selection: "++id, &date",
    });
    this.version(4).stores({
      prayer_logs: "++id, &date",
    });
  }
}

export const db = typeof window !== "undefined" ? new WardDatabase() : (null as unknown as WardDatabase);

/** Seed static reference data (surah page counts + wisdom quotes) on first run. */
export async function ensureSeed() {
  if (!db) return;
  const surahCount = await db.surah_pages_reference.count();
  if (surahCount === 0) {
    const { SURAH_PAGES } = await import("./quran-meta");
    await db.surah_pages_reference.bulkAdd(SURAH_PAGES);
  }
  const quoteCount = await db.wisdom_quotes.count();
  if (quoteCount === 0) {
    const { WISDOM_QUOTES } = await import("./wisdom-seed");
    await db.wisdom_quotes.bulkAdd(WISDOM_QUOTES);
  }

  // One-time cleanup of previously pre-seeded default Athkar to give the user a clean slate
  if (typeof window !== "undefined") {
    const cleanKey = "cleaned_preseeded_athkar_v5";
    if (!localStorage.getItem(cleanKey)) {
      await db.thikr_items.clear();
      await db.thikr_groups.clear();
      await db.thikr_progress.clear();
      localStorage.setItem(cleanKey, "true");
    }
  }
}

export async function getPrayerLogForDate(dateStr: string): Promise<PrayerLog> {
  if (!db) return { date: dateStr, fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false };
  const existing = await db.prayer_logs.where("date").equals(dateStr).first();
  if (existing) return existing;
  return { date: dateStr, fajr: false, dhuhr: false, asr: false, maghrib: false, isha: false };
}

export async function togglePrayerStatus(dateStr: string, prayerKey: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha", forcedVal?: boolean) {
  if (!db) return;
  await db.transaction("rw", db.prayer_logs, async () => {
    const existing = await db.prayer_logs.where("date").equals(dateStr).first();
    if (existing && existing.id) {
      const nextVal = forcedVal !== undefined ? forcedVal : !existing[prayerKey];
      await db.prayer_logs.update(existing.id, { [prayerKey]: nextVal });
    } else {
      const init: PrayerLog = {
        date: dateStr,
        fajr: false,
        dhuhr: false,
        asr: false,
        maghrib: false,
        isha: false,
        [prayerKey]: forcedVal !== undefined ? forcedVal : true,
      };
      await db.prayer_logs.add(init);
    }
  });

  // Instant trigger cloud sync if user session exists
  if (typeof window !== "undefined") {
    const savedSession = localStorage.getItem("app_account_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed?.uid) {
          import("./cloud-sync").then(({ pushLocalToCloud }) => {
            pushLocalToCloud(parsed.uid);
          }).catch(() => {});
        }
      } catch (e) {}
    }
  }
}
