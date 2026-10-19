"use client";

import { useCallback, useState } from "react";
import type { RecipeInput } from "@/hooks/useHouseholdRecipes";
import type { RecipeIngredient, RecipeStep } from "@/lib/recipeTypes";

/**
 * Calling /api/extract-recipe and turning its reply into a RecipeInput.
 *
 * Lifted out of RecipeCreateSheet so the shopping tab's "import straight to my
 * list" flow runs the identical extraction — one place where the request
 * shapes, the size caps and the error copy live, so the two entry points can't
 * drift.
 */

export const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/webp"];

/**
 * Client-side photo cap. The route rejects a base64 payload over 8,000,000
 * chars, and base64 inflates by 4/3 — so the real server ceiling is ~6 MB of
 * file. The old 8 MB client cap let 6-8 MB photos through to a server-side 413;
 * 5.5 MB keeps the check honest and fails fast with a useful message.
 */
export const MAX_PHOTO_BYTES = 5.5 * 1024 * 1024;

/** The route's reply. Absent fields come back undefined on the JSON-LD path. */
export interface ExtractResponse {
  items?: RecipeIngredient[];
  steps?: RecipeStep[];
  title?: string;
  servings?: number;
  prepMinutes?: number;
  cookMinutes?: number;
  imageUrl?: string;
  description?: string;
  source?: string;
  error?: string;
  /** Multi-paste mode only: one entry per detected recipe. */
  recipes?: ExtractResponse[];
}

export function fileToBase64(file: File): Promise<string> {
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

/** Map one extraction reply onto a RecipeInput. */
export function toRecipeInput(
  data: ExtractResponse,
  sourceKind: NonNullable<RecipeInput["sourceKind"]>,
  sourceUrl?: string,
): RecipeInput {
  return {
    name: data.title?.trim() || "Untitled recipe",
    ingredients: data.items ?? [],
    steps: data.steps ?? [],
    servings: data.servings ?? null,
    prepMinutes: data.prepMinutes ?? null,
    cookMinutes: data.cookMinutes ?? null,
    // Remote hero image is stored as a URL, not re-hosted — no bandwidth cost
    // and no copy of someone else's photo in our bucket.
    imageUrl: data.imageUrl ?? null,
    description: data.description ?? null,
    sourceUrl: sourceUrl ?? null,
    sourceKind,
  };
}

export function useRecipeExtract() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecipeInput | null>(null);
  /** Multi-paste: several candidates awaiting confirmation. */
  const [results, setResults] = useState<RecipeInput[] | null>(null);

  const reset = useCallback(() => {
    setBusy(false);
    setError(null);
    setResult(null);
    setResults(null);
  }, []);

  const run = useCallback(async (
    body: Record<string, unknown>,
    sourceKind: NonNullable<RecipeInput["sourceKind"]>,
    sourceUrl?: string,
  ) => {
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
      setResult(toRecipeInput(data, sourceKind, sourceUrl));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that recipe");
    } finally {
      setBusy(false);
    }
  }, []);

  const extractUrl = useCallback((url: string) => {
    const trimmed = url.trim();
    return run({ type: "url", url: trimmed }, "url", trimmed);
  }, [run]);

  const extractPaste = useCallback(
    (text: string) => run({ type: "text", text: text.trim() }, "text"),
    [run],
  );

  /**
   * Several recipes from one paste. Nothing is saved here — the caller shows
   * the detected split for confirmation first, so a bad split costs a tap.
   */
  const extractMany = useCallback(async (text: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/extract-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text", text: text.trim(), multiple: true }),
      });
      const data = (await res.json()) as ExtractResponse;
      if (!res.ok) throw new Error(data.error || "Couldn't read those recipes");
      const list = (data.recipes ?? []).map((r) => toRecipeInput(r, "text"));
      if (list.length === 0) throw new Error("We couldn't find a recipe in that text");
      // One recipe back from multi mode is the model declining to split, which
      // is the designed conservative answer — treat it as a normal single
      // result so the user gets the plain confirmation screen.
      if (list.length === 1) setResult(list[0]);
      else setResults(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read those recipes");
    } finally {
      setBusy(false);
    }
  }, []);

  const extractPhoto = useCallback(async (photo: File) => {
    if (photo.size > MAX_PHOTO_BYTES) {
      setError("That photo is too large (max ~5 MB).");
      return;
    }
    try {
      const imageBase64 = await fileToBase64(photo);
      await run(
        { type: "image", imageBase64, mediaType: photo.type || "image/jpeg" },
        "photo",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't read that file");
    }
  }, [run]);

  return {
    busy, error, result, results,
    setResult, setResults, setError, reset,
    extractUrl, extractPaste, extractPhoto, extractMany,
  };
}
