"use client";

import type { RecipeRating } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

function Star({ filled, className = "" }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M11.48 3.5a.56.56 0 011.04 0l2.12 4.3 4.75.69c.46.07.64.63.31.95l-3.44 3.35.81 4.73c.08.46-.4.81-.81.59L12 15.85l-4.26 2.24c-.41.22-.89-.13-.81-.59l.81-4.73-3.44-3.35a.56.56 0 01.31-.95l4.75-.69 2.12-4.3z"
      />
    </svg>
  );
}

/**
 * Per-person ratings. You set your own; everyone else's sits beside it in
 * their household color — a shared cookbook where two people can honestly
 * disagree about the casserole.
 */
export default function RatingRow({
  ratings,
  currentUserId,
  members,
  onRate,
}: {
  ratings: RecipeRating[];
  currentUserId: string | null;
  members: MemberProfile[];
  onRate: (rating: number | null) => void;
}) {
  const mine = ratings.find((r) => r.user_id === currentUserId)?.rating ?? null;
  const others = ratings.filter((r) => r.user_id !== currentUserId);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Ratings</h2>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5">
        {/* Yours — interactive */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">Your rating</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                // Tapping your current rating clears it.
                onClick={() => onRate(mine === n ? null : n)}
                className={`p-1 active:scale-90 transition-transform ${
                  mine !== null && n <= mine
                    ? "text-amber-400"
                    : "text-gray-300 dark:text-zinc-600 hover:text-amber-300"
                }`}
              >
                <Star filled={mine !== null && n <= mine} className="w-5 h-5" />
              </button>
            ))}
          </div>
        </div>

        {/* Everyone else's — read only */}
        {others.map((r) => {
          const m = members.find((x) => x.user_id === r.user_id);
          const color = m?.color ?? DEFAULT_COLOR;
          return (
            <div key={r.user_id} className="flex items-center justify-between gap-3 pt-2 border-t border-gray-50 dark:border-zinc-800">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{ backgroundColor: hexAlpha(color, 0.18), color }}
                >
                  {m?.initials ?? "?"}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                  {m?.short_name ?? "Someone"}
                </span>
              </span>
              <span className="flex items-center gap-0.5 text-amber-400 flex-shrink-0">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} filled={n <= r.rating} className="w-4 h-4" />
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
