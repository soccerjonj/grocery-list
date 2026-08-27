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
