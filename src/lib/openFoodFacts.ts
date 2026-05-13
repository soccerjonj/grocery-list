/**
 * Thin typed client for the OpenFoodFacts public API.
 * https://wiki.openfoodfacts.org/API
 *
 * No API key required. CORS-enabled. We hit `world.openfoodfacts.org`
 * directly from the browser. Free, but please be a good citizen and
 * don't poll — we only call this on a successful barcode scan.
 */

export interface OpenFoodFactsProduct {
  /** Canonical product name. May be empty for unknown / rarely-edited items. */
  name: string;
  brand?: string;
  /** e.g. "500 g", "12 fl oz" — needs parsing to extract qty + unit. */
  quantityRaw?: string;
  /** Best parse of quantityRaw into a number, when feasible. */
  quantity?: number;
  /** Best parse of quantityRaw into a unit string the app already recognizes. */
  unit?: string;
  /** Hint about what kind of product this is, derived from categories_tags. */
  categoryHint?: "food" | "supplies" | null;
  /** Small product image URL, if available. */
  imageUrl?: string;
}

/**
 * Parse "500 g" / "12 fl oz" / "1 L" into {quantity, unit}.
 * Returns nothing if the string doesn't conform — caller falls back to
 * the user editing manually.
 */
function parseQuantity(raw: string | undefined): { quantity?: number; unit?: string } {
  if (!raw) return {};
  const trimmed = raw.trim();
  // Strip multi-pack prefixes like "6 x 330 mL" → take the trailing unit.
  const m = trimmed.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|mg|ml|cl|l|oz|lb|lbs|fl\s*oz|pack)\b/i);
  if (!m) return {};
  const qty = parseFloat(m[1].replace(",", "."));
  if (!Number.isFinite(qty)) return {};
  const unitRaw = m[2].toLowerCase().replace(/\s+/g, "");
  // Map to our app's COMMON_UNITS where possible
  const unitMap: Record<string, string> = {
    g: "g", kg: "kg", mg: "g",
    ml: "mL", cl: "mL", l: "L",
    oz: "oz", lb: "lb", lbs: "lb",
    floz: "oz", pack: "pack",
  };
  const unit = unitMap[unitRaw];
  if (!unit) return { quantity: qty };
  // Convert kg → cleaner numbers if possible (don't blow up if not).
  if (unitRaw === "mg" && qty >= 1000) return { quantity: qty / 1000, unit: "g" };
  if (unitRaw === "cl") return { quantity: qty * 10, unit: "mL" };
  return { quantity: qty, unit };
}

/**
 * Inspect OpenFoodFacts category tags to guess whether this is a food or
 * a non-food household item. Conservative: when in doubt, return null so
 * the app's own pantryHints / AI categorizer takes over.
 */
function inferKind(categoriesTags: string[] | undefined): "food" | "supplies" | null {
  if (!categoriesTags || categoriesTags.length === 0) return null;
  const tags = categoriesTags.map((t) => t.toLowerCase());
  // OpenFoodFacts also ships some non-food databases (Beauty, Products,
  // Pet Food). Heuristic: any tag mentioning "food" or "beverage" → food;
  // a tag mentioning "cosmetic", "cleaning", "hygiene", "pet" → supplies.
  const isSupplies = tags.some((t) =>
    t.includes("cosmetic") || t.includes("cleaning") || t.includes("hygiene") ||
    t.includes("personal-care") || t.includes("pet-food") || t.includes("petfood")
  );
  if (isSupplies) return "supplies";
  const isFood = tags.some((t) =>
    t.includes("food") || t.includes("beverage") || t.includes("drink") ||
    t.includes("dairy") || t.includes("snack") || t.includes("meat")
  );
  if (isFood) return "food";
  return null;
}

/**
 * Look up a barcode. Returns null if the product isn't in the database
 * (which is common — OFF coverage is excellent for European packaged
 * food and middling for US supplies). Caller should gracefully fall
 * back to manual entry in that case.
 */
export async function lookupBarcode(code: string): Promise<OpenFoodFactsProduct | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(trimmed)}.json?fields=product_name,brands,quantity,categories_tags,image_small_url,generic_name`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const json = await res.json();
    // status === 1 means found; 0 means not found.
    if (json?.status !== 1 || !json?.product) return null;
    const p = json.product as {
      product_name?: string;
      generic_name?: string;
      brands?: string;
      quantity?: string;
      categories_tags?: string[];
      image_small_url?: string;
    };
    const { quantity, unit } = parseQuantity(p.quantity);
    return {
      name: (p.product_name || p.generic_name || "").trim(),
      brand: p.brands?.split(",")[0]?.trim() || undefined,
      quantityRaw: p.quantity,
      quantity,
      unit,
      categoryHint: inferKind(p.categories_tags),
      imageUrl: p.image_small_url,
    };
  } catch {
    return null;
  }
}
