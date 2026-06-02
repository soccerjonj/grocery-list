"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import Spinner from "@/components/ui/Spinner";

/**
 * Desktop-only command-center. On viewports below lg we bounce to the
 * pantry — the dashboard's multi-widget grid only makes sense with the
 * width, and mobile already has the bottom-nav surfaces. The redirect is
 * client-side because the decision depends on viewport, which the server
 * can't know.
 */
export default function DashboardPage() {
  const { householdId, householdName } = useHouseholdContext();
  const isDesktop = useIsDesktop();
  const router = useRouter();

  // useIsDesktop is false until mounted; gate the redirect on a measured
  // flag so desktop users don't get bounced on the first paint.
  const [measured, setMeasured] = useState(false);
  useEffect(() => setMeasured(true), []);
  useEffect(() => {
    if (measured && !isDesktop) {
      router.replace(`/household/${householdId}/pantry`);
    }
  }, [measured, isDesktop, householdId, router]);

  if (!measured || !isDesktop) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 lg:px-8 pt-6 pb-12">
      <div className="mb-6">
        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium tracking-wide mb-0.5">
          {householdName}
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
      </div>
      <DashboardGrid householdId={householdId} />
    </div>
  );
}
