import { db } from "./db";
import { isoDate, startOfWeek, weekDays } from "./date-utils";
import { totalPagesFor } from "./quran-text";
import { autoCloudSync } from "./cloud-sync";

/** Record progress after user reaches a new page in a surah.
 *  Only counts progress forward — going back to review does NOT lower percent. */
export async function recordPageReached(surahId: number, pageIndex: number, targetDate?: string, diff?: number) {
  const total = totalPagesFor(surahId);
  const capped = Math.max(1, Math.min(pageIndex, total));
  const dateStr = targetDate || isoDate();

  await db.transaction("rw", db.quran_surah_state, db.quran_daily_reading, async () => {
    const prev = await db.quran_surah_state.get(surahId);
    const globalMax = prev?.max_page_reached ?? 0;
    const nextGlobalMax = Math.max(globalMax, capped);

    await db.quran_surah_state.put({
      surah_id: surahId,
      max_page_reached: nextGlobalMax,
      current_page: capped,
      percent_complete: Math.round((nextGlobalMax / total) * 100),
      updated_at: new Date().toISOString(),
    });

    const existing = await db.quran_daily_reading
      .where("[surah_id+date]")
      .equals([surahId, dateStr])
      .first();
    
    const nextPagesRead = capped;

    if (existing?.id) {
      await db.quran_daily_reading.update(existing.id, {
        pages_read: nextPagesRead,
      });
    } else {
      await db.quran_daily_reading.add({
        surah_id: surahId,
        date: dateStr,
        pages_read: nextPagesRead,
      });
    }
  });

  autoCloudSync();
}

/** For a given day, return fill ratio 0..1 for the calendar cell based on that day's selected surahs. */
export async function dayFillRatio(dateIso: string, fallbackSurahIds?: number[]): Promise<number> {
  const surahIds = (fallbackSurahIds && fallbackSurahIds.length > 0)
    ? fallbackSurahIds
    : await getDailySelection(dateIso);
  if (!surahIds || surahIds.length === 0) return 0;

  const totalPages = surahIds.reduce((s, id) => s + totalPagesFor(id), 0);
  if (totalPages === 0) return 0;

  const rows = await db.quran_daily_reading
    .where("date")
    .equals(dateIso)
    .toArray();
  const readToday = rows
    .filter((r) => surahIds.includes(r.surah_id))
    .reduce((s, r) => s + r.pages_read, 0);
  return Math.max(0, Math.min(1, readToday / totalPages));
}

/** Get a specific day's selection strictly for that date. */
export async function getDailySelection(dateStr: string): Promise<number[]> {
  const found = await db.daily_quran_selection.where("date").equals(dateStr).first();
  if (found && found.surah_ids && Array.isArray(found.surah_ids)) {
    return found.surah_ids;
  }
  return [];
}

/** Set selection strictly for the specified dateStr. */
export async function setDailySelection(surahIds: number[], dateStr: string) {
  await db.transaction("rw", db.daily_quran_selection, async () => {
    const existing = await db.daily_quran_selection.where("date").equals(dateStr).first();
    if (existing?.id) {
      await db.daily_quran_selection.update(existing.id, { surah_ids: surahIds });
    } else {
      await db.daily_quran_selection.add({ date: dateStr, surah_ids: surahIds });
    }
  });
  autoCloudSync();
}

/** Legacy helpers for backward compatibility, mapped to startOfWeek date */
export async function getCurrentWeekSelection(): Promise<{
  week_start: string;
  surah_ids: number[];
  id?: number;
}> {
  const wk = isoDate(startOfWeek());
  const found = await db.daily_quran_selection.where("date").equals(wk).first();
  return { week_start: wk, surah_ids: found?.surah_ids ?? [] };
}

export async function setWeekSelection(surahIds: number[], customDate?: Date) {
  const dateStr = isoDate(customDate);
  await setDailySelection(surahIds, dateStr);
}
