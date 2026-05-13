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

interface ImportToPantrySheetProps {
  listId: string;
  householdId: string;
  members?: MemberProfile[];
  currentUserId?: string | null;
  onAddItem: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => Promise<void>;
  onClose: () => void;
}

// Quantity controls now use the shared `AmountField` from
// @/components/ui/AmountField — see DraftCard.

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
  onDelete: () => void;
  /** Send this item back to the active shopping list as uncompleted. Optional. */
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

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.18 }}
      className={`bg-white dark:bg-zinc-900 border rounded-2xl px-4 py-3.5 flex flex-col gap-3 ${item.conflict ? "border-amber-200 dark:border-amber-800/50" : "border-gray-100 dark:border-zinc-800"}`}
    >
      {/* Conflict banner */}
      {item.conflict && (
        <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl px-3 py-2 flex flex-col gap-1.5">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Already in pantry (×{item.conflict.existingQty})</p>
          <div className="flex gap-1.5">
            <button type="button"
              onClick={() => onChange({ conflictAction: "merge" })}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors active:scale-[0.97] ${(item.conflictAction ?? "merge") === "merge" ? "bg-amber-500 text-white" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400"}`}
            >Add to existing</button>
            <button type="button"
              onClick={() => onChange({ conflictAction: "add" })}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors active:scale-[0.97] ${item.conflictAction === "add" ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400"}`}
            >Add as new entry</button>
          </div>
        </div>
      )}

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
        {/* "Skip" — sends this back to the active shopping list rather than
            adding it to the pantry. For "actually didn't buy it" cases (T2-C). */}
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="flex-shrink-0 px-2 h-7 flex items-center gap-1 rounded-lg text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors active:scale-95"
            aria-label="Send back to list"
            title="Didn't buy this — send back to your shopping list"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Skip
          </button>
        )}
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
      </div>

      {/* Amount — shared stepper + unit chips (T1-A unification) */}
      <AmountField
        quantity={item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toString()}
        unit={item.unit}
        onQuantityChange={(q) => onChange({ quantity: q ? parseFloat(q) : 1 })}
        onUnitChange={(u) => onChange({ unit: u })}
        size="sm"
      />

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

      {/* Row 4: expiry date — food only */}
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

  // Fetch completed items from the archived list, then check for pantry duplicates.
  // Retries once after 900 ms if the first attempt returns nothing — guards against
  // a brief race between finishTrip() writing to the DB and this sheet opening.
  useEffect(() => {
    let cancelled = false;

    async function load(attempt = 0) {
      if (attempt === 0) setLoadingItems(true);

      const { data } = await supabase
        .from("shopping_items")
        .select("id, name, quantity, unit, kind")
        .eq("list_id", listId)
        .eq("completed", true)
        .order("completed_at", { ascending: true });

      if (cancelled) return;

      const raw: DraftItem[] = (data ?? []).map((item) => {
        const hint = getPantryHint(item.name);
        // Prefer the shopping item's own kind (if it was set when added) over
        // the hint, so users who explicitly tagged something keep their choice.
        const rowKind = (item as { kind?: string }).kind;
        const resolvedKind: Kind =
          rowKind === "supplies" || rowKind === "food"
            ? rowKind
            : (hint?.kind ?? "food");
        return {
          key: item.id,
          name: item.name,
          quantity: item.quantity ?? 1,
          unit: item.unit ?? "",
          kind: resolvedKind,
          storageLocation: hint?.storage_location ?? null,
          fridgeZone: hint?.fridge_zone ?? null,
          foodCategory: hint?.food_category ?? null,
          assignedTo: null,
          expiresAt: null,
        };
      });

      // If the list came back empty on the first try, give the DB one more chance
      if (raw.length === 0 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 900));
        if (!cancelled) load(1);
        return;
      }

      const conflicts = await getPantryDuplicates(householdId, raw.map((r) => r.name));

      if (!cancelled) {
        setDrafts(
          raw.map((item) => {
            const c = conflicts.get(item.name.toLowerCase());
            return c
              ? { ...item, conflict: { existingId: c.id, existingQty: c.quantity }, conflictAction: "merge" as const }
              : item;
          })
        );
        setLoadingItems(false);
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, householdId]);

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((prev) =>
      prev.map((d) => (d.key === key ? { ...d, ...patch } : d))
    );
  }

  function deleteDraft(key: string) {
    setDrafts((prev) => prev.filter((d) => d.key !== key));
  }

  /**
   * "Skip" — the user checked this off at the store but didn't actually
   * buy it. Move the underlying shopping_items row back to the active
   * list as uncompleted, so it reappears on the Shopping tab. (T2-C)
   *
   * We use the same race-safe RPC the rest of the app uses to find the
   * active list, so this works correctly even if a parallel finishTrip
   * was running.
   */
  async function skipDraft(key: string) {
    const draft = drafts.find((d) => d.key === key);
    if (!draft) return;
    setDrafts((prev) => prev.filter((d) => d.key !== key));

    const { data: activeListId, error: rpcErr } = await supabase
      .rpc("get_or_create_active_shopping_list", { p_household_id: householdId });
    if (rpcErr || !activeListId) {
      // Best-effort: re-add the draft so user can retry. The shopping
      // item row is still on the archived list and not lost.
      console.error("skipDraft: couldn't find active list", rpcErr?.message);
      setDrafts((prev) => [...prev, draft]);
      return;
    }
    await supabase
      .from("shopping_items")
      .update({ list_id: activeListId, completed: false, completed_by: null, completed_at: null })
      .eq("id", draft.key);
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
                // If every food draft already shares one expiry, prefill it.
                const sharedExpiry = (() => {
                  const dates = new Set(foodDrafts.map((d) => d.expiresAt ?? ""));
                  return dates.size === 1 ? foodDrafts[0]?.expiresAt ?? "" : "";
                })();

                function renderCards(group: typeof drafts) {
                  return group.map((draft) => (
                    <DraftCard
                      key={draft.key}
                      item={draft}
                      onChange={(patch) => updateDraft(draft.key, patch)}
                      onDelete={() => deleteDraft(draft.key)}
                      onSkip={() => skipDraft(draft.key)}
                      members={members}
                      currentUserId={currentUserId}
                    />
                  ));
                }

                return (
                  <AnimatePresence mode="popLayout">
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
