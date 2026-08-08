import React, { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  Check,
  Trash2,
  Play,
  Settings,
  Sparkles,
  BookOpen,
  Heart,
  Smile,
  X,
  Smartphone,
  ShieldCheck,
  Info
} from "lucide-react";
import {
  getNotificationSettings,
  saveNotificationSettings,
  getNotificationLogs,
  clearNotificationLogs,
  requestBrowserNotificationPermission,
  testTriggerNotification,
  markAllNotificationsAsRead,
  type NotificationItem,
  type NotificationSettings
} from "@/lib/notifications";

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
}

function TimePicker({
  hour,
  minute,
  onChangeHour,
  onChangeMinute,
}: {
  hour: number;
  minute: number;
  onChangeHour: (h: number) => void;
  onChangeMinute: (m: number) => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 bg-slate-50 border border-slate-100/80 rounded-lg py-1 px-2 w-fit select-none">
      <span className="text-[10px] text-slate-500 font-extrabold px-0.5">تعديل الوقت:</span>
      <select
        value={hour}
        onChange={(e) => onChangeHour(Number(e.target.value))}
        className="text-[11px] bg-white border border-slate-200 rounded-md py-0.5 px-1 font-extrabold text-slate-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/50"
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <option key={i} value={i}>
            {String(i).padStart(2, "0")}
          </option>
        ))}
      </select>
      <span className="text-[10px] text-slate-450 font-bold">:</span>
      <select
        value={minute}
        onChange={(e) => onChangeMinute(Number(e.target.value))}
        className="text-[11px] bg-white border border-slate-200 rounded-md py-0.5 px-1 font-extrabold text-slate-800 cursor-pointer focus:outline-hidden focus:ring-1 focus:ring-amber-500/50"
      >
        {Array.from({ length: 60 }).map((_, i) => (
          <option key={i} value={i}>
            {String(i).padStart(2, "0")}
          </option>
        ))}
      </select>
    </div>
  );
}

export function NotificationCenter({ open, onClose }: NotificationCenterProps) {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<NotificationSettings>(getNotificationSettings());
  const [logs, setLogs] = useState<NotificationItem[]>(getNotificationLogs());
  const [hasPermission, setHasPermission] = useState(false);
  const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");
  const [hideNotice, setHideNotice] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("ward_hide_bg_notice") === "true";
    }
    return false;
  });

  const isIOS = typeof window !== "undefined" && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );

  const isStandalone = typeof window !== "undefined" && (
    window.matchMedia("(display-mode: standalone)").matches ||
    ((navigator as any).standalone === true)
  );

  // Load state and listen for custom notification updates
  useEffect(() => {
    if (!open) return;

    setSettings(getNotificationSettings());
    setLogs(getNotificationLogs());

    if ("Notification" in window) {
      setHasPermission(Notification.permission === "granted");
    }

    const handleUpdate = () => {
      setLogs(getNotificationLogs());
    };

    window.addEventListener("notifications-updated", handleUpdate);
    window.addEventListener("new-in-app-notification", handleUpdate);
    
    // Mark as read when opening logs
    if (activeTab === "logs") {
      markAllNotificationsAsRead();
    }

    return () => {
      window.removeEventListener("notifications-updated", handleUpdate);
      window.removeEventListener("new-in-app-notification", handleUpdate);
    };
  }, [open, activeTab]);

  if (!open) return null;

  const handleToggle = (key: keyof NotificationSettings) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    saveNotificationSettings(updated);
  };

  const handleTimeChange = (key: keyof NotificationSettings, value: number) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveNotificationSettings(updated);
  };

  const formatTimeText = (hour: number, minute: number) => {
    const period = hour >= 12 ? "مساءً" : "صباحاً";
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const displayMinute = String(minute).padStart(2, "0");
    return `${displayHour}:${displayMinute} ${period}`;
  };

  const handleEnableNative = async () => {
    const granted = await requestBrowserNotificationPermission();
    setHasPermission(granted);
    if (granted) {
      const updated = { ...settings, use_native: true };
      setSettings(updated);
      saveNotificationSettings(updated);
    }
  };

  const handleTestTrigger = async (type: NotificationItem["type"]) => {
    await testTriggerNotification(type);
    // Refresh log state
    setLogs(getNotificationLogs());
  };

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
  };

  const unreadCount = logs.filter((l) => !l.read).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 backdrop-blur-xs animate-in fade-in duration-200">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative flex h-[85vh] w-full max-w-lg flex-col rounded-t-[32px] bg-white p-6 shadow-2xl border border-slate-100 sm:h-[75vh] sm:rounded-3xl animate-in slide-in-from-bottom duration-300">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-amber-50 text-amber-600">
              <Bell className="h-5 w-5 animate-swing" />
            </span>
            <div>
              <h2 className="text-lg font-black text-slate-900">التنبيهات والتذكيرات</h2>
              <p className="text-xs text-muted-foreground mt-0.5">تابع أورادك بانتظام وهدوء نفس.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-50 p-2 text-slate-400 hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Tab Navigation */}
        <nav className="flex gap-2 mt-4 p-1 bg-slate-50 rounded-xl">
          <button
            onClick={() => setActiveTab("settings")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "settings"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            ضبط التذكيرات اليومية
          </button>
          <button
            onClick={() => {
              setActiveTab("logs");
              markAllNotificationsAsRead();
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all relative cursor-pointer ${
              activeTab === "logs"
                ? "bg-white text-slate-900 shadow-xs"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            تاريخ التذكيرات المستلمة
            {unreadCount > 0 && (
              <span className="absolute top-2 left-3 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            )}
          </button>
        </nav>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto py-4 mt-2 px-1 space-y-4 min-h-0">
          {activeTab === "settings" ? (
            <>
              {/* Native Browser Notifications Settings banner */}
              <section className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-indigo-50 border border-amber-100/60">
                <div className="flex gap-3">
                  <Smartphone className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-extrabold text-amber-900">إشعارات النظام بالجوال والكمبيوتر</h3>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                      لتلقي الإشعارات مباشرة على جهازك كرسائل خارجية (حتى عند إغلاق التطبيق)، قم بتفعيل إشعارات النظام.
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      {hasPermission ? (
                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          مفعّلة على هذا الجهاز ✓
                        </span>
                      ) : (
                        <button
                          onClick={handleEnableNative}
                          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-black shadow-xs transition-all cursor-pointer active:scale-95"
                        >
                          تفعيل إشعارات المتصفح
                        </button>
                      )}
                      
                      <button
                        onClick={() => handleToggle("use_native")}
                        disabled={!hasPermission}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md border disabled:opacity-50 transition-all ${
                          settings.use_native && hasPermission
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-500 border-slate-200"
                        }`}
                      >
                        {settings.use_native && hasPermission ? "تعطيل مؤقت" : "تشغيل الاستقبال"}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* Sandbox and Background constraint notification */}
              {!hideNotice && (
                <section className="relative p-3.5 rounded-2xl bg-amber-50/25 border border-amber-200/30 text-[11px] text-slate-700 leading-relaxed">
                  <div className="flex gap-2.5 items-start pl-6">
                    <span className="shrink-0 text-amber-600">💡</span>
                    <p className="font-semibold text-amber-900/90">
                      يرجى <strong className="text-amber-950 font-black underline decoration-amber-500/40">إبقاء التطبيق مشغلاً بالخلفية</strong> لتستمر الإشعارات والمنبهات الخارجية بالوصول بدقة في مواعيدها المحددة.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      localStorage.setItem("ward_hide_bg_notice", "true");
                      setHideNotice(true);
                    }}
                    className="absolute top-2.5 left-2.5 w-5 h-5 flex items-center justify-center rounded-full bg-amber-100/40 hover:bg-amber-200/60 text-amber-800 transition-colors cursor-pointer text-xs font-black"
                    title="إخفاء الملاحظة"
                  >
                    ×
                  </button>
                </section>
              )}

              {/* iOS specific setup guide */}
              {isIOS && (
                <section className="p-4 rounded-2xl bg-amber-50/40 border border-amber-200/40 space-y-3">
                  <div className="flex gap-2 items-start">
                    <span className="text-base shrink-0">📱</span>
                    <div>
                      <h4 className="text-xs font-black text-amber-900">ملاحظة لمستخدمي الآيفون (iPhone/iOS)</h4>
                      <p className="text-[10px] text-amber-800/80 mt-1 leading-relaxed">
                        نظام iOS يتطلب تثبيت التطبيق على الشاشة الرئيسية أولاً لتتمكن من استقبال إشعارات الهاتف الخارجية كرسائل نظام من خارج التطبيق.
                      </p>
                    </div>
                  </div>
                  
                  {!isStandalone ? (
                    <div className="bg-white/80 p-3.5 rounded-xl border border-amber-100/70 text-[10.5px] text-slate-700 space-y-2 leading-relaxed">
                      <p className="font-bold text-slate-800 text-[11px]">💡 لتلقي الإشعارات الخارجية وتفعيلها بنجاح:</p>
                      <ol className="list-decimal mr-4 space-y-1.5 text-slate-600 font-semibold">
                        <li>اضغط على زر <strong className="text-amber-900">المشاركة (Share 📤)</strong> في متصفح سفاري أو كروم على هاتف الآيفون.</li>
                        <li>اختر <strong className="text-amber-900">"إضافة للشاشة الرئيسية" (Add to Home Screen ➕)</strong> من القائمة.</li>
                        <li>افتح تطبيق <strong className="text-amber-950 font-black">«وَرْد»</strong> من أيقونته الجديدة على الشاشة الرئيسية، واذهب للإعدادات هنا لتفعيل الإشعارات بنجاح!</li>
                      </ol>
                    </div>
                  ) : (
                    <div className="bg-emerald-50/50 p-2.5 rounded-xl border border-emerald-100 text-[10px] text-emerald-800 font-bold leading-relaxed flex gap-2 items-center">
                      <span className="text-emerald-600 font-black">✓</span>
                      <p>رائع! أنت تستخدم التطبيق من الشاشة الرئيسية الآن. يمكنك الضغط على "تفعيل إشعارات المتصفح" بالأعلى لمنح إذن استقبال التنبيهات الخارجية بنجاح.</p>
                    </div>
                  )}
                </section>
              )}

              {/* Specific Reminders Toggles */}
              <section className="space-y-3">
                <h3 className="text-xs font-black text-slate-500 mr-1">تفعيل وإعداد الأوقات المحددة</h3>
                
                {/* 1. Quran @ 9 AM */}
                <div className="p-3.5 rounded-2xl border border-slate-100 bg-white shadow-3xs hover:border-slate-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--quran)]/10 text-[color:var(--quran)] shrink-0">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">تذكير الورد القرآني الأسبوعي</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {settings.quran_9am 
                            ? `يومياً الساعة ${formatTimeText(settings.quran_hour ?? 9, settings.quran_minute ?? 0)}`
                            : "معطّل"}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.quran_9am}
                        onChange={() => handleToggle("quran_9am")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-[-100%] after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--quran)]"></div>
                    </label>
                  </div>
                  {settings.quran_9am && (
                    <div className="mt-1 flex justify-start mr-12">
                      <TimePicker
                        hour={settings.quran_hour ?? 9}
                        minute={settings.quran_minute ?? 0}
                        onChangeHour={(h) => handleTimeChange("quran_hour", h)}
                        onChangeMinute={(m) => handleTimeChange("quran_minute", m)}
                      />
                    </div>
                  )}
                </div>

                {/* 1.5. Quran Daily Reminder */}
                <div className="p-3.5 rounded-2xl border border-slate-100 bg-white shadow-3xs hover:border-slate-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--quran)]/10 text-[color:var(--quran)] shrink-0">
                        <BookOpen className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">تذكير الورد القرآني اليومي</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {settings.quran_daily 
                            ? `يومياً الساعة ${formatTimeText(settings.quran_daily_hour ?? 17, settings.quran_daily_minute ?? 0)}`
                            : "معطّل"}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.quran_daily}
                        onChange={() => handleToggle("quran_daily")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-[-100%] after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--quran)]"></div>
                    </label>
                  </div>
                  {settings.quran_daily && (
                    <div className="mt-1 flex justify-start mr-12">
                      <TimePicker
                        hour={settings.quran_daily_hour ?? 17}
                        minute={settings.quran_daily_minute ?? 0}
                        onChangeHour={(h) => handleTimeChange("quran_daily_hour", h)}
                        onChangeMinute={(m) => handleTimeChange("quran_daily_minute", m)}
                      />
                    </div>
                  )}
                </div>

                {/* 2. Athkar @ 12 PM */}
                <div className="p-3.5 rounded-2xl border border-slate-100 bg-white shadow-3xs hover:border-slate-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--athkar)]/10 text-[color:var(--athkar)] shrink-0">
                        <Smile className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">تذكير ورد الأذكار اليومي</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {settings.athkar_12pm 
                            ? `يومياً الساعة ${formatTimeText(settings.athkar_hour ?? 12, settings.athkar_minute ?? 0)}`
                            : "معطّل"}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.athkar_12pm}
                        onChange={() => handleToggle("athkar_12pm")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-[-100%] after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--athkar)]"></div>
                    </label>
                  </div>
                  {settings.athkar_12pm && (
                    <div className="mt-1 flex justify-start mr-12">
                      <TimePicker
                        hour={settings.athkar_hour ?? 12}
                        minute={settings.athkar_minute ?? 0}
                        onChangeHour={(h) => handleTimeChange("athkar_hour", h)}
                        onChangeMinute={(m) => handleTimeChange("athkar_minute", m)}
                      />
                    </div>
                  )}
                </div>

                {/* 3. Habits Weekly Selection @ 10 AM */}
                <div className="p-3.5 rounded-2xl border border-slate-100 bg-white shadow-3xs hover:border-slate-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--habits)]/10 text-[color:var(--habits)] shrink-0">
                        <Heart className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">تذكير اختيار أفعال الأسبوع</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {settings.habits_weekly_10am 
                            ? `بداية الأسبوع الساعة ${formatTimeText(settings.habits_weekly_hour ?? 10, settings.habits_weekly_minute ?? 0)}`
                            : "معطّل"}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.habits_weekly_10am}
                        onChange={() => handleToggle("habits_weekly_10am")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-[-100%] after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[color:var(--habits)]"></div>
                    </label>
                  </div>
                  {settings.habits_weekly_10am && (
                    <div className="mt-1 flex justify-start mr-12">
                      <TimePicker
                        hour={settings.habits_weekly_hour ?? 10}
                        minute={settings.habits_weekly_minute ?? 0}
                        onChangeHour={(h) => handleTimeChange("habits_weekly_hour", h)}
                        onChangeMinute={(m) => handleTimeChange("habits_weekly_minute", m)}
                      />
                    </div>
                  )}
                </div>

                {/* 4. Habits Daily Logging @ 10 AM */}
                <div className="p-3.5 rounded-2xl border border-slate-100 bg-white shadow-3xs hover:border-slate-200 transition-all">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-purple-100 text-purple-600 shrink-0">
                        <Check className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">تذكير متابعة الأخلاق اليومي</h4>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {settings.habits_daily_10am 
                            ? `يومياً الساعة ${formatTimeText(settings.habits_daily_hour ?? 10, settings.habits_daily_minute ?? 0)}`
                            : "معطّل"}
                        </p>
                      </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={settings.habits_daily_10am}
                        onChange={() => handleToggle("habits_daily_10am")}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-[-100%] after:content-[''] after:absolute after:top-[2px] after:right-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                  </div>
                  {settings.habits_daily_10am && (
                    <div className="mt-1 flex justify-start mr-12">
                      <TimePicker
                        hour={settings.habits_daily_hour ?? 10}
                        minute={settings.habits_daily_minute ?? 0}
                        onChangeHour={(h) => handleTimeChange("habits_daily_hour", h)}
                        onChangeMinute={(m) => handleTimeChange("habits_daily_minute", m)}
                      />
                    </div>
                  )}
                </div>
              </section>

              {/* Simulation tester panel */}
              <section className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                <div className="flex items-center gap-1.5 text-xs font-black text-slate-850 mb-1.5">
                  <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
                  <span>اختبار فوري للتنبيهات (اضغط لمحاكاة التذكير)</span>
                </div>
                <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                  بإمكانك تجربة شكل ونص التنبيهات المخصصة والاطلاع عليها حالاً بالضغط على زر التشغيل:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleTestTrigger("quran")}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 hover:border-[color:var(--quran)]/40 hover:bg-[color:var(--quran)]/5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-slate-500 text-slate-500" />
                    الورد الأسبوعي 📖
                  </button>
                  <button
                    onClick={() => handleTestTrigger("quran_daily")}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 hover:border-[color:var(--quran)]/40 hover:bg-[color:var(--quran)]/5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-slate-500 text-slate-500" />
                    الورد اليومي ✨
                  </button>
                  <button
                    onClick={() => handleTestTrigger("athkar")}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 hover:border-[color:var(--athkar)]/40 hover:bg-[color:var(--athkar)]/5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-slate-500 text-slate-500" />
                    تنبيه الأذكار 🌸
                  </button>
                  <button
                    onClick={() => handleTestTrigger("habits_weekly")}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 hover:border-[color:var(--habits)]/40 hover:bg-[color:var(--habits)]/5 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-slate-500 text-slate-500" />
                    خطة الأسبوع 🌿
                  </button>
                  <button
                    onClick={() => handleTestTrigger("habits_daily")}
                    className="col-span-2 flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2 px-3 text-xs font-bold text-slate-700 hover:border-purple-200 hover:bg-purple-50 active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="h-3 w-3 fill-slate-500 text-slate-500" />
                    تتبع الأخلاق ✨
                  </button>
                </div>
              </section>
            </>
          ) : (
            /* Logs View */
            <div className="space-y-3 h-full flex flex-col">
              <div className="flex justify-between items-center mr-1">
                <span className="text-xs font-black text-slate-500">التنبيهات السابقة ({logs.length})</span>
                {logs.length > 0 && (
                  <button
                    onClick={() => {
                      clearNotificationLogs();
                      setLogs([]);
                    }}
                    className="text-xs font-extrabold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer bg-rose-50 px-2 py-1 rounded-lg"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    مسح السجل كاملاً
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <BellOff className="h-10 w-10 text-slate-300 mb-2" />
                  <p className="text-xs text-slate-500 font-bold">لم تستلم أي تنبيهات بعد</p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-[240px]">
                    بإمكانك تفعيلها وتجربتها من تبويب "ضبط التذكيرات اليومية" لتظهر هنا وتتلقاها بانتظام.
                  </p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[420px] pr-0.5">
                  {logs.map((log) => {
                    const typeColor =
                      (log.type === "quran" || log.type === "quran_daily")
                        ? "bg-[color:var(--quran)]/10 text-[color:var(--quran)] border-[color:var(--quran)]/20"
                        : log.type === "athkar"
                        ? "bg-[color:var(--athkar)]/10 text-[color:var(--athkar)] border-[color:var(--athkar)]/20"
                        : (log.type === "habits_weekly" || log.type === "habits_daily")
                        ? "bg-[color:var(--habits)]/10 text-[color:var(--habits)] border-[color:var(--habits)]/20"
                        : "bg-purple-50 text-purple-600 border-purple-100";

                    return (
                      <div
                        key={log.id}
                        onClick={() => {
                          onClose();
                          const defaultPath = (log.type === "quran" || log.type === "quran_daily") ? "/quran" : log.type === "athkar" ? "/athkar" : "/habits";
                          const path = log.url || defaultPath;
                          navigate({ to: path });
                        }}
                        className={`p-3.5 rounded-2xl border bg-white shadow-3xs flex gap-3 items-start transition-all cursor-pointer hover:border-slate-300 hover:bg-slate-50/40 active:scale-98 ${
                          log.read ? "opacity-90" : "border-amber-200 bg-amber-50/10"
                        }`}
                        title="اضغط للانتقال للقسم مباشرة"
                      >
                        <span className={`grid h-8 w-8 place-items-center rounded-lg text-sm shrink-0 font-bold border ${typeColor}`}>
                          {(log.type === "quran" || log.type === "quran_daily") ? "ق" : log.type === "athkar" ? "ذ" : "خ"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-baseline gap-2">
                            <h4 className="text-xs font-black text-slate-800 truncate">{log.title}</h4>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0 tabular-nums">
                              {formatTime(log.timestamp)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">
                            {log.body}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Footer info label */}
        <footer className="border-t border-slate-100 pt-3 text-center flex items-center justify-center gap-1 text-[10px] text-slate-400">
          <Info className="h-3 w-3 shrink-0" />
          <span>التنبيهات تعمل تلقائياً بالخلفية لترتيب جدولك الروحي برفق ويسر.</span>
        </footer>
      </div>
    </div>
  );
}
