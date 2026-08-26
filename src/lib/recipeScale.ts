/**
 * Scaling + kitchen-friendly amount formatting for recipes.
 *
 * Why this exists: `recipeExtract.parseIngredientLine` PARSES unicode
 * fractions into decimals (⅓ → 0.3333…) but nothing anywhere formats them
 * back. Without this, scaling "⅓ cup" by 2 renders "0.6666666667 cup".
 */

/** Unicode fractions we're happy to show, richest-first for exact hits. */
const FRACTIONS: { value: number; glyph: string }[] = [
  { value: 1 / 8, glyph: "⅛" },
  { value: 1 / 4, glyph: "¼" },
  { value: 1 / 3, glyph: "⅓" },
  { value: 3 / 8, glyph: "⅜" },
  { value: 1 / 2, glyph: "½" },
  { value: 5 / 8, glyph: "⅝" },
  { value: 2 / 3, glyph: "⅔" },
  { value: 3 / 4, glyph: "¾" },
  { value: 7 / 8, glyph: "⅞" },
];

/** How close a decimal must be to a fraction before we snap to it. */
const SNAP_TOLERANCE = 0.04;

/**
 * Units where a fractional amount is meaningless — you don't buy ⅓ of a can.
 * Counts with no unit at all ("2 eggs") get the same treatment.
 */
const WHOLE_ONLY_UNITS = new Set(["can", "pack", "box", "bag", "bottle", "jar", "loaf"]);

function isWholeOnly(unit?: string | null): boolean {
  if (!unit || !unit.trim()) return true; // unitless counts: "2 eggs"
  return WHOLE_ONLY_UNITS.has(unit.trim().toLowerCase());
}

/**
 * Format a number the way a cookbook would: "1½", "¾", "2", "1.2".
 * Falls back to a trimmed decimal when it isn't near a common fraction.
 */
export function formatQuantity(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0";

  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs);
  const frac = abs - whole;

  // Close enough to a whole number.
  if (frac < SNAP_TOLERANCE) return `${sign}${whole}`;
  if (1 - frac < SNAP_TOLERANCE) return `${sign}${whole + 1}`;

  const hit = FRACTIONS.find((f) => Math.abs(frac - f.value) < SNAP_TOLERANCE);
  if (hit) return `${sign}${whole > 0 ? whole : ""}${hit.glyph}`;

  // No clean fraction — show at most 2 decimals, trimmed ("1.25", "0.4").
  return `${sign}${Number(abs.toFixed(2))}`;
}

/**
 * Scale a quantity by `factor`, keeping the result sensible for its unit.
 * Whole-only units (cans, packs, unitless counts) round to whole numbers with
 * a floor of 1 — never "2.5 eggs".
 */
export function scaleQuantity(
  quantity: number | undefined,
  factor: number,
  unit?: string | null,
): number | undefined {
  if (quantity === undefined || !Number.isFinite(quantity)) return quantity;
  if (!Number.isFinite(factor) || factor <= 0) return quantity;

  const scaled = quantity * factor;
  if (isWholeOnly(unit)) return Math.max(1, Math.round(scaled));
  return scaled;
}

/** "1½ cups" / "2 eggs" / "" when there's no quantity to show. */
export function formatAmount(
  quantity: number | undefined,
  unit?: string | null,
): string {
  if (quantity === undefined || !Number.isFinite(quantity)) return unit?.trim() ?? "";
  const q = formatQuantity(quantity);
  const u = unit?.trim();
  return u ? `${q} ${u}` : q;
}

/**
 * The multiplier for cooking `target` servings of a recipe written for
 * `base`. Returns 1 whenever either side is unknown, so scaling silently
 * no-ops rather than corrupting amounts.
 */
export function servingsFactor(
  base: number | null | undefined,
  target: number | null | undefined,
): number {
  if (!base || !target || base <= 0 || target <= 0) return 1;
  return target / base;
}
