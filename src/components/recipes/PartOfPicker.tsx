"use client";

import { useState } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";

/**
 * "Part of" — which component of the recipe an ingredient or step belongs to
 * ("Marinade", "Sauce"). Replaces a bare free-text box where retyping
 * "For the sauce" on five rows had to match character-for-character or the
 * recipe rendered five separate headings.
 *
 * Presets cover most recipes; anything else is saved as a household pill via
 * household_taxonomy, so it's one tap on the next recipe too.
 */
export const PART_PRESETS = [
  "Marinade", "Sauce", "Dressing", "Topping",
  "Filling", "Garnish", "Base", "Dough", "Assembly",
];

export const RECIPE_PART_TYPE = "recipe_part";
export const RECIPE_KIND = "recipe";

export default function PartOfPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | undefined;
  onChange: (next: string | undefined) => void;
  compact?: boolean;
}) {
  const { taxonomy } = useHouseholdData();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const custom = taxonomy.listFor(RECIPE_PART_TYPE, RECIPE_KIND);
  // A value typed before presets existed (or parsed off an ingredient line)
  // still needs to show as selected, so fold it in.
  const options = [
    ...PART_PRESETS,
    ...custom.filter((c) => !PART_PRESETS.includes(c)),
    ...(value && !PART_PRESETS.includes(value) && !custom.includes(value) ? [value] : []),
  ];

  async function commit() {
    const label = draft.trim();
    setDraft("");
    setAdding(false);
    if (!label) return;
    const saved = await taxonomy.add(RECIPE_PART_TYPE, RECIPE_KIND, label);
    onChange(saved ?? label);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {!compact && (
        <span className="text-[11px] text-gray-400 dark:text-gray-500 mr-0.5">Part of</span>
      )}
      {options.map((opt) => {
        const on = value === opt;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(on ? undefined : opt)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors active:scale-[0.94] ${
              on
                ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
            }`}
          >
            {opt}
          </button>
        );
      })}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 24))}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { setDraft(""); setAdding(false); }
          }}
          placeholder="New part…"
          className="w-24 px-2.5 py-1 rounded-full text-[11px] bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-500"
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 active:scale-[0.94] transition-colors"
        >+ New</button>
      )}
    </div>
  );
}
