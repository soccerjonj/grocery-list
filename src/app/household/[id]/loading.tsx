import AppShellSkeleton from "@/components/ui/AppShellSkeleton";

// Covers the household-layout cold start (auth + membership + household
// fetch on the server) for any /household/[id]/* route that doesn't have
// its own loading.tsx.
export default function HouseholdLoading() {
  return <AppShellSkeleton />;
}
