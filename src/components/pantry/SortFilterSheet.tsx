"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { Kind } from "@/types/database";
import { FOOD_CATEGORIES, SUPPLIES_CATEGORIES } from "@/types/database";

/**
 * Sort & filter & view sheet (audit P3 + P6).
 *
 * Replaces the old sticky chip bar that mixed sort (single-select),
 * filter (single-select), and a long horizontal scroll of 15+ chips.
 * The bar costs ~36 px of vertical real estate on every scroll position
 * forever, even though 95% of users never deviate from the defaults.
 *
 * Now: a small pill in the page chrome shows the current state. Tap →
 * opens this sheet with sort/filter/view broken into clearly-separated
 * sections. Reset puts everything back to defaults in one tap.
 */

export type SortKey = "freshness" | "expiry" | "name" | "category" | "quantity";
export type ViewLayout = "compact" | "list";

interface Props {
  open: boolean;
  onClose: () => void;
  kind: Kind;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  filterCategory: string;
  onFilterChange: (c: string) => void;
  view: ViewLayout;
  onViewChange: (v: ViewLayout) => void;
  /** Sort options available for the active kind. */
  availableSorts: { key: SortKey; label: string }[];
}

const SECTION = "text-[10px] font-semibold tracking-[0.12em] uppercase text-gray-400 dark:text-gray-500";

export default function SortFilterSheet({
  open,
  onClose,
  kind,
  sort,
  onSortChange,
  filterCategory,
  onFilterChange,
  view,
  onViewChange,
  availableSorts,
}: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const categories = kind === "supplies" ? SUPPLIES_CATEGORIES : FOOD_CATEGORIES;
  const defaultSort: SortKey = kind === "supplies" ? "name" : "freshness";
  const isDefault = sort === defaultSort && !filterCategory && view === "compact";

  function resetAll() {
    onSortChange(defaultSort);
    onFilterChange("");
    onViewChange("compact");
  }

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "82dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3.5 pb-1 flex-shrink-0">
              <div className="w-10 h-[5px] bg-gray-200 dark:bg-zinc-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 flex-1">Sort &amp; filter</h2>
              {!isDefault && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-xs font-medium text-gray-400 hover:text-red-400 transition-colors active:opacity-60 px-1"
                >
                  Reset
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5 flex flex-col gap-5" style={{ overscrollBehavior: "contain" }}>

              {/* Sort */}
              <div className="flex flex-col gap-2">
                <p className={SECTION}>Sort by</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableSorts.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => onSortChange(s.key)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        sort === s.key
                          ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Filter by category */}
              <div className="flex flex-col gap-2">
                <p className={SECTION}>Filter by category</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => onFilterChange("")}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                      !filterCategory
                        ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                        : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                    }`}
                  >
                    All
                  </button>
                  {categories.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => onFilterChange(filterCategory === value ? "" : value)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        filterCategory === value
                          ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* View */}
              <div className="flex flex-col gap-2">
                <p className={SECTION}>Card layout</p>
                <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100 dark:bg-zinc-800">
                  <button
                    type="button"
                    onClick={() => onViewChange("compact")}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                      view === "compact"
                        ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <rect x="3" y="3" width="7" height="7" rx="1.5" />
                      <rect x="14" y="3" width="7" height="7" rx="1.5" />
                      <rect x="3" y="14" width="7" height="7" rx="1.5" />
                      <rect x="14" y="14" width="7" height="7" rx="1.5" />
                    </svg>
                    Compact
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewChange("list")}
                    className={`flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-colors active:scale-[0.98] ${
                      view === "list"
                        ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <line x1="3" y1="6" x2="21" y2="6" />
                      <line x1="3" y1="12" x2="21" y2="12" />
                      <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                    List
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
                  Compact fits two cards per row. List shows one item per row with the full name visible.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}
