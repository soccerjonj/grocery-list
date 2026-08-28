/**
 * Canonical name key for duplicate detection across the app.
 *
 * Two item names that a human would call "the same thing" should produce the
 * same key, so "add milk when milk exists" merges instead of duplicating.
 * Deliberately CONSERVATIVE — we'd rather miss a fuzzy match than wrongly
 * merge two genuinely different items.
 *
 * Steps: accent-fold → lowercase → trim → collapse internal whitespace →
 * strip leading/trailing punctuation → singularize the final word (the head
 * noun in grocery names: "green beans" → "green bean", "tomatoes" → "tomato").
 */

// Words that end in "s" but are already singular — never strip the trailing s.
const SINGULAR_S_WORDS = new Set([
  "hummus", "molasses", "asparagus", "couscous", "swiss", "bass",
  "gas", "lens", "series", "species", "news", "chips", "oats",
  "greens", "grits", "cheerios", "pringles", "ritz",
]);

// Irregular plurals worth handling explicitly (head-noun groceries).
const IRREGULAR: Record<string, string> = {
  leaves: "leaf",
  loaves: "loaf",
  knives: "knife",
  potatoes: "potato",
  tomatoes: "tomato",
  avocadoes: "avocado",
  mangoes: "mango",
  berries: "berry",
};

function singularizeWord(word: string): string {
  if (word.length <= 3) return word;          // "ribs"/"egg" — too short to fold safely
  if (SINGULAR_S_WORDS.has(word)) return word;
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (word.endsWith("ss")) return word;        // "glass", "swiss"
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";          // berries→berry
  if (/(ch|sh|x|z|s)es$/.test(word)) return word.slice(0, -2);       // boxes→box, dishes→dish
  if (word.endsWith("oes")) return word.slice(0, -2);                 // tomatoes→tomato
  if (word.endsWith("s")) return word.slice(0, -1);                   // beans→bean
  return word;
}

export function normalizeItemName(name: string): string {
  const cleaned = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")           // drop combining accents
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")                       // collapse internal whitespace
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");  // strip leading/trailing punctuation

  if (!cleaned) return "";
  const words = cleaned.split(" ");
  words[words.length - 1] = singularizeWord(words[words.length - 1]);
  return words.join(" ");
}

/** Optional unit synonym fold, so "can"/"cans" or "g"/"gram" merge cleanly. */
const UNIT_SYNONYMS: Record<string, string> = {
  cans: "can", can: "can",
  bags: "bag", bag: "bag",
  boxes: "box", box: "box",
  bottles: "bottle", bottle: "bottle",
  packs: "pack", pack: "pack", pkg: "pack", package: "pack",
  grams: "g", gram: "g", g: "g",
  kilograms: "kg", kilogram: "kg", kg: "kg",
  milliliters: "ml", milliliter: "ml", ml: "ml",
  liters: "l", liter: "l", l: "l",
  ounces: "oz", ounce: "oz", oz: "oz",
  pounds: "lb", pound: "lb", lbs: "lb", lb: "lb",
};

export function normalizeUnit(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase();
  if (!u) return "";
  return UNIT_SYNONYMS[u] ?? u;
}

// ── Display casing ────────────────────────────────────────────────────────

/**
 * Connecting words that stay lowercase mid-phrase, per standard cookbook
 * style: "Salt and Pepper to Taste", "Cream of Mushroom Soup".
 */
const MINOR_WORDS = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into",
  "nor", "of", "on", "onto", "or", "per", "the", "to", "with", "without",
]);

/**
 * Title-case an item name for display: "all-purpose flour" → "All-Purpose Flour".
 *
 * Safe to apply anywhere — every pantry/shopping match funnels through
 * `normalizeItemName`, which lowercases internally, so casing can never affect
 * duplicate detection or availability.
 *
 * Deliberately conservative:
 *  • A token already containing an uppercase letter is left ALONE, so acronyms
 *    and brands the user typed ("BBQ sauce", "McCormick") survive intact.
 *  • Hyphenated and slashed compounds capitalize each part ("all-purpose").
 *  • Minor words lowercase only mid-phrase — never the first or last word.
 */
export function titleCaseName(name: string | null | undefined): string {
  const raw = (name ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  const words = raw.split(" ");
  return words
    .map((word, i) => {
      // Respect casing the user (or the source) already chose.
      if (/[A-Z]/.test(word)) return word;

      const isEdge = i === 0 || i === words.length - 1;
      if (!isEdge && MINOR_WORDS.has(word.toLowerCase())) return word.toLowerCase();

      // Capitalize each segment of "all-purpose" / "half/half".
      return word.replace(/[^\s\-/]+/g, (part) =>
        part.charAt(0).toUpperCase() + part.slice(1).toLowerCase(),
      );
    })
    .join(" ");
}

/**
 * Sentence-case a cooking step: capitalize the first letter, leave the rest be.
 * Steps are prose, so title case would be wrong here.
 */
export function sentenceCase(text: string | null | undefined): string {
  const raw = (text ?? "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
