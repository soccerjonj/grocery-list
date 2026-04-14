"use client";

import { useState, useRef } from "react";

interface AddShoppingItemProps {
  onAdd: (name: string, quantity?: number, unit?: string) => void;
}

export default function AddShoppingItem({ onAdd }: AddShoppingItemProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [expanded, setExpanded] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(
      name.trim(),
      quantity ? parseFloat(quantity) : undefined,
      unit || undefined
    );
    setName("");
    setQuantity("");
    setUnit("");
    nameRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 w-6 h-6 rounded-full border-2 border-dashed border-gray-300" />
        <input
          ref={nameRef}
          type="text"
          placeholder="Add to list..."
          value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setExpanded(true)}
          className="flex-1 text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="w-8 h-8 flex items-center justify-center bg-gray-900 text-white rounded-xl disabled:opacity-30 transition-opacity flex-shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
          <input
            type="number"
            min="1"
            step="1"
            placeholder="Qty"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="w-16 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none text-center"
          />
          <input
            type="text"
            placeholder="Unit (optional)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none"
          />
        </div>
      )}
    </form>
  );
}
