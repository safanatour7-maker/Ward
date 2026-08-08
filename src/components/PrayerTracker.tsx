import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, togglePrayerStatus, type PrayerLog } from "@/lib/db";
import { isoDate, formatArabicDate, weekDays, AR_WEEKDAYS, arabicMonthYear } from "@/lib/date-utils";
import { Check, X, Sparkles, Calendar, ChevronRight, ChevronLeft, Sun, Moon, Sunrise, Sunset, Clock } from "lucide-react";

const PRAYERS_DEF = [
  { key: "fajr" as const, name: "صلاة الفجر", icon: Sunrise, time: "أول ربع ساعة من الأذان", color: "from-amber-500/20 to-orange-500/20 text-amber-700" },
  { key: "dhuhr" as const, name: "صلاة الظهر", icon: Sun, time: "أول ربع ساعة من الأذان", color: "from-yellow-500/20 to-amber-500/20 text-yellow-700" },
  { key: "asr" as const, name: "صلاة العصر", icon: Clock, time: "أول ربع ساعة من الأذان", color: "from-emerald-500/20 to-teal-500/20 text-emerald-700" },
  { key: "maghrib" as const, name: "صلاة المغرب", icon: Sunset, time: "أول ربع ساعة من الأذان", color: "from-rose-500/20 to-pink-500/20 text-rose-700" },
  { key: "isha" as const, name: "صلاة العشاء", icon: Moon, time: "أول ربع ساعة من الأذان", color: "from-indigo-500/20 to-purple-500/20 text-indigo-700" },
];

export function PrayerTracker({
  selectedDate,
  onSelectDate,
}: {
  selectedDate: string;
  onSelectDate: (d: string) => void;
}) {
  const today = isoDate();

  // Load current selected day log
  const log = useLiveQuery(
    () => db.prayer_logs.where("date").equals(selectedDate).first(),
    [selectedDate]
  );

  // Load monthly logs for calendar view
  const year = new Date(selectedDate).getFullYear();
  const month = new Date(selectedDate).getMonth();
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

  const handleToggle = async (pKey: "fajr" | "dhuhr" | "asr" | "maghrib" | "isha", status?: boolean) => {
    await togglePrayerStatus(selectedDate, pKey, status);
    if (typeof window !== "undefined" && window.navigator && window.navigator.vibrate) {
      window.navigator.vibrate(12);
    }
  };

  return (
    <div className="rounded-3xl border border-emerald-500/25 bg-white/80 p-5 shadow-sm backdrop-blur text-right mb-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-emerald-100 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-100 text-emerald-800 font-extrabold text-lg shadow-xs">
            🕌
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              الصلاة على وقتها
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                أول ربع ساعة
              </span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">
              "إن الصلاة كانت على المؤمنين كتاباً موقوتاً" — متابعة الفرائض الخمس في وقتها.
            </p>
          </div>
        </div>

        {/* Commitment Badge */}
        <div className="flex items-center gap-2 bg-emerald-50/80 p-2 px-3.5 rounded-2xl border border-emerald-200/70 self-start sm:self-center">
          <Sparkles className="h-4 w-4 text-emerald-600 animate-pulse" />
          <div className="text-right">
            <span className="text-[9.5px] text-slate-500 font-bold block">نسبة التزام اليوم</span>
            <span className="text-xs font-extrabold text-emerald-700 tabular-nums">{percentage}% ({countDone} من 5)</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-6">
        <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/60">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500 shadow-xs"
            style={{ width: `${percentage}%` }}
          />
        </div>
        <p className="text-[11px] font-semibold text-emerald-800 mt-1.5 text-center">
          {percentage === 100
            ? "🌟 هنيئاً لك! حافظت على الصلوات الخمس كلها في أوقاتها الأولى بحمد الله!"
            : percentage >= 60
            ? "👍 أحسنت! واصل المحافظة على باقي الصلوات في أول ربع ساعة."
            : "🌱 استعن بالله واحرص على أداء الصلوات القادمة في أوقاتها المحددة."}
        </p>
      </div>

      {/* Grid of 5 Prayers */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-6">
        {PRAYERS_DEF.map((p) => {
          const IconComponent = p.icon;
          const isDone = Boolean(currentLog[p.key]);

          return (
            <div
              key={p.key}
              className={`flex flex-col justify-between p-3.5 rounded-2xl border transition-all ${
                isDone
                  ? "bg-emerald-50/60 border-emerald-300 ring-1 ring-emerald-200 shadow-xs"
                  : "bg-white/90 border-slate-200 hover:border-slate-300"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <span className={`p-1.5 rounded-xl bg-gradient-to-br ${p.color}`}>
                    <IconComponent className="h-4 w-4" />
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isDone ? "bg-emerald-200/60 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                    {isDone ? "في وقتها ✓" : "لم تُسجّل"}
                  </span>
                </div>
                <h3 className="text-sm font-extrabold text-foreground">{p.name}</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5 font-medium">{p.time}</p>
              </div>

              {/* Yes / No buttons */}
              <div className="flex gap-1.5 mt-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleToggle(p.key, true)}
                  className={`flex-1 py-1.5 px-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    isDone
                      ? "bg-emerald-600 text-white shadow-xs scale-102"
                      : "bg-slate-100 text-slate-700 hover:bg-emerald-100 hover:text-emerald-800"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" /> نعم
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(p.key, false)}
                  className={`flex-1 py-1.5 px-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 ${
                    !isDone
                      ? "bg-rose-600 text-white shadow-xs scale-102"
                      : "bg-slate-100 text-slate-400 hover:bg-rose-100 hover:text-rose-700"
                  }`}
                >
                  <X className="h-3.5 w-3.5" /> لا
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
