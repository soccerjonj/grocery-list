"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";
import RecipeAddToListSheet from "@/components/recipes/RecipeAddToListSheet";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useToast } from "@/context/ToastContext";
import {
  useRecipeExtract, ACCEPTED_MEDIA, MAX_PHOTO_BYTES,
} from "@/hooks/useRecipeExtract";
import { syntheticRecipe } from "@/lib/syntheticRecipe";
import type { HouseholdRecipe } from "@/types/database";

/**
 * Import a recipe straight onto the shopping list, from the shopping tab.
 *
 * Restores the one-off flow the old shopping importer had: paste a link for
 * something you'll cook once and get the ingredients, without first saving a
 * recipe you don't want in your library. The library route (Recipes → New
 * recipe) is still the place to keep one, and this offers that as a second
 * button rather than deciding for you.
 *
 * Extraction is the same hook the Recipes tab uses, and the hand-off is the
 * same RecipeAddToListSheet the picker uses — so servings scaling, the
 * missing-only default and duplicate merging behave identically whichever way
 * you got here.
 */

type Mode = "url" | "paste" | "photo";

const MODES: { id: Mode; label: string }[] = [
  { id: "url", label: "Link" },
  { id: "paste", label: "Paste" },
  { id: "photo", label: "Photo" },
];

export default function ImportToListSheet({
  open,
  onClose,
  householdId,
}: {
  open: boolean;
  onClose: () => void;
  householdId: string;
}) {
  const { recipes } = useHouseholdData();
  const { success, error: toastError } = useToast();

  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  /** Set once the user has chosen; this is what goes to the add-to-list sheet. */
  const [handoff, setHandoff] = useState<HouseholdRecipe | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    busy: extracting, error, result, setError, reset,
    extractUrl, extractPaste, extractPhoto,
  } = useRecipeExtract();
  const busy = extracting || saving;

  useEffect(() => {
    if (!open) {
      setMode("url"); setUrl(""); setPaste(""); setPhoto(null);
      setSaving(false); setHandoff(null); reset();
    }
  }, [open, reset]);

  /** List only — nothing is written to household_recipes. */
  function addToListOnly() {
    if (!result) return;
    setHandoff(syntheticRecipe(result, householdId));
  }

  /** Keep it as a recipe as well, then continue to the same add sheet. */
  async function saveThenAdd() {
    if (!result || busy) return;
    setSaving(true);
    try {
      const id = await recipes.saveRecipe(result);
      if (!id) throw new Error("Couldn't save the recipe");
      success(`Saved “${result.name}”`);
      // Hand off the in-memory object rather than hunting the saved row out of
      // state: the add sheet never reads `id`, so this avoids racing the
      // insert, and the ingredients are identical either way.
      setHandoff(syntheticRecipe(result, householdId));
    } catch (e) {
      toastError(e instanceof Error ? e.message : "Couldn't save the recipe");
    } finally {
      setSaving(false);
    }
  }

  const canExtract =
    (mode === "url" && /^https?:\/\/\S+/i.test(url.trim())) ||
    (mode === "paste" && paste.trim().length >= 20) ||
    (mode === "photo" && !!photo);

  const inputCls =
    "w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors";
  const primaryBtn =
    "w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all";

  // Once handed off, this sheet steps aside so only one is on screen.
  return (
    <>
      <ItemSheet
        open={open && !handoff}
        onClose={onClose}
        header={
          <ItemSheetHeader
            title={result ? "Add these to your list" : "Import a recipe"}
            onClose={onClose}
          />
        }
      >
        <AnimatePresence mode="wait" initial={false}>
          {result ? (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-3"
            >
              <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 flex flex-col gap-1">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{result.name}</p>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Found <span className="font-semibold">{result.ingredients.length}</span>{" "}
                  ingredient{result.ingredients.length === 1 ? "" : "s"}
                  {result.steps && result.steps.length > 0 && (
                    <> and <span className="font-semibold">{result.steps.length}</span> step{result.steps.length === 1 ? "" : "s"}</>
                  )}.
                </p>
              </div>

              <button
                type="button"
                onClick={addToListOnly}
                disabled={busy || result.ingredients.length === 0}
                className={primaryBtn}
              >
                Add to list
              </button>
              <button
                type="button"
                onClick={saveThenAdd}
                disabled={busy}
                className="w-full py-3 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-transform flex flex-col items-center gap-0.5"
              >
                <span>{saving ? "Saving…" : "Save as a recipe too"}</span>
                <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">
                  Keeps it in your Recipes tab with the steps
                </span>
              </button>
              {result.ingredients.length === 0 && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                  No ingredients found, so there&apos;s nothing to add. Try another source.
                </p>
              )}
              <button
                type="button"
                onClick={() => { reset(); }}
                className="text-xs text-gray-400 dark:text-gray-500 py-1 self-center"
              >
                Try a different source
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="pick"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex flex-col gap-4"
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-snug">
                Ingredients go straight on your list. You can keep it as a recipe
                afterwards if you want to.
              </p>

              <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-100 dark:bg-zinc-800 self-start">
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { setMode(m.id); setError(null); }}
                    className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors active:scale-[0.97] ${
                      mode === m.id
                        ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {mode === "url" && (
                <input
                  type="url" inputMode="url" value={url} autoFocus
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                  autoCapitalize="off" autoCorrect="off" spellCheck={false}
                  className={inputCls}
                />
              )}

              {mode === "paste" && (
                <textarea
                  value={paste} autoFocus rows={6}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Paste the ingredients (and the method, if you have it)…"
                  className={`${inputCls} resize-none`}
                />
              )}

              {mode === "photo" && (
                <div className="flex flex-col gap-2">
                  <input
                    ref={fileRef} type="file" accept={ACCEPTED_MEDIA.join(",")}
                    onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setError(null); }}
                    className="hidden"
                  />
                  <button
                    type="button" onClick={() => fileRef.current?.click()}
                    className="w-full py-3 rounded-2xl border border-dashed border-gray-300 dark:border-zinc-600 text-sm font-medium text-gray-600 dark:text-gray-300 active:scale-[0.98] transition-transform"
                  >
                    {photo ? photo.name : "Choose a photo"}
                  </button>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">
                    A cookbook page or a handwritten card. Max ~5 MB.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-xs text-red-500" role="alert">{error}</p>
              )}

              <button
                type="button"
                disabled={!canExtract || busy}
                onClick={() => {
                  if (mode === "url") return extractUrl(url);
                  if (mode === "paste") return extractPaste(paste);
                  if (photo) return extractPhoto(photo);
                }}
                className={primaryBtn}
              >
                {extracting ? "Reading…" : "Read recipe"}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </ItemSheet>

      {handoff && (
        <RecipeAddToListSheet
          open
          recipe={handoff}
          householdId={householdId}
          onClose={() => { setHandoff(null); onClose(); }}
        />
      )}
    </>
  );
}
