/**
 * Recipe extraction helpers (T3-B).
 *
 * Most recipe sites embed structured data (JSON-LD with `@type: Recipe`)
 * that gives us a clean `recipeIngredient` string array for free. We try
 * that first — when it works we skip the LLM call entirely. If a site
 * doesn't ship JSON-LD, the route falls back to sending HTML to Claude
 * Haiku to extract ingredients.
 */

export interface ExtractedIngredient {
  /** Shopping-list-ready name, e.g. "all-purpose flour". */
  name: string;
  /** Optional numeric quantity, best-effort parsed. */
  quantity?: number;
  /** Optional unit, normalized where possible. */
  unit?: string;
  /** The original ingredient line, preserved so users can verify. */
  raw: string;
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
export function extractRecipesFromHtml(html: string): {
  name: string | null;
  ingredients: string[];
} | null {
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
  return { name, ingredients };
}

/**
 * Quick regex pass on a single ingredient line to extract qty + unit.
 * Used to short-circuit when the LLM isn't necessary. Returns just
 * the raw line if we can't parse cleanly.
 */
export function parseIngredientLine(raw: string): ExtractedIngredient {
  const trimmed = raw.trim();
  // Match leading qty + unit. Accept unicode fractions (½ ¼ ¾ ⅓ ⅔), mixed
  // numbers ("1 1/2"), decimals, and simple fractions ("1/2").
  const m = trimmed.match(
    /^((?:\d+\s+\d\/\d|\d+\/\d|\d+(?:\.\d+)?|[½¼¾⅓⅔⅛⅜⅝⅞]))(?:\s+([a-z]+\.?))?\s+(.+)$/i,
  );
  if (!m) return { name: trimmed, raw: trimmed };
  const qtyStr = m[1];
  const unitStr = m[2]?.toLowerCase().replace(/\.$/, "");
  const rest = m[3].trim();
  return {
    name: rest,
    quantity: parseQty(qtyStr),
    unit: normalizeUnit(unitStr),
    raw: trimmed,
  };
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
