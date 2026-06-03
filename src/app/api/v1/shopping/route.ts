import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/v1/shopping
 *
 * Read-only export of the household's current (active) shopping list, for
 * external dashboards like the Chrome new-tab extension. Returns active,
 * not-yet-cleared items.
 *
 * Auth: `Authorization: Bearer <DASHBOARD_API_TOKEN>` — a shared secret set
 * in the environment. This endpoint uses the Supabase service role and so
 * bypasses RLS; the token is the only gate, keep it secret.
 *
 * Household: uses DASHBOARD_HOUSEHOLD_ID if set. Otherwise, if the account
 * has exactly one household it uses that; with multiple it returns 400 and
 * lists them so you can pin one via the env var.
 *
 * Response:
 *   {
 *     household: { id, name },
 *     list: { id, name } | null,
 *     items: [{ id, name, quantity, unit, store, kind, completed,
 *               assigned_to, created_at }],
 *     generatedAt: string
 *   }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: Request) {
  const expected = process.env.DASHBOARD_API_TOKEN;
  if (!expected) {
    return json({ error: "Dashboard API not configured (set DASHBOARD_API_TOKEN)" }, 503);
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token || token !== expected) {
    return json({ error: "Unauthorized" }, 401);
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    return json({ error: (e as Error).message }, 503);
  }

  // Resolve the household.
  let householdId = process.env.DASHBOARD_HOUSEHOLD_ID?.trim() || "";
  let householdName = "";
  if (householdId) {
    const { data, error } = await supabase
      .from("households")
      .select("id, name")
      .eq("id", householdId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 502);
    if (!data) return json({ error: "DASHBOARD_HOUSEHOLD_ID not found" }, 404);
    householdName = data.name;
  } else {
    const { data, error } = await supabase
      .from("households")
      .select("id, name")
      .order("created_at", { ascending: true });
    if (error) return json({ error: error.message }, 502);
    if (!data || data.length === 0) return json({ error: "No households found" }, 404);
    if (data.length > 1) {
      return json(
        {
          error:
            "Multiple households — set DASHBOARD_HOUSEHOLD_ID to choose one.",
          households: data,
        },
        400
      );
    }
    householdId = data[0].id;
    householdName = data[0].name;
  }

  // Active (non-archived) shopping list — at most one per household (migration 017).
  const { data: lists, error: listErr } = await supabase
    .from("shopping_lists")
    .select("id, name")
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (listErr) return json({ error: listErr.message }, 502);
  const list = lists?.[0] ?? null;

  let items: unknown[] = [];
  if (list) {
    const { data: rows, error: itemErr } = await supabase
      .from("shopping_items")
      .select(
        "id, name, quantity, unit, store, kind, completed, assigned_to, created_at"
      )
      .eq("household_id", householdId)
      .eq("list_id", list.id)
      .is("cleared_at", null)
      .order("created_at", { ascending: true });
    if (itemErr) return json({ error: itemErr.message }, 502);
    items = rows ?? [];
  }

  return json({
    household: { id: householdId, name: householdName },
    list: list ? { id: list.id, name: list.name } : null,
    items,
    generatedAt: new Date().toISOString(),
  });
}
