import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Edit2, History, Check, Minus, Sparkles, X, Award, Info, Calendar } from "lucide-react";
import { z } from "zod";
import { db, type CustomHabit, type CustomHabitProgress, type CustomHabitWeeklyEvaluation } from "@/lib/db";
import { useAuth } from "@/context/AuthContext";
import { HabitsMonthCalendar } from "@/components/HabitsMonthCalendar";
import { PrayerTracker } from "@/components/PrayerTracker";
import {
  listActiveHabits,
  createHabit,
  createGlobalHabit,
  syncGlobalHabitsFromCloud,
  updateHabit,
  deleteHabit,
  getHabitProgressToday,
  toggleHabitProgress,
  incrementHabitCounter,
  decrementHabitCounter,
  getHabitProgressForDates,
  toggleHabitProgressForDate,
  incrementHabitCounterForDate,
  decrementHabitCounterForDate,
  getHabitWeeklyStatus,
  getHabitWeeklyEvaluations,
  processHabitsEvaluationsAndArchiving,
  pickWisdomForHabits,
  isHabitActiveOnDate,
} from "@/lib/habits";
import { isoDate, startOfWeek, endOfWeek, weekDays, formatArabicDate } from "@/lib/date-utils";

const habitsSearchSchema = z.object({
  date: z.string().optional(),
});

export const Route = createFileRoute("/habits")({
  validateSearch: habitsSearchSchema,
  head: () => ({
    meta: [
      { title: "الأخلاق والأفعال — وَرْد" },
      { name: "description", content: "بناء ومتابعة الأخلاق والأفعال المخصصة عبر وردة أسبوعية." },
    ],
  }),
  component: HabitsScreen,
});

function HabitsScreen() {
  const { date } = Route.useSearch();
  const [habits, setHabits] = useState<CustomHabit[]>([]);
  // Collapsible monthly calendar state
  const [showMonthCalendar, setShowMonthCalendar] = useState(() => {
    return localStorage.getItem("habits_show_month_calendar") !== "false";
  });

  // Collapsible 7-petal flower state
  const [showFlower, setShowFlower] = useState(() => {
    return localStorage.getItem("habits_show_flower") !== "false";
  });

  const toggleMonthCalendar = () => {
    const next = !showMonthCalendar;
    setShowMonthCalendar(next);
    localStorage.setItem("habits_show_month_calendar", String(next));
  };

  const toggleFlower = () => {
    const next = !showFlower;
    setShowFlower(next);
    localStorage.setItem("habits_show_flower", String(next));
  };

  const [selectedDate, setSelectedDate] = useState(() => date || isoDate());

  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    } else {
      setSelectedDate(isoDate());
    }
  }, [date]);

  // Progress map: habitId -> Map<dateStr, CustomHabitProgress>
  const [progressMaps, setProgressMaps] = useState<Map<number, Map<string, CustomHabitProgress>>>(new Map());
  // Weekly status: habitId -> status object
  const [weeklyStatuses, setWeeklyStatuses] = useState<
    Map<number, { week_start: string; week_end: string; commitment_percent: number; days_completed: number }>
  >(new Map());

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingHabit, setEditingHabit] = useState<CustomHabit | null>(null);
  const [viewingHistoryHabit, setViewingHistoryHabit] = useState<CustomHabit | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CustomHabit | null>(null);

  // Dates of the current week containing the selected date (Saturday to Friday)
  const currentWeekDays = useMemo(() => {
    return weekDays(new Date(selectedDate));
  }, [selectedDate]);

  async function loadData() {
    // Sync global habits from cloud first
    await syncGlobalHabitsFromCloud();
    // Run evaluations and archiving check
    await processHabitsEvaluationsAndArchiving();

    const activeList = await listActiveHabits();
    const filteredActiveList = activeList.filter((h) => isHabitActiveOnDate(h, selectedDate));
    setHabits(filteredActiveList);

    const newProgressMaps = new Map<number, Map<string, CustomHabitProgress>>();
    const newWeeklyStatuses = new Map<number, { week_start: string; week_end: string; commitment_percent: number; days_completed: number }>();

    for (const h of filteredActiveList) {
      if (h.id != null) {
        // Load progress for this week's dates
        const pMap = await getHabitProgressForDates(h.id, currentWeekDays);
        newProgressMaps.set(h.id, pMap);

        // Load weekly status
        const status = await getHabitWeeklyStatus(h.id, new Date(selectedDate));
        newWeeklyStatuses.set(h.id, status);
      }
    }

    setProgressMaps(newProgressMaps);
    setWeeklyStatuses(newWeeklyStatuses);
  }

  useEffect(() => {
    loadData();
  }, [selectedDate, currentWeekDays]);

  // Helper to calculate remaining days
  function getRemainingDays(h: CustomHabit): number {
    const today = new Date(isoDate());
    const start = new Date(h.start_date);
    let limitDays = 7;
    if (h.duration_type === "month") limitDays = 30;
    else if (h.duration_type === "custom") limitDays = h.duration_days;

    const end = new Date(start);
    end.setDate(start.getDate() + limitDays);

    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  }

  // Handle interaction for "تم اليوم" or increments for the selectedDate
  async function handleToggle(habitId: number) {
    await toggleHabitProgressForDate(habitId, selectedDate);
    await loadData();
  }

  async function handleIncrement(habitId: number, target: number) {
    await incrementHabitCounterForDate(habitId, target, selectedDate);
    await loadData();
  }

  async function handleDecrement(habitId: number) {
    await decrementHabitCounterForDate(habitId, selectedDate);
    await loadData();
  }

  async function handleDelete(h: CustomHabit) {
    setConfirmDelete(h);
  }

  async function confirmDeleteAction() {
    if (confirmDelete && confirmDelete.id != null) {
      await deleteHabit(confirmDelete.id);
      setConfirmDelete(null);
      await loadData();
    }
  }

  return (
    <div dir="rtl" className="screen screen--habits min-h-[100dvh] px-4 pt-6 pb-24">
      <header className="pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold">
            {selectedDate === isoDate() ? "الأخلاق والأفعال" : `إنجازك في يوم: ${formatArabicDate(new Date(selectedDate))}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تتبّع خِصالك الحسنة بلطف عبر الوردة الأسبوعية.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 items-center">
          <button
            onClick={toggleMonthCalendar}
            className="flex items-center gap-1 rounded-full border border-border bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white active:scale-95 transition-all cursor-pointer"
          >
            {showMonthCalendar ? "إخفاء التقويم" : "إظهار التقويم"}
          </button>
          <button
            onClick={toggleFlower}
            className="flex items-center gap-1 rounded-full border border-border bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white active:scale-95 transition-all cursor-pointer"
          >
            {showFlower ? "إخفاء الوردة" : "إظهار الوردة"}
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-[color:var(--habits)] px-4 py-2.5 text-sm font-bold text-white shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
          >
            <Plus className="h-4 w-4" /> خُلق جديد
          </button>
        </div>
      </header>

      {showMonthCalendar && (
        <div className="mb-6 animate-in fade-in slide-in-from-top-3 duration-200">
          <HabitsMonthCalendar selectedDate={selectedDate} onSelectDate={setSelectedDate} />
        </div>
      )}

      {/* Habits List */}
      {habits.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border/80 bg-white/70 p-10 text-center shadow-sm backdrop-blur mt-8">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-[color-mix(in_oklch,var(--habits)_12%,white)] text-[color:var(--habits)] mb-4">
            <Award className="h-8 w-8" />
          </div>
          <h3 className="text-lg font-bold text-foreground">لا توجد أخلاق أو أفعال بعد</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-xs leading-relaxed">
            الشاشة فارغة تماماً لتبني قائمتك المخصصة من الصفر. أضف خلقاً أو سلوكاً تحب الالتزام به.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="mt-5 rounded-2xl bg-[color:var(--habits)] px-5 py-2.5 text-sm font-bold text-white shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
          >
            إضافة خُلق أو فعل جديد
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
          {habits.map((h) => {
            const remaining = getRemainingDays(h);
            const pMap = progressMaps.get(h.id!) ?? new Map<string, CustomHabitProgress>();
            const status = weeklyStatuses.get(h.id!);
            const todayProgress = pMap.get(selectedDate);

            return (
              <section
                key={h.id}
                className="rounded-2xl border border-[color-mix(in_oklch,var(--habits)_12%,transparent)] bg-white/80 p-3 shadow-xs backdrop-blur relative overflow-hidden flex flex-col justify-between transition-all hover:translate-y-[-1px] hover:shadow-2xs duration-200"
              >
                <div className="flex items-center justify-between gap-3 flex-1 min-h-0">
                  {/* Right side: text details & interactive trackers */}
                  <div className="flex-1 min-w-0 flex flex-col justify-center py-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h2 className="text-sm font-extrabold text-slate-900 line-clamp-1 leading-tight" title={h.name}>
                        {h.name}
                      </h2>
                      {remaining === 0 ? (
                        <span className="shrink-0 rounded-full bg-amber-50 text-amber-800 text-[8px] font-bold px-1.5 py-0.25">
                          انتهت
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-[color-mix(in_oklch,var(--habits)_8%,white)] text-[color:var(--habits)] text-[8px] font-bold px-1.5 py-0.25">
                          باقي {remaining} ي
                        </span>
                      )}
                    </div>

                    {h.description ? (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 leading-tight" title={h.description}>
                        {h.description}
                      </p>
                    ) : (
                      <p className="text-[10px] text-muted-foreground/40 italic mt-0.5">بلا وصف</p>
                    )}

                    {/* Interactive tracker */}
                    <div className="mt-3 w-full">
                      {h.tracking_type === "once_daily" ? (
                        <button
                          onClick={() => handleToggle(h.id!)}
                          className={`flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer ${
                            todayProgress?.completed
                              ? "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-100"
                              : "bg-[color:var(--habits)] text-white hover:opacity-95 shadow-[color:var(--habits)]/20 active:scale-[0.97]"
                          }`}
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" />
                          {todayProgress?.completed ? "مكتمل ✓" : "تم لليوم المحدد"}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl border border-slate-200 shrink-0 w-full justify-between">
                          <button
                            onClick={() => handleDecrement(h.id!)}
                            disabled={(todayProgress?.count ?? 0) <= 0}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-white shadow-xs border border-slate-200 text-slate-700 disabled:opacity-40 cursor-pointer active:scale-90"
                            title="تراجع"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-xs font-extrabold px-1.5 tabular-nums text-slate-800">
                            {todayProgress?.count ?? 0} / {h.target_count}
                          </span>
                          <button
                            onClick={() => handleIncrement(h.id!, h.target_count)}
                            disabled={(todayProgress?.count ?? 0) >= h.target_count}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[color:var(--habits)] text-white shadow-xs font-black text-xs disabled:opacity-40 cursor-pointer active:scale-90"
                          >
                            <Plus className="h-3.5 w-3.5" />
                            +١ تم لليوم
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Left side: Flower & Stats Section */}
                  {showFlower && (
                    <div className="shrink-0 flex flex-col items-center justify-center p-1 rounded-xl bg-slate-50/50 border border-dashed border-slate-100">
                      <HabitFlower
                        habit={h}
                        progressMap={pMap}
                        weekDates={currentWeekDays}
                        size={64}
                        onToggleDay={async (date) => {
                          await toggleHabitProgressForDate(h.id!, date);
                          await loadData();
                          if (navigator.vibrate) {
                            navigator.vibrate(8);
                          }
                        }}
                      />
                      <div className="text-[9px] font-extrabold text-slate-600 tabular-nums mt-0.5">
                        {status?.commitment_percent ?? 0}٪
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="mt-2 pt-2 border-t border-slate-100/60 flex items-center justify-between text-[10px] text-muted-foreground shrink-0">
                  <button
                    onClick={() => setViewingHistoryHabit(h)}
                    className="flex items-center gap-1 text-[color:var(--habits)] font-bold hover:underline cursor-pointer"
                  >
                    <History className="h-2.5 w-2.5" />
                    تاريخ الأسابيع
                  </button>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setEditingHabit(h)}
                      className="p-1 text-muted-foreground hover:text-[color:var(--habits)] cursor-pointer transition-colors"
                      title="تعديل"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(h)}
                      className="p-1 text-muted-foreground hover:text-red-500 cursor-pointer transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Add Habit Modal */}
      {showAddModal && (
        <AddEditHabitModal
          selectedDate={selectedDate}
          onClose={() => setShowAddModal(false)}
          onSaved={async () => {
            setShowAddModal(false);
            await loadData();
          }}
        />
      )}

      {/* Edit Habit Modal */}
      {editingHabit && (
        <AddEditHabitModal
          habit={editingHabit}
          selectedDate={selectedDate}
          onClose={() => setEditingHabit(null)}
          onSaved={async () => {
            setEditingHabit(null);
            await loadData();
          }}
        />
      )}

      {/* History Modal */}
      {viewingHistoryHabit && (
        <HistoryModal
          habit={viewingHistoryHabit}
          onClose={() => setViewingHistoryHabit(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-slate-100 text-center animate-in scale-in duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">
              هل أنت متأكد من حذف «{confirmDelete.name}» نهائياً مع كافة سجلات التتبع؟
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-2xl bg-slate-100 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-200 cursor-pointer active:scale-98 transition-all"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={confirmDeleteAction}
                className="flex-1 rounded-2xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-700 cursor-pointer active:scale-98 transition-all"
              >
                نعم، احذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ---------- SVG 7-Petal Flower Component ---------- */

function HabitFlower({
  habit,
  progressMap,
  weekDates,
  size = 120,
  onToggleDay,
}: {
  habit: CustomHabit;
  progressMap: Map<string, CustomHabitProgress>;
  weekDates: string[];
  size?: number;
  onToggleDay?: (date: string) => void | Promise<void>;
}) {
  const dayNames = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
  const fType = habit.flower_type ?? "tulip";

  // Color config based on flower type
  const colors: Record<
    string,
    {
      active: string;
      inactive: string;
      borderActive: string;
      borderInactive: string;
      leafActive: string;
      leafInactive: string;
    }
  > = {
    tulip: {
      active: "#d946ef",
      inactive: "rgba(217, 70, 239, 0.08)",
      borderActive: "#c084fc",
      borderInactive: "rgba(217, 70, 239, 0.25)",
      leafActive: "#10b981",
      leafInactive: "rgba(16, 185, 129, 0.1)",
    },
    jasmine: {
      active: "#ffffff",
      inactive: "rgba(248, 250, 252, 0.4)",
      borderActive: "#d97706",
      borderInactive: "rgba(148, 163, 184, 0.25)",
      leafActive: "#059669",
      leafInactive: "rgba(16, 185, 129, 0.1)",
    },
    jouri: {
      active: "#f43f5e",
      inactive: "rgba(244, 63, 94, 0.08)",
      borderActive: "#e11d48",
      borderInactive: "rgba(244, 63, 94, 0.22)",
      leafActive: "#10b981",
      leafInactive: "rgba(16, 185, 129, 0.1)",
    },
    violet: {
      active: "#8b5cf6",
      inactive: "rgba(139, 92, 246, 0.08)",
      borderActive: "#7c3aed",
      borderInactive: "rgba(139, 92, 246, 0.22)",
      leafActive: "#10b981",
      leafInactive: "rgba(16, 185, 129, 0.1)",
    },
    daffodil: {
      active: "#f97316",
      inactive: "rgba(249, 115, 22, 0.08)",
      borderActive: "#ea580c",
      borderInactive: "rgba(249, 115, 22, 0.22)",
      leafActive: "#10b981",
      leafInactive: "rgba(16, 185, 129, 0.1)",
    },
    lavender: {
      active: "#a855f7",
      inactive: "rgba(168, 85, 247, 0.08)",
      borderActive: "#7e22ce",
      borderInactive: "rgba(168, 85, 247, 0.22)",
      leafActive: "#10b981",
      leafInactive: "rgba(16, 185, 129, 0.1)",
    },
  };

  const theme = colors[fType] || colors.tulip;

  // Render a clickable part
  const renderPart = (idx: number, pathD: string, options: {
    isLeaf?: boolean;
    customActiveColor?: string;
    customInactiveColor?: string;
    customBorderActiveColor?: string;
    customBorderInactiveColor?: string;
    transform?: string;
  } = {}) => {
    const date = weekDates[idx];
    if (!date) return null;
    const isActive = isHabitActiveOnDate(habit, date);
    const isCompleted = progressMap.get(date)?.completed ?? false;

    let fill = isCompleted ? theme.active : theme.inactive;
    let stroke = isCompleted ? theme.borderActive : theme.borderInactive;

    if (!isActive) {
      fill = "rgba(148, 163, 184, 0.05)";
      stroke = "rgba(148, 163, 184, 0.15)";
    } else {
      if (options.isLeaf) {
        fill = isCompleted ? theme.leafActive : theme.leafInactive;
        stroke = isCompleted ? "#059669" : "rgba(16, 185, 129, 0.25)";
      }
      if (options.customActiveColor && isCompleted) fill = options.customActiveColor;
      if (options.customInactiveColor && !isCompleted) fill = options.customInactiveColor;
      if (options.customBorderActiveColor && isCompleted) stroke = options.customBorderActiveColor;
      if (options.customBorderInactiveColor && !isCompleted) stroke = options.customBorderInactiveColor;
    }

    return (
      <g
        key={date}
        onClick={() => {
          if (!isActive) return;
          onToggleDay?.(date);
        }}
        transform={options.transform}
        className={`select-none ${isActive ? "cursor-pointer group" : "cursor-not-allowed opacity-30 pointer-events-none"}`}
      >
        <title>{`${dayNames[idx]}: ${!isActive ? "خارج مدة الالتزام" : isCompleted ? "مكتمل (اضغط للتغيير)" : "غير مكتمل (اضغط للتغيير)"}`}</title>
        <path
          d={pathD}
          fill={fill}
          stroke={stroke}
          strokeWidth="1.5"
          className="transition-all duration-300 hover:brightness-105 active:scale-[0.98] origin-center"
        />
        {/* Visual feedback glow on hover */}
        {isActive && (
          <path
            d={pathD}
            fill="none"
            stroke={isCompleted ? "#fff" : stroke}
            strokeWidth="0.8"
            className="opacity-0 group-hover:opacity-40 transition-opacity duration-300 pointer-events-none"
          />
        )}
      </g>
    );
  };

  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className="overflow-visible select-none drop-shadow-sm">
      <defs>
        <radialGradient id="flower-center-grad">
          <stop offset="0%" stopColor="#ffd85c" />
          <stop offset="100%" stopColor="#e3a700" />
        </radialGradient>
      </defs>

      {/* RENDER BY TYPE */}
      {fType === "tulip" && (
        <g>
          {/* Stem (idx 0) */}
          {renderPart(0, "M 58 55 L 58 105 L 62 105 L 62 55 Z", { isLeaf: true })}
          {/* Left Leaf (idx 1) */}
          {renderPart(1, "M 60 90 C 40 90, 28 75, 33 55 C 43 68, 55 78, 60 90 Z", { isLeaf: true })}
          {/* Right Leaf (idx 2) */}
          {renderPart(2, "M 60 95 C 80 95, 92 80, 87 60 C 77 72, 65 82, 60 95 Z", { isLeaf: true })}
          {/* Back Left Petal (idx 3) */}
          {renderPart(3, "M 60 55 C 42 45, 42 18, 50 12 C 58 22, 60 38, 60 55 Z")}
          {/* Back Right Petal (idx 4) */}
          {renderPart(4, "M 60 55 C 78 45, 78 18, 70 12 C 62 22, 60 38, 60 55 Z")}
          {/* Left Front Petal (idx 5) */}
          {renderPart(5, "M 60 55 C 36 48, 38 22, 52 18 C 58 32, 60 42, 60 55 Z")}
          {/* Right Front Petal (idx 6) */}
          {renderPart(6, "M 60 55 C 84 48, 82 22, 68 18 C 62 32, 60 42, 60 55 Z")}
          {/* Small bloom cup connector */}
          <path d="M 52 54 C 54 58, 66 58, 68 54 Z" fill="#854d0e" opacity="0.3" />
        </g>
      )}

      {fType === "jasmine" && (
        <g>
          {/* Back Leaf Left (idx 5) */}
          {renderPart(5, "M 60 60 C 40 45, 38 18, 60 8 C 82 18, 80 45, 60 60 Z", {
            isLeaf: true,
            transform: "rotate(-45, 60, 60)",
          })}
          {/* Back Leaf Right (idx 6) */}
          {renderPart(6, "M 60 60 C 40 45, 38 18, 60 8 C 82 18, 80 45, 60 60 Z", {
            isLeaf: true,
            transform: "rotate(45, 60, 60)",
          })}
          {/* Outer Layer of 5 Petals (idx 0 to 4) */}
          {[0, 72, 144, 216, 288].map((angle, i) =>
            renderPart(i, "M 60 60 C 44 32, 46 4, 60 2 C 74 4, 76 32, 60 60 Z", {
              transform: `rotate(${angle}, 60, 60)`,
            })
          )}
          {/* Inner Layer of 5 Petals, rotated by 36 deg and scaled down */}
          {[36, 108, 180, 252, 324].map((angle, i) =>
            renderPart(i % 5, "M 60 60 C 48 38, 50 18, 60 16 C 70 18, 72 38, 60 60 Z", {
              transform: `rotate(${angle}, 60, 60)`,
            })
          )}
          {/* Center Bud */}
          <circle cx="60" cy="60" r="6" fill="url(#flower-center-grad)" stroke="#fff" strokeWidth="1" />
        </g>
      )}

      {fType === "jouri" && (
        <g>
          {/* 4 Outer Petals (idx 0 to 3) */}
          {[0, 90, 180, 270].map((angle, i) =>
            renderPart(i, "M 60 60 C 25 38, 25 10, 60 6 C 95 10, 95 38, 60 60 Z", {
              transform: `rotate(${angle}, 60, 60)`,
            })
          )}
          {/* 2 Inner Petals (idx 4, 5) */}
          {renderPart(4, "M 60 60 C 35 45, 35 22, 60 18 C 85 22, 85 45, 60 60 Z", {
            transform: "rotate(45, 60, 60)",
          })}
          {renderPart(5, "M 60 60 C 35 45, 35 22, 60 18 C 85 22, 85 45, 60 60 Z", {
            transform: "rotate(225, 60, 60)",
          })}
          {/* Center rose bud (idx 6) */}
          {renderPart(6, "M 60 60 m -15 0 a 15 15 0 1 0 30 0 a 15 15 0 1 0 -30 0", {
            customActiveColor: "#fda4af",
            customInactiveColor: "rgba(244, 63, 94, 0.15)",
            customBorderActiveColor: "#f43f5e",
            customBorderInactiveColor: "rgba(244, 63, 94, 0.3)",
          })}
          {/* Overlay rose spiral */}
          <path
            d="M 54 60 C 54 53, 66 53, 66 60 C 66 67, 57 67, 57 60 C 57 57, 63 57, 63 60"
            fill="none"
            stroke={progressMap.get(weekDates[6] || "")?.completed ? "#be123c" : "rgba(148, 163, 184, 0.4)"}
            strokeWidth="1.5"
            strokeLinecap="round"
            className="pointer-events-none"
          />
        </g>
      )}

      {fType === "violet" && (
        <g>
          {/* Left Leaf (idx 5) */}
          {renderPart(5, "M 60 60 C 40 45, 38 18, 60 8 C 82 18, 80 45, 60 60 Z", {
            isLeaf: true,
            transform: "rotate(-125, 60, 60)",
          })}
          {/* Right Leaf (idx 6) */}
          {renderPart(6, "M 60 60 C 40 45, 38 18, 60 8 C 82 18, 80 45, 60 60 Z", {
            isLeaf: true,
            transform: "rotate(125, 60, 60)",
          })}
          {/* 5 rounded heart petals (idx 0 to 4) */}
          {[0, 72, 144, 216, 288].map((angle, i) =>
            renderPart(i, "M 60 60 C 35 42, 38 12, 48 6 C 56 12, 64 12, 72 6 C 82 12, 85 42, 60 60 Z", {
              transform: `rotate(${angle}, 60, 60)`,
            })
          )}
          {/* Golden Center eye */}
          <circle cx="60" cy="60" r="5" fill="#facc15" stroke="#eab308" strokeWidth="1" />
        </g>
      )}

      {fType === "daffodil" && (
        <g>
          {/* 6 Star Petals (idx 0 to 5) */}
          {[0, 60, 120, 180, 240, 300].map((angle, i) =>
            renderPart(i, "M 60 60 C 44 38, 46 12, 60 4 C 74 12, 76 38, 60 60 Z", {
              transform: `rotate(${angle}, 60, 60)`,
            })
          )}
          {/* Center Trumpet Cup (idx 6) */}
          {renderPart(6, "M 60 60 m -16 0 a 16 16 0 1 0 32 0 a 16 16 0 1 0 -32 0", {
            customActiveColor: "#f97316",
            customInactiveColor: "rgba(249, 115, 22, 0.15)",
            customBorderActiveColor: "#ea580c",
            customBorderInactiveColor: "rgba(249, 115, 22, 0.35)",
          })}
          {/* Wavy lines in trumpet */}
          <circle
            cx="60"
            cy="60"
            r="10"
            fill="none"
            stroke={progressMap.get(weekDates[6] || "")?.completed ? "#ffedd5" : "rgba(148, 163, 184, 0.3)"}
            strokeWidth="1.5"
            strokeDasharray="4 2"
            className="pointer-events-none"
          />
        </g>
      )}

      {fType === "lavender" && (
        <g>
          {/* Stem & Base (idx 0) */}
          {renderPart(0, "M 58 40 L 58 108 L 62 108 L 62 40 Z", { isLeaf: true })}
          {/* Left Leaf (idx 1) */}
          {renderPart(1, "M 60 92 C 40 92, 28 78, 32 60 C 44 72, 55 82, 60 92 Z", { isLeaf: true })}
          {/* Right Leaf (idx 2) */}
          {renderPart(2, "M 60 95 C 80 95, 92 81, 88 63 C 76 75, 65 85, 60 95 Z", { isLeaf: true })}
          {/* Lower floret pair (idx 3) */}
          {renderPart(3, "M 60 68 C 36 66, 34 50, 48 44 C 55 52, 58 62, 60 68 Z M 60 68 C 84 66, 86 50, 72 44 C 65 52, 62 62, 60 68 Z")}
          {/* Mid floret pair (idx 4) */}
          {renderPart(4, "M 60 52 C 38 50, 36 34, 50 28 C 56 36, 58 44, 60 52 Z M 60 52 C 82 50, 84 34, 70 28 C 64 36, 62 44, 60 52 Z")}
          {/* Upper floret pair (idx 5) */}
          {renderPart(5, "M 60 36 C 42 34, 40 20, 52 14 C 56 22, 58 28, 60 36 Z M 60 36 C 78 34, 80 20, 68 14 C 64 22, 62 28, 60 36 Z")}
          {/* Top lavender crown (idx 6) */}
          {renderPart(6, "M 60 22 C 48 18, 52 4, 60 2 C 68 4, 72 18, 60 22 Z")}
        </g>
      )}
    </svg>
  );
}

/** ---------- Add/Edit Modal Component ---------- */

function AddEditHabitModal({
  habit,
  selectedDate,
  onClose,
  onSaved,
}: {
  habit?: CustomHabit;
  selectedDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { currentUser } = useAuth();
  const [name, setName] = useState(habit?.name ?? "");
  const [description, setDescription] = useState(habit?.description ?? "");
  const [trackingType, setTrackingType] = useState<"once_daily" | "counter">(
    habit?.tracking_type ?? "once_daily"
  );
  const [targetCount, setTargetCount] = useState(habit?.target_count ?? 3);
  const [durationType, setDurationType] = useState<"week" | "month" | "custom" | "once" | "lifetime">(
    (habit?.duration_type as any) ?? "week"
  );
  const [durationDays, setDurationDays] = useState(habit?.duration_days ?? 7);
  const [flowerType, setFlowerType] = useState<"tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender">(
    habit?.flower_type ?? "tulip"
  );
  const [isGlobal, setIsGlobal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (habit?.id != null) {
        // Edit mode
        await updateHabit(habit.id, {
          name,
          description,
          tracking_type: trackingType,
          target_count: trackingType === "once_daily" ? 1 : targetCount,
          duration_type: durationType,
          duration_days: durationType === "custom" ? durationDays : durationType === "month" ? 30 : durationType === "once" ? 1 : 7,
          flower_type: flowerType,
        });
      } else if (isGlobal) {
        // Global habit mode
        await createGlobalHabit({
          name,
          description,
          tracking_type: trackingType,
          target_count: targetCount,
          duration_type: durationType,
          duration_days: durationType === "custom" ? durationDays : durationType === "month" ? 30 : durationType === "once" ? 1 : 7,
          flower_type: flowerType,
          start_date: selectedDate,
        });
      } else {
        // Personal Add mode
        await createHabit({
          name,
          description,
          tracking_type: trackingType,
          target_count: targetCount,
          duration_type: durationType,
          duration_days: durationType === "custom" ? durationDays : durationType === "month" ? 30 : durationType === "once" ? 1 : 7,
          flower_type: flowerType,
          start_date: selectedDate,
        });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={habit ? "تعديل الخُلق / الفعل" : "إضافة خُلق أو فعل جديد"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
        className="space-y-2.5 text-right"
      >
        <label className="block">
          <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">اسم الخُلق أو السلوك</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: التسامح والصفح، الصدقة اليومية"
            autoFocus
            className="w-full rounded-xl border border-input bg-white px-3 py-1.5 text-xs outline-none focus:border-[color:var(--habits)] font-semibold"
          />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">وصف اختياري (نيّة الالتزام)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="اكتب تفاصيل أو نية الالتزام بهذا السلوك"
            className="w-full rounded-xl border border-input bg-white px-3 py-1.5 text-xs outline-none focus:border-[color:var(--habits)]"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">نوع التتبع</span>
            <select
              value={trackingType}
              onChange={(e) => setTrackingType(e.target.value as any)}
              className="w-full rounded-xl border border-input bg-white px-2 py-1.5 text-xs outline-none font-semibold"
            >
              <option value="once_daily">مرة واحدة يومياً ✓</option>
              <option value="counter">عدّاد بعدد مرات</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">نوع الوردة</span>
            <select
              value={flowerType}
              onChange={(e) => setFlowerType(e.target.value as any)}
              className="w-full rounded-xl border border-input bg-white px-2 py-1.5 text-xs outline-none font-semibold"
            >
              <option value="tulip">توليب 🌷</option>
              <option value="jasmine">ياسمين 🌼</option>
              <option value="jouri">جوري 🌹</option>
              <option value="violet">بنفسج 🪻</option>
              <option value="daffodil">نرجس 🌻</option>
              <option value="lavender">لافندر 🪻</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {trackingType === "counter" && (
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">الهدف اليومي (مرات)</span>
              <input
                type="number"
                min={1}
                value={targetCount}
                onChange={(e) => setTargetCount(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-white px-3 py-1.5 text-xs outline-none font-semibold"
              />
            </label>
          )}

          <label className="block col-span-1">
            <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">مدة الالتزام</span>
            <select
              value={durationType}
              onChange={(e) => setDurationType(e.target.value as any)}
              className="w-full rounded-xl border border-input bg-white px-2 py-1.5 text-xs outline-none font-semibold"
            >
              <option value="once">يوم واحد فقط</option>
              <option value="week">أسبوع كامل</option>
              <option value="month">شهر كامل</option>
              <option value="custom">مدة مخصصة</option>
            </select>
          </label>

          {durationType === "custom" && (
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-bold text-muted-foreground">عدد الأيام</span>
              <input
                type="number"
                min={1}
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full rounded-xl border border-input bg-white px-3 py-1.5 text-xs outline-none font-semibold"
              />
            </label>
          )}
        </div>

        {!habit && currentUser?.isAdmin && (
          <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200/80 cursor-pointer mt-3">
            <input
              type="checkbox"
              checked={isGlobal}
              onChange={(e) => setIsGlobal(e.target.checked)}
              className="h-4 w-4 rounded accent-amber-600 cursor-pointer"
            />
            <div>
              <span className="text-xs font-bold text-amber-900 block">إضافة خُلق عام لجميع المستخدمين 🌐</span>
              <span className="text-[10px] text-amber-700 font-medium">نشر هذا الخلق ليتزامن ويظهر فوراً في حديقة الأخلاق لجميع مستخدمي التطبيق.</span>
            </div>
          </label>
        )}

        <div className="mt-4 pt-2 flex gap-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex-1 rounded-xl bg-[color:var(--habits)] py-2 text-xs font-bold text-white disabled:opacity-50 transition-all shadow-sm cursor-pointer hover:opacity-90"
          >
            {busy ? "جاري الحفظ..." : "حفظ"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-white px-4 py-2 text-xs font-bold transition-colors cursor-pointer hover:bg-slate-50"
          >
            إلغاء
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** ---------- History Modal Component ---------- */

function HistoryModal({
  habit,
  onClose,
}: {
  habit: CustomHabit;
  onClose: () => void;
}) {
  const [evaluations, setEvaluations] = useState<CustomHabitWeeklyEvaluation[]>([]);
  const [loading, setLoading] = useState(true);

  // Render a mini flower given historic completed days in a past week
  const [historicProgress, setHistoricProgress] = useState<Map<string, Map<string, CustomHabitProgress>>>(new Map());

  async function loadHistory() {
    setLoading(true);
    try {
      const list = await getHabitWeeklyEvaluations(habit.id!);
      setEvaluations(list);

      // For each evaluation, load progress of that week's 7 days
      const progressMap = new Map<string, Map<string, CustomHabitProgress>>();
      for (const ev of list) {
        // compute week days from the start date of that week
        const startD = new Date(ev.week_start);
        const days = Array.from({ length: 7 }, (_, i) => {
          const x = new Date(startD);
          x.setDate(startD.getDate() + i);
          return isoDate(x);
        });

        const pMap = await getHabitProgressForDates(habit.id!, days);
        progressMap.set(ev.week_start, pMap);
      }
      setHistoricProgress(progressMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, [habit]);

  return (
    <ModalShell title={`سجل التزام: ${habit.name}`} onClose={onClose}>
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        {loading ? (
          <div className="text-center py-10 text-xs text-muted-foreground">جارٍ تحميل السجلات…</div>
        ) : evaluations.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground bg-muted/30 rounded-2xl border border-dashed">
            لا توجد أسابيع مؤرشفة بعد. سينتقل الأسبوع للسجل تلقائياً عند انتهائه (يوم الجمعة).
          </div>
        ) : (
          <div className="space-y-4">
            {evaluations.map((ev) => {
              const startD = new Date(ev.week_start);
              const days = Array.from({ length: 7 }, (_, i) => {
                const x = new Date(startD);
                x.setDate(startD.getDate() + i);
                return isoDate(x);
              });
              const pMap = historicProgress.get(ev.week_start) ?? new Map();

              return (
                <div
                  key={ev.id}
                  className="p-4 rounded-2xl border border-border bg-white/60 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-foreground">
                        الأسبوع: {formatArabicDate(new Date(ev.week_start))} - {formatArabicDate(new Date(ev.week_end))}
                      </span>
                      <span className="rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5">
                        التزام {ev.commitment_percent}%
                      </span>
                    </div>
                    {ev.message && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground font-serif">
                        «{ev.message}»
                      </p>
                    )}
                  </div>

                  <div className="bg-muted/30 p-1.5 rounded-xl border border-dashed flex items-center justify-center">
                    <HabitFlower
                      habit={habit}
                      progressMap={pMap}
                      weekDates={days}
                      size={50}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="mt-5 text-left">
        <button
          onClick={onClose}
          className="rounded-xl border border-border bg-white px-5 py-2 text-sm font-bold transition-colors"
        >
          إغلاق
        </button>
      </div>
    </ModalShell>
  );
}

/** ---------- Modal Shell Component ---------- */

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-background p-5 shadow-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
