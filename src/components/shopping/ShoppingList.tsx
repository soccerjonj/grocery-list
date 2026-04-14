"use client";

import { AnimatePresence } from "framer-motion";
import ShoppingItem from "./ShoppingItem";
import CompletedSection from "./CompletedSection";
import AddShoppingItem from "./AddShoppingItem";
import Spinner from "@/components/ui/Spinner";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";

interface ShoppingListProps {
  activeItems: ShoppingItemType[];
  completedItems: ShoppingItemType[];
  loading: boolean;
  onAdd: (name: string, quantity?: number, unit?: string) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export default function ShoppingList({
  activeItems,
  completedItems,
  loading,
  onAdd,
  onToggle,
  onDelete,
  onClearAll,
}: ShoppingListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  const isEmpty = activeItems.length === 0 && completedItems.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <AddShoppingItem onAdd={onAdd} />

      {isEmpty ? (
        <div className="text-center py-12 text-gray-400">
          <svg
            className="w-10 h-10 mx-auto mb-3 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z"
            />
          </svg>
          <p className="text-sm">Your list is empty</p>
          <p className="text-xs mt-1 opacity-60">Add items you need to pick up</p>
        </div>
      ) : (
        <>
          {activeItems.length > 0 && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-2">
              <AnimatePresence mode="popLayout">
                {activeItems.map((item) => (
                  <ShoppingItem
                    key={item.id}
                    item={item}
                    onToggle={onToggle}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          <CompletedSection
            items={completedItems}
            onToggle={onToggle}
            onDelete={onDelete}
            onClearAll={onClearAll}
          />
        </>
      )}
    </div>
  );
}
