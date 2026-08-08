import { Link } from "@tanstack/react-router";
import { BookOpen, CircleDot, Clock, Award, Home } from "lucide-react";

/**
 * Bottom navigation.
 * Visual order right → left (RTL): القرآن، الأذكار، الصلاة على وقتها، الأخلاق، الرئيسية.
 */
const TABS = [
  { to: "/", label: "الرئيسية", Icon: Home, tint: "home" },
  { to: "/quran", label: "الورد القرآني", Icon: BookOpen, tint: "quran" },
  { to: "/athkar", label: "ورد الأذكار", Icon: CircleDot, tint: "athkar" },
  { to: "/prayers", label: "الصلاة على وقتها", Icon: Clock, tint: "prayers" },
  { to: "/habits", label: "الأخلاق", Icon: Award, tint: "habits" },
] as const;

export function TabBar() {
  return (
    <nav
      dir="rtl"
      aria-label="التنقل الرئيسي"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-2 py-1.5">
        {TABS.map(({ to, label, Icon, tint }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              activeOptions={{ exact: to === "/" }}
              className="group flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] text-muted-foreground transition data-[status=active]:text-foreground"
              data-tint={tint}
            >
              <span className="tab-icon flex h-9 w-9 items-center justify-center rounded-xl bg-transparent transition group-data-[status=active]:bg-[var(--tab-bg)] group-data-[status=active]:text-[var(--tab-fg)]">
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <span className="leading-none">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
