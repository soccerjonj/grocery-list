"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { joinHouseholdWithCode } from "@/lib/inviteRpcs";

/**
 * Lands here after the user clicks the email confirmation link and the
 * /auth/callback route exchanges their auth code for a session.
 *
 * Two responsibilities:
 *  1. Sync the metadata captured at signup (display name, color) into the
 *     profiles table — the DB trigger handles a basic insert, this just
 *     ensures the color is applied.
 *  2. If the user signed up via an invite link, finish the join: read the
 *     `invite_code` from user_metadata, call the RPC, and redirect them
 *     straight to the pantry. They never see the dashboard.
 */
export default function ConfirmedPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [joinFailed, setJoinFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function syncAndMaybeJoin() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setReady(true);
        return;
      }

      const meta = user.user_metadata ?? {};
      const displayName =
        meta.display_name ||
        [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
        user.email?.split("@")[0] ||
        "";

      // Sync name + color to profiles
      await supabase.from("profiles").upsert({
        id: user.id,
        display_name: displayName,
        ...(meta.color ? { color: meta.color } : {}),
      });

      // Auto-join if there's a pending invite code in metadata
      const inviteCode: string | undefined = meta.invite_code;
      if (inviteCode) {
        try {
          const householdId = await joinHouseholdWithCode(inviteCode);
          if (!cancelled) router.replace(`/household/${householdId}/pantry`);
          return;
        } catch {
          // Household may have been deleted between signup and confirm, or
          // the code is otherwise invalid. Fall back to the standard
          // "Go to the app" → dashboard flow with a soft note.
          if (!cancelled) setJoinFailed(true);
        }
      }

      if (!cancelled) setReady(true);
    }

    syncAndMaybeJoin();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-2xl mb-6">
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Email confirmed!
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          {joinFailed
            ? "Your account is ready, but we couldn't join that household — the code may have expired. You can join from the dashboard."
            : "Your account is ready. Sign in to create or join a household."}
        </p>

        <Link
          href="/dashboard"
          className={`inline-flex items-center justify-center w-full bg-gray-900 text-white text-sm font-medium rounded-xl px-5 py-3 transition-all ${
            ready ? "hover:bg-gray-700 active:scale-[0.97]" : "opacity-50 pointer-events-none"
          }`}
        >
          {ready ? "Go to the app" : "Setting up your profile…"}
        </Link>
      </div>
    </div>
  );
}
