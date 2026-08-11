import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useState, useEffect } from "react";
import { db } from "@/lib/db";
import { isoDate, startOfWeek, formatArabicDate, parseIsoDateString } from "@/lib/date-utils";
import { autoCloudSync } from "@/lib/cloud-sync";
import { MonthCalendar } from "@/components/MonthCalendar";
import { SurahPicker } from "@/components/SurahPicker";
import { getDailySelection, setDailySelection } from "@/lib/quran-progress";
import { surahName, totalPagesFor } from "@/lib/quran-text";
import { Plus, Pencil, Trash2, BookOpen, Archive, Calendar, Minus } from "lucide-react";
import { z } from "zod";

const quranSearchSchema = z.object({
  date: z.string().optional(),
});

export const Route = createFileRoute("/quran")({
  validateSearch: quranSearchSchema,
  head: () => ({
    meta: [
      { title: "الورد القرآني — وَرْد" },
      {
        name: "description",
        content: "متابعة الورد القرآني الأسبوعي مع تقويم شهري وقراءة السور.",
      },
    ],
  }),
  component: QuranScreen,
});

function QuranScreen() {
  const location = useLocation();
  const isReaderActive = location.pathname.includes("/quran/read/");
  const { date } = Route.useSearch();

  const [selectedDate, setSelectedDate] = useState(() => date || isoDate());

  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    } else {
      setSelectedDate(isoDate());
    }
  }, [date]);

  const handleSetSelectedDate = (d: string) => {
    setSelectedDate(d);
  };

  // Collapsible calendar state
  const [showCalendar, setShowCalendar] = useState(() => {
    return localStorage.getItem("quran_show_calendar") !== "false";
  });

  const toggleCalendar = () => {
    const next = !showCalendar;
    setShowCalendar(next);
    localStorage.setItem("quran_show_calendar", String(next));
  };

  // Live selection for this date (with week fallback)
  const surahIds = useLiveQuery(
    () => getDailySelection(selectedDate),
    [selectedDate],
  ) ?? [];

  // Live daily reading records for the selectedDate
  const dailyReadings = useLiveQuery(
    () => db.quran_daily_reading.where("date").equals(selectedDate).toArray(),
    [selectedDate],
  ) ?? [];
  const dailyReadingsMap = new Map(dailyReadings.map((r) => [r.surah_id, r]));

  const [pickerMode, setPickerMode] = useState<
    { mode: "add" } | { mode: "replace"; index: number } | null
  >(null);

  const [confirmAction, setConfirmAction] = useState<{
    type: "complete" | "delete";
    surahId: number;
    index?: number;
    title: string;
  } | null>(null);

  if (isReaderActive) {
    return <Outlet />;
  }

  const addSurah = async (id: number) => {
    const next = [...surahIds, id];
    await setDailySelection(next, selectedDate);
  };
  const replaceSurah = async (index: number, id: number) => {
    const next = [...surahIds];
    next[index] = id;
    await setDailySelection(next, selectedDate);
  };
  const removeSurah = async (index: number) => {
    const next = surahIds.filter((_, i) => i !== index);
    await setDailySelection(next, selectedDate);
  };

  const updatePagesRead = async (surahId: number, nextPages: number) => {
    const total = totalPagesFor(surahId);
    const capped = Math.max(0, Math.min(nextPages, total));
    await db.transaction("rw", db.quran_daily_reading, db.quran_surah_state, async () => {
      const existing = await db.quran_daily_reading
        .where("[surah_id+date]")
        .equals([surahId, selectedDate])
        .first();
      if (existing?.id) {
        await db.quran_daily_reading.update(existing.id, { pages_read: capped });
      } else {
        await db.quran_daily_reading.add({
          surah_id: surahId,
          date: selectedDate,
          pages_read: capped,
        });
      }

      // Sync active state (ensure global max_page_reached is always at least the capped pages read)
      const prev = await db.quran_surah_state.get(surahId);
      const globalMax = prev?.max_page_reached ?? 0;
      const nextGlobalMax = Math.max(globalMax, capped);

      await db.quran_surah_state.put({
        surah_id: surahId,
        max_page_reached: nextGlobalMax,
        current_page: nextGlobalMax,
        percent_complete: Math.round((nextGlobalMax / total) * 100),
        updated_at: new Date().toISOString(),
      });
    });
    autoCloudSync();
  };

  const markSurahCompleted = async (sid: number) => {
    setConfirmAction({
      type: "complete",
      surahId: sid,
      title: `هل أنت متأكد من تحديد سورة «${surahName(sid)}» كمقروءة بالكامل لليوم المحدد؟`,
    });
  };

  return (
    <div dir="rtl" className="screen screen--quran min-h-[100dvh] pb-24">
      <header className="mb-4 flex items-center justify-between px-1">
        <div>
          <h1 className="text-2xl font-extrabold text-foreground">
            {selectedDate === isoDate() ? "الورد القرآني" : `إنجازك في يوم: ${formatArabicDate(parseIsoDateString(selectedDate))}`}
          </h1>
          <p className="text-xs text-muted-foreground mt-1.5 italic font-medium leading-relaxed bg-[color:var(--quran)]/5 py-1.5 px-3 rounded-xl border-r-3 border-[color:var(--quran)]">
            "يارب ما أقرب ما يتقرب به إليك المتقربون؟ بكلامي ، بفهم وبغير فهم.."
          </p>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={toggleCalendar}
            className="flex items-center gap-1 rounded-full border border-border bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white active:scale-95 transition-all cursor-pointer"
          >
            {showCalendar ? "إخفاء التقويم" : "إظهار التقويم"}
          </button>
        </div>
      </header>

      {showCalendar && (
        <div className="mb-4 animate-in fade-in slide-in-from-top-3 duration-200">
          <MonthCalendar weekSurahIds={surahIds} selectedDate={selectedDate} onSelectDate={handleSetSelectedDate} />
        </div>
      )}

      <section className="mt-5">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-base font-bold text-foreground">
            {selectedDate === isoDate() ? "سور هذا اليوم" : `سور يوم ${formatArabicDate(parseIsoDateString(selectedDate))}`}
          </h2>
          <button
            onClick={() => setPickerMode({ mode: "add" })}
            className="flex items-center gap-1 rounded-full bg-[color:var(--quran)] px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> إضافة سورة
          </button>
        </div>

        {surahIds.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[color:var(--quran)]/40 bg-white/60 p-6 text-center text-sm text-muted-foreground">
            لم تختر أي سورة لهذا اليوم بعد. اضغط «إضافة سورة» للبدء.
          </div>
        ) : (
          <ul className="space-y-2">
            {surahIds.map((sid, idx) => {
              const total = totalPagesFor(sid);
              const dailyRecord = dailyReadingsMap.get(sid);
              const pagesRead = dailyRecord?.pages_read ?? 0;
              const pct = total > 0 ? Math.round((pagesRead / total) * 100) : 0;
              return (
                <li
                  key={`${sid}-${idx}`}
                  className="rounded-2xl border border-[color:var(--quran)]/20 bg-white p-3 shadow-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--quran)]/15 text-sm font-bold text-[color:var(--quran)]">
                      {sid}
                    </span>
                    <div className="flex-1">
                      <div className="flex items-baseline justify-between">
                        <h3 className="text-sm font-bold">{surahName(sid)}</h3>
                        <span className="text-[11px] text-muted-foreground">
                          {total} صفحة
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-[color:var(--quran)] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1 text-[11px] text-muted-foreground flex items-center justify-between">
                        <span>{pct}٪ مقروء ({pagesRead} من {total} صفحة)</span>
                        {pct === 100 && <span className="text-emerald-600 font-bold text-[10px]">مكتملة ✓</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Link
                      to="/quran/read/$surahId"
                      params={{ surahId: String(sid) } as any}
                      search={{ date: selectedDate }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-[color:var(--quran)] py-2 text-xs font-bold text-white shadow-sm hover:opacity-95 active:scale-95 transition-all"
                    >
                      <BookOpen className="h-3.5 w-3.5" /> اقرأ
                    </Link>

                    {pct < 100 && (
                      <button
                        onClick={() => markSurahCompleted(sid)}
                        className="flex items-center justify-center gap-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-extrabold text-emerald-700 hover:bg-emerald-100 active:scale-95 transition-all cursor-pointer"
                        title="تحديد كمقروءة بالكامل مباشرة"
                      >
                        ✓ تم
                      </button>
                    )}
                    <button
                      onClick={() => setPickerMode({ mode: "replace", index: idx })}
                      className="rounded-xl border border-border bg-white p-2 text-muted-foreground hover:bg-muted active:scale-95 transition-all cursor-pointer"
                      title="تعديل السورة"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        setConfirmAction({
                          type: "delete",
                          surahId: sid,
                          index: idx,
                          title: `هل أنت متأكد من حذف سورة «${surahName(sid)}» من قائمة الأسبوع؟`,
                        });
                      }}
                      className="rounded-xl border border-border bg-white p-2 text-destructive hover:bg-red-50 active:scale-95 transition-all cursor-pointer"
                      title="حذف السورة"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <SurahPicker
        open={pickerMode !== null}
        title={pickerMode?.mode === "replace" ? "استبدال سورة" : "اختر سورة"}
        excludeIds={
          pickerMode?.mode === "add"
            ? surahIds
            : pickerMode?.mode === "replace"
            ? surahIds.filter((_, i) => i !== pickerMode.index)
            : []
        }
        onClose={() => setPickerMode(null)}
        onPick={(id) => {
          if (pickerMode?.mode === "add") addSurah(id);
          else if (pickerMode?.mode === "replace") replaceSurah(pickerMode.index, id);
        }}
      />

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-slate-100 text-center animate-in scale-in duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-2">تأكيد الإجراء</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">{confirmAction.title}</p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-2xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer active:scale-98 transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirmAction.type === "complete") {
                    const total = totalPagesFor(confirmAction.surahId);
                    await updatePagesRead(confirmAction.surahId, total);
                  } else if (confirmAction.type === "delete" && confirmAction.index !== undefined) {
                    await removeSurah(confirmAction.index);
                  }
                  setConfirmAction(null);
                }}
                className={`flex-1 rounded-2xl py-2.5 text-xs font-bold text-white cursor-pointer active:scale-98 transition-all ${
                  confirmAction.type === "delete" ? "bg-rose-600 hover:bg-rose-700" : "bg-[color:var(--quran)] hover:opacity-95"
                }`}
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
