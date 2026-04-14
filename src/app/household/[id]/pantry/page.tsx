"use client";

import { useState } from "react";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { usePantry } from "@/hooks/usePantry";
import PantryList from "@/components/pantry/PantryList";
import InviteModal from "@/components/household/InviteModal";
import { createClient } from "@/lib/supabase/client";
import { useEffect } from "react";

export default function PantryPage() {
  const { householdId, householdName } = useHouseholdContext();
  const { items, loading, addItem, updateQuantity, deleteItem } = usePantry(householdId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

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
        <button
          onClick={() => setInviteOpen(true)}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded-xl px-3 py-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Invite
        </button>
      </div>

      <PantryList
        items={items}
        loading={loading}
        onAdd={addItem}
        onUpdateQuantity={updateQuantity}
        onDelete={deleteItem}
      />

      <InviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        inviteCode={inviteCode}
        householdName={householdName}
      />
    </div>
  );
}
