import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  // Fetch household IDs this user belongs to
  const { data: memberRows } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", user.id);

  const householdIds: string[] = (memberRows ?? []).map(
    (m: { household_id: string }) => m.household_id
  );

  let households: Array<{ id: string; name: string }> = [];
  if (householdIds.length > 0) {
    const { data } = await supabase
      .from("households")
      .select("id, name")
      .in("id", householdIds);
    households = (data ?? []) as Array<{ id: string; name: string }>;
  }

  // If exactly one household, jump straight in
  if (households.length === 1) {
    redirect(`/household/${households[0].id}/pantry`);
  }

  async function signOut() {
    "use server";
    const supabase2 = await createClient();
    await supabase2.auth.signOut();
    redirect("/auth/login");
  }

  // Prefer first_name from auth metadata, fall back to the first
  // word of display_name, then to the email prefix
  const firstName: string =
    user.user_metadata?.first_name ||
    (user.user_metadata?.display_name as string | undefined)?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "there";

  const hasHouseholds = households && households.length > 0;

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-zinc-950"
    >
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-900 dark:bg-zinc-100 rounded-2xl mb-4 shadow-lg shadow-gray-900/20">
            <svg
              className="w-8 h-8 text-white dark:text-zinc-900"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z"
              />
            </svg>
          </div>
          <p className="text-xs font-semibold tracking-widest uppercase text-gray-400 dark:text-gray-500 mb-2">Our Pantry</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            Hi, {firstName} 👋
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {hasHouseholds
              ? "Pick a household to continue"
              : "You're not in a household yet"}
          </p>
        </div>

        {hasHouseholds ? (
          <div className="space-y-2 mb-6">
            {households.map((hh) => (
              <Link
                key={hh.id}
                href={`/household/${hh.id}/pantry`}
                className="flex items-center justify-between bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 px-4 py-4 hover:border-gray-300 dark:hover:border-zinc-600 transition-colors active:scale-[0.97] active:bg-gray-50 dark:active:bg-zinc-800 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </div>
                  <span className="font-medium text-gray-900 dark:text-gray-50">{hh.name}</span>
                </div>
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            ))}
          </div>
        ) : (
          /* Empty state — guide the user */
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5 mb-6">
            <div className="flex flex-col gap-3.5">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm dark:text-gray-300">1</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Create a household</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Give your home a name to get started</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm dark:text-gray-300">2</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Invite your household</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Share your invite code so everyone can join</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-sm dark:text-gray-300">3</span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Shop together</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Lists and pantry sync in real time</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Link
            href="/household/new"
            className="flex flex-col items-center gap-2 bg-gray-900 text-white rounded-2xl px-4 py-5 hover:bg-gray-700 transition-colors text-center active:scale-[0.97] active:bg-gray-800 shadow-sm"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4v16m8-8H4"
              />
            </svg>
            <span className="text-sm font-medium">New household</span>
          </Link>
          <Link
            href="/household/join"
            className="flex flex-col items-center gap-2 bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 border border-gray-200 dark:border-zinc-700 rounded-2xl px-4 py-5 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors text-center active:scale-[0.97] active:bg-gray-50 dark:active:bg-zinc-800 shadow-sm"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className="text-sm font-medium">Join with code</span>
          </Link>
        </div>

        <form action={signOut} className="mt-8 text-center">
          <button
            type="submit"
            className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
