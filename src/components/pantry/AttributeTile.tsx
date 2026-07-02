"use client";

/**
 * One tappable tile in the pantry detail grid. Shows an attribute's icon +
 * label + current value at a glance; tapping opens its inline editor (the
 * parent tracks which tile is open and renders the editor below the grid).
 * When `open`, the tile gets an accent ring so it's clear which editor the
 * panel belongs to.
 */
export default function AttributeTile({
  icon,
  label,
  value,
  open = false,
  wide = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  /** Current-value display node (text, pill, avatars, ring, etc.). */
  value: React.ReactNode;
  open?: boolean;
  /** Span both columns (used by Note). */
  wide?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={wide ? { gridColumn: "1 / -1" } : undefined}
      className={`flex flex-col gap-2 text-left rounded-2xl px-3.5 py-3 min-h-[74px] transition-colors active:scale-[0.98] border ${
        open
          ? "border-gray-900/70 dark:border-zinc-100/60 bg-gray-50 dark:bg-zinc-800/60"
          : "border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <div className="flex items-center justify-between text-gray-400 dark:text-gray-500">
        <span className="flex items-center gap-1.5 text-[11px] font-medium">
          <span className="flex-shrink-0">{icon}</span>
          {label}
        </span>
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
      <div className="min-w-0">{value}</div>
    </button>
  );
}
