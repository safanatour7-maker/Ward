import { db, type CustomHabit, type CustomHabitProgress, type CustomHabitWeeklyEvaluation, type TrackingType, type DurationType } from "./db";
import { isoDate, startOfWeek, endOfWeek, weekDays } from "./date-utils";
import { collection, getDocs, setDoc, doc } from "firebase/firestore";
import { dbFirestore } from "./firebase";
import { autoCloudSync } from "./cloud-sync";

/** ---------- List & CRUD ---------- */

export async function syncGlobalHabitsFromCloud(): Promise<void> {
  try {
    const querySnapshot = await getDocs(collection(dbFirestore, "global_habits")).catch(() => null);
    if (!querySnapshot) return;
    const globalItems: Array<Partial<CustomHabit> & { global_id: string }> = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.name) {
        globalItems.push({
          global_id: docSnap.id,
          name: data.name,
          description: data.description || "",
          tracking_type: data.tracking_type || "once_daily",
          target_count: data.target_count || 1,
          duration_type: data.duration_type || "week",
          duration_days: data.duration_days || 7,
          flower_type: data.flower_type || "tulip",
          start_date: data.start_date || isoDate(),
        });
      }
    });

    const localHabits = await db.custom_habits.toArray();

    for (const item of globalItems) {
      if (!item.name) continue;
      const cleanName = item.name.trim();
      const existing = localHabits.find(
        (h) => (h.global_id && h.global_id === item.global_id) || h.name.trim().toLowerCase() === cleanName.toLowerCase()
      );

      if (existing) {
        if (
          existing.name !== cleanName ||
          existing.description !== item.description ||
          existing.duration_type !== item.duration_type ||
          existing.flower_type !== item.flower_type ||
          existing.global_id !== item.global_id
        ) {
          await db.custom_habits.update(existing.id!, {
            global_id: item.global_id,
            name: cleanName,
            description: item.description || "",
            duration_type: item.duration_type || "week",
            duration_days: item.duration_days || 7,
            flower_type: item.flower_type || "tulip",
          });
        }
      } else {
        await db.custom_habits.add({
          global_id: item.global_id,
          name: cleanName,
          description: item.description || "",
          tracking_type: item.tracking_type || "once_daily",
          target_count: item.target_count || 1,
          duration_type: item.duration_type || "week",
          duration_days: item.duration_days || 7,
          start_date: item.start_date || isoDate(),
          status: "active",
          created_at: new Date().toISOString(),
          flower_type: item.flower_type || "tulip",
        });
      }
    }
  } catch (err) {
    console.error("Failed to sync global habits:", err);
  }
}

export async function createGlobalHabit(input: {
  name: string;
  description?: string;
  tracking_type: TrackingType;
  target_count: number;
  duration_type: DurationType;
  duration_days: number;
  flower_type?: "tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender";
  start_date?: string;
}): Promise<void> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error("اسم الخُلق أو الفعل فارغ");

  const today = input.start_date || isoDate();
  const habitId = "ghabit_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7);

  const payload = {
    name: cleanName,
    description: input.description?.trim() || "",
    tracking_type: input.tracking_type,
    target_count: input.tracking_type === "once_daily" ? 1 : Math.max(1, input.target_count),
    duration_type: input.duration_type,
    duration_days: input.duration_days,
    start_date: today,
    flower_type: input.flower_type ?? "tulip",
    created_at: new Date().toISOString(),
  };

  // Add to Firestore global_habits collection for ALL users
  await setDoc(doc(dbFirestore, "global_habits", habitId), payload, { merge: true }).catch(() => {});

  // Add to local Dexie database as well
  await db.custom_habits.add({
    ...payload,
    global_id: habitId,
    status: "active",
  });
}

export async function updateGlobalHabit(
  docId: string,
  oldName: string,
  input: {
    name: string;
    description?: string;
    duration_type: DurationType;
    duration_days: number;
    flower_type?: "tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender";
  }
): Promise<void> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error("اسم الخُلق أو الفعل فارغ");

  const payload = {
    name: cleanName,
    description: input.description?.trim() || "",
    duration_type: input.duration_type,
    duration_days: input.duration_days,
    flower_type: input.flower_type ?? "tulip",
    updated_at: new Date().toISOString(),
  };

  await setDoc(doc(dbFirestore, "global_habits", docId), payload, { merge: true }).catch(() => {});

  // Update in local Dexie habit table if found (matching by global_id, oldName or cleanName)
  const localHabits = await db.custom_habits.toArray();
  const match = localHabits.find(
    (h) => (h.global_id && h.global_id === docId) ||
           h.name.trim().toLowerCase() === oldName.trim().toLowerCase() ||
           h.name.trim().toLowerCase() === cleanName.toLowerCase()
  );
  if (match && match.id) {
    await db.custom_habits.update(match.id, {
      ...payload,
      global_id: docId,
    });
  }
}

export async function deleteGlobalHabit(docId: string, name?: string): Promise<void> {
  const { deleteDoc } = await import("firebase/firestore");
  await deleteDoc(doc(dbFirestore, "global_habits", docId)).catch(() => {});
  if (name) {
    const match = await db.custom_habits.where("name").equals(name.trim()).first();
    if (match && match.id) {
      await deleteHabit(match.id);
    }
  }
}

export async function listActiveHabits(): Promise<CustomHabit[]> {
  return db.custom_habits.where("status").equals("active").toArray();
}

export async function listArchivedHabits(): Promise<CustomHabit[]> {
  return db.custom_habits.where("status").equals("archived").toArray();
}

export async function createHabit(input: {
  name: string;
  description?: string;
  tracking_type: TrackingType;
  target_count: number;
  duration_type: DurationType;
  duration_days: number;
  flower_type?: "tulip" | "jasmine" | "jouri" | "violet" | "daffodil" | "lavender";
  start_date?: string;
}): Promise<number> {
  const cleanName = input.name.trim();
  if (!cleanName) throw new Error("اسم الخُلق أو الفعل فارغ");

  const today = input.start_date || isoDate();
  return (await db.custom_habits.add({
    name: cleanName,
    description: input.description?.trim(),
    tracking_type: input.tracking_type,
    target_count: input.tracking_type === "once_daily" ? 1 : Math.max(1, input.target_count),
    duration_type: input.duration_type,
    duration_days: input.duration_days,
    start_date: today,
    status: "active",
    created_at: new Date().toISOString(),
    flower_type: input.flower_type ?? "tulip",
  })) as number;
}

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split("-");
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }
  return new Date(dateStr);
}

export function isHabitActiveOnDate(h: CustomHabit, dateStr: string): boolean {
  const startStr = h.start_date || h.created_at?.slice(0, 10) || isoDate();
  
  if (h.duration_type === "lifetime") {
    return true;
  }

  if (h.duration_type === "once") {
    return startStr === dateStr;
  }

  if (h.duration_type === "week") {
    // Active only during the calendar week of start_date
    const startW = isoDate(startOfWeek(parseLocalDate(startStr)));
    const targetW = isoDate(startOfWeek(parseLocalDate(dateStr)));
    return startW === targetW;
  }
  
  if (h.duration_type === "month") {
    // Active for 30 days starting from start_date
    const startT = parseLocalDate(startStr).getTime();
    const targetT = parseLocalDate(dateStr).getTime();
    const diffDays = Math.floor((targetT - startT) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays < 30;
  }
  
  if (h.duration_type === "custom") {
    // Active for duration_days starting from start_date
    const startT = parseLocalDate(startStr).getTime();
    const targetT = parseLocalDate(dateStr).getTime();
    const diffDays = Math.floor((targetT - startT) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays < h.duration_days;
  }
  
  return true;
}

export async function updateHabit(id: number, patch: Partial<CustomHabit>) {
  if (patch.name !== undefined) {
    patch.name = patch.name.trim();
    if (!patch.name) throw new Error("اسم الخُلق أو الفعل فارغ");
  }
  await db.custom_habits.update(id, patch);
}

export async function deleteHabit(id: number) {
  await db.transaction("rw", db.custom_habits, db.custom_habit_progress, db.custom_habit_weekly_evaluation, async () => {
    await db.custom_habit_progress.where("habit_id").equals(id).delete();
    await db.custom_habit_weekly_evaluation.where("habit_id").equals(id).delete();
    await db.custom_habits.delete(id);
  });
}

/** ---------- Daily Progress ---------- */

export async function getHabitProgressToday(habitId: number): Promise<CustomHabitProgress> {
  return getHabitProgressForDate(habitId, isoDate());
}

export async function getHabitProgressForDate(habitId: number, date: string): Promise<CustomHabitProgress> {
  const row = await db.custom_habit_progress
    .where("[habit_id+date]")
    .equals([habitId, date])
    .first();
  if (row) return row;

  const id = await db.custom_habit_progress.add({
    habit_id: habitId,
    date: date,
    completed: false,
    count: 0,
  });
  return (await db.custom_habit_progress.get(id as number))!;
}

export async function toggleHabitProgress(habitId: number): Promise<CustomHabitProgress> {
  const row = await getHabitProgressToday(habitId);
  const nextCompleted = !row.completed;
  await db.custom_habit_progress.update(row.id!, {
    completed: nextCompleted,
    count: nextCompleted ? 1 : 0,
  });
  autoCloudSync();
  return { ...row, completed: nextCompleted, count: nextCompleted ? 1 : 0 };
}

export async function incrementHabitCounter(habitId: number, target: number): Promise<CustomHabitProgress> {
  return incrementHabitCounterForDate(habitId, target, isoDate());
}

export async function incrementHabitCounterForDate(habitId: number, target: number, date: string): Promise<CustomHabitProgress> {
  const row = await getHabitProgressForDate(habitId, date);
  const currentCount = row.count ?? 0;
  const nextCount = Math.min(target, currentCount + 1);
  const completed = nextCount >= target;
  await db.custom_habit_progress.update(row.id!, {
    count: nextCount,
    completed,
  });
  autoCloudSync();
  return { ...row, count: nextCount, completed };
}

export async function decrementHabitCounter(habitId: number): Promise<CustomHabitProgress> {
  return decrementHabitCounterForDate(habitId, isoDate());
}

export async function decrementHabitCounterForDate(habitId: number, date: string): Promise<CustomHabitProgress> {
  const row = await getHabitProgressForDate(habitId, date);
  const currentCount = row.count ?? 0;
  const nextCount = Math.max(0, currentCount - 1);
  const completed = false; // lowering count, so it shouldn't be auto-completed unless it's still at target which we won't allow
  await db.custom_habit_progress.update(row.id!, {
    count: nextCount,
    completed,
  });
  autoCloudSync();
  return { ...row, count: nextCount, completed };
}

export async function toggleHabitProgressForDate(habitId: number, date: string): Promise<CustomHabitProgress> {
  let row = await db.custom_habit_progress
    .where("[habit_id+date]")
    .equals([habitId, date])
    .first();
  if (!row) {
    const id = await db.custom_habit_progress.add({
      habit_id: habitId,
      date,
      completed: false,
      count: 0,
    });
    row = (await db.custom_habit_progress.get(id as number))!;
  }
  const nextCompleted = !row.completed;
  await db.custom_habit_progress.update(row.id!, {
    completed: nextCompleted,
    count: nextCompleted ? 1 : 0,
  });
  autoCloudSync();
  return { ...row, completed: nextCompleted, count: nextCompleted ? 1 : 0 };
}


/** Get habit progress for a list of ISO dates (e.g. current week days) */
export async function getHabitProgressForDates(habitId: number, dates: string[]): Promise<Map<string, CustomHabitProgress>> {
  const rows = await db.custom_habit_progress
    .where("habit_id")
    .equals(habitId)
    .and((r) => dates.includes(r.date))
    .toArray();

  const map = new Map<string, CustomHabitProgress>();
  for (const r of rows) {
    map.set(r.date, r);
  }
  return map;
}

/** ---------- Weekly / Monthly Evaluations & Auto-Archiving ---------- */

/** Compute current week's status for a habit */
export async function getHabitWeeklyStatus(habitId: number, refDate: Date = new Date()): Promise<{
  week_start: string;
  week_end: string;
  commitment_percent: number;
  days_completed: number;
}> {
  const days = weekDays(refDate);
  const today = isoDate(refDate);
  const elapsed = days.filter((d) => d <= today);

  const rows = await db.custom_habit_progress
    .where("habit_id")
    .equals(habitId)
    .and((r) => elapsed.includes(r.date))
    .toArray();

  const completedCount = rows.filter((r) => r.completed).length;
  const percent = elapsed.length > 0 ? Math.round((completedCount / elapsed.length) * 100) : 0;

  return {
    week_start: isoDate(startOfWeek(refDate)),
    week_end: isoDate(endOfWeek(refDate)),
    commitment_percent: percent,
    days_completed: completedCount,
  };
}

/** Pick rotating quotes from wisdom seed */
export async function pickWisdomForHabits(habitId: number): Promise<string> {
  const all = await db.wisdom_quotes.toArray();
  if (all.length === 0) return "داوم على فعل الخير والخلق الحسن.";
  // simple stable index using habitId + week_start
  const wk = isoDate(startOfWeek());
  const seed = wk.split("-").reduce((a, s) => a + Number(s), 0) + habitId;
  const q = all[seed % all.length];
  return q.source ? `${q.text} — ${q.source}` : q.text;
}

/** Auto-evaluate and archive finished weeks for active habits */
export async function processHabitsEvaluationsAndArchiving(): Promise<boolean> {
  const habits = await listActiveHabits();
  if (habits.length === 0) return false;

  const todayStr = isoDate();
  const currentWeekStart = isoDate(startOfWeek());
  let changed = false;

  for (const h of habits) {
    // 1. Check if previous weeks need evaluations.
    // Let's find previous weeks from the start_date of the habit up to today's week.
    const startD = new Date(h.start_date);
    const todayD = new Date(todayStr);

    // Roll back to the start of their weeks
    let weekIter = startOfWeek(startD);
    const endIter = startOfWeek(todayD);

    // Iterate through all weeks completed before this week
    while (weekIter.getTime() < endIter.getTime()) {
      const wkStartStr = isoDate(weekIter);
      const wkEndStr = isoDate(endOfWeek(weekIter));

      // check if evaluation already exists
      const existing = await db.custom_habit_weekly_evaluation
        .where("habit_id")
        .equals(h.id!)
        .and((x) => x.week_start === wkStartStr)
        .first();

      if (!existing) {
        // Calculate status for that past week
        const stats = await getHabitWeeklyStatus(h.id!, weekIter);
        const msg = await pickWisdomForHabits(h.id!);

        await db.custom_habit_weekly_evaluation.add({
          habit_id: h.id!,
          week_start: wkStartStr,
          week_end: wkEndStr,
          commitment_percent: stats.commitment_percent,
          message: msg,
          archived: true,
        });
        changed = true;
      }

      // advance by 7 days
      weekIter.setDate(weekIter.getDate() + 7);
    }

    // 2. Duration checking for ending entire habit.
    // Duration type: week / month / custom
    const elapsedDays = Math.floor((new Date(todayStr).getTime() - new Date(h.start_date).getTime()) / (1000 * 60 * 60 * 24));
    let limitDays = 7; // week default
    if (h.duration_type === "month") limitDays = 30;
    else if (h.duration_type === "custom") limitDays = h.duration_days;

    // If active duration is exceeded
    if (elapsedDays >= limitDays) {
      // Prompt user to extend, archive or delete
      // To prevent automatic forced deletion/archiving, we can keep its status as active but mark it as 'completed_duration' or archive it if it's over
      // The instruction says: "عند انتهاء المدة المحددة بالكامل (أسبوع/شهر/مدة مخصصة كاملة): تقييم ختامي شامل، ثم يُخيَّر المستخدم بين: تمديد، أرشفة، أو حذف نهائي."
      // So we can flag it in UI, or just let user trigger action. Let's make sure we show a card in UI.
    }
  }

  return changed;
}

/** Get list of archived evaluations for a habit grouped by month or just a list */
export async function getHabitWeeklyEvaluations(habitId: number): Promise<CustomHabitWeeklyEvaluation[]> {
  return db.custom_habit_weekly_evaluation
    .where("habit_id")
    .equals(habitId)
    .toArray();
}
