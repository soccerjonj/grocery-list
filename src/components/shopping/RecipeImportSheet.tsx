"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { ExtractedIngredient } from "@/lib/recipeExtract";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import { useHouseholdContext } from "@/context/HouseholdContext";
import { recipeIngredients } from "@/hooks/useHouseholdRecipes";
import { getShoppingDuplicates, increaseShoppingQty } from "@/lib/checkShoppingDuplicate";
import { normalizeItemName } from "@/lib/normalizeItemName";
import { getPantryHint } from "@/lib/pantryHints";
import { safeHttpUrl } from "@/lib/utils";
import type { HouseholdRecipe } from "@/types/database";

/**
 * "Add ingredients from a recipe" sheet (T3-B + saved recipes).
 *
 * Two top-level tabs:
 *   • "New" — import via URL or photo, optionally save the result.
 *   • "Saved" — pick from the household's recipe library; tap to load
 *     the ingredients into the review UI and add to the list.
 *
 * Once ingredients are extracted (either from a fresh import OR from
 * a saved recipe), the sheet shows them as editable cards. The user
 * can rename / remove individual lines and bulk-add via `onAdd`.
 *
 * After a fresh import, a "Save for next time" affordance offers to
 * persist the recipe so the user can re-add the same ingredients on
 * future shopping trips without re-extracting.
 */

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * Called once per ingredient when the user confirms. Should match the
   * existing `useShoppingFlow.addItem` shape — name + optional qty/unit.
   */
  onAdd: (name: string, quantity?: number, unit?: string) => Promise<void> | void;
}

type Mode = "url" | "photo";
type Tab = "new" | "saved";

interface Draft extends ExtractedIngredient {
  /** Stable id for the React key + editing state. */
  key: string;
  /** User can flag a draft to be skipped; we still render it greyed out. */
  skipped?: boolean;
}

const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/webp"];

function asDrafts(items: ExtractedIngredient[]): Draft[] {
  return items.map((i, idx) => ({ ...i, key: `i-${idx}-${i.raw}` }));
}

export default function RecipeImportSheet({ open, onClose, onAdd }: Props) {
  const { recipes: { recipes, saveRecipe, updateRecipe, deleteRecipe } } = useHouseholdData();
  const { householdId } = useHouseholdContext();

  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("new");
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track import metadata so "Save for next time" can preserve the source.
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [sourceKind, setSourceKind] = useState<"url" | "photo" | "manual">("manual");
  // Save flow state — shown after a successful import.
  const [saveName, setSaveName] = useState("");
  const [savedJustNow, setSavedJustNow] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  // Edit mode for an already-saved recipe (Commit 8).
  // `editingRecipeId` is the id of the saved recipe being edited; null
  // means we're either viewing a fresh import or browsing the library.
  // `editing` is the toggle for the actual edit affordances (rename
  // input, +/- ingredient controls, save button).
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset state when the sheet closes so a fresh open feels clean.
  // If the household has saved recipes, default to the Saved tab — that's
  // usually the more frequent action for a returning user. New users with
  // 0 recipes land on New.
  useEffect(() => {
    if (!open) {
      setUrl(""); setPhotoFile(null); setTitle(null);
      setDrafts(null); setError(null); setBusy(false); setAdding(false);
      setMode("url");
      setSourceUrl(null); setSourceKind("manual");
      setSaveName(""); setSavedJustNow(false); setSaveBusy(false);
      setEditingRecipeId(null); setEditing(false); setEditName(""); setEditBusy(false);
    } else {
      // Default tab depends on whether the household has recipes.
      setTab(recipes.length > 0 ? "saved" : "new");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function extractFromUrl() {
    if (!url.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "url", url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Couldn't extract recipe");
        return;
      }
      setDrafts(asDrafts(data.items ?? []));
      const t = typeof data.title === "string" ? data.title : null;
      setTitle(t);
      setSourceUrl(url.trim());
      setSourceKind("url");
      // Pre-fill the save name with the recipe title for convenience.
      setSaveName(t ?? "");
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  async function extractFromPhoto() {
    if (!photoFile) return;
    if (photoFile.size > 8 * 1024 * 1024) {
      setError("Photo is too large (max ~8 MB). Try a smaller image.");
      return;
    }
    setBusy(true); setError(null);
    try {
      const base64 = await fileToBase64(photoFile);
      const res = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "image",
          imageBase64: base64,
          mediaType: photoFile.type || "image/jpeg",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Couldn't extract recipe");
        return;
      }
      setDrafts(asDrafts(data.items ?? []));
      setTitle(null);
      setSourceUrl(null);
      setSourceKind("photo");
      setSaveName("");
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  /** Load a saved recipe into the draft review UI. */
  function loadSaved(recipe: HouseholdRecipe) {
    setDrafts(asDrafts(recipeIngredients(recipe)));
    setTitle(recipe.name);
    setSourceUrl(recipe.source_url);
    setSourceKind(
      recipe.source_kind === "url" || recipe.source_kind === "photo" || recipe.source_kind === "manual"
        ? recipe.source_kind
        : "manual",
    );
    // No save flow for already-saved recipes — `savedJustNow` flag suppresses it.
    setSavedJustNow(true);
    setSaveName(recipe.name);
    // Track that this is an editable saved recipe.
    setEditingRecipeId(recipe.id);
    setEditing(false);
    setEditName(recipe.name);
  }

  /** Append a blank ingredient row (edit mode only). */
  function addBlankIngredient() {
    setDrafts((prev) => {
      const next = prev ? [...prev] : [];
      const newKey = `new-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      next.push({ key: newKey, name: "", raw: "" });
      return next;
    });
  }

  /** Delete an ingredient row from the working set (edit mode only). */
  function removeIngredient(key: string) {
    setDrafts((prev) => (prev ? prev.filter((d) => d.key !== key) : prev));
  }

  /** Persist edits back to the saved recipe. */
  async function handleSaveEdits() {
    if (!editingRecipeId || !drafts) return;
    const cleanName = editName.trim();
    if (!cleanName) return;
    const ingredients = drafts
      .filter((d) => d.name.trim())
      .map<ExtractedIngredient>(({ key: _key, skipped: _skipped, ...rest }) => ({ ...rest, name: rest.name.trim() }));
    setEditBusy(true);
    try {
      const ok = await updateRecipe(editingRecipeId, { name: cleanName, ingredients });
      if (ok) {
        setEditing(false);
        setTitle(cleanName);
        setSaveName(cleanName);
      }
    } finally {
      setEditBusy(false);
    }
  }

  /** Discard local edits, reload from the current saved-recipe state. */
  function cancelEdits() {
    if (!editingRecipeId) return;
    const fresh = recipes.find((r) => r.id === editingRecipeId);
    if (fresh) {
      setDrafts(asDrafts(recipeIngredients(fresh)));
      setEditName(fresh.name);
      setTitle(fresh.name);
    }
    setEditing(false);
  }

  async function handleSaveForLater() {
    const name = saveName.trim();
    if (!name || !drafts) return;
    const keepers = drafts
      .filter((d) => !d.skipped && d.name.trim())
      .map<ExtractedIngredient>(({ key: _key, skipped: _skipped, ...rest }) => rest);
    if (keepers.length === 0) return;
    setSaveBusy(true);
    try {
      const id = await saveRecipe({
        name,
        ingredients: keepers,
        sourceUrl,
        sourceKind,
      });
      if (id) setSavedJustNow(true);
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleAddAll() {
    if (!drafts) return;
    const keepers = drafts.filter((d) => !d.skipped && d.name.trim());
    if (keepers.length === 0) return;
    setAdding(true);
    try {
      // Bump the quantity of ingredients already on the list instead of
      // adding a second "2 cups flour" line.
      const dupes = await getShoppingDuplicates(
        householdId,
        keepers.map((d) => d.name.trim()),
      );
      for (const d of keepers) {
        const existing = dupes.get(normalizeItemName(d.name));
        if (existing) {
          await increaseShoppingQty(existing.id, existing.quantity, d.quantity ?? 1);
        } else {
          await onAdd(d.name.trim(), d.quantity, d.unit);
        }
      }
    } finally {
      setAdding(false);
      onClose();
    }
  }

  // Saved-recipes list, freshest first. (Hook already returns sorted by updated_at desc.)
  const savedList = recipes;
  const headerTitle = useMemo(() => {
    if (drafts) return title ?? "Recipe ingredients";
    return tab === "saved" ? "Saved recipes" : "Add from a recipe";
  }, [drafts, title, tab]);
  const headerSubtitle = useMemo(() => {
    if (drafts) {
      const kept = drafts.filter((d) => !d.skipped).length;
      return `${kept} of ${drafts.length} will be added — edit or skip any line`;
    }
    return tab === "saved"
      ? "Your household's recipe library"
      : "Paste a recipe link, or upload a photo of one";
  }, [drafts, tab]);

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "92dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3.5 pb-1 flex-shrink-0">
              <div className="w-10 h-[5px] bg-gray-200 dark:bg-zinc-700 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex-1 min-w-0">
                {editing ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Recipe name"
                    className="w-full text-base font-semibold text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 outline-none focus:border-gray-400 dark:focus:border-zinc-500"
                  />
                ) : (
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">{headerTitle}</h2>
                )}
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{editing ? "Editing saved recipe" : headerSubtitle}</p>
              </div>
              {/* Pencil button — only shown when viewing a loaded saved
                  recipe and not yet in edit mode. */}
              {editingRecipeId && !editing && drafts && (
                <button
                  type="button"
                  onClick={() => { setEditing(true); setEditName(title ?? ""); }}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
                  aria-label="Edit recipe"
                  title="Edit recipe"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ overscrollBehavior: "contain" }}>
              {!drafts && (
                <>
                  {/* Top-level New / Saved tabs — compact pill group */}
                  <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-100 dark:bg-zinc-800 self-start">
                    {(["new", "saved"] as const).map((t) => {
                      const label = t === "new" ? "New" : "Saved";
                      const count = t === "saved" ? savedList.length : null;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => { setTab(t); setError(null); }}
                          className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors active:scale-[0.97] ${
                            tab === t
                              ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                              : "text-gray-500 dark:text-gray-400"
                          }`}
                        >
                          {label}
                          {count !== null && count > 0 && (
                            <span className={`ml-1 text-xs tabular-nums ${tab === t ? "text-gray-400 dark:text-gray-500" : "text-gray-300 dark:text-zinc-600"}`}>
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {tab === "new" && (
                    <>
                      {/* Mode (URL / Photo) — compact pill group */}
                      <div className="inline-flex items-center gap-0.5 p-0.5 rounded-xl bg-gray-100 dark:bg-zinc-800 self-start">
                        {(["url", "photo"] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => { setMode(m); setError(null); }}
                            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors active:scale-[0.97] ${
                              mode === m
                                ? "bg-white dark:bg-zinc-900 text-gray-900 dark:text-gray-50 shadow-sm"
                                : "text-gray-500 dark:text-gray-400"
                            }`}
                          >
                            {m === "url" ? "URL" : "Photo"}
                          </button>
                        ))}
                      </div>

                      {mode === "url" && (
                        <div className="flex flex-col gap-3 pt-1">
                          <input
                            type="url"
                            placeholder="https://cooking.nytimes.com/recipes/…"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            autoFocus
                            inputMode="url"
                            autoCapitalize="off"
                            autoCorrect="off"
                            className="w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500"
                          />
                          <button
                            type="button"
                            onClick={extractFromUrl}
                            disabled={!url.trim() || busy}
                            className="w-full py-2.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
                          >
                            {busy ? "Reading recipe…" : "Extract ingredients"}
                          </button>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 leading-snug">
                            Works on most recipe sites. We try the page&apos;s structured data first, then fall back to AI when needed.
                          </p>
                        </div>
                      )}

                      {mode === "photo" && (
                        <div className="flex flex-col gap-3 pt-1">
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPTED_MEDIA.join(",")}
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0] ?? null;
                              setPhotoFile(f);
                              setError(null);
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors flex flex-col items-center gap-2"
                          >
                            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l3-3h12l3 3M3 9v9a2 2 0 002 2h14a2 2 0 002-2V9M9 13a3 3 0 116 0 3 3 0 01-6 0z" />
                            </svg>
                            <p className="text-sm font-medium">
                              {photoFile ? photoFile.name : "Take or upload a photo"}
                            </p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">Cookbook page, recipe card, magazine clipping</p>
                          </button>
                          <button
                            type="button"
                            onClick={extractFromPhoto}
                            disabled={!photoFile || busy}
                            className="w-full py-2.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
                          >
                            {busy ? "Reading recipe…" : "Extract ingredients"}
                          </button>
                        </div>
                      )}

                      {error && (
                        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                          {error}
                        </div>
                      )}
                    </>
                  )}

                  {tab === "saved" && (
                    <>
                      {savedList.length === 0 ? (
                        <div className="text-center py-10 text-gray-400 dark:text-gray-500 flex flex-col gap-2">
                          <p className="text-sm">No saved recipes yet</p>
                          <p className="text-[11px]">Import a recipe in the <span className="font-medium">New</span> tab, then tap &ldquo;Save for next time.&rdquo;</p>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {savedList.map((r) => {
                            const ingredients = recipeIngredients(r);
                            return (
                              <div
                                key={r.id}
                                className="bg-gray-50 dark:bg-zinc-800/40 border border-gray-100 dark:border-zinc-800 rounded-2xl"
                              >
                                <button
                                  type="button"
                                  onClick={() => loadSaved(r)}
                                  className="w-full text-left px-3.5 py-3 flex items-center gap-3 active:scale-[0.99] transition-transform"
                                >
                                  {/* Recipe icon based on source */}
                                  <span className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-zinc-800 flex items-center justify-center flex-shrink-0">
                                    {r.source_kind === "url" ? (
                                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5M10.172 13.828a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
                                      </svg>
                                    ) : r.source_kind === "photo" ? (
                                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l3-3h12l3 3M3 9v9a2 2 0 002 2h14a2 2 0 002-2V9M9 13a3 3 0 116 0 3 3 0 01-6 0z" />
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3-2 2 2 2-2 2 2 2-2 3 2zM9 7h6M9 11h6M9 15h4" />
                                      </svg>
                                    )}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{r.name}</p>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                                      {ingredients.length} ingredient{ingredients.length === 1 ? "" : "s"}
                                    </p>
                                  </div>
                                  <svg className="w-4 h-4 text-gray-300 dark:text-zinc-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                                {/* Tiny secondary actions row */}
                                <div className="flex items-center gap-3 px-3.5 pb-2.5 -mt-1">
                                  {safeHttpUrl(r.source_url) && (
                                    <a
                                      href={safeHttpUrl(r.source_url)!}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      onClick={(e) => e.stopPropagation()}
                                      className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline underline-offset-2"
                                    >
                                      View source
                                    </a>
                                  )}
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (window.confirm(`Delete "${r.name}"?`)) {
                                        await deleteRecipe(r.id);
                                      }
                                    }}
                                    className="ml-auto text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {drafts && drafts.length === 0 && (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <p className="text-sm">No ingredients found</p>
                  <button
                    type="button"
                    onClick={() => { setDrafts(null); setError(null); }}
                    className="text-xs underline mt-2"
                  >Try a different source</button>
                </div>
              )}

              {drafts && drafts.length > 0 && (
                <AnimatePresence mode="popLayout">
                  {drafts.map((d) => (
                    <motion.div
                      key={d.key}
                      layout
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: d.skipped ? 0.42 : 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.16 }}
                      className="bg-gray-50 dark:bg-zinc-800/40 border border-gray-100 dark:border-zinc-800 rounded-2xl px-3.5 py-3 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={d.name}
                          onChange={(e) =>
                            setDrafts((prev) =>
                              prev!.map((x) => (x.key === d.key ? { ...x, name: e.target.value } : x)),
                            )
                          }
                          className={`flex-1 text-sm font-medium bg-transparent outline-none ${d.skipped ? "line-through text-gray-400" : "text-gray-900 dark:text-gray-100"}`}
                          placeholder="Ingredient name"
                        />
                        {editing ? (
                          /* In edit mode, the action is a real delete from
                             the recipe — not a per-trip skip. */
                          <button
                            type="button"
                            onClick={() => removeIngredient(d.key)}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 dark:text-zinc-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors active:scale-90"
                            aria-label="Remove from recipe"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setDrafts((prev) =>
                                prev!.map((x) => (x.key === d.key ? { ...x, skipped: !x.skipped } : x)),
                              )
                            }
                            className={`flex-shrink-0 px-2 h-7 flex items-center gap-1 rounded-lg text-[11px] font-medium transition-colors active:scale-95 ${
                              d.skipped
                                ? "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
                                : "text-gray-400 dark:text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                            }`}
                            aria-label={d.skipped ? "Include this item" : "Skip this item"}
                          >
                            {d.skipped ? "Restore" : "Skip"}
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Editable qty + unit (compact, to keep long lists
                            scannable) + a "where it lands" kind tag. */}
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="any"
                          value={d.quantity ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) =>
                              prev!.map((x) => (x.key === d.key
                                ? { ...x, quantity: e.target.value ? parseFloat(e.target.value) : undefined }
                                : x)),
                            )
                          }
                          placeholder="qty"
                          className="w-12 text-xs text-center tabular-nums text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-1.5 py-1 outline-none focus:border-gray-400 dark:focus:border-zinc-500"
                        />
                        <input
                          type="text"
                          value={d.unit ?? ""}
                          onChange={(e) =>
                            setDrafts((prev) =>
                              prev!.map((x) => (x.key === d.key ? { ...x, unit: e.target.value || undefined } : x)),
                            )
                          }
                          placeholder="unit"
                          className="w-16 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg px-2 py-1 outline-none focus:border-gray-400 dark:focus:border-zinc-500"
                        />
                        {(() => {
                          const hint = getPantryHint(d.name);
                          if (!hint) return null;
                          return (
                            <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400">
                              {hint.kind === "supplies" ? "Supplies" : "Food"}
                            </span>
                          );
                        })()}
                        <span className="truncate flex-1 text-[11px] italic text-gray-400 dark:text-gray-500 opacity-70">{d.raw}</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}

              {/* + Add ingredient — only visible while editing a saved recipe. */}
              {editing && drafts && (
                <button
                  type="button"
                  onClick={addBlankIngredient}
                  className="w-full py-2.5 rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors text-sm font-medium active:scale-[0.98]"
                >
                  + Add ingredient
                </button>
              )}

              {/* "Save for next time" — shown after a fresh extract, hidden
                  for already-saved recipes loaded from the library. */}
              {drafts && drafts.length > 0 && !savedJustNow && (
                <div className="bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-2xl px-3.5 py-3 flex flex-col gap-2 mt-1">
                  <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                    Save for next time?
                  </p>
                  <p className="text-[11px] text-blue-600/80 dark:text-blue-300/80">
                    Saved recipes can be re-added to the shopping list anytime.
                  </p>
                  <div className="flex gap-2 mt-1">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder="Recipe name"
                      className="flex-1 text-sm text-gray-900 dark:text-gray-50 bg-white dark:bg-zinc-900 border border-blue-200 dark:border-blue-900/50 rounded-xl px-3 py-2 outline-none focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={handleSaveForLater}
                      disabled={!saveName.trim() || saveBusy}
                      className="px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-50 active:scale-[0.96] transition-transform"
                    >
                      {saveBusy ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
              {drafts && savedJustNow && (
                <div className="text-center text-[11px] text-green-600 dark:text-green-400 flex items-center justify-center gap-1.5 py-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Saved to your recipe library
                </div>
              )}
            </div>

            {/* Footer */}
            {drafts && drafts.length > 0 && (() => {
              const keeperCount = drafts.filter((d) => !d.skipped && d.name.trim()).length;
              const editableCount = drafts.filter((d) => d.name.trim()).length;
              if (editing) {
                return (
                  <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-zinc-800 flex gap-2">
                    <button
                      type="button"
                      onClick={cancelEdits}
                      disabled={editBusy}
                      className="flex-1 py-3.5 rounded-2xl bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveEdits}
                      disabled={editBusy || !editName.trim() || editableCount === 0}
                      className="flex-1 py-3.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
                    >
                      {editBusy ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                );
              }
              return (
                <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={handleAddAll}
                    disabled={adding || keeperCount === 0}
                    className="w-full py-3.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
                  >
                    {adding
                      ? "Adding…"
                      : keeperCount === 0
                      ? "Nothing to add"
                      : `Add ${keeperCount} item${keeperCount !== 1 ? "s" : ""} to list`}
                  </button>
                </div>
              );
            })()}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read file"));
        return;
      }
      // Strip the "data:image/jpeg;base64," prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
