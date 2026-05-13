"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { ExtractedIngredient } from "@/lib/recipeExtract";

/**
 * "Add ingredients from a recipe" sheet (T3-B).
 *
 * Two input modes:
 *   • URL — user pastes a recipe link. We server-fetch + parse JSON-LD,
 *     falling back to Claude Haiku.
 *   • Photo — user takes / picks a recipe-card photo. We send to Claude
 *     Sonnet vision.
 *
 * Once ingredients are extracted, the sheet shows them as editable cards.
 * The user can rename / remove individual lines, then tap "Add N items to
 * list" to bulk-add via `onAdd`.
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

interface Draft extends ExtractedIngredient {
  /** Stable id for the React key + editing state. */
  key: string;
  /** User can flag a draft to be skipped; we still render it greyed out. */
  skipped?: boolean;
}

const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/webp"];

export default function RecipeImportSheet({ open, onClose, onAdd }: Props) {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<Mode>("url");
  const [url, setUrl] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [adding, setAdding] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Reset state when the sheet closes so a fresh open feels clean.
  useEffect(() => {
    if (!open) {
      setUrl(""); setPhotoFile(null); setTitle(null);
      setDrafts(null); setError(null); setBusy(false); setAdding(false);
      setMode("url");
    }
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
      setTitle(typeof data.title === "string" ? data.title : null);
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
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  }

  function asDrafts(items: ExtractedIngredient[]): Draft[] {
    return items.map((i, idx) => ({ ...i, key: `i-${idx}-${i.raw}` }));
  }

  async function handleAddAll() {
    if (!drafts) return;
    const keepers = drafts.filter((d) => !d.skipped && d.name.trim());
    if (keepers.length === 0) return;
    setAdding(true);
    try {
      for (const d of keepers) {
        await onAdd(d.name.trim(), d.quantity, d.unit);
      }
    } finally {
      setAdding(false);
      onClose();
    }
  }

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
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  {drafts ? (title ?? "Recipe ingredients") : "Add from a recipe"}
                </h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {drafts
                    ? `${drafts.filter((d) => !d.skipped).length} of ${drafts.length} will be added — edit or skip any line`
                    : "Paste a recipe link, or upload a photo of one"}
                </p>
              </div>
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
                  {/* Mode tabs */}
                  <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-100 dark:bg-zinc-800">
                    {(["url", "photo"] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setMode(m); setError(null); }}
                        className={`py-2 rounded-xl text-sm font-medium transition-colors active:scale-[0.98] ${
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
                        capture="environment"
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
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-gray-400 dark:text-gray-500">
                        {(d.quantity !== undefined || d.unit) && (
                          <span className="tabular-nums">
                            {d.quantity !== undefined ? d.quantity : "?"}
                            {d.unit ? ` ${d.unit}` : ""}
                          </span>
                        )}
                        <span className="truncate flex-1 italic opacity-70">{d.raw}</span>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>

            {/* Footer */}
            {drafts && drafts.length > 0 && (() => {
              const keeperCount = drafts.filter((d) => !d.skipped && d.name.trim()).length;
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
