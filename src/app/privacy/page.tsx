import Link from "next/link";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-zinc-950">
      <div className="max-w-lg mx-auto px-5 pt-8 pb-24">
        <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50 mb-1">Privacy policy</h1>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-6">Placeholder — replace with your reviewed policy before launch.</p>

        <div className="prose-sm flex flex-col gap-4 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
          <p>This app stores the pantry and shopping data you and your household members enter, along with your display name and chosen color. Data is stored with Supabase and is only visible to members of your household.</p>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-2">What we store</h2>
          <p>Your account email, display name, avatar color, household membership, and the pantry/shopping/recipe items your household creates.</p>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-2">Your choices</h2>
          <p>You can export all of your data or delete your account at any time from Account settings. Deleting your account removes your profile and memberships; households you solely own must be transferred or deleted first.</p>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mt-2">Contact</h2>
          <p>Questions about your data? Reach out from the feedback link in Account settings.</p>
        </div>
      </div>
    </div>
  );
}
