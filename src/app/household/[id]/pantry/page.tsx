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
import ActivityBellButton from "@/components/household/ActivityBellFloat";
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

  async function addToShoppingList(
    name: string,
    quantity?: number | null,
    unit?: string | null,
    store?: string | null,
    assignedTo?: string[] | null,
  ): Promise<boolean> {
    if (!activeShoppingListId) return false;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("shopping_items").insert({
      household_id: householdId,
      list_id: activeShoppingListId,
      name,
      quantity: quantity ?? null,
      unit: unit ?? null,
      store: store ?? null,
      assigned_to: assignedTo ?? null,
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
          <p className="text-xs text-gray-400 font-medium tracking-wide mb-0.5">
            {householdName}
          </p>
          <h1 className="text-2xl font-semibold text-gray-900">Pantry</h1>
        </div>
        <div className="flex items-center gap-2">
          <ActivityBellButton householdId={householdId} />
          <Link
            href={`/household/${householdId}/settings`}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors active:opacity-60"
            aria-label="Settings"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28zM15 12a3 3 0 11-6 0 3 3 0 016 0z" />
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
