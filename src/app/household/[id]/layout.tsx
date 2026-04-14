import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HouseholdProvider } from "@/context/HouseholdContext";
import BottomNav from "@/components/ui/BottomNav";

export default async function HouseholdLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Verify membership
  const { data: membership } = await supabase
    .from("household_members")
    .select("role")
    .eq("household_id", id)
    .eq("user_id", user.id)
    .single();

  if (!membership) redirect("/dashboard");

  // Fetch household details separately
  const { data: householdData } = await supabase
    .from("households")
    .select("id, name")
    .eq("id", id)
    .single();

  if (!householdData) redirect("/dashboard");

  const household = householdData as { id: string; name: string };

  return (
    <HouseholdProvider householdId={household.id} householdName={household.name}>
      <div className="min-h-dvh pb-20">
        {children}
      </div>
      <BottomNav householdId={household.id} />
    </HouseholdProvider>
  );
}
