import React, { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { db, togglePrayerStatus, type PrayerLog } from "@/lib/db";
import { isoDate, formatArabicDate, formatArabicDateFull, weekDays, AR_WEEKDAYS, arabicMonthYear } from "@/lib/date-utils";
import { Check, X, Sparkles, ChevronRight, ChevronLeft, Sun, Moon, Sunrise, Sunset, Clock, Calendar } from "lucide-react";

export const Route = createFileRoute("/prayers")({
  component: PrayersPage,
});

const PRAYERS_DEF = [
  { key: "fajr" as const, name: "صلاة الفجر", icon: Sunrise, time: "أول ربع ساعة من الأذان", color: "from-amber-500/15 to-orange-500/15 text-amber-700" },
  { key: "dhuhr" as const, name: "صلاة الظهر", icon: Sun, time: "أول ربع ساعة من الأذان", color: "from-yellow-500/15 to-amber-500/15 text-yellow-700" },
  { key: "asr" as const, name: "صلاة العصر", icon: Clock, time: "أول ربع ساعة من الأذان", color: "from-emerald-500/15 to-teal-500/15 text-emerald-700" },
  { key: "maghrib" as const, name: "صلاة المغرب", icon: Sunset, time: "أول ربع ساعة من الأذان", color: "from-rose-500/15 to-pink-500/15 text-rose-700" },
  { key: "isha" as const, name: "صلاة العشاء", icon: Moon, time: "أول ربع ساعة من الأذان", color: "from-indigo-500/15 to-purple-500/15 text-indigo-700" },
];

function PrayersPage() {
  const today = isoDate();
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [showCalendar, setShowCalendar] = useState<boolean>(true);
  const [viewType, setViewType] = useState<"week" | "month">("week");

  // Current selected day prayer log
  const log = useLiveQuery(
    () => db.prayer_logs.where("date").equals(selectedDate).first(),
    [selectedDate]
  );

  // Month logs for calendar navigation
  const currentDateObj = new Date(selectedDate);
  const year = currentDateObj.getFullYear();
  const month = currentDateObj.getMonth();
  const monthStart = isoDate(new Date(year, month, 1));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthEnd = isoDate(new Date(year, month, daysInMonth));

  const monthLogs = useLiveQuery(
    () => db.prayer_logs.where("date").between(monthStart, monthEnd, true, true).toArray(),
    [monthStart, monthEnd]
  ) ?? [];

  const monthLogMap = new Map(monthLogs.map((l) => [l.date, l]));

  const currentLog: PrayerLog = log ?? {
    date: selectedDate,
    fajr: false,
    dhuhr: false,
    asr: false,
    maghrib: false,
    isha: false,
  };

  const countDone = PRAYERS_DEF.filter((p) => currentLog[p.key]).length;
  const percentage = Math.round((countDone / 5) * 100);

  const handleToggle = async (pKey: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha", status: boolean) => {
    await togglePrayerStatus(selectedDate, pKey, status);
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(10);
    }
  };

  const navigateMonth = (dir: -1 | 1) => {
    const cur = new Date(selectedDate);
    cur.setMonth(cur.getMonth() + dir, 1);
    setSelectedDate(isoDate(cur));
  };

  // Month grid construction
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayIndex = (firstDayOfMonth.getDay() + 1) % 7; // Sat-first
  const monthCells: Array<{ dayNum?: number; iso?: string }> = [];
  for (let i = 0; i < startDayIndex; i++) monthCells.push({});
  for (let d = 1; d <= daysInMonth; d++) {
    monthCells.push({ dayNum: d, iso: isoDate(new Date(year, month, d)) });
  }

  const AR_DAYS_SHORT = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

  return (
    <div dir="rtl" className="screen min-h-[100dvh] px-4 pt-6 pb-36 text-right max-w-2xl mx-auto">
      {/* Header */}
      <header className="pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
            الصلاة على وقتها
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/70">
              في أول ربع ساعة
            </span>
          </h1>
          <p className="mt-1 text-xs text-muted-foreground font-medium">
            "إن الصلاة كانت على المؤمنين كتاباً موقوتاً"
          </p>
        </div>
        <button
          onClick={() => setShowCalendar(!showCalendar)}
          className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/80 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-white active:scale-95 transition-all cursor-pointer"
        >
          <Calendar className="h-4 w-4 text-emerald-600" />
          {showCalendar ? "إخفاء التقويم" : "إظهار التقويم"}
        </button>
      </header>

      {/* Calendar for previous months navigation */}
      {showCalendar && (
        <section className="mb-5 rounded-3xl border border-emerald-300/70 bg-gradient-to-br from-emerald-50/90 via-teal-50/70 to-emerald-100/60 p-4.5 shadow-sm backdrop-blur animate-in fade-in slide-in-from-top-3 duration-200">
          <div className="flex items-center justify-between gap-2 mb-3">
            {/* Arrows navigation (Previous / Next month) */}
            <div className="flex items-center gap-1.5">
              {selectedDate !== today && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[11px] font-extrabold shadow-2xs hover:bg-emerald-700 transition-all cursor-pointer active:scale-95"
                >
                  اليوم
                </button>
              )}

              <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => navigateMonth(-1)}
                  title="الشهر السابق"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition-all cursor-pointer active:scale-95 shadow-2xs"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-xs font-black text-emerald-800 px-3 tabular-nums">
                  {arabicMonthYear(currentDateObj)}
                </span>
                <button
                  type="button"
                  onClick={() => navigateMonth(1)}
                  title="الشهر التالي"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition-all cursor-pointer active:scale-95 shadow-2xs"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
            </div>

            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
              التقويم الشهري 🗓️
            </span>
          </div>

          {/* Month Grid */}
          <div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-slate-500 mb-1.5">
              {AR_DAYS_SHORT.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {monthCells.map((c, idx) => {
                if (!c.iso) return <div key={`empty-${idx}`} />;
                const dayLog = monthLogMap.get(c.iso);
                const isSelected = c.iso === selectedDate;
                const isToday = c.iso === today;

                let doneCount = 0;
                if (dayLog) {
                  doneCount = PRAYERS_DEF.filter((p) => dayLog[p.key]).length;
                }
                const pct = Math.round((doneCount / 5) * 100);

                // Distinct color badge for percentage / completion fill
                let cellBg = "bg-white border-slate-100 hover:border-slate-300";
                let badgeStyle = "bg-slate-100 text-slate-400";

                if (doneCount === 5) {
                  cellBg = "bg-emerald-500 text-white border-emerald-600 shadow-2xs";
                  badgeStyle = "bg-emerald-700/80 text-white";
                } else if (doneCount >= 3) {
                  cellBg = "bg-emerald-100/80 text-emerald-900 border-emerald-200";
                  badgeStyle = "bg-emerald-600 text-white";
                } else if (doneCount > 0) {
                  cellBg = "bg-emerald-50 text-emerald-800 border-emerald-150";
                  badgeStyle = "bg-emerald-200 text-emerald-800";
                }

                if (isSelected) {
                  cellBg += " ring-2 ring-emerald-500 ring-offset-1 scale-102 font-black z-10";
                }

                return (
                  <button
                    key={c.iso}
                    type="button"
                    onClick={() => setSelectedDate(c.iso!)}
                    className={`flex flex-col items-center justify-between p-1.5 min-h-[50px] rounded-2xl border text-center transition-all cursor-pointer ${cellBg}`}
                  >
                    <div className="flex items-center justify-between w-full px-0.5">
                      <span className={`text-[11px] font-extrabold tabular-nums ${doneCount === 5 ? "text-white" : "text-slate-800"}`}>
                        {c.dayNum}
                      </span>
                      {isToday && (
                        <span className={`h-1.5 w-1.5 rounded-full ${doneCount === 5 ? "bg-white" : "bg-emerald-600"}`} title="اليوم" />
                      )}
                    </div>

                    <span className={`text-[9px] font-black px-1.5 py-0.2 rounded-md tabular-nums mt-1 ${badgeStyle}`}>
                      {pct}%
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Main Selected Day Card - Compact, clear, no scroll needed */}
      <main className="rounded-3xl border border-emerald-500/25 bg-white/90 p-5 shadow-sm backdrop-blur">
        {/* Day Name & Date Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-100 pb-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4.5 w-4.5 text-emerald-600" />
              <span className="text-sm font-black text-emerald-950 bg-emerald-100/90 px-3 py-1 rounded-xl border border-emerald-300/80 shadow-2xs">
                {formatArabicDateFull(new Date(selectedDate))}
              </span>
              {selectedDate === today && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-emerald-600 text-white">
                  اليوم
                </span>
              )}
            </div>
            <h2 className="text-xs font-extrabold text-slate-600 dark:text-slate-300 mt-1">
              نسبة الالتزام بالصلاة على وقتها في أول ربع ساعة
            </h2>
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 px-3.5 py-1.5 rounded-2xl border border-emerald-200/80 self-start sm:self-auto">
            <Sparkles className="h-4 w-4 text-emerald-600" />
            <span className="text-base font-black text-emerald-800 tabular-nums">
              {percentage}%
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-5">
          <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* 5 Prayers List - Equal Sized Yes / No Buttons */}
        <div className="space-y-2.5">
          {PRAYERS_DEF.map((p) => {
            const IconComponent = p.icon;
            const isDone = Boolean(currentLog[p.key]);

            return (
              <div
                key={p.key}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                  isDone
                    ? "bg-emerald-50/70 border-emerald-300 shadow-2xs"
                    : "bg-white border-slate-200 hover:border-slate-300"
                }`}
              >
                {/* Prayer Label & Icon */}
                <div className="flex items-center gap-3">
                  <span className={`p-2 rounded-xl bg-gradient-to-br ${p.color}`}>
                    <IconComponent className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-extrabold text-foreground">{p.name}</h3>
                    <p className="text-[10px] text-muted-foreground font-semibold">{p.time}</p>
                  </div>
                </div>

                {/* YES & NO Buttons - EQUAL SIZE */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggle(p.key, true)}
                    className={`w-20 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      isDone
                        ? "bg-emerald-600 text-white shadow-xs scale-102"
                        : "bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800"
                    }`}
                  >
                    <Check className="h-4 w-4" /> نعم
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(p.key, false)}
                    className={`w-20 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      !isDone
                        ? "bg-rose-600 text-white shadow-xs scale-102"
                        : "bg-slate-100 text-slate-500 hover:bg-rose-100 hover:text-rose-700"
                    }`}
                  >
                    <X className="h-4 w-4" /> لا
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
