"use client";

import { motion } from "framer-motion";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";

interface ShoppingItemProps {
  item: ShoppingItemType;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function ShoppingItem({ item, onToggle, onDelete }: ShoppingItemProps) {
  function handleCheck() {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(8);
    }
    onToggle(item.id);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex items-center gap-3 px-1 py-1 overflow-hidden"
    >
      {/* Checkbox */}
      <button
        onClick={handleCheck}
        className="flex-shrink-0 w-6 h-6 relative focus-visible:outline-none"
        aria-label={item.completed ? "Mark as not done" : "Mark as done"}
      >
        <motion.div
          animate={item.completed ? { scale: [1, 1.15, 1] } : { scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors duration-200 ${
            item.completed
              ? "bg-gray-900 border-gray-900"
              : "bg-white border-gray-300 hover:border-gray-500"
          }`}
        >
          {item.completed && (
            <motion.svg
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 12 12"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <motion.path
                d="M2 6l3 3 5-5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
              />
            </motion.svg>
          )}
        </motion.div>
      </button>

      {/* Item text */}
      <div className="flex-1 min-w-0">
        <motion.p
          animate={item.completed ? { opacity: 0.4 } : { opacity: 1 }}
          transition={{ duration: 0.2 }}
          className={`text-sm font-medium text-gray-900 truncate transition-all duration-200 ${
            item.completed ? "line-through" : ""
          }`}
        >
          {item.name}
          {item.quantity && item.quantity !== 1 && (
            <span className="text-gray-400 font-normal ml-1.5">
              ×{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
              {item.unit ? ` ${item.unit}` : ""}
            </span>
          )}
        </motion.p>
      </div>

      {/* Delete button */}
      <button
        onClick={() => onDelete(item.id)}
        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
        aria-label="Remove item"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}
