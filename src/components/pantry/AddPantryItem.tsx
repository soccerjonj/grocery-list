"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { useItemSuggestions, type ItemSuggestion } from "@/hooks/useItemSuggestions";
import { STORAGE_LOCATIONS, FRIDGE_ZONES, FOOD_CATEGORIES } from "@/types/database";
import { checkPantryDuplicate, increasePantryQty } from "@/lib/checkPantryDuplicate";
import { getPantryHint, getSuggestedExpiryDays, formatSuggestedDays } from "@/lib/pantryHints";

interface AddPantryItemProps {
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  members: MemberProfile[];
  currentUserId: string | null;
  householdId: string;
  existingNames: string[];
}


const COMMON_UNITS = ["kg", "g", "lb", "oz", "L", "mL", "pack", "can", "bag", "box", "bottle"];

export default function AddPantryItem({
  onAdd,
  members,
  currentUserId,
  householdId,
  existingNames,
}: AddPantryItemProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [expanded, setExpanded] = useState(false);

  const [unit, setUnit] = useState<string>("");
  const [storageLocation, setStorageLocation] = useState<string>("");
  const [fridgeZone, setFridgeZone] = useState<string>("");
  const [foodCategory, setFoodCategory] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);
  const [autoDetected, setAutoDetected] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoDetectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  function collapse() {
    setExpanded(false);
    setShowSuggestions(false);
    nameRef.current?.blur();
  }

  function applySuggestion(s: ItemSuggestion) {
    setName(s.name);
    if (s.unit) setUnit(s.unit);
    if (s.storage_location) {
      setStorageLocation(s.storage_location);
      if (s.fridge_zone) setFridgeZone(s.fridge_zone);
      if (s.food_category) setFoodCategory(s.food_category);
    } else {
      // Suggestion has no pantry metadata (e.g. sourced from shopping history) —
      // fall back to keyword-based auto-detect so storage/category/fridge-zone
      // are still populated.
      const hint = getPantryHint(s.name);
      if (hint) {
        setStorageLocation(hint.storage_location);
        setFoodCategory(hint.food_category);
        if (hint.fridge_zone) setFridgeZone(hint.fridge_zone);
        setAutoDetected(true);
      }
    }
    setShowSuggestions(false);
    // Do NOT refocus — programmatic focus triggers onFocus which re-shows
    // suggestions, causing the form to collapse if the user taps to dismiss them
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const dup = await checkPantryDuplicate(householdId, name.trim());
    if (dup) { setDuplicate(dup); return; }
    doAdd();
  }

  function doAdd() {
    onAdd(name.trim(), parseFloat(quantity) || 1, unit || undefined, {
      storageLocation: storageLocation || null,
      fridgeZone: storageLocation === "fridge" ? (fridgeZone || null) : null,
      foodCategory: foodCategory || null,
      expiresAt: expiresAt || null,
      assignedTo: assignedTo.length > 0 ? assignedTo : null,
      notes: notes.trim() || null,
    });
    clearFields();
  }

  async function handleMergeQty() {
    if (!duplicate) return;
    await increasePantryQty(duplicate.id, duplicate.quantity, parseFloat(quantity) || 1);
    clearFields();
  }

  function clearFields() {
    setName("");
    setQuantity("1");
    setUnit("");
    setNotes("");
    setStorageLocation("");
    setFridgeZone("");
    setFoodCategory("");
    setExpiresAt("");
    setAssignedTo([]);
    setShowSuggestions(false);
    setDuplicate(null);
    setAutoDetected(false);
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      nameRef.current?.focus();
    }, 700);
  }

  function toggleMember(userId: string) {
    setAssignedTo((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const showMemberPicker = members.length >= 2;
  const today = new Date().toISOString().split("T")[0];

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm"
      >
        {/* ── Name row ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <input
            ref={nameRef}
            type="text"
            placeholder="Add an item…"
            value={name}
            onChange={(e) => {
              const val = e.target.value;
              setName(val);
              setShowSuggestions(true);
              // Debounced auto-detect: fill storage + category if still empty
              if (autoDetectTimer.current) clearTimeout(autoDetectTimer.current);
              autoDetectTimer.current = setTimeout(() => {
                const hint = getPantryHint(val);
                if (hint) {
                  setStorageLocation((prev) => prev || hint.storage_location);
                  setFoodCategory((prev) => prev || hint.food_category);
                  if (hint.fridge_zone) setFridgeZone((prev) => prev || hint.fridge_zone!);
                  setAutoDetected(true);
                } else {
                  setAutoDetected(false);
                }
              }, 350);
            }}
            onFocus={() => {
              setExpanded(true);
              setShowSuggestions(true);
            }}
            className="flex-1 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none bg-transparent"
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
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 dark:bg-zinc-800 hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex-shrink-0 text-xs font-medium"
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
              className="overflow-hidden border-t border-gray-50 dark:border-zinc-800"
            >
              {suggestions.map((s) => (
                <button
                  key={s.name}
                  type="button"
                  // onMouseDown prevents the input from blurring before click fires
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  onTouchEnd={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 active:bg-gray-100 dark:active:bg-zinc-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{s.name}</span>
                  {s.storage_location && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {STORAGE_LOCATIONS.find((l) => l.value === s.storage_location)?.label}
                    </span>
                  )}
                  {s.food_category && !s.storage_location && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {FOOD_CATEGORIES.find((c) => c.value === s.food_category)?.label}
                    </span>
                  )}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Duplicate warning ─────────────────────────────────── */}
        <AnimatePresence>
          {duplicate && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mx-4 mb-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Already in pantry (×{duplicate.quantity})</p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleMergeQty}
                    className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg active:scale-[0.97]"
                  >Add to existing</button>
                  <button type="button" onClick={doAdd}
                    className="flex-1 py-1.5 bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-lg active:scale-[0.97]"
                  >Add as new entry</button>
                  <button type="button" onClick={() => setDuplicate(null)}
                    className="px-3 text-gray-400 dark:text-gray-500 text-xs active:opacity-60"
                  >Cancel</button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Expanded options ─────────────────────────────────── */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="options"
              initial={{ height: 0 }}
              animate={{ height: "auto" }}
              exit={{ height: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="border-t border-gray-100 dark:border-zinc-800 px-4 pb-4 pt-3 flex flex-col gap-4">

                {/* Auto-detect indicator */}
                <AnimatePresence>
                  {autoDetected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-violet-500 dark:text-violet-400 -mt-1">
                        <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                        </svg>
                        <span>Storage &amp; category auto-detected</span>
                        <button
                          type="button"
                          onClick={() => setAutoDetected(false)}
                          className="ml-auto opacity-50 hover:opacity-100 transition-opacity leading-none"
                          aria-label="Dismiss"
                        >×</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Quantity + unit */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Amount</p>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setQuantity(String(Math.max(0.5, (parseFloat(quantity) || 1) - 1)))}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-lg leading-none active:scale-90"
                    >−</button>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-12 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 outline-none border border-gray-200 dark:border-zinc-700 rounded-lg py-1 bg-transparent dark:bg-zinc-800"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity(String((parseFloat(quantity) || 1) + 1))}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-lg leading-none active:scale-90"
                    >+</button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMON_UNITS.map((u) => (
                      <button key={u} type="button" onClick={() => setUnit(unit === u ? "" : u)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          unit === u
                            ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        }`}>{u}</button>
                    ))}
                  </div>
                </div>

                {/* Storage location */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Storage</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STORAGE_LOCATIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setStorageLocation(storageLocation === value ? "" : value);
                          if (value !== "fridge") setFridgeZone("");
                          setAutoDetected(false);
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          storageLocation === value
                            ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Fridge zone */}
                <AnimatePresence>
                  {storageLocation === "fridge" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden flex flex-col gap-1.5"
                    >
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Fridge zone</p>
                      <div className="flex gap-1.5">
                        {FRIDGE_ZONES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setFridgeZone(fridgeZone === value ? "" : value)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                              fridgeZone === value
                                ? "bg-blue-600 text-white"
                                : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Food category */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Category</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FOOD_CATEGORIES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => { setFoodCategory(foodCategory === value ? "" : value); setAutoDetected(false); }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          foodCategory === value
                            ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Expiry date */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Expires</p>
                  {/* Single persistent input — never unmounts so the native picker
                      can't get killed by a React conditional re-render mid-session */}
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={expiresAt}
                      min={today}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                    />
                    <AnimatePresence mode="wait">
                      {expiresAt ? (
                        <motion.button
                          key="clear"
                          type="button"
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ duration: 0.12 }}
                          onClick={() => setExpiresAt("")}
                          className="flex-shrink-0 px-3 py-2 text-xs font-medium text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl active:scale-[0.96] transition-colors"
                        >
                          Clear
                        </motion.button>
                      ) : (() => {
                        const sugDays = getSuggestedExpiryDays(storageLocation, foodCategory);
                        if (sugDays === null) return null;
                        return (
                          <motion.button
                            key={`suggest-${storageLocation}-${foodCategory}`}
                            type="button"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.12 }}
                            onClick={() => {
                              const d = new Date();
                              d.setDate(d.getDate() + sugDays);
                              setExpiresAt(d.toISOString().split("T")[0]);
                            }}
                            className="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/40 active:scale-[0.96] transition-colors"
                          >
                            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                            </svg>
                            {formatSuggestedDays(sugDays)}
                          </motion.button>
                        );
                      })()}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Notes */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Note <span className="font-normal">(optional)</span></p>
                  <textarea
                    placeholder="Brand, location, anything useful…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 150))}
                    rows={2}
                    className="w-full text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-600 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors resize-none"
                  />
                  {notes.length >= 100 && (
                    <p className="text-[10px] text-right text-gray-400 dark:text-gray-500">{150 - notes.length} left</p>
                  )}
                </div>

                {/* Owned by */}
                {showMemberPicker && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-gray-400 dark:text-gray-500">For</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAssignedTo([])}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          assignedTo.length === 0
                            ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                            : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        Everyone
                      </button>
                      {members.map((m) => {
                        const isMe = m.user_id === currentUserId;
                        const selected = assignedTo.includes(m.user_id);
                        return (
                          <button
                            key={m.user_id}
                            type="button"
                            onClick={() => toggleMember(m.user_id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                              selected
                                ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                                : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                            }`}
                          >
                            {isMe ? "Me" : m.short_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
