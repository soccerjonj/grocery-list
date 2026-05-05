"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import type { ActivityLog } from "@/types/database";

const ACTION_LABEL: Record<string, (item: string | null) => string> = {
  pantry_add:         (i) => `added ${i ?? "an item"} to pantry`,
  pantry_delete:      (i) => `removed ${i ?? "an item"} from pantry`,
  pantry_running_low: (i) => `marked ${i ?? "an item"} as running low`,
  shopping_add:       (i) => `added ${i ?? "an item"} to the list`,
  shopping_check:     (i) => `got ${i ?? "an item"}`,
  trip_finished:      ()  => `finished a shopping trip`,
  member_join:        ()  => `joined the household`,
};

const ACTION_LABEL_SHORT: Record<string, string> = {
  pantry_add:         "added to pantry",
  pantry_delete:      "removed from pantry",
  pantry_running_low: "marked running low",
  shopping_add:       "added to list",
  shopping_check:     "bought",
  trip_finished:      "finished a trip",
  member_join:        "joined",
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

// ─── Grouping ────────────────────────────────────────────────────────────────

interface ActivityGroup {
  key: string;
  item_name: string | null;
  entries: ActivityLog[]; // chronological, oldest-first within group
  latest_at: string;
}

const STANDALONE_ACTIONS = new Set(["trip_finished", "member_join"]);
const GROUP_WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * Collapses add → delete → add sequences within a group.
 * If the final action is pantry_add and a pantry_delete exists earlier,
 * the user deleted and re-added (e.g. to fix metadata after a bug).
 * Strip everything up to and including the last delete — only the net
 * result (the final add, plus any non-add/delete events) is kept.
 */
function deduplicateEntries(entries: ActivityLog[]): ActivityLog[] {
  const last = entries[entries.length - 1];
  if (last?.action !== "pantry_add") return entries;

  const lastDeleteIdx = entries.map((e) => e.action).lastIndexOf("pantry_delete");
  if (lastDeleteIdx === -1) return entries;

  const kept = [
    // non-add/delete events that predate the last delete (e.g. running_low)
    ...entries.slice(0, lastDeleteIdx).filter(
      (e) => e.action !== "pantry_add" && e.action !== "pantry_delete"
    ),
    // everything after the last delete (the final re-add and anything else)
    ...entries.slice(lastDeleteIdx + 1),
  ];
  // Always keep at least the final add
  return kept.length > 0 ? kept : [last];
}

function groupActivities(activities: ActivityLog[]): ActivityGroup[] {
  // activities arrives newest-first; process oldest-first for natural accumulation
  const chronological = [...activities].reverse();
  const groups: ActivityGroup[] = [];

  for (const a of chronological) {
    if (STANDALONE_ACTIONS.has(a.action) || !a.item_name) {
      groups.push({ key: a.id, item_name: a.item_name, entries: [a], latest_at: a.created_at });
      continue;
    }

    const nameLower = a.item_name.toLowerCase();
    const ts = new Date(a.created_at).getTime();

    // Find the most recent open group for this item within the time window
    const existing = [...groups].reverse().find(
      (g) =>
        g.item_name?.toLowerCase() === nameLower &&
        ts - new Date(g.latest_at).getTime() <= GROUP_WINDOW_MS
    );

    if (existing) {
      existing.entries.push(a);
      existing.latest_at = a.created_at;
    } else {
      groups.push({ key: a.id, item_name: a.item_name, entries: [a], latest_at: a.created_at });
    }
  }

  // Collapse add→delete→add noise within each group
  for (const g of groups) {
    if (g.entries.length > 1) {
      g.entries = deduplicateEntries(g.entries);
      // Update latest_at to reflect the deduplicated tail
      g.latest_at = g.entries[g.entries.length - 1].created_at;
    }
  }

  // Return newest-first
  return groups.sort((a, b) => new Date(b.latest_at).getTime() - new Date(a.latest_at).getTime());
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ActivityFeedSheet({
  householdId,
  currentUserId,
  activities,
  loading,
  open,
  onClose,
  onMarkAllRead,
  onClearAll,
}: {
  householdId: string;
  currentUserId: string | null;
  activities: ActivityLog[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
}) {
  const { members } = useHouseholdMembers(householdId);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (open) {
      onMarkAllRead();
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Build groups, then bucket by day
  const groups = groupActivities(activities);

  const byDay: { day: string; groups: ActivityGroup[] }[] = [];
  for (const g of groups) {
    const day = dayGroup(g.latest_at);
    const last = byDay[byDay.length - 1];
    if (last?.day === day) last.groups.push(g);
    else byDay.push({ day, groups: [g] });
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
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col max-h-[80vh]"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 dark:bg-zinc-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-1 pb-3 flex-shrink-0 border-b border-gray-50 dark:border-zinc-800">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 flex-1">Activity</h2>
              {activities.length > 0 && (
                <button
                  type="button"
                  onClick={onClearAll}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors active:opacity-60 px-1"
                >Clear all</button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Feed */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="flex items-center justify-center py-12 text-gray-300 dark:text-zinc-600 text-sm">Loading…</div>
              ) : activities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 gap-2">
                  <svg className="w-8 h-8 text-gray-200 dark:text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                  </svg>
                  <p className="text-sm text-gray-400 dark:text-zinc-500">No activity yet</p>
                </div>
              ) : (
                <div className="px-5 py-3 flex flex-col gap-5">
                  {byDay.map(({ day, groups: dayGroups }) => (
                    <div key={day} className="flex flex-col gap-1">
                      <p className="text-[10px] font-semibold text-gray-300 dark:text-zinc-600 uppercase tracking-wider mb-2">{day}</p>

                      {dayGroups.map((g) => {
                        if (g.entries.length === 1) {
                          // ── Single entry — render flat (same as before) ──
                          const a = g.entries[0];
                          const member = members.find((m) => m.user_id === a.user_id);
                          const color = member?.color ?? DEFAULT_COLOR;
                          const isMe = a.user_id === currentUserId;
                          const name = isMe ? "You" : (member?.short_name ?? "Someone");
                          const label = ACTION_LABEL[a.action]?.(a.item_name) ?? a.action;

                          return (
                            <div key={g.key} className="flex items-start gap-3 py-2">
                              <span
                                className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                                style={{ backgroundColor: hexAlpha(color, 0.15), color }}
                              >
                                {member?.initials ?? "?"}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
                                  <span className="font-semibold">{name}</span>{" "}
                                  <span className="text-gray-500 dark:text-gray-400">{label}</span>
                                </p>
                                <p className="text-[11px] text-gray-300 dark:text-zinc-600 mt-0.5">{timeAgo(a.created_at)}</p>
                              </div>
                            </div>
                          );
                        }

                        // ── Multi-entry group — item name header + sub-rows ──
                        return (
                          <div key={g.key} className="py-2">
                            {/* Item name header */}
                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2 ml-0.5">
                              {g.item_name}
                            </p>
                            <div className="flex flex-col gap-1.5 pl-1 border-l-2 border-gray-100 dark:border-zinc-800">
                              {g.entries.map((a) => {
                                const member = members.find((m) => m.user_id === a.user_id);
                                const color = member?.color ?? DEFAULT_COLOR;
                                const isMe = a.user_id === currentUserId;
                                const name = isMe ? "You" : (member?.short_name ?? "Someone");
                                const shortLabel = ACTION_LABEL_SHORT[a.action] ?? a.action;

                                return (
                                  <div key={a.id} className="flex items-center gap-2 pl-2">
                                    <span
                                      className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                                      style={{ backgroundColor: hexAlpha(color, 0.15), color }}
                                    >
                                      {member?.initials ?? "?"}
                                    </span>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-snug flex-1 min-w-0">
                                      <span className="font-medium text-gray-800 dark:text-gray-200">{name}</span>
                                      {" · "}{shortLabel}
                                      {" · "}<span className="text-gray-400 dark:text-zinc-500">{timeAgo(a.created_at)}</span>
                                    </p>
                                  </div>
                                );
                              })}
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
