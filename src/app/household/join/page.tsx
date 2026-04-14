"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { getErrorMessage } from "@/lib/utils";
import { Suspense } from "react";

function JoinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") ?? "");
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

      // Look up household by invite code
      const { data: household, error: lookupError } = await supabase
        .from("households")
        .select("id, name")
        .eq("invite_code", code.trim().toLowerCase())
        .single();

      if (lookupError || !household) {
        throw new Error("Invalid invite code. Please check and try again.");
      }

      // Check if already a member
      const { data: existing } = await supabase
        .from("household_members")
        .select("id")
        .eq("household_id", household.id)
        .eq("user_id", user.id)
        .single();

      if (existing) {
        // Already a member — just navigate
        router.push(`/household/${household.id}/pantry`);
        return;
      }

      // Ensure profile exists for this user
      const fullName =
        user.user_metadata?.display_name ||
        [user.user_metadata?.first_name, user.user_metadata?.last_name].filter(Boolean).join(" ") ||
        user.email?.split("@")[0] ||
        "";
      await supabase.from("profiles").upsert(
        { id: user.id, display_name: fullName },
        { onConflict: "id", ignoreDuplicates: true }
      );

      // Join the household
      const { error: joinError } = await supabase
        .from("household_members")
        .insert({ household_id: household.id, user_id: user.id, role: "member" });
      if (joinError) throw joinError;

      router.push(`/household/${household.id}/pantry`);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
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
          <h1 className="text-2xl font-semibold text-gray-900">Join a household</h1>
          <p className="text-sm text-gray-500 mt-1">
            Enter the invite code shared with you
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-sm font-medium text-gray-700">
                Invite code
              </label>
              <input
                id="code"
                type="text"
                placeholder="e.g. a1b2c3d4"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:ring-2 focus:ring-gray-900 focus:border-transparent outline-none font-mono tracking-widest text-center text-lg uppercase"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" loading={loading} className="w-full mt-1">
              Join household
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  );
}
