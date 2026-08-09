import React, { useMemo, useState, useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BookOpen,
  CircleDot,
  Clock,
  Award,
  Bell,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Activity,
  Info,
  Sparkles,
  Calendar,
  X,
  User,
  LogIn,
  CloudCheck,
  CloudUpload,
  ShieldCheck,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { db } from "@/lib/db";
import { isoDate, startOfWeek, AR_MONTHS } from "@/lib/date-utils";
import { getDailySelection, dayFillRatio } from "@/lib/quran-progress";
import { getNotificationLogs } from "@/lib/notifications";
import { surahName, totalPagesFor } from "@/lib/quran-text";
import { isHabitActiveOnDate } from "@/lib/habits";
import { useAuth } from "@/context/AuthContext";
import { AuthModal } from "@/components/AuthModal";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "وَرْد — تطبيق الأوراد اليومية" },
      {
        name: "description",
        content: "تطبيق وَرْد لمتابعة الورد القرآني وورد الأذكار والأخلاق بأسلوب هادئ ومحفّز.",
      },
      { property: "og:title", content: "وَرْد" },
      { property: "og:description", content: "من لم يكن له وِرد، لم يكن له وارد." },
    ],
  }),
  component: Home,
});

export function Home() {
  const today = isoDate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const activeDate = selectedDate || today;

  // Reactive Quran progress for active date
  const quranPct = useLiveQuery(async () => {
    if (!db) return 0;
    const surahIds = await getDailySelection(activeDate);
    const qRatio = await dayFillRatio(activeDate, surahIds);
    return Math.round(qRatio * 100);
  }, [activeDate]) ?? 0;

  // Reactive Athkar progress for active date
  const athkarPct = useLiveQuery(async () => {
    if (!db) return 0;
    const activeThikrs = await db.thikr_items.toArray();
    if (activeThikrs.length === 0) return 0;
    const tProgress = await db.thikr_progress.where("date").equals(activeDate).toArray();
    
    let sumRatios = 0;
    for (const it of activeThikrs) {
      const p = tProgress.find((r) => r.thikr_item_id === it.id);
      const count = p ? p.current_count : 0;
      sumRatios += Math.min(1, count / it.target_count);
    }
    return Math.round((sumRatios / activeThikrs.length) * 100);
  }, [activeDate]) ?? 0;

  // Reactive Habits progress for active date
  const habitsPct = useLiveQuery(async () => {
    if (!db) return 0;
    const activeHabits = await db.custom_habits.where("status").equals("active").toArray();
    const filtered = activeHabits.filter((h) => isHabitActiveOnDate(h, activeDate));
    if (filtered.length === 0) return 0;
    const hProgress = await db.custom_habit_progress.where("date").equals(activeDate).toArray();
    
    let sumRatios = 0;
    for (const h of filtered) {
      const p = hProgress.find((r) => r.habit_id === h.id);
      if (h.tracking_type === "once_daily") {
        sumRatios += p?.completed ? 1 : 0;
      } else {
        const count = p ? (p.count ?? 0) : 0;
        sumRatios += Math.min(1, count / h.target_count);
      }
    }
    return Math.round((sumRatios / filtered.length) * 100);
  }, [activeDate]) ?? 0;

  // Reactive Prayers progress for active date
  const prayersPct = useLiveQuery(async () => {
    if (!db) return 0;
    const pLog = await db.prayer_logs.where("date").equals(activeDate).first();
    if (!pLog) return 0;
    const keys = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
    const done = keys.filter((k) => pLog[k]).length;
    return Math.round((done / 5) * 100);
  }, [activeDate]) ?? 0;

  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const updateCount = () => {
      const logs = getNotificationLogs();
      setUnreadCount(logs.filter((l) => !l.read).length);
    };
    updateCount();
    window.addEventListener("notifications-updated", updateCount);
    window.addEventListener("new-in-app-notification", updateCount);
    return () => {
      window.removeEventListener("notifications-updated", updateCount);
      window.removeEventListener("new-in-app-notification", updateCount);
    };
  }, []);

  const [isHistoryOpen, setIsHistoryOpen] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const { currentUser, loading: authLoading, syncing } = useAuth();
  const navigate = useNavigate();
  const [secretClickCount, setSecretClickCount] = useState(0);

  const handleSecretLogoClick = () => {
    const next = secretClickCount + 1;
    if (next >= 3) {
      setSecretClickCount(0);
      navigate({ to: "/admin" });
    } else {
      setSecretClickCount(next);
      setTimeout(() => setSecretClickCount(0), 1500);
    }
  };

  // Auto-prompt login modal on launch if user is not signed in
  useEffect(() => {
    if (!authLoading && !currentUser) {
      const hasDismissed = sessionStorage.getItem("has_seen_login_prompt");
      if (!hasDismissed) {
        setIsAuthModalOpen(true);
      }
    }
  }, [authLoading, currentUser]);

  const handleCloseAuthModal = () => {
    sessionStorage.setItem("has_seen_login_prompt", "true");
    setIsAuthModalOpen(false);
  };


  // View mode and archive offsets
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);

  // History data query for chart
  const pastDaysData = useLiveQuery(async () => {
    if (!db) return [];
    const activeThikrs = await db.thikr_items.toArray();
    const activeHabits = await db.custom_habits.where("status").equals("active").toArray();

    const fetchIsoData = async (iso: string, label: string, dateNum?: number) => {
      // Quran
      const qSurahIds = await getDailySelection(iso);
      let qTotalPages = 0;
      let qPagesRead = 0;
      for (const sid of qSurahIds) {
        const total = totalPagesFor(sid);
        qTotalPages += total;
        const existing = await db.quran_daily_reading.where("[surah_id+date]").equals([sid, iso]).first();
        qPagesRead += existing?.pages_read ?? 0;
      }
      const qPct = qTotalPages > 0 ? Math.min(100, Math.round((qPagesRead / qTotalPages) * 100)) : 0;

      // Athkar
      const tProgress = await db.thikr_progress.where("date").equals(iso).toArray();
      let tSumRatios = 0;
      for (const it of activeThikrs) {
        const p = tProgress.find((r) => r.thikr_item_id === it.id);
        const count = p ? p.current_count : 0;
        tSumRatios += Math.min(1, count / it.target_count);
      }
      const tPct = activeThikrs.length > 0 ? Math.min(100, Math.round((tSumRatios / activeThikrs.length) * 100)) : 0;

      // Habits
      const filteredHabits = activeHabits.filter((h) => isHabitActiveOnDate(h, iso));
      const hProgress = await db.custom_habit_progress.where("date").equals(iso).toArray();
      let hSumRatios = 0;
      for (const h of filteredHabits) {
        const p = hProgress.find((r) => r.habit_id === h.id);
        if (h.tracking_type === "once_daily") {
          hSumRatios += p?.completed ? 1 : 0;
        } else {
          const count = p ? (p.count ?? 0) : 0;
          hSumRatios += Math.min(1, count / h.target_count);
        }
      }
      const hPct = filteredHabits.length > 0 ? Math.min(100, Math.round((hSumRatios / filteredHabits.length) * 100)) : 0;

      const overallPct = Math.round((qPct + tPct + hPct) / 3);

      return {
        iso,
        label,
        dateNum,
        qPct,
        tPct,
        hPct,
        overallPct,
      };
    };

    if (viewMode === "week") {
      const list = [];
      const now = new Date();
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (weekOffset * 7));
      const sat = startOfWeek(targetDate);
      const daysAr = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

      // 7 days starting from Saturday (Sat..Fri)
      for (let i = 0; i < 7; i++) {
        const d = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + i);
        const iso = isoDate(d);
        const label = daysAr[d.getDay()]; // EXACT Arabic weekday name (السبت, الأحد, etc.), NEVER "اليوم"
        const dayData = await fetchIsoData(iso, label, d.getDate());
        list.push(dayData);
      }
      return list;
    }

    if (viewMode === "month") {
      const list = [];
      const now = new Date();
      const targetMonthDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const year = targetMonthDate.getFullYear();
      const month = targetMonthDate.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();

      for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
        const d = new Date(year, month, dayNum);
        const iso = isoDate(d);
        const label = `${dayNum}`;
        const dayData = await fetchIsoData(iso, label, dayNum);
        list.push(dayData);
      }
      return list;
    }

    if (viewMode === "year") {
      const list = [];
      const now = new Date();
      const targetYear = now.getFullYear() + yearOffset;

      for (let m = 0; m < 12; m++) {
        const daysInM = new Date(targetYear, m + 1, 0).getDate();
        let monthOverallSum = 0;
        let monthQPctSum = 0;
        let monthTPctSum = 0;
        let monthHPctSum = 0;

        for (let dayNum = 1; dayNum <= daysInM; dayNum++) {
          const d = new Date(targetYear, m, dayNum);
          const iso = isoDate(d);
          const dayData = await fetchIsoData(iso, "", dayNum);
          monthOverallSum += dayData.overallPct;
          monthQPctSum += dayData.qPct;
          monthTPctSum += dayData.tPct;
          monthHPctSum += dayData.hPct;
        }

        list.push({
          iso: `${targetYear}-${String(m + 1).padStart(2, "0")}-01`,
          label: AR_MONTHS[m],
          dateNum: m + 1,
          qPct: Math.round(monthQPctSum / daysInM),
          tPct: Math.round(monthTPctSum / daysInM),
          hPct: Math.round(monthHPctSum / daysInM),
          overallPct: Math.round(monthOverallSum / daysInM),
        });
      }
      return list;
    }

    return [];
  }, [today, viewMode, weekOffset, monthOffset, yearOffset]);

  // Header info for active range
  const rangeHeaderInfo = useMemo(() => {
    const now = new Date();
    if (viewMode === "week") {
      const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (weekOffset * 7));
      const sat = startOfWeek(targetDate);
      const fri = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 6);
      const satLabel = `${sat.getDate()} ${AR_MONTHS[sat.getMonth()]}`;
      const friLabel = `${fri.getDate()} ${AR_MONTHS[fri.getMonth()]}`;

      let title = `السبت ${satLabel} — الجمعة ${friLabel}`;
      if (weekOffset === 0) title = `الأسبوع الحالي (${sat.getDate()} - ${friLabel})`;
      else if (weekOffset === -1) title = `الأسبوع الماضي (${sat.getDate()} - ${friLabel})`;

      return {
        title,
        isCurrent: weekOffset === 0,
        canGoNext: weekOffset < 0,
      };
    } else if (viewMode === "month") {
      const targetMonthDate = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      const mName = AR_MONTHS[targetMonthDate.getMonth()];
      const yNum = targetMonthDate.getFullYear();
      let title = `شهر ${mName} ${yNum}`;
      if (monthOffset === 0) title = `الشهر الحالي (${mName} ${yNum})`;

      return {
        title,
        isCurrent: monthOffset === 0,
        canGoNext: monthOffset < 0,
      };
    } else {
      const targetYear = now.getFullYear() + yearOffset;
      let title = `عام ${targetYear}`;
      if (yearOffset === 0) title = `العام الحالي (${targetYear})`;

      return {
        title,
        isCurrent: yearOffset === 0,
        canGoNext: yearOffset < 0,
      };
    }
  }, [viewMode, weekOffset, monthOffset, yearOffset]);

  // Selected date details
  const selectedDateDetails = useLiveQuery(async () => {
    if (!db || !selectedDate) return null;
    
    // 1. Quran Details
    const qSurahIds = await getDailySelection(selectedDate);
    
    let qTotalPages = 0;
    let qPagesRead = 0;
    const qDetailsList = [];
    
    for (const sid of qSurahIds) {
      const total = totalPagesFor(sid);
      qTotalPages += total;
      
      const existing = await db.quran_daily_reading
        .where("[surah_id+date]")
        .equals([sid, selectedDate])
        .first();
        
      const pagesRead = existing?.pages_read ?? 0;
      qPagesRead += pagesRead;
      
      if (pagesRead > 0) {
        qDetailsList.push({
          name: surahName(sid),
          pagesRead,
          totalPages: total,
        });
      }
    }
    const qPct = qTotalPages > 0 ? Math.round((qPagesRead / qTotalPages) * 100) : 0;
    
    // 2. Athkar Details
    const activeThikrs = await db.thikr_items.toArray();
    const tProgress = await db.thikr_progress.where("date").equals(selectedDate).toArray();
    let tSumRatios = 0;
    const tDetailsList = [];
    
    for (const it of activeThikrs) {
      const p = tProgress.find((r) => r.thikr_item_id === it.id);
      const count = p ? p.current_count : 0;
      tSumRatios += Math.min(1, count / it.target_count);
      
      if (count > 0 || p?.completed) {
        tDetailsList.push({
          name: it.name,
          count,
          target: it.target_count,
          completed: p?.completed ?? (count >= it.target_count),
        });
      }
    }
    const tPct = activeThikrs.length > 0 ? Math.round((tSumRatios / activeThikrs.length) * 100) : 0;
    
    // 3. Habits Details
    const activeHabits = await db.custom_habits.where("status").equals("active").toArray();
    const filteredHabits = activeHabits.filter((h) => isHabitActiveOnDate(h, selectedDate));
    const hProgress = await db.custom_habit_progress.where("date").equals(selectedDate).toArray();
    let hSumRatios = 0;
    const hDetailsList = [];
    
    for (const h of filteredHabits) {
      const p = hProgress.find((r) => r.habit_id === h.id);
      let ratio = 0;
      let displayCount = "";
      if (h.tracking_type === "once_daily") {
        ratio = p?.completed ? 1 : 0;
        displayCount = p?.completed ? "مكتمل ✓" : "غير مكتمل";
      } else {
        const count = p ? (p.count ?? 0) : 0;
        ratio = Math.min(1, count / h.target_count);
        displayCount = `${count} / ${h.target_count}`;
      }
      hSumRatios += ratio;
      
      if (p?.completed || (p?.count && p.count > 0)) {
        hDetailsList.push({
          name: h.name,
          displayCount,
          completed: p?.completed ?? (ratio >= 1),
        });
      }
    }
    const hPct = filteredHabits.length > 0 ? Math.round((hSumRatios / filteredHabits.length) * 100) : 0;
    
    return {
      quran: { pct: qPct, list: qDetailsList, totalPagesRead: qPagesRead },
      athkar: { pct: tPct, list: tDetailsList },
      habits: { pct: hPct, list: hDetailsList }
    };
  }, [selectedDate]);

  // Achievement reasons analysis for selected date
  const selectedDayAnalysis = useMemo(() => {
    if (!selectedDateDetails) return null;
    const q = selectedDateDetails.quran.pct;
    const t = selectedDateDetails.athkar.pct;
    const h = selectedDateDetails.habits.pct;
    const overall = Math.round((q + t + h) / 3);

    let badgeText = "";
    let badgeStyle = "";
    let isHigh = overall >= 60;

    if (overall >= 80) {
      badgeText = "إنجاز ممتاز 🌟";
      badgeStyle = "bg-emerald-100/80 text-emerald-800 border-emerald-300";
    } else if (overall >= 50) {
      badgeText = "إنجاز جيد 📈";
      badgeStyle = "bg-amber-100/80 text-amber-800 border-amber-300";
    } else if (overall > 0) {
      badgeText = "إنجاز متواضع ⚠️";
      badgeStyle = "bg-rose-100/80 text-rose-800 border-rose-300";
    } else {
      badgeText = "لم يُسجل إنجاز 😴";
      badgeStyle = "bg-slate-100 text-slate-700 border-slate-300";
    }

    const items = [
      { name: "ورد القرآن الكريم", pct: q, label: "القرآن" },
      { name: "ورد الأذكار", pct: t, label: "الأذكار" },
      { name: "الأخلاق والعادات", pct: h, label: "الأخلاق" },
    ];
    items.sort((a, b) => b.pct - a.pct);

    const highest = items[0];
    const lowest = items[2];

    let reason = "";
    if (overall >= 80) {
      if (q === 100 && t === 100 && h === 100) {
        reason = "سبب الارتفاع: أداء مكتمل 100٪ في جميع الأوراد (القرآن، الأذكار، والأخلاق)! تقبل الله طاعتك.";
      } else {
        reason = `سبب الارتفاع: أداء ممتاز مرتفع في ${highest.name} بنسبة (${highest.pct}٪).`;
      }
    } else if (overall >= 50) {
      reason = `سبب التوازن: إنجاز جيد في ${highest.name} (${highest.pct}٪)، بينما يمكنك زيادة التزامك في ${lowest.name} (${lowest.pct}٪).`;
    } else if (overall > 0) {
      reason = `سبب الانخفاض: تقصير في ${lowest.name} (${lowest.pct}٪) و${items[1].name} (${items[1].pct}٪).`;
    } else {
      reason = "سبب الانخفاض: لم يتم تسجيل أي أوراد قرآنية، أذكار، أو أفعال في هذا اليوم بعد.";
    }

    return { overall, badgeText, badgeStyle, reason, highest, lowest, isHigh };
  }, [selectedDateDetails]);

  return (
    <div dir="rtl" className="ward-home relative min-h-[100dvh] overflow-hidden">
      {/* soft floral background pattern */}
      <div className="ward-home__pattern" aria-hidden />
      <div className="ward-home__glow ward-home__glow--a" aria-hidden />
      <div className="ward-home__glow ward-home__glow--b" aria-hidden />
      <div className="ward-home__glow ward-home__glow--c" aria-hidden />

      {/* Floating Header Actions */}
      <div className="relative z-20 flex justify-between items-center px-4 pt-4 max-w-md mx-auto w-full gap-2">
        <div className="flex items-center gap-2">
          {/* Auth / Cloud Sync Status Button */}
          <button
            onClick={() => setIsAuthModalOpen(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border shadow-3xs transition-all cursor-pointer active:scale-95 text-xs font-bold ${
              currentUser
                ? "bg-indigo-50/90 text-indigo-700 border-indigo-200 hover:bg-indigo-100/90"
                : "bg-white/90 text-slate-700 border-slate-200 hover:bg-slate-50"
            }`}
            title={currentUser ? "حسابك ومزامنة البيانات" : "تسجيل الدخول لحفظ بياناتك سحابياً"}
          >
            {currentUser ? (
              <>
                <CloudCheck className={`h-4 w-4 text-emerald-600 ${syncing ? "animate-pulse" : ""}`} />
                <span className="truncate max-w-[90px]">
                  {currentUser.displayName || currentUser.email?.split("@")[0] || "حسابي"}
                </span>
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4 text-indigo-600" />
                <span>تسجيل دخول</span>
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => {
            window.dispatchEvent(new CustomEvent("open-notification-center"));
          }}
          className="relative grid h-10 w-10 place-items-center rounded-2xl bg-white/90 border border-slate-100 shadow-3xs hover:bg-slate-50 transition-all cursor-pointer active:scale-95"
          title="التنبيهات والتذكيرات"
        >
          <Bell className="h-4.5 w-4.5 text-slate-750 hover:text-slate-900 transition-colors" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 border-2 border-white animate-pulse" />
          )}
        </button>
      </div>


      <header
        onClick={handleSecretLogoClick}
        className="relative z-10 flex flex-col items-center pt-6 pb-8 text-center cursor-pointer select-none active:scale-98 transition-transform"
        title="تطبيق وَرْدُكَ اليَوْمِيّ"
      >
        <TulipLogo className="h-24 w-24" />
        <h1 className="mt-3 font-serif text-5xl font-bold tracking-tight text-foreground">
          وَرْد
        </h1>
        <p className="mt-3 max-w-xs text-sm text-foreground/70">
          «من لم يكن له وِرد، لم يكن له وارد»
        </p>
      </header>

      <main className="relative z-10 mx-auto flex max-w-md flex-col items-center px-6 pt-6">
        {selectedDate && (
          <div className="w-full mb-3 flex items-center justify-between bg-indigo-50/90 border border-indigo-200/80 rounded-2xl px-3.5 py-2 text-xs text-indigo-900 shadow-2xs font-bold animate-in fade-in duration-200">
            <span>تُعرض الإحصائيات ليوم: {selectedDate}</span>
            <button
              onClick={() => setSelectedDate(null)}
              className="px-2 py-0.5 rounded-lg bg-indigo-600 text-white text-[10px] hover:bg-indigo-700 transition-colors cursor-pointer"
            >
              العودة لليوم
            </button>
          </div>
        )}

        <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Order in DOM = right→left in RTL: Quran, Athkar, Prayers, Habits */}
          <HomeTile to="/quran" label="الورد القرآني" Icon={BookOpen} variant="quran" pct={quranPct} searchDate={selectedDate || undefined} />
          <HomeTile to="/athkar" label="ورد الأذكار" Icon={CircleDot} variant="athkar" pct={athkarPct} searchDate={selectedDate || undefined} />
          <HomeTile to="/prayers" label="الصلاة على وقتها" Icon={Clock} variant="prayers" pct={prayersPct} searchDate={selectedDate || undefined} />
          <HomeTile to="/habits" label="الأخلاق والأفعال" Icon={Award} variant="habits" pct={habitsPct} searchDate={selectedDate || undefined} />
        </div>

        {/* History & Interactive Chart Section */}
        <section className="mt-8 w-full bg-white/80 border border-slate-100/80 rounded-3xl p-5 shadow-sm backdrop-blur mb-6 transition-all duration-300">
          <button
            onClick={() => setIsHistoryOpen(!isHistoryOpen)}
            className="w-full flex items-center justify-between text-right cursor-pointer py-1"
          >
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-xl bg-indigo-50 text-indigo-600">
                <Activity className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-800">مخطط وسجل متابعة الأيام</h2>
                <p className="text-[10px] text-slate-500 font-medium">مخطط بياني لتتبع الإنجاز وتحليله</p>
              </div>
            </div>
            {isHistoryOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-500 stroke-[3]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500 stroke-[3]" />
            )}
          </button>

          {isHistoryOpen && (
            <div className="mt-4 animate-in fade-in slide-in-from-top-3 duration-300">
              {/* Controls bar: view mode tabs and range navigation */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-3.5">
                {/* View Mode Tabs */}
                <div className="flex items-center gap-1 bg-slate-100/90 p-1 rounded-2xl border border-slate-200/60 self-start">
                  <button
                    type="button"
                    onClick={() => { setViewMode("week"); setSelectedDate(null); }}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      viewMode === "week"
                        ? "bg-white text-indigo-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    أسبوعي
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode("month"); setSelectedDate(null); }}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      viewMode === "month"
                        ? "bg-white text-indigo-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    شهري
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode("year"); setSelectedDate(null); }}
                    className={`px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      viewMode === "year"
                        ? "bg-white text-indigo-600 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    سنوي
                  </button>
                </div>

                {/* Range Navigation Controls */}
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-2xl px-2 py-1 justify-between sm:justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === "week") setWeekOffset((w) => w - 1);
                      else if (viewMode === "month") setMonthOffset((m) => m - 1);
                      else setYearOffset((y) => y - 1);
                      setSelectedDate(null);
                    }}
                    className="p-1 rounded-lg text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 transition-colors cursor-pointer"
                    title="السابق"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>

                  <span className="text-[11px] font-black text-slate-800 dir-rtl text-center px-1">
                    {rangeHeaderInfo.title}
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode === "week" && weekOffset < 0) setWeekOffset((w) => w + 1);
                      else if (viewMode === "month" && monthOffset < 0) setMonthOffset((m) => m + 1);
                      else if (viewMode === "year" && yearOffset < 0) setYearOffset((y) => y + 1);
                      setSelectedDate(null);
                    }}
                    disabled={!rangeHeaderInfo.canGoNext}
                    className={`p-1 rounded-lg transition-colors cursor-pointer ${
                      rangeHeaderInfo.canGoNext
                        ? "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                        : "text-slate-300 cursor-not-allowed"
                    }`}
                    title="التالي"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {!rangeHeaderInfo.isCurrent && (
                    <button
                      type="button"
                      onClick={() => {
                        setWeekOffset(0);
                        setMonthOffset(0);
                        setYearOffset(0);
                        setSelectedDate(null);
                      }}
                      className="mr-1 p-1 rounded-lg bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors cursor-pointer text-[10px] font-bold flex items-center gap-1"
                      title="العودة للفترة الحالية"
                    >
                      <RotateCcw className="h-3 w-3" />
                      <span className="hidden sm:inline">الحالي</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] text-slate-600 font-bold flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                  مخطط الإنجاز العام (٪):
                </span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
                  انقر أي نقطة للتفاصيل
                </span>
              </div>

              {/* Recharts Area Chart */}
              <div className="w-full h-44 bg-slate-50/60 rounded-2xl p-2 border border-slate-100/80 relative">
                {pastDaysData && pastDaysData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={pastDaysData}
                      margin={{ top: 12, right: 12, left: -25, bottom: 0 }}
                      onClick={(e: any) => {
                        if (!e) return;
                        let clickedIso = null;
                        if (e.activePayload && e.activePayload.length > 0 && e.activePayload[0]?.payload?.iso) {
                          clickedIso = e.activePayload[0].payload.iso;
                        } else if (e.activeTooltipIndex != null && pastDaysData && pastDaysData[e.activeTooltipIndex]) {
                          clickedIso = pastDaysData[e.activeTooltipIndex].iso;
                        } else if (e.activeLabel && pastDaysData) {
                          const found = pastDaysData.find((item: any) => item.label === e.activeLabel);
                          if (found) clickedIso = found.iso;
                        }
                        if (clickedIso) {
                          setSelectedDate(clickedIso);
                        }
                      }}
                    >
                      <defs>
                        <linearGradient id="colorOverall" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="label"
                        reversed={true}
                        interval={0}
                        padding={{ left: 12, right: 12 }}
                        tick={{ fontSize: 9, fill: "#64748b", fontWeight: 700 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        ticks={[0, 50, 100]}
                        tick={{ fontSize: 9, fill: "#94a3b8" }}
                        axisLine={false}
                        tickLine={false}
                        unit="٪"
                      />
                      <Tooltip content={<CustomChartTooltip />} wrapperStyle={{ pointerEvents: "none" }} />
                      <Area
                        type="monotone"
                        dataKey="overallPct"
                        stroke="#6366f1"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorOverall)"
                        dot={(props: any) => (
                          <ChartDot
                            key={props.index}
                            {...props}
                            selectedDate={selectedDate}
                            onSelectDate={setSelectedDate}
                          />
                        )}
                        activeDot={{
                          r: 8,
                          stroke: "#4f46e5",
                          strokeWidth: 3,
                          fill: "#ffffff",
                          onClick: (_e: any, payload: any) => {
                            if (payload?.payload?.iso) {
                              setSelectedDate(payload.payload.iso);
                            }
                          },
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    جاري تحميل المخطط…
                  </div>
                )}
              </div>

              {/* Single Inline Details Container directly below chart */}
              {!selectedDate ? (
                <div className="mt-4 border-t border-slate-100/80 pt-3">
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-3.5 text-center">
                    <p className="text-xs font-semibold text-slate-500">
                      لا يوجد شيء لعرضه.. انقر على أي نقطة في المخطط لعرض إحصائيات وتفاصيل إنجاز ذلك اليوم.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-4 border-t border-slate-100/80 pt-3 space-y-3 animate-in fade-in duration-200">
                  {/* Header bar with day info & close button */}
                  <div className="flex items-center justify-between bg-slate-50/90 border border-slate-200/80 rounded-2xl p-3">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-indigo-100/80 text-indigo-700">
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <h3 className="text-xs font-black text-slate-800">
                          إحصائيات إنجاز ({selectedDate === today ? "اليوم" : selectedDate})
                        </h3>
                        {selectedDayAnalysis && (
                          <span className={`inline-block mt-0.5 text-[10px] font-black px-2 py-0.5 rounded-full border ${selectedDayAnalysis.badgeStyle}`}>
                            {selectedDayAnalysis.badgeText} ({selectedDayAnalysis.overall}٪)
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedDate(null)}
                      className="px-2.5 py-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer text-xs font-bold flex items-center gap-1 border border-slate-200/60 bg-white"
                      title="طي التفاصيل"
                    >
                      <span className="text-[11px]">طي التفاصيل</span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Achievement Analysis Card */}
                  {selectedDayAnalysis && (
                    <div className={`rounded-2xl p-3 border text-right transition-all ${
                      selectedDayAnalysis.isHigh ? "bg-emerald-50/40 border-emerald-200/60" : "bg-amber-50/40 border-amber-200/60"
                    }`}>
                      <div className="flex items-start gap-2">
                        <div className={`p-1.5 rounded-xl mt-0.5 ${
                          selectedDayAnalysis.isHigh ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                        }`}>
                          {selectedDayAnalysis.isHigh ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                            <span>تحليل سبب مستوى الإنجاز</span>
                          </h4>
                          <p className="text-[11px] font-semibold text-slate-700 mt-1 leading-relaxed">
                            {selectedDayAnalysis.reason}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Detailed stats for Quran, Athkar, Habits */}
                  {selectedDateDetails ? (
                    <div className="space-y-3">
                      {/* 1. Quran Section */}
                      <div className="rounded-2xl bg-amber-50/30 border border-amber-100/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-xl bg-[color:var(--quran)]/10 text-[color:var(--quran)]">
                              <BookOpen className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-800">الورد القرآني</span>
                          </div>
                          <span className="text-xs font-black text-[color:var(--quran)] font-mono">{selectedDateDetails.quran.pct}٪</span>
                        </div>
                        {selectedDateDetails.quran.list.length > 0 ? (
                          <ul className="space-y-1.5 text-[11px] font-semibold text-slate-600">
                            {selectedDateDetails.quran.list.map((q, idx) => (
                              <li key={idx} className="flex justify-between items-center bg-white/80 p-2 rounded-xl border border-amber-100/40">
                                <span>{q.name}</span>
                                <span className="text-amber-800 font-mono">قراءة {q.pagesRead} صفحة</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic font-medium">لم يتم تسجيل قراءة صفحات في هذا اليوم.</p>
                        )}
                      </div>

                      {/* 2. Athkar Section */}
                      <div className="rounded-2xl bg-violet-50/30 border border-violet-100/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-xl bg-[color:var(--athkar)]/10 text-[color:var(--athkar)]">
                              <CircleDot className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-800">ورد الأذكار</span>
                          </div>
                          <span className="text-xs font-black text-[color:var(--athkar)] font-mono">{selectedDateDetails.athkar.pct}٪</span>
                        </div>
                        {selectedDateDetails.athkar.list.length > 0 ? (
                          <ul className="space-y-1.5 text-[11px] font-semibold text-slate-600">
                            {selectedDateDetails.athkar.list.map((t, idx) => (
                              <li key={idx} className="flex justify-between items-center bg-white/80 p-2 rounded-xl border border-violet-100/40">
                                <span>{t.name}</span>
                                <span className="text-violet-800 font-mono">
                                  {t.completed ? "مكتمل ✓" : `${t.count} / ${t.target}`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic font-medium">لم يتم إنجاز أذكار في هذا اليوم.</p>
                        )}
                      </div>

                      {/* 3. Habits Section */}
                      <div className="rounded-2xl bg-emerald-50/30 border border-emerald-100/50 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="p-1.5 rounded-xl bg-[color:var(--habits)]/10 text-[color:var(--habits)]">
                              <Award className="h-4 w-4" />
                            </div>
                            <span className="text-xs font-bold text-slate-800">الأخلاق والأفعال</span>
                          </div>
                          <span className="text-xs font-black text-[color:var(--habits)] font-mono">{selectedDateDetails.habits.pct}٪</span>
                        </div>
                        {selectedDateDetails.habits.list.length > 0 ? (
                          <ul className="space-y-1.5 text-[11px] font-semibold text-slate-600">
                            {selectedDateDetails.habits.list.map((h, idx) => (
                              <li key={idx} className="flex justify-between items-center bg-white/80 p-2 rounded-xl border border-emerald-100/40">
                                <span>{h.name}</span>
                                <span className={`font-mono ${h.completed ? "text-emerald-700 font-bold" : "text-slate-500"}`}>
                                  {h.displayCount}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[10px] text-slate-400 italic font-medium">لم يتم تسجيل أفعال في هذا اليوم.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-xs text-slate-400 italic">جاري تحميل البيانات…</div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      {/* Auth Modal for User Login & Cloud Sync */}
      <AuthModal isOpen={isAuthModalOpen} onClose={handleCloseAuthModal} />
    </div>
  );
}


// Custom Interactive Dot for Recharts
function ChartDot({ cx, cy, payload, selectedDate, onSelectDate }: any) {
  if (cx == null || cy == null || !payload) return null;
  const isSelected = payload.iso === selectedDate;
  const pct = payload.overallPct;

  let color = "#10b981"; // high (>=70)
  if (pct < 35) color = "#f43f5e"; // low (<35)
  else if (pct < 70) color = "#f59e0b"; // medium (<70)

  return (
    <g
      className="cursor-pointer"
      onClick={(e) => {
        e.stopPropagation();
        if (payload.iso) {
          onSelectDate(payload.iso);
        }
      }}
    >
      {/* Invisible large hit area (36px diameter) */}
      <circle cx={cx} cy={cy} r={18} fill="transparent" />

      {/* Outer pulsating glow ring for selected date */}
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={14}
          fill={color}
          fillOpacity={0.25}
          className="animate-ping"
        />
      )}
      {isSelected && (
        <circle
          cx={cx}
          cy={cy}
          r={9.5}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
        />
      )}
      {/* Main node dot */}
      <circle
        cx={cx}
        cy={cy}
        r={isSelected ? 6.5 : 5}
        fill={isSelected ? color : "#ffffff"}
        stroke={color}
        strokeWidth={2.5}
        className="transition-all duration-200"
      />
    </g>
  );
}

// Custom Tooltip for Chart
function CustomChartTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="rounded-xl border border-slate-100 bg-white/95 p-2 shadow-md backdrop-blur text-right dir-rtl">
        <p className="text-xs font-black text-slate-800">{data.label} ({data.iso})</p>
        <p className="text-[11px] font-bold text-indigo-600 mt-0.5">الإنجاز العام: {data.overallPct}٪</p>
      </div>
    );
  }
  return null;
}

function HomeTile({
  to,
  label,
  Icon,
  variant,
  pct,
  searchDate,
}: {
  to: "/quran" | "/athkar" | "/prayers" | "/habits";
  label: string;
  Icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  variant: "quran" | "athkar" | "prayers" | "habits";
  pct: number;
  searchDate?: string;
}) {
  return (
    <Link
      to={to}
      search={searchDate ? { date: searchDate } : undefined}
      className={`home-tile home-tile--${variant} relative overflow-hidden group`}
    >
      {/* Visual Progressive Fill Background */}
      <div
        className="absolute bottom-0 right-0 left-0 opacity-15 pointer-events-none transition-all duration-700 ease-out"
        style={{
          height: `${pct}%`,
          backgroundColor: variant === "prayers" ? "#10b981" : `var(--${variant})`,
        }}
      />
      <span className="home-tile__icon relative z-10 transition-transform group-hover:scale-105 duration-300">
        <Icon className="h-7 w-7" strokeWidth={1.75} />
      </span>
      <span className="home-tile__label relative z-10">{label}</span>
      <span className="text-[10px] font-bold tracking-wider relative z-10 mt-1 opacity-80 tabular-nums">
        {pct}٪
      </span>
    </Link>
  );
}

function TulipLogo({ className }: { className?: string }) {
  // Simple tulip mark with multi-color pastel petals.
  return (
    <svg viewBox="0 0 120 120" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="tul-a" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#c9a7ff" />
          <stop offset="1" stopColor="#8f6ad6" />
        </linearGradient>
        <linearGradient id="tul-b" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd6ec" />
          <stop offset="1" stopColor="#ff9bc7" />
        </linearGradient>
        <linearGradient id="tul-c" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff2a8" />
          <stop offset="1" stopColor="#ffd85c" />
        </linearGradient>
        <linearGradient id="tul-stem" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7fd3c2" />
          <stop offset="1" stopColor="#4bb39d" />
        </linearGradient>
      </defs>
      {/* stem */}
      <path
        d="M60 66 C 60 90, 60 100, 60 112"
        stroke="url(#tul-stem)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      {/* leaf */}
      <path
        d="M60 92 C 40 82, 30 92, 32 108 C 48 108, 58 100, 60 92 Z"
        fill="url(#tul-stem)"
        opacity="0.85"
      />
      {/* back petal (yellow) */}
      <path
        d="M60 20 C 40 24, 32 52, 44 70 C 50 62, 54 56, 60 56 C 66 56, 70 62, 76 70 C 88 52, 80 24, 60 20 Z"
        fill="url(#tul-c)"
        opacity="0.9"
      />
      {/* left petal (pink) */}
      <path
        d="M36 42 C 30 60, 34 74, 50 74 C 54 66, 56 58, 58 52 C 54 44, 46 40, 36 42 Z"
        fill="url(#tul-b)"
      />
      {/* right petal (purple) */}
      <path
        d="M84 42 C 90 60, 86 74, 70 74 C 66 66, 64 58, 62 52 C 66 44, 74 40, 84 42 Z"
        fill="url(#tul-a)"
      />
      {/* front petal */}
      <path
        d="M46 50 C 44 66, 52 78, 60 78 C 68 78, 76 66, 74 50 C 68 58, 64 62, 60 62 C 56 62, 52 58, 46 50 Z"
        fill="url(#tul-a)"
        opacity="0.85"
      />
    </svg>
  );
}
