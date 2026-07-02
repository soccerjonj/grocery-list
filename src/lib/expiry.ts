/**
 * Single source of truth for how an expiry date is displayed across the
 * pantry — the at-a-glance card badge, the sheet header meta, and the new
 * freshness ring all read from `getExpiryDisplay` so their color/label can
 * never drift apart.
 */

export type ExpiryTone = "red" | "yellow" | "green" | "gray" | "none";

export interface ExpiryDisplay {
  /** Short glance label, e.g. "4d", "Today", "Mar 5", "1yr+". "" when no date. */
  label: string;
  /** Longer sentence, e.g. "Expires in 4 days". "" when no date. */
  detail: string;
  tone: ExpiryTone;
  /** Tailwind text-color class matching the tone (light + dark). */
  textClass: string;
  /** Whole days until expiry (negative = past). null when no date set. */
  daysLeft: number | null;
  /** 0..1 remaining-life for the ring, over a ~90-day actionable window. */
  fraction: number;
}

const TONE_TEXT: Record<ExpiryTone, string> = {
  red: "text-red-500",
  yellow: "text-yellow-600",
  green: "text-green-600",
  gray: "text-gray-400 dark:text-gray-500",
  none: "text-gray-300 dark:text-zinc-600",
};

/** Full ring at 90 days out; depletes as the date approaches. */
const RING_WINDOW_DAYS = 90;

export function getExpiryDisplay(expiresAt: string | null): ExpiryDisplay {
  if (!expiresAt) {
    return { label: "", detail: "", tone: "none", textClass: TONE_TEXT.none, daysLeft: null, fraction: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  const diff = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
  const fraction = diff <= 0 ? 0 : Math.min(diff / RING_WINDOW_DAYS, 1);

  const make = (label: string, detail: string, tone: ExpiryTone): ExpiryDisplay => ({
    label, detail, tone, textClass: TONE_TEXT[tone], daysLeft: diff, fraction,
  });

  if (diff < 0)
    return make(diff === -1 ? "Yesterday" : `${Math.abs(diff)}d ago`, diff === -1 ? "Expired yesterday" : `Expired ${Math.abs(diff)} days ago`, "red");
  if (diff === 0) return make("Today", "Expires today", "red");
  if (diff === 1) return make("Tmw", "Expires tomorrow", "red");
  if (diff <= 7) return make(`${diff}d`, `Expires in ${diff} days`, "red");
  if (diff <= 28) return make(`${diff}d`, `Expires in ${diff} days`, "yellow");
  if (diff <= 90) {
    const formatted = expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return make(formatted, `Expires ${formatted}`, "green");
  }
  if (diff >= 365) return make("1yr+", "Expires in over a year", "gray");
  const monthYear = expiry.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return make(monthYear, `Expires ${monthYear}`, "gray");
}

// ── Quick-set presets (shared by the edit + add expiry editors) ──────────
export const EXPIRY_PRESETS: { label: string; days: number }[] = [
  { label: "+3 days",   days: 3 },
  { label: "+1 week",   days: 7 },
  { label: "+1 month",  days: 30 },
  { label: "+3 months", days: 90 },
];

export function isoDateOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
