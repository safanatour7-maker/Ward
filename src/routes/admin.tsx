import React, { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { collection, getDocs, doc, getDoc, onSnapshot } from "firebase/firestore";
import { dbFirestore } from "@/lib/firebase";
import { setQuotaExceededCooldown } from "@/lib/cloud-sync";
import { useAuth, getAccountDocId } from "@/context/AuthContext";
import { createGlobalHabit, updateGlobalHabit, deleteGlobalHabit } from "@/lib/habits";
import { createGlobalThikr, updateGlobalThikr, deleteGlobalThikr } from "@/lib/athkar";
import { isoDate, formatArabicDate, arabicMonthYear } from "@/lib/date-utils";
import { totalPagesFor, surahName } from "@/lib/quran-text";
import { ShieldCheck, Users, Download, Plus, Sparkles, Lock, ArrowRight, CheckCircle2, Clock, BookOpen, CircleDot, Award, Calendar, RefreshCw, Edit2, Trash2, ChevronDown, ChevronUp, Eye, EyeOff, Trophy, Filter, Heart, CalendarCheck, CalendarDays } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
});

interface UserProfileDoc {
  uid: string;
  displayName?: string;
  email?: string;
  createdAt?: string;
  updatedAt?: string;
  isAdmin?: boolean;
}

interface UserCloudData {
  quranDailyReading?: any[];
  quranSurahState?: any[];
  dailyQuranSelection?: any[];
  thikrItems?: any[];
  thikrProgress?: any[];
  prayerLogs?: any[];
  customHabits?: any[];
  customHabitProgress?: any[];
  progressRows?: any[];
  updatedAt?: string;
}

function getUserDataForMember(m?: UserProfileDoc | null, map?: Record<string, UserCloudData>): UserCloudData | undefined {
  if (!m || !map) return undefined;
  if (map[m.uid]) return map[m.uid];
  if (m.email) {
    const accDocId = getAccountDocId(m.email);
    if (map[accDocId]) return map[accDocId];
  }
  const keys = Object.keys(map);
  for (const k of keys) {
    const d = map[k];
    if (d && m.email && k.includes(m.email.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, "_"))) {
      return d;
    }
  }
  return undefined;
}

function getMemberStats(uData?: UserCloudData) {
  if (!uData) return { quranPct: 0, athkarPct: 0, prayerPct: 0, habitsPct: 0, totalPrayerDays: 0, selectedSurahCount: 0, thikrItemCount: 0, habitCount: 0 };

  // 1. Quran %
  let selectedSurahIds: number[] = [];
  if (uData.dailyQuranSelection && Array.isArray(uData.dailyQuranSelection) && uData.dailyQuranSelection.length > 0) {
    const sorted = [...uData.dailyQuranSelection].reverse();
    for (const sel of sorted) {
      if (sel.surah_ids && Array.isArray(sel.surah_ids) && sel.surah_ids.length > 0) {
        selectedSurahIds = sel.surah_ids;
        break;
      }
    }
  }

  if (selectedSurahIds.length === 0 && uData.quranSurahState && Array.isArray(uData.quranSurahState) && uData.quranSurahState.length > 0) {
    selectedSurahIds = uData.quranSurahState.map((s: any) => s.surah_id).filter(Boolean);
  }

  let quranPct = 0;
  if (selectedSurahIds.length > 0) {
    let sumPct = 0;
    selectedSurahIds.forEach((sId) => {
      const state = uData.quranSurahState?.find((qs: any) => qs.surah_id === sId);
      const totalPages = totalPagesFor(sId);
      const reached = state?.max_page_reached || state?.current_page || 0;
      const pct = state?.is_completed || state?.percent_complete === 100
        ? 100
        : Math.min(100, Math.round((reached / totalPages) * 100));
      sumPct += pct;
    });
    quranPct = Math.round(sumPct / selectedSurahIds.length);
  }

  // 2. Athkar %
  let athkarPct = 0;
  const thikrItems = uData.thikrItems && Array.isArray(uData.thikrItems) ? uData.thikrItems : [];
  if (thikrItems.length > 0) {
    let sumThikrPct = 0;
    thikrItems.forEach((item: any) => {
      const target = item.target_count || 1;
      let curr = item.completed_count || 0;
      let isDone = item.completed || false;

      if (uData.thikrProgress && Array.isArray(uData.thikrProgress)) {
        const prog = uData.thikrProgress.find((tp: any) => tp.thikr_item_id === item.id);
        if (prog) {
          if (prog.current_count !== undefined) curr = prog.current_count;
          if (prog.completed !== undefined) isDone = prog.completed;
        }
      }

      const pct = isDone || curr >= target ? 100 : Math.min(100, Math.round((curr / target) * 100));
      sumThikrPct += pct;
    });
    athkarPct = Math.round(sumThikrPct / thikrItems.length);
  }

  // 3. Prayer %
  let prayerPct = 0;
  let totalCheckedPrayers = 0;
  let totalPossiblePrayers = 0;
  if (uData.prayerLogs && Array.isArray(uData.prayerLogs) && uData.prayerLogs.length > 0) {
    totalPossiblePrayers = uData.prayerLogs.length * 5;
    uData.prayerLogs.forEach((pl: any) => {
      ["fajr", "dhuhr", "asr", "maghrib", "isha"].forEach((k) => {
        if (pl[k]) totalCheckedPrayers++;
      });
    });
    prayerPct = totalPossiblePrayers > 0 ? Math.round((totalCheckedPrayers / totalPossiblePrayers) * 100) : 0;
  }

  // 4. Ethics / Habits %
  let habitsPct = 0;
  const customHabits = uData.customHabits && Array.isArray(uData.customHabits) ? uData.customHabits : [];
  if (customHabits.length > 0) {
    let sumHabitPct = 0;
    customHabits.forEach((h: any) => {
      let isDone = false;
      if (uData.customHabitProgress && Array.isArray(uData.customHabitProgress)) {
        const hp = uData.customHabitProgress.find((p: any) => p.habit_id === h.id);
        if (hp && (hp.completed || (hp.count || 0) > 0)) {
          isDone = true;
        }
      }
      sumHabitPct += isDone ? 100 : 0;
    });
    habitsPct = Math.round(sumHabitPct / customHabits.length);
  } else if (uData.progressRows && Array.isArray(uData.progressRows) && uData.progressRows.length > 0) {
    const done = uData.progressRows.filter((r: any) => r.is_completed || r.completed).length;
    habitsPct = Math.round((done / uData.progressRows.length) * 100);
  }

  return {
    quranPct,
    athkarPct,
    prayerPct,
    habitsPct,
    totalPrayerDays: uData.prayerLogs?.length || 0,
    selectedSurahCount: selectedSurahIds.length,
    thikrItemCount: thikrItems.length,
    habitCount: customHabits.length,
  };
}

async function loadSingleMemberCloudData(m: UserProfileDoc): Promise<UserCloudData | null> {
  const accDocId = m.email ? getAccountDocId(m.email) : m.uid;

  try {
    // 1. Check user_data by uid
    let snap1 = await getDoc(doc(dbFirestore, "user_data", m.uid)).catch(() => null);
    if (snap1 && snap1.exists()) return snap1.data() as UserCloudData;

    // 2. Check user_data by accDocId
    if (accDocId !== m.uid) {
      let snap2 = await getDoc(doc(dbFirestore, "user_data", accDocId)).catch(() => null);
      if (snap2 && snap2.exists()) return snap2.data() as UserCloudData;
    }
  } catch (e: any) {
    if (String(e?.message || e).includes("resource-exhausted")) {
      console.warn("Firestore quota limit reached while loading member data.");
    } else {
      console.error("Error loading member cloud data:", e);
    }
  }

  return null;
}

function getMemberStatsForDate(uData?: UserCloudData, targetDate?: string) {
  if (!uData) return { quranPct: 0, athkarPct: 0, prayerPct: 0, habitsPct: 0, totalAvg: 0 };
  if (!targetDate) {
    const s = getMemberStats(uData);
    const totalAvg = Math.round((s.quranPct + s.athkarPct + s.prayerPct + s.habitsPct) / 4);
    return { ...s, totalAvg };
  }

  // 1. Quran % on targetDate
  let quranPct = 0;
  if (uData.quranDailyReading && Array.isArray(uData.quranDailyReading)) {
    const r = uData.quranDailyReading.find((x: any) => x.date === targetDate);
    if (r) {
      quranPct = r.completed || (r.pages_read || 0) > 0 ? 100 : 0;
    }
  }

  // 2. Athkar % on targetDate
  let athkarPct = 0;
  const thikrItems = uData.thikrItems && Array.isArray(uData.thikrItems) ? uData.thikrItems : [];
  if (thikrItems.length > 0) {
    let sumThikrPct = 0;
    let counted = 0;
    thikrItems.forEach((item: any) => {
      const target = item.target_count || 1;
      let curr = 0;
      let isDone = false;
      if (uData.thikrProgress && Array.isArray(uData.thikrProgress)) {
        const prog = uData.thikrProgress.find((tp: any) => tp.thikr_item_id === item.id && tp.date === targetDate);
        if (prog) {
          curr = prog.current_count || 0;
          isDone = prog.completed || false;
          if (curr > 0 || isDone) counted++;
        }
      }
      if (isDone || curr > 0) {
        const pct = isDone || curr >= target ? 100 : Math.min(100, Math.round((curr / target) * 100));
        sumThikrPct += pct;
      }
    });
    if (counted > 0) {
      athkarPct = Math.round(sumThikrPct / thikrItems.length);
    }
  }

  // 3. Prayer % on targetDate
  let prayerPct = 0;
  if (uData.prayerLogs && Array.isArray(uData.prayerLogs)) {
    const pl = uData.prayerLogs.find((p: any) => p.date === targetDate);
    if (pl) {
      let checked = 0;
      ["fajr", "dhuhr", "asr", "maghrib", "isha"].forEach((k) => {
        if (pl[k]) checked++;
      });
      prayerPct = Math.round((checked / 5) * 100);
    }
  }

  // 4. Habits % on targetDate
  let habitsPct = 0;
  const customHabits = uData.customHabits && Array.isArray(uData.customHabits) ? uData.customHabits : [];
  if (customHabits.length > 0) {
    let sumHabitPct = 0;
    let counted = 0;
    customHabits.forEach((h: any) => {
      let isDone = false;
      if (uData.customHabitProgress && Array.isArray(uData.customHabitProgress)) {
        const hp = uData.customHabitProgress.find((p: any) => p.habit_id === h.id && p.date === targetDate);
        if (hp && (hp.completed || (hp.count || 0) > 0)) {
          isDone = true;
          counted++;
        }
      }
      sumHabitPct += isDone ? 100 : 0;
    });
    if (counted > 0) {
      habitsPct = Math.round(sumHabitPct / customHabits.length);
    }
  }

  const totalAvg = Math.round((quranPct + athkarPct + prayerPct + habitsPct) / 4);
  return { quranPct, athkarPct, prayerPct, habitsPct, totalAvg };
}

function hasMemberSubmittedOnDate(uData?: UserCloudData, targetDate?: string): boolean {
  if (!uData || !targetDate) return false;
  if (uData.prayerLogs && uData.prayerLogs.some((p: any) => p.date === targetDate)) return true;
  if (uData.thikrProgress && uData.thikrProgress.some((t: any) => t.date === targetDate && ((t.current_count || 0) > 0 || t.completed))) return true;
  if (uData.customHabitProgress && uData.customHabitProgress.some((h: any) => h.date === targetDate && ((h.count || 0) > 0 || h.completed))) return true;
  if (uData.quranDailyReading && uData.quranDailyReading.some((q: any) => q.date === targetDate && ((q.pages_read || 0) > 0 || q.completed))) return true;

  const stats = getMemberStatsForDate(uData, targetDate);
  return stats.totalAvg > 0 || stats.quranPct > 0 || stats.athkarPct > 0 || stats.prayerPct > 0 || stats.habitsPct > 0;
}

function getOverallMemberStats(uData: UserCloudData | undefined, uniqueDates: string[]) {
  if (!uData || !uniqueDates || uniqueDates.length === 0) {
    return { quranPct: 0, athkarPct: 0, prayerPct: 0, habitsPct: 0, totalAvgPct: 0, submittedDaysCount: 0 };
  }

  let submittedDaysCount = 0;
  let sumQuran = 0;
  let sumAthkar = 0;
  let sumPrayer = 0;
  let sumHabits = 0;

  for (const dateStr of uniqueDates) {
    const isSubmitted = hasMemberSubmittedOnDate(uData, dateStr);
    if (isSubmitted) {
      submittedDaysCount++;
    }
    const s = getMemberStatsForDate(uData, dateStr);
    sumQuran += s.quranPct;
    sumAthkar += s.athkarPct;
    sumPrayer += s.prayerPct;
    sumHabits += s.habitsPct;
  }

  const totalDays = Math.max(1, uniqueDates.length);

  const quranPct = Math.round(sumQuran / totalDays);
  const athkarPct = Math.round(sumAthkar / totalDays);
  const prayerPct = Math.round(sumPrayer / totalDays);
  const habitsPct = Math.round(sumHabits / totalDays);
  const totalAvgPct = Math.round((quranPct + athkarPct + prayerPct + habitsPct) / 4);

  return {
    quranPct,
    athkarPct,
    prayerPct,
    habitsPct,
    totalAvgPct,
    submittedDaysCount,
  };
}

function getUniqueSubmissionDates(
  members: UserProfileDoc[],
  userDataMap: Record<string, UserCloudData>,
  ascending: boolean = true
): string[] {
  const dates = new Set<string>();
  const todayStr = isoDate();
  dates.add(todayStr);

  members.forEach((m) => {
    const uData = getUserDataForMember(m, userDataMap);
    if (!uData) return;
    if (uData.prayerLogs && Array.isArray(uData.prayerLogs)) {
      uData.prayerLogs.forEach((p: any) => p.date && p.date <= todayStr && dates.add(p.date));
    }
    if (uData.thikrProgress && Array.isArray(uData.thikrProgress)) {
      uData.thikrProgress.forEach((t: any) => t.date && t.date <= todayStr && dates.add(t.date));
    }
    if (uData.customHabitProgress && Array.isArray(uData.customHabitProgress)) {
      uData.customHabitProgress.forEach((h: any) => h.date && h.date <= todayStr && dates.add(h.date));
    }
    if (uData.quranDailyReading && Array.isArray(uData.quranDailyReading)) {
      uData.quranDailyReading.forEach((q: any) => q.date && q.date <= todayStr && dates.add(q.date));
    }
  });

  const array = Array.from(dates);
  array.sort((a, b) => (ascending ? a.localeCompare(b) : b.localeCompare(a)));
  return array;
}

function MosqueIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 12C7 8 9.5 5.5 12 4C14.5 5.5 17 8 17 12Z" fill="white" />
      <path d="M12 2v2" />
      <circle cx="12" cy="1.8" r="0.8" fill="currentColor" />
      <path d="M4 21V12h16v9" fill="white" />
      <path d="M10 21v-4a2 2 0 0 1 4 0v4" fill="white" />
      <path d="M2 21V9.5l1.5-1.5L5 9.5V21" fill="white" />
      <path d="M19 21V9.5l1.5-1.5L22 9.5V21" fill="white" />
      <path d="M1 21h22" />
    </svg>
  );
}

const PrayerIcon = MosqueIcon;

function TasbihIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7.5" r="1.8" fill="white" />
      <circle cx="16" cy="9.5" r="1.8" fill="white" />
      <circle cx="17.5" cy="13.5" r="1.8" fill="white" />
      <circle cx="15" cy="17.2" r="1.8" fill="white" />
      <circle cx="9" cy="17.2" r="1.8" fill="white" />
      <circle cx="6.5" cy="13.5" r="1.8" fill="white" />
      <circle cx="8" cy="9.5" r="1.8" fill="white" />
      <path d="M12 3.5v2.2" />
      <circle cx="12" cy="3.5" r="1.2" fill="white" />
      <path d="M10.5 2h3" />
    </svg>
  );
}

function getPctBadgeClass(pct: number) {
  if (pct < 25) {
    return "bg-rose-100 text-rose-950 border-rose-300 font-black shadow-2xs";
  } else if (pct < 50) {
    return "bg-amber-100 text-amber-950 border-amber-300 font-black shadow-2xs";
  } else if (pct < 75) {
    return "bg-sky-100 text-sky-950 border-sky-300 font-black shadow-2xs";
  } else {
    return "bg-emerald-100 text-emerald-950 border-emerald-300 font-black shadow-2xs";
  }
}

function getPctTextColorClass(pct: number) {
  if (pct < 25) return "text-rose-600 font-black";
  if (pct < 50) return "text-amber-600 font-black";
  if (pct < 75) return "text-sky-600 font-black";
  return "text-emerald-600 font-black";
}

function MemberDetailView({ member, uData, activeCategory, uniqueDates = [] }: { member: UserProfileDoc; uData?: UserCloudData; activeCategory?: string; uniqueDates?: string[] }) {
  if (!uData) {
    return (
      <div className="p-4 bg-slate-50 rounded-2xl text-center text-xs text-slate-500 font-medium my-2">
        لم يقم هذا العضو برفع سجلاته للسحابة بعد.
      </div>
    );
  }

  const s = getOverallMemberStats(uData, uniqueDates);

  // 1. Quran
  let selectedSurahIds: number[] = [];
  if (uData?.dailyQuranSelection && Array.isArray(uData.dailyQuranSelection) && uData.dailyQuranSelection.length > 0) {
    const sorted = [...uData.dailyQuranSelection].reverse();
    for (const sel of sorted) {
      if (sel.surah_ids && Array.isArray(sel.surah_ids) && sel.surah_ids.length > 0) {
        selectedSurahIds = sel.surah_ids;
        break;
      }
    }
  }
  if (selectedSurahIds.length === 0 && uData?.quranSurahState && Array.isArray(uData.quranSurahState)) {
    selectedSurahIds = uData.quranSurahState.map((s: any) => s.surah_id).filter(Boolean);
  }

  // 2. Athkar
  const thikrItemList = uData?.thikrItems || [];

  // 3. Prayer
  const prayerLogs = uData?.prayerLogs || [];

  // 4. Habits
  const customHabits = uData?.customHabits || [];

  // Unified list of dates for daily breakdown
  const displayDates = uniqueDates.length > 0 
    ? [...uniqueDates].sort().reverse()
    : Array.from(new Set([
        ...(prayerLogs || []).map((p: any) => p.date),
        ...(uData?.thikrProgress || []).map((t: any) => t.date),
        ...(uData?.customHabitProgress || []).map((h: any) => h.date),
        ...(uData?.quranDailyReading || []).map((q: any) => q.date)
      ])).filter(Boolean).sort().reverse();

  const showAll = !activeCategory || activeCategory === "mostDays" || activeCategory === "name";

  return (
    <div className="space-y-4 p-4 bg-amber-50/50 rounded-2xl border border-amber-300 my-2 text-right dir-rtl animate-in fade-in duration-150 shadow-sm">

      {showAll && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[10px]">
          <div className="bg-white p-2 rounded-xl border border-amber-200 shadow-2xs">
            <span className="text-amber-800 font-bold flex items-center justify-center gap-1">
              <BookOpen className="h-3 w-3 text-amber-700" /> القرآن الكريم
            </span>
            <span className="font-black text-amber-700 text-xs tabular-nums">{s.quranPct}%</span>
          </div>
          <div className="bg-white p-2 rounded-xl border border-indigo-200 shadow-2xs">
            <span className="text-indigo-800 font-bold flex items-center justify-center gap-1">
              <TasbihIcon className="h-3 w-3 text-indigo-700" /> الأذكار اليومية
            </span>
            <span className="font-black text-indigo-700 text-xs tabular-nums">{s.athkarPct}%</span>
          </div>
          <div className="bg-white p-2 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="text-emerald-800 font-bold flex items-center justify-center gap-1">
              <PrayerIcon className="h-3 w-3 text-emerald-700" /> التزام الصلاة
            </span>
            <span className="font-black text-emerald-700 text-xs tabular-nums">{s.prayerPct}%</span>
          </div>
          <div className="bg-white p-2 rounded-xl border border-purple-200 shadow-2xs">
            <span className="text-purple-800 font-bold flex items-center justify-center gap-1">
              <Award className="h-3 w-3 text-purple-700" /> الأخلاق والسنن
            </span>
            <span className="font-black text-purple-700 text-xs tabular-nums">{s.habitsPct}%</span>
          </div>
        </div>
      )}

      {/* 1. Quran Daily Log Details */}
      {(showAll || activeCategory === "quran") && (
        <div className="p-3 bg-white rounded-xl border border-amber-200/80 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-amber-100">
            <h4 className="text-xs font-black text-amber-900 flex items-center gap-1">
              <BookOpen className="h-3.5 w-3.5 text-amber-700" /> ورد القرآن - المتابعة اليومية لكل يوم
            </h4>
            <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              المعدل: {s.quranPct}%
            </span>
          </div>

          {/* Surahs selected summary */}
          {selectedSurahIds.length > 0 && (
            <div className="p-2 bg-amber-50/60 rounded-lg border border-amber-100 text-[10px] space-y-1">
              <span className="font-bold text-amber-900 block">السور المحددة بورد القرآن:</span>
              <div className="flex flex-wrap gap-1">
                {selectedSurahIds.map((sId) => {
                  const state = uData?.quranSurahState?.find((qs: any) => qs.surah_id === sId);
                  const name = surahName(sId);
                  const totalPages = totalPagesFor(sId);
                  const reached = state?.max_page_reached || state?.current_page || 0;
                  const pct = state?.is_completed || state?.percent_complete === 100
                    ? 100
                    : Math.min(100, Math.round((reached / totalPages) * 100));
                  return (
                    <span key={sId} className="px-2 py-0.5 bg-white rounded border border-amber-200 font-bold text-slate-800">
                      {name} ({reached}/{totalPages} ص) {pct === 100 ? "✓" : `${pct}%`}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Daily Reading Logs across dates */}
          {displayDates.length > 0 ? (
            <div className="space-y-1.5 text-[10px]">
              {displayDates.map((dateStr) => {
                const dayStats = getMemberStatsForDate(uData, dateStr);
                const qLog = uData?.quranDailyReading?.find((q: any) => q.date === dateStr);
                const isRead = qLog ? (qLog.completed || (qLog.pages_read || 0) > 0) : dayStats.quranPct > 0;
                const pagesRead = qLog?.pages_read || 0;

                return (
                  <div key={dateStr} className="flex flex-wrap items-center justify-between p-2 bg-amber-50/40 rounded-lg border border-amber-100 gap-1.5">
                    <span className="font-bold text-slate-800 dir-ltr">{dateStr}</span>
                    <div className="flex items-center gap-1 font-bold">
                      {isRead ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 font-black">
                          تمت قراءة الورد اليومي ✓ {pagesRead > 0 && `(${pagesRead} ص)`}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-400">
                          لم تتم قراءة ورد القرآن ✗
                        </span>
                      )}
                    </div>
                    <span className={`font-black text-[10px] bg-white px-2 py-0.5 rounded border ${isRead ? "text-emerald-800 border-emerald-200" : "text-amber-800 border-amber-200"}`}>
                      {isRead ? "100%" : "0%"}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 font-medium">لم يتم تسجيل قراءة قرآن لأي يوم بعد.</p>
          )}
        </div>
      )}

      {/* 2. Athkar Daily Log Details */}
      {(showAll || activeCategory === "athkar") && (
        <div className="p-3 bg-white rounded-xl border border-indigo-200/80 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-indigo-100">
            <h4 className="text-xs font-black text-indigo-900 flex items-center gap-1">
              <TasbihIcon className="h-3.5 w-3.5 text-indigo-700" /> ورد الأذكار - المتابعة اليومية لكل يوم
            </h4>
            <span className="text-[10px] font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
              المعدل: {s.athkarPct}%
            </span>
          </div>

          {displayDates.length > 0 ? (
            <div className="space-y-1.5 text-[10px]">
              {displayDates.map((dateStr) => {
                const dayStats = getMemberStatsForDate(uData, dateStr);
                return (
                  <div key={dateStr} className="flex flex-wrap items-center justify-between p-2 bg-indigo-50/40 rounded-lg border border-indigo-100 gap-1.5">
                    <span className="font-bold text-slate-800 dir-ltr">{dateStr}</span>
                    <div className="flex flex-wrap items-center gap-1 font-bold text-[10px]">
                      {thikrItemList.length === 0 ? (
                        <span className="text-slate-400">لا توجد أذكار مخصصة</span>
                      ) : (
                        thikrItemList.map((item: any) => {
                          const target = item.target_count || 1;
                          let curr = 0;
                          let isDone = false;
                          if (uData?.thikrProgress && Array.isArray(uData.thikrProgress)) {
                            const prog = uData.thikrProgress.find((tp: any) => tp.thikr_item_id === item.id && tp.date === dateStr);
                            if (prog) {
                              curr = prog.current_count || 0;
                              isDone = prog.completed || curr >= target;
                            }
                          }
                          const name = item.text || item.name || "ذِكر";
                          return (
                            <span
                              key={item.id || name}
                              className={`px-1.5 py-0.5 rounded ${isDone ? "bg-indigo-100 text-indigo-950 font-black border border-indigo-200" : "bg-slate-100 text-slate-400"}`}
                            >
                              {name}: {curr}/{target} {isDone ? "✓" : "✗"}
                            </span>
                          );
                        })
                      )}
                    </div>
                    <span className="font-black text-indigo-800 text-[10px] bg-white px-2 py-0.5 rounded border border-indigo-200">
                      {dayStats.athkarPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 font-medium">لا توجد أذكار مسجلة لأي يوم بعد.</p>
          )}
        </div>
      )}

      {/* 3. Prayer Daily Log Details */}
      {(showAll || activeCategory === "prayer") && (
        <div className="p-3 bg-white rounded-xl border border-emerald-200/80 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-emerald-100">
            <h4 className="text-xs font-black text-emerald-900 flex items-center gap-1">
              <PrayerIcon className="h-3.5 w-3.5 text-emerald-700" /> التزام الصلاة على وقتها - المتابعة اليومية لكل يوم
            </h4>
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
              المعدل: {s.prayerPct}%
            </span>
          </div>

          {displayDates.length > 0 ? (
            <div className="space-y-1.5 text-[10px]">
              {displayDates.map((dateStr) => {
                const pl = uData?.prayerLogs?.find((p: any) => p.date === dateStr);
                const checked = pl ? ["fajr", "dhuhr", "asr", "maghrib", "isha"].filter((k) => pl[k]).length : 0;
                const dayPct = Math.round((checked / 5) * 100);

                return (
                  <div key={dateStr} className="flex flex-wrap items-center justify-between p-2 bg-emerald-50/50 rounded-lg border border-emerald-100 gap-1.5">
                    <span className="font-bold text-slate-800 dir-ltr">{dateStr}</span>
                    <div className="flex items-center gap-1 font-bold text-[10px]">
                      <span className={`px-1.5 py-0.5 rounded ${pl?.fajr ? "bg-emerald-200 text-emerald-950 font-black" : "bg-slate-100 text-slate-400"}`}>فجر {pl?.fajr ? "✓" : "✗"}</span>
                      <span className={`px-1.5 py-0.5 rounded ${pl?.dhuhr ? "bg-emerald-200 text-emerald-950 font-black" : "bg-slate-100 text-slate-400"}`}>ظهر {pl?.dhuhr ? "✓" : "✗"}</span>
                      <span className={`px-1.5 py-0.5 rounded ${pl?.asr ? "bg-emerald-200 text-emerald-950 font-black" : "bg-slate-100 text-slate-400"}`}>عصر {pl?.asr ? "✓" : "✗"}</span>
                      <span className={`px-1.5 py-0.5 rounded ${pl?.maghrib ? "bg-emerald-200 text-emerald-950 font-black" : "bg-slate-100 text-slate-400"}`}>مغرب {pl?.maghrib ? "✓" : "✗"}</span>
                      <span className={`px-1.5 py-0.5 rounded ${pl?.isha ? "bg-emerald-200 text-emerald-950 font-black" : "bg-slate-100 text-slate-400"}`}>عشاء {pl?.isha ? "✓" : "✗"}</span>
                    </div>
                    <span className="font-black text-emerald-800 text-[10px] bg-white px-2 py-0.5 rounded border border-emerald-200">
                      {dayPct}% ({checked}/5)
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 font-medium">لا توجد سجلات صلاة مسجلة لهذا العضو بعد.</p>
          )}
        </div>
      )}

      {/* 4. Habits / Ethics Daily Log Details */}
      {(showAll || activeCategory === "habits") && (
        <div className="p-3 bg-white rounded-xl border border-purple-200/80 space-y-2">
          <div className="flex items-center justify-between pb-1 border-b border-purple-100">
            <h4 className="text-xs font-black text-purple-900 flex items-center gap-1">
              <Award className="h-3.5 w-3.5 text-purple-700" /> الأخلاق والسنن - المتابعة اليومية لكل يوم
            </h4>
            <span className="text-[10px] font-bold text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              المعدل: {s.habitsPct}%
            </span>
          </div>

          {displayDates.length > 0 ? (
            <div className="space-y-1.5 text-[10px]">
              {displayDates.map((dateStr) => {
                const dayStats = getMemberStatsForDate(uData, dateStr);
                return (
                  <div key={dateStr} className="flex flex-wrap items-center justify-between p-2 bg-purple-50/40 rounded-lg border border-purple-100 gap-1.5">
                    <span className="font-bold text-slate-800 dir-ltr">{dateStr}</span>
                    <div className="flex flex-wrap items-center gap-1 font-bold text-[10px]">
                      {customHabits.length === 0 ? (
                        <span className="text-slate-400">لا توجد أخلاق مخصصة</span>
                      ) : (
                        customHabits.map((h: any) => {
                          let isDone = false;
                          if (uData?.customHabitProgress && Array.isArray(uData.customHabitProgress)) {
                            const hp = uData.customHabitProgress.find((p: any) => p.habit_id === h.id && p.date === dateStr);
                            if (hp && (hp.completed || (hp.count || 0) > 0)) isDone = true;
                          }
                          return (
                            <span
                              key={h.id || h.name}
                              className={`px-1.5 py-0.5 rounded ${isDone ? "bg-purple-100 text-purple-950 font-black border border-purple-200" : "bg-slate-100 text-slate-400"}`}
                            >
                              {h.name}: {isDone ? "✓" : "✗"}
                            </span>
                          );
                        })
                      )}
                    </div>
                    <span className="font-black text-purple-800 text-[10px] bg-white px-2 py-0.5 rounded border border-purple-200">
                      {dayStats.habitsPct}%
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[10px] text-slate-500 font-medium">لم يتم إضافة أخلاق أو سنن بعد.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AdminPage() {
  const { currentUser, toggleAdminRole } = useAuth();
  const navigate = useNavigate();

  const [passcode, setPasscode] = useState("");
  const [passError, setPassError] = useState("");
  const [members, setMembers] = useState<UserProfileDoc[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfileDoc | null>(null);
  const [userDataMap, setUserDataMap] = useState<Record<string, UserCloudData>>({});
  const [fetchingData, setFetchingData] = useState(false);

  // New Global Habit Form State
  const [habitName, setHabitName] = useState("");
  const [habitDesc, setHabitDesc] = useState("");
  const [habitDuration, setHabitDuration] = useState<"week" | "month" | "lifetime">("week");
  const [flowerType, setFlowerType] = useState<"tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender">("tulip");
  const [habitMsg, setHabitMsg] = useState("");
  const [addingHabit, setAddingHabit] = useState(false);

  // New Global Thikr Form State
  const [thikrName, setThikrName] = useState("");
  const [thikrCount, setThikrCount] = useState(100);
  const [thikrDuration, setThikrDuration] = useState<"week" | "month" | "lifetime">("week");
  const [thikrMsg, setThikrMsg] = useState("");
  const [addingThikr, setAddingThikr] = useState(false);

  // Real-time Global Lists
  const [globalHabits, setGlobalHabits] = useState<any[]>([]);
  const [globalAthkar, setGlobalAthkar] = useState<any[]>([]);

  // Edit Modals State
  const [editingHabit, setEditingHabit] = useState<{
    id: string;
    oldName: string;
    name: string;
    description: string;
    duration_type: "week" | "month" | "lifetime";
    flower_type: "tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender";
  } | null>(null);

  const [editingThikr, setEditingThikr] = useState<{
    id: string;
    oldName: string;
    name: string;
    target_count: number;
    duration_scope: "week" | "month" | "lifetime";
  } | null>(null);

  // Selected Date for Excel export / viewing
  const [exportDate, setExportDate] = useState(isoDate());

  // Collapsible & View Control UI state
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [showThikrForm, setShowThikrForm] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});
  const [expandedMemberKey, setExpandedMemberKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"byDate" | "byMember">("byDate");
  const [onlySubmitted, setOnlySubmitted] = useState<boolean>(false);
  const [dateSortAsc, setDateSortAsc] = useState<boolean>(true);
  const [memberSortMode, setMemberSortMode] = useState<"mostDays" | "quran" | "athkar" | "prayer" | "habits" | "name">("mostDays");
  const [showLeaderboard, setShowLeaderboard] = useState<boolean>(false);
  const [selectedLeaderboardMember, setSelectedLeaderboardMember] = useState<UserProfileDoc | null>(null);

  // Load all users & cloud data & global items from Firestore in real-time
  useEffect(() => {
    if (!currentUser?.isAdmin) return;

    setLoadingMembers(true);

    // 1. Real-time listener for users collection
    const unsubUsers = onSnapshot(collection(dbFirestore, "users"), (snap) => {
      const list: UserProfileDoc[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          uid: d.id,
          displayName: data.displayName || "عضو بدون اسم",
          email: data.email || "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          isAdmin: data.isAdmin,
        });
      });
      setMembers(list);
      setLoadingMembers(false);

      // Members list loaded; user_data listener handles live progress updates automatically
      setUserDataMap((prevMap) => {
        const missing = list.filter((m) => !prevMap[m.uid]);
        if (missing.length > 0) {
          missing.forEach((m) => {
            loadSingleMemberCloudData(m).then((data) => {
              if (data) {
                setUserDataMap((p) => ({ ...p, [m.uid]: data }));
              }
            });
          });
        }
        return prevMap;
      });
    }, (err) => {
      const errStr = String(err?.message || err || "");
      if (errStr.includes("resource-exhausted") || errStr.includes("quota")) {
        setQuotaExceededCooldown(12);
      } else {
        console.error("Error subscribing to users collection:", err);
      }
      setLoadingMembers(false);
    });

    // 2. Real-time listener for user_data collection
    const unsubUserData = onSnapshot(collection(dbFirestore, "user_data"), (snap) => {
      const liveDataMap: Record<string, UserCloudData> = {};
      snap.forEach((d) => {
        liveDataMap[d.id] = d.data() as UserCloudData;
      });

      setUserDataMap((prev) => {
        const updated = { ...prev };
        Object.entries(liveDataMap).forEach(([id, data]) => {
          updated[id] = data;
        });
        return updated;
      });
    }, (err) => {
      const errStr = String(err?.message || err || "");
      if (errStr.includes("resource-exhausted") || errStr.includes("quota")) {
        setQuotaExceededCooldown(12);
      } else {
        console.error("Error subscribing to user_data collection:", err);
      }
    });

    // 3. Real-time listener for global_habits collection
    const unsubGlobalHabits = onSnapshot(collection(dbFirestore, "global_habits"), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setGlobalHabits(list);
    }, (err) => {
      const errStr = String(err?.message || err || "");
      if (errStr.includes("resource-exhausted") || errStr.includes("quota")) {
        setQuotaExceededCooldown(12);
      } else {
        console.error("Error subscribing to global_habits collection:", err);
      }
    });

    // 4. Real-time listener for global_athkar collection
    const unsubGlobalAthkar = onSnapshot(collection(dbFirestore, "global_athkar"), (snap) => {
      const list: any[] = [];
      snap.forEach((d) => {
        list.push({ id: d.id, ...d.data() });
      });
      setGlobalAthkar(list);
    }, (err) => {
      const errStr = String(err?.message || err || "");
      if (errStr.includes("resource-exhausted") || errStr.includes("quota")) {
        setQuotaExceededCooldown(12);
      } else {
        console.error("Error subscribing to global_athkar collection:", err);
      }
    });

    return () => {
      unsubUsers();
      unsubUserData();
      unsubGlobalHabits();
      unsubGlobalAthkar();
    };
  }, [currentUser?.isAdmin]);

  const fetchMembersList = async () => {
    setLoadingMembers(true);
    try {
      const snap = await getDocs(collection(dbFirestore, "users"));
      const list: UserProfileDoc[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          uid: d.id,
          displayName: data.displayName || "عضو بدون اسم",
          email: data.email || "",
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          isAdmin: data.isAdmin,
        });
      });
      setMembers(list);
      setLoadingMembers(false);

      list.forEach((m) => {
        loadSingleMemberCloudData(m).then((data) => {
          if (data) {
            setUserDataMap((prev) => ({ ...prev, [m.uid]: data }));
          }
        });
      });
    } catch (err) {
      console.error("Error fetching members list:", err);
      setLoadingMembers(false);
    }
  };

  // Load user cloud data details
  const fetchUserData = async (member: UserProfileDoc) => {
    setFetchingData(true);
    try {
      const data = await loadSingleMemberCloudData(member);
      if (data) {
        setUserDataMap((prev) => ({ ...prev, [member.uid]: data }));
      }
    } catch (err) {
      console.error("Error fetching user cloud data:", err);
    } finally {
      setFetchingData(false);
    }
  };

  const handleAdminAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError("");
    const success = await toggleAdminRole(passcode);
    if (!success) {
      setPassError("رمز مرور المدير غير صحيح.");
    }
  };

  const handleAddGlobalHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!habitName.trim()) return;
    setAddingHabit(true);
    setHabitMsg("");
    try {
      const days = habitDuration === "week" ? 7 : habitDuration === "month" ? 30 : 36500;
      await createGlobalHabit({
        name: habitName.trim(),
        description: habitDesc.trim(),
        tracking_type: "once_daily",
        target_count: 1,
        duration_type: habitDuration as any,
        duration_days: days,
        flower_type: flowerType as any,
      });
      setHabitMsg("✨ تم نشر الخُلق بنجاح لجميع مستخدمي التطبيق!");
      setHabitName("");
      setHabitDesc("");
    } catch (err: any) {
      setHabitMsg("❌ حدث خطأ عند إضافة الخُلق العام");
    } finally {
      setAddingHabit(false);
    }
  };

  const handleUpdateGlobalHabitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHabit || !editingHabit.name.trim()) return;
    try {
      const days = editingHabit.duration_type === "week" ? 7 : editingHabit.duration_type === "month" ? 30 : 36500;
      await updateGlobalHabit(editingHabit.id, editingHabit.oldName, {
        name: editingHabit.name.trim(),
        description: editingHabit.description.trim(),
        duration_type: editingHabit.duration_type as any,
        duration_days: days,
        flower_type: editingHabit.flower_type as any,
      });
      setEditingHabit(null);
    } catch (err) {
      console.error("Failed to update global habit:", err);
    }
  };

  const handleDeleteGlobalHabit = async (docId: string, name?: string) => {
    if (!window.confirm("هل أنت تأكد من إزالة هذا الخُلق العام؟")) return;
    try {
      await deleteGlobalHabit(docId, name);
    } catch (err) {
      console.error("Failed to delete global habit:", err);
    }
  };

  const handleAddGlobalThikr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thikrName.trim()) return;
    setAddingThikr(true);
    setThikrMsg("");
    try {
      await createGlobalThikr({
        name: thikrName.trim(),
        target_count: Math.max(1, thikrCount),
        duration_scope: thikrDuration,
      });
      setThikrMsg("✨ تم نشر ورْد الذِكر بنجاح لجميع مستخدمي التطبيق!");
      setThikrName("");
      setThikrCount(100);
    } catch (err: any) {
      setThikrMsg("❌ حدث خطأ عند إضافة ورْد الذِكر العام");
    } finally {
      setAddingThikr(false);
    }
  };

  const handleUpdateGlobalThikrSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingThikr || !editingThikr.name.trim()) return;
    try {
      await updateGlobalThikr(editingThikr.id, editingThikr.oldName, {
        name: editingThikr.name.trim(),
        target_count: Math.max(1, editingThikr.target_count),
        duration_scope: editingThikr.duration_scope,
      });
      setEditingThikr(null);
    } catch (err) {
      console.error("Failed to update global thikr:", err);
    }
  };

  const handleDeleteGlobalThikr = async (docId: string, name?: string) => {
    if (!window.confirm("هل أنت تأكد من إزالة هذا ورْد الذكر العام؟")) return;
    try {
      await deleteGlobalThikr(docId, name);
    } catch (err) {
      console.error("Failed to delete global thikr:", err);
    }
  };

  // Generate & Download Detailed Excel / CSV File with distinct columns
  const exportToExcel = async () => {
    const uniqueDates = getUniqueSubmissionDates(members, userDataMap, true);

    let tableRowsHtml = "";

    uniqueDates.forEach((d) => {
      const dateObj = new Date(d);
      const dayName = isNaN(dateObj.getTime()) ? d : formatArabicDate(dateObj);

      members.forEach((m) => {
        const data = userDataMap[m.uid];
        const isSubmitted = hasMemberSubmittedOnDate(data, d);
        const stats = getMemberStatsForDate(data, d);

        tableRowsHtml += `
          <tr style="${isSubmitted ? 'background-color: #f0fdf4;' : 'background-color: #ffffff;'}">
            <td style="padding: 8px; border: 1px solid #cbd5e1; font-weight: bold; text-align: right;">${m.displayName || "بدون اسم"}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: left; dir: ltr;">${m.email || "—"}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${d}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">${dayName}</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #b45309;">${stats.quranPct}%</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #3730a3;">${stats.athkarPct}%</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #065f46;">${stats.prayerPct}%</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; color: #581c87;">${stats.habitsPct}%</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; background-color: #f1f5f9;">${stats.totalAvg}%</td>
            <td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center; font-weight: bold; ${isSubmitted ? 'color: #15803d; background-color: #dcfce7;' : 'color: #94a3b8;'}">
              ${isSubmitted ? "قام بالتعبئة ✓" : "لم يتم التعبئة"}
            </td>
          </tr>
        `;
      });
    });

    const excelHtml = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
        <!--[if gte mso 9]>
        <xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets>
              <x:ExcelWorksheet>
                <x:Name>تقرير المتابعة</x:Name>
                <x:WorksheetOptions>
                  <x:DisplayRightToLeft/>
                </x:WorksheetOptions>
              </x:ExcelWorksheet>
            </x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml>
        <![endif]-->
        <style>
          body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; }
          table { border-collapse: collapse; width: 100%; direction: rtl; }
          th { background-color: #0d9488; color: #ffffff; font-weight: bold; padding: 10px; border: 1px solid #0f766e; text-align: center; }
        </style>
      </head>
      <body dir="rtl">
        <h2 style="text-align: center; color: #0f766e; font-family: sans-serif;">تقرير متابعة الورد اليومي للأعضاء 📊</h2>
        <table>
          <thead>
            <tr>
              <th>اسم العضو</th>
              <th>البريد الإلكتروني</th>
              <th>التاريخ</th>
              <th>اليوم</th>
              <th>ورد القرآن الكريم (%)</th>
              <th>ورد الأذكار (%)</th>
              <th>التزام الصلاة (%)</th>
              <th>الأخلاق والسنن (%)</th>
              <th>المعدل الإجمالي (%)</th>
              <th>حالة التعبئة</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(["\uFEFF" + excelHtml], { type: "application/vnd.ms-excel;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `تقرير_متابعة_وردك_اليومي.xls`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // If user is not Admin yet, show Admin Login Box
  if (!currentUser?.isAdmin) {
    return (
      <div dir="rtl" className="screen min-h-[100dvh] px-4 pt-8 pb-36 text-right max-w-md mx-auto">
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 mb-6 cursor-pointer"
        >
          <ArrowRight className="h-4 w-4" /> العودة للرئيسية
        </button>

        <div className="rounded-3xl border border-amber-200 bg-white/90 p-6 shadow-sm backdrop-blur text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-800 mb-4 shadow-xs">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">دخول لوحة المدير</h1>
          <p className="text-xs text-slate-500 mt-1 mb-6">
            أدخل رمز مرور المدير للوصول لإدارة الأعضاء وإضافة خلق عام وتصدير تقارير الإكسل.
          </p>

          <form onSubmit={handleAdminAuth} className="space-y-4">
            <input
              type="password"
              placeholder="أدخل رمز مرور المدير السري"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 text-center font-bold"
            />
            {passError && <p className="text-xs text-rose-600 font-bold">{passError}</p>}

            <button
              type="submit"
              className="w-full py-3 rounded-2xl bg-yellow-400 text-slate-950 font-black text-sm shadow-sm hover:bg-yellow-300 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2 border border-yellow-500/40"
            >
              <ShieldCheck className="h-4 w-4 text-slate-950" /> تفعيل وضع المدير
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="screen min-h-[100dvh] px-4 pt-6 pb-36 text-right max-w-4xl mx-auto">
      {/* Top Header */}
      <header className="pb-6 border-b border-slate-200/80 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-100 text-amber-800 font-extrabold">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900">لوحة التحكم</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => toggleAdminRole()}
            className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 cursor-pointer"
          >
            خروج من وضع المدير
          </button>
        </div>
      </header>

      {/* 1. Add Global Habit Section (Collapsible - Ultra Slim when closed) */}
      <section className={`mb-3 rounded-2xl border transition-all ${
        showHabitForm
          ? "border-amber-300 bg-gradient-to-br from-amber-50/80 to-orange-50/40 p-4 shadow-xs"
          : "border-amber-200/80 bg-amber-50/40 hover:bg-amber-100/60 p-2 px-3 shadow-2xs"
      }`}>
        <div
          onClick={() => setShowHabitForm(!showHabitForm)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
            <h2 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>إضافة خُلُق عام ونشره للجميع 🌐</span>
              {globalHabits.length > 0 && !showHabitForm && (
                <span className="text-[10px] text-amber-900 font-bold bg-amber-100/80 px-1.5 py-0.2 rounded border border-amber-200">
                  ({globalHabits.length} منشور)
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            className="px-2.5 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-black transition-all flex items-center gap-1 border border-amber-300/50"
          >
            <span>{showHabitForm ? "إخفاء ✖" : "+"}</span>
            {showHabitForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {showHabitForm && (
          <div className="mt-4 pt-3 border-t border-amber-200/60 animate-in fade-in duration-150">
            <p className="text-xs text-slate-600 font-medium mb-4">
              يمكنك هنا إضافة خُلُق أو عمل صالح (مثل: إطعام طعام، صلة الرحم، غض البصر...). وتحديد مدته (هذا الأسبوع فقط، الشهر كامل، أو مدى الحياة).
            </p>

            <form onSubmit={handleAddGlobalHabit} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">اسم الخُلق أو العمل *</label>
                <input
                  type="text"
                  placeholder="مثال: إطعام طعام / الكلمة الطيبة..."
                  value={habitName}
                  onChange={(e) => setHabitName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">المدة المحددة ⏱️</label>
                <select
                  value={habitDuration}
                  onChange={(e: any) => setHabitDuration(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="week">📅 هذا الأسبوع فقط (7 أيام)</option>
                  <option value="month">🗓️ الشهر كامل (30 يوماً)</option>
                  <option value="lifetime">♾️ مدى الحياة (مستمر دائماً)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">نوع زهرة الخُلق 🌸</label>
                <select
                  value={flowerType}
                  onChange={(e: any) => setFlowerType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="tulip">🌷 توليب</option>
                  <option value="jasmine">🌼 ياسمين</option>
                  <option value="jouri">🌹 جوري</option>
                  <option value="violet">🪻 بنفسج</option>
                  <option value="daffodil">🌻 نرجس</option>
                  <option value="lavender">🪻 لافندر</option>
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="text-[11px] font-bold text-slate-700 block mb-1">وصف الخُلق والنصيحة المشجعة 📝</label>
                <input
                  type="text"
                  placeholder="مثال: حاول إدخال السرور على مسلم ولو بابتسامة أو كلمة طيبة..."
                  value={habitDesc}
                  onChange={(e) => setHabitDesc(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-3 flex items-center justify-between mt-2">
                {habitMsg && <span className="text-xs font-bold text-emerald-700">{habitMsg}</span>}
                <button
                  type="submit"
                  disabled={addingHabit}
                  className="mr-auto px-5 py-2.5 rounded-2xl bg-amber-400 text-slate-950 font-black text-xs shadow-xs hover:bg-amber-300 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5 border border-amber-500/40"
                >
                  <Plus className="h-4 w-4 text-slate-950" /> {addingHabit ? "جاري النشر..." : "نشر الخُلق للأعضاء"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List of Published Global Habits with Rename/Edit and Delete */}
        {globalHabits.length > 0 && (
          <div className="mt-6 border-t border-amber-200/60 pt-4">
            <h3 className="text-xs font-black text-amber-950 mb-3 flex items-center gap-1.5">
              <span>🌸 الأخلاق العامة المنشورة حالياً ({globalHabits.length})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {globalHabits.map((gh) => (
                <div key={gh.id} className="bg-white/90 p-3 rounded-2xl border border-amber-200 shadow-2xs flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-extrabold text-xs text-slate-900 truncate">{gh.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 border border-amber-300/60">
                        {gh.duration_type === "lifetime" ? "♾️ مدى الحياة" : gh.duration_type === "month" ? "🗓️ الشهر كامل" : "📅 هذا الأسبوع"}
                      </span>
                    </div>
                    {gh.description && <p className="text-[11px] text-slate-500 truncate">{gh.description}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingHabit({
                        id: gh.id,
                        oldName: gh.name,
                        name: gh.name,
                        description: gh.description || "",
                        duration_type: gh.duration_type || "week",
                        flower_type: gh.flower_type || "tulip",
                      })}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-amber-100 hover:text-amber-900 text-[11px] font-bold cursor-pointer transition-colors"
                      title="إعادة تسمية وتعديل"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      onClick={() => handleDeleteGlobalHabit(gh.id, gh.name)}
                      className="px-2 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px] font-bold cursor-pointer transition-colors"
                      title="حذف"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 2. Add Global Athkar Section (Collapsible - Ultra Slim when closed) */}
      <section className={`mb-3 rounded-2xl border transition-all ${
        showThikrForm
          ? "border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-blue-50/40 p-4 shadow-xs"
          : "border-indigo-200/80 bg-indigo-50/40 hover:bg-indigo-100/60 p-2 px-3 shadow-2xs"
      }`}>
        <div
          onClick={() => setShowThikrForm(!showThikrForm)}
          className="flex items-center justify-between cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600 shrink-0" />
            <h2 className="text-xs font-black text-slate-900 flex items-center gap-1.5">
              <span>إضافة ورْد ذِكر عام ونشره للجميع 📿</span>
              {globalAthkar.length > 0 && !showThikrForm && (
                <span className="text-[10px] text-indigo-900 font-bold bg-indigo-100/80 px-1.5 py-0.2 rounded border border-indigo-200">
                  ({globalAthkar.length} منشور)
                </span>
              )}
            </h2>
          </div>
          <button
            type="button"
            className="px-2.5 py-0.5 rounded-md bg-indigo-100 hover:bg-indigo-200 text-indigo-950 text-xs font-black transition-all flex items-center gap-1 border border-indigo-300/50"
          >
            <span>{showThikrForm ? "إخفاء ✖" : "+"}</span>
            {showThikrForm ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>

        {showThikrForm && (
          <div className="mt-4 pt-3 border-t border-indigo-200/60 animate-in fade-in duration-150">
            <p className="text-xs text-slate-600 font-medium mb-4">
              يمكنك هنا إضافة أذكار وأوراد جماعية (مثل: الصلاة على النبي، استغفار، سبحان الله وبحمده...). وتحديد مدتها والعدد المطلوب.
            </p>

            <form onSubmit={handleAddGlobalThikr} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">اسم الذِكر *</label>
                <input
                  type="text"
                  placeholder="مثال: الصلاة على النبي صلى الله عليه وسلم..."
                  value={thikrName}
                  onChange={(e) => setThikrName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">العدد المطلوب يومياً *</label>
                <input
                  type="number"
                  min={1}
                  value={thikrCount}
                  onChange={(e) => setThikrCount(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">المدة المحددة ⏱️</label>
                <select
                  value={thikrDuration}
                  onChange={(e: any) => setThikrDuration(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="week">📅 هذا الأسبوع فقط (7 أيام)</option>
                  <option value="month">🗓️ الشهر كامل (30 يوماً)</option>
                  <option value="lifetime">♾️ مدى الحياة (مستمر دائماً)</option>
                </select>
              </div>

              <div className="sm:col-span-3 flex items-center justify-between mt-2">
                {thikrMsg && <span className="text-xs font-bold text-emerald-700">{thikrMsg}</span>}
                <button
                  type="submit"
                  disabled={addingThikr}
                  className="mr-auto px-5 py-2.5 rounded-2xl bg-indigo-600 text-white font-black text-xs shadow-xs hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Plus className="h-4 w-4 text-white" /> {addingThikr ? "جاري النشر..." : "نشر الذِكر للأعضاء 📿"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List of Published Global Athkar with Rename/Edit and Delete */}
        {globalAthkar.length > 0 && (
          <div className="mt-6 border-t border-indigo-200/60 pt-4">
            <h3 className="text-xs font-black text-indigo-950 mb-3 flex items-center gap-1.5">
              <span>📿 الأذكار العامة المنشورة حالياً ({globalAthkar.length})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {globalAthkar.map((ga) => (
                <div key={ga.id} className="bg-white/90 p-3 rounded-2xl border border-indigo-200 shadow-2xs flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-extrabold text-xs text-slate-900 truncate">{ga.name}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-100 text-indigo-900 border border-indigo-200">
                        {ga.target_count || 100} مرة | {ga.duration_scope === "lifetime" ? "♾️ مدى الحياة" : ga.duration_scope === "month" ? "🗓️ الشهر كامل" : "📅 هذا الأسبوع"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setEditingThikr({
                        id: ga.id,
                        oldName: ga.name,
                        name: ga.name,
                        target_count: ga.target_count || 100,
                        duration_scope: ga.duration_scope || "week",
                      })}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-indigo-100 hover:text-indigo-900 text-[11px] font-bold cursor-pointer transition-colors"
                      title="إعادة تسمية وتعديل"
                    >
                      ✏️ تعديل
                    </button>
                    <button
                      onClick={() => handleDeleteGlobalThikr(ga.id, ga.name)}
                      className="px-2 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 text-[11px] font-bold cursor-pointer transition-colors"
                      title="حذف"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 3. Registered Members & Daily Results List */}
      <section className="mb-8 rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" />
              <h2 className="text-lg font-extrabold text-slate-900">نتائج ومتابعة تعبئة الأعضاء ({members.length} عضو)</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={fetchMembersList}
              className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
              title="تحديث القائمة"
            >
              <RefreshCw className={`h-4 w-4 ${loadingMembers ? "animate-spin" : ""}`} />
            </button>

            {/* Leaderboard Toggle Button (Trophy Icon Only) */}
            <button
              type="button"
              onClick={() => setShowLeaderboard((prev) => !prev)}
              className={`p-2 rounded-xl border transition-all cursor-pointer shadow-2xs ${
                showLeaderboard
                  ? "bg-amber-400 text-slate-950 border-amber-500 ring-2 ring-amber-200"
                  : "bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100"
              }`}
              title={showLeaderboard ? "إخفاء لوحة الأوائل ✖" : "🏆 عرض لوحة الأوائل والمتصدرين"}
            >
              <Trophy className="h-4.5 w-4.5 text-amber-600" />
            </button>

            {/* Excel Export Button (Download Icon Only) */}
            <button
              onClick={exportToExcel}
              className="p-2 rounded-xl bg-emerald-600 text-white shadow-2xs hover:bg-emerald-700 active:scale-95 transition-all cursor-pointer border border-emerald-700"
              title="تصدير تقرير إكسل (Excel) 📊"
            >
              <Download className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {/* Member Results & Leaderboard Content */}
        {loadingMembers ? (
          <p className="text-center text-xs text-slate-500 py-8 font-bold">جاري تحميل النتائج السحابية...</p>
        ) : members.length === 0 ? (
          <p className="text-center text-xs text-slate-400 py-8 font-bold">لا يوجد أعضاء مسجلين بعد.</p>
        ) : (
          <div className="space-y-5">
            {/* 🏆 Leaderboard / Top Achievers of the Week (Only visible when toggled) */}
            {showLeaderboard && (() => {
              const uniqueDates = getUniqueSubmissionDates(members, userDataMap, dateSortAsc);
              const totalDaysCount = Math.max(1, uniqueDates.length);

              const ranked = [...members]
                .map((m) => {
                  const uData = getUserDataForMember(m, userDataMap);
                  const stats = getOverallMemberStats(uData, uniqueDates);
                  return {
                    member: m,
                    uData,
                    countDays: stats.submittedDaysCount,
                    score: stats.totalAvgPct,
                  };
                })
                .sort((a, b) => b.score - a.score || b.countDays - a.countDays || (a.member.displayName || "").localeCompare(b.member.displayName || "", "ar"));

              let currentRank = 1;
              const rankedWithPositions = ranked.map((item, idx, arr) => {
                if (idx > 0 && item.score < arr[idx - 1].score) {
                  currentRank = idx + 1;
                }
                let medalTitle = "";
                let medalBg = "bg-white border-slate-200 text-slate-800";
                if (currentRank === 1) {
                  medalTitle = "🥇 المركز الأول";
                  medalBg = "bg-amber-100/90 border-amber-300 text-amber-950";
                } else if (currentRank === 2) {
                  medalTitle = "🥈 المركز الثاني";
                  medalBg = "bg-slate-100/90 border-slate-300 text-slate-900";
                } else if (currentRank === 3) {
                  medalTitle = "🥉 المركز الثالث";
                  medalBg = "bg-amber-200/50 border-amber-300 text-amber-900";
                } else {
                  medalTitle = `المرتبة ${currentRank}`;
                }
                return { ...item, rank: currentRank, medalTitle, medalBg };
              });

              const topThree = rankedWithPositions.filter((item) => item.rank <= 3);

              return (
                <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-r from-amber-500/10 via-amber-100/30 to-yellow-500/10 p-4 shadow-2xs">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-amber-600" />
                      <h3 className="text-sm font-black text-slate-900">🏆 أوائل الأسبوع والمتصدرون بالتعبئة</h3>
                    </div>
                    <span className="text-[10px] font-bold text-amber-900 bg-amber-200/80 px-2.5 py-1 rounded-lg border border-amber-300/60">
                      اضغطي على الاسم لرؤية تفاصيل سبب تصدرها 🔍
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {topThree.map((item) => {
                      const isSelected = selectedLeaderboardMember?.uid === item.member.uid;
                      return (
                        <div
                          key={item.member.uid}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedLeaderboardMember(null);
                            } else {
                              setSelectedLeaderboardMember(item.member);
                              fetchUserData(item.member);
                            }
                          }}
                          className={`p-3 rounded-xl border flex items-center justify-between shadow-2xs cursor-pointer transition-all hover:scale-[1.01] ${
                            isSelected
                              ? "ring-2 ring-amber-500 border-amber-500 bg-amber-200/90"
                              : item.medalBg
                          }`}
                        >
                          <div>
                            <span className="text-[10px] font-black block mb-0.5">{item.medalTitle}</span>
                            <span className="text-xs font-black">{item.member.displayName || "عضو"}</span>
                            <span className="text-[10px] opacity-80 block font-semibold mt-0.5">
                              عَبّأت {item.countDays} / {totalDaysCount} أَيَّام
                            </span>
                          </div>
                          <span className="text-sm font-black text-emerald-800 bg-white/90 px-2.5 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            {item.score}%
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Detailed breakdown for selected leaderboard member */}
                  {selectedLeaderboardMember && (
                    <div className="mt-4 p-3.5 bg-white rounded-2xl border border-amber-300 shadow-xs">
                      <MemberDetailView
                        member={selectedLeaderboardMember}
                        uData={getUserDataForMember(selectedLeaderboardMember, userDataMap)}
                        uniqueDates={uniqueDates}
                      />
                    </div>
                  )}
                </div>
              );
            })()}

            {/* View Controls & Filter Switches */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100/70 rounded-2xl border border-slate-200 text-xs font-bold">
              {/* View Mode Switcher */}
              <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setViewMode("byDate")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === "byDate"
                      ? "bg-amber-400 text-slate-950 shadow-xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📅 حسب الأيام
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("byMember")}
                  className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                    viewMode === "byMember"
                      ? "bg-amber-400 text-slate-950 shadow-xs font-black"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  👤 حسب الأعضاء
                </button>
              </div>

              {/* Toggles */}
              <div className="flex items-center gap-3">
                {/* Filter strictly active submitters */}
                {viewMode === "byDate" && (
                  <label className="flex items-center gap-1.5 text-[11px] font-extrabold text-slate-800 cursor-pointer select-none bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs hover:bg-amber-50">
                    <input
                      type="checkbox"
                      checked={onlySubmitted}
                      onChange={(e) => setOnlySubmitted(e.target.checked)}
                      className="rounded accent-amber-500 h-3.5 w-3.5 cursor-pointer"
                    />
                    <span>إظهار من قَام بالتعبئة فقط في هذا اليوم</span>
                  </label>
                )}

                {/* Sort Order */}
                {viewMode === "byDate" && (
                  <button
                    type="button"
                    onClick={() => setDateSortAsc(!dateSortAsc)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-all cursor-pointer text-[11px] font-extrabold flex items-center gap-1 shadow-2xs"
                  >
                    <span>{dateSortAsc ? "ترتيب: من بداية الأسبوع (السبت) ⬆️" : "ترتيب: الأحدث أولاً ⬇️"}</span>
                  </button>
                )}

                {/* Icon-Only Sort Controls for Members */}
                {viewMode === "byMember" && (
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                    <span className="text-[10px] font-black text-slate-400 px-1 select-none hidden sm:inline">ترتيب:</span>
                    
                    {/* 1. Name / Alphabetical (First on the Right in RTL) */}
                    <button
                      type="button"
                      onClick={() => setMemberSortMode("name")}
                      title="ترتيب أبجدي حسب الاسم"
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        memberSortMode === "name"
                          ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-500"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      <Users className="h-4 w-4" />
                    </button>

                    {/* 2. Max Days Count (Calendar icon with greater indicator) */}
                    <button
                      type="button"
                      onClick={() => setMemberSortMode("mostDays")}
                      title="الأكثر تعبئة للأيام"
                      className={`p-1.5 rounded-lg transition-all cursor-pointer relative ${
                        memberSortMode === "mostDays"
                          ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-500"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      <div className="relative flex items-center justify-center">
                        <CalendarDays className="h-4 w-4" />
                        <span className="absolute -top-1 -left-1 text-[8px] font-black leading-none bg-amber-200 text-amber-950 rounded-xs px-0.5 border border-amber-400">&gt;</span>
                      </div>
                    </button>

                    {/* 3. Quran */}
                    <button
                      type="button"
                      onClick={() => setMemberSortMode("quran")}
                      title="الأعلى في القرآن الكريم"
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        memberSortMode === "quran"
                          ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-500"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      <BookOpen className="h-4 w-4" />
                    </button>

                    {/* 4. Athkar */}
                    <button
                      type="button"
                      onClick={() => setMemberSortMode("athkar")}
                      title="الأعلى في الأذكار"
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        memberSortMode === "athkar"
                          ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-500"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      <TasbihIcon className="h-4 w-4" />
                    </button>

                    {/* 5. Prayer */}
                    <button
                      type="button"
                      onClick={() => setMemberSortMode("prayer")}
                      title="الأعلى في الصلوات الخمس"
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        memberSortMode === "prayer"
                          ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-500"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      <PrayerIcon className="h-4 w-4" />
                    </button>

                    {/* 6. Habits / Ethics */}
                    <button
                      type="button"
                      onClick={() => setMemberSortMode("habits")}
                      title="الأعلى في الأخلاق والسلوك"
                      className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                        memberSortMode === "habits"
                          ? "bg-amber-400 text-slate-950 font-black shadow-xs ring-1 ring-amber-500"
                          : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      }`}
                    >
                      <Award className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* MODE 1: Grouped by Date */}
            {viewMode === "byDate" && (
              <div className="space-y-4">
                {getUniqueSubmissionDates(members, userDataMap, dateSortAsc).map((dateStr) => {
                  const isDayCollapsed = !!collapsedDays[dateStr];

                  // Sort members on this day by who submitted and completed the most first
                  const sortedMembers = [...members].sort((a, b) => {
                    const uDataA = getUserDataForMember(a, userDataMap);
                    const uDataB = getUserDataForMember(b, userDataMap);
                    const subA = hasMemberSubmittedOnDate(uDataA, dateStr);
                    const subB = hasMemberSubmittedOnDate(uDataB, dateStr);

                    if (subA !== subB) return subA ? -1 : 1;

                    const statsA = getMemberStatsForDate(uDataA, dateStr);
                    const statsB = getMemberStatsForDate(uDataB, dateStr);
                    if (statsB.totalAvg !== statsA.totalAvg) {
                      return statsB.totalAvg - statsA.totalAvg;
                    }
                    return (a.displayName || "").localeCompare(b.displayName || "", "ar");
                  });

                  // Filter members who actually submitted on this day
                  const submittedMembers = sortedMembers.filter((m) =>
                    hasMemberSubmittedOnDate(getUserDataForMember(m, userDataMap), dateStr)
                  );

                  const displayList = onlySubmitted ? submittedMembers : sortedMembers;

                  return (
                    <div key={dateStr} className="rounded-2xl border border-teal-200/80 bg-slate-50/50 overflow-hidden shadow-2xs">
                      {/* Soft Pastel Light Header Bar */}
                      <div
                        onClick={() => setCollapsedDays((prev) => ({ ...prev, [dateStr]: !prev[dateStr] }))}
                        className="flex items-center justify-between p-3.5 bg-gradient-to-r from-teal-50 via-emerald-50 to-teal-100/60 text-slate-900 cursor-pointer hover:bg-teal-100/80 transition-all select-none border-b border-teal-200/80"
                      >
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4.5 w-4.5 text-teal-700" />
                          <h3 className="text-xs font-black text-slate-900">{formatArabicDate(dateStr)} ({dateStr})</h3>
                          <span className="bg-emerald-200/70 text-emerald-950 border border-emerald-300 text-[10px] font-black px-2.5 py-0.5 rounded-md shadow-2xs">
                            تمت التعبئة بواسطة {submittedMembers.length} من {sortedMembers.length} أعضاء
                          </span>
                        </div>
                        {isDayCollapsed ? <ChevronDown className="h-4 w-4 text-teal-800" /> : <ChevronUp className="h-4 w-4 text-teal-800" />}
                      </div>

                      {/* Day Content: Member Rows */}
                      {!isDayCollapsed && (
                        <div className="p-3 space-y-2 bg-white">
                          {displayList.length === 0 ? (
                            <p className="text-center text-xs text-slate-400 py-4 font-bold bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                              لم يتم تسجيل أي أعضاء بعد.
                            </p>
                          ) : (
                            displayList.map((m, idx) => {
                              const uData = getUserDataForMember(m, userDataMap);
                              const stats = getMemberStatsForDate(uData, dateStr);
                              const memberNumber = idx + 1;
                              const key = `${dateStr}-${m.uid}`;
                              const isExpanded = expandedMemberKey === key;
                              const isSubmitted = hasMemberSubmittedOnDate(uData, dateStr);

                              return (
                                <div key={m.uid} className="flex flex-col">
                                  {/* Single Line Person Row */}
                                  <div className={`flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl border transition-all ${
                                    isSubmitted
                                      ? "border-emerald-300/80 hover:border-amber-400 bg-emerald-50/30 shadow-2xs"
                                      : "border-slate-200 hover:border-slate-300 bg-slate-50/40 opacity-80 hover:opacity-100"
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      <span className={`font-black text-xs h-6 w-6 rounded-lg flex items-center justify-center shrink-0 text-[11px] border ${
                                        isSubmitted
                                          ? "text-emerald-950 bg-emerald-200/80 border-emerald-300"
                                          : "text-slate-500 bg-slate-200/80 border-slate-300"
                                      }`}>
                                        {memberNumber}
                                      </span>
                                      <span className={`font-extrabold text-xs ${isSubmitted ? "text-slate-900" : "text-slate-600"}`}>
                                        {m.displayName || "عضو"}
                                      </span>
                                      {m.isAdmin && (
                                        <span className="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-md">
                                          مدير
                                        </span>
                                      )}
                                      {isSubmitted ? (
                                        <span className="bg-emerald-100 text-emerald-800 text-[9px] font-black px-1.5 py-0.5 rounded-md border border-emerald-200">
                                          قام بالتعبئة ✓
                                        </span>
                                      ) : (
                                        <span className="bg-slate-200/70 text-slate-500 text-[9px] font-semibold px-1.5 py-0.5 rounded-md border border-slate-300/70">
                                          لم يُعبّئ
                                        </span>
                                      )}
                                    </div>

                                    {/* Ratio Boxes (Gray when 0%, Brightly colored when > 0%) */}
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold">
                                      <span className={`px-2 py-1 rounded-lg border transition-all ${
                                        stats.quranPct > 0
                                          ? "bg-amber-100 text-amber-950 border-amber-300 font-black shadow-2xs"
                                          : "bg-slate-100 text-slate-400 border-slate-200/80 font-medium"
                                      }`}>
                                        📖 القرآن {stats.quranPct}%
                                      </span>

                                      <span className={`px-2 py-1 rounded-lg border transition-all ${
                                        stats.athkarPct > 0
                                          ? "bg-indigo-100 text-indigo-950 border-indigo-300 font-black shadow-2xs"
                                          : "bg-slate-100 text-slate-400 border-slate-200/80 font-medium"
                                      }`}>
                                        📿 الأذكار {stats.athkarPct}%
                                      </span>

                                      <span className={`px-2 py-1 rounded-lg border transition-all ${
                                        stats.prayerPct > 0
                                          ? "bg-emerald-100 text-emerald-950 border-emerald-300 font-black shadow-2xs"
                                          : "bg-slate-100 text-slate-400 border-slate-200/80 font-medium"
                                      }`}>
                                        🕌 الصلاة {stats.prayerPct}%
                                      </span>

                                      <span className={`px-2 py-1 rounded-lg border transition-all ${
                                        stats.habitsPct > 0
                                          ? "bg-purple-100 text-purple-950 border-purple-300 font-black shadow-2xs"
                                          : "bg-slate-100 text-slate-400 border-slate-200/80 font-medium"
                                      }`}>
                                        🌸 الأخلاق {stats.habitsPct}%
                                      </span>

                                      {/* Eye Icon Button */}
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setExpandedMemberKey(isExpanded ? null : key);
                                          setSelectedUser(m);
                                          fetchUserData(m);
                                        }}
                                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                          isExpanded
                                            ? "bg-amber-400 text-slate-950 border-amber-500 shadow-xs"
                                            : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-amber-100 hover:text-amber-900"
                                        }`}
                                        title={isExpanded ? "إخفاء التفاصيل" : "عرض التفاصيل تحت الاسم"}
                                      >
                                        <Eye className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Collapsible Details list directly beneath this member */}
                                  {isExpanded && (
                                    <MemberDetailView member={m} uData={uData} />
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* MODE 2: Grouped by Member (Slim Single-Line Rows, Numbered Alphabetically, No Percentages) */}
            {viewMode === "byMember" && (
              <div className="space-y-2">
                {[...members]
                  .sort((a, b) => {
                    const uDataA = getUserDataForMember(a, userDataMap);
                    const uDataB = getUserDataForMember(b, userDataMap);
                    const uniqueDates = getUniqueSubmissionDates(members, userDataMap, dateSortAsc);

                    if (memberSortMode === "mostDays") {
                      const daysA = uniqueDates.filter((d) => hasMemberSubmittedOnDate(uDataA, d)).length;
                      const daysB = uniqueDates.filter((d) => hasMemberSubmittedOnDate(uDataB, d)).length;
                      if (daysB !== daysA) return daysB - daysA;
                    } else if (memberSortMode === "quran") {
                      const statsA = getOverallMemberStats(uDataA, uniqueDates);
                      const statsB = getOverallMemberStats(uDataB, uniqueDates);
                      if (statsB.quranPct !== statsA.quranPct) return statsB.quranPct - statsA.quranPct;
                      if (statsB.submittedDaysCount !== statsA.submittedDaysCount) return statsB.submittedDaysCount - statsA.submittedDaysCount;
                    } else if (memberSortMode === "athkar") {
                      const statsA = getOverallMemberStats(uDataA, uniqueDates);
                      const statsB = getOverallMemberStats(uDataB, uniqueDates);
                      if (statsB.athkarPct !== statsA.athkarPct) return statsB.athkarPct - statsA.athkarPct;
                      if (statsB.submittedDaysCount !== statsA.submittedDaysCount) return statsB.submittedDaysCount - statsA.submittedDaysCount;
                    } else if (memberSortMode === "prayer") {
                      const statsA = getOverallMemberStats(uDataA, uniqueDates);
                      const statsB = getOverallMemberStats(uDataB, uniqueDates);
                      if (statsB.prayerPct !== statsA.prayerPct) return statsB.prayerPct - statsA.prayerPct;
                      if (statsB.submittedDaysCount !== statsA.submittedDaysCount) return statsB.submittedDaysCount - statsA.submittedDaysCount;
                    } else if (memberSortMode === "habits") {
                      const statsA = getOverallMemberStats(uDataA, uniqueDates);
                      const statsB = getOverallMemberStats(uDataB, uniqueDates);
                      if (statsB.habitsPct !== statsA.habitsPct) return statsB.habitsPct - statsA.habitsPct;
                      if (statsB.submittedDaysCount !== statsA.submittedDaysCount) return statsB.submittedDaysCount - statsA.submittedDaysCount;
                    }

                    return (a.displayName || "").localeCompare(b.displayName || "", "ar");
                  })
                  .map((m, idx) => {
                    const uData = getUserDataForMember(m, userDataMap);
                    const isSelected = selectedUser?.uid === m.uid;
                    const uniqueDates = getUniqueSubmissionDates(members, userDataMap, dateSortAsc);
                    const activeDaysCount = uniqueDates.filter((d) => hasMemberSubmittedOnDate(uData, d)).length;
                    const overallStats = getOverallMemberStats(uData, uniqueDates);
                    const memberNumber = idx + 1;

                    let badgeElement: React.ReactNode = (
                      <span>
                        المعدل العام {overallStats.totalAvgPct}% (تعبئة {activeDaysCount} / {uniqueDates.length} أَيَّام)
                      </span>
                    );
                    let badgeClass = getPctBadgeClass(overallStats.totalAvgPct);

                    if (memberSortMode === "mostDays") {
                      const activePct = Math.round((activeDaysCount / Math.max(1, uniqueDates.length)) * 100);
                      badgeElement = (
                        <span>
                          عَبّأت {activeDaysCount} / {uniqueDates.length} أَيَّام
                        </span>
                      );
                      badgeClass = getPctBadgeClass(activePct);
                    } else if (memberSortMode === "quran") {
                      badgeElement = <span>📖 القرآن {overallStats.quranPct}%</span>;
                      badgeClass = getPctBadgeClass(overallStats.quranPct);
                    } else if (memberSortMode === "athkar") {
                      badgeElement = <span>📿 الأذكار {overallStats.athkarPct}%</span>;
                      badgeClass = getPctBadgeClass(overallStats.athkarPct);
                    } else if (memberSortMode === "prayer") {
                      badgeElement = <span>🕌 الصلاة {overallStats.prayerPct}%</span>;
                      badgeClass = getPctBadgeClass(overallStats.prayerPct);
                    } else if (memberSortMode === "habits") {
                      badgeElement = <span>🌸 الأخلاق {overallStats.habitsPct}%</span>;
                      badgeClass = getPctBadgeClass(overallStats.habitsPct);
                    }

                    return (
                      <div key={m.uid} className="flex flex-col">
                        <div
                          onClick={() => {
                            if (isSelected) {
                              setSelectedUser(null);
                            } else {
                              setSelectedUser(m);
                              fetchUserData(m);
                            }
                          }}
                          className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                            isSelected
                              ? "border-amber-400 bg-amber-50/80 ring-2 ring-amber-200 shadow-xs"
                              : "border-slate-200 bg-white hover:border-amber-300 hover:bg-slate-50/80 shadow-2xs"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="font-black text-xs text-indigo-950 bg-indigo-100 border border-indigo-200 h-6.5 w-6.5 rounded-lg flex items-center justify-center shrink-0">
                              {memberNumber}
                            </span>
                            <span className="font-extrabold text-xs text-slate-900 truncate">
                              {m.displayName || "عضو"}
                            </span>
                            {m.isAdmin && (
                              <span className="bg-amber-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0">
                                مدير
                              </span>
                            )}
                            <span className="text-[11px] text-slate-400 font-normal dir-ltr hidden sm:inline truncate">
                              {m.email}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`px-2.5 py-1 text-[11px] font-black rounded-lg border ${badgeClass}`}>
                              {badgeElement}
                            </span>
                            <button
                              type="button"
                              className={`p-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
                                isSelected
                                  ? "bg-amber-400 text-slate-950 border-amber-500"
                                  : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                              }`}
                              title={isSelected ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Collapsible Member Detailed View directly beneath this row */}
                        {isSelected && (
                          <div className="mt-2 mb-2 p-2 bg-white rounded-2xl border border-amber-300 shadow-xs animate-in fade-in duration-150 relative">
                            <MemberDetailView member={m} uData={uData} activeCategory={memberSortMode} uniqueDates={uniqueDates} />
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Edit Global Habit Modal */}
      {editingHabit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-amber-200">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              ✏️ إعادة تسمية وتعديل الخُلق العام
            </h3>
            <form onSubmit={handleUpdateGlobalHabitSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">اسم الخُلق *</label>
                <input
                  type="text"
                  value={editingHabit.name}
                  onChange={(e) => setEditingHabit({ ...editingHabit, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">المدة المحددة ⏱️</label>
                <select
                  value={editingHabit.duration_type}
                  onChange={(e: any) => setEditingHabit({ ...editingHabit, duration_type: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="week">📅 هذا الأسبوع فقط (7 أيام)</option>
                  <option value="month">🗓️ الشهر كامل (30 يوماً)</option>
                  <option value="lifetime">♾️ مدى الحياة (مستمر دائماً)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">نوع الزهرة 🌸</label>
                <select
                  value={editingHabit.flower_type}
                  onChange={(e: any) => setEditingHabit({ ...editingHabit, flower_type: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-amber-500"
                >
                  <option value="tulip">🌷 توليب</option>
                  <option value="jasmine">🌼 ياسمين</option>
                  <option value="jouri">🌹 جوري</option>
                  <option value="violet">🪻 بنفسج</option>
                  <option value="daffodil">🌻 نرجس</option>
                  <option value="lavender">🪻 لافندر</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">الوصف والنصيحة 📝</label>
                <input
                  type="text"
                  value={editingHabit.description}
                  onChange={(e) => setEditingHabit({ ...editingHabit, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingHabit(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 cursor-pointer shadow-xs"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Global Thikr Modal */}
      {editingThikr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl border border-indigo-200">
            <h3 className="text-base font-extrabold text-slate-900 mb-4 flex items-center gap-2">
              ✏️ إعادة تسمية وتعديل ورْد الذِكر العام
            </h3>
            <form onSubmit={handleUpdateGlobalThikrSubmit} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">اسم الذِكر *</label>
                <input
                  type="text"
                  value={editingThikr.name}
                  onChange={(e) => setEditingThikr({ ...editingThikr, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">العدد المطلوب يومياً *</label>
                <input
                  type="number"
                  min={1}
                  value={editingThikr.target_count}
                  onChange={(e) => setEditingThikr({ ...editingThikr, target_count: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 block mb-1">المدة المحددة ⏱️</label>
                <select
                  value={editingThikr.duration_scope}
                  onChange={(e: any) => setEditingThikr({ ...editingThikr, duration_scope: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:border-indigo-500"
                >
                  <option value="week">📅 هذا الأسبوع فقط (7 أيام)</option>
                  <option value="month">🗓️ الشهر كامل (30 يوماً)</option>
                  <option value="lifetime">♾️ مدى الحياة (مستمر دائماً)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingThikr(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-black text-xs hover:bg-indigo-700 cursor-pointer shadow-xs"
                >
                  حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
