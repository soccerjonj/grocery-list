/**
 * A durable cooking session — elapsed time, phase, step position and any
 * running timers — so "prep tonight, cook tomorrow" survives closing the app.
 *
 * Same shape as `pendingImport.ts`: household-scoped key, SSR guard, try/catch
 * around every access, JSON round-trip. State is written at each transition
 * rather than on `beforeunload`, which mobile Safari fires unreliably.
 *
 * All times are epoch milliseconds. Elapsed is always DERIVED from wall-clock
 * anchors, never accumulated by a ticking counter — background tabs are
 * throttled hard, so a counter would silently drift.
 */

const KEY = (householdId: string, recipeId: string) => `cook_session_${householdId}_${recipeId}`;

/** Sessions older than this are stale enough to ask about rather than resume. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface RunningTimer {
  /** Step index the timer belongs to (-1 = the ingredients page). */
  stepIndex: number;
  /** Epoch ms when it fires. */
  endsAt: number;
  /** Original duration, so a finished timer can still be described. */
  seconds: number;
  /** Set once the alert has fired, so a reload doesn't re-alert. */
  firedAt?: number;
}

export interface CookSession {
  recipeId: string;
  startedAt: number;
  /** "prep" until the user taps Prep done. */
  phase: "prep" | "cook";
  /** When prep ended. null = never tapped, so we record one honest total. */
  prepEndedAt: number | null;
  /**
   * `pausedTotal` as it stood the moment prep ended. Snapshotting it is what
   * lets prep and cook be computed exactly instead of apportioning pauses by
   * a ratio — a pause belongs to whichever phase it happened in.
   */
  pausedAtPrepEnd: number;
  /** Epoch ms the session was paused, or null when running. */
  pausedAt: number | null;
  /** Total ms spent paused, accumulated across pauses. */
  pausedTotal: number;
  page: number;
  /** Epoch ms the current page was entered — for per-step timing. */
  pageEnteredAt: number;
  /** Accumulated seconds per step index. */
  stepSeconds: Record<string, number>;
  checked: number[];
  servings: number | null;
  timers: RunningTimer[];
}

export function newCookSession(recipeId: string, servings: number | null): CookSession {
  const now = Date.now();
  return {
    recipeId,
    startedAt: now,
    phase: "prep",
    prepEndedAt: null,
    pausedAtPrepEnd: 0,
    pausedAt: null,
    pausedTotal: 0,
    page: 0,
    pageEnteredAt: now,
    stepSeconds: {},
    checked: [],
    servings,
    timers: [],
  };
}

export function saveCookSession(householdId: string, s: CookSession) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(householdId, s.recipeId), JSON.stringify(s));
  } catch { /* quota or private mode — the session just won't survive a reload */ }
}

export function loadCookSession(householdId: string, recipeId: string): CookSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(householdId, recipeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookSession;
    // Guard the fields we actually index into; a half-written or older-shaped
    // blob should be ignored, not crash cook mode.
    if (!parsed || parsed.recipeId !== recipeId || typeof parsed.startedAt !== "number") return null;
    return {
      ...parsed,
      stepSeconds: parsed.stepSeconds ?? {},
      checked: Array.isArray(parsed.checked) ? parsed.checked : [],
      timers: Array.isArray(parsed.timers) ? parsed.timers : [],
      pausedTotal: parsed.pausedTotal ?? 0,
      pausedAtPrepEnd: parsed.pausedAtPrepEnd ?? 0,
    };
  } catch {
    return null;
  }
}

export function clearCookSession(householdId: string, recipeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(householdId, recipeId));
  } catch { /* ignore */ }
}

/** Milliseconds of actual (unpaused) cooking so far. */
export function elapsedMs(s: CookSession, now = Date.now()): number {
  const end = s.pausedAt ?? now;
  return Math.max(0, end - s.startedAt - s.pausedTotal);
}

/**
 * Split into prep/cook seconds. Both null when "Prep done" was never tapped —
 * we record one honest total rather than inventing a boundary.
 *
 * Exact, not apportioned: prep is the unpaused time before the boundary, so a
 * pause counts against whichever phase it actually happened in, and
 * prep + cook === total always holds.
 */
export function phaseSeconds(s: CookSession, now = Date.now()): {
  total: number; prep: number | null; cook: number | null;
} {
  const total = Math.round(elapsedMs(s, now) / 1000);
  if (s.prepEndedAt === null) return { total, prep: null, cook: null };
  const prepMs = Math.max(0, s.prepEndedAt - s.startedAt - s.pausedAtPrepEnd);
  const prep = Math.min(total, Math.round(prepMs / 1000));
  return { total, prep, cook: Math.max(0, total - prep) };
}
