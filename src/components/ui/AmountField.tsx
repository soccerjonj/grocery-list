"use client";

/**
 * Shared "Amount" control — quantity stepper + numeric input + unit chips.
 *
 * Used by every add/edit flow (shopping, pantry, to-list modal, import sheet)
 * so they all behave the same way:
 *   • −/+ buttons step quantity, with unit-aware step sizes (T2-E):
 *       kg / lb / L / mL → 0.5
 *       everything else  → 1
 *   • Numeric input accepts free-form values (decimals for weights, etc.)
 *   • Below the stepper, common units appear as toggleable chips.
 *
 * The fields are string-typed externally so callers can represent an
 * "empty" state ("") versus 1 explicitly. Stepping down from 1 clears
 * the field instead of going to 0 / negative.
 */

export const COMMON_UNITS = [
  "kg", "g", "lb", "oz", "L", "mL", "pack", "can", "bag", "box", "bottle",
] as const;

const FLOAT_UNITS = new Set(["kg", "lb", "L"]);
const SMALL_FLOAT_UNITS = new Set(["mL", "g", "oz"]);

/** Step size for a given unit, used by the +/− buttons. */
function stepForUnit(unit: string): number {
  if (FLOAT_UNITS.has(unit)) return 0.5;
  if (SMALL_FLOAT_UNITS.has(unit)) return 10;
  return 1;
}

/** Normalize floating-point arithmetic so we don't show "1.5000000001". */
function clean(n: number): string {
  if (n % 1 === 0) return String(n);
  return String(Math.round(n * 100) / 100);
}

interface AmountFieldProps {
  /** Quantity as a free-form string. Empty = "no quantity set". */
  quantity: string;
  /** Currently-selected unit, or "" for none. */
  unit: string;
  onQuantityChange: (q: string) => void;
  onUnitChange: (u: string) => void;
  /** Override the units shown as chips. Defaults to COMMON_UNITS. */
  units?: readonly string[];
  /** Visual size. "sm" suits modals; "md" suits full sheets. */
  size?: "sm" | "md";
  /** Optional placeholder for the numeric input. Defaults to "1". */
  placeholder?: string;
}

export default function AmountField({
  quantity,
  unit,
  onQuantityChange,
  onUnitChange,
  units = COMMON_UNITS,
  size = "sm",
  placeholder = "1",
}: AmountFieldProps) {
  const step = stepForUnit(unit);

  function decrement() {
    const current = parseFloat(quantity);
    if (isNaN(current)) {
      onQuantityChange("");
      return;
    }
    const next = current - step;
    if (next <= 0) onQuantityChange("");
    else onQuantityChange(clean(next));
  }

  function increment() {
    const current = parseFloat(quantity);
    const base = isNaN(current) ? 0 : current;
    onQuantityChange(clean(base + step));
  }

  const stepperBtn =
    size === "md"
      ? "w-9 h-9 text-lg"
      : "w-7 h-7 text-lg";
  const inputCls =
    size === "md"
      ? "w-14 py-2 text-sm font-semibold"
      : "w-12 py-1 text-sm font-semibold";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={decrement}
          className={`${stepperBtn} flex items-center justify-center rounded-lg bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-300 leading-none active:scale-90 transition-transform`}
          aria-label="Decrease quantity"
        >−</button>
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          placeholder={placeholder}
          value={quantity}
          onChange={(e) => onQuantityChange(e.target.value)}
          className={`${inputCls} text-center text-gray-900 dark:text-gray-100 outline-none border border-gray-200 dark:border-zinc-700 rounded-lg bg-transparent dark:bg-zinc-800 placeholder:text-gray-300 dark:placeholder:text-zinc-600 tabular-nums`}
        />
        <button
          type="button"
          onClick={increment}
          className={`${stepperBtn} flex items-center justify-center rounded-lg bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 leading-none active:scale-90 transition-transform`}
          aria-label="Increase quantity"
        >+</button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {units.map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => onUnitChange(unit === u ? "" : u)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
              unit === u
                ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
            }`}
          >
            {u}
          </button>
        ))}
      </div>
    </div>
  );
}
