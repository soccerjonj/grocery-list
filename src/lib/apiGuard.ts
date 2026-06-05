import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Shared gate for the paid LLM API routes. Enforces, in order:
 *   1. Authentication (signed-in user).
 *   2. Household membership — a brand-new account with no household cannot
 *      burn the Anthropic key (closes the "auth but no authz" finding).
 *   3. Per-user rate limit via the check_rate_limit RPC (migration 022),
 *      so a single account can't hammer the vision/extraction endpoints.
 *
 * Returns either `{ user }` (allowed) or `{ error }` (a NextResponse to
 * return immediately).
 */
export interface RateOpts {
  /** Logical bucket name, e.g. "extract-receipt". */
  bucket: string;
  /** Max calls allowed per window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

type GuardResult =
  | { user: User; supabase: ServerClient; error?: undefined }
  | { user?: undefined; supabase?: undefined; error: NextResponse };

export async function guardLlmRoute(opts: RateOpts): Promise<GuardResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }

  // Membership: must belong to at least one household. RLS lets a user read
  // their own membership rows, so this is a cheap scoped query.
  const { data: memberships } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1);
  if (!memberships || memberships.length === 0) {
    return { error: NextResponse.json({ error: "Join or create a household first" }, { status: 403 }) };
  }

  // Rate limit. Fail-open on RPC error (e.g. migration not yet applied) so a
  // transient DB issue doesn't break the feature — auth + membership still
  // gate access. The RPC counts this call atomically.
  const { data: allowed, error: rlError } = await supabase.rpc("check_rate_limit", {
    p_bucket: opts.bucket,
    p_limit: opts.limit,
    p_window_seconds: opts.windowSeconds,
  });
  if (rlError) {
    console.error("check_rate_limit failed (allowing):", rlError.message);
  } else if (allowed === false) {
    return {
      error: NextResponse.json(
        { error: "You're doing that too fast — please wait a moment and try again." },
        { status: 429 },
      ),
    };
  }

  return { user, supabase };
}
