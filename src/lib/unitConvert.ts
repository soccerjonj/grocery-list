import { normalizeUnit } from "@/lib/normalizeItemName";

/**
 * Minimal unit conversion for comparing a recipe's needed amount against what
 * the pantry holds.
 *
 * DELIBERATELY NO mass↔volume conversion. "2 cups of flour" vs "1 kg of flour"
 * needs a per-ingredient density; guessing it would confidently produce wrong
 * numbers. Anything we can't compare honestly is reported as `unknown` and
 * shown to the user as both amounts side by side, rather than a false answer.
 *
 * Every unit is folded through `normalizeUnit` from normalizeItemName.ts first
 * (which lowercases and singularizes: "Cans" → "can"). NOTE: recipeExtract.ts
 * has a *different, module-private* function of the same name that emits
 * capitalized "mL"/"L" — the lowercase fold here is what makes both agree.
 */

export type UnitDimension = "mass" | "volume" | "count" | "opaque";

/** Factors into each dimension's base unit (g, ml, or 1 item). */
const MASS: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
const VOLUME: Record<string, number> = {
  ml: 1, l: 1000,
  tsp: 4.92892, tbsp: 14.7868, cup: 236.588,
  "fl oz": 29.5735, pint: 473.176, quart: 946.353, gallon: 3785.41,
};
/** Unitless counts — "2 eggs" and a pantry row of "3" are comparable. */
const COUNT = new Set(["", "piece", "pieces", "whole", "ct", "count"]);
/**
 * Units that only compare to themselves. 2 cans vs 3 cans is answerable;
 * 2 cans vs 500 g is not (a can of what, how big?).
 */
const OPAQUE = new Set(["can", "pack", "bag", "box", "bottle", "jar", "loaf", "bunch", "clove"]);

export interface BaseAmount {
  dim: UnitDimension;
  value: number;
  /** For `opaque`, the specific unit — only equal units are comparable. */
  unit: string;
}

/**
 * Convert an amount to its dimension's base unit. Returns null when the unit
 * is unrecognized (so callers report "unknown" rather than guessing).
 */
export function toBase(quantity: number, unit?: string | null): BaseAmount | null {
  if (!Number.isFinite(quantity)) return null;
  const u = normalizeUnit(unit);

  if (u in MASS)   return { dim: "mass",   value: quantity * MASS[u],   unit: "g" };
  if (u in VOLUME) return { dim: "volume", value: quantity * VOLUME[u], unit: "ml" };
  if (COUNT.has(u)) return { dim: "count",  value: quantity, unit: "" };
  if (OPAQUE.has(u)) return { dim: "opaque", value: quantity, unit: u };
  return null;
}

/** True when two units can be honestly compared. */
export function comparable(a?: string | null, b?: string | null): boolean {
  const x = toBase(1, a);
  const y = toBase(1, b);
  if (!x || !y || x.dim !== y.dim) return false;
  // Opaque units must be the identical unit ("can" vs "can"), not just same dim.
  if (x.dim === "opaque") return x.unit === y.unit;
  return true;
}

/**
 * Express `quantity fromUnit` in `toUnit`. Returns null when not comparable —
 * never a best-effort guess.
 */
export function convert(
  quantity: number,
  fromUnit?: string | null,
  toUnit?: string | null,
): number | null {
  const from = toBase(quantity, fromUnit);
  const to = toBase(1, toUnit);
  if (!from || !to || from.dim !== to.dim) return null;
  if (from.dim === "opaque" && from.unit !== to.unit) return null;
  if (to.value === 0) return null;
  return from.value / to.value;
}
