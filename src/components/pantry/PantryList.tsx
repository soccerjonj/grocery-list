"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import PantryItem from "./PantryItem";
import AddPantryItem from "./AddPantryItem";
import Spinner from "@/components/ui/Spinner";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

interface PantryListProps {
  items: PantryItemType[];
  loading: boolean;
  members: MemberProfile[];
  currentUserId: string | null;
  householdId: string;
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateItem: (id: string, fields: Partial<Omit<PantryItemType, "id" | "household_id" | "created_at" | "added_by">>) => void;
  onDelete: (id: string) => void;
  onAddToShoppingList?: (name: string, quantity?: number | null, unit?: string | null, store?: string | null, assignedTo?: string[] | null) => Promise<boolean>;
}

type SortKey = "freshness" | "expiry" | "name" | "category" | "added";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "freshness", label: "Freshness" },
  { key: "expiry",    label: "Expiry" },
  { key: "name",      label: "Name" },
  { key: "category",  label: "Category" },
  { key: "added",     label: "Recent" },
];

// Location urgency: lower = more perishable / needs attention sooner
const LOCATION_PRIORITY: Record<string, number> = {
  fridge: 0,
  room_temp: 1,
  freezer: 2,
  pantry: 3,
};

function freshnessScore(item: PantryItemType): number {
  // Items with upcoming expiry get top priority (0–4 range)
  if (item.expires_at) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round(
      (new Date(item.expires_at + "T00:00:00").getTime() - today.getTime()) / 86_400_000
    );
    if (diff < 0) return 0;       // expired
    if (diff === 0) return 1;     // today
    if (diff <= 2) return 2;      // 1-2 days
    if (diff <= 7) return 3;      // this week
    return 4;                     // future expiry
  }
  // No expiry — rank by storage location perishability
  const loc = item.storage_location ?? "";
  return 5 + (LOCATION_PRIORITY[loc] ?? 4);
}

function sortItems(items: PantryItemType[], sort: SortKey): PantryItemType[] {
  return [...items].sort((a, b) => {
    if (sort === "freshness") {
      const sa = freshnessScore(a);
      const sb = freshnessScore(b);
      if (sa !== sb) return sa - sb;
      // Within same priority: soonest expiry first, then alphabetical
      if (a.expires_at && b.expires_at) return a.expires_at.localeCompare(b.expires_at);
      return a.name.localeCompare(b.name);
    }
    if (sort === "expiry") {
      if (!a.expires_at && !b.expires_at) return 0;
      if (!a.expires_at) return 1;
      if (!b.expires_at) return -1;
      return a.expires_at.localeCompare(b.expires_at);
    }
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "category") {
      const ca = a.food_category ?? "zzz";
      const cb = b.food_category ?? "zzz";
      return ca.localeCompare(cb) || a.name.localeCompare(b.name);
    }
    return b.created_at.localeCompare(a.created_at);
  });
}

function AddToListModal({
  itemName,
  members,
  currentUserId,
  onConfirm,
  onClose,
}: {
  itemName: string;
  members: MemberProfile[];
  currentUserId: string | null;
  onConfirm: (qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) => Promise<void>;
  onClose: () => void;
}) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [store, setStore] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function toggleMember(uid: string) {
    setAssignedTo((prev) => {
      const cur = prev ?? [];
      const next = cur.includes(uid) ? cur.filter((id) => id !== uid) : [...cur, uid];
      return next.length === 0 ? null : next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    await onConfirm(
      qty ? parseFloat(qty) : null,
      unit.trim() || null,
      store.trim() || null,
      assignedTo,
    );
    setSaving(false);
    onClose();
  }

  const modal = (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-5"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Add to shopping list</p>
              <p className="text-base font-semibold text-gray-900">{itemName}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors active:scale-90 flex-shrink-0 mt-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Qty + unit */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Quantity &amp; unit</p>
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                step="any"
                placeholder="Qty"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="w-20 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 text-center transition-colors"
              />
              <input
                type="text"
                placeholder="Unit (optional)"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 transition-colors"
              />
            </div>
          </div>

          {/* Store */}
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Store</p>
            <input
              type="text"
              placeholder="e.g. Trader Joe's"
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 transition-colors"
            />
          </div>

          {/* Member assignment */}
          {members.length > 1 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">For</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAssignedTo(null)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                    !assignedTo || assignedTo.length === 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                      style={selected ? { backgroundColor: color, color: "#fff" } : { backgroundColor: hexAlpha(color, 0.1), color }}
                    >
                      <span
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                        style={selected ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: hexAlpha(color, 0.2) }}
                      >
                        {m.initials}
                      </span>
                      {m.user_id === currentUserId ? "Me" : m.short_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirm */}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {saving ? "Adding…" : "Add to list"}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return mounted ? createPortal(modal, document.body) : null;
}

function RunningLowRow({
  item,
  locationLabel,
  members,
  currentUserId,
  isFlashing,
  onIgnore,
  onAddedToList,
  onAddToList,
}: {
  item: PantryItemType;
  locationLabel: string | null;
  members: MemberProfile[];
  currentUserId: string | null;
  isFlashing: boolean;
  onIgnore: () => void;
  onAddedToList: () => void;
  onAddToList?: (qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) => Promise<boolean>;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  async function handleConfirm(qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) {
    if (!onAddToList) return;
    const ok = await onAddToList(qty, unit, store, assignedTo);
    if (ok) onAddedToList();
  }

  return (
    <>
      <motion.div
        animate={{
          backgroundColor: isFlashing ? "#f0fdf4" : "#fffbeb",
          borderColor: isFlashing ? "#bbf7d0" : "#fde68a",
        }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 border border-l-[3px] border-l-amber-400 rounded-xl px-3 py-2"
      >
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <p className={`text-xs font-semibold truncate transition-colors duration-250 ${isFlashing ? "text-green-700" : "text-gray-800"}`}>
            {item.name}
          </p>
          {locationLabel && (
            <p className={`text-[10px] flex-shrink-0 transition-colors duration-250 ${isFlashing ? "text-green-400" : "text-gray-400"}`}>
              {locationLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isFlashing ? (
            <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-green-100 text-green-600 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Added
            </span>
          ) : (
            <>
              {onAddToList && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-500 hover:border-gray-400 transition-all active:scale-95"
                >
                  + List
                </button>
              )}
              <button
                type="button"
                onClick={onIgnore}
                className="w-5 h-5 flex items-center justify-center rounded-md text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors active:scale-90"
                aria-label="Dismiss"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </motion.div>

      {modalOpen && (
        <AddToListModal
          itemName={item.name}
          members={members}
          currentUserId={currentUserId}
          onConfirm={handleConfirm}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

interface SectionProps {
  label: string;
  items: PantryItemType[];
  members: MemberProfile[];
  currentUserId: string | null;
  sort: SortKey;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateItem: (id: string, fields: Partial<Omit<PantryItemType, "id" | "household_id" | "created_at" | "added_by">>) => void;
  onDelete: (id: string) => void;
  onAddToShoppingList?: (name: string, quantity?: number | null, unit?: string | null, store?: string | null, assignedTo?: string[] | null) => Promise<boolean>;
}

function StorageSection({
  label,
  items,
  members,
  currentUserId,
  sort,
  expandedId,
  onToggleExpand,
  onUpdateQuantity,
  onUpdateItem,
  onDelete,
  onAddToShoppingList,
}: SectionProps) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  const isFridge = label === "Fridge";
  const quickUse = isFridge ? items.filter((i) => i.fridge_zone === "quick_use") : [];
  const longTerm  = isFridge ? items.filter((i) => i.fridge_zone === "long_term") : [];
  const unzoned   = isFridge ? items.filter((i) => !i.fridge_zone) : items;

  const itemProps = { members, currentUserId, onUpdateQuantity, onUpdateItem, onDelete, onAddToShoppingList };

  function renderGrid(group: PantryItemType[]) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <AnimatePresence mode="popLayout">
          {sortItems(group, sort).map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => onToggleExpand(item.id)}
              {...itemProps}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 py-0.5 active:opacity-60 transition-opacity"
      >
        <motion.svg
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 400, damping: 32 }}
          className="w-3 h-3 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </motion.svg>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {label}
        </span>
        <span className="text-xs text-gray-300">({items.length})</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden pl-2"
          >
            {isFridge ? (
              <div className="flex flex-col gap-3">
                {quickUse.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pl-1">Quick-use</p>
                    {renderGrid(quickUse)}
                  </div>
                )}
                {longTerm.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pl-1">Long-term</p>
                    {renderGrid(longTerm)}
                  </div>
                )}
                {unzoned.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {(quickUse.length > 0 || longTerm.length > 0) && (
                      <p className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pl-1">General</p>
                    )}
                    {renderGrid(unzoned)}
                  </div>
                )}
              </div>
            ) : (
              renderGrid(unzoned)
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PantryList({
  items,
  loading,
  members,
  currentUserId,
  householdId,
  onAdd,
  onUpdateQuantity,
  onUpdateItem,
  onDelete,
  onAddToShoppingList,
}: PantryListProps) {
  const [sort, setSort] = useState<SortKey>("freshness");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exitReasons, setExitReasons] = useState<Record<string, "dismiss" | "added">>({});
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());

  function dismissItem(id: string, reason: "dismiss" | "added") {
    setExitReasons((prev) => ({ ...prev, [id]: reason }));
    onUpdateItem(id, { running_low_dismissed: true });
  }

  function handleAddedToList(id: string) {
    setFlashingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      setFlashingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      dismissItem(id, "added");
    }, 600);
  }

  function handleToggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const filtered = filterCategory
    ? items.filter((i) => i.food_category === filterCategory)
    : items;

  const runningLowItems = items.filter((i) => i.running_low && !i.running_low_dismissed);

  const fridgeItems   = filtered.filter((i) => i.storage_location === "fridge");
  const freezerItems  = filtered.filter((i) => i.storage_location === "freezer");
  const pantryItems   = filtered.filter((i) => i.storage_location === "pantry");
  const roomTempItems = filtered.filter((i) => i.storage_location === "room_temp");
  const unsortedItems = filtered.filter((i) => !i.storage_location);

  const hasItems = filtered.length > 0;

  const LOCATION_LABEL: Record<string, string> = {
    fridge: "Fridge", freezer: "Freezer", pantry: "Pantry", room_temp: "Counter",
  };

  const sectionProps = { members, currentUserId, sort, expandedId, onToggleExpand: handleToggleExpand, onUpdateQuantity, onUpdateItem, onDelete, onAddToShoppingList };

  return (
    <div className="flex flex-col gap-4">
      <AddPantryItem onAdd={onAdd} members={members} currentUserId={currentUserId} householdId={householdId} existingNames={items.map((i) => i.name.toLowerCase())} />

      {items.length > 0 && (
        /* Sort + category filter bar */
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 active:scale-[0.94] ${
                sort === key
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 flex-shrink-0 mx-0.5" />
          <button
            onClick={() => setFilterCategory("")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 active:scale-[0.94] ${
              !filterCategory
                ? "bg-gray-900 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
            }`}
          >
            All
          </button>
          {FOOD_CATEGORIES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFilterCategory(filterCategory === value ? "" : value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 active:scale-[0.94] ${
                filterCategory === value
                  ? "bg-gray-900 text-white"
                  : "bg-white border border-gray-200 text-gray-500 hover:border-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {!hasItems && items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4" />
          </svg>
          <p className="text-sm">Your pantry is empty</p>
          <p className="text-xs mt-1 opacity-60">Add items to track what you have</p>
        </div>
      ) : !hasItems ? (
        <p className="text-center text-sm text-gray-400 py-8">No items in this category</p>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Running Low ─────────────────────────────────── */}
          <AnimatePresence>
            {runningLowItems.length > 0 && (
              <motion.div
                key="running-low"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  </svg>
                  <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">Running Low</span>
                  <span className="text-xs text-amber-300">({runningLowItems.length})</span>
                  <button
                    type="button"
                    onClick={() => runningLowItems.forEach((i) => dismissItem(i.id, "dismiss"))}
                    className="ml-auto text-[11px] text-gray-400 hover:text-gray-600 transition-colors active:opacity-60"
                  >
                    Ignore all
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <AnimatePresence mode="popLayout">
                    {runningLowItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } }}
                        exit="exit"
                        custom={{ reason: exitReasons[item.id] ?? "dismiss", index }}
                        variants={{
                          exit: ({ reason, index: i }: { reason: string; index: number }) => ({
                            opacity: 0,
                            x: reason === "dismiss" ? 56 : 0,
                            y: reason === "added" ? -10 : 0,
                            scale: reason === "added" ? 0.93 : 1,
                            transition: {
                              duration: reason === "dismiss" ? 0.22 : 0.3,
                              delay: i * 0.07,
                              ease: [0.4, 0, 1, 1],
                            },
                          }),
                        }}
                      >
                        <RunningLowRow
                          item={item}
                          locationLabel={LOCATION_LABEL[item.storage_location ?? ""] ?? null}
                          isFlashing={flashingIds.has(item.id)}
                          onIgnore={() => dismissItem(item.id, "dismiss")}
                          onAddedToList={() => handleAddedToList(item.id)}
                          members={members}
                          currentUserId={currentUserId}
                          onAddToList={onAddToShoppingList ? (qty, unit, store, assignedTo) => onAddToShoppingList(item.name, qty, unit, store, assignedTo) : undefined}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <StorageSection label="Fridge"  items={fridgeItems}   {...sectionProps} />
          <StorageSection label="Freezer" items={freezerItems}  {...sectionProps} />
          <StorageSection label="Pantry"  items={pantryItems}   {...sectionProps} />
          <StorageSection label="Counter" items={roomTempItems} {...sectionProps} />
          {unsortedItems.length > 0 && (
            <StorageSection label="Other" items={unsortedItems} {...sectionProps} />
          )}
        </div>
      )}
    </div>
  );
}
