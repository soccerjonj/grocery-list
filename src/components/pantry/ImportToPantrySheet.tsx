"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_LOCATIONS } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";

interface DraftItem {
  /** original shopping_item id — used as React key */
  key: string;
  name: string;
  quantity: number;
  unit: string;
  storageLocation: string | null;
  expiresAt: string | null;
}

interface ImportToPantrySheetProps {
  listId: string;
  householdId: string;
  onAddItem: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => Promise<void>;
  onClose: () => void;
}

// ── Quantity stepper ──────────────────────────────────────────────
function QtyControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const display = value % 1 === 0 ? String(value) : value.toFixed(1);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0.5, value - 1))}
        className="w-7 h-7 rounded-lg bg-gray-100 text-gray-600 flex items-center justify-center text-base font-light active:scale-90 transition-transform"
      >
        −
      </button>
      <span className="w-8 text-center text-sm font-semibold text-gray-900 tabular-nums">
        {display}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center text-base font-light active:scale-90 transition-transform"
      >
        +
      </button>
    </div>
  );
}

// ── Single draft item card ─────────────────────────────────────────
function DraftCard({
  item,
  onChange,
  onDelete,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  onDelete: () => void;
}) {
  const [nameVal, setNameVal] = useState(item.name);
  const [unitVal, setUnitVal] = useState(item.unit);

  // Keep local inputs in sync if parent resets
  useEffect(() => { setNameVal(item.name); }, [item.name]);
  useEffect(() => { setUnitVal(item.unit); }, [item.unit]);

  function commitName() {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== item.name) onChange({ name: trimmed });
    else setNameVal(item.name);
  }

  function commitUnit() {
    const trimmed = unitVal.trim();
    onChange({ unit: trimmed });
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18 }}
      className="bg-white border border-gray-100 rounded-2xl px-4 py-3.5 flex flex-col gap-3"
    >
      {/* Row 1: name + delete */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="flex-1 text-sm font-medium text-gray-900 bg-transparent outline-none placeholder:text-gray-300"
          placeholder="Item name"
        />
        <button
          type="button"
          onClick={onDelete}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 hover:text-red-400 hover:bg-red-50 transition-colors active:scale-90"
          aria-label="Remove item"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Row 2: qty stepper + unit input */}
      <div className="flex items-center gap-3">
        <QtyControl
          value={item.quantity}
          onChange={(n) => onChange({ quantity: n })}
        />
        <input
          type="text"
          value={unitVal}
          onChange={(e) => setUnitVal(e.target.value)}
          onBlur={commitUnit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder="unit"
          className="w-16 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none focus:border-gray-400 transition-colors placeholder:text-gray-300"
        />
      </div>

      {/* Row 3: storage chips */}
      <div className="flex flex-wrap gap-1.5">
        {STORAGE_LOCATIONS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              onChange({ storageLocation: item.storageLocation === value ? null : value })
            }
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
              item.storageLocation === value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Row 4: expiry date */}
      <div>
        {item.expiresAt ? (
          <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
            <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <label className="relative text-xs font-medium text-green-700 cursor-pointer">
              {new Date(item.expiresAt + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              <input
                type="date"
                value={item.expiresAt}
                onChange={(e) => onChange({ expiresAt: e.target.value || null })}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
              />
            </label>
            <button
              type="button"
              onClick={() => onChange({ expiresAt: null })}
              className="text-green-600 hover:opacity-70 transition-opacity ml-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <label className="inline-flex items-center gap-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer relative">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Set expiry
            <input
              type="date"
              onChange={(e) => onChange({ expiresAt: e.target.value || null })}
              className="absolute inset-0 opacity-0 cursor-pointer w-full"
            />
          </label>
        )}
      </div>
    </motion.div>
  );
}

// ── Main sheet ─────────────────────────────────────────────────────
export default function ImportToPantrySheet({
  listId,
  householdId,
  onAddItem,
  onClose,
}: ImportToPantrySheetProps) {
  const [mounted, setMounted] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const supabase = createClient();

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Fetch completed items from the archived list
  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadingItems(true);
      const { data } = await supabase
        .from("shopping_items")
        .select("id, name, quantity, unit")
        .eq("list_id", listId)
        .eq("completed", true)
        .order("completed_at", { ascending: true });

      if (!cancelled) {
        setDrafts(
          (data ?? []).map((item) => ({
            key: item.id,
            name: item.name,
            quantity: item.quantity ?? 1,
            unit: item.unit ?? "",
            storageLocation: null,
            expiresAt: null,
          }))
        );
        setLoadingItems(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [listId, supabase]);

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d))
    );
  }

  function deleteDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  async function handleAdd() {
    if (saving || drafts.length === 0) return;
    setSaving(true);
    for (const draft of drafts) {
      await onAddItem(
        draft.name,
        draft.quantity,
        draft.unit || undefined,
        {
          storageLocation: draft.storageLocation,
          expiresAt: draft.expiresAt,
        }
      );
    }
    setSaving(false);
    setDone(true);
    setTimeout(onClose, 600);
  }

  const sheet = (
    <AnimatePresence>
      {true && (
        <>
          {/* Backdrop */}
          <motion.div
            key="import-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="import-panel"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-gray-50 rounded-t-3xl shadow-2xl flex flex-col"
            style={{
              maxHeight: "92dvh",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0 border-b border-gray-100">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900">Review your haul</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Edit details, then add everything to your pantry.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable item list */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
              {loadingItems ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                </div>
              ) : drafts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <p className="text-sm">No items to import</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {drafts.map((draft) => (
                    <DraftCard
                      key={draft.key}
                      item={draft}
                      onChange={(patch) => updateDraft(draft.key, patch)}
                      onDelete={() => deleteDraft(draft.key)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {!loadingItems && (
              <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100">
                <AnimatePresence mode="wait">
                  {done ? (
                    <motion.div
                      key="done"
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full py-3.5 flex items-center justify-center gap-2 bg-green-500 text-white rounded-2xl text-sm font-medium"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      Added to pantry!
                    </motion.div>
                  ) : (
                    <motion.button
                      key="add"
                      type="button"
                      onClick={handleAdd}
                      disabled={saving || drafts.length === 0}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-3.5 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-2xl text-sm font-medium disabled:opacity-50 transition-opacity"
                    >
                      {saving ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          Adding…
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                          </svg>
                          Add {drafts.length} item{drafts.length !== 1 ? "s" : ""} to pantry
                        </>
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  if (!mounted) return null;
  return createPortal(sheet, document.body);
}
