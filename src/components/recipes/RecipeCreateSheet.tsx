"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";
import type { RecipeInput } from "@/hooks/useHouseholdRecipes";
import type { RecipeIngredient, RecipeStep } from "@/lib/recipeTypes";

/**
 * "New recipe" — four ways in: blank, a link, a photo, or pasted text.
 *
 * Import stops at a short confirmation (title + what we found) and hands off
 * to the recipe page for editing, rather than rebuilding a full review editor
 * here. One place to edit a recipe, not two.
 */

type Mode = "blank" | "url" | "photo" | "paste";

const MODES: { id: Mode; label: string }[] = [
  { id: "blank", label: "Blank" },
  { id: "url", label: "Link" },
  { id: "photo", label: "Photo" },
  { id: "paste", label: "Paste" },
];

const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

interface ExtractResponse {
  items?: RecipeIngredient[];
  steps?: RecipeStep[];
  title?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  imageUrl?: string;
  description?: string;
  error?: string;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.slice(s.indexOf(",") + 1)); // strip the data: prefix
    };
    reader.onerror = () => reject(new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

export default function RecipeCreateSheet({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: RecipeInput) => Promise<void> | void;
}) {
  const [mode, setMode] = useState<Mode>("blank");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipeInput | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setMode("blank"); setName(""); setUrl(""); setPaste("");
      setPhoto(null); setBusy(false); setError(null); setResult(null);
    }
  }, [open]);

  async function callExtract(body: Record<string, unknown>, sourceKind: RecipeInput["sourceKind"], sourceUrl?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as ExtractResponse;
      if (!res.ok) throw new Error(data.error || "Couldn't read that recipe");

      setResult({
        name: data.title?.trim() || "Untitled recipe",
        ingredients: data.items ?? [],
        steps: data.steps ?? [],
        servings: data.servings ?? null,
        prepMinutes: data.prepMinutes ?? null,
        cookMinutes: data.cookMinutes ?? null,
        // Remote hero image is stored as a URL, not re-hosted — no bandwidth
        // cost and no copy of someone else's photo in our bucket.
        imageUrl: data.imageUrl ?? null,
        description: data.description ?? null,
        sourceUrl: sourceUrl ?? null,
        sourceKind,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that recipe");
    } finally {
      setBusy(false);
    }
  }

  async function handlePhoto() {
    if (!photo) return;
    if (photo.size > MAX_PHOTO_BYTES) {
      setError("That photo is too large (max ~8 MB).");
      return;
    }
    const imageBase64 = await fileToBase64(photo);
    await callExtract({ type: "image", imageBase64, mediaType: photo.type || "image/jpeg" }, "photo");
  }

  async function save(input: RecipeInput) {
    if (busy) return;
    setBusy(true);
    try {
      await onCreate(input);
    } finally {
      setBusy(false);
    }
  }

  const canExtract =
    (mode === "url" && /^https?:\/\/\S+/i.test(url.trim())) ||
    (mode === "photo" && !!photo) ||
    (mode === "paste" && paste.trim().length >= 20);

  const inputCls =
    "w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors";

  return (
    <ItemSheet
      open={open}
      onClose={onClose}
      header={<ItemSheetHeader title={result ? "Check this over" : "New recipe"} onClose={onClose} />}
    >
      <AnimatePresence mode="wait" initial={false}>
        {result ? (
          /* ── Confirmation ─────────────────────────────────────── */
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            <label htmlFor="found-name" className="text-xs font-medium text-gray-400 dark:text-gray-500">
              Recipe name
            </label>
            <input
              id="found-name"
              value={result.name}
              onChange={(e) => setResult({ ...result, name: e.target.value })}
              className={inputCls}
            />

            <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 flex flex-col gap-1.5">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Found <span className="font-semibold">{result.ingredients.length}</span>{" "}
                ingredient{result.ingredients.length === 1 ? "" : "s"}
                {result.steps && result.steps.length > 0 && (
                  <> and <span className="font-semibold">{result.steps.length}</span> step{result.steps.length === 1 ? "" : "s"}</>
                )}.
              </p>
              {(!result.steps || result.steps.length === 0) && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  No instructions found — you can add them after saving.
                </p>
              )}
              {(result.servings || result.prepMinutes || result.cookMinutes) && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  {[
                    result.servings ? `${result.servings} servings` : null,
                    result.prepMinutes ? `${result.prepMinutes} min prep` : null,
                    result.cookMinutes ? `${result.cookMinutes} min cook` : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => save(result)}
              disabled={busy || !result.name.trim()}
              className="w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
            >
              {busy ? "Saving…" : "Save recipe"}
            </button>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="text-xs text-gray-400 dark:text-gray-500 py-1 self-center"
            >
              Try a different source
            </button>
          </motion.div>
        ) : (
          /* ── Source picker ────────────────────────────────────── */
          <motion.div
            key="pick"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
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

            {mode === "blank" && (
              <div className="flex flex-col gap-3">
                <input
                  type="text"
                  value={name}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) {
                      e.preventDefault();
                      save({ name: name.trim(), ingredients: [], sourceKind: "manual" });
                    }
                  }}
                  placeholder="e.g. Grandma's chili"
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => save({ name: name.trim(), ingredients: [], sourceKind: "manual" })}
                  disabled={!name.trim() || busy}
                  className="w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
                >
                  {busy ? "Creating…" : "Create recipe"}
                </button>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center">
                  You&apos;ll add ingredients and steps next.
                </p>
              </div>
            )}

            {mode === "url" && (
              <div className="flex flex-col gap-3">
                <input
                  type="url" inputMode="url" autoCapitalize="off" autoCorrect="off"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://cooking.nytimes.com/recipes/…"
                  className={inputCls}
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Works on most recipe sites — we read the page&apos;s own recipe data first,
                  including the method, times and photo, and fall back to AI when a site
                  doesn&apos;t publish it.
                </p>
              </div>
            )}

            {mode === "photo" && (
              <div className="flex flex-col gap-3">
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED_MEDIA.join(",")}
                  className="hidden"
                  onChange={(e) => { setPhoto(e.target.files?.[0] ?? null); setError(null); }}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full py-6 rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors flex flex-col items-center gap-2"
                >
                  <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l3-3h12l3 3M3 9v9a2 2 0 002 2h14a2 2 0 002-2V9M9 13a3 3 0 116 0 3 3 0 01-6 0z" />
                  </svg>
                  <span className="text-sm font-medium">{photo ? photo.name : "Take or upload a photo"}</span>
                  <span className="text-[11px]">Cookbook page, recipe card, magazine clipping</span>
                </button>
              </div>
            )}

            {mode === "paste" && (
              <div className="flex flex-col gap-3">
                <textarea
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  rows={7}
                  placeholder={"Paste a recipe from a message, email or note…"}
                  className={`${inputCls} resize-none`}
                />
                <p className="text-[11px] text-gray-400 dark:text-gray-500">
                  Ingredients and steps are picked out automatically.
                </p>
              </div>
            )}

            {mode !== "blank" && (
              <button
                type="button"
                onClick={() => {
                  if (mode === "url") return callExtract({ type: "url", url: url.trim() }, "url", url.trim());
                  if (mode === "paste") return callExtract({ type: "text", text: paste.trim() }, "text");
                  return handlePhoto();
                }}
                disabled={!canExtract || busy}
                className="w-full py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 active:scale-[0.98] transition-all"
              >
                {busy ? "Reading recipe…" : "Import recipe"}
              </button>
            )}

            {error && (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                {error}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ItemSheet>
  );
}
