"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
}: AddPantryItemProps) {
  // ── Inline name input
  const [name, setName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Detail fields
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [fridgeZone, setFridgeZone] = useState("");
  const [foodCategory, setFoodCategory] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [autoDetected, setAutoDetected] = useState(false);

  // ── Duplicate
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);
  const [conflictAction, setConflictAction] = useState<"merge" | "add">("merge");

  const nameRef = useRef<HTMLInputElement>(null);
  const autoDetectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getSuggestions } = useItemSuggestions(householdId);
  const suggestions = getSuggestions(name, 5);
  const today = new Date().toISOString().split("T")[0];
  const showMemberPicker = members.length >= 2;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    document.body.style.overflow = sheetOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [sheetOpen]);

  // ── Name change with debounced auto-detect
  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setName(val);
    setShowSuggestions(true);
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
  }

  // ── Open detail sheet (flush auto-detect, kick off dup check)
  function openSheet(overrideName?: string) {
    const n = (overrideName ?? name).trim();
    if (!n) return;

    // Flush pending auto-detect so chips are ready before sheet animates in
    if (autoDetectTimer.current) {
      clearTimeout(autoDetectTimer.current);
      autoDetectTimer.current = null;
    }
    const hint = getPantryHint(n);
    if (hint) {
      setStorageLocation((prev) => prev || hint.storage_location);
      setFoodCategory((prev) => prev || hint.food_category);
      if (hint.fridge_zone) setFridgeZone((prev) => prev || hint.fridge_zone!);
      setAutoDetected(true);
    }

    setShowSuggestions(false);
    setSheetOpen(true);
    checkPantryDuplicate(householdId, n).then((dup) => {
      setDuplicate(dup);
      if (dup) setConflictAction("merge");
    });
  }

  // ── Suggestion tapped: fill fields + immediately open sheet
  function applySuggestion(s: ItemSuggestion) {
    let sl = s.storage_location || "";
    let fz = s.fridge_zone || "";
    let fc = s.food_category || "";
    if (!sl || !fc) {
      const hint = getPantryHint(s.name);
      if (hint) {
        if (!sl) sl = hint.storage_location;
        if (!fc) fc = hint.food_category;
        if (hint.fridge_zone && !fz) fz = hint.fridge_zone;
      }
    }
    setName(s.name);
    if (s.unit) setUnit(s.unit);
    setStorageLocation(sl);
    setFridgeZone(fz);
    setFoodCategory(fc);
    if (sl || fc) setAutoDetected(true);
    setShowSuggestions(false);
    // setTimeout lets React flush the state updates above before openSheet reads them
    setTimeout(() => {
      setSheetOpen(true);
      checkPantryDuplicate(householdId, s.name.trim()).then((dup) => {
        setDuplicate(dup);
        if (dup) setConflictAction("merge");
      });
    }, 0);
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    openSheet();
  }

  function closeSheet() {
    setSheetOpen(false);
    setDuplicate(null);
  }

  function clearFields() {
    setName("");
    setQuantity("1");
    setUnit("");
    setStorageLocation("");
    setFridgeZone("");
    setFoodCategory("");
    setExpiresAt("");
    setNotes("");
    setAssignedTo([]);
    setAutoDetected(false);
    setDuplicate(null);
  }

  async function handleAdd() {
    if (!name.trim()) return;
    if (duplicate && conflictAction === "merge") {
      await increasePantryQty(
        duplicate.id,
        duplicate.quantity,
        parseFloat(quantity) || 1,
        {
          storageLocation: storageLocation || null,
          fridgeZone: storageLocation === "fridge" ? (fridgeZone || null) : null,
          foodCategory: foodCategory || null,
        }
      );
    } else {
      onAdd(name.trim(), parseFloat(quantity) || 1, unit || undefined, {
        storageLocation: storageLocation || null,
        fridgeZone: storageLocation === "fridge" ? (fridgeZone || null) : null,
        foodCategory: foodCategory || null,
        expiresAt: expiresAt || null,
        assignedTo: assignedTo.length > 0 ? assignedTo : null,
        notes: notes.trim() || null,
      });
    }
    setSheetOpen(false);
    clearFields();
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

  // ── Detail sheet (portal)
  const sheet = mounted
    ? createPortal(
        <AnimatePresence>
          {sheetOpen && (
            <>
              <motion.div
                key="add-pantry-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-50 bg-black/50"
                onClick={closeSheet}
              />

              <motion.div
                key="add-pantry-sheet"
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 380, damping: 40 }}
                className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col"
                style={{ maxHeight: "92dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
              >
                {/* Handle */}
                <div className="flex justify-center pt-3.5 pb-1 flex-shrink-0">
                  <div className="w-10 h-[5px] bg-gray-200 dark:bg-zinc-700 rounded-full" />
                </div>

                {/* Header */}
                <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-zinc-800">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{name}</h2>
                      {autoDetected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/30 text-[10px] font-medium text-violet-500 dark:text-violet-400 flex-shrink-0">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                          </svg>
                          Auto-detected
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Review details, then add to pantry</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeSheet}
                    className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 flex flex-col gap-5">

                  {/* Duplicate warning */}
                  {duplicate && (
                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-4 py-3 flex flex-col gap-2.5">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Already in pantry (×{duplicate.quantity})
                      </p>
                      <div className="flex gap-2">
                        <button type="button"
                          onClick={() => setConflictAction("merge")}
                          className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors active:scale-[0.97] ${conflictAction === "merge" ? "bg-amber-500 text-white" : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700"}`}
                        >Add to existing</button>
                        <button type="button"
                          onClick={() => setConflictAction("add")}
                          className={`flex-1 py-2 text-xs font-medium rounded-xl transition-colors active:scale-[0.97] ${conflictAction === "add" ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700"}`}
                        >Add as new entry</button>
                      </div>
                    </div>
                  )}

                  {/* Amount */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Amount</p>
                    <div className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => setQuantity(String(Math.max(0.5, (parseFloat(quantity) || 1) - 1)))}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-lg leading-none active:scale-90 transition-transform flex-shrink-0"
                      >−</button>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="w-14 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 outline-none border border-gray-200 dark:border-zinc-700 rounded-xl py-2 bg-transparent dark:bg-zinc-800"
                      />
                      <button type="button"
                        onClick={() => setQuantity(String((parseFloat(quantity) || 1) + 1))}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-lg leading-none active:scale-90 transition-transform flex-shrink-0"
                      >+</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {COMMON_UNITS.map((u) => (
                        <button key={u} type="button"
                          onClick={() => setUnit(unit === u ? "" : u)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${unit === u ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                        >{u}</button>
                      ))}
                    </div>
                  </div>

                  {/* Storage */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Storage</p>
                    <div className="flex flex-wrap gap-1.5">
                      {STORAGE_LOCATIONS.map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => {
                            setStorageLocation(storageLocation === value ? "" : value);
                            if (value !== "fridge") setFridgeZone("");
                            setAutoDetected(false);
                          }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${storageLocation === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                        >{label}</button>
                      ))}
                    </div>
                    <AnimatePresence initial={false}>
                      {storageLocation === "fridge" && (
                        <motion.div
                          key="fridge-zone"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.18 }}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-1.5 pt-1">
                            {FRIDGE_ZONES.map(({ value, label }) => (
                              <button key={value} type="button"
                                onClick={() => setFridgeZone(fridgeZone === value ? "" : value)}
                                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${fridgeZone === value ? "bg-blue-600 text-white" : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"}`}
                              >{label}</button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Category */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Category</p>
                    <div className="flex flex-wrap gap-1.5">
                      {FOOD_CATEGORIES.map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => { setFoodCategory(foodCategory === value ? "" : value); setAutoDetected(false); }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${foodCategory === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Expiry */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Expires</p>
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
                          <motion.button key="clear" type="button"
                            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
                            transition={{ duration: 0.12 }}
                            onClick={() => setExpiresAt("")}
                            className="flex-shrink-0 px-3 py-2 text-xs font-medium text-red-400 bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 rounded-xl active:scale-[0.96] transition-colors"
                          >Clear</motion.button>
                        ) : (() => {
                          const sugDays = getSuggestedExpiryDays(storageLocation, foodCategory);
                          if (!sugDays) return null;
                          return (
                            <motion.button key={`sug-${storageLocation}-${foodCategory}`} type="button"
                              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
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
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      Note <span className="font-normal normal-case">(optional)</span>
                    </p>
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

                  {/* Assigned to */}
                  {showMemberPicker && (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">For</p>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button"
                          onClick={() => setAssignedTo([])}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${assignedTo.length === 0 ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                        >Everyone</button>
                        {members.map((m) => {
                          const selected = assignedTo.includes(m.user_id);
                          return (
                            <button key={m.user_id} type="button"
                              onClick={() => toggleMember(m.user_id)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${selected ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                            >{m.user_id === currentUserId ? "Me" : m.short_name}</button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleAdd}
                    className="w-full py-3.5 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    {duplicate && conflictAction === "merge" ? "Add to existing item" : "Add to pantry"}
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )
    : null;

  return (
    <div className="relative">
      {/* ── Inline name input ───────────────────────────── */}
      <form
        onSubmit={handleNameSubmit}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm"
      >
        <div className="flex items-center gap-3 px-4 py-3.5">
          <input
            ref={nameRef}
            type="text"
            placeholder="Add an item…"
            value={name}
            onChange={handleNameChange}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="flex-1 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none bg-transparent"
          />

          {/* → button: opens detail sheet */}
          <motion.button
            type="submit"
            disabled={!name.trim() || submitted}
            whileTap={{ scale: 0.88 }}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-30 flex-shrink-0 overflow-hidden transition-opacity"
          >
            <AnimatePresence mode="wait" initial={false}>
              {submitted ? (
                <motion.svg key="check" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </motion.svg>
              ) : (
                <motion.svg key="arrow" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ duration: 0.15 }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </motion.svg>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Autocomplete suggestions */}
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
                <button key={s.name} type="button"
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
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>

      {sheet}
    </div>
  );
}
