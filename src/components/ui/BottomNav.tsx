"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ActivityBell, ActivityFeedSheet } from "@/components/household/ActivityFeed";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";

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
        strokeWidth={active ? 2.2 : 1.6}
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
        strokeWidth={active ? 2.2 : 1.6}
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
  const [feedOpen, setFeedOpen] = useState(false);
  const { activities, loading, unreadCount, markAllRead } = useActivityLog(householdId);
  const { currentUserId } = useHouseholdMembers(householdId);

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 bg-white z-30 pb-safe"
        style={{ boxShadow: "0 -1px 0 rgba(0,0,0,0.06), 0 -8px 24px rgba(0,0,0,0.05)" }}
      >
        <div className="max-w-lg mx-auto flex items-stretch">
          {tabs.map((tab) => {
            const href = tab.href(householdId);
            const active = pathname.startsWith(href);

            return (
              <Link
                key={tab.label}
                href={href}
                style={{ touchAction: "manipulation" }}
                className={cn(
                  "relative flex-1 flex flex-col items-center gap-1 pt-2.5 pb-3 min-h-[52px] text-[11px] font-medium tracking-wide transition-colors duration-150 active:opacity-70",
                  active ? "text-gray-900" : "text-gray-400"
                )}
              >
                {active && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute top-0 left-5 right-5 h-[2px] bg-gray-900 rounded-full"
                    transition={{ type: "spring", stiffness: 500, damping: 42 }}
                  />
                )}
                {tab.icon(active)}
                {tab.label}
              </Link>
            );
          })}

          {/* Activity bell — center slot */}
          <ActivityBell
            householdId={householdId}
            currentUserId={currentUserId}
            unreadCount={unreadCount}
            onOpen={() => setFeedOpen(true)}
          />
        </div>
      </nav>

      <ActivityFeedSheet
        householdId={householdId}
        currentUserId={currentUserId}
        activities={activities}
        loading={loading}
        open={feedOpen}
        onClose={() => setFeedOpen(false)}
        onMarkAllRead={markAllRead}
      />
    </>
  );
}
