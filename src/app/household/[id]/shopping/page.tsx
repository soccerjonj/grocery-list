"use client";

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
        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-0.5">
          {householdName}
        </p>
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
