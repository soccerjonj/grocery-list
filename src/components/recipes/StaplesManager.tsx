"use client";

import { useState } from "react";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import {
  STAPLE_TYPE, ALIAS_TYPE, INGREDIENT_KIND, SUGGESTED_STAPLES,
} from "@/lib/pantryStaples";
import { getErrorMessage } from "@/lib/utils";

/**
 * Manage the things you always have (so recipes stop calling them missing) and
 * the ingredient→pantry links you've taught the app.
 *
 * The suggested set is offered, never applied automatically — a household that
 * genuinely tracks its olive oil shouldn't wake up to it being assumed.
 */
export default function StaplesManager() {
  const { taxonomy } = useHouseholdData();
  const { success, error: toastError } = useToast();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const staples = taxonomy.listFor(STAPLE_TYPE, INGREDIENT_KIND);
  const aliases = taxonomy.entries.filter(
    (e) => e.type === ALIAS_TYPE && e.kind === INGREDIENT_KIND && e.target,
  );
  const unseeded = SUGGESTED_STAPLES.filter(
    (s) => !staples.some((existing) => existing.toLowerCase() === s.toLowerCase()),
  );

  async function addStaple(label: string) {
    if (!label.trim() || busy) return;
    setBusy(true);
    try { await taxonomy.add(STAPLE_TYPE, INGREDIENT_KIND, label); }
    catch (e) { toastError(getErrorMessage(e)); }
    finally { setBusy(false); }
  }

  async function seedAll() {
    setBusy(true);
    try {
      for (const s of unseeded) await taxonomy.add(STAPLE_TYPE, INGREDIENT_KIND, s);
      success(`Added ${unseeded.length} common staples`);
    } catch (e) { toastError(getErrorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Staples</h2>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
          Things you assume you always have. Recipes never count these as missing
          and never add them to your shopping list.
        </p>
      </div>

      {/* Current staples */}
      <div className="flex flex-wrap gap-1.5">
        {staples.length === 0 && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No staples yet.</p>
        )}
        {staples.map((label) => (
          <span key={label} className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-full bg-gray-100 dark:bg-zinc-800">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{label}</span>
            <button
              type="button"
              aria-label={`Remove ${label}`}
              onClick={() => taxonomy.remove(STAPLE_TYPE, INGREDIENT_KIND, label)}
              className="w-5 h-5 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500 transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
      </div>

      {/* Add one */}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 40))}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addStaple(draft); setDraft(""); } }}
          placeholder="Add a staple…"
          className="flex-1 text-sm bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 text-gray-900 dark:text-gray-50"
        />
        <button
          type="button"
          onClick={() => { addStaple(draft); setDraft(""); }}
          disabled={!draft.trim() || busy}
          className="px-4 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40"
        >Add</button>
      </div>

      {/* Suggested seed */}
      {unseeded.length > 0 && (
        <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 flex flex-col gap-2.5">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Common ones you haven&apos;t added — salt, oils, everyday spices.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {unseeded.slice(0, 10).map((s) => (
              <button key={s} type="button" onClick={() => addStaple(s)} disabled={busy}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-dashed border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 active:scale-95 transition-colors disabled:opacity-40">
                + {s}
              </button>
            ))}
          </div>
          <button type="button" onClick={seedAll} disabled={busy}
            className="self-start text-xs font-medium text-gray-600 dark:text-gray-300 underline underline-offset-2 disabled:opacity-40">
            {busy ? "Adding…" : `Add all ${unseeded.length}`}
          </button>
        </div>
      )}

      {/* Learned links */}
      {aliases.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">Ingredient links</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 -mt-1">
            Recipe wording you&apos;ve matched to something in your pantry.
          </p>
          <div className="flex flex-col divide-y divide-gray-50 dark:divide-zinc-800 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3">
            {aliases.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-2.5">
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-200 truncate">
                  {a.label} <span className="text-gray-400">→</span> {a.target}
                </span>
                <button
                  type="button"
                  aria-label={`Remove link for ${a.label}`}
                  onClick={() => taxonomy.remove(ALIAS_TYPE, INGREDIENT_KIND, a.label)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-gray-300 dark:text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
