"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps the screen awake while `active` — for cook mode, where your hands are
 * covered in flour and the phone is propped against the toaster.
 *
 * Two things make this less trivial than it looks:
 *  1. The browser AUTO-RELEASES the lock whenever the tab is hidden. Without
 *     re-acquiring on `visibilitychange`, the screen sleeps the first time you
 *     glance at a text and come back — the exact moment it matters most.
 *  2. `request()` genuinely rejects (low battery, permissions policy), so
 *     every call is wrapped. We never throw into the UI.
 *
 * Unsupported browsers degrade silently; `supported` lets the caller show an
 * honest note instead of pretending the screen will stay on.
 */

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
}

export function useWakeLock(active: boolean) {
  const sentinel = useRef<WakeLockSentinelLike | null>(null);
  const [supported, setSupported] = useState(false);
  const [held, setHeld] = useState(false);

  useEffect(() => {
    setSupported(
      typeof navigator !== "undefined" && "wakeLock" in navigator,
    );
  }, []);

  useEffect(() => {
    if (!active) return;
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
    };

    async function acquire() {
      if (cancelled || !nav.wakeLock) return;
      // Requesting while hidden always rejects — wait for the visible event.
      if (document.visibilityState !== "visible") return;
      try {
        const s = await nav.wakeLock.request("screen");
        if (cancelled) { void s.release().catch(() => {}); return; }
        sentinel.current = s;
        setHeld(true);
        s.addEventListener("release", () => setHeld(false));
      } catch {
        // Low battery, denied, or unsupported in this context — degrade quietly.
        setHeld(false);
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible" && !sentinel.current?.released) {
        // Sentinel may exist but already be auto-released; re-acquiring is safe.
        void acquire();
      } else if (document.visibilityState === "visible") {
        void acquire();
      }
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      const s = sentinel.current;
      sentinel.current = null;
      setHeld(false);
      if (s && !s.released) void s.release().catch(() => {});
    };
  }, [active]);

  return { supported, held };
}
