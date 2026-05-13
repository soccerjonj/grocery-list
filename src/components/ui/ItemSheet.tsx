"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, animate, useMotionValue } from "framer-motion";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

/**
 * Shared bottom-sheet primitive for item-edit flows (PantryItem,
 * ShoppingItem, and any future row-editor). Provides:
 *
 *   • Portal-mounted backdrop + sheet with consistent spring motion
 *   • iOS-safe body scroll lock (via useBodyScrollLock)
 *   • Drag-to-dismiss on the handle (rubber-band feel)
 *   • Esc-key dismiss
 *   • Safe-area-aware bottom padding
 *
 * The `header` slot is intentionally separate so each caller can render
 * its own header layout (with name, meta, optional pencil-edit, etc.)
 * while still sharing the dismiss + drag affordances. Use
 * <ItemSheetHeader/> from this file for the standard pattern.
 */

interface ItemSheetProps {
  open: boolean;
  onClose: () => void;
  header?: React.ReactNode;
  children: React.ReactNode;
}

export default function ItemSheet({ open, onClose, header, children }: ItemSheetProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useBodyScrollLock(open);

  // Esc to dismiss.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Drag-to-dismiss: attached to the handle so it never interferes with
  // scrolling inside the sheet content.
  const y = useMotionValue(0);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            style={{ paddingBottom: "env(safe-area-inset-bottom)", y }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl max-h-[88vh] overflow-hidden flex flex-col"
          >
            {/* Drag handle — drag down to dismiss. Touch-none keeps the
                browser from claiming the gesture for vertical scroll. */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 120 || info.velocity.y > 600) {
                  onClose();
                } else {
                  animate(y, 0, { type: "spring", stiffness: 500, damping: 40 });
                }
              }}
              className="flex justify-center pt-3 pb-2 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none"
              aria-label="Drag to dismiss"
            >
              <div className="w-10 h-1 bg-gray-200 dark:bg-zinc-700 rounded-full pointer-events-none" />
            </motion.div>
            {header}
            <div className="overflow-y-auto overscroll-contain flex-1 min-h-0 px-5 pb-6 flex flex-col gap-5">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

// ── Standard header ─────────────────────────────────────────────────

interface ItemSheetHeaderProps {
  /** Display title (the item name). */
  title: string;
  /** Inline meta strip rendered below the title (badges, owner, etc.). */
  meta?: React.ReactNode;
  /** Inline action icons rendered to the left of the close button. */
  actions?: React.ReactNode;
  /** Called when user taps the pencil-edit affordance. Omit to hide it. */
  onEditTitle?: () => void;
  onClose: () => void;
  /** When true, render an editable input in place of the title. */
  editing?: boolean;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onEditCommit?: () => void;
  onEditCancel?: () => void;
}

export function ItemSheetHeader({
  title,
  meta,
  actions,
  onEditTitle,
  onClose,
  editing,
  editValue,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: ItemSheetHeaderProps) {
  return (
    <div className="flex items-center gap-3 px-5 pt-1 pb-3 flex-shrink-0">
      <div className="flex-1 min-w-0">
        {editing && onEditChange && onEditCommit ? (
          <input
            type="text"
            value={editValue ?? ""}
            onChange={(e) => onEditChange(e.target.value)}
            onBlur={onEditCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onEditCommit();
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") onEditCancel?.();
            }}
            autoFocus
            className="w-full text-lg font-semibold text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
          />
        ) : (
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50 truncate">
              {title}
            </h2>
            {onEditTitle && (
              <button
                type="button"
                onClick={onEditTitle}
                aria-label="Edit name"
                className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:scale-90"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            )}
          </div>
        )}
        {meta && (
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">{meta}</div>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
