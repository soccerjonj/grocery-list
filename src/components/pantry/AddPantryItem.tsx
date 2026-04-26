"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { useItemSuggestions, type ItemSuggestion } from "@/hooks/useItemSuggestions";
import { STORAGE_LOCATIONS, FRIDGE_ZONES, FOOD_CATEGORIES } from "@/types/database";
import { checkPantryDuplicate, increasePantryQty } from "@/lib/checkPantryDuplicate";

interface AddPantryItemProps {
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  members: MemberProfile[];
  currentUserId: string | null;
  householdId: string;
  existingNames: string[];
}

function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

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

  const [storageLocation, setStorageLocation] = useState<string>("");
  const [fridgeZone, setFridgeZone] = useState<string>("");
  const [foodCategory, setFoodCategory] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);

  const [submitted, setSubmitted] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);

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

  function collapse() {
    setExpanded(false);
    setShowSuggestions(false);
    nameRef.current?.blur();
  }

  function applySuggestion(s: ItemSuggestion) {
    setName(s.name);
    if (s.storage_location) setStorageLocation(s.storage_location);
    if (s.fridge_zone) setFridgeZone(s.fridge_zone);
    if (s.food_category) setFoodCategory(s.food_category);
    setShowSuggestions(false);
    // Focus back so user can continue editing or submit
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const dup = await checkPantryDuplicate(householdId, name.trim());
    if (dup) { setDuplicate(dup); return; }
    doAdd();
  }

  function doAdd() {
    onAdd(name.trim(), parseFloat(quantity) || 1, undefined, {
      storageLocation: storageLocation || null,
      fridgeZone: storageLocation === "fridge" ? (fridgeZone || null) : null,
      foodCategory: foodCategory || null,
      expiresAt: expiresAt || null,
      assignedTo: assignedTo.length > 0 ? assignedTo : null,
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
    setStorageLocation("");
    setFridgeZone("");
    setFoodCategory("");
    setExpiresAt("");
    setAssignedTo([]);
    setShowSuggestions(false);
    setDuplicate(null);
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
        className="bg-white rounded-2xl border border-gray-100 shadow-sm"
      >
        {/* ── Name row ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-3.5">
          <input
            ref={nameRef}
            type="text"
            placeholder="Add an item…"
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
                  // onMouseDown prevents the input from blurring before click fires
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  onTouchEnd={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-700 flex-1 truncate">{s.name}</span>
                  {s.storage_location && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
                      {STORAGE_LOCATIONS.find((l) => l.value === s.storage_location)?.label}
                    </span>
                  )}
                  {s.food_category && !s.storage_location && (
                    <span className="text-xs text-gray-400 flex-shrink-0">
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
              <div className="mx-4 mb-2 bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
                <p className="text-xs font-semibold text-amber-700">Already in pantry (×{duplicate.quantity})</p>
                <div className="flex gap-2">
                  <button type="button" onClick={handleMergeQty}
                    className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg active:scale-[0.97]"
                  >Add to existing</button>
                  <button type="button" onClick={doAdd}
                    className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg active:scale-[0.97]"
                  >Add as new entry</button>
                  <button type="button" onClick={() => setDuplicate(null)}
                    className="px-3 text-gray-400 text-xs active:opacity-60"
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
              <div className="border-t border-gray-100 px-4 pb-4 pt-3 flex flex-col gap-4">

                {/* Quantity */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setQuantity(String(Math.max(0.5, (parseFloat(quantity) || 1) - 1)))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-lg leading-none active:scale-90"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-12 text-center text-sm font-semibold text-gray-900 outline-none border border-gray-200 rounded-lg py-1 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity(String((parseFloat(quantity) || 1) + 1))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-lg leading-none active:scale-90"
                  >
                    +
                  </button>
                </div>

                {/* Storage location */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Storage</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STORAGE_LOCATIONS.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setStorageLocation(storageLocation === value ? "" : value);
                          if (value !== "fridge") setFridgeZone("");
                        }}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          storageLocation === value
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fridge zone</p>
                      <div className="flex gap-1.5">
                        {FRIDGE_ZONES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setFridgeZone(fridgeZone === value ? "" : value)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                              fridgeZone === value
                                ? "bg-blue-600 text-white"
                                : "bg-blue-50 text-blue-600 hover:bg-blue-100"
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
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FOOD_CATEGORIES.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFoodCategory(foodCategory === value ? "" : value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          foodCategory === value
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Expiry date */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Expires</p>
                  {expiresAt ? (
                    <div className="inline-flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5 self-start">
                      <svg className="w-3.5 h-3.5 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <label className="relative text-xs font-medium text-green-700 cursor-pointer">
                        {formatDateDisplay(expiresAt)}
                        <input type="date" value={expiresAt} min={today} onChange={(e) => setExpiresAt(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                      </label>
                      <button type="button" onClick={() => setExpiresAt("")} className="text-green-500 hover:text-green-700 transition-colors ml-0.5" aria-label="Clear date">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors self-start cursor-pointer relative">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Add expiry date
                      <input type="date" value={expiresAt} min={today} onChange={(e) => setExpiresAt(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                    </label>
                  )}
                </div>

                {/* Owned by */}
                {showMemberPicker && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">For</p>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAssignedTo([])}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                          assignedTo.length === 0
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                                ? "bg-gray-900 text-white"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
