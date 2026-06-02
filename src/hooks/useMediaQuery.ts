"use client";

import { useEffect, useState } from "react";

/**
 * SSR-safe media-query hook. Returns `false` on the server AND on the
 * first client render, then updates after mount. This guarantees the
 * server HTML and the first client paint agree (no hydration mismatch),
 * and means any desktop-only behavior is opt-in *after* mount — mobile
 * and SSR always take the pre-existing code path.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange(); // sync now that we're mounted on the client
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** Convenience: true at the app's desktop breakpoint (Tailwind lg = 1024px). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
