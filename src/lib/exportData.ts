import { createClient } from "@/lib/supabase/client";

/**
 * "Download my data" — gathers everything the signed-in user can access via
 * their own RLS-scoped reads (profile, memberships, and for every household
 * they belong to: pantry, shopping, lists, recipes, stores) and triggers a
 * JSON file download. No server route needed: RLS already scopes every query
 * to what this user is allowed to see.
 */
export async function exportMyData(): Promise<void> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("household_members").select("household_id, role, joined_at").eq("user_id", user.id),
  ]);

  const householdIds = (memberships ?? []).map((m) => m.household_id);

  const households = await Promise.all(
    householdIds.map(async (hid) => {
      const [h, pantry, shopping, lists, recipes, stores] = await Promise.all([
        supabase.from("households").select("id, name, created_at").eq("id", hid).maybeSingle(),
        supabase.from("pantry_items").select("*").eq("household_id", hid),
        supabase.from("shopping_items").select("*").eq("household_id", hid),
        supabase.from("shopping_lists").select("*").eq("household_id", hid),
        supabase.from("household_recipes").select("*").eq("household_id", hid),
        supabase.from("household_stores").select("*").eq("household_id", hid),
      ]);
      return {
        household: h.data,
        pantry_items: pantry.data ?? [],
        shopping_items: shopping.data ?? [],
        shopping_lists: lists.data ?? [],
        recipes: recipes.data ?? [],
        stores: stores.data ?? [],
      };
    }),
  );

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { id: user.id, email: user.email },
    profile: profile ?? null,
    memberships: memberships ?? [],
    households,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `our-pantry-export-${new Date().toISOString().split("T")[0]}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
