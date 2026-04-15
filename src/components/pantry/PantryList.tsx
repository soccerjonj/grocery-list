"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import PantryItem from "./PantryItem";
import AddPantryItem from "./AddPantryItem";
import Spinner from "@/components/ui/Spinner";
import type { PantryItem as PantryItemType } from "@/types/database";
import { STORAGE_LOCATIONS, FOOD_CATEGORIES } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

interface PantryListProps {
  items: PantryItemType[];
  loading: boolean;
  members: MemberProfile[];
  currentUserId: string | null;
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}

type SortKey = "expiry" | "name" | "category" | "added";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "expiry",    label: "Expiry" },
  { key: "name",     label: "Name" },
  { key: "category", label: "Category" },
  { key: "added",    label: "Recently added" },
];

function sortItems(items: PantryItemType[], sort: SortKey): PantryItemType[] {
  return [...items].sort((a, b) => {
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
    // added — newest first
    return b.created_at.localeCompare(a.created_at);
  });
}

interface SectionProps {
  label: string;
  emoji: string;
  items: PantryItemType[];
  members: MemberProfile[];
  currentUserId: string | null;
  sort: SortKey;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}

function StorageSection({
  label,
  emoji,
  items,
  members,
  currentUserId,
  sort,
  onUpdateQuantity,
  onDelete,
}: SectionProps) {
  const [open, setOpen] = useState(true);
  if (items.length === 0) return null;

  // For fridge: subdivide into quick-use, long-term, unzoned
  const isFridge = label === "Fridge";
  const quickUse = isFridge ? items.filter((i) => i.fridge_zone === "quick_use") : [];
  const longTerm = isFridge ? items.filter((i) => i.fridge_zone === "long_term") : [];
  const unzoned  = isFridge ? items.filter((i) => !i.fridge_zone) : items;

  return (
    <div className="flex flex-col gap-1">
      {/* Section header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 py-1"
      >
        <motion.svg
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ duration: 0.18 }}
          className="w-3.5 h-3.5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </motion.svg>
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          {emoji} {label}
        </span>
        <span className="text-xs text-gray-400">({items.length})</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            {isFridge ? (
              <div className="flex flex-col gap-3 pl-1">
                {quickUse.length > 0 && (
                  <Subsection label="Quick-use" items={sortItems(quickUse, sort)} members={members} currentUserId={currentUserId} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
                )}
                {longTerm.length > 0 && (
                  <Subsection label="Long-term" items={sortItems(longTerm, sort)} members={members} currentUserId={currentUserId} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
                )}
                {unzoned.length > 0 && (
                  <Subsection label={undefined} items={sortItems(unzoned, sort)} members={members} currentUserId={currentUserId} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2 pl-1">
                <AnimatePresence>
                  {sortItems(unzoned, sort).map((item) => (
                    <PantryItem
                      key={item.id}
                      item={item}
                      members={members}
                      currentUserId={currentUserId}
                      onUpdateQuantity={onUpdateQuantity}
                      onDelete={onDelete}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Subsection({
  label,
  items,
  members,
  currentUserId,
  onUpdateQuantity,
  onDelete,
}: {
  label?: string;
  items: PantryItemType[];
  members: MemberProfile[];
  currentUserId: string | null;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <p className="text-xs text-gray-400 font-medium pl-1">{label}</p>
      )}
      <div className="flex flex-col gap-2">
        <AnimatePresence>
          {items.map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              members={members}
              currentUserId={currentUserId}
              onUpdateQuantity={onUpdateQuantity}
              onDelete={onDelete}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function PantryList({
  items,
  loading,
  members,
  currentUserId,
  onAdd,
  onUpdateQuantity,
  onDelete,
}: PantryListProps) {
  const [sort, setSort] = useState<SortKey>("expiry");
  const [filterCategory, setFilterCategory] = useState<string>("");

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

  // Group by storage location
  const fridgeItems    = filtered.filter((i) => i.storage_location === "fridge");
  const freezerItems   = filtered.filter((i) => i.storage_location === "freezer");
  const pantryItems    = filtered.filter((i) => i.storage_location === "pantry");
  const roomTempItems  = filtered.filter((i) => i.storage_location === "room_temp");
  const unsortedItems  = filtered.filter((i) => !i.storage_location);

  const hasItems = filtered.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <AddPantryItem onAdd={onAdd} members={members} currentUserId={currentUserId} />

      {items.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {/* Sort + filter bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
            <span className="text-xs text-gray-400 font-medium flex-shrink-0">Sort:</span>
            {SORT_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSort(key)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
                  sort === key
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
            <span className="text-xs text-gray-300 flex-shrink-0">|</span>
            <button
              onClick={() => setFilterCategory("")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
                !filterCategory
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All
            </button>
            {FOOD_CATEGORIES.map(({ value, emoji }) => (
              <button
                key={value}
                onClick={() => setFilterCategory(filterCategory === value ? "" : value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex-shrink-0 ${
                  filterCategory === value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {!hasItems && items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4" />
          </svg>
          <p className="text-sm">Your pantry is empty</p>
          <p className="text-xs mt-1 opacity-60">Add items to track what you have</p>
        </div>
      ) : !hasItems ? (
        <div className="text-center py-8 text-gray-400">
          <p className="text-sm">No items in this category</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <StorageSection label="Fridge"   emoji="🧊" items={fridgeItems}   members={members} currentUserId={currentUserId} sort={sort} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
          <StorageSection label="Freezer"  emoji="❄️" items={freezerItems}  members={members} currentUserId={currentUserId} sort={sort} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
          <StorageSection label="Pantry"   emoji="🏪" items={pantryItems}   members={members} currentUserId={currentUserId} sort={sort} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
          <StorageSection label="Counter"  emoji="🌡️" items={roomTempItems} members={members} currentUserId={currentUserId} sort={sort} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
          {unsortedItems.length > 0 && (
            <StorageSection label="Other"  emoji="📦" items={unsortedItems} members={members} currentUserId={currentUserId} sort={sort} onUpdateQuantity={onUpdateQuantity} onDelete={onDelete} />
          )}
        </div>
      )}
    </div>
  );
}
