"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  householdId: string;
}

const tabs = [
  {
    label: "Pantry",
    href: (id: string) => `/household/${id}/pantry`,
    icon: (active: boolean) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={active ? 2.1 : 1.5}
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
        strokeWidth={active ? 2.1 : 1.5}
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

export default function BottomNav({ householdId }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "fixed bottom-0 left-0 right-0 z-30 pb-safe",
        "bg-white/[0.88] dark:bg-zinc-950/[0.88]",
        "border-t border-black/[0.07] dark:border-white/[0.08]",
        "[backdrop-filter:blur(20px)_saturate(180%)]",
        "[-webkit-backdrop-filter:blur(20px)_saturate(180%)]",
      )}
    >
      <div className="max-w-lg mx-auto flex">
        {tabs.map((tab) => {
          const href = tab.href(householdId);
          const active = pathname.startsWith(href);

          return (
            <Link
              key={tab.label}
              href={href}
              style={{ touchAction: "manipulation" }}
              className={cn(
                "relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-3 min-h-[56px] transition-colors duration-150 active:opacity-70",
                active ? "text-gray-900 dark:text-gray-50" : "text-gray-400 dark:text-gray-500"
              )}
            >
              {/* Sliding pill background */}
              {active && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-x-5 inset-y-1.5 rounded-2xl bg-black/[0.05] dark:bg-white/[0.08]"
                  transition={{ type: "spring", stiffness: 500, damping: 42 }}
                />
              )}
              <span className="relative z-10">{tab.icon(active)}</span>
              <span
                className={cn(
                  "relative z-10 text-[11px] tracking-wide transition-all duration-150",
                  active ? "font-semibold" : "font-medium"
                )}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
