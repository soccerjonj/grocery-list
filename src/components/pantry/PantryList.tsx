"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import PantryItem from "./PantryItem";
import AddPantryItem from "./AddPantryItem";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import AddToListModal from "./AddToListModal";

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

function RunningLowRow({
  item,
  locationLabel,
  householdId,
  members,
  currentUserId,
  isFlashing,
  isDark,
  onIgnore,
  onAddedToList,
  onAddToList,
}: {
  item: PantryItemType;
  locationLabel: string | null;
  householdId: string;
  members: MemberProfile[];
  currentUserId: string | null;
  isFlashing: boolean;
  isDark: boolean;
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
          backgroundColor: isDark
            ? isFlashing ? "rgb(5,36,17)"   : "rgb(28,16,3)"
            : isFlashing ? "#f0fdf4"         : "#fffbeb",
          borderColor: isDark
            ? isFlashing ? "rgb(22,101,52)"  : "rgb(120,53,15)"
            : isFlashing ? "#bbf7d0"         : "#fde68a",
        }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 border border-l-[3px] border-l-amber-500 dark:border-l-amber-600 rounded-xl px-3 py-2"
      >
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <p className={`text-xs font-semibold truncate transition-colors duration-250 ${isFlashing ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>
            {item.name}
          </p>
          {locationLabel && (
            <p className={`text-[10px] flex-shrink-0 transition-colors duration-250 ${isFlashing ? "text-green-500 dark:text-green-600" : "text-gray-400 dark:text-gray-500"}`}>
              {locationLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isFlashing ? (
            <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center gap-1">
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
                  className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-400 transition-all active:scale-95"
                >
                  + List
                </button>
              )}
              <button
                type="button"
                onClick={onIgnore}
                className="w-5 h-5 flex items-center justify-center rounded-md text-gray-300 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:scale-90"
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
          householdId={householdId}
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
  householdId: string;
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
  householdId,
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

  const itemProps = { members, currentUserId, householdId, onUpdateQuantity, onUpdateItem, onDelete, onAddToShoppingList };

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
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="w-3 h-3 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </motion.svg>
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-xs text-gray-300 dark:text-gray-600 tabular-nums">({items.length})</span>
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
                    <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider pl-1">Quick-use</p>
                    {renderGrid(quickUse)}
                  </div>
                )}
                {longTerm.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider pl-1">Long-term</p>
                    {renderGrid(longTerm)}
                  </div>
                )}
                {unzoned.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {(quickUse.length > 0 || longTerm.length > 0) && (
                      <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider pl-1">General</p>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exitReasons, setExitReasons] = useState<Record<string, "dismiss" | "added">>({});
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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
      <div className="flex flex-col gap-4">
        <div className="h-[52px] bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  const searched = searchQuery.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : items;

  const filtered = filterCategory
    ? searched.filter((i) => i.food_category === filterCategory)
    : searched;

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

  const sectionProps = { members, currentUserId, householdId, sort, expandedId, onToggleExpand: handleToggleExpand, onUpdateQuantity, onUpdateItem, onDelete, onAddToShoppingList };

  return (
    <div className="flex flex-col gap-4">
      <AddPantryItem onAdd={onAdd} members={members} currentUserId={currentUserId} householdId={householdId} existingNames={items.map((i) => i.name.toLowerCase())} />

      {items.length > 0 && (
        /* Search bar */
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
          </svg>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
            placeholder="Search pantry…"
            className="w-full pl-9 pr-3 py-2.5 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}

      {items.length > 0 && (
        /* Sort + category filter bar — sticky */
        <div className="sticky top-0 z-10 -mx-4 px-4 py-1.5 bg-gray-50/90 dark:bg-zinc-950/90 backdrop-blur-sm">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 active:scale-[0.94] ${
                sort === key
                  ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-200 dark:bg-zinc-700 flex-shrink-0 mx-0.5" />
          <button
            onClick={() => setFilterCategory("")}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 active:scale-[0.94] ${
              !filterCategory
                ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500"
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
                  ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        </div>
      )}

      {!hasItems && items.length === 0 ? (
        <div className="flex flex-col items-center py-14 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Your pantry is empty</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Add items to track what you have</p>
          </div>
        </div>
      ) : !hasItems ? (
        <div className="flex flex-col items-center py-10 gap-2">
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
            {searchQuery ? `No results for "${searchQuery}"` : "Nothing in this category"}
          </p>
          <button
            onClick={() => { setSearchQuery(""); setFilterCategory(""); }}
            className="text-xs text-gray-400 dark:text-gray-500 underline underline-offset-2 active:opacity-60"
          >
            Show all
          </button>
        </div>
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
                  <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.25a.75.75 0 01.75.75v11.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM12 18a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold text-amber-600">Running low</span>
                  <span className="text-xs text-amber-400 tabular-nums">({runningLowItems.length})</span>
                  <button
                    type="button"
                    onClick={() => runningLowItems.forEach((i) => dismissItem(i.id, "dismiss"))}
                    className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors active:opacity-60"
                  >
                    Dismiss all
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
                          isDark={isDark}
                          onIgnore={() => dismissItem(item.id, "dismiss")}
                          onAddedToList={() => handleAddedToList(item.id)}
                          members={members}
                          currentUserId={currentUserId}
                          householdId={householdId}
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
