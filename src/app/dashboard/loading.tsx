import AppShellSkeleton from "@/components/ui/AppShellSkeleton";

// Dashboard runs three Supabase queries before rendering and may redirect
// to /household/[id]/pantry. Show the skeleton meanwhile so the screen is
// never blank during the cold-start handoff.
export default function DashboardLoading() {
  return <AppShellSkeleton withBottomNav={false} cards={2} />;
}
