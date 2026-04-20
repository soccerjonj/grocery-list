"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import { useShoppingList } from "@/hooks/useShoppingList";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import ShoppingList from "@/components/shopping/ShoppingList";
import Spinner from "@/components/ui/Spinner";
import type { ShoppingList as ShoppingListType } from "@/types/database";

function defaultListName() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

// ── Past list row ─────────────────────────────────────────────────

function PastListRow({
  list,
  householdId,
  onUnarchive,
  onDelete,
}: {
  list: ShoppingListType;
  householdId: string;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <Link
        href={`/household/${householdId}/shopping/${list.id}`}
        className="flex-1 min-w-0 active:opacity-60"
      >
        <p className="text-sm text-gray-600 truncate">{list.name}</p>
        <p className="text-xs text-gray-400">{formatDate(list.created_at)}</p>
      </Link>
      <button
        onClick={() => onUnarchive(list.id)}
        className="text-xs text-gray-400 hover:text-gray-700 transition-colors flex-shrink-0 active:opacity-60"
      >
        Reopen
      </button>
      <button
        onClick={() => onDelete(list.id)}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
        aria-label="Delete list"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function ShoppingPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { members, currentUserId } = useHouseholdMembers(householdId);
  const {
    activeLists,
    pastLists,
    loading: listsLoading,
    createList,
    archiveList,
    unarchiveList,
    deleteList,
  } = useShoppingLists(householdId);

  // The current open list is always the most-recent active one
  const currentList = activeLists[0] ?? null;

  const {
    activeItems,
    completedItems,
    loading: itemsLoading,
    addItem,
    updateItem,
    toggleComplete,
    clearCompleted,
    deleteItem,
  } = useShoppingList(householdId, currentList?.id ?? "");

  // Create-new state — opened automatically after marking a list done
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(defaultListName);
  const [createLoading, setCreateLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name input when the create panel opens
  useEffect(() => {
    if (creating) {
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [creating]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const name = newName.trim() || defaultListName();
    setCreateLoading(true);
    await createList(name);
    setCreateLoading(false);
    setCreating(false);
    setNewName(defaultListName());
  }

  async function handleMarkDone() {
    if (!currentList) return;
    setMarkingDone(true);
    await archiveList(currentList.id);
    setMarkingDone(false);
    // Prompt to start the next list
    setNewName(defaultListName());
    setCreating(true);
  }

  const loading = listsLoading;

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-0.5">
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
            {householdName}
          </p>
          <Link
            href={`/household/${householdId}/members`}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors active:opacity-60"
            aria-label="Account settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Shopping</h1>
            {currentList && (
              <p className="text-xs text-gray-400 mt-0.5">{currentList.name}</p>
            )}
          </div>

          {/* Mark as done — only when a list is open */}
          {currentList && !creating && (
            <button
              onClick={handleMarkDone}
              disabled={markingDone}
              className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-2 transition-colors disabled:opacity-40 active:scale-[0.95] active:bg-gray-200"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {markingDone ? "Saving…" : "Done with list"}
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Create new list panel ──────────────────────── */}
          <AnimatePresence>
            {creating && (
              <motion.form
                key="create"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                onSubmit={handleCreate}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3.5 flex items-center gap-2"
              >
                <input
                  ref={nameInputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="List name"
                  className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
                />
                {currentList === null && (
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="text-xs text-gray-400 hover:text-gray-600 px-1 flex-shrink-0"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-xl disabled:opacity-40 transition-all active:scale-[0.96] active:bg-gray-800 flex-shrink-0"
                >
                  {createLoading ? "Creating…" : "Start list"}
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* ── No active list, not creating ──────────────── */}
          {!currentList && !creating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-14 text-gray-400"
            >
              <svg className="w-10 h-10 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" />
              </svg>
              <p className="text-sm mb-4">No active list</p>
              <button
                onClick={() => { setNewName(defaultListName()); setCreating(true); }}
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-xl active:scale-[0.97] active:bg-gray-800 transition-all"
              >
                Start a new list
              </button>
            </motion.div>
          )}

          {/* ── Current list items ─────────────────────────── */}
          {currentList && (
            <ShoppingList
              activeItems={activeItems}
              completedItems={completedItems}
              loading={itemsLoading}
              householdId={householdId}
              members={members}
              currentUserId={currentUserId}
              onAdd={addItem}
              onUpdate={updateItem}
              onToggle={toggleComplete}
              onDelete={deleteItem}
              onClearAll={clearCompleted}
            />
          )}

          {/* ── Past lists ─────────────────────────────────── */}
          {pastLists.length > 0 && (
            <div className="mt-2 border-t border-gray-100 pt-3">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-gray-600 transition-colors py-1 w-full active:opacity-60"
              >
                <motion.svg
                  animate={{ rotate: showPast ? 90 : 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </motion.svg>
                Past lists ({pastLists.length})
              </button>

              <AnimatePresence>
                {showPast && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="divide-y divide-gray-50">
                      {pastLists.map((list) => (
                        <PastListRow
                          key={list.id}
                          list={list}
                          householdId={householdId}
                          onUnarchive={unarchiveList}
                          onDelete={deleteList}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
