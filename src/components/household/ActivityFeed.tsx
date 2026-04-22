"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useActivityLog } from "@/hooks/useActivityLog";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import type { ActivityLog } from "@/types/database";

const ACTION_LABEL: Record<string, (item: string | null) => string> = {
  pantry_add:        (i) => `added ${i ?? "an item"} to pantry`,
  pantry_delete:     (i) => `removed ${i ?? "an item"} from pantry`,
  pantry_running_low:(i) => `marked ${i ?? "an item"} as running low`,
  shopping_add:      (i) => `added ${i ?? "an item"} to the list`,
  shopping_check:    (i) => `got ${i ?? "an item"}`,
  trip_finished:     ()  => `finished a shopping trip`,
  member_join:       ()  => `joined the household`,
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 172800) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dayGroup(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(iso).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

interface Props {
  householdId: string;
  currentUserId: string | null;
  unreadCount: number;
  onOpen: () => void;
}

export function ActivityBell({ householdId, currentUserId, unreadCount, onOpen }: Props) {
  void householdId; void currentUserId;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative flex flex-col items-center gap-1 pt-2.5 pb-3 min-h-[52px] text-[11px] font-medium tracking-wide transition-colors duration-150 active:opacity-70 text-gray-400 px-6"
      aria-label="Activity feed"
    >
      <span className="relative">
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              key="badge"
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-1 -right-1.5 min-w-[16px] h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      Activity
    </button>
  );
}

export function ActivityFeedSheet({
  householdId,
  currentUserId,
  open,
  onClose,
}: {
  householdId: string;
  currentUserId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { activities, loading, markAllRead } = useActivityLog(householdId);
  const { members } = useHouseholdMembers(householdId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      markAllRead();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Group by day
  const grouped: { day: string; items: ActivityLog[] }[] = [];
  for (const a of activities) {
    const day = dayGroup(a.created_at);
    const last = grouped[grouped.length - 1];
    if (last?.day === day) last.items.push(a);
    else grouped.push({ day, items: [a] });
  }

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 40 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-1 pb-3 flex-shrink-0 border-b border-gray-50">
              <h2 className="text-base font-semibold text-gray-900 flex-1">Activity</h2>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors active:scale-90"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Feed */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-300 text-sm">Loading…</div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2">
                  <svg className="w-8 h-8 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                  <p className="text-sm text-gray-400">No activity yet</p>
                </div>
              ) : (
                <div className="px-5 py-3 flex flex-col gap-5">
                  {grouped.map(({ day, items }) => (
                    <div key={day} className="flex flex-col gap-0.5">
                      <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider mb-2">{day}</p>
                      {items.map((a) => {
                        const member = members.find((m) => m.user_id === a.user_id);
                        const color = member?.color ?? DEFAULT_COLOR;
                        const isMe = a.user_id === currentUserId;
                        const name = isMe ? "You" : (member?.short_name ?? "Someone");
                        const label = ACTION_LABEL[a.action]?.(a.item_name) ?? a.action;

                        return (
                          <div key={a.id} className="flex items-start gap-3 py-2">
                            {/* Avatar */}
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                              style={{ backgroundColor: hexAlpha(color, 0.15), color }}
                            >
                              {member?.initials ?? "?"}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 leading-snug">
                                <span className="font-semibold">{name}</span>{" "}
                                <span className="text-gray-500">{label}</span>
                              </p>
                              <p className="text-[11px] text-gray-300 mt-0.5">{timeAgo(a.created_at)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}
