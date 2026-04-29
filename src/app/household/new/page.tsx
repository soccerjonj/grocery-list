"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { getErrorMessage } from "@/lib/utils";

export default function NewHouseholdPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Ensure a profile row exists for this user (in case the trigger
      // didn't fire — e.g. the migration was applied after sign-up).
      const fullName =
        user.user_metadata?.display_name ||
        [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") ||
        user.email?.split("@")[0] ||
        "";
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: fullName },
        { onConflict: "id", ignoreDuplicates: true }
      );

      // Generate the ID client-side so we don't need .select() after insert.
      // (The SELECT policy requires membership, which doesn't exist yet at
      // insert time — using a pre-known ID sidesteps the timing issue.)
      const householdId = crypto.randomUUID();

      const { error: hhError } = await supabase
        .from("households")
        .insert({ id: householdId, name: name.trim(), created_by: user.id });
      if (hhError) throw hhError;

      // Add creator as owner
      const { error: memberError } = await supabase
        .from("household_members")
        .insert({ household_id: householdId, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;

      router.push(`/household/${householdId}/pantry`);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-zinc-950">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="w-full max-w-sm"
      >
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors active:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">New household</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create a space to share with your household
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              id="household-name"
              label="Household name"
              type="text"
              placeholder="Our Home"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
            />

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
              Create household
            </Button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
