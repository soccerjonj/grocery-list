"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Snap the window scroll to the top whenever the pathname changes.
 *
 * Next.js App Router normally does this for navigations, but we keep the
 * household layout (and its shared data provider) mounted across Pantry ↔
 * Shopping switches — and in that scenario the document scroll position
 * sometimes carries over from one tab to another, which feels broken.
 * This forces a clean reset on every route change.
 *
 * Skips the very first mount so deep-links and refreshes preserve the
 * initial render position (the browser already handles that correctly).
 */
export default function RouteScrollReset() {
  const pathname = usePathname();
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    if (typeof window === "undefined") return;
    // 'instant' keeps the reset from competing with the page-transition animation
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}
