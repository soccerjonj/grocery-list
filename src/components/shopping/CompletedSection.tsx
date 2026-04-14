"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ShoppingItem } from "@/types/database";

interface CompletedSectionProps {
  items: ShoppingItem[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export default function CompletedSection({
  items,
  onToggle,
  onDelete,
  onClearAll,
}: CompletedSectionProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="mt-4">
      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          <motion.svg
            animate={{ rotate: open ? 90 : 0 }}
            transition={{ duration: 0.2 }}
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </motion.svg>
          <span>Completed ({items.length})</span>
        </button>
        <button
          onClick={onClearAll}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors py-1"
        >
          Clear all
        </button>
      </div>

      {/* Collapsible list */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="completed-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col divide-y divide-gray-50 bg-white rounded-2xl border border-gray-100 px-4 py-1">
              <AnimatePresence>
                {items.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 py-3">
                    {/* Un-check button */}
                    <button
                      onClick={() => onToggle(item.id)}
                      className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 border-2 border-gray-200 flex items-center justify-center hover:border-gray-400 transition-colors"
                      aria-label="Mark as not done"
                    >
                      <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 12 12" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 6l3 3 5-5" />
                      </svg>
                    </button>
                    <p className="flex-1 text-sm text-gray-400 line-through truncate">
                      {item.name}
                      {item.quantity && item.quantity !== 1 && (
                        <span className="ml-1.5">
                          ×{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                          {item.unit ? ` ${item.unit}` : ""}
                        </span>
                      )}
                    </p>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
