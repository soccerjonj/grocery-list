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
    updateItem,
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
              <>
                <span className="text-xs text-gray-400 bg-gray-100 px-2.5 py-1.5 rounded-lg">
                  Archived
                </span>
                <Link
                  href={`/household/${householdId}/pantry?import=${listId}`}
                  className="text-xs text-gray-700 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg transition-colors font-medium"
                >
                  Add to pantry
                </Link>
              </>
            )}
            <Link
              href={`/household/${householdId}/settings`}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              aria-label="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
        onUpdate={updateItem}
        onToggle={toggleComplete}
        onDelete={deleteItem}
        onClearAll={clearCompleted}
        readOnly={isArchived}
      />
    </div>
  );
}
