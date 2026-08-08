import { db } from "./db";
import { getCurrentWeekSelection } from "./quran-progress";
import { surahName } from "./quran-text";

export interface NotificationItem {
  id: string;
  type: "quran" | "quran_daily" | "athkar" | "habits_weekly" | "habits_daily";
  title: string;
  body: string;
  timestamp: number;
  read: boolean;
  url?: string;
}

export interface NotificationSettings {
  quran_9am: boolean;
  quran_daily: boolean;
  athkar_12pm: boolean;
  habits_weekly_10am: boolean;
  habits_daily_10am: boolean;
  use_native: boolean;
  
  // Custom configuration times
  quran_hour?: number;
  quran_minute?: number;
  quran_daily_hour?: number;
  quran_daily_minute?: number;
  athkar_hour?: number;
  athkar_minute?: number;
  habits_weekly_hour?: number;
  habits_weekly_minute?: number;
  habits_daily_hour?: number;
  habits_daily_minute?: number;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  quran_9am: true,
  quran_daily: true,
  athkar_12pm: true,
  habits_weekly_10am: true,
  habits_daily_10am: true,
  use_native: false,
  
  quran_hour: 9,
  quran_minute: 0,
  quran_daily_hour: 17, // 5:00 PM
  quran_daily_minute: 0,
  athkar_hour: 12,
  athkar_minute: 0,
  habits_weekly_hour: 10,
  habits_weekly_minute: 0,
  habits_daily_hour: 10,
  habits_daily_minute: 0,
};

/** Get current notification settings from local storage */
export function getNotificationSettings(): NotificationSettings {
  const isGranted = typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
  const defaults = { ...DEFAULT_SETTINGS, use_native: isGranted };
  try {
    const saved = localStorage.getItem("ward_notification_settings");
    if (saved) {
      return { ...defaults, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error("Failed to parse notification settings", e);
  }
  return defaults;
}

/** Update notification settings in local storage */
export function saveNotificationSettings(settings: NotificationSettings) {
  localStorage.setItem("ward_notification_settings", JSON.stringify(settings));
}

/** Get notification history logs from local storage */
export function getNotificationLogs(): NotificationItem[] {
  try {
    const saved = localStorage.getItem("ward_notification_logs");
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Failed to parse notification logs", e);
  }
  return [];
}

/** Save notification history logs to local storage */
export function saveNotificationLogs(logs: NotificationItem[]) {
  localStorage.setItem("ward_notification_logs", JSON.stringify(logs));
}

/** Add a new notification to the history log */
export function addNotificationLog(
  type: NotificationItem["type"],
  title: string,
  body: string,
  url?: string
): NotificationItem {
  const logs = getNotificationLogs();
  const newItem: NotificationItem = {
    id: Math.random().toString(36).substring(2, 11),
    type,
    title,
    body,
    timestamp: Date.now(),
    read: false,
    url,
  };
  logs.unshift(newItem);
  // Limit to last 50 logs
  saveNotificationLogs(logs.slice(0, 50));
  
  // Dispatch a custom event to notify any mounted layout to show an in-app Toast
  const event = new CustomEvent("new-in-app-notification", { detail: newItem });
  window.dispatchEvent(event);

  return newItem;
}

/** Mark all notifications as read */
export function markAllNotificationsAsRead() {
  const logs = getNotificationLogs();
  const updated = logs.map((log) => ({ ...log, read: true }));
  saveNotificationLogs(updated);
  window.dispatchEvent(new CustomEvent("notifications-updated"));
}

/** Clear all notification history */
export function clearNotificationLogs() {
  saveNotificationLogs([]);
  window.dispatchEvent(new CustomEvent("notifications-updated"));
}

/** Request native browser notification permissions */
export async function requestBrowserNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (e) {
    console.error("Error requesting notification permission", e);
    return false;
  }
}

/** Fire a browser/native notification if permitted, or fallback to in-app toast */
export function fireNotification(
  type: NotificationItem["type"],
  title: string,
  body: string,
  url?: string
) {
  const settings = getNotificationSettings();
  
  // 1. Add to in-app history log & dispatch toast event
  addNotificationLog(type, title, body, url);

  // 2. Try native if permitted (either enabled or granted in browser)
  const isPermitted = "Notification" in window && Notification.permission === "granted";
  if (isPermitted) {
    // Try sending via Service Worker first (essential for iOS Safari background/Home Screen & native system banner support)
    if ("serviceWorker" in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(title, {
          body,
          icon: "/favicon.ico",
          badge: "/favicon.ico",
          dir: "rtl",
          data: { type, url },
          vibrate: [100, 50, 100],
        } as any);
      }).catch((e) => {
        console.warn("Service worker ready failed, falling back to legacy Notification API:", e);
        // Fallback to legacy Notification constructor
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          dir: "rtl",
        });
      });
    } else {
      // Fallback to legacy Notification constructor
      try {
        new Notification(title, {
          body,
          icon: "/favicon.ico",
          dir: "rtl",
        });
        if (navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      } catch (e) {
        console.warn("Could not fire native notification inside iframe:", e);
      }
    }
  }
}

/** Simulate / Generate live notification content based on actual database states */
export async function generateNotificationContent(
  type: NotificationItem["type"]
): Promise<{ title: string; body: string; url?: string }> {
  switch (type) {
    case "quran": {
      const qSelection = await getCurrentWeekSelection().catch(() => ({ surah_ids: [] }));
      const hasSurahs = qSelection && qSelection.surah_ids && qSelection.surah_ids.length > 0;
      
      if (hasSurahs) {
        const surahIds = qSelection.surah_ids;
        const states = await db.quran_surah_state.toArray().catch(() => []);
        const stateMap = new Map(states.map(s => [s.surah_id, s]));
        
        let incompleteSurahId: number | null = null;
        let incompletePct = 0;
        let completedCount = 0;

        for (const sid of surahIds) {
          const st = stateMap.get(sid);
          const pct = st?.percent_complete ?? 0;
          if (pct < 100) {
            if (incompleteSurahId === null) {
              incompleteSurahId = sid;
              incompletePct = pct;
            }
          } else {
            completedCount++;
          }
        }

        if (completedCount === surahIds.length) {
          return {
            title: "🎉 مبارك إتمام الورد!",
            body: `ما شاء الله! أتممت الورد القرآني لهذا الأسبوع بنسبة 100% ✨ بارك الله فيك ونوّر قلبك 🌟`,
            url: "/quran",
          };
        }

        if (incompleteSurahId !== null) {
          const sName = surahName(incompleteSurahId) || "الورد الأسبوعي";
          if (incompletePct > 0) {
            return {
              title: "📖 تابع تلاوتك",
              body: `لقد أنجزت ${incompletePct}% من سورة ${sName}. تابع القراءة الآن وسجل تقدمك اليوم 🌸`,
              url: `/quran/read/${incompleteSurahId}`,
            };
          } else {
            return {
              title: "📖 وردك بانتظارك",
              body: `سورة ${sName} بانتظارك ضمن وردك الأسبوعي. ابدأ القراءة الآن وعطّر قلبك بالآيات 🌸`,
              url: `/quran/read/${incompleteSurahId}`,
            };
          }
        }

        const firstSurahId = surahIds[0];
        const sName = surahName(firstSurahId) || "الورد الأسبوعي";
        return {
          title: "📖 ورد القرآن الكريم",
          body: `حان وقت تلاوة وردك اليومي. واصل تلاوة سورة ${sName} لتنعم بالسكينة والبركة ✨`,
          url: `/quran/read/${firstSurahId}`,
        };
      } else {
        return {
          title: "📖 اختيار الورد الأسبوعي",
          body: "لم تختر سور ورد هذا الأسبوع بعد. تفضل باختيارها الآن لتبدأ التلاوة 🌸",
          url: "/quran",
        };
      }
    }

    case "quran_daily": {
      return {
        title: "✨ الورد القرآني اليومي",
        body: "تذكير بقراءة وردك اليومي لتنال الأجر والبركة وتطمئن روحك بذكر الله 🌸",
        url: "/quran",
      };
    }

    case "athkar": {
      return {
        title: "🌸 ورد الأذكار اليومي",
        body: "حان وقت الأذكار اليومية لتكون حصناً لقلبك وعقلك ونوراً ليومك السعيد ✨",
        url: "/athkar",
      };
    }

    case "habits_weekly": {
      return {
        title: "🌿 مراقبة السلوك والأخلاق",
        body: "أسبوع جديد مبارك 🌟 حدد الأخلاق والسلوكيات التي ستراقبها وتنميها في نفسك 🌿",
        url: "/habits",
      };
    }

    case "habits_daily": {
      const activeHabits = await db.custom_habits.where("status").equals("active").toArray().catch(() => []);
      if (activeHabits.length > 0) {
        const firstHabit = activeHabits[0].name;
        return {
          title: "✨ مراجعة خُلق اليوم",
          body: `تذكير بخُلق «${firstHabit}». سجل مراجعتك وسلوكك اليومي لتتابع تقدمك 🌿`,
          url: "/habits",
        };
      } else {
        return {
          title: "✨ مراجعة خُلق اليوم",
          body: "حان وقت مراجعة التزاماتك الأخلاقية لليوم لتنعم بنقاء القلب والسكينة والرضا ✨",
          url: "/habits",
        };
      }
    }
  }
}

/** Helper to test/simulate a specific notification instantly */
export async function testTriggerNotification(type: NotificationItem["type"]) {
  const content = await generateNotificationContent(type);
  fireNotification(type, content.title, content.body, content.url);
}

/** Set up a background checks system that checks periodic times for automatic trigger */
export function startPeriodicNotificationsCheck() {
  const checkedKey = "ward_last_notification_checks";
  
  const checkAllNotifications = async () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const dayOfWeek = now.getDay(); // 0: Sunday, 1: Monday, etc.
    
    // Timezone-safe local date string format: YYYY-MM-DD in user's local timezone
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const settings = getNotificationSettings();
    let checksHistory: Record<string, string[]> = {};
    try {
      const saved = localStorage.getItem(checkedKey);
      if (saved) checksHistory = JSON.parse(saved);
    } catch {}

    if (!checksHistory[todayStr]) {
      checksHistory[todayStr] = [];
    }

    const firedToday = checksHistory[todayStr];

    const quranHour = settings.quran_hour ?? 9;
    const quranMinute = settings.quran_minute ?? 0;
    const quranDailyHour = settings.quran_daily_hour ?? 17;
    const quranDailyMinute = settings.quran_daily_minute ?? 0;
    const athkarHour = settings.athkar_hour ?? 12;
    const athkarMinute = settings.athkar_minute ?? 0;
    const habitsWeeklyHour = settings.habits_weekly_hour ?? 10;
    const habitsWeeklyMinute = settings.habits_weekly_minute ?? 0;
    const habitsDailyHour = settings.habits_daily_hour ?? 10;
    const habitsDailyMinute = settings.habits_daily_minute ?? 0;

    const currentMinutesSinceMidnight = hours * 60 + minutes;

    // Helper to see if we should fire (within 120 minutes of the target, and not yet fired today)
    const shouldFire = (targetHour: number, targetMinute: number, key: string) => {
      const targetMinutes = targetHour * 60 + targetMinute;
      const diff = currentMinutesSinceMidnight - targetMinutes;
      const uniqueFireKey = `${key}_${targetHour}_${targetMinute}`;
      // Triggers if we are currently at or past the scheduled time, but within a 2-hour window, and hasn't fired yet
      return diff >= 0 && diff <= 120 && !firedToday.includes(uniqueFireKey);
    };

    let changed = false;

    // 1. Quran Weekly selection/state Reminder
    if (settings.quran_9am && shouldFire(quranHour, quranMinute, "quran")) {
      firedToday.push(`quran_${quranHour}_${quranMinute}`);
      changed = true;
      const content = await generateNotificationContent("quran");
      fireNotification("quran", content.title, content.body, content.url);
    }

    // 1.5 Quran Daily Reminder
    if (settings.quran_daily && shouldFire(quranDailyHour, quranDailyMinute, "quran_daily")) {
      firedToday.push(`quran_daily_${quranDailyHour}_${quranDailyMinute}`);
      changed = true;
      const content = await generateNotificationContent("quran_daily");
      fireNotification("quran_daily", content.title, content.body, content.url);
    }

    // 2. Athkar Reminder
    if (settings.athkar_12pm && shouldFire(athkarHour, athkarMinute, "athkar")) {
      firedToday.push(`athkar_${athkarHour}_${athkarMinute}`);
      changed = true;
      const content = await generateNotificationContent("athkar");
      fireNotification("athkar", content.title, content.body, content.url);
    }

    // 3. Habits Weekly Reminder (on Saturday or Sunday)
    const isStartOfWeek = dayOfWeek === 6 || dayOfWeek === 0; // Saturday or Sunday in local context
    if (
      settings.habits_weekly_10am &&
      isStartOfWeek &&
      shouldFire(habitsWeeklyHour, habitsWeeklyMinute, "habits_weekly")
    ) {
      firedToday.push(`habits_weekly_${habitsWeeklyHour}_${habitsWeeklyMinute}`);
      changed = true;
      const content = await generateNotificationContent("habits_weekly");
      fireNotification("habits_weekly", content.title, content.body, content.url);
    }

    // 4. Habits Daily Reminder
    if (
      settings.habits_daily_10am &&
      shouldFire(habitsDailyHour, habitsDailyMinute, "habits_daily")
    ) {
      firedToday.push(`habits_daily_${habitsDailyHour}_${habitsDailyMinute}`);
      changed = true;
      const content = await generateNotificationContent("habits_daily");
      fireNotification("habits_daily", content.title, content.body, content.url);
    }

    if (changed) {
      localStorage.setItem(checkedKey, JSON.stringify(checksHistory));
    }
  };

  // Run the check immediately on component mounting so user doesn't wait 60 seconds
  checkAllNotifications();

  // Then check every 30 seconds for maximum reliability
  const intervalId = setInterval(checkAllNotifications, 30000);

  return () => clearInterval(intervalId);
}
