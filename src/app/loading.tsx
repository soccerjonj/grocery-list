import AppShellSkeleton from "@/components/ui/AppShellSkeleton";

// Root-level loading UI — covers the cold-start window for "/" while it
// auths and decides where to redirect (login vs dashboard vs household).
// Without this, Next.js shows nothing during SSR auth checks and the user
// sees a blank screen until the redirect chain completes.
export default function RootLoading() {
  return <AppShellSkeleton withBottomNav={false} />;
}
