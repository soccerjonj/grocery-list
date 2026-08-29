/**
 * Recipe extraction helpers (T3-B).
 *
 * Most recipe sites embed structured data (JSON-LD with `@type: Recipe`)
 * that gives us a clean `recipeIngredient` string array for free. We try
 * that first — when it works we skip the LLM call entirely. If a site
 * doesn't ship JSON-LD, the route falls back to sending HTML to Claude
 * Haiku to extract ingredients.
 */

// NOTE: only `titleCaseName` is imported — this module has its own private
// `normalizeUnit` (below) with different output ("mL"/"L" capitalized) than the
// exported one in normalizeItemName.ts. Importing that would shadow it.
import { titleCaseName } from "@/lib/normalizeItemName";

export interface ExtractedIngredient {
  /** Shopping-list-ready name, e.g. "All-Purpose Flour". */
  name: string;
  /** Optional numeric quantity, best-effort parsed. */
  quantity?: number;
  /** Optional unit, normalized where possible. */
  unit?: string;
  /** The original ingredient line, preserved so users can verify. */
  raw: string;
}

/**
 * What `parseIngredientLine` actually returns: an ingredient that may carry a
 * section parsed out of the line ("…, for the marinade").
 *
 * Declared here rather than importing `RecipeIngredient` from recipeTypes.ts —
 * that module imports THIS one, so pulling it back would be circular. The two
 * shapes are structurally compatible, which is all the call sites need.
 */
export interface RecipeIngredientLike extends ExtractedIngredient {
  group?: string;
}

/**
 * Walk an arbitrary JSON-LD blob (object, array, or `@graph` container)
 * to find every Recipe node. Some sites publish one Recipe; others
 * publish multiple within a single `@graph` block.
 */
function findRecipes(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  function visit(v: unknown) {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const type = obj["@type"];
      const typesArr = Array.isArray(type) ? type : [type];
      if (typesArr.some((t) => typeof t === "string" && t.toLowerCase().includes("recipe"))) {
        out.push(obj);
      }
      if (obj["@graph"]) visit(obj["@graph"]);
      // Some sites nest the Recipe under itemListElement or mainEntity.
      if (obj.mainEntity) visit(obj.mainEntity);
      if (obj.itemListElement) visit(obj.itemListElement);
    }
  }
  visit(value);
  return out;
}

/**
 * Pull every `<script type="application/ld+json">…</script>` block out
 * of an HTML string and parse each. Returns the union of Recipe nodes
 * found across all blocks. Non-JSON or malformed blocks are silently
 * skipped.
 */
export interface ExtractedStep {
  text: string;
  /** Section heading from a HowToSection, e.g. "Make the sauce". */
  group?: string;
}

export interface JsonLdRecipe {
  name: string | null;
  ingredients: string[];
  instructions: ExtractedStep[];
  servings: number | null;
  prepMinutes: number | null;
  cookMinutes: number | null;
  imageUrl: string | null;
  description: string | null;
}

/** ISO-8601 duration → minutes. "PT1H25M" → 85. Schema.org uses this format. */
export function parseIsoDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value.trim());
  if (!m) return null;
  const [, d, h, min] = m;
  const total = (Number(d ?? 0) * 1440) + (Number(h ?? 0) * 60) + Number(min ?? 0);
  return total > 0 ? Math.round(total) : null;
}

/** recipeYield is wildly inconsistent: 4, "4", "4 servings", "Serves 4-6", ["4"]. */
export function parseYield(value: unknown): number | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  if (typeof v !== "string") return null;
  // First integer in the string; "4-6" takes the low end, which is the honest floor.
  const m = /(\d+)/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n <= 500 ? n : null;
}

/** `image` may be a string, an array, or an ImageObject with a `url`. */
function parseImage(value: unknown): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v === "string") return /^https?:\/\//i.test(v) ? v : null;
  if (v && typeof v === "object") {
    const url = (v as Record<string, unknown>).url;
    if (typeof url === "string" && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

/**
 * `recipeInstructions` comes in three shapes: plain strings, HowToStep
 * objects, or HowToSection objects wrapping their own itemListElement. The
 * section case is where the "For the sauce:" groupings live, so we carry the
 * section name onto each of its steps.
 */
function parseInstructions(value: unknown, group?: string): ExtractedStep[] {
  if (typeof value === "string") {
    // A single blob — split on newlines when the site crammed steps together.
    return value
      .split(/\r?\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 1)
      .map((text) => ({ text, ...(group ? { group } : {}) }));
  }
  if (Array.isArray(value)) return value.flatMap((v) => parseInstructions(v, group));
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const type = String(obj["@type"] ?? "").toLowerCase();
    if (type.includes("howtosection")) {
      const name = typeof obj.name === "string" ? obj.name.trim() : undefined;
      return parseInstructions(obj.itemListElement ?? obj.steps, name || group);
    }
    const text = obj.text ?? obj.name;
    if (typeof text === "string" && text.trim().length > 1) {
      return [{ text: text.trim(), ...(group ? { group } : {}) }];
    }
  }
  return [];
}

export function extractRecipesFromHtml(html: string): JsonLdRecipe | null {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const recipes: Record<string, unknown>[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const raw = match[1].trim();
    try {
      // Some sites HTML-escape entities like &quot; in JSON-LD; do a small unescape.
      const cleaned = raw
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#39;/g, "'");
      const parsed = JSON.parse(cleaned);
      recipes.push(...findRecipes(parsed));
    } catch {
      // skip
    }
  }
  if (recipes.length === 0) return null;
  // Prefer the recipe with the most ingredients (the "real" one when a
  // page lists related recipes too).
  const best = recipes.reduce((acc, r) => {
    const a = Array.isArray(r.recipeIngredient) ? r.recipeIngredient.length : 0;
    const b = Array.isArray(acc?.recipeIngredient) ? (acc.recipeIngredient as unknown[]).length : 0;
    return a > b ? r : acc;
  }, recipes[0]);
  const ingredientsRaw = Array.isArray(best.recipeIngredient) ? best.recipeIngredient : [];
  const ingredients = ingredientsRaw
    .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    .map((s) => s.trim());
  const name = typeof best.name === "string" ? best.name : null;

  // Everything below was previously parsed and thrown away.
  const description =
    typeof best.description === "string" && best.description.trim()
      ? best.description.trim().slice(0, 500)
      : null;

  return {
    name,
    ingredients,
    instructions: parseInstructions(best.recipeInstructions),
    servings: parseYield(best.recipeYield),
    prepMinutes: parseIsoDuration(best.prepTime),
    cookMinutes:
      parseIsoDuration(best.cookTime) ??
      // Some sites publish only totalTime; treat it as cook time so the recipe
      // still shows a duration rather than nothing.
      parseIsoDuration(best.totalTime),
    imageUrl: parseImage(best.image),
    description,
  };
}

/**
 * Split a trailing "…, for the marinade" / "— for sauce" qualifier off an
 * ingredient name and return it as a section.
 *
 * This is a CORRECTNESS fix, not cosmetics: the qualifier used to stay glued
 * to the name, so `normalizeItemName("soy sauce, for marinade")` never matched
 * a pantry "Soy Sauce" — the ingredient showed as missing forever and got
 * re-added to the shopping list on every trip.
 *
 * Deliberately conservative. Only a trailing `for …` clause after a comma or
 * dash counts, and only when the remainder is short enough to be a section
 * name rather than prose. "Bread for serving" (no separator) is left alone,
 * because splitting there would strip a real part of the name.
 */
export function splitTrailingPart(name: string): { name: string; group?: string } {
  const m = name.match(/^(.*?)\s*[,;—–-]\s*for\s+(?:the\s+|a\s+)?([a-z0-9][a-z0-9 '’-]{1,24})\.?$/i);
  if (!m) return { name: name.trim() };
  const base = m[1].trim();
  const part = m[2].trim();
  // A qualifier that ate the whole name means we mis-parsed — keep the original.
  if (!base) return { name: name.trim() };
  // "for serving" / "for garnish" describe WHEN, not which component; they're
  // handled as `optional` upstream rather than invented as sections.
  if (/^(serving|serves|garnish|topping the|drizzling|dusting|brushing)$/i.test(part)) {
    return { name: base };
  }
  return { name: base, group: titleCaseName(part) };
}

/**
 * Quick regex pass on a single ingredient line to extract qty + unit.
 * Used to short-circuit when the LLM isn't necessary. Returns just
 * the raw line if we can't parse cleanly.
 */
/**
 * Words that may legitimately sit between a number and the ingredient name.
 * Measurements plus the count-nouns recipes use like units ("3 cloves garlic").
 *
 * This list is the FIX for a long-standing parsing bug: the pattern below used
 * to accept *any* word after the number as a unit, so "1 baguette for serving"
 * parsed to name "for serving" and "2 chicken breasts" to name "breasts" — the
 * ingredient was unmatchable and read as nonsense. Anything not listed here is
 * now treated as the start of the name instead.
 */
const KNOWN_UNIT_WORDS = new Set([
  "tsp", "teaspoon", "teaspoons", "t",
  "tbsp", "tablespoon", "tablespoons", "tbs", "tb",
  "cup", "cups", "c",
  "oz", "ounce", "ounces", "fl", "floz",
  "lb", "lbs", "pound", "pounds",
  "g", "gram", "grams", "kg", "kilogram", "kilograms",
  "ml", "milliliter", "milliliters", "l", "liter", "liters", "litre", "litres",
  "pint", "pints", "quart", "quarts", "gallon", "gallons",
  "can", "cans", "pack", "packs", "package", "packages", "pkg",
  "box", "boxes", "bag", "bags", "bottle", "bottles", "jar", "jars",
  "clove", "cloves", "stick", "sticks", "slice", "slices",
  "sprig", "sprigs", "head", "heads", "stalk", "stalks",
  "bunch", "bunches", "pinch", "pinches", "dash", "dashes",
  "handful", "handfuls", "piece", "pieces",
]);

export function parseIngredientLine(raw: string): RecipeIngredientLike {
  const trimmed = raw.trim();
  // Match leading qty + unit. Accept unicode fractions (½ ¼ ¾ ⅓ ⅔), mixed
  // numbers ("1 1/2"), decimals, and simple fractions ("1/2"). The unit group
  // is validated against KNOWN_UNIT_WORDS below rather than trusted.
  const m = trimmed.match(
    /^((?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞]))(?:\s+([a-z]+\.?))?\s+(.+)$/i,
  );
  // Title-cased here as well as in the LLM path: this regex fast path is the
  // most common URL import (JSON-LD sites) and never reaches the model, so
  // fixing only the prompt would leave those recipes lowercase.
  if (!m) {
    const split = shapeName(trimmed);
    return { ...split, raw: trimmed };
  }
  const qtyStr = m[1];
  const candidate = m[2]?.toLowerCase().replace(/\.$/, "");
  // Only consume the word as a unit if it really is one; otherwise it belongs
  // to the name ("1 baguette for serving" → "Baguette", not unit "baguette").
  const isUnit = !!candidate && KNOWN_UNIT_WORDS.has(candidate);
  const rest = isUnit ? m[3].trim() : [m[2], m[3]].filter(Boolean).join(" ").trim();
  const split = shapeName(rest);
  return {
    ...split,
    quantity: parseQty(qtyStr),
    unit: isUnit ? normalizeUnit(candidate) : undefined,
    raw: trimmed,
  };
}

/**
 * Canonical form for a "Part of" section: "For the sauce:" → "Sauce".
 *
 * Applied to model output as well as parsed text. The prompt asks for the bare
 * noun, but models reliably re-add "For the " and the colon — the same reason
 * the colon was already being stripped here rather than trusted to the prompt.
 * Canonicalizing matters beyond looks: `groupSections` compares group strings
 * exactly, so "For the sauce" and "Sauce" would render as two headings.
 */
export function canonicalPart(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw
    .trim()
    .replace(/:\s*$/, "")
    .replace(/^for\s+(?:the\s+|a\s+)?/i, "")
    .trim();
  return cleaned ? titleCaseName(cleaned) : undefined;
}

/**
 * Prep and serving notes that belong to the cook, not the shopping list.
 * The LLM prompt already strips these; the regex fast path never did, so
 * "1 onion, diced" was stored as "Onion, Diced" and matched no pantry row.
 */
const PREP_NOTE =
  /^(?:finely |coarsely |roughly |thinly |freshly |lightly |well )?(?:diced|chopped|minced|sliced|grated|shredded|melted|softened|beaten|sifted|drained|rinsed|peeled|halved|quartered|cubed|crushed|toasted|packed|divided|cubed|trimmed|room temperature|at room temperature|plus more|to taste|for serving|for garnish|optional)$/i;

/** Strip trailing prep/serving notes, with or without a comma. */
function stripTrailingNoise(name: string): string {
  let out = name.trim();
  // Comma-separated notes, possibly several ("1 onion, peeled, diced").
  for (let i = 0; i < 3; i += 1) {
    const m = out.match(/^(.*?),\s*([^,]+)$/);
    if (!m || !PREP_NOTE.test(m[2].trim())) break;
    out = m[1].trim();
  }
  // "for serving" / "for garnish" also appear with no comma at all.
  out = out.replace(/\s+for\s+(?:serving|garnish)\.?$/i, "").trim();
  return out || name.trim();
}

/** Shared name shaping: split off a trailing part, drop prep notes, title-case. */
function shapeName(rest: string): { name: string; group?: string } {
  const { name, group } = splitTrailingPart(rest);
  return { name: titleCaseName(stripTrailingNoise(name)), ...(group ? { group } : {}) };
}

function parseQty(s: string): number | undefined {
  const fractions: Record<string, number> = {
    "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
  };
  if (s in fractions) return fractions[s];
  // Mixed number "1 1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return parseInt(mixed[1]) + parseInt(mixed[2]) / parseInt(mixed[3]);
  // Plain fraction "1/2"
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return parseInt(frac[1]) / parseInt(frac[2]);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeUnit(u: string | undefined): string | undefined {
  if (!u) return undefined;
  const map: Record<string, string> = {
    tsp: "tsp", teaspoon: "tsp", teaspoons: "tsp",
    tbsp: "tbsp", tablespoon: "tbsp", tablespoons: "tbsp",
    cup: "cup", cups: "cup", c: "cup",
    oz: "oz", ounce: "oz", ounces: "oz",
    lb: "lb", lbs: "lb", pound: "lb", pounds: "lb",
    g: "g", gram: "g", grams: "g",
    kg: "kg", kilogram: "kg", kilograms: "kg",
    ml: "mL", mL: "mL", milliliter: "mL", milliliters: "mL",
    l: "L", liter: "L", liters: "L",
    can: "can", cans: "can",
    pack: "pack", packs: "pack",
    box: "box", boxes: "box",
    bag: "bag", bags: "bag",
    bottle: "bottle", bottles: "bottle",
  };
  return map[u] ?? u;
}
