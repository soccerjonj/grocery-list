"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useHouseholdContext } from "@/context/HouseholdContext";
import ActivityBellButton from "@/components/household/ActivityBellFloat";

interface SidebarProps {
  householdId: string;
}

/**
 * Desktop-only left navigation rail (lg+). Mirrors BottomNav's tab data,
 * icons, and active-route logic, laid out vertically. Below lg it is
 * display:hidden and BottomNav takes over — both stay mounted, so this
 * uses a DISTINCT layoutId ("nav-pill-side") for its active pill to keep
 * Framer from animating the indicator between the two navs.
 */

const tabs = [
  {
    label: "Dashboard",
    href: (id: string) => `/household/${id}/dashboard`,
    icon: (active: boolean) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={active ? 2.1 : 1.6}
        stroke="currentColor"
        className="w-[22px] h-[22px] transition-all duration-200"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
        />
      </svg>
    ),
  },
  {
    label: "Pantry",
    href: (id: string) => `/household/${id}/pantry`,
    icon: (active: boolean) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={active ? 2.1 : 1.6}
        stroke="currentColor"
        className="w-[22px] h-[22px] transition-all duration-200"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4"
        />
      </svg>
    ),
  },
  {
    label: "Shopping",
    href: (id: string) => `/household/${id}/shopping`,
    icon: (active: boolean) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={active ? 2.1 : 1.6}
        stroke="currentColor"
        className="w-[22px] h-[22px] transition-all duration-200"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z"
        />
      </svg>
    ),
  },
];

export default function Sidebar({ householdId }: SidebarProps) {
  const pathname = usePathname();
  const { householdName } = useHouseholdContext();

  return (
    <aside
      className={cn(
        "hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:w-60 lg:flex-col",
        "bg-white/95 dark:bg-zinc-950/95 border-r border-black/[0.07] dark:border-white/[0.08]",
        "[backdrop-filter:blur(20px)_saturate(180%)]",
      )}
    >
      {/* Household name */}
      <div className="px-5 pt-6 pb-5">
        <p className="text-[11px] font-medium tracking-wide text-gray-400 dark:text-gray-500 mb-0.5">
          Household
        </p>
        <p className="text-lg font-semibold text-gray-900 dark:text-gray-50 truncate">
          {householdName}
        </p>
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-1 px-3">
        {tabs.map((tab) => {
          const href = tab.href(householdId);
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              onClick={(e) => {
                if (active && typeof window !== "undefined") {
                  e.preventDefault();
                  window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
                }
              }}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-colors duration-150",
                active
                  ? "text-gray-900 dark:text-gray-50"
                  : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-pill-side"
                  className="absolute inset-0 rounded-2xl bg-black/[0.05] dark:bg-white/[0.08]"
                  transition={{ type: "spring", stiffness: 500, damping: 42 }}
                />
              )}
              <span className="relative z-10">{tab.icon(active)}</span>
              <span
                className={cn(
                  "relative z-10 text-sm tracking-wide transition-all duration-150",
                  active ? "font-semibold" : "font-medium",
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom: activity + settings */}
      <div className="mt-auto flex items-center gap-1 px-4 pb-6 pt-4">
        <ActivityBellButton householdId={householdId} />
        <Link
          href={`/household/${householdId}/settings`}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60"
          aria-label="Settings"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </Link>
      </div>
    </aside>
  );
}
