"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { useItemSuggestions, type ItemSuggestion } from "@/hooks/useItemSuggestions";
import { STORAGE_LOCATIONS, FRIDGE_ZONES, FOOD_CATEGORIES, SUPPLIES_LOCATIONS, SUPPLIES_CATEGORIES, type Kind } from "@/types/database";
import { checkPantryDuplicate, increasePantryQty } from "@/lib/checkPantryDuplicate";
import { getPantryHint, getOrClassify, getSuggestedExpiryDays, formatSuggestedDays } from "@/lib/pantryHints";
import AmountField from "@/components/ui/AmountField";
import BarcodeScanner from "@/components/pantry/BarcodeScanner";
import { lookupBarcode } from "@/lib/openFoodFacts";
import ReceiptImportButton from "@/components/pantry/ReceiptImportButton";

interface AddPantryItemProps {
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  members: MemberProfile[];
  currentUserId: string | null;
  householdId: string;
  existingNames: string[];
  /** Active pantry tab — drives default kind and chip vocabularies. */
  kind: Kind;
}

// Common units now live in `AmountField`. Kept here only when callers
// need to override the chip list.

export default function AddPantryItem({
  onAdd,
  members,
  currentUserId,
  householdId,
  kind: tabKind,
}: AddPantryItemProps) {
  // ── Inline name input
  const [name, setName] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // ── Sheet
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // ── Detail fields. Quantity defaults to "1" (T2-F).
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [fridgeZone, setFridgeZone] = useState("");
  const [foodCategory, setFoodCategory] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [autoDetected, setAutoDetected] = useState(false);
  // True while the async AI classifier is resolving (after the instant
  // keyword pass missed) so we can show a quiet "detecting…" hint.
  const [classifying, setClassifying] = useState(false);
  // Resolved kind for this draft. Defaults to the active tab; pantryHints can
  // override (e.g. user is on Food but types "toothpaste"). When kind flips
  // due to detection, we set kindAutoDetected so we can show a small chip the
  // user can tap to revert.
  const [kind, setKind] = useState<Kind>(tabKind);
  const [kindAutoDetected, setKindAutoDetected] = useState(false);
  // Keep kind in sync if the parent tab changes while the sheet is closed
  useEffect(() => {
    if (!sheetOpen) {
      setKind(tabKind);
      setKindAutoDetected(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabKind]);

  // ── Duplicate
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);
  const [conflictAction, setConflictAction] = useState<"merge" | "add">("merge");

  // ── Barcode scanner (T3-C)
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanLookupBusy, setScanLookupBusy] = useState(false);

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

  // ── Name change with debounced auto-detect.
  // Keyword classifier (pantryHints) runs first and synchronously. If it
  // returns null, fall through to the AI classifier (T3-D) — it's a
  // network call but the result is cached server-side after first hit.
  function applyHint(hint: ReturnType<typeof getPantryHint>) {
    if (!hint) {
      setAutoDetected(false);
      return;
    }
    if (hint.kind !== kind) {
      setKind(hint.kind);
      setKindAutoDetected(true);
      setStorageLocation(hint.storage_location);
      setFoodCategory(hint.food_category);
      setFridgeZone(hint.fridge_zone ?? "");
    } else {
      setStorageLocation((prev) => prev || hint.storage_location);
      setFoodCategory((prev) => prev || hint.food_category);
      if (hint.fridge_zone) setFridgeZone((prev) => prev || hint.fridge_zone!);
    }
    setAutoDetected(true);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setName(val);
    setShowSuggestions(true);
    if (autoDetectTimer.current) clearTimeout(autoDetectTimer.current);
    autoDetectTimer.current = setTimeout(async () => {
      const local = getPantryHint(val);
      if (local) {
        applyHint(local);
        return;
      }
      // Fallback: ask the server-side AI classifier (T3-D). Use the
      // current input as the cancellation token — if the user has
      // typed more by the time the network call resolves, ignore it.
      const tokenAtRequest = val.trim();
      setClassifying(true);
      const ai = await getOrClassify(val);
      setClassifying(false);
      // Stale-response guard: bail if the user has edited the name in
      // the meantime. If the sheet is already open, applyHint still flows
      // the late result into the open form (storage/category fill in).
      if (!ai) {
        setAutoDetected(false);
        return;
      }
      if (nameRef.current && nameRef.current.value.trim() !== tokenAtRequest) return;
      applyHint(ai);
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
      if (hint.kind !== kind) {
        setKind(hint.kind);
        setKindAutoDetected(true);
        setStorageLocation(hint.storage_location);
        setFoodCategory(hint.food_category);
        setFridgeZone(hint.fridge_zone ?? "");
      } else {
        setStorageLocation((prev) => prev || hint.storage_location);
        setFoodCategory((prev) => prev || hint.food_category);
        if (hint.fridge_zone) setFridgeZone((prev) => prev || hint.fridge_zone!);
      }
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
    let resolvedKind: Kind = kind;
    const hint = !sl || !fc ? getPantryHint(s.name) : null;
    if (hint) {
      if (!sl) sl = hint.storage_location;
      if (!fc) fc = hint.food_category;
      if (hint.fridge_zone && !fz) fz = hint.fridge_zone;
      if (hint.kind !== kind) {
        resolvedKind = hint.kind;
        setKind(hint.kind);
        setKindAutoDetected(true);
      }
    }
    setName(s.name);
    if (s.unit) setUnit(s.unit);
    setStorageLocation(sl);
    setFridgeZone(resolvedKind === "supplies" ? "" : fz);
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

  /**
   * Called when the barcode scanner detects a code (T3-C). We:
   *   1. Look up the barcode against OpenFoodFacts (free, public).
   *   2. Pre-fill name, qty, unit from the response.
   *   3. Fall through to pantryHints / kind detection in openSheet().
   *   4. If the barcode isn't in OFF, we still open the sheet but with an
   *      empty name — the user can type. Better than a dead-end.
   */
  async function handleBarcodeDetect(code: string) {
    setScannerOpen(false);
    setScanLookupBusy(true);
    try {
      const product = await lookupBarcode(code);
      if (product?.name) {
        setName(product.name);
        if (product.unit) setUnit(product.unit);
        if (product.quantity) setQuantity(String(product.quantity));
        // If OFF returned a strong category hint, let it seed kind; the
        // existing openSheet logic will further refine via pantryHints.
        if (product.categoryHint && product.categoryHint !== kind) {
          setKind(product.categoryHint);
          setKindAutoDetected(true);
        }
        // Defer openSheet by a microtask so the state updates flush first.
        setTimeout(() => openSheet(product.name), 0);
      } else {
        // No match — open the sheet anyway with the barcode as a placeholder
        // hint. User can rename.
        setName("");
        nameRef.current?.focus();
      }
    } finally {
      setScanLookupBusy(false);
    }
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
    setKind(tabKind);
    setKindAutoDetected(false);
  }

  async function handleAdd() {
    if (!name.trim()) return;
    const isSupplies = kind === "supplies";
    if (duplicate && conflictAction === "merge") {
      await increasePantryQty(
        duplicate.id,
        duplicate.quantity,
        parseFloat(quantity) || 1,
        {
          kind,
          storageLocation: storageLocation || null,
          fridgeZone: !isSupplies && storageLocation === "fridge" ? (fridgeZone || null) : null,
          foodCategory: foodCategory || null,
        }
      );
    } else {
      onAdd(name.trim(), parseFloat(quantity) || 1, unit || undefined, {
        kind,
        storageLocation: storageLocation || null,
        fridgeZone: !isSupplies && storageLocation === "fridge" ? (fridgeZone || null) : null,
        foodCategory: foodCategory || null,
        // Supplies don't expire — drop any value the user might have set
        expiresAt: isSupplies ? null : (expiresAt || null),
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
                      {classifying && !autoDetected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-[10px] font-medium text-gray-400 dark:text-gray-500 flex-shrink-0">
                          <span className="w-2.5 h-2.5 border-[1.5px] border-gray-300 dark:border-zinc-600 border-t-gray-500 dark:border-t-zinc-300 rounded-full animate-spin" />
                          Detecting…
                        </span>
                      )}
                      {autoDetected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-950/30 text-[10px] font-medium text-violet-500 dark:text-violet-400 flex-shrink-0">
                          <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
                          </svg>
                          Auto-detected
                        </span>
                      )}
                      {kindAutoDetected && (
                        <button
                          type="button"
                          onClick={() => {
                            // User taps to revert kind back to the active tab
                            setKind(tabKind);
                            setKindAutoDetected(false);
                            setStorageLocation("");
                            setFridgeZone("");
                            setFoodCategory("");
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-[10px] font-medium text-amber-600 dark:text-amber-400 flex-shrink-0 active:scale-95 transition-transform"
                          title="Tap to switch back"
                        >
                          {kind === "supplies" ? "Detected supplies" : "Detected food"}
                          <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
                          </svg>
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Review details, then add to {kind === "supplies" ? "supplies" : "pantry"}
                    </p>
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

                  {/* Amount — shared stepper + chips (T1-A) */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Amount</p>
                    <AmountField quantity={quantity} unit={unit} onQuantityChange={setQuantity} onUnitChange={setUnit} size="md" />
                  </div>

                  {/* Storage / Location */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                      {kind === "supplies" ? "Location" : "Storage"}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(kind === "supplies" ? SUPPLIES_LOCATIONS : STORAGE_LOCATIONS).map(({ value, label }) => (
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
                    {kind === "food" && (
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
                    )}
                  </div>

                  {/* Category */}
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Category</p>
                    <div className="flex flex-wrap gap-1.5">
                      {(kind === "supplies" ? SUPPLIES_CATEGORIES : FOOD_CATEGORIES).map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => { setFoodCategory(foodCategory === value ? "" : value); setAutoDetected(false); }}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${foodCategory === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                        >{label}</button>
                      ))}
                    </div>
                  </div>

                  {/* Expiry — food only */}
                  {kind === "food" && (
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
                  )}

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
                    {duplicate && conflictAction === "merge"
                      ? "Add to existing item"
                      : kind === "supplies" ? "Add to supplies" : "Add to pantry"}
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
        <div className="flex items-center gap-3 px-4 py-2.5">
          <input
            ref={nameRef}
            type="text"
            placeholder={tabKind === "supplies" ? "Add a supply…" : "Add an item…"}
            value={name}
            onChange={handleNameChange}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            className="flex-1 text-sm text-gray-900 dark:text-gray-50 placeholder:text-gray-400 dark:placeholder:text-gray-600 outline-none bg-transparent"
          />

          {/* Barcode-scan button (T3-C) — only visible when the input is
              empty, since once they've started typing the → submit is the
              primary action. Tap opens the fullscreen scanner. */}
          {!name.trim() && (
            <motion.button
              type="button"
              onClick={() => setScannerOpen(true)}
              disabled={scanLookupBusy}
              whileTap={{ scale: 0.88 }}
              className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 flex-shrink-0"
              aria-label="Scan barcode"
            >
              {scanLookupBusy ? (
                <div className="w-3 h-3 border-2 border-gray-300 dark:border-zinc-600 border-t-gray-600 dark:border-t-zinc-300 rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8v8M10 8v8M13 8v8M17 8v8" />
                </svg>
              )}
            </motion.button>
          )}

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

      {/* "Import from receipt" entry (T3-E) — small unobtrusive link below
          the form, same visual weight as the recipe entry on Shopping. */}
      <div className="flex justify-center mt-2">
        <ReceiptImportButton
          householdId={householdId}
          members={members}
          currentUserId={currentUserId}
          // ImportToPantrySheet's onAddItem expects the same shape as our
          // onAdd prop. Wrap to return a Promise (onAdd is fire-and-forget).
          onAddItem={async (n, q, u, opts) => { onAdd(n, q, u, opts); }}
        />
      </div>

      {sheet}

      {/* Barcode scanner (T3-C) — rendered as a fullscreen portal */}
      <BarcodeScanner
        open={scannerOpen}
        onDetect={handleBarcodeDetect}
        onClose={() => setScannerOpen(false)}
      />
    </div>
  );
}
