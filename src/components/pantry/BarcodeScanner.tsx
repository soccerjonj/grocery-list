"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { BrowserMultiFormatReader } from "@zxing/browser";

/**
 * Fullscreen barcode scanner sheet.
 *
 * On open: requests camera permission, mounts a <video> element, hands
 * the stream to @zxing/browser which runs continuous decoding. When a
 * barcode is decoded we call `onDetect(code)` and stop the camera.
 *
 * `onClose` lets the user bail out without scanning. The "Enter manually"
 * button is a UX safety net for items that don't have barcodes or scan
 * poorly (e.g. produce, deli items).
 */
export default function BarcodeScanner({
  open,
  onDetect,
  onClose,
}: {
  open: boolean;
  onDetect: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Hold the controls object returned by @zxing/browser so we can stop on close.
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Lock body scroll while the scanner is up.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    if (!open || !videoRef.current) return;

    let cancelled = false;
    setError(null);
    setScanning(true);

    const reader = new BrowserMultiFormatReader();

    // Try the rear camera first — `facingMode: "environment"` works on most
    // mobile browsers and is what users expect when scanning.
    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, _err, controls) => {
          if (cancelled) {
            controls.stop();
            return;
          }
          if (result) {
            const code = result.getText();
            // Stop immediately so the user doesn't keep scanning. Light
            // haptic confirms detection on supported devices.
            controls.stop();
            controlsRef.current = null;
            if (typeof navigator !== "undefined" && "vibrate" in navigator) {
              try { navigator.vibrate(20); } catch { /* ignore */ }
            }
            setScanning(false);
            onDetect(code);
          }
        },
      )
      .then((controls) => {
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setScanning(false);
        const msg = e instanceof Error ? e.message : "";
        // The most common error is "Permission denied" — show a clearer
        // message than the raw browser error.
        if (msg.toLowerCase().includes("permission")) {
          setError("Camera permission denied. Allow camera access in your browser to scan barcodes.");
        } else if (msg.toLowerCase().includes("notfound")) {
          setError("No camera found on this device.");
        } else {
          setError("Couldn't start the camera. Try entering the item manually.");
        }
      });

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [open, onDetect]);

  function handleClose() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    onClose();
  }

  const sheet = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="scanner-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] bg-black flex flex-col"
        >
          {/* Camera viewport */}
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Vignette + scanning frame overlay */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 bg-black/40" />
            {/* Cut-out frame */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-48 max-w-[80vw] rounded-2xl ring-2 ring-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
              {/* Animated scan line */}
              {scanning && !error && (
                <motion.div
                  className="absolute left-3 right-3 h-0.5 bg-red-400/90 rounded-full"
                  initial={{ top: "10%" }}
                  animate={{ top: ["10%", "90%", "10%"] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                />
              )}
            </div>
          </div>

          {/* Top bar */}
          <div className="relative z-10 flex items-center gap-3 p-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
            <button
              type="button"
              onClick={handleClose}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-black/55 backdrop-blur text-white active:scale-90 transition-transform"
              aria-label="Close scanner"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <p className="text-white font-medium text-sm">Scan a barcode</p>
          </div>

          {/* Bottom controls */}
          <div className="relative z-10 mt-auto p-4 flex flex-col items-center gap-3" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
            {error ? (
              <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl p-4 flex flex-col gap-2 shadow-2xl">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-50">{error}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full mt-1 py-2.5 rounded-xl bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium active:scale-[0.98] transition-transform"
                >
                  Enter manually
                </button>
              </div>
            ) : (
              <>
                <p className="text-white/85 text-sm text-center max-w-xs leading-snug">
                  Point at a product&apos;s barcode. We&apos;ll fill in the details automatically.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2 rounded-full bg-white/15 backdrop-blur text-white text-sm font-medium active:scale-95 transition-transform"
                >
                  Enter manually instead
                </button>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return mounted ? createPortal(sheet, document.body) : null;
}
