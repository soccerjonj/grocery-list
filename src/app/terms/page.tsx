import Link from "next/link";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-5 pt-8 pb-24">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-1">Terms of service</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">Placeholder — replace with your reviewed terms before launch.</p>

        <div className="flex flex-col gap-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p>By using this app you agree to keep your household&apos;s shared data accurate and to use the app for personal, household purposes.</p>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-2">Accounts</h2>
          <p>You&apos;re responsible for activity under your account and for the invite codes you share. Anyone with a valid invite code can join your household, so share codes carefully and regenerate them from household settings if one leaks.</p>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-2">Availability</h2>
          <p>The app is provided as-is, without warranty. Features may change as the app develops.</p>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-2">Ending use</h2>
          <p>You can leave a household or delete your account at any time from settings.</p>
        </div>
      </div>
    </div>
  );
}
