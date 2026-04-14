"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { PantryItem as PantryItemType } from "@/types/database";

interface PantryItemProps {
  item: PantryItemType;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}

export default function PantryItem({ item, onUpdateQuantity, onDelete }: PantryItemProps) {
  const [swipeOpen, setSwipeOpen] = useState(false);

  function increment() {
    onUpdateQuantity(item.id, item.quantity + 1);
  }

  function decrement() {
    const next = item.quantity - 1;
    if (next <= 0) {
      onDelete(item.id);
    } else {
      onUpdateQuantity(item.id, next);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3.5"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
        {item.notes && (
          <p className="text-xs text-gray-400 mt-0.5 truncate">{item.notes}</p>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={decrement}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-90 transition-all text-lg leading-none font-medium"
        >
          −
        </button>
        <span className="w-16 text-center text-sm font-semibold text-gray-900">
          {item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
          {item.unit ? (
            <span className="text-xs font-normal text-gray-400 ml-0.5">{item.unit}</span>
          ) : null}
        </span>
        <button
          onClick={increment}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 active:scale-90 transition-all text-lg leading-none font-medium"
        >
          +
        </button>
      </div>

      <button
        onClick={() => onDelete(item.id)}
        onTouchStart={() => setSwipeOpen(true)}
        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}
