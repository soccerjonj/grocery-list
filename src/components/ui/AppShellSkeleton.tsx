/**
 * Shown by Next.js automatically (via loading.tsx) while a Server Component
 * suspends on data. The point is to give the user *immediate* visual feedback
 * during cold-start so the screen never looks blank — far better perceived
 * performance than waiting for SSR to return HTML.
 *
 * Mimics the household pantry/shopping page chrome. No data, just shapes.
 */

interface AppShellSkeletonProps {
  /** Pulse-animation skeleton blocks for cards. Defaults to 6. */
  cards?: number;
  /** Optional title text to show in the header (e.g. "Pantry"). */
  title?: string;
  /** Show the bottom-nav placeholder. Defaults to true. */
  withBottomNav?: boolean;
}

export default function AppShellSkeleton({
  cards = 6,
  title,
  withBottomNav = true,
}: AppShellSkeletonProps) {
  return (
    <div
      className="min-h-dvh bg-gray-50 dark:bg-zinc-950"
      style={withBottomNav ? { paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" } : undefined}
    >
      <div className="max-w-lg mx-auto px-4 pt-4 pb-4">
        {/* Header */}
        <div className="mb-3">
          <div className="h-3 w-24 rounded bg-gray-200 dark:bg-zinc-800 animate-pulse mb-1.5" />
          <div className="flex items-baseline gap-4">
            {title ? (
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">{title}</h1>
            ) : (
              <div className="h-7 w-28 rounded bg-gray-200 dark:bg-zinc-800 animate-pulse" />
            )}
            <div className="ml-auto flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-zinc-900 animate-pulse" />
              ))}
            </div>
          </div>
        </div>

        {/* Add-an-item input placeholder */}
        <div className="h-[44px] rounded-2xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse mb-3" />

        {/* Sort + filter chip row placeholder */}
        <div className="flex gap-1.5 mb-4 overflow-hidden">
          {[60, 50, 50, 70].map((w, i) => (
            <div
              key={i}
              className="h-7 rounded-full bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 animate-pulse flex-shrink-0"
              style={{ width: `${w}px`, animationDelay: `${i * 50}ms` }}
            />
          ))}
        </div>

        {/* Card grid */}
        <div className="grid grid-cols-2 gap-2">
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="h-28 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      </div>

      {withBottomNav && (
        <div
          className="fixed bottom-0 inset-x-0 h-16 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        />
      )}
    </div>
  );
}
