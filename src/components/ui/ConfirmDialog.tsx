"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import Button from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red destructive styling on the confirm button. */
  danger?: boolean;
  /**
   * If set, the user must type this exact string (case-insensitive, trimmed)
   * before the confirm button enables — the second "are you sure" for
   * irreversible actions (delete household, delete account, transfer).
   */
  requireTyped?: string;
  onConfirm: () => void | Promise<void>;
}

/**
 * Shared confirmation dialog built on Modal + Button. Handles the busy state
 * of an async onConfirm, and an optional type-to-confirm gate for
 * irreversible actions. The dialog can't be dismissed while confirming.
 */
export default function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  requireTyped,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTyped("");
      setBusy(false);
    }
  }, [open]);

  const canConfirm = !requireTyped || typed.trim().toLowerCase() === requireTyped.trim().toLowerCase();

  async function handleConfirm() {
    if (!canConfirm || busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title}>
      <div className="flex flex-col gap-4">
        {body && (
          <div className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{body}</div>
        )}

        {requireTyped && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-gray-400 dark:text-gray-500">
              Type{" "}
              <span className="font-semibold text-gray-700 dark:text-gray-200">{requireTyped}</span>{" "}
              to confirm
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) handleConfirm(); }}
              className="w-full text-sm text-gray-900 dark:text-gray-50 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500"
            />
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={handleConfirm}
            loading={busy}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
