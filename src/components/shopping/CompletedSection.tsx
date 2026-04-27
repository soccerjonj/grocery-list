"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ShoppingItem } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

interface CompletedSectionProps {
  items: ShoppingItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll?: () => void;
  members?: MemberProfile[];
  currentUserId?: string | null;
}

export default function CompletedSection({
  items,
  onToggle,
  onDelete,
  onClearAll,
  members = [],
  currentUserId,
}: CompletedSectionProps) {
  const [open, setOpen] = useState(false);
  const prevLengthRef = useRef(0);

  // Auto-open the first time an item lands here (0 → 1 transition)
  useEffect(() => {
    if (prevLengthRef.current === 0 && items.length > 0) setOpen(true);
    prevLengthRef.current = items.length;
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <div className="mt-1">
      {/* Header */}
      <div className="flex items-center justify-between px-1 mb-1.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 py-1 active:opacity-60 transition-opacity"
        >
          {/* Mini green checkmark icon */}
          <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <svg className="w-2.5 h-2.5 text-green-600" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 6l3 3 5-5" />
            </svg>
          </span>
          <span className="text-sm font-medium text-gray-500">
            Checked off
            <span className="ml-1.5 text-xs font-medium text-gray-400 tabular-nums">({items.length})</span>
          </span>
          <motion.svg
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="w-3 h-3 text-gray-400 ml-0.5"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </motion.svg>
        </button>

        {onClearAll && (
          <button
            onClick={onClearAll}
            className="text-xs font-medium text-gray-400 hover:text-red-400 transition-colors py-1 px-1.5 rounded-lg hover:bg-red-50 active:opacity-60"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Collapsible list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="completed-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="bg-white rounded-2xl border border-gray-100 px-4 py-1">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0">
                      {/* Un-check button */}
                      <button
                        onClick={() => onToggle(item.id)}
                        className="flex-shrink-0 w-6 h-6 rounded-full bg-green-500 border-2 border-green-500 flex items-center justify-center active:scale-90 transition-transform"
                        aria-label="Mark as not done"
                      >
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      </button>

                      <p className="flex-1 text-sm text-gray-400 line-through truncate">
                        {item.name}
                        {item.quantity && item.quantity !== 1 && (
                          <span className="ml-1.5 text-gray-300">
                            ×{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                            {item.unit ? ` ${item.unit}` : ""}
                          </span>
                        )}
                      </p>

                      {item.store && (
                        <span className="text-xs text-gray-300 flex-shrink-0 truncate max-w-[80px]">{item.store}</span>
                      )}

                      {item.completed_by && (() => {
                        const m = members.find((m) => m.user_id === item.completed_by);
                        if (!m) return null;
                        const c = m.color ?? DEFAULT_COLOR;
                        return (
                          <span
                            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 ring-1 ring-white"
                            style={{ backgroundColor: hexAlpha(c, 0.18), color: c }}
                            title={m.user_id === currentUserId ? "You" : m.short_name}
                          >
                            {m.initials}
                          </span>
                        );
                      })()}

                      <button
                        onClick={() => onDelete(item.id)}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition-colors active:scale-90"
                        aria-label="Remove"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
