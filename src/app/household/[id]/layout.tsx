import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HouseholdProvider } from "@/context/HouseholdContext";
import { ToastProvider } from "@/context/ToastContext";
import BottomNav from "@/components/ui/BottomNav";
import PageTransition from "@/components/ui/PageTransition";
import PullToRefresh from "@/components/ui/PullToRefresh";

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
    <ToastProvider>
      <HouseholdProvider householdId={household.id} householdName={household.name}>
        <PullToRefresh>
          <div className="min-h-dvh bg-gray-50 dark:bg-zinc-950" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
            <PageTransition>{children}</PageTransition>
          </div>
        </PullToRefresh>
        <BottomNav householdId={household.id} />
      </HouseholdProvider>
    </ToastProvider>
  );
}
