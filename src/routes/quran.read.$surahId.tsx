import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState, useRef } from "react";
import { db } from "@/lib/db";
import { groupByPage, loadSurahText, surahName, totalPagesFor } from "@/lib/quran-text";
import { recordPageReached } from "@/lib/quran-progress";
import { ChevronRight, ChevronLeft, ArrowRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { z } from "zod";
import { isoDate } from "@/lib/date-utils";

const readerSearchSchema = z.object({
  date: z.string().optional(),
});

export const Route = createFileRoute("/quran/read/$surahId")({
  validateSearch: readerSearchSchema,
  head: ({ params }) => {
    const name = surahName(Number(params.surahId));
    return {
      meta: [
        { title: `${name} — وَرْد` },
        { name: "description", content: `قراءة سورة ${name} ضمن الورد الأسبوعي.` },
      ],
    };
  },
  component: Reader,
});

const pageVariants = {
  enter: {
    opacity: 0,
  },
  center: {
    opacity: 1,
  },
  exit: {
    opacity: 0,
  },
};

function Reader() {
  const { surahId: surahIdParam } = Route.useParams();
  const surahId = Number(surahIdParam);
  const { date } = Route.useSearch();
  const targetDate = date || isoDate();
  const navigate = useNavigate();

  const articleRef = useRef<HTMLElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load & cache surah text
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadSurahText(surahId)
      .then(() => {
        if (!cancelled) setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.message ?? "خطأ في التحميل");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [surahId]);

  const text = useLiveQuery(() => db.surah_text.get(surahId), [surahId]);
  const state = useLiveQuery(() => db.quran_surah_state.get(surahId), [surahId]);

  const pages = useMemo(() => (text ? groupByPage(text) : []), [text]);
  const total = totalPagesFor(surahId);

  // Which page is currently displayed. Start at last read (or 1).
  const [current, setCurrent] = useState(1);
  const [lastInitializedSurahId, setLastInitializedSurahId] = useState<number | null>(null);
  const [direction, setDirection] = useState<"forward" | "backward" | null>(null);

  // Track the last page index that was saved during this session
  const lastSavedPageRef = useRef<number | null>(null);

  // Initialize page number once per Surah when pages load
  useEffect(() => {
    if (pages.length === 0) return;

    if (lastInitializedSurahId !== surahId) {
      // Check daily reading record for targetDate to see if user has progress today
      db.quran_daily_reading
        .where("[surah_id+date]")
        .equals([surahId, targetDate])
        .first()
        .then((todayRecord) => {
          let start = 1;
          if (todayRecord && todayRecord.pages_read > 0) {
            // If already read some pages today, resume at next page (or page 1 if already complete)
            if (todayRecord.pages_read >= pages.length) {
              start = 1;
            } else {
              start = Math.min(todayRecord.pages_read + 1, pages.length);
            }
          } else {
            // Fresh reading for this date -> ALWAYS start at page 1
            start = 1;
          }
          setCurrent(start);
          lastSavedPageRef.current = start;
          setLastInitializedSurahId(surahId);
        })
        .catch((e) => {
          console.error("Error initializing reader page:", e);
          setCurrent(1);
          lastSavedPageRef.current = 1;
          setLastInitializedSurahId(surahId);
        });
    }
  }, [surahId, pages.length, targetDate, lastInitializedSurahId]);

  // Scroll to top when page changes so user starts reading from the top of the next page
  useEffect(() => {
    if (articleRef.current) {
      articleRef.current.scrollTop = 0;
    }
  }, [current]);

  // Save progress whenever the user reaches a new page.
  useEffect(() => {
    if (pages.length === 0 || lastInitializedSurahId !== surahId || lastSavedPageRef.current === null) return;
    
    if (current > lastSavedPageRef.current) {
      const diff = current - lastSavedPageRef.current;
      lastSavedPageRef.current = current;
      recordPageReached(surahId, current, targetDate, diff).catch((e) => {
        console.error("Error recording reading progress:", e);
      });
    } else if (current < lastSavedPageRef.current) {
      lastSavedPageRef.current = current;
      recordPageReached(surahId, current, targetDate, 0).catch(() => {});
    }
  }, [current, surahId, pages.length, lastInitializedSurahId, targetDate]);

  async function markAsFullyRead() {
    if (pages.length === 0 || lastSavedPageRef.current === null) return;
    try {
      const diff = Math.max(0, pages.length - lastSavedPageRef.current);
      lastSavedPageRef.current = pages.length;
      await recordPageReached(surahId, pages.length, targetDate, diff);
      setCurrent(pages.length);
    } catch (e) {
      console.error(e);
    }
  }

  // Swipe Gesture Handlers for easy page flipping (Next page: swipe left, Previous page: swipe right)
  const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
  const [touchEnd, setTouchEnd] = useState<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.targetTouches.length === 0) return;
    setTouchStart({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
    setTouchEnd(null);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.targetTouches.length === 0) return;
    setTouchEnd({
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;

    // Use changedTouches if available for precise touch release tracking
    const endX = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientX : touchEnd?.x;
    const endY = e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].clientY : touchEnd?.y;

    if (endX === undefined || endY === undefined) return;

    const xDiff = touchStart.x - endX;
    const yDiff = touchStart.y - endY;

    // Easy & ultra-responsive threshold of 40px, requiring strict horizontal priority
    if (Math.abs(xDiff) > 40 && Math.abs(xDiff) > Math.abs(yDiff) * 2) {
      if (xDiff > 0) {
        // Swipe Left (finger right to left) -> Previous page (goes backward in the book)
        if (current > 1) {
          setDirection("backward");
          setCurrent((c) => c - 1);
        }
      } else {
        // Swipe Right (finger left to right) -> Next page (goes forward in the book)
        if (current < pages.length) {
          setDirection("forward");
          setCurrent((c) => c + 1);
        }
      }
    }
    setTouchStart(null);
    setTouchEnd(null);
  };

  const currentPage = pages[current - 1];
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div
      dir="rtl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="fixed inset-0 flex flex-col bg-slate-50 p-4 pb-[calc(1.2rem+env(safe-area-inset-bottom))] sm:p-4 overflow-hidden z-50 select-none"
    >
      <header className="flex-none flex items-center gap-2 mb-2">
        <button
          onClick={() => navigate({ to: "/quran", search: { date: targetDate } as any })}
          className="grid h-10 w-10 place-items-center rounded-2xl bg-white shadow-sm hover:bg-muted active:scale-95 transition-all cursor-pointer"
          aria-label="رجوع"
        >
          <ArrowRight className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold leading-tight text-foreground">{surahName(surahId)}</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            صفحة {current} من {pages.length || total} · {pct}٪ مكتمل
          </p>
        </div>
      </header>

      <div className="flex-none h-1.5 overflow-hidden rounded-full bg-white/60 mb-3">
        <div
          className="h-full bg-[color:var(--quran)] transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Styled Quran Page as a Real Mus'haf Page with sliding page transitions */}
      <article
        ref={articleRef}
        className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto relative rounded-3xl border-2 border-amber-200/80 bg-[#fefdfa] p-4 shadow-md transition-all sm:p-6 mb-3 select-none"
      >
        {/* Decorative inner page borders */}
        <div className="absolute inset-2 rounded-[1.3rem] border border-amber-200/40 pointer-events-none" />
        <div className="absolute inset-3 rounded-[1.1rem] border border-amber-100/30 pointer-events-none" />

        {loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-[color:var(--quran)]" />
            <span className="text-xs font-semibold">جارٍ تحميل نص السورة الكريمة…</span>
          </div>
        )}
        {error && (
          <div className="py-12 text-center text-sm text-destructive">
            تعذّر تحميل النص: {error}
            <br />
            تأكد من اتصال الإنترنت لأول مرة فقط، ثم يعمل بدون اتصال.
          </div>
        )}
        {!loading && !error && currentPage && (
          <AnimatePresence mode="wait">
            <motion.div
              key={current}
              variants={pageVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: 0.12,
              }}
              onAnimationComplete={() => {
                if (articleRef.current) {
                  articleRef.current.scrollTop = 0;
                }
              }}
              className="relative z-10 py-1"
            >
              {surahId !== 1 && surahId !== 9 && current === 1 && (
                <p className="mb-4 text-center font-serif text-xl sm:text-2xl font-bold tracking-wide text-amber-950/90 leading-relaxed select-none">
                  بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
                </p>
              )}
              <p className="quran-text font-serif text-lg sm:text-2xl leading-[2.3] sm:leading-[2.8] text-amber-950 text-justify text-center">
                {currentPage.ayahs.map((a) => (
                  <span key={a.number_in_surah} className="inline">
                    {a.text}
                    <span className="ayah-mark inline-flex items-center justify-center select-none font-sans font-bold text-amber-800 bg-amber-50 border border-amber-200/60 mx-1.5 rounded-full w-6 h-6 text-[9px] align-middle shadow-xs">
                      {toArabicDigits(a.number_in_surah)}
                    </span>{" "}
                  </span>
                ))}
              </p>
              <div className="mt-6 text-center text-[10px] font-semibold text-amber-800/80 select-none">
                الصفحة {toArabicDigits(currentPage.page)} من المصحف الشريف
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </article>

      {/* Footer controls - compact and locked at the bottom */}
      <div className="flex-none flex flex-col gap-2">
        {/* Pager */}
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => {
              setDirection("backward");
              setCurrent((c) => Math.max(1, c - 1));
            }}
            disabled={current <= 1}
            className="flex flex-1 items-center justify-center gap-1 rounded-2xl border border-border bg-white py-2.5 text-xs font-semibold disabled:opacity-40 cursor-pointer active:scale-98 transition-transform"
          >
            <ChevronRight className="h-4 w-4" />
            السابقة
          </button>
          <button
            onClick={() => {
              setDirection("forward");
              setCurrent((c) => Math.min(pages.length, c + 1));
            }}
            disabled={current >= pages.length}
            className="flex flex-1 items-center justify-center gap-1 rounded-2xl bg-[color:var(--quran)] py-2.5 text-xs font-bold text-white shadow-sm disabled:opacity-40 cursor-pointer active:scale-98 transition-transform"
          >
            {current >= pages.length ? "اكتملت السورة ✓" : "التالية"}
            {current < pages.length && <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        {pct < 100 && (
          <div className="px-3 py-1.5 rounded-2xl bg-amber-50/50 border border-amber-100/60 flex items-center justify-between gap-2 text-right">
            <p className="text-[10px] text-muted-foreground">هل تقرأ من مصحف آخر؟</p>
            <button
              onClick={markAsFullyRead}
              className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold bg-[color:var(--quran)] text-white rounded-xl shadow-sm hover:opacity-95 cursor-pointer"
            >
              ✓ حدّد كمكتملة
            </button>
          </div>
        )}

        <div className="text-center flex flex-col gap-1">
          <p className="text-[10px] text-amber-800/60 font-black">
            💡 يمكنك سحب الصفحة يميناً (للتالية) أو يساراً (للسابقة) للتنقل السريع بالإصبع
          </p>
          <Link to="/quran" className="text-xs text-muted-foreground underline">
            العودة لقائمة السور
          </Link>
        </div>
      </div>
    </div>
  );
}

function toArabicDigits(n: number): string {
  const map = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return String(n)
    .split("")
    .map((d) => map[Number(d)] ?? d)
    .join("");
}
