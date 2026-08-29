export interface PantryHint {
  kind: "food" | "supplies";
  storage_location: string;
  food_category: string;
  fridge_zone?: "quick_use" | "long_term";
}

// ── Food keywords ─────────────────────────────────────────────────────
// Ordered most-specific first — first match wins
const FOOD_LOOKUP: Array<{ kw: string[]; hint: Omit<PantryHint, "kind"> }> = [
  // ── Frozen ────────────────────────────────────────────────────────────
  {
    kw: ["frozen", "ice cream", "gelato", "sorbet", "popsicle", "ice pop", "ice pack"],
    hint: { storage_location: "freezer", food_category: "other" },
  },

  // ── Dairy – quick use (high turnover) ────────────────────────────────
  {
    kw: [
      "milk", "oat milk", "almond milk", "soy milk", "rice milk",
      "yogurt", "yoghurt", "kefir",
      "heavy cream", "whipping cream", "half and half", "sour cream",
      "cream cheese", "cottage cheese", "ricotta", "creamer", "custard",
    ],
    hint: { storage_location: "fridge", food_category: "dairy", fridge_zone: "quick_use" },
  },

  // ── Dairy – long term (harder cheeses, butter) ────────────────────────
  {
    kw: [
      "cheese", "mozzarella", "cheddar", "parmesan", "brie", "gouda",
      "feta", "swiss", "gruyere", "provolone", "camembert", "manchego",
      "pecorino", "havarti", "colby", "muenster", "butter",
    ],
    hint: { storage_location: "fridge", food_category: "dairy", fridge_zone: "long_term" },
  },

  // ── Meat ─────────────────────────────────────────────────────────────
  {
    kw: [
      "chicken", "beef", "pork", "lamb", "turkey", "veal", "duck", "venison",
      "salmon", "tuna", "tilapia", "cod", "halibut", "mahi", "trout", "bass",
      "shrimp", "prawn", "crab", "lobster", "scallop", "oyster", "clam", "mussel",
      "steak", "brisket", "ribs", "tenderloin", "mince", "ground beef", "ground turkey", "ground pork",
      "fillet", "filet", "sausage", "bacon", "ham", "deli meat", "salami",
      "pepperoni", "prosciutto", "pancetta", "chorizo", "bologna", "pastrami",
    ],
    hint: { storage_location: "fridge", food_category: "meat", fridge_zone: "quick_use" },
  },

  // ── Produce – fridge ─────────────────────────────────────────────────
  {
    kw: [
      "broccoli", "cauliflower", "asparagus", "spinach", "kale", "arugula",
      "lettuce", "mixed greens", "chard", "bok choy", "brussels sprout",
      "green bean", "snap pea", "snow pea", "zucchini", "cucumber", "celery",
      "bell pepper", "capsicum", "carrot", "beet", "radish", "fennel",
      "scallion", "green onion", "leek", "artichoke", "edamame", "peas",
      "mushroom", "berry", "strawberry", "blueberry", "raspberry",
      "blackberry", "cherry", "grape", "fig", "peach", "plum", "nectarine",
      "apricot", "papaya", "avocado", "mango chunk", "pineapple chunk",
      "melon slice", "watermelon slice", "fresh herb", "cilantro", "parsley",
      "basil", "mint", "dill", "chive", "tarragon", "sage",
    ],
    hint: { storage_location: "fridge", food_category: "produce", fridge_zone: "quick_use" },
  },

  // ── Drinks – fridge ──────────────────────────────────────────────────
  {
    kw: [
      "juice", "orange juice", "apple juice", "kombucha", "beer", "lager",
      "ale", "cider", "white wine", "rosé", "champagne", "prosecco",
      "sparkling water", "tonic", "coconut water", "sports drink",
      "protein shake", "smoothie", "cold brew",
    ],
    hint: { storage_location: "fridge", food_category: "drinks", fridge_zone: "long_term" },
  },

  // ── Condiments – fridge ──────────────────────────────────────────────
  {
    kw: [
      "ketchup", "mustard", "mayo", "mayonnaise", "hot sauce", "sriracha",
      "soy sauce", "teriyaki", "oyster sauce", "fish sauce", "hoisin",
      "worcestershire", "ranch", "caesar", "vinaigrette", "salad dressing",
      "salsa", "guacamole", "hummus", "tzatziki", "pesto", "tahini",
      "miso paste", "aioli", "relish", "pickle", "capers", "kimchi",
    ],
    hint: { storage_location: "fridge", food_category: "condiments", fridge_zone: "long_term" },
  },

  // ── Prepared / leftovers ─────────────────────────────────────────────
  {
    kw: ["leftover", "meal prep", "tofu", "tempeh", "seitan", "prepared meal"],
    hint: { storage_location: "fridge", food_category: "prepared", fridge_zone: "quick_use" },
  },

  // ── Counter / room temp – produce ────────────────────────────────────
  {
    kw: [
      "banana", "plantain", "onion", "shallot", "garlic", "potato",
      "sweet potato", "yam", "butternut squash", "acorn squash", "spaghetti squash",
      "pumpkin", "tomato", "apple", "orange", "lemon", "lime", "grapefruit",
      "clementine", "mandarin", "tangerine", "pear", "kiwi", "watermelon",
      "cantaloupe", "honeydew", "passion fruit", "bread",
    ],
    hint: { storage_location: "room_temp", food_category: "produce" },
  },

  // ── Grains & pantry staples ──────────────────────────────────────────
  {
    kw: [
      "rice", "pasta", "spaghetti", "penne", "linguine", "fettuccine",
      "lasagna noodle", "ramen", "udon", "soba", "couscous", "quinoa",
      "barley", "farro", "bulgur", "polenta", "cornmeal",
      "flour", "oat", "oatmeal", "cereal", "muesli", "granola",
      "lentil", "chickpea", "black bean", "kidney bean", "navy bean",
      "pinto bean", "white bean", "split pea",
      "cracker", "breadcrumb", "panko", "crouton",
      "can of", "canned tuna", "canned salmon", "canned chicken",
      "canned tomato", "canned beans", "canned corn",
    ],
    hint: { storage_location: "pantry", food_category: "grains" },
  },

  // ── Snacks ───────────────────────────────────────────────────────────
  {
    kw: [
      "chips", "popcorn", "pretzels", "cookies", "biscuit",
      "chocolate bar", "candy", "gummies", "gummy",
      "almonds", "walnuts", "cashews", "peanuts", "pistachios",
      "macadamia", "pecans", "mixed nuts", "trail mix",
      "dried fruit", "raisins", "dried cranberry", "dried apricot", "dates",
      "protein bar", "granola bar", "energy bar", "fruit snack", "rice cake",
    ],
    hint: { storage_location: "pantry", food_category: "snacks" },
  },

  // ── Spices & seasonings ──────────────────────────────────────────────
  // Split out of the condiments block so a spice rack is visible as its own
  // pantry section. Listed BEFORE condiments because matching is
  // most-specific-first and "garlic powder" would otherwise be swallowed.
  {
    kw: [
      "cinnamon", "cumin", "paprika", "turmeric", "oregano", "thyme",
      "rosemary", "bay leaf", "cayenne", "chili flakes", "chili powder",
      "garlic powder", "onion powder", "curry powder", "garam masala",
      "allspice", "nutmeg", "coriander", "cardamom", "ginger powder",
      "black pepper", "peppercorn", "red pepper flakes", "italian seasoning",
      "spice blend", "seasoning", "sage", "dill", "parsley flakes",
    ],
    hint: { storage_location: "pantry", food_category: "spices" },
  },

  // ── Pantry condiments, baking & staples ──────────────────────────────
  {
    kw: [
      "olive oil", "vegetable oil", "canola oil", "coconut oil", "avocado oil",
      "sesame oil", "vinegar", "balsamic", "apple cider vinegar",
      "salt", "pepper", "sugar", "brown sugar", "powdered sugar", "stevia",
      "honey", "maple syrup", "agave", "molasses",
      "jam", "jelly", "marmalade", "peanut butter", "almond butter",
      "nutella", "sunflower butter",
      "coffee", "espresso", "tea", "cocoa powder", "hot chocolate",
      "baking soda", "baking powder", "yeast", "vanilla extract",
      "broth", "stock", "bouillon",
      "tomato sauce", "marinara", "tomato paste", "diced tomato",
      "coconut milk", "cream of mushroom", "condensed milk", "evaporated milk",
      "nutritional yeast", "cornstarch", "arrowroot",
    ],
    hint: { storage_location: "pantry", food_category: "condiments" },
  },
];

// ── Supplies keywords ─────────────────────────────────────────────────
// Non-food household items. Storage locations come from SUPPLIES_LOCATIONS:
// 'bathroom' | 'laundry' | 'kitchen' | 'garage' | 'other'.
// Categories come from SUPPLIES_CATEGORIES: 'cleaning' | 'personal_care'
// | 'paper_goods' | 'pet' | 'other'.
//
// Order matters within this array — most specific first. e.g. "paper towel"
// must come before generic "tissue" / "kleenex" so kitchen wins over bathroom.
const SUPPLIES_LOOKUP: Array<{ kw: string[]; hint: Omit<PantryHint, "kind"> }> = [
  // ── Pet ─────────────────────────────────────────────────────────────
  {
    kw: [
      "cat food", "dog food", "kitty food", "puppy food",
      "cat litter", "kitty litter", "litter box",
      "pet treat", "dog treat", "cat treat",
      "kibble", "pet food", "pet shampoo",
    ],
    hint: { storage_location: "kitchen", food_category: "pet" },
  },

  // ── Paper goods – kitchen (more specific than generic tissue) ───────
  {
    kw: ["paper towel", "kitchen roll"],
    hint: { storage_location: "kitchen", food_category: "paper_goods" },
  },

  // ── Paper goods – bathroom ──────────────────────────────────────────
  {
    kw: ["toilet paper", "tp roll", "tissue", "kleenex", "facial tissue", "napkin"],
    hint: { storage_location: "bathroom", food_category: "paper_goods" },
  },

  // ── Personal care – bathroom ────────────────────────────────────────
  {
    kw: [
      "toothpaste", "toothbrush", "floss", "mouthwash",
      "deodorant", "antiperspirant",
      "shampoo", "conditioner", "body wash", "soap bar", "bar soap",
      "hand soap", "lotion", "moisturizer",
      "razor", "razor blade", "shaving cream", "shaving gel",
      "sunscreen", "sunblock",
      "hairspray", "hair gel", "hair oil",
      "cotton swab", "cotton ball", "q-tip", "qtip",
      "tampon", "pad", "menstrual",
      "band-aid", "bandage", "gauze", "antiseptic",
      "ibuprofen", "acetaminophen", "aspirin", "tylenol", "advil", "vitamin",
      "contact lens", "contact solution",
    ],
    hint: { storage_location: "bathroom", food_category: "personal_care" },
  },

  // ── Cleaning – laundry room ─────────────────────────────────────────
  {
    kw: [
      "laundry detergent", "fabric softener", "dryer sheet",
      "stain remover", "bleach", "oxiclean", "tide", "downy",
    ],
    hint: { storage_location: "laundry", food_category: "cleaning" },
  },

  // ── Cleaning – kitchen ──────────────────────────────────────────────
  {
    kw: [
      "dish soap", "dish detergent", "dishwasher pod", "dishwasher tablet",
      "sponge", "scrubber", "scour pad",
      "trash bag", "garbage bag", "kitchen bag",
      "ziploc", "ziplock", "freezer bag", "sandwich bag",
      "foil", "aluminum foil", "plastic wrap", "cling film",
      "parchment paper", "wax paper",
      "all-purpose cleaner", "windex", "glass cleaner",
      "disinfectant", "lysol", "clorox", "disinfecting wipe",
      "dish gloves", "rubber gloves",
    ],
    hint: { storage_location: "kitchen", food_category: "cleaning" },
  },

  // ── Cleaning – generic / other ──────────────────────────────────────
  {
    kw: [
      "broom", "mop", "dustpan", "vacuum bag",
      "air freshener", "candle", "matches", "lighter",
      "light bulb", "lightbulb", "battery", "batteries",
    ],
    hint: { storage_location: "other", food_category: "other" },
  },
];

export function getPantryHint(name: string): PantryHint | null {
  if (!name || name.length < 3) return null;
  const lower = name.toLowerCase().trim();
  // Try food first — its keyword set is broader and more diverse.
  for (const { kw, hint } of FOOD_LOOKUP) {
    if (kw.some((k) => lower.includes(k))) return { kind: "food", ...hint };
  }
  for (const { kw, hint } of SUPPLIES_LOOKUP) {
    if (kw.some((k) => lower.includes(k))) return { kind: "supplies", ...hint };
  }
  return null;
}

/**
 * Like `getPantryHint` but falls back to the server-side AI classifier
 * (T3-D) when the keyword lookup returns nothing. Always returns
 * synchronously what we know now; if the keyword lookup misses, fires
 * the network call and resolves the returned promise when the LLM
 * answers. Callers typically use this in a debounced effect.
 *
 * The fallback's result is cached server-side, so subsequent calls for
 * the same name skip the LLM entirely (~50 ms response from cache).
 */
export async function getOrClassify(name: string): Promise<PantryHint | null> {
  const local = getPantryHint(name);
  if (local) return local;
  if (!name || name.trim().length < 3) return null;

  try {
    const res = await fetch("/api/classify-item", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      kind?: "food" | "supplies";
      food_category?: string | null;
      storage_location?: string | null;
      fridge_zone?: string | null;
    };
    if (data.kind !== "food" && data.kind !== "supplies") return null;
    return {
      kind: data.kind,
      food_category: data.food_category ?? "other",
      storage_location: data.storage_location ?? (data.kind === "supplies" ? "other" : "pantry"),
      ...(data.fridge_zone === "quick_use" || data.fridge_zone === "long_term"
        ? { fridge_zone: data.fridge_zone }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Suggested days to expiry based on where/what the item is. Food only. */
export function getSuggestedExpiryDays(storage: string, category: string): number | null {
  if (!storage) return null;
  if (storage === "freezer") return 90;
  if (storage === "fridge") {
    if (category === "meat")       return 3;
    if (category === "produce")    return 5;
    if (category === "prepared")   return 4;
    if (category === "dairy")      return 7;
    if (category === "drinks")     return 14;
    if (category === "condiments") return 30;
    return 7;
  }
  if (storage === "pantry") {
    if (category === "grains")     return 365;
    if (category === "snacks")     return 90;
    return 180;
  }
  if (storage === "room_temp") {
    if (category === "produce")    return 5;
    return 7;
  }
  return null;
}

/** Human-readable label for a day count. */
export function formatSuggestedDays(days: number): string {
  if (days <= 6)   return `~${days} day${days !== 1 ? "s" : ""}`;
  if (days <= 10)  return "~1 week";
  if (days <= 20)  return "~2 weeks";
  if (days <= 45)  return "~1 month";
  if (days <= 75)  return "~2 months";
  if (days <= 120) return "~3 months";
  if (days <= 270) return "~6 months";
  return "~1 year";
}
