"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ConfirmedPage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function syncProfile() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const meta = user.user_metadata ?? {};
        const displayName =
          meta.display_name ||
          [meta.first_name, meta.last_name].filter(Boolean).join(" ") ||
          user.email?.split("@")[0] ||
          "";
        await supabase.from("profiles").upsert({
          id: user.id,
          display_name: displayName,
          ...(meta.color ? { color: meta.color } : {}),
        });
      }
      setReady(true);
    }
    syncProfile();
  }, []);

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
          Your account is ready. Sign in to create or join a household.
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
