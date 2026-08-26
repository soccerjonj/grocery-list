"use client";

import { useState, useEffect } from "react";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";
import type { DeductionRow } from "@/lib/recipeDeduct";
import { formatQuantity, formatAmount } from "@/lib/recipeScale";

/**
 * The post-cook "what came out of the pantry" screen.
 *
 * Nothing is ever deducted silently: every line is listed with an adjustable
 * amount and an on/off toggle, and rows whose units we couldn't compare start
 * at zero and OFF — the ambiguous case is opt-in. "Skip" still records that
 * you cooked, it just doesn't touch the pantry.
 */
export default function DeductConfirmSheet({
  open,
  rows,
  busy,
  onSkip,
  onConfirm,
}: {
  open: boolean;
  rows: DeductionRow[];
  busy: boolean;
  onSkip: () => void;
  onConfirm: (applied: { row: DeductionRow; amount: number }[]) => void;
}) {
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  // Seed from the plan whenever the sheet opens with a new set of rows.
  useEffect(() => {
    if (!open) return;
    const a: Record<string, number> = {};
    const e: Record<string, boolean> = {};
    for (const r of rows) {
      a[r.key] = r.suggested;
      // Only pre-enable rows we could compute honestly and that take something.
      e[r.key] = r.comparable && r.suggested > 0;
    }
    setAmounts(a);
    setEnabled(e);
  }, [open, rows]);

  function step(r: DeductionRow, delta: number) {
    setAmounts((prev) => {
      const cur = prev[r.key] ?? 0;
      const next = Math.max(0, Math.min(r.pantryQty, Number((cur + delta).toFixed(2))));
      return { ...prev, [r.key]: next };
    });
  }

  const applied = rows
    .filter((r) => enabled[r.key] && (amounts[r.key] ?? 0) > 0)
    .map((r) => ({ row: r, amount: amounts[r.key] }));

  return (
    <ItemSheet
      open={open}
      onClose={onSkip}
      header={<ItemSheetHeader title="Update your pantry?" onClose={onSkip} />}
    >
      <p className="text-xs text-gray-500 dark:text-gray-400 -mt-1">
        Adjust anything that&apos;s off — nothing changes until you confirm.
      </p>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500">
          None of these ingredients are tracked in your pantry, so there&apos;s nothing to update.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const on = !!enabled[r.key];
            const amt = amounts[r.key] ?? 0;
            const stepSize = r.pantryQty <= 5 ? 0.5 : 1;
            return (
              <li
                key={r.key}
                className={`rounded-2xl border p-3 flex flex-col gap-2 transition-colors ${
                  on
                    ? "border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                    : "border-gray-100 dark:border-zinc-800 bg-gray-50/60 dark:bg-zinc-900/40"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEnabled((p) => ({ ...p, [r.key]: !on }))}
                    aria-label={on ? `Don't update ${r.pantryName}` : `Update ${r.pantryName}`}
                    className={`flex-shrink-0 mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                      on
                        ? "bg-gray-900 dark:bg-zinc-100 border-gray-900 dark:border-zinc-100"
                        : "border-gray-300 dark:border-zinc-600"
                    }`}
                  >
                    {on && (
                      <svg className="w-3 h-3 text-white dark:text-zinc-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${on ? "text-gray-900 dark:text-gray-50" : "text-gray-400 dark:text-gray-500"}`}>
                      {r.pantryName}
                    </p>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">
                      have {formatAmount(r.pantryQty, r.pantryUnit)}
                      {r.neededQty !== null && ` · recipe needs ${formatAmount(r.neededQty, r.neededUnit)}`}
                    </p>
                  </div>
                </div>

                {/* Amount stepper, in the PANTRY's unit */}
                <div className="flex items-center justify-between gap-3 pl-7">
                  <span className="text-[11px] text-gray-400 dark:text-gray-500">
                    {r.comparable ? "Use" : "Different units — set it yourself"}
                  </span>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button" aria-label="Less"
                      onClick={() => step(r, -stepSize)}
                      className="w-7 h-7 rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 flex items-center justify-center active:scale-90 transition-transform"
                    >−</button>
                    <span className="min-w-[3.5rem] text-center text-sm tabular-nums text-gray-900 dark:text-gray-50">
                      {formatQuantity(amt)}{r.pantryUnit ? ` ${r.pantryUnit}` : ""}
                    </span>
                    <button
                      type="button" aria-label="More"
                      onClick={() => step(r, stepSize)}
                      className="w-7 h-7 rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center active:scale-90 transition-transform"
                    >+</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="px-4 py-3 rounded-2xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 transition-colors disabled:opacity-50"
        >
          Skip
        </button>
        <button
          type="button"
          onClick={() => onConfirm(applied)}
          disabled={busy}
          className="flex-1 py-3 rounded-2xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50 active:scale-[0.98] transition-all"
        >
          {busy
            ? "Updating…"
            : applied.length === 0
              ? "Done"
              : `Update ${applied.length} item${applied.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </ItemSheet>
  );
}
