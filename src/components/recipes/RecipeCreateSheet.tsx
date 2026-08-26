"use client";

import { useState, useEffect } from "react";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";

/**
 * "New recipe" — asks only for a name, creates the row, and hands off to the
 * recipe page where everything else is edited. Keeping creation to one field
 * means adding a recipe never feels like filling in a form.
 *
 * (Phase 4 adds URL / photo / paste alongside "Blank" here.)
 */
export default function RecipeCreateSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setName(""); setBusy(false); }
  }, [open]);

  async function submit() {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    try {
      await onCreate(n);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ItemSheet
      open={open}
      onClose={onClose}
      header={<ItemSheetHeader title="New recipe" onClose={onClose} />}
    >
      <div className="flex flex-col gap-3">
        <label htmlFor="recipe-name" className="text-xs font-medium text-gray-400 dark:text-gray-500">
          What are you making?
        </label>
        <input
          id="recipe-name"
          type="text"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
          placeholder="e.g. Grandma's chili"
          className="w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!name.trim() || busy}
          className="w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
        >
          {busy ? "Creating…" : "Create recipe"}
        </button>
        <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
          You&apos;ll add ingredients and steps next.
        </p>
      </div>
    </ItemSheet>
  );
}
