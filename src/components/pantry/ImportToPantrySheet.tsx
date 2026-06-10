"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { STORAGE_LOCATIONS, FRIDGE_ZONES, FOOD_CATEGORIES, SUPPLIES_LOCATIONS, SUPPLIES_CATEGORIES, type Kind } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import { getPantryDuplicates, increasePantryQty } from "@/lib/checkPantryDuplicate";
import { normalizeItemName, normalizeUnit } from "@/lib/normalizeItemName";
import { getPantryHint } from "@/lib/pantryHints";
import AmountField from "@/components/ui/AmountField";

interface DraftItem {
  key: string;
  name: string;
  quantity: number;
  unit: string;
  kind: Kind;
  storageLocation: string | null;
  fridgeZone: string | null;
  foodCategory: string | null;
  assignedTo: string[] | null;
  expiresAt: string | null;
  /** Set when an existing pantry item has the same name */
  conflict?: { existingId: string; existingQty: number };
  /** "merge" = add qty to existing, "add" = create new entry */
  conflictAction?: "merge" | "add";
}

/**
 * An item provided directly to the import sheet (instead of being loaded
 * from an archived shopping list). Used by the receipt-OCR path (T3-E) —
 * the LLM returns items as a JSON array, which we feed in here without
 * having to round-trip through shopping_items.
 */
export interface ImportSeedItem {
  name: string;
  quantity?: number;
  unit?: string;
}

interface ImportToPantrySheetProps {
  /**
   * Archived shopping list id to load items from. Optional — supply
   * either `listId` OR `initialItems`. If both are provided, `initialItems`
   * wins.
   */
  listId?: string;
  /** Pre-loaded items (e.g. from receipt extraction). */
  initialItems?: ImportSeedItem[];
  householdId: string;
  members?: MemberProfile[];
  currentUserId?: string | null;
  onAddItem: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => Promise<void>;
  onClose: () => void;
}

// Quantity controls now use the shared `AmountField` from
// @/components/ui/AmountField — see DraftCard.

/**
 * Attach an existing-pantry conflict to a draft. Defaults to "merge"
 * (restock), but when the existing item and the incoming draft have
 * DIFFERENT units (2 cans vs 1 bottle), default to "add" so we don't
 * silently sum incompatible amounts — the user can still choose to merge.
 */
function applyConflict(
  item: DraftItem,
  conflicts: Map<string, { id: string; quantity: number; unit: string | null }>,
): DraftItem {
  const c = conflicts.get(normalizeItemName(item.name));
  if (!c) return item;
  const unitConflict =
    !!item.unit && !!c.unit && normalizeUnit(item.unit) !== normalizeUnit(c.unit);
  return {
    ...item,
    conflict: { existingId: c.id, existingQty: c.quantity },
    conflictAction: unitConflict ? "add" : "merge",
  };
}

// ── Single draft item card ─────────────────────────────────────────
function DraftCard({
  item,
  onChange,
  onDelete,
  onSkip,
  members = [],
  currentUserId,
}: {
  item: DraftItem;
  onChange: (patch: Partial<DraftItem>) => void;
  /** Discard an extracted (receipt) draft. Optional — shown on seed rows. */
  onDelete?: () => void;
  /** Skip importing this one to the pantry; it stays bought. Optional. */
  onSkip?: () => void;
  members?: MemberProfile[];
  currentUserId?: string | null;
}) {
  const [nameVal, setNameVal] = useState(item.name);

  // Keep local inputs in sync if parent resets
  useEffect(() => { setNameVal(item.name); }, [item.name]);

  function commitName() {
    const trimmed = nameVal.trim();
    if (trimmed && trimmed !== item.name) onChange({ name: trimmed });
    else setNameVal(item.name);
  }

  // A merging (restock) row is compact: the existing pantry item already
  // owns its tags, so we only show quantity + expiry. Switching to
  // "Keep separate" expands the full editor again.
  const isMerging = !!item.conflict && (item.conflictAction ?? "merge") === "merge";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={`bg-white dark:bg-zinc-900 border rounded-2xl px-4 py-3.5 flex flex-col gap-3 ${item.conflict ? "border-emerald-200 dark:border-emerald-800/50" : "border-gray-100 dark:border-zinc-800"}`}
    >
      {/* Restock banner — this item is already in the pantry. Default is to
          bump the existing row's quantity (a satisfying restock), not warn. */}
      {item.conflict && (() => {
        const merging = (item.conflictAction ?? "merge") === "merge";
        const result = item.conflict.existingQty + (item.quantity || 0);
        return (
          <div className="bg-emerald-50 dark:bg-emerald-950/40 rounded-xl px-3 py-2 flex items-center gap-2 flex-wrap">
            <svg className="w-4 h-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7l1.5-3h13L20 7M4 7h16M9 11h6" />
            </svg>
            {merging ? (
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex-1">
                In pantry: {item.conflict.existingQty} <span aria-hidden>→</span> {result}
              </p>
            ) : (
              <p className="text-xs font-medium text-gray-600 dark:text-gray-300 flex-1">
                Adding as a separate entry
              </p>
            )}
            <button
              type="button"
              onClick={() => onChange({ conflictAction: merging ? "add" : "merge" })}
              className="flex-shrink-0 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline-offset-2 hover:underline transition-colors active:opacity-60"
            >
              {merging ? "Keep separate" : "Add to existing"}
            </button>
          </div>
        );
      })()}

      {/* Row 1: name + skip/delete actions */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nameVal}
          onChange={(e) => setNameVal(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100 bg-transparent outline-none placeholder:text-gray-300 dark:placeholder:text-gray-600"
          placeholder="Item name"
        />
        {/* "Skip" — don't add this one to the pantry. It stays marked bought
            on the trip and won't come back to your shopping list. Handy when
            you already have it and just want to bump the quantity yourself. */}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="flex-shrink-0 px-2 h-7 flex items-center gap-1 rounded-lg text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:scale-95"
            aria-label="Skip adding to pantry"
            title="Already have it — skip adding to pantry. Stays bought; won't come back to your list."
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
            Skip
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-200 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors active:scale-90"
            aria-label="Remove item"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Amount — shared stepper + unit chips (T1-A unification) */}
      <AmountField
        quantity={item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toString()}
        unit={item.unit}
        onQuantityChange={(q) => onChange({ quantity: q ? parseFloat(q) : 1 })}
        onUnitChange={(u) => onChange({ unit: u })}
        size="sm"
      />

      {/* Classification editors — hidden on a restock (merge) row; the
          existing pantry item already owns these. */}
      {!isMerging && (
      <>
      {/* Row 2.5: Food / Supplies toggle */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-zinc-800 self-start">
        {(["food", "supplies"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              if (item.kind === k) return;
              // Switching kind clears chip selections from the other vocabulary
              onChange({
                kind: k,
                storageLocation: null,
                fridgeZone: null,
                foodCategory: null,
              });
            }}
            className={`px-3 py-1 rounded-lg text-[11px] font-medium transition-colors active:scale-[0.94] ${
              item.kind === k
                ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {k === "food" ? "Food" : "Supplies"}
          </button>
        ))}
      </div>

      {/* Row 3: storage / location chips */}
      <div className="flex flex-wrap gap-1.5">
        {(item.kind === "supplies" ? SUPPLIES_LOCATIONS : STORAGE_LOCATIONS).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() =>
              onChange({ storageLocation: item.storageLocation === value ? null : value })
            }
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
              item.storageLocation === value
                ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Fridge zone — food only */}
      {item.kind === "food" && item.storageLocation === "fridge" && (
        <div className="flex flex-wrap gap-1.5">
          {FRIDGE_ZONES.map(({ value, label }) => (
            <button key={value} type="button"
              onClick={() => onChange({ fridgeZone: item.fridgeZone === value ? null : value })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.fridgeZone === value ? "bg-blue-600 text-white" : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40"}`}
            >{label}</button>
          ))}
        </div>
      )}

      {/* Category */}
      <div className="flex flex-wrap gap-1.5">
        {(item.kind === "supplies" ? SUPPLIES_CATEGORIES : FOOD_CATEGORIES).map(({ value, label }) => (
          <button key={value} type="button"
            onClick={() => onChange({ foodCategory: item.foodCategory === value ? null : value })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.foodCategory === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
          >{label}</button>
        ))}
      </div>

      {/* Assigned to */}
      {members.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <button type="button"
            onClick={() => onChange({ assignedTo: null })}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${!item.assignedTo || item.assignedTo.length === 0 ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
          >Everyone</button>
          {members.map((m) => {
            const selected = !!item.assignedTo?.includes(m.user_id);
            const color = m.color ?? DEFAULT_COLOR;
            return (
              <button key={m.user_id} type="button"
                onClick={() => {
                  const cur = item.assignedTo ?? [];
                  const next = selected ? cur.filter((id) => id !== m.user_id) : [...cur, m.user_id];
                  onChange({ assignedTo: next.length === 0 ? null : next });
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                style={selected ? { backgroundColor: color, color: "#fff" } : { backgroundColor: hexAlpha(color, 0.1), color }}
              >
                <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px] font-bold flex-shrink-0"
                  style={selected ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: hexAlpha(color, 0.2) }}
                >{m.initials}</span>
                {m.user_id === currentUserId ? "Me" : m.short_name}
              </button>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Row 4: expiry date — food only. Shown on restock rows too: new
          stock has a new date, and the merge keeps the earlier of the two. */}
      {item.kind === "food" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={item.expiresAt ?? ""}
            onChange={(e) => onChange({ expiresAt: e.target.value || null })}
            className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
          />
          {item.expiresAt && (
            <button
              type="button"
              onClick={() => onChange({ expiresAt: null })}
              className="flex-shrink-0 text-xs text-gray-400 hover:text-red-400 transition-colors active:opacity-60"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Main sheet ─────────────────────────────────────────────────────
export default function ImportToPantrySheet({
  listId,
  initialItems,
  householdId,
  members = [],
  currentUserId = null,
  onAddItem,
  onClose,
}: ImportToPantrySheetProps) {
  const [mounted, setMounted] = useState(false);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  // Stable client ref — avoids re-running the fetch effect on every render
  const supabaseRef = useRef(createClient());
  const supabase = supabaseRef.current;

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  // Build a DraftItem from a name+quantity+unit, running the keyword
  // classifier so storage/category/zone get pre-populated. Used for both
  // the archived-list load path AND the receipt-OCR path (T3-E).
  function buildDraft(input: { id: string; name: string; quantity: number | null; unit: string | null; kind?: string }): DraftItem {
    const hint = getPantryHint(input.name);
    const resolvedKind: Kind =
      input.kind === "supplies" || input.kind === "food"
        ? input.kind
        : (hint?.kind ?? "food");
    return {
      key: input.id,
      name: input.name,
      quantity: input.quantity ?? 1,
      unit: input.unit ?? "",
      kind: resolvedKind,
      storageLocation: hint?.storage_location ?? null,
      fridgeZone: hint?.fridge_zone ?? null,
      foodCategory: hint?.food_category ?? null,
      assignedTo: null,
      expiresAt: null,
    };
  }

  // Load drafts. Two paths:
  //   1. `initialItems` provided (receipt OCR) — short-circuit to those.
  //   2. `listId` provided (post-trip flow) — fetch completed shopping_items.
  // After either path, fire `getPantryDuplicates` so existing pantry rows
  // get flagged as merge candidates.
  useEffect(() => {
    let cancelled = false;

    async function loadFromInitial(items: ImportSeedItem[]) {
      const raw: DraftItem[] = items.map((i, idx) =>
        buildDraft({
          id: `seed-${idx}`,
          name: i.name,
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
        }),
      );
      const conflicts = await getPantryDuplicates(householdId, raw.map((r) => r.name));
      if (cancelled) return;
      setDrafts(raw.map((item) => applyConflict(item, conflicts)));
      setLoadingItems(false);
    }

    async function loadFromList(attempt = 0) {
      if (!listId) {
        setLoadingItems(false);
        return;
      }
      if (attempt === 0) setLoadingItems(true);

      const { data } = await supabase
        .from("shopping_items")
        .select("id, name, quantity, unit, kind")
        .eq("list_id", listId)
        .eq("completed", true)
        .order("completed_at", { ascending: true });

      if (cancelled) return;

      const raw: DraftItem[] = (data ?? []).map((item) => buildDraft({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        kind: (item as { kind?: string }).kind,
      }));

      // Retry once if the list came back empty on first try — guards against
      // a brief race between finishTrip writing to the DB and this sheet opening.
      if (raw.length === 0 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 900));
        if (!cancelled) loadFromList(1);
        return;
      }

      const conflicts = await getPantryDuplicates(householdId, raw.map((r) => r.name));

      if (!cancelled) {
        setDrafts(raw.map((item) => applyConflict(item, conflicts)));
        setLoadingItems(false);
      }
    }

    if (initialItems && initialItems.length > 0) {
      loadFromInitial(initialItems);
    } else if (listId) {
      loadFromList();
    } else {
      setLoadingItems(false);
    }
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, householdId, initialItems]);

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d))
    );
  }

  function deleteDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  /**
   * "Skip" — don't add this one to the pantry (e.g. "I already have it; I'll
   * bump the quantity myself"). The item STAYS bought: its shopping_items row
   * is left as completed on the archived trip, so it does NOT reappear on the
   * active shopping list. We only drop it from this import view.
   *
   * (Previously Skip re-homed the row back to the active list as uncompleted
   * — which is why bought-and-skipped items kept resurfacing days later.)
   */
  function skipDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  /**
   * Bulk-apply an expiry date to every food draft. Supplies are unaffected.
   * (T1-C — turns the "set expiry on each of 8 items" chore into one tap.)
   */
  function applyExpiryToAllFood(date: string | null) {
    setDrafts((prev) =>
      prev.map((d) => (d.kind === "food" ? { ...d, expiresAt: date } : d))
    );
  }

  /** Set merge/add for every already-in-pantry row at once. */
  function setAllConflictAction(action: "merge" | "add") {
    setDrafts((prev) =>
      prev.map((d) => (d.conflict ? { ...d, conflictAction: action } : d))
    );
  }

  async function handleAdd() {
    if (saving || drafts.length === 0) return;
    setSaving(true);
    for (const draft of drafts) {
      if (draft.conflict && (draft.conflictAction ?? "merge") === "merge") {
        await increasePantryQty(
          draft.conflict.existingId,
          draft.conflict.existingQty,
          draft.quantity,
          {
            kind: draft.kind,
            storageLocation: draft.storageLocation,
            fridgeZone: draft.kind === "food" ? draft.fridgeZone : null,
            foodCategory: draft.foodCategory,
            // Previously dropped on merge — now carried into the existing row.
            unit: draft.unit || null,
            expiresAt: draft.kind === "food" ? draft.expiresAt : null,
            assignedTo: draft.assignedTo,
          }
        );
      } else {
        await onAddItem(
          draft.name,
          draft.quantity,
          draft.unit || undefined,
          {
            kind: draft.kind,
            storageLocation: draft.storageLocation,
            fridgeZone: draft.kind === "food" ? draft.fridgeZone : null,
            foodCategory: draft.foodCategory,
            assignedTo: draft.assignedTo,
            expiresAt: draft.kind === "food" ? draft.expiresAt : null,
          }
        );
      }
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
            className="fixed inset-x-0 bottom-0 z-50 bg-gray-50 dark:bg-zinc-950 rounded-t-3xl shadow-2xl flex flex-col"
            style={{
              maxHeight: "92dvh",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3.5 pb-1 flex-shrink-0">
              <div className="w-10 h-[5px] bg-gray-200 dark:bg-zinc-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Review your haul</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {(() => {
                    const f = drafts.filter((d) => d.kind === "food").length;
                    const s = drafts.filter((d) => d.kind === "supplies").length;
                    if (f > 0 && s > 0) return `${f} food · ${s} supplies — toggle on any row if we got it wrong.`;
                    if (s > 0)          return "All supplies — heading to your Supplies tab.";
                    return "Edit details, then add to your pantry.";
                  })()}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable item list. `overscroll-contain` keeps iOS rubber-band
                inside this container so a pull-up doesn't propagate to the
                page-level pull-to-refresh. */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3"
              style={{ overscrollBehavior: "contain" }}
            >
              {loadingItems ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-6 h-6 border-2 border-gray-300 dark:border-zinc-700 border-t-gray-600 dark:border-t-zinc-400 rounded-full animate-spin" />
                </div>
              ) : drafts.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <p className="text-sm">No items to import</p>
                </div>
              ) : (() => {
                // Split drafts into food vs supplies groups so the user sees
                // at a glance where each item is heading. Section headers only
                // render when *both* groups have items — otherwise we keep
                // the flat layout to avoid visual noise.
                const foodDrafts = drafts.filter((d) => d.kind === "food");
                const supplyDrafts = drafts.filter((d) => d.kind === "supplies");
                const showHeaders = foodDrafts.length > 0 && supplyDrafts.length > 0;

                // Bulk-expiry control (T1-C) only when there are 2+ food
                // drafts — for a single item it's faster to just tap that
                // row's date input.
                const showBulkExpiry = foodDrafts.length >= 2;
                // Bulk merge/separate control when 2+ items are already in
                // the pantry, so the user doesn't toggle each one.
                const conflictCount = drafts.filter((d) => d.conflict).length;
                const allMerging = drafts
                  .filter((d) => d.conflict)
                  .every((d) => (d.conflictAction ?? "merge") === "merge");
                // If every food draft already shares one expiry, prefill it.
                const sharedExpiry = (() => {
                  const dates = new Set(foodDrafts.map((d) => d.expiresAt ?? ""));
                  return dates.size === 1 ? foodDrafts[0]?.expiresAt ?? "" : "";
                })();

                function renderCards(group: typeof drafts) {
                  return group.map((draft) => {
                    // Trip rows (real shopping_items) get "Skip" — keep it
                    // bought, don't import. Receipt-OCR seed rows have no
                    // bought row to preserve, so they get a plain "discard ×".
                    const isSeed = draft.key.startsWith("seed-");
                    return (
                      <DraftCard
                        key={draft.key}
                        item={draft}
                        onChange={(patch) => updateDraft(draft.key, patch)}
                        onDelete={isSeed ? () => deleteDraft(draft.key) : undefined}
                        onSkip={isSeed ? undefined : () => skipDraft(draft.key)}
                        members={members}
                        currentUserId={currentUserId}
                      />
                    );
                  });
                }

                return (
                  <AnimatePresence mode="popLayout">
                    {conflictCount >= 2 && (
                      <div
                        key="bulk-merge"
                        className="flex items-center gap-2 rounded-2xl border border-emerald-100 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5"
                      >
                        <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10a2 2 0 002 2h12a2 2 0 002-2V7M4 7l1.5-3h13L20 7M4 7h16M9 11h6" />
                        </svg>
                        <p className="flex-1 text-xs text-gray-700 dark:text-gray-300 min-w-0">
                          {conflictCount} already in your pantry
                        </p>
                        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-white dark:bg-zinc-900 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => setAllConflictAction("merge")}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${allMerging ? "bg-emerald-600 text-white" : "text-gray-500 dark:text-gray-400"}`}
                          >Restock all</button>
                          <button
                            type="button"
                            onClick={() => setAllConflictAction("add")}
                            className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${!allMerging ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "text-gray-500 dark:text-gray-400"}`}
                          >Add as new</button>
                        </div>
                      </div>
                    )}
                    {showBulkExpiry && (
                      <div
                        key="bulk-expiry"
                        className="flex items-center gap-2 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-blue-50/40 dark:bg-blue-950/20 px-3 py-2.5"
                      >
                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <p className="text-xs text-gray-700 dark:text-gray-300 flex-shrink-0">Expiry for all food:</p>
                          <input
                            type="date"
                            value={sharedExpiry}
                            onChange={(e) => applyExpiryToAllFood(e.target.value || null)}
                            className="flex-1 min-w-0 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors [color-scheme:light] dark:[color-scheme:dark]"
                          />
                          {sharedExpiry && (
                            <button
                              type="button"
                              onClick={() => applyExpiryToAllFood(null)}
                              className="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500 hover:text-red-400 transition-colors active:opacity-60"
                            >Clear</button>
                          )}
                        </div>
                      </div>
                    )}
                    {foodDrafts.length > 0 && (
                      <div key="food-group" className="flex flex-col gap-2.5">
                        {showHeaders && (
                          <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gray-400 dark:text-gray-500 px-1">
                            Food · {foodDrafts.length}
                          </p>
                        )}
                        {renderCards(foodDrafts)}
                      </div>
                    )}
                    {supplyDrafts.length > 0 && (
                      <div key="supplies-group" className="flex flex-col gap-2.5">
                        {showHeaders && (
                          <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gray-400 dark:text-gray-500 px-1 pt-1">
                            Supplies · {supplyDrafts.length}
                          </p>
                        )}
                        {renderCards(supplyDrafts)}
                      </div>
                    )}
                  </AnimatePresence>
                );
              })()}
            </div>

            {/* Footer */}
            {!loadingItems && (
              <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-zinc-800">
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
                      {(() => {
                        const f = drafts.filter((d) => d.kind === "food").length;
                        const s = drafts.filter((d) => d.kind === "supplies").length;
                        if (f > 0 && s > 0) return "Added to pantry & supplies!";
                        if (s > 0)          return "Added to supplies!";
                        return "Added to pantry!";
                      })()}
                    </motion.div>
                  ) : (
                    <motion.button
                      key="add"
                      type="button"
                      onClick={handleAdd}
                      disabled={saving || drafts.length === 0}
                      whileTap={{ scale: 0.97 }}
                      className="w-full py-3.5 flex items-center justify-center gap-2 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl text-sm font-medium disabled:opacity-50 transition-opacity"
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
                          {(() => {
                            // Honest outcome: how many existing rows we'll
                            // restock vs how many brand-new rows we'll create.
                            const updates = drafts.filter(
                              (d) => d.conflict && (d.conflictAction ?? "merge") === "merge"
                            ).length;
                            const news = drafts.length - updates;
                            if (updates > 0 && news > 0) return `Update ${updates} · Add ${news} new`;
                            if (updates > 0) return `Update ${updates} in pantry`;
                            const f = drafts.filter((d) => d.kind === "food").length;
                            const s = drafts.filter((d) => d.kind === "supplies").length;
                            if (f > 0 && s > 0) return `Add ${f} to pantry, ${s} to supplies`;
                            if (s > 0)          return `Add ${s} to supplies`;
                            return `Add ${f} to pantry`;
                          })()}
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
