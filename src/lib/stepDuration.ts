/**
 * Find a cookable duration in a step's text: "simmer for 20 minutes" → 1200s.
 *
 * Written in the tolerant house style of `parseYield`/`parseIsoDuration` in
 * recipeExtract.ts — real recipe prose, not a grammar. Two rules keep it
 * honest rather than clever:
 *
 *  • Ranges take the LOWER bound ("bake 25–30 min" → 25). You want to be
 *    looking at the food when the window opens, not after it closed.
 *  • Only the FIRST duration is offered. "Sauté 5 minutes, then simmer 20"
 *    would need two sequential timers to be correct, and a single chip
 *    labelled 5 or 20 there would be actively misleading.
 *
 * Deliberately skipped: "overnight", "1-2 days", and anything over 8 hours —
 * those are marinating/resting waits, not something you stand at a stove for,
 * and a countdown for them would be a fake affordance.
 */

const MAX_TIMER_SECONDS = 8 * 60 * 60;

/** Words that mean "this is a wait", used to avoid matching stray numbers. */
const UNIT_SECONDS: Record<string, number> = {
  second: 1, seconds: 1, sec: 1, secs: 1, s: 1,
  minute: 60, minutes: 60, min: 60, mins: 60, m: 60,
  hour: 3600, hours: 3600, hr: 3600, hrs: 3600, h: 3600,
};

/**
 * Matches "20 minutes", "1 1/2 hours", "25-30 min", "45 sec", "1½ hr".
 * The unit is required — a bare number ("heat to 350") must never become a
 * timer, which is why there's no unitless branch.
 */
const DURATION_RE = new RegExp(
  String.raw`(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d+\/\d|[½¼¾⅓⅔⅛⅜⅝⅞])` +   // first number
  String.raw`\s*(?:[–—-]|\s+(?:to|or)\s+)\s*(?:\d+(?:\.\d+)?)?` +      // optional range tail
  String.raw`\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)\b` +
  String.raw`|(\d+(?:\.\d+)?(?:\s+\d\/\d)?|\d+\/\d|[½¼¾⅓⅔⅛⅜⅝⅞])\s*(second|seconds|sec|secs|minute|minutes|min|mins|hour|hours|hr|hrs)\b`,
  "i",
);

const FRACTIONS: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};

function toNumber(raw: string): number | null {
  const s = raw.trim();
  if (s in FRACTIONS) return FRACTIONS[s];
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

/** Seconds for the first timeable duration in `text`, or null. */
export function parseStepDuration(text: string | null | undefined): number | null {
  if (!text) return null;
  // "overnight" / "1-2 days" are waits, not timers.
  if (/\bovernight\b|\bday'?s?\b|\bweeks?\b/i.test(text)) return null;

  const m = DURATION_RE.exec(text);
  if (!m) return null;

  // Either the range branch (groups 1-2) or the plain branch (groups 3-4) hit.
  const numStr = m[1] ?? m[3];
  const unitStr = (m[2] ?? m[4] ?? "").toLowerCase();
  if (!numStr || !unitStr) return null;

  const n = toNumber(numStr);
  const per = UNIT_SECONDS[unitStr];
  if (n === null || !per || n <= 0) return null;

  const seconds = Math.round(n * per);
  if (seconds < 5 || seconds > MAX_TIMER_SECONDS) return null;
  return seconds;
}

/** "20:00" / "1:05:00" — a countdown face. */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, "0")}`
    : `${mm}:${String(sec).padStart(2, "0")}`;
}

/** "20 min" / "1 hr 5 min" — a duration label, not a countdown. */
export function formatDurationLabel(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s} sec`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
