"use client";

import { motion } from "framer-motion";
import { MEMBER_COLORS, hexAlpha } from "@/lib/memberColors";

interface ColorPickerProps {
  value: string | null;
  onChange: (hex: string) => void;
  takenColors?: string[];
}

export default function ColorPicker({ value, onChange, takenColors = [] }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-3 justify-center">
      {MEMBER_COLORS.map((c) => {
        const taken = takenColors.includes(c.hex);
        const selected = value === c.hex;
        return (
          <motion.button
            key={c.id}
            type="button"
            disabled={taken}
            onClick={() => !taken && onChange(c.hex)}
            whileTap={taken ? {} : { scale: 0.88 }}
            title={taken ? `${c.label} (taken)` : c.label}
            className="relative w-11 h-11 rounded-full focus-visible:outline-none transition-opacity"
            style={{
              backgroundColor: taken ? hexAlpha(c.hex, 0.25) : c.hex,
              cursor: taken ? "not-allowed" : "pointer",
              boxShadow: selected
                ? `0 0 0 3px white, 0 0 0 5px ${c.hex}`
                : "none",
            }}
          >
            {/* Checkmark for selected */}
            {selected && (
              <motion.span
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="absolute inset-0 flex items-center justify-center"
              >
                <svg className="w-5 h-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.span>
            )}

            {/* Lock overlay for taken */}
            {taken && (
              <span className="absolute inset-0 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              </span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
