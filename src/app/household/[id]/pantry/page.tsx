"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams, useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { usePantry } from "@/hooks/usePantry";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import PantryList from "@/components/pantry/PantryList";
import InviteModal from "@/components/household/InviteModal";
import ImportToPantrySheet from "@/components/pantry/ImportToPantrySheet";
import ActivityBellButton from "@/components/household/ActivityBellFloat";
import { createClient } from "@/lib/supabase/client";
import { getPantryHint } from "@/lib/pantryHints";
import type { Kind } from "@/types/database";

function PantryPageInner() {
  const { householdId, householdName } = useHouseholdContext();
  const { items, loading, addItem, updateQuantity, updateItem, deleteItem } = usePantry(householdId);
  const { members, currentUserId } = useHouseholdMembers(householdId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [activeShoppingListId, setActiveShoppingListId] = useState<string | null>(null);

  // Kind tab — persisted per household
  const tabStorageKey = `pantry_kind_${householdId}`;
  const [kind, setKind] = useState<Kind>(() => {
    if (typeof window === "undefined") return "food";
    const saved = window.localStorage.getItem(tabStorageKey);
    return saved === "supplies" ? "supplies" : "food";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(tabStorageKey, kind);
    }
  }, [kind, tabStorageKey]);

  // Search — collapsed by default; expands to a slim input in the header
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (searchOpen) {
      // Focus on next tick so the slide-in animation has started
      setTimeout(() => searchInputRef.current?.focus(), 30);
    } else {
      setSearchQuery("");
    }
  }, [searchOpen]);

  const totals = {
    food: items.filter((i) => (i.kind ?? "food") === "food").length,
    supplies: items.filter((i) => i.kind === "supplies").length,
  };

  const searchParams = useSearchParams();
  const router = useRouter();
  const importListId = searchParams.get("import");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("households")
      .select("invite_code")
      .eq("id", householdId)
      .single()
      .then(({ data }) => {
        if (data) setInviteCode(data.invite_code);
      });
  }, [householdId]);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("shopping_lists")
      .select("id")
      .eq("household_id", householdId)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => setActiveShoppingListId(data?.[0]?.id ?? null));
  }, [householdId]);

  async function addToShoppingList(
    name: string,
    quantity?: number | null,
    unit?: string | null,
    store?: string | null,
    assignedTo?: string[] | null,
    kind?: string | null,
  ): Promise<boolean> {
    if (!activeShoppingListId) return false;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const resolvedKind = kind ?? getPantryHint(name)?.kind ?? "food";
    const { error } = await supabase.from("shopping_items").insert({
      household_id: householdId,
      list_id: activeShoppingListId,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      store: store ?? null,
      assigned_to: assignedTo ?? null,
      added_by: user?.id ?? null,
      kind: resolvedKind,
    });
    return !error;
  }

  function handleImportClose() {
    router.replace(`/household/${householdId}/pantry`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-4 pb-4">
      {/* Combined header: household label + kind tabs + actions
          (replaces the old "Pantry" h1 + segmented tab pill block — saves ~110px) */}
      <div className="mb-3">
        <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-0.5">
          {householdName}
        </p>
        <div className="flex items-baseline gap-4">
          {/* "Pantry" / "Supplies" tab title — active is full strength, inactive dimmed */}
          {(["food", "supplies"] as const).map((k) => {
            const active = kind === k;
            const label = k === "food" ? "Pantry" : "Supplies";
            const count = totals[k];
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={active}
                className={`relative pb-1 transition-colors active:opacity-70 ${
                  active
                    ? "text-gray-900 dark:text-gray-50"
                    : "text-gray-300 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-zinc-400"
                }`}
              >
                <h1 className="text-2xl font-semibold leading-none flex items-baseline gap-1.5">
                  {label}
                  {count > 0 && (
                    <span className={`text-xs font-medium tabular-nums ${active ? "text-gray-400 dark:text-zinc-500" : "text-gray-300 dark:text-zinc-600"}`}>
                      {count}
                    </span>
                  )}
                </h1>
                {/* Active underline indicator */}
                {active && (
                  <motion.span
                    layoutId="kind-tab-underline"
                    className="absolute -bottom-0.5 left-0 right-0 h-0.5 rounded-full bg-gray-900 dark:bg-zinc-100"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
              </button>
            );
          })}

          {/* Right-side actions */}
          <div className="ml-auto flex items-center gap-0.5 self-center">
            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label={searchOpen ? "Close search" : "Search"}
              aria-pressed={searchOpen}
              className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors active:opacity-60 ${
                searchOpen
                  ? "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200"
                  : "text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800"
              }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
              </svg>
            </button>
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

        {/* Search input — slides in only when toggled, so it costs zero height by default */}
        <AnimatePresence initial={false}>
          {searchOpen && (
            <motion.div
              key="search"
              initial={{ height: 0, opacity: 0, marginTop: 0 }}
              animate={{ height: "auto", opacity: 1, marginTop: 12 }}
              exit={{ height: 0, opacity: 0, marginTop: 0 }}
              transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden"
            >
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 111 11a6 6 0 0116 0z" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (searchQuery) setSearchQuery("");
                      else setSearchOpen(false);
                    }
                  }}
                  placeholder={`Search ${kind === "supplies" ? "supplies" : "pantry"}…`}
                  className="w-full pl-9 pr-9 py-2 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-xl text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Clear search"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PantryList
        items={items}
        loading={loading}
        members={members}
        currentUserId={currentUserId}
        householdId={householdId}
        kind={kind}
        searchQuery={searchQuery}
        onClearSearch={() => { setSearchQuery(""); setSearchOpen(false); }}
        onAdd={addItem}
        onUpdateQuantity={updateQuantity}
        onUpdateItem={updateItem}
        onDelete={deleteItem}
        onAddToShoppingList={addToShoppingList}
      />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        inviteCode={inviteCode}
        householdName={householdName}
      />

      {/* Import sheet — shown when ?import=<listId> is in the URL */}
      {importListId && (
        <ImportToPantrySheet
          listId={importListId}
          householdId={householdId}
          members={members}
          currentUserId={currentUserId}
          onAddItem={addItem}
          onClose={handleImportClose}
        />
      )}
    </div>
  );
}

export default function PantryPage() {
  return (
    <Suspense>
      <PantryPageInner />
    </Suspense>
  );
}
