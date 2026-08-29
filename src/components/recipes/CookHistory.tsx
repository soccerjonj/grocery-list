"use client";

import { useRecipeCooks, typicalDuration } from "@/hooks/useRecipeCooks";
import { formatDurationLabel } from "@/lib/stepDuration";
import { formatRelativeDay } from "@/lib/recipeTypes";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

/**
 * What this recipe actually takes, from your own cooks — as opposed to the
 * optimistic times printed on the source page.
 *
 * Renders nothing until there's history, so a never-cooked recipe doesn't
 * carry an empty shell.
 */
export default function CookHistory({
  recipeId,
  members,
}: {
  recipeId: string;
  members: MemberProfile[];
}) {
  const { cooks, loading } = useRecipeCooks(recipeId);
  if (loading || cooks.length === 0) return null;

  const typical = typicalDuration(cooks);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Cook history</h2>

      {typical && (
        <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 flex flex-col gap-1">
          <p className="text-sm text-gray-800 dark:text-gray-200">
            Usually takes about{" "}
            <span className="font-semibold">{formatDurationLabel(typical.total)}</span>
            {typical.prep !== null && typical.cook !== null && (
              <span className="text-gray-500 dark:text-gray-400">
                {" "}({formatDurationLabel(typical.prep)} prep / {formatDurationLabel(typical.cook)} cooking)
              </span>
            )}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {/* Say what it's based on — one sample is an anecdote, not a median. */}
            Based on {typical.samples} timed cook{typical.samples === 1 ? "" : "s"}
          </p>
        </div>
      )}

      <ul className="flex flex-col divide-y divide-gray-50 dark:divide-zinc-800 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3.5">
        {cooks.map((c) => {
          const who = members.find((m) => m.user_id === c.cooked_by);
          const color = who?.color ?? DEFAULT_COLOR;
          return (
            <li key={c.id} className="flex items-center gap-3 py-2.5">
              {who ? (
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                  style={{ backgroundColor: hexAlpha(color, 0.18), color }}
                  title={who.short_name}
                >
                  {who.initials}
                </span>
              ) : (
                <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-zinc-800 flex-shrink-0" />
              )}
              <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                {formatRelativeDay(c.cooked_at) ?? "—"}
                {c.servings ? (
                  <span className="text-gray-400 dark:text-gray-500"> · {c.servings} servings</span>
                ) : null}
              </span>
              {typeof c.total_seconds === "number" && c.total_seconds > 0 && (
                <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400 flex-shrink-0">
                  {formatDurationLabel(c.total_seconds)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
