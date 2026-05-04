export interface PantryHint {
  storage_location: "fridge" | "freezer" | "pantry" | "room_temp";
  food_category: "produce" | "meat" | "dairy" | "drinks" | "condiments" | "grains" | "snacks" | "prepared" | "other";
  fridge_zone?: "quick_use" | "long_term";
}

// Ordered most-specific first — first match wins
const LOOKUP: Array<{ kw: string[]; hint: PantryHint }> = [
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
      "cinnamon", "cumin", "paprika", "turmeric", "oregano", "thyme",
      "rosemary", "bay leaf", "cayenne", "chili flakes", "garlic powder",
      "onion powder", "curry powder", "garam masala", "allspice", "nutmeg",
      "spice blend", "seasoning",
      "broth", "stock", "bouillon",
      "tomato sauce", "marinara", "tomato paste", "diced tomato",
      "coconut milk", "cream of mushroom", "condensed milk", "evaporated milk",
      "nutritional yeast", "cornstarch", "arrowroot",
    ],
    hint: { storage_location: "pantry", food_category: "condiments" },
  },
];

export function getPantryHint(name: string): PantryHint | null {
  if (!name || name.length < 3) return null;
  const lower = name.toLowerCase().trim();
  for (const { kw, hint } of LOOKUP) {
    if (kw.some((k) => lower.includes(k))) return hint;
  }
  return null;
}

/** Suggested days to expiry based on where/what the item is. */
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
