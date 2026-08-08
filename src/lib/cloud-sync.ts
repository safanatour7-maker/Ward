import { doc, getDoc, setDoc } from "firebase/firestore";
import { dbFirestore } from "./firebase";
import { db } from "./db";

export async function pushLocalToCloud(userId: string): Promise<boolean> {
  if (!db || !userId) return false;

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

    const dataPayload = {
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
    };

    const userDocRef = doc(dbFirestore, "users", userId, "appData", "main");
    await setDoc(userDocRef, {
      data: JSON.stringify(dataPayload),
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    // Also write directly to user_data collection for instant admin dashboard retrieval
    const userDataRef = doc(dbFirestore, "user_data", userId);
    await setDoc(userDataRef, dataPayload, { merge: true });

    // Check if session has email to sync to account doc ID as well
    const savedSession = typeof window !== "undefined" ? localStorage.getItem("app_account_session") : null;
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed?.email) {
          const cleanEmail = parsed.email.trim().toLowerCase();
          const accDocId = "acc_" + cleanEmail.replace(/[^a-zA-Z0-9]/g, "_");
          if (accDocId !== userId) {
            await setDoc(doc(dbFirestore, "user_data", accDocId), dataPayload, { merge: true }).catch(() => {});
            await setDoc(doc(dbFirestore, "users", accDocId, "appData", "main"), {
              data: JSON.stringify(dataPayload),
              updatedAt: new Date().toISOString(),
            }, { merge: true }).catch(() => {});
          }
        }
      } catch (e) {}
    }

    return true;
  } catch (error) {
    console.error("Failed to push local data to cloud:", error);
    return false;
  }
}

export async function pullCloudToLocal(userId: string): Promise<boolean> {
  if (!db || !userId) return false;

  try {
    const userDocRef = doc(dbFirestore, "users", userId, "appData", "main");
    const snapshot = await getDoc(userDocRef);

    if (!snapshot.exists()) {
      // First time user on cloud: upload existing local data to cloud
      await pushLocalToCloud(userId);
      return false;
    }

    const rawData = snapshot.data();
    if (!rawData || !rawData.data) return false;

    const parsed = JSON.parse(rawData.data);

    // Apply cloud data into local Dexie database
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
      if (Array.isArray(parsed.thikrItems)) {
        await db.thikr_items.clear();
        await db.thikr_items.bulkAdd(parsed.thikrItems);
      }
      if (Array.isArray(parsed.thikrGroups)) {
        await db.thikr_groups.clear();
        await db.thikr_groups.bulkAdd(parsed.thikrGroups);
      }
      if (Array.isArray(parsed.thikrProgress)) {
        await db.thikr_progress.clear();
        await db.thikr_progress.bulkAdd(parsed.thikrProgress);
      }
      if (Array.isArray(parsed.customHabits)) {
        await db.custom_habits.clear();
        await db.custom_habits.bulkAdd(parsed.customHabits);
      }
      if (Array.isArray(parsed.customHabitProgress)) {
        await db.custom_habit_progress.clear();
        await db.custom_habit_progress.bulkAdd(parsed.customHabitProgress);
      }
      if (Array.isArray(parsed.quranDailyReading)) {
        await db.quran_daily_reading.clear();
        await db.quran_daily_reading.bulkAdd(parsed.quranDailyReading);
      }
      if (Array.isArray(parsed.quranSurahState)) {
        await db.quran_surah_state.clear();
        await db.quran_surah_state.bulkAdd(parsed.quranSurahState);
      }
      if (Array.isArray(parsed.dailyQuranSelection)) {
        await db.daily_quran_selection.clear();
        await db.daily_quran_selection.bulkAdd(parsed.dailyQuranSelection);
      }
      if (Array.isArray(parsed.prayerLogs)) {
        await db.prayer_logs.clear();
        await db.prayer_logs.bulkAdd(parsed.prayerLogs);
      }
    });

    return true;
  } catch (error) {
    console.error("Failed to pull cloud data to local:", error);
    return false;
  }
}

export function autoCloudSync(): void {
  if (typeof window === "undefined") return;
  const savedSession = localStorage.getItem("app_account_session");
  if (!savedSession) return;
  try {
    const parsed = JSON.parse(savedSession);
    if (parsed?.uid) {
      pushLocalToCloud(parsed.uid);
    }
  } catch (e) {}
}
