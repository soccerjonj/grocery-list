"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useItemSuggestions, type ItemSuggestion } from "@/hooks/useItemSuggestions";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import { checkShoppingDuplicate, increaseShoppingQty } from "@/lib/checkShoppingDuplicate";

interface AddShoppingItemProps {
  onAdd: (name: string, quantity?: number, unit?: string, store?: string, assignedTo?: string[] | null, notes?: string) => void;
  householdId: string;
  members?: MemberProfile[];
  currentUserId?: string | null;
}

const COMMON_UNITS = ["kg", "g", "lb", "oz", "L", "mL", "pack", "can", "bag", "box", "bottle"];

export default function AddShoppingItem({ onAdd, householdId, members = [], currentUserId }: AddShoppingItemProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [store, setStore] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[] | null>(null);
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { getSuggestions, getStores, saveStore, deleteStore, savedStores } = useItemSuggestions(householdId);
  const suggestions = getSuggestions(name, 5);
  const knownStores = getStores();
  const [customStoreMode, setCustomStoreMode] = useState(false);
  const [managingStores, setManagingStores] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);

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
    if (s.store) { setStore(s.store); setCustomStoreMode(false); }
    if (s.unit) setUnit(s.unit);
    setShowSuggestions(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function collapse() {
    setExpanded(false);
    setShowSuggestions(false);
    nameRef.current?.blur();
  }

  function toggleMember(userId: string) {
    setAssignedTo((prev) => {
      const current = prev ?? [];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return next.length === 0 ? null : next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const dup = await checkShoppingDuplicate(householdId, name.trim());
    if (dup) { setDuplicate(dup); return; }
    doAdd();
  }

  function doAdd() {
    onAdd(name.trim(), quantity ? parseFloat(quantity) : undefined, unit || undefined, store.trim() || undefined, assignedTo, notes.trim() || undefined);
    setName(""); setQuantity(""); setUnit(""); setStore(""); setAssignedTo(null); setNotes("");
    if (customStoreMode && store.trim()) saveStore(store.trim());
    setShowSuggestions(false); setCustomStoreMode(false); setManagingStores(false); setDuplicate(null);
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); nameRef.current?.focus(); }, 700);
  }

  async function handleIncreaseQty() {
    if (!duplicate) return;
    await increaseShoppingQty(duplicate.id, duplicate.quantity, quantity ? parseFloat(quantity) : 1);
    setDuplicate(null);
    setName(""); setQuantity(""); setUnit(""); setStore(""); setAssignedTo(null);
    collapse();
  }

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm"
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
            className="flex-1 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none bg-transparent"
          />

          {/* Amount preview chip — visible when collapsed and amount is set */}
          <AnimatePresence initial={false}>
            {!expanded && (quantity || unit) && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0"
              >
                {[quantity, unit].filter(Boolean).join(" ")}
                <button type="button" onClick={(e) => { e.stopPropagation(); setQuantity(""); setUnit(""); }}
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-gray-400">×</button>
              </motion.span>
            )}
          </AnimatePresence>

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
                  onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                  onTouchEnd={(e) => { e.preventDefault(); applySuggestion(s); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 active:bg-gray-100 dark:active:bg-zinc-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{s.name}</span>
                  {s.store && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 truncate max-w-[100px]">{s.store}</span>
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
              <div className="flex flex-col gap-2 px-4 pb-4 pt-3 border-t border-gray-100 dark:border-zinc-800">
                {duplicate && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col gap-2">
                    <p className="text-xs font-semibold text-amber-700">Already on the list (×{duplicate.quantity})</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={handleIncreaseQty}
                        className="flex-1 py-1.5 bg-amber-500 text-white text-xs font-medium rounded-lg active:scale-[0.97]"
                      >Increase qty</button>
                      <button type="button" onClick={doAdd}
                        className="flex-1 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg active:scale-[0.97]"
                      >Add anyway</button>
                      <button type="button" onClick={() => setDuplicate(null)}
                        className="px-3 text-gray-400 text-xs active:opacity-60"
                      >Cancel</button>
                    </div>
                  </div>
                )}
                {/* Amount: stepper + unit chips */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Amount</p>
                  <div className="flex items-center gap-1.5">
                    <button type="button"
                      onClick={() => { const n = (parseFloat(quantity) || 1) - 1; setQuantity(n <= 0 ? "" : String(n)); }}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 text-lg leading-none active:scale-90 transition-transform">−</button>
                    <input type="number" min="1" step="any" placeholder="—"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      className="w-12 text-center text-sm font-semibold text-gray-900 dark:text-gray-100 outline-none border border-gray-200 dark:border-zinc-700 rounded-lg py-1 bg-transparent dark:bg-zinc-800 placeholder:text-gray-300 dark:placeholder:text-zinc-600" />
                    <button type="button"
                      onClick={() => setQuantity(String((parseFloat(quantity) || 0) + 1))}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-lg leading-none active:scale-90 transition-transform">+</button>
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
                {/* Note */}
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Note <span className="font-normal">(optional)</span></p>
                  <textarea
                    placeholder="Brand, where to find it…"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 150))}
                    rows={2}
                    className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 resize-none transition-colors placeholder:text-gray-300 dark:placeholder:text-zinc-600"
                  />
                  {notes.length >= 100 && (
                    <p className="text-[10px] text-gray-300 dark:text-zinc-600 text-right">{150 - notes.length} left</p>
                  )}
                </div>

                {/* Store picker */}
                <div className="flex flex-wrap gap-1.5">
                  {knownStores.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { if (!managingStores) { setStore(store === s ? "" : s); setCustomStoreMode(false); } }}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        store === s && !managingStores ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {s}
                      {managingStores && (
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); deleteStore(s); if (store === s) setStore(""); }}
                          className="ml-0.5 text-gray-400 hover:text-red-500"
                        >×</span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setCustomStoreMode((v) => !v); setManagingStores(false); if (customStoreMode) setStore(""); }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                      customStoreMode ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                    }`}
                  >{knownStores.length === 0 ? "Add store" : "+ New"}</button>
                  {knownStores.length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setManagingStores((v) => !v); setCustomStoreMode(false); }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        managingStores ? "bg-red-50 dark:bg-red-900/30 text-red-400" : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >{managingStores ? "Done" : "Edit"}</button>
                  )}
                </div>
                {customStoreMode && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Store name"
                      value={store}
                      onChange={(e) => setStore(e.target.value)}
                      autoFocus
                      className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2.5 py-1.5 outline-none"
                    />
                    {store.trim() && (
                      <button
                        type="button"
                        onClick={() => { saveStore(store.trim()); setCustomStoreMode(false); }}
                        className="px-3 py-1.5 rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-xs font-medium active:scale-[0.94]"
                      >Save</button>
                    )}
                  </div>
                )}
                {members.length > 1 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-xs text-gray-400 dark:text-gray-500 font-medium mr-0.5">For:</span>
                    <button
                      type="button"
                      onClick={() => setAssignedTo(null)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        !assignedTo || assignedTo.length === 0
                          ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                          : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                      }`}
                    >
                      Everyone
                    </button>
                    {members.map((m) => {
                      const selected = !!assignedTo?.includes(m.user_id);
                      const color = m.color ?? DEFAULT_COLOR;
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => toggleMember(m.user_id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                          style={
                            selected
                              ? { backgroundColor: color, color: "#fff" }
                              : { backgroundColor: hexAlpha(color, 0.1), color }
                          }
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                            style={selected ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: hexAlpha(color, 0.2) }}
                          >
                            {m.initials}
                          </span>
                          {m.user_id === currentUserId ? "Me" : m.short_name}
                        </button>
                      );
                    })}
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
