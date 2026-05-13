"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import ImportToPantrySheet, { type ImportSeedItem } from "@/components/pantry/ImportToPantrySheet";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import type { AddPantryOptions } from "@/hooks/usePantry";

/**
 * Receipt OCR entry point (T3-E).
 *
 * Renders a discoverable trigger button below the add-pantry form. On tap:
 *   1. Photo-picker sheet — multiple photos allowed for long receipts.
 *   2. POSTs the images to /api/extract-receipt (Claude Sonnet vision).
 *   3. Opens the existing ImportToPantrySheet with the extracted items
 *      as drafts. The rest of the flow — kind detection, conflict merge,
 *      bulk expiry — reuses everything we already built.
 */

interface Props {
  householdId: string;
  members?: MemberProfile[];
  currentUserId?: string | null;
  onAddItem: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => Promise<void>;
}

const ACCEPTED_MEDIA = ["image/jpeg", "image/png", "image/webp"];
const MAX_FILES = 4;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

interface ReceiptItem {
  name: string;
  quantity?: number;
  unit?: string;
}

export default function ReceiptImportButton({ householdId, members, currentUserId, onAddItem }: Props) {
  const [mounted, setMounted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  // Drafts to hand to ImportToPantrySheet. Non-null = sheet is open.
  const [extracted, setExtracted] = useState<ImportSeedItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [pickerOpen]);

  function reset() {
    setFiles([]);
    setError(null);
    setBusy(false);
  }

  function close() {
    setPickerOpen(false);
    reset();
  }

  function pickFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => ACCEPTED_MEDIA.includes(f.type));
    if (incoming.length === 0) {
      setError("Pick a JPEG, PNG, or WebP photo.");
      return;
    }
    const tooBig = incoming.find((f) => f.size > MAX_FILE_BYTES);
    if (tooBig) {
      setError(`That photo is over 8 MB. Try a smaller image.`);
      return;
    }
    const next = [...files, ...incoming].slice(0, MAX_FILES);
    setFiles(next);
    setError(null);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function extract() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const images = await Promise.all(
        files.map(async (f) => ({
          imageBase64: await fileToBase64(f),
          mediaType: f.type || "image/jpeg",
        })),
      );
      const res = await fetch("/api/extract-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Couldn't read this receipt");
        return;
      }
      const items: ReceiptItem[] = Array.isArray(data?.items) ? data.items : [];
      if (items.length === 0) {
        setError("We couldn't find any items in that photo. Try better lighting or a clearer shot.");
        return;
      }
      setPickerOpen(false);
      setExtracted(
        items.map((i) => ({
          name: i.name,
          quantity: typeof i.quantity === "number" ? i.quantity : undefined,
          unit: typeof i.unit === "string" ? i.unit : undefined,
        })),
      );
      reset();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  const picker = (
    <AnimatePresence>
      {pickerOpen && (
        <>
          <motion.div
            key="bk"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="fixed inset-0 z-50 bg-black/50"
            onClick={close}
          />
          <motion.div
            key="sh"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 360, damping: 38 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-white dark:bg-zinc-900 rounded-t-3xl shadow-2xl flex flex-col"
            style={{ maxHeight: "92dvh", paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex justify-center pt-3.5 pb-1 flex-shrink-0">
              <div className="w-10 h-[5px] bg-gray-200 dark:bg-zinc-700 rounded-full" />
            </div>
            <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0 border-b border-gray-100 dark:border-zinc-800">
              <div className="flex-1">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">Import from a receipt</h2>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Take a clear photo. Long receipts? Add up to {MAX_FILES} shots.
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
                aria-label="Close"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ overscrollBehavior: "contain" }}>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPTED_MEDIA.join(",")}
                capture="environment"
                className="hidden"
                onChange={(e) => pickFiles(e.target.files)}
              />
              {files.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 rounded-2xl border-2 border-dashed border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500 transition-colors flex flex-col items-center gap-2"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l3-3h12l3 3M3 9v9a2 2 0 002 2h14a2 2 0 002-2V9M9 13a3 3 0 116 0 3 3 0 01-6 0z" />
                  </svg>
                  <p className="text-sm font-medium">Take or upload a receipt photo</p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Hold steady, fill the frame</p>
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map((f, idx) => (
                    <div
                      key={`${f.name}-${idx}`}
                      className="flex items-center gap-3 bg-gray-50 dark:bg-zinc-800/50 rounded-xl px-3 py-2"
                    >
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l3-3h12l3 3M3 9v9a2 2 0 002 2h14a2 2 0 002-2V9" />
                      </svg>
                      <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{f.name}</span>
                      <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">{Math.round(f.size / 1024)} KB</span>
                      <button
                        type="button"
                        onClick={() => removeFile(idx)}
                        className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 dark:text-gray-600 hover:text-red-400 transition-colors"
                        aria-label="Remove"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                  {files.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="self-start text-xs text-gray-500 dark:text-gray-400 underline underline-offset-2 active:opacity-60"
                    >+ Add another photo</button>
                  )}
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  {error}
                </div>
              )}
            </div>
            <div className="flex-shrink-0 px-4 pb-4 pt-2 border-t border-gray-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={extract}
                disabled={files.length === 0 || busy}
                className="w-full py-3.5 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-semibold disabled:opacity-50 active:scale-[0.98] transition-transform"
              >
                {busy ? "Reading receipt…" : `Extract from ${files.length || 0} photo${files.length === 1 ? "" : "s"}`}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setPickerOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:scale-95"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9h6m-6 4h4" />
        </svg>
        Import from receipt
      </button>

      {mounted && createPortal(picker, document.body)}

      {extracted && (
        <ImportToPantrySheet
          initialItems={extracted}
          householdId={householdId}
          members={members}
          currentUserId={currentUserId}
          onAddItem={onAddItem}
          onClose={() => setExtracted(null)}
        />
      )}
    </>
  );
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
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
