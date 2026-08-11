import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { arabicMonthYear, AR_WEEKDAYS, isoDate, startOfWeek, parseIsoDateString } from "@/lib/date-utils";
import { dayFillRatio, getDailySelection } from "@/lib/quran-progress";
import { surahName, totalPagesFor } from "@/lib/quran-text";
import { ChevronRight, ChevronLeft, Calendar as CalendarIcon } from "lucide-react";

/**
 * Monthly grid for the Quran ward, showing partial fill per day based on
 * pages read that day / total pages of the week's selected surahs.
 *
 * Week starts Saturday. Weekday header order (RTL): السبت → الجمعة.
 */
export function MonthCalendar({
  weekSurahIds,
  selectedDate: propSelectedDate,
  onSelectDate,
}: {
  weekSurahIds: number[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
}) {
  const [localSelectedDate, setLocalSelectedDate] = useState(() => isoDate());
  const selectedDate = propSelectedDate ?? localSelectedDate;
  const setSelectedDate = (d: string) => {
    if (onSelectDate) {
      onSelectDate(d);
    } else {
      setLocalSelectedDate(d);
    }
  };

  const now = parseIsoDateString(selectedDate);
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Weekday index of the 1st, expressed with Saturday=0 ... Friday=6
  const jsDay = firstOfMonth.getDay(); // 0..6 (Sun..Sat)
  const leadBlanks = (jsDay + 1) % 7;

  const cells: Array<{ date: Date | null; iso: string | null }> = [];
  for (let i = 0; i < leadBlanks; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    cells.push({ date: dt, iso: isoDate(dt) });
  }
  while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });

  // Live daily readings for the current month → recompute fills reactively.
  const monthStart = isoDate(new Date(year, month, 1));
  const monthEnd = isoDate(new Date(year, month, daysInMonth));
  const readings = useLiveQuery(
    () =>
      db.quran_daily_reading
        .where("date")
        .between(monthStart, monthEnd, true, true)
        .toArray(),
    [monthStart, monthEnd],
  );

  const selections = useLiveQuery(
    () =>
      db.daily_quran_selection
        .where("date")
        .between(monthStart, monthEnd, true, true)
        .toArray(),
    [monthStart, monthEnd],
  );

  const [fills, setFills] = useState<Record<string, number>>({});
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Record<string, number> = {};
      for (const c of cells) {
        if (!c.iso) continue;
        out[c.iso] = await dayFillRatio(c.iso);
      }
      if (!cancelled) setFills(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [readings, selections, selectedDate]);

  const today = isoDate();

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [tempPages, setTempPages] = useState<Record<number, number>>({});

  // Use useLiveQuery to load active surahs for that date
  const editSelection = useLiveQuery(async () => {
    if (!editingDate) return null;
    const surahIds = await getDailySelection(editingDate);
    
    const items = [];
    for (const sid of surahIds) {
      const total = totalPagesFor(sid);
      const existing = await db.quran_daily_reading
        .where("[surah_id+date]")
        .equals([sid, editingDate])
        .first();
      items.push({
        surahId: sid,
        name: surahName(sid),
        totalPages: total,
        pagesRead: existing?.pages_read ?? 0,
      });
    }
    return items;
  }, [editingDate, weekSurahIds]);

  // Synchronize temp state when editSelection loads
  useEffect(() => {
    if (editSelection) {
      const initial: Record<number, number> = {};
      for (const item of editSelection) {
        initial[item.surahId] = item.pagesRead;
      }
      setTempPages(initial);
    }
  }, [editSelection]);

  const handleIncrementTemp = (surahId: number, max: number) => {
    setTempPages(prev => ({
      ...prev,
      [surahId]: Math.min(max, (prev[surahId] ?? 0) + 1)
    }));
  };

  const handleDecrementTemp = (surahId: number) => {
    setTempPages(prev => ({
      ...prev,
      [surahId]: Math.max(0, (prev[surahId] ?? 0) - 1)
    }));
  };

  const handleInputChangeTemp = (surahId: number, val: string, max: number) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) {
      setTempPages(prev => ({ ...prev, [surahId]: 0 }));
    } else {
      setTempPages(prev => ({ ...prev, [surahId]: Math.max(0, Math.min(max, num)) }));
    }
  };

  const handleSaveAll = async () => {
    if (!editingDate) return;
    
    await db.transaction("rw", db.quran_daily_reading, db.quran_surah_state, async () => {
      for (const [sidStr, pagesRead] of Object.entries(tempPages)) {
        const sid = Number(sidStr);
        const total = totalPagesFor(sid);
        const capped = Math.max(0, Math.min(pagesRead, total));
        
        const existing = await db.quran_daily_reading
          .where("[surah_id+date]")
          .equals([sid, editingDate])
          .first();
          
        if (existing?.id) {
          await db.quran_daily_reading.update(existing.id, {
            pages_read: capped,
          });
        } else {
          await db.quran_daily_reading.add({
            surah_id: sid,
            date: editingDate,
            pages_read: capped,
          });
        }
        
        // Sync active state (ensure global max_page_reached is always at least the capped pages read)
        const prev = await db.quran_surah_state.get(sid);
        const globalMax = prev?.max_page_reached ?? 0;
        const nextGlobalMax = Math.max(globalMax, capped);

        await db.quran_surah_state.put({
          surah_id: sid,
          max_page_reached: nextGlobalMax,
          current_page: nextGlobalMax,
          percent_complete: Math.round((nextGlobalMax / total) * 100),
          updated_at: new Date().toISOString(),
        });
      }
    });
    
    setEditingDate(null);
  };

  const navigateMonth = (direction: -1 | 1) => {
    const nextDate = new Date(year, month + direction, 1);
    setSelectedDate(isoDate(nextDate));
  };

  const goToToday = () => {
    setSelectedDate(today);
  };

  return (
    <div className="rounded-3xl border border-[color:var(--quran)]/25 bg-white/70 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color-mix(in_oklch,var(--quran)_12%,white)] text-[color:var(--quran)]">
            <CalendarIcon className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-foreground">التقويم الشهري</h2>
            <span className="text-[10px] text-muted-foreground font-semibold">تقويم الورد القرآني</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedDate !== today && (
            <button
              type="button"
              onClick={goToToday}
              className="px-2.5 py-1 rounded-xl bg-[color:var(--quran)] text-white text-[11px] font-extrabold shadow-2xs hover:opacity-90 transition-all cursor-pointer active:scale-95"
            >
              اليوم
            </button>
          )}

          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => navigateMonth(-1)}
              title="الشهر السابق"
              className="p-1.5 rounded-xl hover:bg-white text-slate-700 hover:text-foreground transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-xs font-extrabold text-[color:var(--quran)] px-2 tabular-nums">
              {arabicMonthYear(now)}
            </span>
            <button
              type="button"
              onClick={() => navigateMonth(1)}
              title="الشهر التالي"
              className="p-1.5 rounded-xl hover:bg-white text-slate-700 hover:text-foreground transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted-foreground">
        {AR_WEEKDAYS_SAT_FIRST.map((w) => (
          <div key={w} className="pb-1 font-semibold">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (!c.date) return <div key={i} className="aspect-square" />;
          const ratio = c.iso ? fills[c.iso] ?? 0 : 0;
          const pct = Math.round(ratio * 100);
          const isToday = c.iso === today;
          const isSelected = c.iso === selectedDate;
          return (
            <button
              type="button"
              key={i}
              onClick={() => {
                if (c.iso) {
                  if (c.iso === selectedDate) {
                    setEditingDate(c.iso);
                  } else {
                    setSelectedDate(c.iso);
                  }
                }
              }}
              className={`relative aspect-square overflow-hidden rounded-lg border text-right p-1 cursor-pointer transition-all active:scale-95 hover:border-[color:var(--quran)]/75 ${
                isSelected
                  ? "border-[color:var(--quran)] ring-2 ring-[color:var(--quran)]/40 scale-102 font-black"
                  : isToday
                  ? "border-slate-400 bg-slate-50 ring-1 ring-slate-400/20"
                  : "border-[color:var(--quran)]/20"
              } bg-white`}
              title={`${c.date.getDate()} — ${pct}٪ (انقر للتحديد، انقر مجدداً للتعديل)`}
            >
              {/* Fill from bottom */}
              <div
                className="absolute inset-x-0 bottom-0 bg-[color:var(--quran)]/75"
                style={{ height: `${pct}%` }}
              />
              <span
                className={`relative flex h-full items-center justify-center text-[11px] font-semibold ${
                  pct > 55 ? "text-white" : "text-foreground/70"
                }`}
              >
                {c.date.getDate()}
              </span>
            </button>
          );
        })}
      </div>

      {editingDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-slate-100 animate-in scale-in duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-1 text-center">تعديل ورد القرآن اليومي</h3>
            <p className="text-xs text-slate-500 mb-4 font-semibold text-center">تعديل الصفحات المقروءة ليوم {editingDate}</p>
            
            {editSelection === undefined ? (
              <div className="py-6 text-center text-xs text-slate-500">جاري تحميل السور…</div>
            ) : editSelection === null || editSelection.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">لا توجد سور مضافة لهذا اليوم. يمكنك إضافة سور أولاً من القائمة الرئيسية.</div>
            ) : (
              <div className="space-y-3.5 max-h-60 overflow-y-auto mb-6 pr-1">
                {editSelection.map((item) => {
                  const currentVal = tempPages[item.surahId] ?? 0;
                  return (
                    <div key={item.surahId} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-100 bg-slate-50/50">
                      <div className="flex-1 min-w-0 text-right">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{item.name}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{item.totalPages} صفحة</p>
                      </div>
                      
                      <div className="flex items-center gap-1.5" dir="ltr">
                        <button
                          type="button"
                          onClick={() => handleDecrementTemp(item.surahId)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 active:scale-95 font-bold text-xs cursor-pointer"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={item.totalPages}
                          value={currentVal}
                          onChange={(e) => handleInputChangeTemp(item.surahId, e.target.value, item.totalPages)}
                          className="w-12 h-7 text-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-[color:var(--quran)] font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleIncrementTemp(item.surahId, item.totalPages)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 active:scale-95 font-bold text-xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setEditingDate(null)}
                className="flex-1 rounded-2xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer active:scale-98 transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveAll}
                disabled={!editSelection || editSelection.length === 0}
                className="flex-1 rounded-2xl bg-[color:var(--quran)] py-2.5 text-xs font-bold text-white hover:opacity-95 cursor-pointer active:scale-98 transition-all disabled:opacity-40"
              >
                حفظ التعديلات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const AR_WEEKDAYS_SAT_FIRST = [
  AR_WEEKDAYS[6], // السبت
  AR_WEEKDAYS[0], // الأحد
  AR_WEEKDAYS[1], // الاثنين
  AR_WEEKDAYS[2], // الثلاثاء
  AR_WEEKDAYS[3], // الأربعاء
  AR_WEEKDAYS[4], // الخميس
  AR_WEEKDAYS[5], // الجمعة
];
