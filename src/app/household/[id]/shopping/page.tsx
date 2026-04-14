"use client";

import Link from "next/link";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useShoppingList } from "@/hooks/useShoppingList";
import ShoppingList from "@/components/shopping/ShoppingList";

export default function ShoppingPage() {
  const { householdId, householdName } = useHouseholdContext();
  const {
    activeItems,
    completedItems,
    loading,
    addItem,
    toggleComplete,
    clearCompleted,
    deleteItem,
  } = useShoppingList(householdId);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
            {householdName}
          </p>
          <Link
            href="/settings"
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
            aria-label="Account settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        </div>
        <div className="flex items-end justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Shopping</h1>
          {activeItems.length > 0 && (
            <span className="text-sm text-gray-400 mb-0.5">
              {activeItems.length} item{activeItems.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <ShoppingList
        activeItems={activeItems}
        completedItems={completedItems}
        loading={loading}
        onAdd={addItem}
        onToggle={toggleComplete}
        onDelete={deleteItem}
        onClearAll={clearCompleted}
      />
    </div>
  );
}
