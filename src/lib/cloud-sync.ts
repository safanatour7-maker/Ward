import { doc, getDoc, setDoc } from "firebase/firestore";
import { dbFirestore } from "./firebase";
import {
  db,
  type PrayerLog,
  type ThikrProgress,
  type CustomHabitProgress,
  type QuranDailyReading,
  type QuranSurahState,
  type ThikrItem,
  type ThikrGroup,
  type CustomHabit,
  type DailyQuranSelection
} from "./db";

let quotaExceededCooldownUntil = 0;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function pushLocalToCloudDirect(userId: string): Promise<boolean> {
  if (!db || !userId) return false;

  if (Date.now() < quotaExceededCooldownUntil) {
    return false;
  }

  try {
    const thikrItems = await db.thikr_items.toArray();
    const thikrGroups = await db.thikr_groups.toArray();
    const thikrProgress = await db.thikr_progress.toArray();
    const customHabits = await db.custom_habits.toArray();
    const customHabitProgress = await db.custom_habit_progress.toArray();
    const quranDailyReading = await db.quran_daily_reading.toArray();
    const quranSurahState = await db.quran_surah_state.toArray();
    const dailyQuranSelection = await db.daily_quran_selection.toArray();
    const prayerLogs = await db.prayer_logs.toArray();

    // SAFETY GUARD: Never overwrite non-empty cloud data with an empty local dataset
    const isLocalEmpty =
      thikrProgress.length === 0 &&
      customHabitProgress.length === 0 &&
      quranDailyReading.length === 0 &&
      prayerLogs.length === 0;

    if (isLocalEmpty) {
      const existingSnap = await getDoc(doc(dbFirestore, "user_data", userId)).catch(() => null);
      if (existingSnap && existingSnap.exists()) {
        const exData = existingSnap.data();
        if (
          (exData.prayerLogs && exData.prayerLogs.length > 0) ||
          (exData.thikrProgress && exData.thikrProgress.length > 0) ||
          (exData.customHabitProgress && exData.customHabitProgress.length > 0) ||
          (exData.quranDailyReading && exData.quranDailyReading.length > 0)
        ) {
          console.warn("Prevented overwriting non-empty cloud data with empty local state.");
          return false;
        }
      }
    }

    const dataPayload = JSON.parse(
      JSON.stringify({
        thikrItems,
        thikrGroups,
        thikrProgress,
        customHabits,
        customHabitProgress,
        quranDailyReading,
        quranSurahState,
        dailyQuranSelection,
        prayerLogs,
        updatedAt: new Date().toISOString(),
      })
    );

    // Primary write: user_data document for user
    const userDataRef = doc(dbFirestore, "user_data", userId);
    await setDoc(userDataRef, dataPayload, { merge: true });

    // Secondary write if account ID differs
    const savedSession = typeof window !== "undefined" ? localStorage.getItem("app_account_session") : null;
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed?.email) {
          const cleanEmail = parsed.email.trim().toLowerCase();
          const accDocId = "acc_" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
          if (accDocId !== userId) {
            await setDoc(doc(dbFirestore, "user_data", accDocId), dataPayload, { merge: true }).catch(() => {});
          }
        }
      } catch (e) {}
    }

    return true;
  } catch (error: any) {
    const errStr = String(error?.message || error || "");
    if (errStr.includes("resource-exhausted") || errStr.includes("Quota limit exceeded") || errStr.includes("quota")) {
      console.warn("Firestore daily quota limit reached. Application will continue saving data locally on device.");
      quotaExceededCooldownUntil = Date.now() + 60 * 60 * 1000; // 1 hour cooldown
    } else {
      console.error("Failed to push local data to cloud:", error);
    }
    return false;
  }
}

export function pushLocalToCloud(userId: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Date.now() < quotaExceededCooldownUntil) {
      resolve(false);
      return;
    }
    if (syncDebounceTimer) {
      clearTimeout(syncDebounceTimer);
    }
    // 2s debounce to avoid quota exhaust on rapid taps
    syncDebounceTimer = setTimeout(async () => {
      const res = await pushLocalToCloudDirect(userId);
      resolve(res);
    }, 2000);
  });
}

/**
 * Helper merger functions to combine local and cloud records without ever wiping local unsynced progress.
 */

function mergePrayerLogsList(local: PrayerLog[], cloud: PrayerLog[]): PrayerLog[] {
  const map = new Map<string, PrayerLog>();
  cloud.forEach((p) => {
    if (p.date) {
      const copy = { ...p };
      delete copy.id;
      map.set(p.date, copy);
    }
  });
  local.forEach((p) => {
    if (!p.date) return;
    const existing = map.get(p.date);
    if (existing) {
      existing.fajr = existing.fajr || p.fajr;
      existing.dhuhr = existing.dhuhr || p.dhuhr;
      existing.asr = existing.asr || p.asr;
      existing.maghrib = existing.maghrib || p.maghrib;
      existing.isha = existing.isha || p.isha;
    } else {
      const copy = { ...p };
      delete copy.id;
      map.set(p.date, copy);
    }
  });
  return Array.from(map.values());
}

function mergeThikrProgressList(local: ThikrProgress[], cloud: ThikrProgress[]): ThikrProgress[] {
  const map = new Map<string, ThikrProgress>();
  cloud.forEach((p) => {
    if (p.thikr_item_id && p.date) {
      const copy = { ...p };
      delete copy.id;
      map.set(`${p.thikr_item_id}_${p.date}`, copy);
    }
  });
  local.forEach((p) => {
    if (!p.thikr_item_id || !p.date) return;
    const key = `${p.thikr_item_id}_${p.date}`;
    const existing = map.get(key);
    if (existing) {
      existing.completed = existing.completed || p.completed;
      existing.current_count = Math.max(existing.current_count || 0, p.current_count || 0);
    } else {
      const copy = { ...p };
      delete copy.id;
      map.set(key, copy);
    }
  });
  return Array.from(map.values());
}

function mergeCustomHabitProgressList(local: CustomHabitProgress[], cloud: CustomHabitProgress[]): CustomHabitProgress[] {
  const map = new Map<string, CustomHabitProgress>();
  cloud.forEach((p) => {
    if (p.habit_id && p.date) {
      const copy = { ...p };
      delete copy.id;
      map.set(`${p.habit_id}_${p.date}`, copy);
    }
  });
  local.forEach((p) => {
    if (!p.habit_id || !p.date) return;
    const key = `${p.habit_id}_${p.date}`;
    const existing = map.get(key);
    if (existing) {
      existing.completed = existing.completed || p.completed;
      existing.count = Math.max(existing.count || 0, p.count || 0);
    } else {
      const copy = { ...p };
      delete copy.id;
      map.set(key, copy);
    }
  });
  return Array.from(map.values());
}

function mergeQuranDailyReadingList(local: QuranDailyReading[], cloud: QuranDailyReading[]): QuranDailyReading[] {
  const map = new Map<string, QuranDailyReading>();
  cloud.forEach((p) => {
    if (p.surah_id && p.date) {
      const copy = { ...p };
      delete copy.id;
      map.set(`${p.surah_id}_${p.date}`, copy);
    }
  });
  local.forEach((p) => {
    if (!p.surah_id || !p.date) return;
    const key = `${p.surah_id}_${p.date}`;
    const existing = map.get(key);
    if (existing) {
      existing.pages_read = Math.max(existing.pages_read || 0, p.pages_read || 0);
    } else {
      const copy = { ...p };
      delete copy.id;
      map.set(key, copy);
    }
  });
  return Array.from(map.values());
}

function mergeQuranSurahStateList(local: QuranSurahState[], cloud: QuranSurahState[]): QuranSurahState[] {
  const map = new Map<number, QuranSurahState>();
  cloud.forEach((p) => {
    if (p.surah_id) {
      map.set(p.surah_id, { ...p });
    }
  });
  local.forEach((p) => {
    if (!p.surah_id) return;
    const existing = map.get(p.surah_id);
    if (existing) {
      existing.max_page_reached = Math.max(existing.max_page_reached || 0, p.max_page_reached || 0);
      existing.current_page = Math.max(existing.current_page || 0, p.current_page || 0);
      existing.percent_complete = Math.max(existing.percent_complete || 0, p.percent_complete || 0);
    } else {
      map.set(p.surah_id, { ...p });
    }
  });
  return Array.from(map.values());
}

function mergeDailyQuranSelectionList(local: DailyQuranSelection[], cloud: DailyQuranSelection[]): DailyQuranSelection[] {
  const map = new Map<string, DailyQuranSelection>();
  cloud.forEach((p) => {
    if (p.date) {
      const copy = { ...p };
      delete copy.id;
      map.set(p.date, copy);
    }
  });
  local.forEach((p) => {
    if (!p.date) return;
    const existing = map.get(p.date);
    if (existing) {
      const combinedSurahIds = Array.from(new Set([...(existing.surah_ids || []), ...(p.surah_ids || [])]));
      existing.surah_ids = combinedSurahIds;
    } else {
      const copy = { ...p };
      delete copy.id;
      map.set(p.date, copy);
    }
  });
  return Array.from(map.values());
}

function mergeGenericItems<T extends { id?: number; global_id?: string; name?: string }>(local: T[], cloud: T[]): T[] {
  const localByGlobalId = new Map<string, T>();
  const localByName = new Map<string, T>();

  local.forEach((item) => {
    if (item.global_id) localByGlobalId.set(item.global_id, item);
    if (item.name) localByName.set(item.name.trim().toLowerCase(), item);
  });

  const resultMap = new Map<string | number, T>();
  const newCloudItems: T[] = [];

  cloud.forEach((cloudItem) => {
    const matchedLocal =
      (cloudItem.global_id ? localByGlobalId.get(cloudItem.global_id) : null) ||
      (cloudItem.name ? localByName.get(cloudItem.name.trim().toLowerCase()) : null);

    if (matchedLocal) {
      const merged: T = {
        ...cloudItem,
        ...matchedLocal,
        id: matchedLocal.id,
        global_id: matchedLocal.global_id || cloudItem.global_id,
      };
      if (merged.id != null) resultMap.set(merged.id, merged);
      else if (merged.global_id) resultMap.set(merged.global_id, merged);
      else if (merged.name) resultMap.set(merged.name.trim().toLowerCase(), merged);
    } else {
      const copy = { ...cloudItem };
      delete copy.id;
      newCloudItems.push(copy);
    }
  });

  local.forEach((localItem) => {
    const isAlreadyInResult =
      (localItem.id != null && resultMap.has(localItem.id)) ||
      (localItem.global_id && Array.from(resultMap.values()).some((r) => r.global_id === localItem.global_id)) ||
      (localItem.name && Array.from(resultMap.values()).some((r) => r.name?.trim().toLowerCase() === localItem.name?.trim().toLowerCase()));

    if (!isAlreadyInResult) {
      const key = localItem.id ?? localItem.global_id ?? localItem.name;
      if (key != null) resultMap.set(key, { ...localItem });
    }
  });

  return [...Array.from(resultMap.values()), ...newCloudItems];
}

export async function pullCloudToLocal(userId: string): Promise<boolean> {
  if (!db || !userId) return false;

  try {
    // 1. Build list of candidate doc IDs to inspect
    const candidateIds: string[] = [userId];

    let userEmail = "";
    if (typeof window !== "undefined") {
      const savedSession = localStorage.getItem("app_account_session");
      if (savedSession) {
        try {
          const parsed = JSON.parse(savedSession);
          if (parsed?.email) userEmail = parsed.email;
        } catch (e) {}
      }
    }

    if (userEmail) {
      const accDocId = "acc_" + userEmail.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, "_");
      if (!candidateIds.includes(accDocId)) {
        candidateIds.push(accDocId);
      }
    }

    // 2. Fetch candidates and pick candidate document with richest data set
    let bestDocData: any = null;
    let maxRecordCount = -1;

    for (const candId of candidateIds) {
      // Check user_data/candId
      const snap1 = await getDoc(doc(dbFirestore, "user_data", candId)).catch(() => null);
      if (snap1 && snap1.exists()) {
        const d = snap1.data();
        if (d) {
          const count =
            (Array.isArray(d.prayerLogs) ? d.prayerLogs.length : 0) +
            (Array.isArray(d.thikrProgress) ? d.thikrProgress.length : 0) +
            (Array.isArray(d.customHabitProgress) ? d.customHabitProgress.length : 0) +
            (Array.isArray(d.quranDailyReading) ? d.quranDailyReading.length : 0) +
            (Array.isArray(d.customHabits) ? d.customHabits.length : 0) +
            (Array.isArray(d.thikrItems) ? d.thikrItems.length : 0);
          if (count > maxRecordCount) {
            maxRecordCount = count;
            bestDocData = d;
          }
        }
      }

      // Check users/candId/appData/main
      const snap2 = await getDoc(doc(dbFirestore, "users", candId, "appData", "main")).catch(() => null);
      if (snap2 && snap2.exists()) {
        const d = snap2.data();
        if (d) {
          const count =
            (Array.isArray(d.prayerLogs) ? d.prayerLogs.length : 0) +
            (Array.isArray(d.thikrProgress) ? d.thikrProgress.length : 0) +
            (Array.isArray(d.customHabitProgress) ? d.customHabitProgress.length : 0) +
            (Array.isArray(d.quranDailyReading) ? d.quranDailyReading.length : 0) +
            (Array.isArray(d.customHabits) ? d.customHabits.length : 0) +
            (Array.isArray(d.thikrItems) ? d.thikrItems.length : 0);
          if (count > maxRecordCount) {
            maxRecordCount = count;
            bestDocData = d;
          }
        }
      }
    }

    if (!bestDocData) {
      // First time user on cloud with zero existing remote documents
      // Only push if local database actually has records
      const localPrayerLogs = await db.prayer_logs.count();
      const localThikrProgress = await db.thikr_progress.count();
      const localHabitProgress = await db.custom_habit_progress.count();
      if (localPrayerLogs > 0 || localThikrProgress > 0 || localHabitProgress > 0) {
        await pushLocalToCloudDirect(userId);
      }
      return false;
    }

    let parsed = bestDocData;
    if (bestDocData.data && typeof bestDocData.data === "string") {
      try {
        parsed = JSON.parse(bestDocData.data);
      } catch (e) {}
    }

    // Read current local state from Dexie to perform smart union merge
    const localThikrItems = await db.thikr_items.toArray();
    const localThikrGroups = await db.thikr_groups.toArray();
    const localThikrProgress = await db.thikr_progress.toArray();
    const localCustomHabits = await db.custom_habits.toArray();
    const localCustomHabitProgress = await db.custom_habit_progress.toArray();
    const localQuranDailyReading = await db.quran_daily_reading.toArray();
    const localQuranSurahState = await db.quran_surah_state.toArray();
    const localDailyQuranSelection = await db.daily_quran_selection.toArray();
    const localPrayerLogs = await db.prayer_logs.toArray();

    const mergedPrayerLogs = mergePrayerLogsList(localPrayerLogs, Array.isArray(parsed.prayerLogs) ? parsed.prayerLogs : []);
    const mergedThikrProgress = mergeThikrProgressList(localThikrProgress, Array.isArray(parsed.thikrProgress) ? parsed.thikrProgress : []);
    const mergedCustomHabitProgress = mergeCustomHabitProgressList(localCustomHabitProgress, Array.isArray(parsed.customHabitProgress) ? parsed.customHabitProgress : []);
    const mergedQuranDailyReading = mergeQuranDailyReadingList(localQuranDailyReading, Array.isArray(parsed.quranDailyReading) ? parsed.quranDailyReading : []);
    const mergedQuranSurahState = mergeQuranSurahStateList(localQuranSurahState, Array.isArray(parsed.quranSurahState) ? parsed.quranSurahState : []);
    const mergedThikrItems = mergeGenericItems<ThikrItem>(localThikrItems, Array.isArray(parsed.thikrItems) ? parsed.thikrItems : []);
    const mergedThikrGroups = mergeGenericItems<ThikrGroup>(localThikrGroups, Array.isArray(parsed.thikrGroups) ? parsed.thikrGroups : []);
    const mergedCustomHabits = mergeGenericItems<CustomHabit>(localCustomHabits, Array.isArray(parsed.customHabits) ? parsed.customHabits : []);
    const mergedDailyQuranSelection = mergeDailyQuranSelectionList(localDailyQuranSelection, Array.isArray(parsed.dailyQuranSelection) ? parsed.dailyQuranSelection : []);

    // Safely write merged data into Dexie
    await db.transaction("rw", [
      db.thikr_items,
      db.thikr_groups,
      db.thikr_progress,
      db.custom_habits,
      db.custom_habit_progress,
      db.quran_daily_reading,
      db.quran_surah_state,
      db.daily_quran_selection,
      db.prayer_logs,
    ], async () => {
      await db.thikr_items.clear();
      await db.thikr_items.bulkAdd(mergedThikrItems);

      await db.thikr_groups.clear();
      await db.thikr_groups.bulkAdd(mergedThikrGroups);

      await db.thikr_progress.clear();
      await db.thikr_progress.bulkAdd(mergedThikrProgress);

      await db.custom_habits.clear();
      await db.custom_habits.bulkAdd(mergedCustomHabits);

      await db.custom_habit_progress.clear();
      await db.custom_habit_progress.bulkAdd(mergedCustomHabitProgress);

      await db.quran_daily_reading.clear();
      await db.quran_daily_reading.bulkAdd(mergedQuranDailyReading);

      await db.quran_surah_state.clear();
      await db.quran_surah_state.bulkAdd(mergedQuranSurahState);

      await db.daily_quran_selection.clear();
      await db.daily_quran_selection.bulkAdd(mergedDailyQuranSelection);

      await db.prayer_logs.clear();
      await db.prayer_logs.bulkAdd(mergedPrayerLogs);
    });

    // Push merged state back to cloud so cloud gets any local additions
    pushLocalToCloudDirect(userId).catch(() => {});

    return true;
  } catch (error: any) {
    console.error("Failed to pull cloud data to local:", error);
    return false;
  }
}

export function autoCloudSync(): void {
  if (typeof window === "undefined") return;
  if (Date.now() < quotaExceededCooldownUntil) return;
  const savedSession = localStorage.getItem("app_account_session");
  if (!savedSession) return;
  try {
    const parsed = JSON.parse(savedSession);
    if (parsed?.uid) {
      pushLocalToCloud(parsed.uid);
    }
  } catch (e) {}
}

// Global pagehide / visibilitychange listener to ensure immediate sync on tab close
if (typeof window !== "undefined") {
  const handlePageHide = () => {
    const savedSession = localStorage.getItem("app_account_session");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed?.uid) {
          pushLocalToCloudDirect(parsed.uid).catch(() => {});
        }
      } catch (e) {}
    }
  };
  window.addEventListener("pagehide", handlePageHide);
  window.addEventListener("beforeunload", handlePageHide);
}

