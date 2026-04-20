"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

interface ShoppingItemProps {
  item: ShoppingItemType;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  members?: MemberProfile[];
  currentUserId?: string | null;
}

function assignedLabel(
  assignedTo: string[] | null,
  members: MemberProfile[],
  currentUserId: string | null
): string | null {
  if (!assignedTo || assignedTo.length === 0) return null;
  if (assignedTo.length >= members.length && members.length > 0) return null;
  if (assignedTo.length === 1) {
    if (assignedTo[0] === currentUserId) return "For me";
    const m = members.find((m) => m.user_id === assignedTo[0]);
    return m ? `For ${m.short_name}` : null;
  }
  return (
    "For " +
    assignedTo
      .map((uid) =>
        uid === currentUserId
          ? "me"
          : (members.find((m) => m.user_id === uid)?.short_name ?? "?")
      )
      .join(" & ")
  );
}

// Total time the check animation plays before the item exits
const CHECK_ANIMATION_MS = 850;

export default function ShoppingItem({ item, onToggle, onDelete, members = [], currentUserId = null }: ShoppingItemProps) {
  // "checking" is true during the animation window between tap and exit
  const [checking, setChecking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleCheck() {
    if (checking) return; // don't double-fire during animation

    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }

    if (item.completed) {
      // Un-checking from completed section — no animation needed, instant
      onToggle(item.id);
      return;
    }

    // Play the animation, then trigger the real state change
    setChecking(true);
    timerRef.current = setTimeout(() => {
      setChecking(false);
      onToggle(item.id);
    }, CHECK_ANIMATION_MS);
  }

  const isChecked = checking || item.completed;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{
        opacity: { duration: 0.15 },
        height: { duration: 0.2, ease: [0.4, 0, 1, 1] },
        y: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
      }}
      className="flex items-center gap-3 px-1 py-3 overflow-hidden"
    >
      {/* ── Checkbox ── */}
      <button
        onClick={handleCheck}
        className="flex-shrink-0 w-6 h-6 focus-visible:outline-none"
        aria-label={item.completed ? "Mark as not done" : "Mark as done"}
      >
        <motion.div
          animate={
            isChecked
              ? { backgroundColor: "#16a34a", borderColor: "#16a34a" }
              : { backgroundColor: "#ffffff", borderColor: "#d1d5db" }
          }
          transition={{ duration: 0.18 }}
          className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
        >
          <AnimatePresence>
            {isChecked && (
              <motion.svg
                key="check"
                className="w-3.5 h-3.5 text-white overflow-visible"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                <motion.path
                  d="M2 7 L5.5 10.5 L12 4"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.28, ease: "easeOut" }}
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </motion.div>
      </button>

      {/* ── Label + store + member tag + animated strikethrough ── */}
      <div className="flex-1 min-w-0 relative">
        <motion.p
          animate={{ opacity: isChecked ? 0.38 : 1 }}
          transition={{ duration: 0.2, delay: isChecked ? 0.12 : 0 }}
          className="text-sm font-medium text-gray-900 truncate"
        >
          {item.name}
          {item.quantity && item.quantity !== 1 && (
            <span className="text-gray-400 font-normal ml-1.5">
              ×{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
        </motion.p>

        {/* Store tag + member assignment */}
        {!isChecked && (item.store || assignedLabel(item.assigned_to, members, currentUserId)) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {item.store && (
              <p className="text-xs text-gray-400 truncate">{item.store}</p>
            )}
            {assignedLabel(item.assigned_to, members, currentUserId) && (
              <span className="text-xs text-indigo-400 font-medium flex-shrink-0">
                {assignedLabel(item.assigned_to, members, currentUserId)}
              </span>
            )}
          </div>
        )}

        {/* Strikethrough line — sweeps left to right */}
        <AnimatePresence>
          {checking && (
            <motion.span
              key="strike"
              aria-hidden
              className="absolute inset-y-0 left-0 right-4 flex items-center pointer-events-none"
            >
              <motion.span
                className="block h-px w-full bg-green-500 rounded-full origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.38, delay: 0.15, ease: [0.33, 1, 0.68, 1] }}
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* ── Delete ── */}
      <motion.button
        animate={{ opacity: isChecked ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        onClick={() => onDelete(item.id)}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
        aria-label="Remove item"
        tabIndex={isChecked ? -1 : 0}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </motion.button>
    </motion.div>
  );
}
