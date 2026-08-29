"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type CookSession, type RunningTimer,
  newCookSession, loadCookSession, saveCookSession, clearCookSession,
  elapsedMs, phaseSeconds, STALE_AFTER_MS,
} from "@/lib/cookSession";
import { alertTimerDone, requestNotifyPermission } from "@/lib/notify";

/** Below this, time on a step is skimming, not cooking — don't record it. */
const MIN_STEP_SECONDS = 5;

/**
 * The live cooking session: elapsed time, prep/cook phase, per-step timing,
 * and step timers. Persists every transition so closing the app doesn't lose
 * your place.
 *
 * The single most important property: **nothing is counted by ticking.** The
 * 1s interval only forces a re-render; every duration is recomputed from
 * wall-clock anchors. Mobile browsers throttle background timers heavily, so a
 * counter would drift badly the moment you switched apps — which, while
 * cooking, is constantly.
 */
export function useCookSession(
  householdId: string,
  recipeId: string,
  defaultServings: number | null,
) {
  const [session, setSession] = useState<CookSession | null>(null);
  /** A saved session found on mount that's old enough to ask about. */
  const [resumable, setResumable] = useState<CookSession | null>(null);
  const [, forceTick] = useState(0);
  const alerted = useRef<Set<string>>(new Set());

  // ── Load or start ───────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadCookSession(householdId, recipeId);
    if (!saved) {
      setSession(newCookSession(recipeId, defaultServings));
      return;
    }
    if (Date.now() - saved.startedAt > STALE_AFTER_MS) {
      // Don't silently resume yesterday's abandoned session — ask.
      setResumable(saved);
      return;
    }
    setSession(saved);
    // defaultServings is only the seed for a brand-new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId, recipeId]);

  // ── Persist on every change ─────────────────────────────────────────
  useEffect(() => {
    if (session) saveCookSession(householdId, session);
  }, [householdId, session]);

  // ── 1s re-render so the clock face moves (display only) ─────────────
  useEffect(() => {
    if (!session || session.pausedAt) return;
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [session, session?.pausedAt]);

  // ── Fire alerts for timers whose deadline has passed ────────────────
  useEffect(() => {
    if (!session) return;
    const due = session.timers.filter((t) => !t.firedAt && t.endsAt <= Date.now());
    if (due.length === 0) return;
    for (const t of due) {
      const id = `${t.stepIndex}-${t.endsAt}`;
      // Guard against a re-render (or a reload mid-alert) double-firing.
      if (alerted.current.has(id)) continue;
      alerted.current.add(id);
      alertTimerDone("Timer done", `Your ${Math.round(t.seconds / 60)} minute timer is up.`);
    }
    const firedAt = Date.now();
    setSession((s) => s && ({
      ...s,
      timers: s.timers.map((t) => (!t.firedAt && t.endsAt <= firedAt ? { ...t, firedAt } : t)),
    }));
  });

  const update = useCallback((fn: (s: CookSession) => CookSession) => {
    setSession((s) => (s ? fn(s) : s));
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────

  /** Move to a page, banking time spent on the one we're leaving. */
  const goToPage = useCallback((next: number) => {
    update((s) => {
      const now = Date.now();
      const spent = Math.round((now - s.pageEnteredAt) / 1000);
      const key = String(s.page);
      const stepSeconds = spent >= MIN_STEP_SECONDS
        ? { ...s.stepSeconds, [key]: (s.stepSeconds[key] ?? 0) + spent }
        : s.stepSeconds;
      return { ...s, page: next, pageEnteredAt: now, stepSeconds };
    });
  }, [update]);

  const setServings = useCallback((servings: number | null) => {
    update((s) => ({ ...s, servings }));
  }, [update]);

  const toggleChecked = useCallback((i: number) => {
    update((s) => ({
      ...s,
      checked: s.checked.includes(i) ? s.checked.filter((x) => x !== i) : [...s.checked, i],
    }));
  }, [update]);

  /** Tapping "Prep done" — the only reliable signal for the phase boundary. */
  const endPrep = useCallback(() => {
    update((s) => (s.prepEndedAt !== null ? s : {
      ...s,
      phase: "cook",
      prepEndedAt: Date.now(),
      pausedAtPrepEnd: s.pausedTotal,
    }));
  }, [update]);

  const togglePause = useCallback(() => {
    update((s) => {
      if (s.pausedAt) {
        // Resuming: bank the pause, and don't charge the gap to the step you
        // walked away from.
        const paused = Date.now() - s.pausedAt;
        return { ...s, pausedAt: null, pausedTotal: s.pausedTotal + paused, pageEnteredAt: Date.now() };
      }
      return { ...s, pausedAt: Date.now() };
    });
  }, [update]);

  /** Start a timer for a step. Asks for notification permission on first use. */
  const startTimer = useCallback((stepIndex: number, seconds: number) => {
    void requestNotifyPermission();
    update((s) => ({
      ...s,
      timers: [
        ...s.timers.filter((t) => t.stepIndex !== stepIndex),
        { stepIndex, seconds, endsAt: Date.now() + seconds * 1000 },
      ],
    }));
  }, [update]);

  const cancelTimer = useCallback((stepIndex: number) => {
    update((s) => ({ ...s, timers: s.timers.filter((t) => t.stepIndex !== stepIndex) }));
  }, [update]);

  const discard = useCallback(() => {
    clearCookSession(householdId, recipeId);
    setResumable(null);
    setSession(newCookSession(recipeId, defaultServings));
  }, [householdId, recipeId, defaultServings]);

  const resume = useCallback(() => {
    if (!resumable) return;
    const now = Date.now();
    // The session may have been left RUNNING, in which case the hours since
    // are not cooking time. We can't know when they actually walked away, so
    // anchor on the last interaction (pageEnteredAt, or the pause if paused)
    // and bank everything after it as a pause. Without this, resuming
    // yesterday's session would report a 14-hour cook.
    const away = Math.max(0, now - (resumable.pausedAt ?? resumable.pageEnteredAt));
    setSession({
      ...resumable,
      pausedAt: null,
      pausedTotal: resumable.pausedTotal + away,
      pageEnteredAt: now,
    });
    setResumable(null);
  }, [resumable]);

  /** Final durations, banking the current page. Call once on finish. */
  const finalDurations = useCallback(() => {
    if (!session) return { total: 0, prep: null, cook: null, steps: {} as Record<string, number> };
    const now = Date.now();
    const spent = Math.round((now - session.pageEnteredAt) / 1000);
    const key = String(session.page);
    const steps = spent >= MIN_STEP_SECONDS
      ? { ...session.stepSeconds, [key]: (session.stepSeconds[key] ?? 0) + spent }
      : session.stepSeconds;
    return { ...phaseSeconds(session, now), steps };
  }, [session]);

  const finish = useCallback(() => clearCookSession(householdId, recipeId), [householdId, recipeId]);

  const timerFor = useCallback(
    (stepIndex: number): RunningTimer | null =>
      session?.timers.find((t) => t.stepIndex === stepIndex) ?? null,
    [session],
  );

  return {
    session,
    resumable,
    elapsed: session ? Math.round(elapsedMs(session) / 1000) : 0,
    paused: !!session?.pausedAt,
    goToPage, setServings, toggleChecked, endPrep, togglePause,
    startTimer, cancelTimer, timerFor,
    resume, discard, finalDurations, finish,
  };
}
