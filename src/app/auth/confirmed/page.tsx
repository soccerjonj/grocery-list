import Link from "next/link";

export default function ConfirmedPage() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 bg-gray-50">
      <div className="w-full max-w-sm text-center">
        {/* Success icon */}
        <div className="inline-flex items-center justify-center w-14 h-14 bg-gray-900 rounded-2xl mb-6">
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Email confirmed!
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Your account is ready. Sign in to create or join a household.
        </p>

        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center w-full bg-gray-900 text-white text-sm font-medium rounded-xl px-5 py-3 hover:bg-gray-700 transition-colors"
        >
          Go to the app
        </Link>
      </div>
    </div>
  );
}
