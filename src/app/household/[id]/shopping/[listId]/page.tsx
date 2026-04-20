"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useShoppingList } from "@/hooks/useShoppingList";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import ShoppingList from "@/components/shopping/ShoppingList";
import Spinner from "@/components/ui/Spinner";

export default function ShoppingListDetailPage() {
  const params = useParams();
  const listId = params.listId as string;

  const { householdId, householdName } = useHouseholdContext();
  const { members, currentUserId } = useHouseholdMembers(householdId);
  const {
    activeItems,
    completedItems,
    loading,
    addItem,
    toggleComplete,
    clearCompleted,
    deleteItem,
  } = useShoppingList(householdId, listId);

  const { lists, archiveList } = useShoppingLists(householdId);
  const list = lists.find((l) => l.id === listId);
  const isArchived = !!list?.archived_at;

  const [archiving, setArchiving] = useState(false);

  async function handleArchive() {
    setArchiving(true);
    await archiveList(listId);
    setArchiving(false);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <Link
            href={`/household/${householdId}/shopping`}
            className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Shopping
          </Link>

          <div className="flex items-center gap-2">
            {!isArchived && (
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="text-xs text-gray-400 hover:text-gray-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {archiving ? "Archiving…" : "Archive list"}
              </button>
            )}
            {isArchived && (
              <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                Archived
              </span>
            )}
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
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-0.5">
              {householdName}
            </p>
            {loading ? (
              <div className="h-8 w-40 bg-gray-100 rounded-lg animate-pulse" />
            ) : (
              <h1 className="text-2xl font-semibold text-gray-900">
                {list?.name ?? "Shopping list"}
              </h1>
            )}
          </div>
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
        householdId={householdId}
        members={members}
        currentUserId={currentUserId}
        onAdd={addItem}
        onToggle={toggleComplete}
        onDelete={deleteItem}
        onClearAll={clearCompleted}
        readOnly={isArchived}
      />
    </div>
  );
}
