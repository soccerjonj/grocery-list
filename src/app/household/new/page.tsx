"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

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

      // Create household
      const { data: household, error: hhError } = await supabase
        .from("households")
        .insert({ name: name.trim(), created_by: user.id })
        .select()
        .single();
      if (hhError) throw hhError;

      // Add creator as owner
      const { error: memberError } = await supabase
        .from("household_members")
        .insert({ household_id: household.id, user_id: user.id, role: "owner" });
      if (memberError) throw memberError;

      router.push(`/household/${household.id}/pantry`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm">
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
        </div>

        <div className="mb-7">
          <h1 className="text-2xl font-semibold text-gray-900">New household</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create a space to share with your household
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
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
      </div>
    </div>
  );
}
