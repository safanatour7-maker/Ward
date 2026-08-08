import { useMemo, useState } from "react";
import { SURAHS } from "@/lib/quran-meta";
import { X, Search, Check } from "lucide-react";

/**
 * Full-screen picker for choosing (or replacing) one surah from the 114.
 * Used both when adding a new surah and when editing/replacing an existing pick.
 */
export function SurahPicker({
  open,
  title,
  excludeIds = [],
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  excludeIds?: number[];
  onClose: () => void;
  onPick: (surahId: number) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const query = q.trim();
    return SURAHS.filter((s) => {
      if (excludeIds.includes(s.id)) return false;
      if (!query) return true;
      return s.name.includes(query) || String(s.id).includes(query);
    });
  }, [q, excludeIds]);

  if (!open) return null;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <h3 className="text-lg font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-muted"
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="ابحث باسم السورة أو رقمها"
              className="w-full rounded-2xl border border-border bg-muted/40 px-4 py-2.5 pr-9 text-sm outline-none focus:border-[color:var(--quran)]"
            />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-4">
          {list.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => {
                  onPick(s.id);
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-2xl px-3 py-3 text-right transition hover:bg-[color:var(--quran)]/8"
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[color:var(--quran)]/15 text-xs font-bold text-[color:var(--quran)]">
                    {s.id}
                  </span>
                  <span className="font-semibold">{s.name}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.total_pages} صفحة
                </span>
              </button>
            </li>
          ))}
          {list.length === 0 && (
            <li className="p-6 text-center text-sm text-muted-foreground">
              <Check className="mx-auto mb-1 h-4 w-4 opacity-40" />
              لا نتائج
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
