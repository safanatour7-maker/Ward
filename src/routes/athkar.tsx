import { createFileRoute } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { Plus, FolderPlus, Trash2, ChevronDown, ChevronUp, Sparkles, X, Edit2, Calendar, ChevronRight, ChevronLeft } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { z } from "zod";
import { db } from "@/lib/db";
import type { ThikrGroup, ThikrItem, ThikrProgress } from "@/lib/db";
import {
  computeWeeklyStats,
  createGroup,
  createItem,
  deleteGroup,
  deleteItem,
  getAllTodayProgress,
  listGroups,
  listItems,
  pickWisdomForWeek,
  incrementToday,
  decrementToday,
  resetToday,
  completeToday,
  updateItem,
  type WeeklyStats,
} from "@/lib/athkar";
import { TasbihCounter } from "@/components/TasbihCounter";
import { isoDate, weekDays, arabicMonthYear, formatArabicDate } from "@/lib/date-utils";
import { MiniFlower } from "@/components/MiniFlower";

const athkarSearchSchema = z.object({
  date: z.string().optional(),
});

export const Route = createFileRoute("/athkar")({
  validateSearch: athkarSearchSchema,
  head: () => ({
    meta: [
      { title: "ورد الأذكار — وَرْد" },
      { name: "description", content: "بناء ومتابعة ورد الأذكار اليومي عبر نظام المسبحة." },
    ],
  }),
  component: AthkarScreen,
});

function AthkarScreen() {
  const { date } = Route.useSearch();
  const today = isoDate();
  const [selectedDate, setSelectedDate] = useState<string>(() => date || today);

  useEffect(() => {
    if (date) {
      setSelectedDate(date);
    } else {
      setSelectedDate(isoDate());
    }
  }, [date]);

  // Collapsible calendar/stats card
  const [showCalendar, setShowCalendar] = useState(() => {
    return localStorage.getItem("athkar_show_calendar") !== "false";
  });

  const toggleCalendar = () => {
    const next = !showCalendar;
    setShowCalendar(next);
    localStorage.setItem("athkar_show_calendar", String(next));
  };

  // Live queries for reactive updates
  const groups = useLiveQuery(() => db.thikr_groups.orderBy("id").toArray()) ?? [];
  const items = useLiveQuery(() => db.thikr_items.orderBy("id").toArray()) ?? [];
  
  const progressList = useLiveQuery(
    () => db.thikr_progress.where("date").equals(selectedDate).toArray(),
    [selectedDate]
  ) ?? [];

  const progress = useMemo(() => {
    const map = new Map<number, ThikrProgress>();
    for (const r of progressList) {
      map.set(r.thikr_item_id, r);
    }
    return map;
  }, [progressList]);

  const weeklyBeads = useLiveQuery(async () => {
    const days = weekDays(); // Sat..Fri
    const allItems = await db.thikr_items.toArray();
    if (allItems.length === 0) {
      return days.map((d) => ({ date: d, ratio: 0 }));
    }
    const pRows = await db.thikr_progress.where("date").anyOf(days).toArray();
    
    return days.map((d) => {
      const dayProgress = pRows.filter((r) => r.date === d);
      const completedCount = dayProgress.filter((r) => r.completed).length;
      const ratio = completedCount / allItems.length;
      return { date: d, ratio };
    });
  }, [items]) ?? [];

  const stats = useMemo(() => {
    if (weeklyBeads.length === 0) return null;
    const elapsedDays = weeklyBeads.filter((b) => b.date <= today);
    if (elapsedDays.length === 0) return null;
    const sumRatio = elapsedDays.reduce((sum, b) => sum + b.ratio, 0);
    const pct = Math.round((sumRatio / elapsedDays.length) * 100);
    return {
      commitment_percent: pct,
    };
  }, [weeklyBeads, today]);

  const [wisdom, setWisdom] = useState<string>("");
  const [openCounter, setOpenCounter] = useState<ThikrItem | null>(null);
  const [editingItem, setEditingItem] = useState<ThikrItem | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [preselectedGroupId, setPreselectedGroupId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    type: "item" | "group";
    id: number;
    title: string;
  } | null>(null);
  const [athkarViewType, setAthkarViewType] = useState<"week" | "month">(() => {
    return (localStorage.getItem("athkar_calendar_view_type") as any) || "week";
  });

  const toggleAthkarViewType = (type: "week" | "month") => {
    setAthkarViewType(type);
    localStorage.setItem("athkar_calendar_view_type", type);
  };

  // Monthly calendar calculations
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const jsDay = firstOfMonth.getDay(); 
  const leadBlanks = (jsDay + 1) % 7;

  const monthCells = useMemo(() => {
    const cells: Array<{ date: Date | null; iso: string | null }> = [];
    for (let i = 0; i < leadBlanks; i++) cells.push({ date: null, iso: null });
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(year, month, d);
      cells.push({ date: dt, iso: isoDate(dt) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, iso: null });
    return cells;
  }, [year, month, leadBlanks, daysInMonth]);

  const monthStart = isoDate(new Date(year, month, 1));
  const monthEnd = isoDate(new Date(year, month, daysInMonth));

  const monthProgressRows = useLiveQuery(
    () =>
      db.thikr_progress
        .where("date")
        .between(monthStart, monthEnd, true, true)
        .toArray(),
    [monthStart, monthEnd]
  ) ?? [];

  const monthFills = useMemo(() => {
    const out: Record<string, number> = {};
    if (items.length === 0) return out;
    const activeIds = new Set(items.map((it) => it.id));

    for (const c of monthCells) {
      if (!c.iso) continue;
      const dayProgress = monthProgressRows.filter(
        (r) => r.date === c.iso && activeIds.has(r.thikr_item_id)
      );
      const completedCount = dayProgress.filter((r) => r.completed).length;
      out[c.iso] = completedCount / items.length;
    }
    return out;
  }, [items, monthCells, monthProgressRows]);

  useEffect(() => {
    pickWisdomForWeek().then(setWisdom);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<number | "none", ThikrItem[]>();
    map.set("none", []);
    for (const g of groups) map.set(g.id!, []);
    for (const it of items) {
      const key = it.group_id ?? "none";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return map;
  }, [groups, items]);

  const handleAddDhikrToGroup = (groupId: number) => {
    setPreselectedGroupId(groupId);
    setShowAddItem(true);
  };

  const AR_DAYS_SHORT = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];
  const AR_DAYS_LETTER = ["س", "ح", "ن", "ث", "ر", "خ", "ج"];

  return (
    <div dir="rtl" className="screen screen--athkar min-h-[100dvh] px-4 pt-6 pb-36">
      <header className="pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">
            {selectedDate === today ? "ورد الأذكار" : `إنجازك في يوم: ${formatArabicDate(new Date(selectedDate))}`}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            سبّح بلطف، وداوم ولو قَلّ.
          </p>
        </div>
        <button
          onClick={toggleCalendar}
          className="flex items-center gap-1 rounded-full border border-border bg-white/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-white active:scale-95 transition-all"
        >
          {showCalendar ? "إخفاء التقويم" : "إظهار التقويم"}
        </button>
      </header>

      {/* Weekly & Monthly Athkar Calendar */}
      {showCalendar && stats && (
        <section className="mb-4 rounded-3xl border border-[color-mix(in_oklch,var(--athkar)_25%,transparent)] bg-white/70 p-4.5 shadow-sm backdrop-blur animate-in fade-in slide-in-from-top-3 duration-200 text-right">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="text-xs text-muted-foreground font-bold">
                {athkarViewType === "week" ? "التزامك الأسبوعي بالأذكار" : `ورد الأذكار لشهر: ${arabicMonthYear(now)}`}
              </div>
              <div className="text-3xl font-black tabular-nums text-[color:var(--athkar)] mt-0.5">
                {stats.commitment_percent}%
              </div>
            </div>

            {/* Period Navigators */}
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
              {selectedDate !== today && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(today)}
                  className="px-2.5 py-1 rounded-xl bg-[color:var(--athkar)] text-white text-[11px] font-extrabold shadow-2xs hover:opacity-90 transition-all cursor-pointer active:scale-95"
                >
                  اليوم
                </button>
              )}

              <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const cur = new Date(selectedDate);
                    cur.setMonth(cur.getMonth() - 1, 1);
                    setSelectedDate(isoDate(cur));
                  }}
                  title="الشهر السابق"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition-all cursor-pointer active:scale-95 shadow-2xs"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-xs font-extrabold text-[color:var(--athkar)] px-2 tabular-nums">
                  {arabicMonthYear(new Date(selectedDate))}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cur = new Date(selectedDate);
                    cur.setMonth(cur.getMonth() + 1, 1);
                    setSelectedDate(isoDate(cur));
                  }}
                  title="الشهر التالي"
                  className="p-1.5 rounded-xl hover:bg-white text-slate-700 transition-all cursor-pointer active:scale-95 shadow-2xs"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>

              <span className="text-[11px] font-bold text-[color:var(--athkar)] bg-[color-mix(in_oklch,var(--athkar)_10%,transparent)] border border-[color-mix(in_oklch,var(--athkar)_25%,transparent)] px-2.5 py-1 rounded-xl">
                التقويم الشهري 🗓️
              </span>
            </div>
          </div>

          {/* MONTH VIEW - Beautiful Jasmine flowers grid for Athkar */}
          <div>
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-muted-foreground/80 mb-1.5">
                {AR_DAYS_SHORT.map((w) => (
                  <div key={w} className="pb-1 font-bold">
                    {w}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {monthCells.map((c, i) => {
                  if (!c.date || !c.iso) return <div key={i} className="aspect-square opacity-30" />;
                  const isToday = c.iso === today;
                  const cellDate = c.iso;
                  const isSelected = cellDate === selectedDate;
                  const ratio = monthFills[cellDate] ?? 0;
                  const pct = Math.round(ratio * 100);

                  return (
                    <div
                      key={i}
                      onClick={() => setSelectedDate(cellDate)}
                      className={`relative aspect-square flex flex-col items-center justify-between p-1 rounded-xl border transition-all overflow-hidden cursor-pointer ${
                        isSelected
                          ? "border-[color:var(--athkar)] ring-2 ring-[color:var(--athkar)] ring-offset-1 shadow-xs"
                          : isToday
                          ? "border-[color:var(--athkar)]/50 ring-1 ring-[color:var(--athkar)]/25 ring-offset-1 shadow-xs"
                          : ratio >= 1
                          ? "border-emerald-200"
                          : "border-slate-100"
                      }`}
                      style={{
                        backgroundColor: isSelected
                          ? "rgba(35, 181, 171, 0.08)"
                          : ratio > 0
                          ? `rgba(35, 181, 171, ${0.03 + ratio * 0.08})`
                          : "white"
                      }}
                      title={`${c.date.getDate()} — نسبة إتمام الورد: ${pct}%`}
                    >
                      {/* Day number inside a beautifully colored circular donut progress */}
                      <div
                        className="relative flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold tabular-nums select-none"
                        style={{
                          background: ratio >= 1
                            ? "var(--athkar)"
                            : ratio > 0
                            ? `conic-gradient(var(--athkar) 0% ${pct}%, #f1f5f9 ${pct}% 100%)`
                            : "transparent",
                          color: ratio >= 1 ? "white" : "#475569",
                          border: ratio === 0 ? "1px solid #f1f5f9" : undefined
                        }}
                      >
                        {/* Inner white mask for ring progress */}
                        {ratio > 0 && ratio < 1 && (
                          <div className="absolute inset-[2.5px] rounded-full bg-white" />
                        )}
                        <span className="relative z-10">
                          {c.date.getDate()}
                        </span>
                      </div>

                      {/* Render Jasmine flower representing completion */}
                      <div className="flex items-center justify-center mt-auto mb-0.5">
                        {items.length > 0 && (
                          <MiniFlower
                            type="jasmine"
                            completed={ratio >= 0.5}
                            size={ratio >= 1.0 ? 14 : ratio > 0 ? 11 : 8}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          {wisdom && (
            <p className="mt-3 text-center font-serif text-[12.5px] leading-relaxed text-foreground/85 border-t border-dashed border-border/40 pt-2.5 select-none">
              «{wisdom}»
            </p>
          )}
        </section>
      )}

      {/* Actions */}
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => {
            setPreselectedGroupId(null);
            setShowAddItem(true);
          }}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-[color:var(--athkar)] py-2.5 text-sm font-bold text-white shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" /> ذكر جديد
        </button>
        <button
          onClick={() => setShowAddGroup(true)}
          className="flex items-center justify-center gap-1.5 rounded-2xl border border-[color-mix(in_oklch,var(--athkar)_30%,transparent)] bg-white/70 px-4 py-2.5 text-sm font-bold text-foreground hover:bg-white active:scale-[0.98] transition-all"
        >
          <FolderPlus className="h-4 w-4" /> مجموعة
        </button>
      </div>

      {/* Groups + items */}
      {items.length === 0 && groups.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          لا توجد أذكار بعد. أضف أول ذكر لتبدأ.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupBlock
              key={g.id}
              group={g}
              items={grouped.get(g.id!) ?? []}
              progress={progress}
              onOpen={setOpenCounter}
              onEditItem={setEditingItem}
              onAddDhikrToGroup={handleAddDhikrToGroup}
              selectedDate={selectedDate}
              onDeleteGroup={async () => {
                setConfirmDelete({
                  type: "group",
                  id: g.id!,
                  title: `حذف مجموعة «${g.name}»؟ (الأذكار داخلها لن تُحذف)`,
                });
              }}
              onDeleteItem={async (id) => {
                const item = items.find((it) => it.id === id);
                setConfirmDelete({
                  type: "item",
                  id,
                  title: `حذف الذكر «${item?.name ?? ""}» مع سجلاته اليومية؟`,
                });
              }}
            />
          ))}
          {(grouped.get("none")?.length ?? 0) > 0 && (
            <GroupBlock
              group={null}
              items={grouped.get("none")!}
              progress={progress}
              onOpen={setOpenCounter}
              onEditItem={setEditingItem}
              selectedDate={selectedDate}
              onDeleteItem={async (id) => {
                const item = items.find((it) => it.id === id);
                setConfirmDelete({
                  type: "item",
                  id,
                  title: `حذف الذكر «${item?.name ?? ""}» مع سجلاته اليومية؟`,
                });
              }}
            />
          )}
        </div>
      )}

      {/* Modals */}
      {showAddItem && (
        <AddItemModal
          groups={groups}
          onClose={() => {
            setShowAddItem(false);
            setPreselectedGroupId(null);
          }}
          defaultGroupId={preselectedGroupId}
          onSaved={async () => {
            setShowAddItem(false);
            setPreselectedGroupId(null);
          }}
        />
      )}
      {editingItem && (
        <AddItemModal
          groups={groups}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={async () => {
            setEditingItem(null);
          }}
        />
      )}
      {showAddGroup && (
        <AddGroupModal
          onClose={() => setShowAddGroup(false)}
          onSaved={async () => {
            setShowAddGroup(false);
          }}
        />
      )}
      {openCounter && (
        <TasbihCounter
          item={openCounter}
          date={selectedDate}
          onClose={async () => {
            setOpenCounter(null);
          }}
          onChange={(p) => {
            // Live query handles updates automatically, but we can set local state if needed.
          }}
        />
      )}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-slate-100 text-center animate-in scale-in duration-150">
            <h3 className="text-base font-bold text-slate-900 mb-2">تأكيد الحذف</h3>
            <p className="text-sm text-slate-600 mb-6 leading-relaxed">{confirmDelete.title}</p>
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
                onClick={async () => {
                  if (confirmDelete.type === "item") {
                    await deleteItem(confirmDelete.id);
                  } else if (confirmDelete.type === "group") {
                    await deleteGroup(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
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

function GroupBlock({
  group,
  items,
  progress,
  onOpen,
  onEditItem,
  onDeleteGroup,
  onDeleteItem,
  onAddDhikrToGroup,
  selectedDate,
}: {
  group: ThikrGroup | null;
  items: ThikrItem[];
  progress: Map<number, ThikrProgress>;
  onOpen: (item: ThikrItem) => void;
  onEditItem: (item: ThikrItem) => void;
  onDeleteGroup?: () => void | Promise<void>;
  onDeleteItem: (id: number) => void | Promise<void>;
  onAddDhikrToGroup?: (groupId: number) => void;
  selectedDate: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <section className="rounded-3xl border border-[color-mix(in_oklch,var(--athkar)_18%,transparent)] bg-white/70 p-3 shadow-sm backdrop-blur">
      <header className="mb-2 flex items-center justify-between px-1">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-1.5 text-sm font-bold text-foreground"
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          {group ? group.name : "بدون مجموعة"}
          <span className="text-xs font-normal text-muted-foreground">
            ({items.length})
          </span>
        </button>
        {group && onDeleteGroup && (
          <button
            onClick={onDeleteGroup}
            aria-label="حذف المجموعة"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-black/5"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </header>
      {!collapsed && (
        <>
          {items.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground border border-dashed border-border/40 rounded-2xl bg-white/40 mb-2">
              لا توجد أذكار في هذه المجموعة بعد.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {items.map((it) => {
                const p = progress.get(it.id!);
                const count = p?.current_count ?? 0;
                const done = p?.completed ?? false;
                const ratio = Math.min(1, count / it.target_count);
                return (
                  <li key={it.id}>
                    <div className="flex items-stretch gap-1.5">
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={async () => {
                          await incrementToday(it.id!, it.target_count, selectedDate);
                          if (navigator.vibrate) {
                            navigator.vibrate(count + 1 >= it.target_count ? [40, 40, 60] : 8);
                          }
                        }}
                        onKeyDown={async (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            await incrementToday(it.id!, it.target_count, selectedDate);
                            if (navigator.vibrate) {
                              navigator.vibrate(count + 1 >= it.target_count ? [40, 40, 60] : 8);
                            }
                          }
                        }}
                        className="group relative flex-1 overflow-hidden rounded-2xl border border-[color-mix(in_oklch,var(--athkar)_25%,transparent)] bg-white p-3 text-right active:scale-[0.96] hover:border-[color:var(--athkar)]/40 transition-all cursor-pointer shadow-xs select-none focus:outline-hidden focus:ring-2 focus:ring-[color:var(--athkar)]/50"
                        title="انقر للتسبيح مباشرة"
                      >
                        <div
                          className="absolute inset-y-0 right-0 bg-[color-mix(in_oklch,var(--athkar)_22%,transparent)] transition-all duration-300"
                          style={{ width: `${ratio * 100}%` }}
                          aria-hidden
                        />
                        <div className="relative flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="break-words text-wrap whitespace-pre-wrap text-sm font-bold text-foreground group-active:translate-x-[-1px] transition-transform">
                              {it.name}
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground font-semibold tabular-nums">
                              {count} / {it.target_count}
                              {done && (
                                <span className="mr-1.5 rounded-full bg-[color:var(--athkar)]/20 px-1.5 py-0.5 text-[10px] font-bold text-[color:var(--athkar)] inline-block">
                                  اكتمل ✓
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Quick decrement, reset, and direct Complete buttons */}
                          <div className="flex items-center gap-1.5 shrink-0 relative z-20">
                            {!done && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  e.preventDefault();
                                  await completeToday(it.id!, it.target_count, selectedDate);
                                  if (navigator.vibrate) {
                                    navigator.vibrate([40, 40, 60]);
                                  }
                                }}
                                className="px-2.5 py-1 text-xs font-black text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg shadow-xs cursor-pointer active:scale-95 transition-all"
                                title="تم مباشرة (إكمال الورد)"
                              >
                                تم
                              </button>
                            )}

                            {count > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    await decrementToday(it.id!, selectedDate);
                                    if (navigator.vibrate) {
                                      navigator.vibrate(8);
                                    }
                                  }}
                                  className="h-7 w-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm transition-all active:scale-90 cursor-pointer shadow-xs"
                                  title="تراجع خطوة (-١)"
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    await resetToday(it.id!, selectedDate);
                                    if (navigator.vibrate) {
                                      navigator.vibrate(15);
                                    }
                                  }}
                                  className="h-7 w-7 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs transition-all active:scale-90 cursor-pointer shadow-xs"
                                  title="تصفير العداد"
                                >
                                  ⟲
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* View Counter Icon Button */}
                      <button
                        onClick={() => onOpen(it)}
                        aria-label="العداد الكامل"
                        className="rounded-2xl border border-border/60 bg-white/70 px-2.5 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                        title="شاشة العداد الكاملة"
                      >
                        <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <circle cx="12" cy="12" r="4" fill="currentColor" className="opacity-40" />
                        </svg>
                        <span className="text-[9px] font-semibold leading-none">عداد</span>
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => onEditItem(it)}
                        aria-label="تعديل الذكر"
                        className="rounded-2xl border border-border/60 bg-white/70 px-2.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-600 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                        title="تعديل الذكر"
                      >
                        <Edit2 className="h-4.5 w-4.5" />
                        <span className="text-[9px] font-semibold leading-none">تعديل</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => onDeleteItem(it.id!)}
                        aria-label="حذف الذكر"
                        className="rounded-2xl border border-rose-200/80 bg-rose-50/70 px-2.5 text-rose-600 hover:bg-rose-100 active:scale-95 transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer"
                        title="حذف الذكر"
                      >
                        <Trash2 className="h-4.5 w-4.5" />
                        <span className="text-[9px] font-semibold leading-none">حذف</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {group && onAddDhikrToGroup && (
            <div className="mt-2 text-left">
              <button
                onClick={() => onAddDhikrToGroup(group.id!)}
                className="inline-flex items-center gap-1 text-xs font-bold text-[color:var(--athkar)] hover:underline cursor-pointer"
              >
                + إضافة ذكر لهذه المجموعة
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const SUGGESTED_ATHKAR = [
  {
    name: "سبحان الله وبحمده سبحان الله العظيم",
    target: 100,
    label: "سبحان الله وبحمده سبحان الله العظيم",
  },
  {
    name: "لا إله إلا الله وحده لا شريك له، له الملك وله الحمد، وهو على كل شيء قدير",
    target: 100,
    label: "لا إله إلا الله وحده لا شريك له...",
  },
  {
    name: "اللهم صلِّ على سيدنا محمد طب القلوب ودوائها، وعافية الأبدان وشفائها، ونور الأبصار وضيائها، وعلى آله وصحبه وسلم",
    target: 100,
    label: "صلاة طب القلوب",
  },
  {
    name: "اللهم صلِّ صلاة كاملة وسلِّم سلاماً تاماً على سيدنا محمد الذي تنحلُّ به العُقد، وتنفرجُ به الكُرَب، وتُقضى به الحوائج، وتُنالُ به الرغائب وحُسن الخواتيم، ويُستسقى الغمام بوجهه الكريم وعلى آله وصحبه في كل لمحة ونفس بعدد كل معلوم لك",
    target: 11,
    label: "الصلاة النارية الكاملة",
  },
  {
    name: "اللهم إني أسألك بنور وجه الله العظيم، الذي ملأ أركان عرش الله العظيم، وقامت به عوالم الله العظيم، أن تصلي على سيدنا محمد ذي القدر العظيم، وعلى آل نبي الله العظيم، بقدر عظمة ذات الله العظيم، في كل لمحة ونفس بعدد ما في علم الله العظيم، صلاة دائمة بدوام الله العظيم، تعظيماً لحقك يا مولانا يا محمد يا ذا الخلق العظيم، وسلم عليه وعلى آله مثل ذلك، واجمع بيني وبينه كما جمعت بين الروح والنفس، ظاهراً وباطناً، يقظة ومناماً، واجعله يا رب روحاً لذاتي من جميع الوجوه في الدنيا قبل الآخرة يا عظيم",
    target: 11,
    label: "الصلاة العظيمية الكاملة",
  }
];

function AddItemModal({
  groups,
  onClose,
  onSaved,
  defaultGroupId = null,
  item = null,
}: {
  groups: ThikrGroup[];
  onClose: () => void;
  onSaved: () => void;
  defaultGroupId?: number | null;
  item?: ThikrItem | null;
}) {
  const [name, setName] = useState(item ? item.name : "");
  const [target, setTarget] = useState(item ? item.target_count : 33);
  const [groupId, setGroupId] = useState<number | null>(item ? item.group_id : defaultGroupId);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (item) {
        await updateItem(item.id!, { name, target_count: target, group_id: groupId });
      } else {
        await createItem({ name, target_count: target, group_id: groupId });
      }
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title={item ? "تعديل الذكر" : "ذكر جديد"} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4 animate-in fade-in duration-200"
      >
        {!item && (
          <div className="block text-sm">
            <span className="mb-1 block text-xs font-bold text-slate-700">اختر من الأذكار والصلوات المقترحة</span>
            <select
              onChange={(e) => {
                const val = e.target.value;
                if (val !== "") {
                  const idx = Number(val);
                  const selected = SUGGESTED_ATHKAR[idx];
                  if (selected) {
                    setName(selected.name);
                    setTarget(selected.target);
                  }
                }
              }}
              defaultValue=""
              className="w-full rounded-xl border border-input bg-white px-3 py-2 text-xs outline-none focus:border-[color:var(--athkar)] cursor-pointer text-slate-700"
            >
              <option value="">-- اضغط للاختيار والتعبئة التلقائية --</option>
              {SUGGESTED_ATHKAR.map((sug, idx) => (
                <option key={idx} value={idx}>
                  {sug.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">اسم الذكر</span>
          <textarea
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="اكتب هنا صيغة الذكر أو الدعاء المبارك..."
            rows={name.length > 45 ? 4 : 2}
            autoFocus
            className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--athkar)] resize-none"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">العدد المستهدف يومياً</span>
          <input
            type="number"
            min={1}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
            className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-[color:var(--athkar)]"
          />
        </label>
        {groups.length > 0 && (
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">المجموعة (اختياري)</span>
            <select
              value={groupId ?? ""}
              onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : null)}
              className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none"
            >
              <option value="">بدون مجموعة</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-5 flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex-1 rounded-xl bg-[color:var(--athkar)] py-2.5 text-sm font-bold text-white disabled:opacity-50 active:scale-98 transition-transform cursor-pointer"
          >
            {busy ? "جاري الحفظ..." : "حفظ الذكر"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold active:scale-98 transition-transform cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function AddGroupModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createGroup(name);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalShell title="مجموعة جديدة" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="space-y-4"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">اسم المجموعة</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="أذكار الصباح"
            autoFocus
            className="w-full rounded-xl border border-input bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--athkar)]"
          />
        </label>
        <div className="mt-5 flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="flex-1 rounded-xl bg-[color:var(--athkar)] py-2.5 text-sm font-bold text-white disabled:opacity-50 active:scale-98 transition-transform cursor-pointer"
          >
            {busy ? "جاري الحفظ..." : "حفظ المجموعة"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-bold active:scale-98 transition-transform cursor-pointer"
          >
            إلغاء
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

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
        className="w-full max-w-md rounded-3xl bg-background p-5 shadow-xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200 relative my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold text-foreground">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted transition-colors text-muted-foreground cursor-pointer"
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
