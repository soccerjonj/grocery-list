"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useShoppingFlow } from "@/hooks/useShoppingFlow";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import ShoppingList from "@/components/shopping/ShoppingList";
import Spinner from "@/components/ui/Spinner";
import type { ShoppingList as ShoppingListType } from "@/types/database";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: new Date(iso).getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

function PastTripRow({ list, householdId }: { list: ShoppingListType; householdId: string }) {
  return (
    <Link
      href={`/household/${householdId}/shopping/${list.id}`}
      className="flex items-center justify-between py-2.5 active:opacity-60 transition-opacity"
    >
      <div>
        <p className="text-sm text-gray-700">{list.name}</p>
        <p className="text-xs text-gray-400">{formatDate(list.archived_at!)}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export default function ShoppingPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { members, currentUserId } = useHouseholdMembers(householdId);
  const {
    activeItems,
    completedItems,
    pastLists,
    loading,
    finishing,
    addItem,
    updateItem,
    toggleComplete,
    deleteItem,
    finishTrip,
  } = useShoppingFlow(householdId);

  const router = useRouter();
  const [showPast, setShowPast] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [lastTripId, setLastTripId] = useState<string | null>(null);
  const [lastTripCount, setLastTripCount] = useState(0);

  const hasCompleted = completedItems.length > 0;

  async function handleFinishTrip() {
    const count = completedItems.length;
    setConfirmFinish(false);
    const archivedId = await finishTrip();
    if (archivedId) {
      setLastTripId(archivedId);
      setLastTripCount(count);
    }
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-0.5">
            {householdName}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900">Shopping</h1>
        </div>
        <Link
          href={`/household/${householdId}/members`}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors active:opacity-60"
          aria-label="Members"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
        </Link>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Shopping list ──────────────────────────────── */}
          <ShoppingList
            activeItems={activeItems}
            completedItems={completedItems}
            loading={false}
            householdId={householdId}
            members={members}
            currentUserId={currentUserId}
            onAdd={addItem}
            onUpdate={updateItem}
            onToggle={toggleComplete}
            onDelete={deleteItem}
            onClearAll={() => {}}
          />

          {/* ── Done shopping button ───────────────────────── */}
          <AnimatePresence>
            {hasCompleted && !confirmFinish && (
              <motion.button
                key="done-btn"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setConfirmFinish(true)}
                className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 text-white rounded-2xl text-sm font-medium shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Done shopping
                <span className="ml-0.5 text-xs text-white/60">
                  · {completedItems.length} item{completedItems.length !== 1 ? "s" : ""} checked
                </span>
              </motion.button>
            )}

            {confirmFinish && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex flex-col gap-2"
              >
                <p className="text-sm font-semibold text-gray-800 text-center">Finish this trip?</p>
                <p className="text-xs text-gray-400 text-center mb-1">
                  Checked items are saved to history.
                  {activeItems.length > 0 && ` ${activeItems.length} unchecked item${activeItems.length !== 1 ? "s" : ""} will carry over.`}
                </p>
                <button
                  onClick={handleFinishTrip}
                  disabled={finishing}
                  className="w-full py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl active:scale-[0.97] transition-all disabled:opacity-50"
                >
                  {finishing ? "Saving…" : "Yes, finish trip"}
                </button>
                <button
                  onClick={() => setConfirmFinish(false)}
                  className="w-full py-2 text-sm text-gray-400 active:opacity-60 transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Add to pantry prompt (after finishing a trip) ─ */}
          <AnimatePresence>
            {lastTripId && (
              <motion.div
                key="import-prompt"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.22 }}
                className="bg-white border border-gray-100 rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Trip saved!</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Want to add your {lastTripCount} item{lastTripCount !== 1 ? "s" : ""} to the pantry?
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/household/${householdId}/pantry?import=${lastTripId}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl active:scale-[0.97] transition-all"
                  >
                    Add to pantry
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setLastTripId(null)}
                    className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600 transition-colors active:opacity-60"
                  >
                    Later
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Past trips ─────────────────────────────────── */}
          {pastLists.length > 0 && (
            <div className="border-t border-gray-100 pt-3 mt-1">
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
                Past trips ({pastLists.length})
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
                    <div className="divide-y divide-gray-50 pl-1">
                      {pastLists.map((list) => (
                        <PastTripRow key={list.id} list={list} householdId={householdId} />
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
