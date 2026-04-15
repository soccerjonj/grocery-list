"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useShoppingLists } from "@/hooks/useShoppingLists";
import Spinner from "@/components/ui/Spinner";
import type { ShoppingList } from "@/types/database";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function ListCard({
  list,
  householdId,
  onArchive,
  onUnarchive,
  onDelete,
}: {
  list: ShoppingList;
  householdId: string;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isArchived = !!list.archived_at;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className={`relative bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${
        isArchived ? "opacity-60" : ""
      }`}
    >
      <Link
        href={`/household/${householdId}/shopping/${list.id}`}
        className="flex items-center gap-3 px-4 py-4"
      >
        {/* Cart icon */}
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            isArchived ? "bg-gray-100" : "bg-gray-900"
          }`}
        >
          <svg
            className={`w-5 h-5 ${isArchived ? "text-gray-400" : "text-white"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{list.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {isArchived ? "Archived · " : ""}
            {formatDate(list.created_at)}
          </p>
        </div>

        {!isArchived && (
          <svg
            className="w-4 h-4 text-gray-300 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        )}
      </Link>

      {/* Actions menu */}
      <div className="absolute top-3 right-3">
        <button
          onClick={(e) => {
            e.preventDefault();
            setMenuOpen((v) => !v);
          }}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="12" cy="5" r="1.5" />
            <circle cx="12" cy="12" r="1.5" />
            <circle cx="12" cy="19" r="1.5" />
          </svg>
        </button>

        <AnimatePresence>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setMenuOpen(false)}
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-8 z-20 bg-white rounded-xl border border-gray-100 shadow-lg overflow-hidden min-w-[140px]"
              >
                {isArchived ? (
                  <button
                    onClick={() => { onUnarchive(list.id); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Reopen list
                  </button>
                ) : (
                  <button
                    onClick={() => { onArchive(list.id); setMenuOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Archive list
                  </button>
                )}
                <button
                  onClick={() => { onDelete(list.id); setMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-red-500 hover:bg-red-50"
                >
                  Delete list
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function ShoppingPage() {
  const router = useRouter();
  const { householdId, householdName } = useHouseholdContext();
  const {
    activeLists,
    pastLists,
    loading,
    createList,
    archiveList,
    unarchiveList,
    deleteList,
  } = useShoppingLists(householdId);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [showPast, setShowPast] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreateLoading(true);
    const id = await createList(newName.trim());
    setCreateLoading(false);
    if (id) {
      setCreating(false);
      setNewName("");
      router.push(`/household/${householdId}/shopping/${id}`);
    }
  }

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
        <h1 className="text-2xl font-semibold text-gray-900">Shopping</h1>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Create new list */}
          <AnimatePresence mode="wait">
            {creating ? (
              <motion.form
                key="create-form"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                onSubmit={handleCreate}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex gap-2"
              >
                <input
                  autoFocus
                  type="text"
                  placeholder="List name (e.g. Weekly shop)"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => { setCreating(false); setNewName(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 px-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newName.trim() || createLoading}
                  className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-xl disabled:opacity-40 transition-opacity"
                >
                  {createLoading ? "Creating…" : "Create"}
                </button>
              </motion.form>
            ) : (
              <motion.button
                key="create-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setCreating(true)}
                className="flex items-center gap-3 bg-white rounded-2xl border border-dashed border-gray-200 px-4 py-3.5 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors w-full text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium">New shopping list</span>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Active lists */}
          {activeLists.length > 0 && (
            <div className="flex flex-col gap-2">
              <AnimatePresence>
                {activeLists.map((list) => (
                  <ListCard
                    key={list.id}
                    list={list}
                    householdId={householdId}
                    onArchive={archiveList}
                    onUnarchive={unarchiveList}
                    onDelete={deleteList}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          {activeLists.length === 0 && !creating && (
            <div className="text-center py-10 text-gray-400">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" />
              </svg>
              <p className="text-sm">No active lists</p>
              <p className="text-xs mt-1 opacity-60">Create a list to get started</p>
            </div>
          )}

          {/* Past lists */}
          {pastLists.length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-600 transition-colors py-1 w-full"
              >
                <motion.svg
                  animate={{ rotate: showPast ? 90 : 0 }}
                  transition={{ duration: 0.18 }}
                  className="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </motion.svg>
                <span>Past lists ({pastLists.length})</span>
              </button>

              <AnimatePresence>
                {showPast && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-2 pt-2">
                      <AnimatePresence>
                        {pastLists.map((list) => (
                          <ListCard
                            key={list.id}
                            list={list}
                            householdId={householdId}
                            onArchive={archiveList}
                            onUnarchive={unarchiveList}
                            onDelete={deleteList}
                          />
                        ))}
                      </AnimatePresence>
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
