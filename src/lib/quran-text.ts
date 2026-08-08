import { db, type SurahText } from "./db";
import { SURAH_PAGES } from "./quran-meta";

/**
 * Fetch a surah's ayah text from a public source and cache it locally.
 * Once cached, all future reads happen offline from IndexedDB.
 *
 * Source: api.alquran.cloud (Uthmani rasm). We only fetch each surah once.
 */
export async function loadSurahText(surahId: number): Promise<SurahText> {
  const existing = await db.surah_text.get(surahId);
  if (existing) return existing;

  const res = await fetch(`https://api.alquran.cloud/v1/surah/${surahId}/quran-uthmani`);
  if (!res.ok) throw new Error(`فشل تحميل نص السورة (${res.status})`);
  const json = await res.json();
  const rawAyahs: Array<{
    numberInSurah: number;
    text: string;
    page: number;
    juz: number;
  }> = json?.data?.ayahs ?? [];

  const ayahs = rawAyahs.map((a) => ({
    number_in_surah: a.numberInSurah,
    text: a.text,
    page: a.page,
    juz: a.juz,
  }));
  const pages = Array.from(new Set(ayahs.map((a) => a.page))).sort((a, b) => a - b);

  const record: SurahText = {
    surah_id: surahId,
    ayahs,
    pages,
    fetched_at: new Date().toISOString(),
  };
  await db.surah_text.put(record);
  return record;
}

/** Group ayahs by page number. Returns pages in ascending order. */
export function groupByPage(text: SurahText): Array<{ page: number; ayahs: SurahText["ayahs"] }> {
  const map = new Map<number, SurahText["ayahs"]>();
  for (const a of text.ayahs) {
    const list = map.get(a.page) ?? [];
    list.push(a);
    map.set(a.page, list);
  }
  return text.pages.map((p) => ({ page: p, ayahs: map.get(p) ?? [] }));
}

/** Total pages a surah spans according to our reference data. */
export function totalPagesFor(surahId: number): number {
  return SURAH_PAGES.find((s) => s.surah_id === surahId)?.total_pages ?? 1;
}

export function surahName(surahId: number): string {
  return SURAH_PAGES.find((s) => s.surah_id === surahId)?.name_ar ?? `سورة ${surahId}`;
}
