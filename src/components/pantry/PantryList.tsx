"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PantryItem from "./PantryItem";
import AddPantryItem from "./AddPantryItem";
import Spinner from "@/components/ui/Spinner";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

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
  onAddToShoppingList?: (name: string) => Promise<boolean>;
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
  onAddToShoppingList?: (name: string) => Promise<boolean>;
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
        {sortItems(group, sort).map((item) => (
          <PantryItem
            key={item.id}
            item={item}
            expanded={expandedId === item.id}
            onToggleExpand={() => onToggleExpand(item.id)}
            {...itemProps}
          />
        ))}
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
                {unzoned.length > 0 && renderGrid(unzoned)}
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

  const fridgeItems   = filtered.filter((i) => i.storage_location === "fridge");
  const freezerItems  = filtered.filter((i) => i.storage_location === "freezer");
  const pantryItems   = filtered.filter((i) => i.storage_location === "pantry");
  const roomTempItems = filtered.filter((i) => i.storage_location === "room_temp");
  const unsortedItems = filtered.filter((i) => !i.storage_location);

  const hasItems = filtered.length > 0;

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
