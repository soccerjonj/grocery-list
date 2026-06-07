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
