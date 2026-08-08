import React, { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { arabicMonthYear, AR_WEEKDAYS, isoDate, weekDays, startOfWeek, endOfWeek, formatArabicDate } from "@/lib/date-utils";
import { toggleHabitProgressForDate, isHabitActiveOnDate } from "@/lib/habits";
import { MiniFlower } from "./MiniFlower";
import { Calendar, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";

const AR_WEEKDAYS_SAT_FIRST = [
  AR_WEEKDAYS[6], // السبت
  AR_WEEKDAYS[0], // الأحد
  AR_WEEKDAYS[1], // الاثنين
  AR_WEEKDAYS[2], // الثلاثاء
  AR_WEEKDAYS[3], // الأربعاء
  AR_WEEKDAYS[4], // الخميس
  AR_WEEKDAYS[5], // الجمعة
];

export function HabitsMonthCalendar({
  selectedDate: propSelectedDate,
  onSelectDate,
}: {
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

  const [viewType, setViewType] = useState<"week" | "month">(() => {
    return (localStorage.getItem("habits_calendar_view_type") as any) || "week";
  });

  const toggleViewType = (type: "week" | "month") => {
    setViewType(type);
    localStorage.setItem("habits_calendar_view_type", type);
  };

  const today = isoDate();

  // 1. Current Month calculation
  const now = new Date(selectedDate);
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Lead blanks for Saturday start (jsDay + 1 % 7)
  const jsDay = firstOfMonth.getDay(); 
  const leadBlanks = (jsDay + 1) % 7;

  const monthCells: Array<{ date: Date | null; iso: string | null }> = [];
  for (let i = 0; i < leadBlanks; i++) monthCells.push({ date: null, iso: null });
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month, d);
    monthCells.push({ date: dt, iso: isoDate(dt) });
  }
  while (monthCells.length % 7 !== 0) monthCells.push({ date: null, iso: null });

  // 2. Week days containing the selected date (Saturday to Friday)
  const currentWeekDates = useMemo(() => weekDays(new Date(selectedDate)), [selectedDate]);

  // 3. Database queries
  const activeHabits = useLiveQuery(
    () => db.custom_habits.where("status").equals("active").toArray(),
    []
  ) ?? [];

  // Fetch all progress for the current month (or active range)
  const monthStart = isoDate(new Date(year, month, 1));
  const monthEnd = isoDate(new Date(year, month, daysInMonth));
  const progressRows = useLiveQuery(
    () =>
      db.custom_habit_progress
        .where("date")
        .between(monthStart, monthEnd, true, true)
        .toArray(),
    [monthStart, monthEnd]
  ) ?? [];

  // Index progress by "habitId_dateStr" -> Progress row
  const progressIndex = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of progressRows) {
      if (p.completed) {
        map.set(`${p.habit_id}_${p.date}`, true);
      }
    }
    return map;
  }, [progressRows]);

  const navigatePeriod = (direction: -1 | 1) => {
    const cur = new Date(selectedDate);
    if (viewType === "week") {
      cur.setDate(cur.getDate() + direction * 7);
    } else {
      cur.setMonth(cur.getMonth() + direction, 1);
    }
    setSelectedDate(isoDate(cur));
  };

  const goToToday = () => {
    setSelectedDate(today);
  };

  return (
    <div className="rounded-3xl border border-[color:var(--habits)]/20 bg-white/70 p-4.5 shadow-sm backdrop-blur text-right">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-[color-mix(in_oklch,var(--habits)_12%,white)] text-[color:var(--habits)]">
            <Calendar className="h-4.5 w-4.5" />
          </span>
          <div>
            <h2 className="text-base font-extrabold text-foreground">
              {viewType === "week" ? "حديقة الالتزام الأسبوعية" : "حديقة الالتزام والأخلاق"}
            </h2>
            <p className="text-[10px] text-muted-foreground font-semibold mt-0.5">
              تُزهر الوردة عند إتمام الخُلق أو الفعل المخصص لليوم.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => setSelectedDate(today)}
              className="px-2.5 py-1 rounded-xl bg-[color:var(--habits)] text-white text-[11px] font-extrabold shadow-2xs hover:opacity-90 transition-all cursor-pointer active:scale-95"
            >
              اليوم
            </button>
          )}

          {/* Period Navigators */}
          <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => navigatePeriod(-1)}
              title={viewType === "week" ? "الأسبوع السابق" : "الشهر السابق"}
              className="p-1.5 rounded-xl hover:bg-white text-slate-700 hover:text-foreground transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="text-xs font-extrabold text-[color:var(--habits)] px-2 tabular-nums">
              {viewType === "week"
                ? `أسبوع: ${formatArabicDate(new Date(weekDays(now)[0]))}`
                : arabicMonthYear(now)}
            </span>
            <button
              type="button"
              onClick={() => navigatePeriod(1)}
              title={viewType === "week" ? "الأسبوع التالي" : "الشهر التالي"}
              className="p-1.5 rounded-xl hover:bg-white text-slate-700 hover:text-foreground transition-all cursor-pointer active:scale-95 shadow-2xs"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>

          {/* View Switcher */}
          <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
            <button
              onClick={() => toggleViewType("week")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewType === "week"
                  ? "bg-white text-[color:var(--habits)] shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              أسبوعي 🌷
            </button>
            <button
              onClick={() => toggleViewType("month")}
              className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                viewType === "month"
                  ? "bg-white text-[color:var(--habits)] shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              شهري 🗓️
            </button>
          </div>
        </div>
      </div>

      {activeHabits.length === 0 ? (
        <div className="text-center py-6 text-xs text-muted-foreground font-serif">
          أضف سلوكاً أو خُلقاً أولاً لتشاهد زهورك في التقويم!
        </div>
      ) : viewType === "week" ? (
        /* WEEK VIEW - Elegant cards for each of the 7 days containing active flowers */
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
          {currentWeekDates.map((dateStr, idx) => {
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const d = new Date(dateStr);
            const label = AR_WEEKDAYS_SAT_FIRST[idx];

            return (
              <div
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`flex flex-col items-center p-2 rounded-2xl border transition-all cursor-pointer active:scale-98 ${
                  isSelected
                    ? "bg-[color-mix(in_oklch,var(--habits)_12%,white)] border-[color:var(--habits)] ring-2 ring-[color:var(--habits)]/20 shadow-sm"
                    : isToday
                    ? "bg-emerald-50/50 border-[color:var(--habits)] ring-1 ring-[color:var(--habits)]/30 scale-102"
                    : "bg-white/80 border-slate-100"
                }`}
              >
                <span className="text-[10px] font-bold text-muted-foreground/80 mb-0.5">{label}</span>
                <span className="text-xs font-bold text-slate-400 mb-2 tabular-nums">{d.getDate()}</span>

                {/* Flower garden for this day */}
                <div className="flex flex-col items-center justify-center gap-1 min-h-[42px] w-full">
                  {activeHabits.filter(h => isHabitActiveOnDate(h, dateStr)).map((h) => {
                    const isCompleted = progressIndex.has(`${h.id}_${dateStr}`);
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={async (e) => {
                          e.stopPropagation();
                          await toggleHabitProgressForDate(h.id!, dateStr);
                          if (navigator.vibrate) {
                            navigator.vibrate(8);
                          }
                        }}
                        className="transition-transform active:scale-120 hover:scale-110 cursor-pointer"
                        title={`${h.name}: ${isCompleted ? "مكتمل ✓ (اضغط للتغيير)" : "غير مكتمل (اضغط للتغيير)"}`}
                      >
                        <MiniFlower
                          type={h.flower_type ?? "tulip"}
                          completed={isCompleted}
                          size={18}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* MONTH VIEW - Full calendar grid with miniature flowers */
        <div>
          {/* Weekday labels */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground/80 mb-1">
            {AR_WEEKDAYS_SAT_FIRST.map((w) => (
              <div key={w} className="pb-1 font-bold">
                {w}
              </div>
            ))}
          </div>

          {/* Month grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {monthCells.map((c, i) => {
              if (!c.date || !c.iso) return <div key={i} className="aspect-square opacity-30" />;
              const isToday = c.iso === today;
              const isSelected = c.iso === selectedDate;
              const cellDate = c.iso;

              // Check how many are completed for percentage indicator
              const activeOnDay = activeHabits.filter((h) => isHabitActiveOnDate(h, cellDate));
              const completedOnDay = activeOnDay.filter((h) => progressIndex.has(`${h.id}_${cellDate}`)).length;
              const allDone = completedOnDay === activeOnDay.length && activeOnDay.length > 0;

              return (
                <div
                  key={i}
                  onClick={() => setSelectedDate(cellDate)}
                  className={`relative aspect-square flex flex-col justify-between p-1 rounded-xl border transition-all overflow-hidden cursor-pointer active:scale-95 ${
                    isSelected
                      ? "border-[color:var(--habits)] ring-2 ring-[color:var(--habits)]/20 bg-[color-mix(in_oklch,var(--habits)_8%,white)]"
                      : isToday
                      ? "bg-emerald-50/20 border-[color:var(--habits)] shadow-xs"
                      : allDone
                      ? "bg-amber-50/10 border-amber-200/50"
                      : "bg-white border-slate-100"
                  }`}
                  title={`${c.date.getDate()} — مكتمل: ${completedOnDay} من ${activeOnDay.length}`}
                >
                  <span className={`text-[9px] font-bold tabular-nums ${isSelected ? "text-[color:var(--habits)] font-black" : isToday ? "text-[color:var(--habits)] font-bold" : "text-muted-foreground"}`}>
                    {c.date.getDate()}
                  </span>

                  {/* Micro flowers container */}
                  <div className="flex flex-wrap items-center justify-center gap-0.5 mt-auto mb-0.5">
                    {activeOnDay.map((h) => {
                      const isCompleted = progressIndex.has(`${h.id}_${cellDate}`);
                      return (
                        <button
                          key={h.id}
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            await toggleHabitProgressForDate(h.id!, cellDate);
                            if (navigator.vibrate) {
                              navigator.vibrate(8);
                            }
                          }}
                          className="hover:scale-125 active:scale-90 transition-transform cursor-pointer"
                          title={`${h.name}: ${isCompleted ? "مكتمل ✓ (اضغط للتغيير)" : "غير مكتمل (اضغط للتغيير)"}`}
                        >
                          <MiniFlower
                            type={h.flower_type ?? "tulip"}
                            completed={isCompleted}
                            size={11}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
