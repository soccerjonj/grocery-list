"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ShoppingItem from "./ShoppingItem";
import CompletedSection from "./CompletedSection";
import AddShoppingItem from "./AddShoppingItem";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { FOOD_CATEGORIES, SUPPLIES_CATEGORIES } from "@/types/database";
import { getPantryHint } from "@/lib/pantryHints";

interface ShoppingListProps {
  activeItems: ShoppingItemType[];
  completedItems: ShoppingItemType[];
  loading: boolean;
  householdId: string;
  members?: MemberProfile[];
  currentUserId?: string | null;
  onAdd: (name: string, quantity?: number, unit?: string, store?: string, assignedTo?: string[] | null) => void;
  onUpdate?: (id: string, fields: Partial<Pick<ShoppingItemType, "name" | "quantity" | "unit" | "store" | "assigned_to">>) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll?: () => void;
  readOnly?: boolean;
}

function groupByStore(items: ShoppingItemType[]): { store: string; items: ShoppingItemType[] }[] {
  const map = new Map<string, ShoppingItemType[]>();
  for (const item of items) {
    const key = item.store?.trim() || "";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  // Named stores first (sorted), then ungrouped at the end
  const named = [...map.entries()].filter(([k]) => k).sort(([a], [b]) => a.localeCompare(b));
  const ungrouped = map.get("") ?? [];
  return [
    ...named.map(([store, items]) => ({ store, items })),
    ...(ungrouped.length ? [{ store: "", items: ungrouped }] : []),
  ];
}

// ── Aisle grouping (T3-A) ──────────────────────────────────────────────
// Order is opinionated to roughly match a typical grocery store walk:
// produce on the way in, then meat/dairy/etc., snacks/grains last.
// Supplies categories slot after food categories.
const AISLE_ORDER: string[] = [
  "produce", "meat", "dairy", "drinks", "condiments", "grains", "snacks", "prepared", "other",
  // Supplies aisles — usually a separate side of the store
  "cleaning", "personal_care", "paper_goods", "pet",
];
const AISLE_LABEL = Object.fromEntries(
  [...FOOD_CATEGORIES, ...SUPPLIES_CATEGORIES].map((c) => [c.value, c.label]),
);

/**
 * Group items by food_category, falling back to a `pantryHints` lookup for
 * items that haven't had their category written yet (shopping-only items
 * skip the pantry add flow). Returns groups in AISLE_ORDER, with a final
 * "Uncategorized" bucket for anything we couldn't classify.
 */
function groupByAisle(items: ShoppingItemType[]): { aisle: string; label: string; items: ShoppingItemType[] }[] {
  const map = new Map<string, ShoppingItemType[]>();
  for (const item of items) {
    // shopping_items don't have a food_category column today — fall back to
    // the keyword classifier we already use elsewhere.
    const hint = getPantryHint(item.name);
    const aisle = hint?.food_category || "";
    if (!map.has(aisle)) map.set(aisle, []);
    map.get(aisle)!.push(item);
  }
  const groups: { aisle: string; label: string; items: ShoppingItemType[] }[] = [];
  for (const aisle of AISLE_ORDER) {
    const items = map.get(aisle);
    if (items?.length) groups.push({ aisle, label: AISLE_LABEL[aisle] ?? aisle, items });
  }
  // Anything left over (no category at all) → "Uncategorized" at the bottom.
  const leftover = map.get("");
  if (leftover?.length) {
    groups.push({ aisle: "", label: "Uncategorized", items: leftover });
  }
  return groups;
}

type Grouping = "store" | "aisle";

const GROUPING_KEY = (householdId: string) => `shopping_grouping_${householdId}`;

function SkeletonList() {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm px-4 py-1.5">
      {[65, 45, 78, 55].map((w, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-gray-50 dark:border-zinc-800 last:border-0">
          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
          <div className="flex-1">
            <div className="h-3.5 rounded-full bg-gray-100 dark:bg-zinc-800 animate-pulse" style={{ width: `${w}%` }} />
          </div>
          <div className="w-6 h-6 rounded-lg bg-gray-50 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

function StoreGroup({
  store,
  items,
  onToggle,
  onDelete,
  onUpdate,
  members,
  currentUserId,
  defaultOpen,
}: {
  store: string;
  items: ShoppingItemType[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: ShoppingListProps["onUpdate"];
  members: MemberProfile[];
  currentUserId: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden">
      {store ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 dark:active:bg-zinc-800 transition-colors"
        >
          <div className="flex items-center gap-2">
            <motion.svg
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="w-3 h-3 text-gray-400 dark:text-gray-500"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </motion.svg>
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{store}</span>
          </div>
          <span className="text-xs font-medium text-gray-300 dark:text-gray-600 tabular-nums">{items.length}</span>
        </button>
      ) : null}

      <AnimatePresence initial={false}>
        {(!store || open) && (
          <motion.div
            key="items"
            initial={store ? { height: 0 } : false}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className={`px-4 py-2 ${store ? "border-t border-gray-50 dark:border-zinc-800" : ""}`}>
              <AnimatePresence mode="popLayout">
                {items.map((item) => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                    members={members}
                    currentUserId={currentUserId}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ShoppingList({
  activeItems,
  completedItems,
  loading,
  householdId,
  members = [],
  currentUserId = null,
  onAdd,
  onUpdate,
  onToggle,
  onDelete,
  onClearAll,
  readOnly = false,
}: ShoppingListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {!readOnly && <div className="h-[52px] bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse" />}
        <SkeletonList />
      </div>
    );
  }

  // Grouping preference, scoped per household + persisted (T3-A).
  // Defaults to "store" — what every existing user is used to.
  const [grouping, setGrouping] = useState<Grouping>("store");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(GROUPING_KEY(householdId));
    if (saved === "store" || saved === "aisle") setGrouping(saved);
  }, [householdId]);
  function changeGrouping(g: Grouping) {
    setGrouping(g);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(GROUPING_KEY(householdId), g);
    }
  }

  const isEmpty = activeItems.length === 0 && completedItems.length === 0;
  const storeGroups = groupByStore(activeItems);
  const aisleGroups = groupByAisle(activeItems);
  const hasStores = storeGroups.some((g) => g.store);
  // Aisle view always groups (even single-aisle), since the value is the
  // labelled section. Store view falls back to a flat list if no stores set.
  const showGroups = grouping === "aisle" || hasStores;

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && (
        <AddShoppingItem
          onAdd={onAdd}
          householdId={householdId}
          members={members}
          currentUserId={currentUserId}
          existingNames={[...activeItems, ...completedItems].map((i) => i.name)}
        />
      )}

      {isEmpty ? (
        <div className="flex flex-col items-center py-14 gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{readOnly ? "This list is empty" : "Your list is empty"}</p>
            {!readOnly && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Add what you need to pick up</p>}
          </div>
        </div>
      ) : (
        <>
          {activeItems.length > 0 && (
            <>
              {/* Grouping toggle (T3-A). Tiny segmented control — only
                  visible when there's enough content to actually group. */}
              {activeItems.length >= 3 && (
                <div className="flex justify-end px-1">
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-gray-100 dark:bg-zinc-800">
                    {(["store", "aisle"] as const).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => changeGrouping(g)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors active:scale-[0.94] ${
                          grouping === g
                            ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                            : "text-gray-500 dark:text-gray-400"
                        }`}
                      >
                        {g === "store" ? "By store" : "By aisle"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showGroups ? (
                <div className="flex flex-col gap-2">
                  {(grouping === "aisle" ? aisleGroups : storeGroups).map((g) => {
                    // Normalise: aisle groups use `aisle`+`label`, store groups
                    // use `store`. We render with StoreGroup's API, passing the
                    // display label as the `store` arg.
                    const isAisle = "aisle" in g;
                    const headerLabel = isAisle ? g.label : g.store;
                    const groupKey = isAisle ? `aisle:${g.aisle || "__none__"}` : `store:${g.store || "__none__"}`;
                    return (
                      <StoreGroup
                        key={groupKey}
                        store={headerLabel}
                        items={g.items}
                        onToggle={onToggle}
                        onDelete={onDelete}
                        onUpdate={onUpdate}
                        members={members}
                        currentUserId={currentUserId}
                        defaultOpen={true}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm px-4 py-2">
                  <AnimatePresence mode="popLayout">
                    {activeItems.map((item) => (
                      <ShoppingItem
                        key={item.id}
                        item={item}
                        onToggle={onToggle}
                        onDelete={onDelete}
                        onUpdate={onUpdate}
                        members={members}
                        currentUserId={currentUserId}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}

          <CompletedSection
            items={completedItems}
            onToggle={onToggle}
            onDelete={onDelete}
            onClearAll={onClearAll}
            members={members}
            currentUserId={currentUserId}
          />
        </>
      )}
    </div>
  );
}
