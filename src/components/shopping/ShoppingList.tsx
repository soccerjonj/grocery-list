"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ShoppingItem from "./ShoppingItem";
import CompletedSection from "./CompletedSection";
import AddShoppingItem from "./AddShoppingItem";
import Spinner from "@/components/ui/Spinner";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

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
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {store ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 active:opacity-60 transition-opacity"
        >
          <div className="flex items-center gap-2">
            <motion.svg
              animate={{ rotate: open ? 90 : 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="w-3 h-3 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </motion.svg>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{store}</span>
          </div>
          <span className="text-xs text-gray-300">{items.length}</span>
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
            <div className={`px-4 py-2 ${store ? "border-t border-gray-50" : ""}`}>
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
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const isEmpty = activeItems.length === 0 && completedItems.length === 0;
  const groups = groupByStore(activeItems);
  const hasStores = groups.some((g) => g.store);

  return (
    <div className="flex flex-col gap-3">
      {!readOnly && <AddShoppingItem onAdd={onAdd} householdId={householdId} members={members} currentUserId={currentUserId} />}

      {isEmpty ? (
        <div className="text-center py-12 text-gray-400">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" />
          </svg>
          <p className="text-sm">{readOnly ? "This list is empty" : "Your list is empty"}</p>
          {!readOnly && <p className="text-xs mt-1 opacity-60">Add items you need to pick up</p>}
        </div>
      ) : (
        <>
          {activeItems.length > 0 && (
            hasStores ? (
              <div className="flex flex-col gap-2">
                {groups.map((g) => (
                  <StoreGroup
                    key={g.store || "__none__"}
                    store={g.store}
                    items={g.items}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    onUpdate={onUpdate}
                    members={members}
                    currentUserId={currentUserId}
                    defaultOpen={true}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2">
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
            )
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
