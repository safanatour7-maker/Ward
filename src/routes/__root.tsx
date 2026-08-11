import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useNavigate,
  useLocation,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { reportLovableError } from "../lib/lovable-error-reporting";
import { TabBar } from "../components/TabBar";
import { startPeriodicNotificationsCheck, type NotificationItem } from "../lib/notifications";
import { NotificationCenter } from "../components/NotificationCenter";
import { Bell, X, Sparkles, BookOpen, Smile, Award } from "lucide-react";

function NotFoundComponent() {
  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">٤٠٤</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">الصفحة غير موجودة</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          يبدو أن هذه الصفحة غير متاحة.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            العودة للرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          حدث خطأ ما
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          حالع تحديث الصفحة أو العودة للرئيسية.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            إعادة المحاولة
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            الرئيسية
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);
  const [isCenterOpen, setIsCenterOpen] = useState(false);
  const [showQuotaBanner, setShowQuotaBanner] = useState(false);

  useEffect(() => {
    import("../lib/cloud-sync").then(({ isQuotaExceeded }) => {
      if (isQuotaExceeded()) {
        setShowQuotaBanner(true);
      }
    });
  }, []);

  // Automatically close Notification Center on any route changes (e.g. from service worker click)
  useEffect(() => {
    setIsCenterOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    // Seed the local DB with reference data on first load.
    import("../lib/db").then(({ ensureSeed }) => ensureSeed().catch(() => {}));

    // Sync global habits & athkar from Cloud Firestore to local DB
    import("../lib/habits").then(({ syncGlobalHabitsFromCloud }) => syncGlobalHabitsFromCloud().catch(() => {}));
    import("../lib/athkar").then(({ syncGlobalAthkarFromCloud }) => syncGlobalAthkarFromCloud().catch(() => {}));

    // Start periodic background checks for automatic triggers (9 AM, 12 PM, 10 AM)
    const stopPeriodic = startPeriodicNotificationsCheck();

    // Listen to new custom notifications to show our elegant in-app toast
    const handleNewNotification = (e: Event) => {
      const customEvent = e as CustomEvent<NotificationItem>;
      const item = customEvent.detail;
      setActiveToast(item);
      
      // Vibrate if browser supports it
      if (navigator.vibrate) {
        navigator.vibrate([80, 50, 80]);
      }
    };

    // Listen to explicit open requests from other screens
    const handleOpenCenter = () => {
      setIsCenterOpen(true);
    };

    window.addEventListener("new-in-app-notification", handleNewNotification);
    window.addEventListener("open-notification-center", handleOpenCenter);

    return () => {
      stopPeriodic();
      window.removeEventListener("new-in-app-notification", handleNewNotification);
      window.removeEventListener("open-notification-center", handleOpenCenter);
    };
  }, []);

  // Auto-dismiss toast after 7 seconds
  useEffect(() => {
    if (!activeToast) return;
    const t = setTimeout(() => {
      setActiveToast(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [activeToast]);

  return (
    <QueryClientProvider client={queryClient}>
      <div dir="rtl" className="app-shell relative">
        {/* Firestore Quota Exceeded Friendly Banner */}
        {showQuotaBanner && (
          <div className="bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2.5 text-xs font-bold flex items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="text-base">⚠️</span>
              <span>
                تنبيه المزامنة السحابية: تم الوصول للحد الأقصى اليومي المجاني (Firestore Quota Limit). التطبيق يحفظ بياناتك محلياً بضمان 100% وتجدد الحصّة تلقائياً.
              </span>
            </div>
            <button
              onClick={() => setShowQuotaBanner(false)}
              className="px-2 py-0.5 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 text-[10px] font-black cursor-pointer transition-colors"
            >
              إغلاق ✕
            </button>
          </div>
        )}

        {/* Elegant Top-Drop Toast Banner */}
        {activeToast && (
          <div className="fixed top-4 left-4 right-4 z-50 mx-auto max-w-md animate-in slide-in-from-top duration-300">
            <div 
              onClick={() => {
                const defaultPath = (activeToast.type === "quran" || activeToast.type === "quran_daily") ? "/quran" : activeToast.type === "athkar" ? "/athkar" : "/habits";
                const path = activeToast.url || defaultPath;
                navigate({ to: path });
                setActiveToast(null);
                setIsCenterOpen(false);
              }}
              className="overflow-hidden rounded-2xl border border-amber-100 bg-white/95 p-4 shadow-xl backdrop-blur-md flex gap-3 items-start cursor-pointer hover:bg-amber-50/5 hover:border-amber-200 transition-all duration-200"
              title="اضغط للانتقال إلى هذا القسم مباشرة"
            >
              {/* Colored Indicator Icon based on type */}
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
                (activeToast.type === "quran" || activeToast.type === "quran_daily")
                  ? "bg-[color:var(--quran)]/15 text-[color:var(--quran)]" 
                  : activeToast.type === "athkar" 
                  ? "bg-[color:var(--athkar)]/15 text-[color:var(--athkar)]" 
                  : "bg-[color:var(--habits)]/15 text-[color:var(--habits)]"
              }`}>
                {(activeToast.type === "quran" || activeToast.type === "quran_daily") ? (
                  <BookOpen className="h-4.5 w-4.5" />
                ) : activeToast.type === "athkar" ? (
                  <Smile className="h-4.5 w-4.5" />
                ) : (
                  <Award className="h-4.5 w-4.5" />
                )}
              </span>

              <div className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md flex items-center gap-0.5">
                    <Sparkles className="h-2.5 w-2.5" />
                    تنبيه جديد
                  </span>
                  <h4 className="text-xs font-black text-slate-800 truncate">{activeToast.title}</h4>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed font-medium">
                  {activeToast.body}
                </p>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const defaultPath = (activeToast.type === "quran" || activeToast.type === "quran_daily") ? "/quran" : activeToast.type === "athkar" ? "/athkar" : "/habits";
                      const path = activeToast.url || defaultPath;
                      navigate({ to: path });
                      setActiveToast(null);
                      setIsCenterOpen(false);
                    }}
                    className="px-3 py-1 rounded-lg bg-slate-900 text-white text-[10px] font-bold cursor-pointer active:scale-95 transition-all shadow-xs"
                  >
                    الذهاب للقسم 📖
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveToast(null);
                    }}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 text-[10px] font-bold cursor-pointer hover:bg-slate-50 active:scale-95 transition-all"
                  >
                    تجاهل
                  </button>
                </div>
              </div>

              {/* Dismiss button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveToast(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 active:scale-90 transition-all cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <Outlet />
      </div>
      
      <TabBar />

      {/* Global Notification settings Drawer */}
      <NotificationCenter open={isCenterOpen} onClose={() => setIsCenterOpen(false)} />
    </QueryClientProvider>
  );
}
