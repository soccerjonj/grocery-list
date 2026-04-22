"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { ActivityFeedSheet } from "@/components/household/ActivityFeed";

export default function ActivityBellFloat({ householdId }: { householdId: string }) {
  const [open, setOpen] = useState(false);
  const { activities, loading, unreadCount, markAllRead } = useActivityLog(householdId);
  const { currentUserId } = useHouseholdMembers(householdId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed top-5 right-4 z-20 w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm border border-gray-100 text-gray-400 hover:text-gray-700 active:scale-90 transition-all"
        style={{ top: "calc(1.25rem + env(safe-area-inset-top))" }}
        aria-label="Activity feed"
      >
        <span className="relative">
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          <AnimatePresence>
            {unreadCount > 0 && (
              <motion.span
                key="badge"
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center px-0.5 leading-none"
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </button>

      <ActivityFeedSheet
        householdId={householdId}
        currentUserId={currentUserId}
        activities={activities}
        loading={loading}
        open={open}
        onClose={() => setOpen(false)}
        onMarkAllRead={markAllRead}
      />
    </>
  );
}
