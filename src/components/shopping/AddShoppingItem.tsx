"use client";

import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useItemSuggestions, type ItemSuggestion } from "@/hooks/useItemSuggestions";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import { checkShoppingDuplicate, increaseShoppingQty, getShoppingDuplicates } from "@/lib/checkShoppingDuplicate";
import { normalizeItemName } from "@/lib/normalizeItemName";
import AmountField from "@/components/ui/AmountField";
import { getPantryHint } from "@/lib/pantryHints";
import RecipeImportSheet from "@/components/shopping/RecipeImportSheet";
import {
  STORAGE_LOCATIONS,
  FOOD_CATEGORIES,
  SUPPLIES_LOCATIONS,
  SUPPLIES_CATEGORIES,
} from "@/types/database";

interface AddShoppingItemProps {
  onAdd: (name: string, quantity?: number, unit?: string, store?: string, assignedTo?: string[] | null, notes?: string) => void;
  householdId: string;
  members?: MemberProfile[];
  currentUserId?: string | null;
  /** Names already on the list — excluded from "recently bought" chips. */
  existingNames?: string[];
}

const STORAGE_LABEL = Object.fromEntries(
  [...STORAGE_LOCATIONS, ...SUPPLIES_LOCATIONS].map((l) => [l.value, l.label])
);
const CATEGORY_LABEL = Object.fromEntries(
  [...FOOD_CATEGORIES, ...SUPPLIES_CATEGORIES].map((c) => [c.value, c.label])
);

/**
 * "Where will this land?" preview — shown under the name input as the user
 * types. Reuses the existing pantryHints classifier; if it doesn't recognize
 * the name we render nothing rather than guessing wrong. (T2-A)
 */
function buildLandingPreview(name: string): string | null {
  const hint = getPantryHint(name);
  if (!hint) return null;
  const tab = hint.kind === "supplies" ? "Supplies" : "Pantry";
  const cat = CATEGORY_LABEL[hint.food_category];
  const loc = STORAGE_LABEL[hint.storage_location];
  return [tab, cat, loc].filter(Boolean).join(" · ");
}

const LAST_STORE_KEY = (householdId: string) => `last_store_${householdId}`;

// Minimal Web Speech API typings — the standard TS DOM lib doesn't ship
// them and we only need a tiny slice for voice-to-text.
interface ISpeechRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}
interface SpeechRecognitionCtor {
  new (): ISpeechRecognition;
}
interface SpeechRecognitionEvent {
  results: { [index: number]: { [alt: number]: { transcript: string } } };
}

export default function AddShoppingItem({ onAdd, householdId, members = [], currentUserId, existingNames = [] }: AddShoppingItemProps) {
  const [name, setName] = useState("");
  // Default qty "1" (T2-F): the empty-then-tap-+ dance was confusing.
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  // Last-store memory (T1-B): sessionStorage so adding 10 items to the
  // same trip doesn't require picking "Target" 10 times. Cleared on
  // session end so a new shopping trip the next day starts fresh.
  const [store, setStore] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem(LAST_STORE_KEY(householdId)) ?? "";
  });
  const [assignedTo, setAssignedTo] = useState<string[] | null>(null);
  const [notes, setNotes] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { getSuggestions, getRecent, getStores, saveStore, deleteStore, savedStores } = useItemSuggestions(householdId);
  const suggestions = getSuggestions(name, 5);
  const recentChips = name.trim() ? [] : getRecent(8, existingNames);
  const knownStores = getStores();
  const [customStoreMode, setCustomStoreMode] = useState(false);
  const [managingStores, setManagingStores] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);

  // Landing preview (T2-A): what will pantryHints route this to?
  const landingPreview = buildLandingPreview(name);

  // Recipe import sheet (T3-B)
  const [recipeSheetOpen, setRecipeSheetOpen] = useState(false);
  async function addFromRecipe(itemName: string, quantity?: number, unit?: string) {
    // Reuse onAdd — auto-detect kind/store happen inside useShoppingFlow.
    // Notes / member-assignment intentionally left empty for recipe imports.
    onAdd(itemName, quantity, unit, undefined, null, undefined);
  }

  // ── Voice input (T2-B) ────────────────────────────────────────────
  // Web Speech API is supported in Safari (iOS/macOS) and Chromium-based
  // browsers, but NOT Firefox. We feature-detect and only render the mic
  // button when it's available.
  const [voiceListening, setVoiceListening] = useState(false);
  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    setVoiceSupported(!!SR);
  }, []);

  function toggleVoice() {
    if (typeof window === "undefined") return;
    if (voiceListening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recog.lang = "en-US";
    recog.continuous = false;
    recog.interimResults = false;
    recog.maxAlternatives = 1;
    recog.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = e.results[0]?.[0]?.transcript ?? "";
      // Normalize spoken separators ("and") into commas so the existing
      // bulk-add parser can split a list naturally: "milk, eggs, and bread"
      // → "milk, eggs, bread"
      const cleaned = transcript
        .replace(/\b(and|plus|also)\b/gi, ",")
        .replace(/\s*,\s*,\s*/g, ", ")
        .trim();
      setName(cleaned);
      setExpanded(true);
    };
    recog.onend = () => { setVoiceListening(false); recognitionRef.current = null; };
    recog.onerror = () => { setVoiceListening(false); recognitionRef.current = null; };
    try {
      recog.start();
      recognitionRef.current = recog;
      setVoiceListening(true);
    } catch {
      // Already started or permission denied — ignore.
    }
  }

  // Multi-line / comma-separated parser for T1-E bulk-add.
  // Trim, split on commas or newlines, drop empties, cap at 20 to prevent
  // accidental megalists. Returns 0 or 1 items → treat as single-add.
  function parseBulkNames(raw: string): string[] {
    return raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  const bulkNames = parseBulkNames(name);
  const isBulk = bulkNames.length > 1;

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
    // Bulk-add path (T1-E): when the user pasted or typed multiple names
    // separated by commas or newlines, add them all in one go. We skip
    // the duplicate check here — the prompt would be confusing for many
    // items and the user is in "bulk" intent.
    if (isBulk) {
      doBulkAdd();
      return;
    }
    const dup = await checkShoppingDuplicate(householdId, name.trim());
    if (dup) { setDuplicate(dup); return; }
    doAdd();
  }

  /** Persist the chosen store for future adds in this session (T1-B). */
  function rememberStore() {
    if (typeof window === "undefined") return;
    const trimmed = store.trim();
    if (trimmed) {
      window.sessionStorage.setItem(LAST_STORE_KEY(householdId), trimmed);
    } else {
      window.sessionStorage.removeItem(LAST_STORE_KEY(householdId));
    }
  }

  function doAdd() {
    const qtyNum = quantity ? parseFloat(quantity) : undefined;
    onAdd(
      name.trim(),
      qtyNum && qtyNum > 0 ? qtyNum : undefined,
      unit || undefined,
      store.trim() || undefined,
      assignedTo,
      notes.trim() || undefined,
    );
    if (customStoreMode && store.trim()) saveStore(store.trim());
    rememberStore();
    // Reset name + qty/unit/notes but KEEP store (T1-B) and assignedTo —
    // those are sticky within a session because they're usually the
    // same for the next 8 items you add.
    setName(""); setQuantity("1"); setUnit(""); setNotes("");
    setShowSuggestions(false); setCustomStoreMode(false); setManagingStores(false); setDuplicate(null);
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); nameRef.current?.focus(); }, 700);
  }

  /**
   * Bulk-add: split the name input by commas/newlines, add each with the
   * shared metadata (qty / unit / store / assignedTo). Items already on the
   * list get their quantity bumped instead of duplicated (one bulk dedup
   * fetch, not a per-item warning). (T1-E)
   */
  async function doBulkAdd() {
    const qtyNum = quantity ? parseFloat(quantity) : undefined;
    const qtyToUse = qtyNum && qtyNum > 0 ? qtyNum : undefined;
    const dupes = await getShoppingDuplicates(householdId, bulkNames);
    for (const itemName of bulkNames) {
      const existing = dupes.get(normalizeItemName(itemName));
      if (existing) {
        await increaseShoppingQty(existing.id, existing.quantity, qtyToUse ?? 1);
      } else {
        onAdd(
          itemName,
          qtyToUse,
          unit || undefined,
          store.trim() || undefined,
          assignedTo,
          undefined, // notes intentionally not duplicated across bulk items
        );
      }
    }
    if (customStoreMode && store.trim()) saveStore(store.trim());
    rememberStore();
    setName(""); setQuantity("1"); setUnit(""); setNotes("");
    setShowSuggestions(false); setCustomStoreMode(false); setManagingStores(false); setDuplicate(null);
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); nameRef.current?.focus(); }, 700);
  }

  async function handleIncreaseQty() {
    if (!duplicate) return;
    await increaseShoppingQty(duplicate.id, duplicate.quantity, quantity ? parseFloat(quantity) : 1);
    setDuplicate(null);
    setName(""); setQuantity("1"); setUnit(""); setStore(""); setAssignedTo(null);
    collapse();
  }

  return (
    <div ref={containerRef} className="relative">
      <form
        onSubmit={handleSubmit}
        className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm"
      >
        {/* ── Name row ─────────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-3.5">
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
            className="flex-1 min-w-0 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none bg-transparent"
          />

          {/* Amount preview chip — visible when collapsed and amount differs
              from the default of "1". With default qty "1" (T2-F) we hide
              the chip unless the user explicitly customized it. */}
          <AnimatePresence initial={false}>
            {!expanded && ((quantity && quantity !== "1") || unit) && (
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.12 }}
                className="flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-xs font-medium text-gray-600 dark:text-gray-300 flex-shrink-0"
              >
                {[quantity, unit].filter(Boolean).join(" ")}
                <button type="button" onClick={(e) => { e.stopPropagation(); setQuantity("1"); setUnit(""); }}
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors text-gray-400">×</button>
              </motion.span>
            )}
          </AnimatePresence>

          {/* Voice / mic button (T2-B) — only when the browser supports it.
              While listening, pulses red. Tap again to stop. */}
          {voiceSupported && (
            <motion.button
              type="button"
              onClick={toggleVoice}
              whileTap={{ scale: 0.88 }}
              animate={voiceListening ? {
                backgroundColor: ["#dc2626", "#fca5a5", "#dc2626"],
                transition: { duration: 1.1, repeat: Infinity },
              } : { backgroundColor: "#f3f4f6" }}
              className={`w-8 h-8 flex items-center justify-center rounded-xl flex-shrink-0 ${
                voiceListening ? "text-white" : "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-zinc-800"
              }`}
              aria-label={voiceListening ? "Stop listening" : "Speak items"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 1.5a3 3 0 00-3 3v7.5a3 3 0 006 0V4.5a3 3 0 00-3-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 11.5a7 7 0 0014 0M12 18.5v3" />
              </svg>
            </motion.button>
          )}

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

        {/* ── Recently-bought chips — empty-state shortcut (T1-D) ─── */}
        <AnimatePresence>
          {showSuggestions && !name.trim() && recentChips.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className="overflow-hidden border-t border-gray-50 dark:border-zinc-800"
            >
              <div className="px-4 py-3 flex flex-col gap-2">
                <p className="text-[10px] font-semibold tracking-wider uppercase text-gray-400 dark:text-gray-500">Recently bought</p>
                <div className="flex flex-wrap gap-1.5">
                  {recentChips.map((s) => (
                    <button
                      key={s.name}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
                      onTouchEnd={(e) => { e.preventDefault(); applySuggestion(s); }}
                      className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-[0.94]"
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Landing preview (T2-A): "→ Pantry · Dairy · Fridge" ─── */}
        <AnimatePresence>
          {!isBulk && landingPreview && name.trim() && (
            <motion.div
              key="landing"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-t border-gray-50 dark:border-zinc-800"
            >
              <p className="px-4 py-2 text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
                {landingPreview}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Bulk-add preview (T1-E) ──────────────────────────── */}
        <AnimatePresence>
          {isBulk && (
            <motion.div
              key="bulk-preview"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden border-t border-gray-50 dark:border-zinc-800"
            >
              <div className="px-4 py-3 flex flex-col gap-2 bg-blue-50/40 dark:bg-blue-950/20">
                <p className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {bulkNames.length} items detected — tap + to add all
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {bulkNames.map((n, i) => (
                    <span
                      key={`${n}-${i}`}
                      className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/50 text-gray-700 dark:text-gray-200"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              </div>
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
                {/* Amount: stepper + unit chips (shared, T1-A unification) */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Amount</p>
                  <AmountField quantity={quantity} unit={unit} onQuantityChange={setQuantity} onUnitChange={setUnit} size="sm" />
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

      {/* "+ From recipe" entry (T3-B) — tiny subtle link below the form so
          it's discoverable without crowding the primary add input. */}
      <div className="flex justify-center mt-2">
        <button
          type="button"
          onClick={() => setRecipeSheetOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:scale-95"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2zM9 7h6M9 11h6M9 15h4" />
          </svg>
          Add from a recipe
        </button>
      </div>

      <RecipeImportSheet
        open={recipeSheetOpen}
        onClose={() => setRecipeSheetOpen(false)}
        onAdd={addFromRecipe}
      />
    </div>
  );
}
