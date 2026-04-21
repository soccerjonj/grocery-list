"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { usePantry } from "@/hooks/usePantry";
import { useHouseholdMembers } from "@/hooks/useHouseholdMembers";
import PantryList from "@/components/pantry/PantryList";
import InviteModal from "@/components/household/InviteModal";
import ImportToPantrySheet from "@/components/pantry/ImportToPantrySheet";
import { createClient } from "@/lib/supabase/client";

function PantryPageInner() {
  const { householdId, householdName } = useHouseholdContext();
  const { items, loading, addItem, updateQuantity, updateItem, deleteItem } = usePantry(householdId);
  const { members, currentUserId } = useHouseholdMembers(householdId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [activeShoppingListId, setActiveShoppingListId] = useState<string | null>(null);

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

  async function addToShoppingList(name: string): Promise<boolean> {
    if (!activeShoppingListId) return false;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { error } = await supabase.from("shopping_items").insert({
      household_id: householdId,
      list_id: activeShoppingListId,
      name,
      added_by: user?.id ?? null,
    });
    return !error;
  }

  function handleImportClose() {
    router.replace(`/household/${householdId}/pantry`);
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest mb-0.5">
            {householdName}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900">Pantry</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInviteOpen(true)}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-2 transition-colors active:scale-[0.95] active:bg-gray-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            Invite
          </button>
          <Link
            href={`/household/${householdId}/members`}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors active:opacity-60"
            aria-label="Household members"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        </div>
      </div>

      <PantryList
        items={items}
        loading={loading}
        members={members}
        currentUserId={currentUserId}
        householdId={householdId}
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
