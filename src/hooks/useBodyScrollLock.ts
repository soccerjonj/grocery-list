"use client";

import { useEffect } from "react";

/**
 * iOS-safe body scroll lock. Locks scrolling on the document body when
 * `active` is true, restoring scroll position on unlock. Uses the
 * fixed-position trick rather than `overflow: hidden` alone — Safari on
 * iOS otherwise allows the page to bounce and shift while a sheet is
 * open. Extracted from PantryItem so every modal/sheet in the app
 * gets the same correct behavior.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
