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

/**
 * A "still open" heartbeat, kept under its own key so it can be written every
 * second without rewriting the whole session blob.
 */
const SEEN_KEY = (householdId: string, recipeId: string) =>
  `${KEY(householdId, recipeId)}_seen`;

/**
 * A gap shorter than this is a reload, not walking away — restoring shouldn't
 * disturb the clock. Anything longer is banked as a pause.
 */
export const AWAY_GRACE_MS = 2 * 60 * 1000;

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
  /**
   * False until the user taps Start. A fresh session is created *paused* at
   * zero, so opening cook mode to read the steps costs nothing — browsing time
   * is banked away the moment cooking actually begins.
   */
  started: boolean;
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
    started: false,
    phase: "prep",
    prepEndedAt: null,
    pausedAtPrepEnd: 0,
    // Paused at the same instant it started: elapsed reads 0 and stays there
    // until Start, without needing a nullable startedAt through all the math.
    pausedAt: now,
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
      // Sessions written before Start existed were always already running.
      started: parsed.started ?? true,
    };
  } catch {
    return null;
  }
}

export function clearCookSession(householdId: string, recipeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(householdId, recipeId));
    window.localStorage.removeItem(SEEN_KEY(householdId, recipeId));
  } catch { /* ignore */ }
}

/** Stamp that the session is still open, on screen, right now. */
export function touchCookSession(householdId: string, recipeId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY(householdId, recipeId), String(Date.now()));
  } catch { /* ignore */ }
}

/** Epoch ms the session was last known to be open, or null if never stamped. */
export function lastSeenAt(householdId: string, recipeId: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SEEN_KEY(householdId, recipeId));
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * Treat time the app spent CLOSED as a pause rather than as cooking.
 *
 * Without this, closing the app after prep at 5pm and reopening at 9pm to
 * finish records a four-hour cook — which then poisons the median in
 * `typicalDuration`. This only ever runs on a genuine remount: backgrounding
 * the phone mid-cook keeps the component mounted, so a simmer you walked away
 * from still counts, as it should.
 */
export function bankAwayTime(
  s: CookSession,
  lastSeen: number | null,
  now = Date.now(),
): CookSession {
  // Already paused: the clock is frozen at `pausedAt`, which covers the gap.
  if (s.pausedAt !== null) return s;
  // The latest moment we can prove the app was open. `pageEnteredAt` is the
  // fallback for sessions written before the heartbeat existed.
  const anchor = Math.max(lastSeen ?? 0, s.pageEnteredAt);
  const away = now - anchor;
  if (away < AWAY_GRACE_MS) return s;
  return { ...s, pausedTotal: s.pausedTotal + away, pageEnteredAt: now };
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
