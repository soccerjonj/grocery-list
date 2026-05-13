"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  /** Called when the user taps the action button. */
  onClick: () => void;
}

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface WithActionOpts {
  type?: ToastType;
  /** Override default duration (ms). Useful to give undo more time. */
  duration?: number;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /**
   * Toast with a right-aligned action button. Used by undo (T2-D):
   *   withAction("Removed milk", { label: "Undo", onClick: restore }, { duration: 6000 });
   */
  withAction: (
    message: string,
    action: ToastAction,
    opts?: WithActionOpts,
  ) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

const DEFAULT_DURATION = 3200;
const ACTION_DURATION = 6000;  // longer for undo so the user has time to react

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);
    const t = setTimeout(() => dismiss(id), DEFAULT_DURATION);
    timers.current.set(id, t);
  }, [dismiss]);

  const withAction = useCallback(
    (message: string, action: ToastAction, opts: WithActionOpts = {}) => {
      const id = Math.random().toString(36).slice(2);
      const type = opts.type ?? "info";
      const duration = opts.duration ?? ACTION_DURATION;
      // Wrap the action so it dismisses the toast on tap.
      const wrappedAction: ToastAction = {
        label: action.label,
        onClick: () => {
          try { action.onClick(); } finally { dismiss(id); }
        },
      };
      setToasts((prev) => [...prev.slice(-3), { id, message, type, action: wrappedAction }]);
      const t = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, t);
    },
    [dismiss],
  );

  const success = useCallback((msg: string) => toast(msg, "success"), [toast]);
  const error   = useCallback((msg: string) => toast(msg, "error"),   [toast]);
  const info    = useCallback((msg: string) => toast(msg, "info"),    [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info, withAction }}>
      {children}
      <ToastPortal toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastPortal({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed left-0 right-0 z-[9999] flex flex-col items-center gap-2 pointer-events-none px-4"
      style={{ top: "max(1rem, env(safe-area-inset-top, 0px) + 0.75rem)" }}
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const baseCls = `pointer-events-auto max-w-sm w-full flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium ${
            t.type === "success"
              ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              : t.type === "error"
              ? "bg-red-600 text-white"
              : "bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-50 border border-gray-100 dark:border-zinc-700 shadow-md"
          }`;

          const icon =
            t.type === "success" ? (
              <svg className="w-4 h-4 flex-shrink-0 text-green-400 dark:text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : t.type === "error" ? (
              <svg className="w-4 h-4 flex-shrink-0 text-red-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 flex-shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            );

          // Two layouts: with action (split row, action on right) or plain
          // (whole pill is dismissable on tap).
          if (t.action) {
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: -20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.94, y: -8 }}
                transition={{ type: "spring", stiffness: 480, damping: 34 }}
                className={baseCls}
              >
                {icon}
                <span className="flex-1 leading-snug">{t.message}</span>
                <button
                  type="button"
                  onClick={t.action.onClick}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    t.type === "success"
                      ? "bg-white/10 hover:bg-white/20 text-white dark:bg-black/10 dark:hover:bg-black/15 dark:text-zinc-900"
                      : t.type === "error"
                      ? "bg-white/20 hover:bg-white/30 text-white"
                      : "bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 text-gray-900 dark:text-gray-50"
                  }`}
                >
                  {t.action.label}
                </button>
                <button
                  type="button"
                  onClick={() => onDismiss(t.id)}
                  aria-label="Dismiss"
                  className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full opacity-60 hover:opacity-100 transition-opacity"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </motion.div>
            );
          }

          return (
            <motion.button
              key={t.id}
              layout
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, y: -8 }}
              transition={{ type: "spring", stiffness: 480, damping: 34 }}
              onClick={() => onDismiss(t.id)}
              className={`${baseCls} text-left`}
            >
              {icon}
              <span className="flex-1 leading-snug">{t.message}</span>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>,
    document.body
  );
}
