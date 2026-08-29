"use client";

import { useState, useRef } from "react";
import type { HouseholdRecipe } from "@/types/database";
import type { RecipeIngredient, RecipeStep } from "@/lib/recipeTypes";
import { recipeIngredientList, recipeStepList } from "@/lib/recipeTypes";
import type { RecipePatch } from "@/hooks/useHouseholdRecipes";
import PartOfPicker from "./PartOfPicker";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { uploadRecipeImage, deleteRecipeImage } from "@/lib/uploadRecipeImage";

const LABEL = "text-xs font-medium text-gray-400 dark:text-gray-500";
const FIELD =
  "w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors";

function numOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Full recipe editor. Explicit Save (not auto-save like the pantry sheet):
 * there are many fields here and a half-typed step shouldn't hit the DB on
 * every keystroke — nor should another member see it mid-sentence.
 */
export default function RecipeEditor({
  recipe,
  householdId,
  onSave,
  onCancel,
}: {
  recipe: HouseholdRecipe;
  householdId: string;
  onSave: (patch: RecipePatch) => Promise<void>;
  onCancel: () => void;
}) {
  const { taxonomy } = useHouseholdData();

  const [name, setName] = useState(recipe.name);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [notes, setNotes] = useState(recipe.notes ?? "");
  const [servings, setServings] = useState(recipe.servings ? String(recipe.servings) : "");
  const [servingsUnit, setServingsUnit] = useState(recipe.servings_unit ?? "");
  const [prep, setPrep] = useState(recipe.prep_minutes ? String(recipe.prep_minutes) : "");
  const [cook, setCook] = useState(recipe.cook_minutes ? String(recipe.cook_minutes) : "");
  const [tags, setTags] = useState<string[]>(recipe.tags ?? []);
  const [ings, setIngs] = useState<RecipeIngredient[]>(() => recipeIngredientList(recipe));
  const [steps, setSteps] = useState<RecipeStep[]>(() => recipeStepList(recipe));
  const [busy, setBusy] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [addingTag, setAddingTag] = useState(false);

  // Photo. `imagePath` is set only for images WE host, so replacing one can
  // clean up the old object while a remote hero URL is just forgotten.
  const [imageUrl, setImageUrl] = useState(recipe.image_url ?? null);
  const [imagePath, setImagePath] = useState(recipe.image_path ?? null);
  const [uploading, setUploading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const knownTags = taxonomy.listFor("recipe_tag", "recipe");

  async function handlePhoto(file: File) {
    setUploading(true);
    setImageError(null);
    const previousPath = imagePath;
    try {
      const up = await uploadRecipeImage(householdId, file);
      setImageUrl(up.url);
      setImagePath(up.path);
      // Only remove the old object AFTER the new one is safely stored.
      if (previousPath) await deleteRecipeImage(previousPath);
    } catch (e) {
      setImageError(e instanceof Error ? e.message : "Couldn't upload that photo");
    } finally {
      setUploading(false);
    }
  }

  function clearPhoto() {
    // Deleting the stored object waits for Save — cancelling shouldn't have
    // destroyed the photo.
    setImageUrl(null);
    setImagePath(null);
  }

  function patchIng(i: number, p: Partial<RecipeIngredient>) {
    setIngs((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function patchStep(i: number, p: Partial<RecipeStep>) {
    setSteps((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }

  async function handleSave() {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      // A photo the user removed is only deleted from storage once the save
      // that drops it actually succeeds.
      const droppedPath = recipe.image_path && recipe.image_path !== imagePath ? recipe.image_path : null;

      await onSave({
        name: name.trim(),
        description: description.trim() || null,
        notes: notes.trim() || null,
        imageUrl,
        imagePath,
        servings: numOrNull(servings),
        servingsUnit: servingsUnit.trim() || null,
        prepMinutes: numOrNull(prep),
        cookMinutes: numOrNull(cook),
        tags,
        // `raw` is what the importer preserved for verification; keep it in
        // sync with hand-edits so it never contradicts the visible name.
        ingredients: ings
          .filter((i) => i.name.trim())
          .map((i) => ({ ...i, name: i.name.trim(), raw: i.raw?.trim() || i.name.trim() })),
        steps: steps.filter((s) => s.text.trim()).map((s) => ({ ...s, text: s.text.trim() })),
      });
      if (droppedPath) await deleteRecipeImage(droppedPath);
    } finally {
      setBusy(false);
    }
  }

  async function commitNewTag() {
    const label = newTag.trim();
    setNewTag("");
    setAddingTag(false);
    if (!label) return;
    const saved = await taxonomy.add("recipe_tag", "recipe", label);
    const final = saved ?? label;
    setTags((prev) => (prev.includes(final) ? prev : [...prev, final]));
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Basics */}
      {/* Photo */}
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Photo</span>
        <input
          ref={photoRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handlePhoto(f);
            e.target.value = ""; // allow re-picking the same file
          }}
        />
        {imageUrl ? (
          <div className="relative rounded-2xl overflow-hidden border border-gray-100 dark:border-zinc-800">
            {/* Plain <img>: hero URLs can be arbitrary remote hosts and
                next.config has no remotePatterns — see RecipeCard. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" referrerPolicy="no-referrer" className="w-full h-40 object-cover" />
            <div className="absolute bottom-2 right-2 flex gap-2">
              <button
                type="button"
                onClick={() => photoRef.current?.click()}
                disabled={uploading}
                className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-[11px] font-medium backdrop-blur active:scale-95 transition-transform"
              >
                {uploading ? "Uploading…" : "Replace"}
              </button>
              <button
                type="button"
                onClick={clearPhoto}
                className="px-2.5 py-1.5 rounded-lg bg-black/60 text-white text-[11px] font-medium backdrop-blur active:scale-95 transition-transform"
              >
                Remove
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => photoRef.current?.click()}
            disabled={uploading}
            className="w-full py-5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors flex flex-col items-center gap-1.5"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l3-3h12l3 3M3 9v9a2 2 0 002 2h14a2 2 0 002-2V9M9 13a3 3 0 116 0 3 3 0 01-6 0z" />
            </svg>
            <span className="text-sm font-medium">{uploading ? "Uploading…" : "Add a photo"}</span>
          </button>
        )}
        {imageError && (
          <p className="text-[11px] text-red-500">{imageError}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="r-name">Name</label>
        <input id="r-name" className={FIELD} value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      <div className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="r-desc">Description</label>
        <textarea
          id="r-desc" rows={2} className={`${FIELD} resize-none`}
          placeholder="A short line about this dish…"
          value={description} onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Servings + times */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <label className={LABEL} htmlFor="r-serv">Serves</label>
          <input id="r-serv" className={FIELD} inputMode="numeric" placeholder="4"
            value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={LABEL} htmlFor="r-servu">Unit</label>
          <input id="r-servu" className={FIELD} placeholder="servings"
            value={servingsUnit} onChange={(e) => setServingsUnit(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={LABEL} htmlFor="r-prep">Prep (min)</label>
          <input id="r-prep" className={FIELD} inputMode="numeric" placeholder="15"
            value={prep} onChange={(e) => setPrep(e.target.value)} />
        </div>
        <div className="flex flex-col gap-2">
          <label className={LABEL} htmlFor="r-cook">Cook (min)</label>
          <input id="r-cook" className={FIELD} inputMode="numeric" placeholder="30"
            value={cook} onChange={(e) => setCook(e.target.value)} />
        </div>
      </div>

      {/* Tags */}
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Tags</span>
        <div className="flex flex-wrap gap-1.5 items-center">
          {knownTags.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t} type="button"
                onClick={() => setTags((p) => (on ? p.filter((x) => x !== t) : [...p, t]))}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                  on
                    ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >{t}</button>
            );
          })}
          {addingTag ? (
            <input
              autoFocus value={newTag}
              onChange={(e) => setNewTag(e.target.value.slice(0, 24))}
              onBlur={commitNewTag}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitNewTag(); }
                if (e.key === "Escape") { setNewTag(""); setAddingTag(false); }
              }}
              placeholder="New tag…"
              className="w-28 px-2.5 py-1 rounded-full text-xs bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-500"
            />
          ) : (
            <button
              type="button" onClick={() => setAddingTag(true)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 active:scale-[0.94] transition-colors"
            >+ New</button>
          )}
        </div>
      </div>

      {/* Ingredients */}
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Ingredients</span>
        <div className="flex flex-col gap-2">
          {ings.map((ing, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  className={`${FIELD} flex-1`} placeholder="Ingredient"
                  value={ing.name} onChange={(e) => patchIng(i, { name: e.target.value })}
                />
                <button
                  type="button" aria-label="Remove ingredient"
                  onClick={() => setIngs((p) => p.filter((_, idx) => idx !== i))}
                  className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-gray-300 dark:text-zinc-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={FIELD} inputMode="decimal" placeholder="Qty"
                  value={ing.quantity ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = parseFloat(v);
                    patchIng(i, { quantity: v === "" || !Number.isFinite(n) ? undefined : n });
                  }}
                />
                <input
                  className={FIELD} placeholder="Unit"
                  value={ing.unit ?? ""} onChange={(e) => patchIng(i, { unit: e.target.value || undefined })}
                />
              </div>
              <PartOfPicker
                value={ing.group}
                onChange={(next) => patchIng(i, { group: next })}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setIngs((p) => [...p, { name: "", raw: "" }])}
            className="self-start px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-95"
          >+ Ingredient</button>
        </div>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2">
        <span className={LABEL}>Steps</span>
        <div className="flex flex-col gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col gap-1.5 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5">
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 mt-1 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 text-xs font-semibold flex items-center justify-center tabular-nums">
                  {i + 1}
                </span>
                <textarea
                  rows={2} className={`${FIELD} flex-1 resize-none`} placeholder="What to do…"
                  value={s.text} onChange={(e) => patchStep(i, { text: e.target.value })}
                />
                <button
                  type="button" aria-label="Remove step"
                  onClick={() => setSteps((p) => p.filter((_, idx) => idx !== i))}
                  className="flex-shrink-0 w-8 h-8 mt-1 flex items-center justify-center rounded-lg text-gray-300 dark:text-zinc-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <PartOfPicker
                value={s.group}
                onChange={(next) => patchStep(i, { group: next })}
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSteps((p) => [...p, { text: "" }])}
            className="self-start px-3 py-1.5 rounded-xl text-xs font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-95"
          >+ Step</button>
        </div>
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-2">
        <label className={LABEL} htmlFor="r-notes">Notes</label>
        <textarea
          id="r-notes" rows={3} className={`${FIELD} resize-none`}
          placeholder="Use less salt next time…"
          value={notes} onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 sticky bottom-0 bg-gray-50 dark:bg-zinc-950 py-3 -mx-1 px-1">
        <button
          type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-2xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors"
        >Cancel</button>
        <button
          type="button" onClick={handleSave} disabled={busy || !name.trim()}
          className="flex-1 py-2.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
        >{busy ? "Saving…" : "Save recipe"}</button>
      </div>
    </div>
  );
}
