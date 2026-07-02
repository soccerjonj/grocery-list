import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Deletes the signed-in user's account. Server-only because it needs the
 * service-role admin client to call auth.admin.deleteUser — the only way to
 * remove an auth user (which cascades their profile + household memberships).
 *
 * Guardrails:
 *  • Verifies the session (401 if none) and uses the session user id — never
 *    a client-supplied id.
 *  • Re-checks the sole-owner gate SERVER-SIDE (households_blocking_account_deletion):
 *    if the user solely owns a household that still has other members, we
 *    refuse with 409 and the blocking list. The client shows the same gate,
 *    but we never trust it.
 *  • Deletes households where the user was the ONLY member (avoids orphans).
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Sole-owner gate (runs as the user, so RLS + auth.uid() apply).
  const { data: blocking, error: blockErr } = await supabase
    .rpc("households_blocking_account_deletion");
  if (blockErr) {
    return NextResponse.json({ error: blockErr.message }, { status: 500 });
  }
  if (blocking && blocking.length > 0) {
    return NextResponse.json(
      { error: "resolve_households_first", blocking },
      { status: 409 },
    );
  }

  const admin = createAdminClient();

  // Delete households where this user is the only member (would otherwise be
  // orphaned when their membership cascades away).
  const { data: myMemberships } = await admin
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id);
  const householdIds = (myMemberships ?? []).map((m) => m.household_id as string);
  for (const hid of householdIds) {
    const { count } = await admin
      .from("household_members")
      .select("*", { count: "exact", head: true })
      .eq("household_id", hid);
    if ((count ?? 0) <= 1) {
      await admin.from("households").delete().eq("id", hid);
    }
  }

  // Remove the auth user — cascades profiles + household_members.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
