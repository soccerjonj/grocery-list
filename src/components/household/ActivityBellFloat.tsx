"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { ActivityFeedSheet } from "@/components/household/ActivityFeed";

/** Inline bell button — drop directly inside a header button group. */
export default function ActivityBellButton({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const { currentUserId } = useHouseholdMembers(householdId);
  const { activities, loading, unreadCount, markAllRead, clearAll } = useActivityLog(householdId, currentUserId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60"
        aria-label="Activity feed"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute top-1 right-1 w-[9px] h-[9px] bg-rose-500 rounded-full"
            />
          )}
        </AnimatePresence>
      </button>

      <ActivityFeedSheet
        householdId={householdId}
        currentUserId={currentUserId}
        activities={activities}
        loading={loading}
        open={open}
        onClose={() => setOpen(false)}
        onMarkAllRead={markAllRead}
        onClearAll={clearAll}
      />
    </>
  );
}
