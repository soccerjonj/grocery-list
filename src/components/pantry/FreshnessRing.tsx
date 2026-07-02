"use client";

import { getExpiryDisplay } from "@/lib/expiry";

/**
 * Small circular freshness indicator for the Expiry tile. The arc depletes
 * as the date nears and the color follows the shared expiry ladder
 * (red → amber → green → gray). Center shows the days-left number for the
 * actionable ≤90-day window, a check when there's plenty of time, or "Set"
 * when no date is chosen. Dark-mode-safe: the progress arc is `currentColor`
 * driven by the ladder's tailwind text class.
 */
export default function FreshnessRing({
  expiresAt,
  size = 46,
}: {
  expiresAt: string | null;
  size?: number;
}) {
  const d = getExpiryDisplay(expiresAt);
  const stroke = 4;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  // Far-future (gray) reads as "full"; expired/none read as empty.
  const arc = d.tone === "none" ? 0 : d.tone === "gray" ? 1 : d.fraction;
  const offset = circ * (1 - arc);
  const cx = size / 2;

  return (
    <div className={`relative flex-shrink-0 ${d.textClass}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block -rotate-90" aria-hidden="true">
        <circle
          cx={cx} cy={cx} r={r} fill="none" strokeWidth={stroke}
          className="text-gray-200 dark:text-zinc-700" stroke="currentColor"
        />
        {d.tone !== "none" && (
          <circle
            cx={cx} cy={cx} r={r} fill="none" strokeWidth={stroke} stroke="currentColor"
            strokeLinecap="round" strokeDasharray={circ}
            style={{ strokeDashoffset: offset, transition: "stroke-dashoffset 0.35s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        {d.tone === "none" ? (
          <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Set</span>
        ) : d.daysLeft !== null && d.daysLeft > 90 ? (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <span className="text-[13px] font-semibold leading-none">
            {Math.max(d.daysLeft ?? 0, 0)}
            <span className="text-[9px] font-medium">d</span>
          </span>
        )}
      </div>
    </div>
  );
}
