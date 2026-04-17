"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useItemSuggestions, type ItemSuggestion } from "@/hooks/useItemSuggestions";

interface AddShoppingItemProps {
  onAdd: (name: string, quantity?: number, unit?: string, store?: string) => void;
  householdId: string;
}

export default function AddShoppingItem({ onAdd, householdId }: AddShoppingItemProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [store, setStore] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { getSuggestions } = useItemSuggestions(householdId);
  const suggestions = getSuggestions(name, 5);

  // Close on outside tap
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setExpanded(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function applySuggestion(s: ItemSuggestion) {
    setName(s.name);
    if (s.store) setStore(s.store);
    if (s.unit) setUnit(s.unit);
    setShowSuggestions(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function collapse() {
    setExpanded(false);
    setShowSuggestions(false);
    nameRef.current?.blur();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(
      name.trim(),
      quantity ? parseFloat(quantity) : undefined,
      unit || undefined,
      store.trim() || undefined
    );
    setName("");
    setQuantity("");
    setUnit("");
    setStore("");
    setShowSuggestions(false);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      nameRef.current?.focus();
    }, 700);
  }

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm"
      >
        {/* ── Name row ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="flex-shrink-0 w-5 h-5 rounded-full border-2 border-dashed border-gray-300" />
          <input
            ref={nameRef}
            type="text"
            placeholder="Add to list..."
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              setExpanded(true);
              setShowSuggestions(true);
            }}
            className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />

          {/* Close button — visible while expanded */}
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.button
                type="button"
                onClick={collapse}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                whileTap={{ scale: 0.88 }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0 text-xs font-medium"
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </motion.button>
            )}
          </AnimatePresence>

          {/* Submit button */}
          <motion.button
            type="submit"
            disabled={!name.trim() || submitted}
            whileTap={{ scale: 0.88 }}
            animate={{ backgroundColor: submitted ? "#16a34a" : "#111827" }}
            transition={{ duration: 0.15 }}
            className="w-8 h-8 flex items-center justify-center text-white rounded-xl disabled:opacity-30 flex-shrink-0 overflow-hidden"
          >
            <AnimatePresence mode="wait" initial={false}>
              {submitted ? (
                <motion.svg
                  key="check"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </motion.svg>
              ) : (
                <motion.svg
                  key="plus"
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.4, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </motion.svg>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* ── Autofill suggestions ─────────────────────────────── */}
        <AnimatePresence>
          {showSuggestions && suggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden border-t border-gray-50"
            >
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  onTouchEnd={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-700 flex-1 truncate">{s.name}</span>
                  {s.store && (
                    <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[100px]">{s.store}</span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Expanded details ─────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-2 px-4 pb-4 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="Qty"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-16 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 outline-none text-center"
                  />
                  <input
                    type="text"
                    placeholder="Unit (optional)"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none"
                  />
                </div>
                <input
                  type="text"
                  placeholder="Store (e.g. Trader Joe's)"
                  value={store}
                  onChange={(e) => setStore(e.target.value)}
                  className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
