"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useShoppingFlow } from "@/hooks/useShoppingFlow";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import ShoppingList from "@/components/shopping/ShoppingList";
import Spinner from "@/components/ui/Spinner";
import ActivityBellButton from "@/components/household/ActivityBellFloat";
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
        <p className="text-sm text-gray-700 dark:text-gray-300">{list.name}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{formatDate(list.archived_at!)}</p>
      </div>
      <svg className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Trip completion celebration overlay ────────────────────────────────
function TripCelebration({ count, onDone }: { count: number; onDone: () => void }) {
  useEffect(() => {
    // Dynamic import so confetti never runs server-side
    import("canvas-confetti").then(({ default: confetti }) => {
      const fire = (opts: object) =>
        confetti({
          colors: ["#ffffff", "#bbf7d0", "#4ade80", "#86efac", "#dcfce7", "#f0fdf4"],
          ...opts,
        });
      fire({ particleCount: 90, spread: 65, origin: { y: 0.52 } });
      setTimeout(() => fire({ particleCount: 55, spread: 75, angle: 60, origin: { x: 0.05, y: 0.58 } }), 130);
      setTimeout(() => fire({ particleCount: 55, spread: 75, angle: 120, origin: { x: 0.95, y: 0.58 } }), 260);
      setTimeout(() => fire({ particleCount: 30, spread: 50, origin: { y: 0.4 }, startVelocity: 18 }), 500);
    });

    const timer = setTimeout(onDone, 2700);
    return () => clearTimeout(timer);
  }, [onDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ background: "linear-gradient(150deg, #15803d 0%, #16a34a 45%, #22c55e 100%)" }}
      onClick={onDone}
    >
      {/* Spring-bounce circle */}
      <motion.div
        initial={{ scale: 0, rotate: -15 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 16, delay: 0.05 }}
        className="w-28 h-28 rounded-full flex items-center justify-center mb-8"
        style={{ background: "rgba(255,255,255,0.18)" }}
      >
        <svg
          className="w-14 h-14 text-white"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <motion.path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          />
        </svg>
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.32 }}
        className="text-white text-[2rem] font-bold tracking-tight leading-none"
      >
        Trip complete!
      </motion.p>

      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.42, duration: 0.3 }}
        className="mt-2.5 text-white/70 text-base"
      >
        {count} item{count !== 1 ? "s" : ""} checked off
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.45 }}
        transition={{ delay: 1.4, duration: 0.5 }}
        className="absolute bottom-12 text-white text-xs"
      >
        Tap to continue
      </motion.p>
    </motion.div>
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
  const [celebrating, setCelebrating] = useState(false);
  const [celebratingCount, setCelebratingCount] = useState(0);
  const [lastTripId, setLastTripId] = useState<string | null>(null);
  const [lastTripCount, setLastTripCount] = useState(0);

  const hasCompleted = completedItems.length > 0;

  async function handleFinishTrip() {
    const count = completedItems.length;
    setConfirmFinish(false);
    const archivedId = await finishTrip();
    if (archivedId) {
      setCelebratingCount(count);
      setCelebrating(true);
      setLastTripId(archivedId);
      setLastTripCount(count);
    }
  }

  const handleCelebrationDone = useCallback(() => {
    setCelebrating(false);
  }, []);

  return (
    <>
      {/* ── Celebration overlay (portal-like fixed layer) ─────── */}
      <AnimatePresence>
        {celebrating && (
          <TripCelebration count={celebratingCount} onDone={handleCelebrationDone} />
        )}
      </AnimatePresence>

      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        {/* ── Header ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide mb-0.5">
              {householdName}
            </p>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Shopping</h1>
          </div>
          <div className="flex items-center gap-2">
            <ActivityBellButton householdId={householdId} />
            <Link
              href={`/household/${householdId}/settings`}
              className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:opacity-60"
              aria-label="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
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
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-2xl text-sm font-medium shadow-sm"
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
                  className="bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-2xl p-4 flex flex-col gap-2"
                >
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 text-center">Finish this trip?</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-1">
                    Checked items are saved to history.
                    {activeItems.length > 0 && ` ${activeItems.length} unchecked item${activeItems.length !== 1 ? "s" : ""} will carry over.`}
                  </p>
                  <button
                    onClick={handleFinishTrip}
                    disabled={finishing}
                    className="w-full py-2.5 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-xl active:scale-[0.97] transition-all disabled:opacity-50"
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
              {lastTripId && !celebrating && (
                <motion.div
                  key="import-prompt"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.22 }}
                  className="bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-50">Trip saved!</p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        Want to add your {lastTripCount} item{lastTripCount !== 1 ? "s" : ""} to the pantry?
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/household/${householdId}/pantry?import=${lastTripId}`)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-xl active:scale-[0.97] transition-all"
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
              <div className="border-t border-gray-100 dark:border-zinc-800 pt-3 mt-1">
                <button
                  onClick={() => setShowPast((v) => !v)}
                  className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1 w-full active:opacity-60"
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
                      <div className="divide-y divide-gray-50 dark:divide-zinc-800 pl-1">
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
    </>
  );
}
