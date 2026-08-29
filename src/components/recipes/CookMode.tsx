"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { HouseholdRecipe } from "@/types/database";
import { recipeIngredientList, recipeStepList, groupSections } from "@/lib/recipeTypes";
import { scaleQuantity, formatAmount, servingsFactor } from "@/lib/recipeScale";
import { parseStepDuration, formatCountdown, formatDurationLabel } from "@/lib/stepDuration";
import { useWakeLock } from "@/hooks/useWakeLock";
import { useCookSession } from "@/hooks/useCookSession";

/**
 * Full-screen guided cooking. Page 0 is "Gather your ingredients"; pages 1..n
 * are the steps, one at a time in large type.
 *
 * All timing lives in useCookSession, which persists to localStorage and
 * derives every duration from wall-clock anchors — so backgrounding the app
 * (constant, while cooking) can't drift the clock.
 */
export default function CookMode({
  recipe,
  householdId,
  onExit,
  onFinish,
  finishing,
}: {
  recipe: HouseholdRecipe;
  householdId: string;
  onExit: () => void;
  /** Durations come from the session; the parent persists them with the cook. */
  onFinish: (args: {
    servings: number | null;
    total: number;
    prep: number | null;
    cook: number | null;
    steps: Record<string, number>;
  }) => void;
  finishing: boolean;
}) {
  const base = recipe.servings ?? null;

  // Hooks first, unconditionally — a changing hook count between renders is
  // React error #310 (see PantryList.tsx:648).
  const { supported: wakeSupported, held: wakeHeld } = useWakeLock(true);
  const s = useCookSession(householdId, recipe.id, base);
  const [exitAsk, setExitAsk] = useState(false);
  const [resetAsk, setResetAsk] = useState(false);

  const ingredients = recipeIngredientList(recipe);
  const steps = recipeStepList(recipe);
  const groups = groupSections(ingredients);

  // Parse each step's duration ONCE — recipeStepList allocates a fresh array
  // every render, so doing this inline would re-parse every step every tick.
  const stepDurations = useMemo(
    () => steps.map((st) => parseStepDuration(st.text)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [recipe.id, recipe.steps],
  );

  // ── Stale session: ask before silently resuming yesterday's cook ──────
  if (s.resumable) {
    const started = new Date(s.resumable.startedAt);
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-5 px-8 text-center">
        <div className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
            Pick up where you left off?
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
            You started cooking {recipe.name} on{" "}
            {started.toLocaleDateString("en-US", { weekday: "long" })} at{" "}
            {started.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            {" "}and didn&apos;t finish.
          </p>
        </div>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <button
            type="button" onClick={s.resume}
            className="w-full py-3.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-base font-semibold active:scale-[0.98] transition-transform"
          >
            Resume
          </button>
          <button
            type="button" onClick={s.reset}
            className="w-full py-3 rounded-2xl text-sm font-medium text-gray-500 dark:text-gray-400 active:opacity-60"
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  if (!s.session) {
    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-300 dark:border-zinc-700 border-t-gray-600 dark:border-t-zinc-300 rounded-full animate-spin" />
      </div>
    );
  }

  const { page, checked, servings, phase } = s.session;
  const target = servings;
  const factor = servingsFactor(base, target);
  const totalPages = steps.length + 1;
  const onIngredients = page === 0;
  const stepIndex = page - 1;
  const isLast = page === totalPages - 1;

  const stepSeconds = onIngredients ? null : stepDurations[stepIndex] ?? null;
  const timer = s.timerFor(stepIndex);
  const remaining = timer ? Math.max(0, Math.round((timer.endsAt - Date.now()) / 1000)) : null;
  const timerDone = !!timer && remaining === 0;

  function handleFinish() {
    const d = s.finalDurations();
    s.finish();
    onFinish({ servings: target, total: d.total, prep: d.prep, cook: d.cook, steps: d.steps });
  }

  return (
    <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-950 flex flex-col">
      {/* Header */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pb-3 border-b border-gray-100 dark:border-zinc-800"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-50 truncate">
            {recipe.name}
          </p>
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {onIngredients ? "Ingredients" : `Step ${stepIndex + 1} of ${steps.length}`}
            {wakeSupported && wakeHeld && " · screen staying on"}
          </p>
        </div>
        <button
          type="button" aria-label="Exit cooking"
          onClick={() => (s.started && s.elapsed > 0 ? setExitAsk(true) : onExit())}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 active:scale-90 transition-transform"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Session timer bar */}
      <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/60">
        <span className={`text-sm font-semibold tabular-nums ${
          !s.started || s.paused ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-gray-50"
        }`}>
          {formatCountdown(s.elapsed)}
        </span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
          !s.started
            ? "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
            : phase === "prep"
              ? "bg-blue-100 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
              : "bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400"
        }`}>
          {!s.started ? "Not started" : s.paused ? "Paused" : phase === "prep" ? "Prep" : "Cooking"}
        </span>

        <div className="flex-1" />

        {/* Reading the steps shouldn't cost you a cook time, so nothing is
            counted until this is tapped. */}
        {!s.started ? (
          <button
            type="button" onClick={s.start}
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-green-600 text-white active:scale-95 transition-transform"
          >
            Start timer
          </button>
        ) : (
          <>
            {/* Always available — tapping it is the only reliable phase signal,
                so it never hides behind a heuristic about which step is
                "cooking". */}
            {phase === "prep" && (
              <button
                type="button" onClick={s.endPrep}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 active:scale-95 transition-transform"
              >
                Prep done
              </button>
            )}
            <button
              type="button" onClick={s.togglePause}
              aria-label={s.paused ? "Resume timer" : "Pause timer"}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 active:scale-90 transition-transform"
            >
              {s.paused ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z" /></svg>
              )}
            </button>
            <button
              type="button" onClick={() => setResetAsk(true)}
              aria-label="Reset timer"
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 active:scale-90 transition-transform"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 9A8 8 0 006.3 6.3L4 8.5m0 6.5a8 8 0 0013.7 2.7L20 15.5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 h-1 bg-gray-100 dark:bg-zinc-800">
        <motion.div
          className="h-full bg-gray-900 dark:bg-zinc-100"
          animate={{ width: `${((page + 1) / totalPages) * 100}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 32 }}
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6">
        <AnimatePresence mode="wait" initial={false}>
          {onIngredients ? (
            <motion.div
              key="ingredients"
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
              className="flex flex-col gap-5 max-w-xl mx-auto"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
                    Gather your ingredients
                  </h2>
                  {ingredients.length > 0 && (
                    <span className="text-xs tabular-nums text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {checked.length} of {ingredients.length}
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {ingredients.length > 0
                    ? "Check them off as you set each one out — then start cooking."
                    : "Nothing listed for this one."}
                </p>
              </div>

              {base && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500 dark:text-gray-400">Cooking for</span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button" aria-label="Fewer servings"
                      onClick={() => s.setServings(Math.max(1, (target ?? base) - 1))}
                      className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center justify-center active:scale-90 transition-transform text-lg"
                    >−</button>
                    <span className="w-16 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                      {target}
                    </span>
                    <button
                      type="button" aria-label="More servings"
                      onClick={() => s.setServings(Math.min(200, (target ?? base) + 1))}
                      className="w-9 h-9 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center active:scale-90 transition-transform text-lg"
                    >+</button>
                  </div>
                </div>
              )}

              {ingredients.length > 0 && (() => {
                let n = -1; // running index so checkboxes stay stable across groups
                return groups.map((g, gi) => (
                  <div key={`${g.group ?? "_"}-${gi}`} className="flex flex-col gap-2">
                    {g.group && (
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                        {g.group}
                      </p>
                    )}
                    <ul className="flex flex-col gap-1">
                      {g.rows.map((ing) => {
                        n += 1;
                        const idx = n;
                        const on = checked.includes(idx);
                        const amount = formatAmount(scaleQuantity(ing.quantity, factor, ing.unit), ing.unit);
                        return (
                          <li key={idx}>
                            <button
                              type="button"
                              onClick={() => s.toggleChecked(idx)}
                              className="w-full flex items-center gap-3 py-2.5 text-left active:opacity-70"
                            >
                              <span className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-colors ${
                                on ? "bg-green-500 border-green-500" : "border-gray-300 dark:border-zinc-600"
                              }`}>
                                {on && (
                                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </span>
                              <span className={`flex-1 text-base ${on ? "text-gray-300 dark:text-zinc-600 line-through" : "text-gray-800 dark:text-gray-200"}`}>
                                {ing.name}
                              </span>
                              {amount && (
                                <span className={`text-sm tabular-nums flex-shrink-0 ${on ? "text-gray-300 dark:text-zinc-600" : "text-gray-500 dark:text-gray-400"}`}>
                                  {amount}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ));
              })()}

              {wakeSupported === false && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
                  Your browser can&apos;t keep the screen awake. Raise your auto-lock time
                  in system settings if it sleeps while you cook.
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div
              key={`step-${stepIndex}`}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.16 }}
              className="max-w-xl mx-auto flex flex-col gap-4"
            >
              {steps[stepIndex]?.group && (
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                  {steps[stepIndex].group}
                </p>
              )}
              <p className="text-xl sm:text-2xl leading-relaxed text-gray-900 dark:text-gray-50">
                {steps[stepIndex]?.text}
              </p>

              {/* Step timer — only when the text actually states a duration. */}
              {stepSeconds !== null && (
                <div className="flex items-center gap-2 pt-1">
                  {!timer ? (
                    <button
                      type="button"
                      onClick={() => s.startTimer(stepIndex, stepSeconds)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold active:scale-95 transition-transform"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" />
                      </svg>
                      Start {formatDurationLabel(stepSeconds)} timer
                    </button>
                  ) : (
                    <div className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl ${
                      timerDone
                        ? "bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400"
                        : "bg-gray-100 dark:bg-zinc-800 text-gray-900 dark:text-gray-50"
                    }`}>
                      <span className="text-lg font-semibold tabular-nums">
                        {timerDone ? "Time's up" : formatCountdown(remaining ?? 0)}
                      </span>
                      <button
                        type="button"
                        onClick={() => s.cancelTimer(stepIndex)}
                        className="text-[12px] font-medium opacity-70 hover:opacity-100 active:opacity-50"
                      >
                        {timerDone ? "Dismiss" : "Cancel"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Only when the LAST step's timer has actually fired — the case
                  where you walked away, got the notification, and came back.
                  Paging back and forth never triggers it. */}
              {isLast && timerDone && (
                <div className="rounded-2xl border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/30 px-4 py-3">
                  <p className="text-sm text-green-800 dark:text-green-300">
                    That was the last step — ready to finish and record this cook?
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer controls */}
      <div
        className="flex-shrink-0 flex items-center gap-3 px-4 pt-3 border-t border-gray-100 dark:border-zinc-800"
        style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => s.goToPage(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-5 py-3.5 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 text-sm font-medium disabled:opacity-30 active:scale-[0.97] transition-all"
        >
          Back
        </button>
        {isLast ? (
          <button
            type="button"
            onClick={handleFinish}
            disabled={finishing}
            className="flex-1 py-3.5 rounded-2xl bg-green-600 text-white text-base font-semibold disabled:opacity-50 active:scale-[0.98] transition-all"
          >
            {finishing ? "Saving…" : "Done cooking"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => s.goToPage(Math.min(totalPages - 1, page + 1))}
            className="flex-1 py-3.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-base font-semibold active:scale-[0.98] transition-all"
          >
            {onIngredients ? (steps.length > 0 ? "Start cooking" : "Continue") : "Next step"}
          </button>
        )}
      </div>

      {resetAsk && (
        <CookPrompt
          title="Start the timer over?"
          body="This clears the elapsed time, the prep/cook split and any per-step timings for this cook. Your checked-off ingredients and your place in the steps stay put."
          actions={
            <>
              <PromptButton tone="danger" onClick={() => { s.reset(); setResetAsk(false); }}>
                Reset timer
              </PromptButton>
              <PromptButton tone="ghost" onClick={() => setResetAsk(false)}>Cancel</PromptButton>
            </>
          }
        />
      )}

      {exitAsk && (
        <CookPrompt
          title="Leave this cook?"
          body={`The timer is at ${formatDurationLabel(s.elapsed)}. You can pick it up where you left off, or throw it away.`}
          actions={
            <>
              <PromptButton tone="primary" onClick={onExit}>Keep for later</PromptButton>
              <PromptButton tone="danger" onClick={() => { s.finish(); onExit(); }}>
                Discard this cook
              </PromptButton>
              <PromptButton tone="ghost" onClick={() => setExitAsk(false)}>Stay here</PromptButton>
            </>
          }
        />
      )}
    </div>
  );
}

/**
 * A prompt over cook mode. Deliberately not the shared Modal: that renders at
 * z-50 alongside cook mode's own z-50 rather than through a portal, and stacked
 * full-width buttons suit a phone held in a kitchen better than a button row.
 */
function CookPrompt({ title, body, actions }: {
  title: string;
  body: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-5 pb-8 sm:pb-0">
      <div className="w-full max-w-sm rounded-3xl bg-white dark:bg-zinc-900 p-5 flex flex-col gap-4 shadow-xl">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{body}</p>
        </div>
        <div className="flex flex-col gap-2">{actions}</div>
      </div>
    </div>
  );
}

function PromptButton({ tone, onClick, children }: {
  tone: "primary" | "danger" | "ghost";
  onClick: () => void;
  children: React.ReactNode;
}) {
  const styles = {
    primary: "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900",
    danger: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
    ghost: "text-gray-500 dark:text-gray-400",
  }[tone];
  return (
    <button
      type="button" onClick={onClick}
      className={`w-full py-3 rounded-2xl text-sm font-semibold active:scale-[0.98] transition-transform ${styles}`}
    >
      {children}
    </button>
  );
}
