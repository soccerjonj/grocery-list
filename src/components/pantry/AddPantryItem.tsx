"use client";

import { useState, useRef } from "react";

interface AddPantryItemProps {
  onAdd: (name: string, quantity: number, unit?: string) => void;
}

const UNITS = ["", "count", "kg", "g", "lbs", "oz", "L", "mL", "cups", "tbsp", "tsp"];

export default function AddPantryItem({ onAdd }: AddPantryItemProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [expanded, setExpanded] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim(), parseFloat(quantity) || 1, unit || undefined);
    setName("");
    setQuantity("1");
    setUnit("");
    nameRef.current?.focus();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <input
            ref={nameRef}
            type="text"
            placeholder="Add an item..."
            value={name}
            onChange={(e) => setName(e.target.value)}
            onFocus={() => setExpanded(true)}
            className="w-full text-sm text-gray-900 placeholder:text-gray-400 outline-none bg-transparent"
          />
        </div>
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setQuantity(String(Math.max(0.5, (parseFloat(quantity) || 1) - 1)))}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-lg leading-none"
            >
              −
            </button>
            <input
              type="number"
              min="0.1"
              step="0.5"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-14 text-center text-sm font-medium text-gray-900 outline-none bg-transparent"
            />
            <button
              type="button"
              onClick={() => setQuantity(String((parseFloat(quantity) || 1) + 1))}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors text-lg leading-none"
            >
              +
            </button>
          </div>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1 outline-none"
          >
            {UNITS.map((u) => (
              <option key={u} value={u}>{u || "unit"}</option>
            ))}
          </select>
        </div>
      )}
    </form>
  );
}
