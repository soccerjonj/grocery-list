"use client";

import { useEffect, useRef, useState } from "react";

const TRIGGER_THRESHOLD = 70;   // px of pull before refresh fires on release
const MAX_PULL = 120;           // visual cap on how far the indicator can travel
const PULL_DAMPING = 0.5;       // 1 = follow finger, 0.5 = half-speed (rubber-band feel)

/**
 * Wrap page content in this to enable pull-to-refresh.
 *
 * Activates only when:
 *   – the window is scrolled to the top, AND
 *   – no modal/sheet has locked body scroll (we read `body.style.overflow`)
 *
 * On release past the threshold:
 *   – calls `onRefresh()`. The default behavior (when no callback is passed)
 *     is to ask the service worker for any new app version then hard-reload
 *     so the user gets both fresh data and the latest deployed code.
 */
export default function PullToRefresh({
  children,
  onRefresh,
}: {
  children: React.ReactNode;
  onRefresh?: () => Promise<void> | void;
}) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // Refs hold the live values so the touch handlers (bound once) read fresh
  // state without us re-binding on every pull tick.
  const pullRef = useRef(0);
  const startY = useRef<number | null>(null);
  const tracking = useRef(false);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => { onRefreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { refreshingRef.current = refreshing; }, [refreshing]);

  function setPullValue(v: number) {
    pullRef.current = v;
    setPull(v);
  }

  useEffect(() => {
    function isModalOpen() {
      // The pantry/shopping/import sheets all set body.overflow = "hidden"
      // when open. Use that as a signal to suppress pull-to-refresh so users
      // can drag inside those sheets without triggering a reload.
      return document.body.style.overflow === "hidden";
    }

    /**
     * Walks up from `target` looking for an ancestor that is itself a
     * vertically-scrollable container (not the page body). When such an
     * ancestor exists, the user is interacting with something like the
     * inner scroll area of a bottom-sheet, a textarea, or a dropdown —
     * the gesture belongs to that element, never to pull-to-refresh.
     *
     * Stops at `document.body` so the regular page scroll doesn't count
     * (PTR only ever runs at the top of the page anyway).
     */
    function startsInVerticalScroller(target: EventTarget | null): boolean {
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (
          (style.overflowY === "auto" || style.overflowY === "scroll") &&
          el.scrollHeight > el.clientHeight + 1
        ) {
          return true;
        }
        el = el.parentElement;
      }
      return false;
    }

    function handleStart(e: TouchEvent) {
      if (refreshingRef.current) return;
      if (isModalOpen()) return;
      // Hard guard: don't claim the gesture if it started inside any
      // vertical scroller (bottom sheets, dropdowns, textareas, etc.).
      // This is more robust than the body.overflow convention.
      if (startsInVerticalScroller(e.target)) return;
      if (window.scrollY > 0) return;
      // Multi-touch (pinch-zoom etc.) — bail out
      if (e.touches.length !== 1) return;
      startY.current = e.touches[0].clientY;
      tracking.current = true;
    }

    function handleMove(e: TouchEvent) {
      if (!tracking.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      // User scrolled up — abort the gesture
      if (dy <= 0) {
        tracking.current = false;
        setPullValue(0);
        return;
      }
      const damped = Math.min(MAX_PULL, dy * PULL_DAMPING);
      setPullValue(damped);
      // Suppress native rubber-band only after the pull is meaningful so
      // we don't break ordinary taps that include a tiny vertical jitter.
      if (damped > 5 && e.cancelable) e.preventDefault();
    }

    async function handleEnd() {
      if (!tracking.current) return;
      tracking.current = false;
      const cur = pullRef.current;
      startY.current = null;
      if (cur >= TRIGGER_THRESHOLD) {
        await triggerRefresh();
      } else {
        setPullValue(0);
      }
    }

    async function triggerRefresh() {
      setRefreshing(true);
      // Snap indicator to the threshold while we work
      setPullValue(TRIGGER_THRESHOLD);
      // Subtle haptic on supported devices
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(8); } catch { /* ignore */ }
      }
      try {
        if (onRefreshRef.current) {
          await onRefreshRef.current();
        } else {
          await defaultRefresh();
        }
      } finally {
        // If the default refresh ran, the page is reloading and these don't
        // matter. If a custom callback ran without reloading, snap back.
        setRefreshing(false);
        setPullValue(0);
      }
    }

    window.addEventListener("touchstart", handleStart, { passive: true });
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleEnd);
    window.addEventListener("touchcancel", handleEnd);
    return () => {
      window.removeEventListener("touchstart", handleStart);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleEnd);
      window.removeEventListener("touchcancel", handleEnd);
    };
  }, []);

  const progress = Math.min(1, pull / TRIGGER_THRESHOLD);
  const indicatorTranslate = pull > 0 ? Math.max(0, pull - 16) : -48;
  const settling = pull === 0 && !refreshing;

  return (
    <>
      {/* Floating indicator — sits above content, fixed to the viewport */}
      <div
        aria-hidden
        className="fixed top-2 left-0 right-0 flex justify-center pointer-events-none z-[60]"
        style={{
          transform: `translateY(${indicatorTranslate}px)`,
          opacity: refreshing ? 1 : progress,
          transition: settling ? "transform 0.22s ease-out, opacity 0.22s ease-out" : "none",
        }}
      >
        <div className="bg-white dark:bg-zinc-800 rounded-full shadow-md border border-gray-100 dark:border-zinc-700 w-9 h-9 flex items-center justify-center">
          <svg
            className={refreshing ? "w-4 h-4 animate-spin text-gray-700 dark:text-gray-200" : "w-4 h-4 text-gray-500 dark:text-gray-300"}
            viewBox="0 0 24 24"
            fill="none"
            style={refreshing ? undefined : { transform: `rotate(${progress * 270}deg)`, transition: "transform 0.05s linear" }}
          >
            <circle
              cx="12" cy="12" r="9"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={refreshing ? "44 56" : `${progress * 56} 56`}
              opacity={refreshing ? 1 : 0.85}
            />
            {!refreshing && progress >= 1 && (
              <path
                d="M8 12l3 3 5-6"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Page content — translates down with the pull */}
      <div
        style={{
          transform: pull > 0 || refreshing ? `translateY(${pull}px)` : undefined,
          transition: settling ? "transform 0.22s ease-out" : "none",
          // Disable browser pull-to-refresh; we provide our own
          overscrollBehaviorY: "contain",
        }}
      >
        {children}
      </div>
    </>
  );
}

async function defaultRefresh() {
  // 1. Ask the service worker to check for a new version. If one is found,
  //    `update()` triggers the install flow; the new SW activates on next
  //    navigation/reload, which we do immediately below.
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
    } catch { /* silent — never let SW issues block the reload */ }
  }
  // 2. Hard reload so server-rendered routes, hooks, and Realtime subscriptions
  //    all reinitialize. Realtime usually keeps data fresh in real time, but
  //    an explicit reload is the user's mental model for "refresh."
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}
