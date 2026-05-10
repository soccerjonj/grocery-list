import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HouseholdProvider } from "@/context/HouseholdContext";
import { HouseholdDataProvider } from "@/context/HouseholdDataContext";
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

  // Single round-trip: verify membership AND pull the household name via
  // a PostgREST embedded select. Saves one network hop on every navigation
  // into a household route, which was a measurable chunk of cold-start time.
  const { data: membershipRaw } = await supabase
    .from("household_members")
    .select("role, households:household_id(id, name)")
    .eq("household_id", id)
    .eq("user_id", user.id)
    .single();

  // Supabase types the embed as an array; the FK is many-to-one so the
  // runtime value is a single object. Coerce defensively for both shapes.
  type MembershipShape = { role: string; households: { id: string; name: string } | { id: string; name: string }[] | null };
  const membership = membershipRaw as MembershipShape | null;
  const household = membership
    ? (Array.isArray(membership.households) ? membership.households[0] : membership.households)
    : null;

  if (!membership || !household) redirect("/dashboard");

  return (
    <ToastProvider>
      <HouseholdProvider householdId={household.id} householdName={household.name}>
        <HouseholdDataProvider householdId={household.id}>
          <PullToRefresh>
            <div className="min-h-dvh bg-gray-50 dark:bg-zinc-950" style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}>
              <PageTransition>{children}</PageTransition>
            </div>
          </PullToRefresh>
          <BottomNav householdId={household.id} />
        </HouseholdDataProvider>
      </HouseholdProvider>
    </ToastProvider>
  );
}
