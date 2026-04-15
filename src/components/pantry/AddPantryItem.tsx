"use client";

import { useState, useRef } from "react";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { STORAGE_LOCATIONS, FRIDGE_ZONES, FOOD_CATEGORIES } from "@/types/database";

const UNITS = ["", "count", "kg", "g", "lbs", "oz", "L", "mL", "cups", "tbsp", "tsp"];

interface AddPantryItemProps {
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  members: MemberProfile[];
  currentUserId: string | null;
}

export default function AddPantryItem({ onAdd, members, currentUserId }: AddPantryItemProps) {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("");
  const [expanded, setExpanded] = useState(false);

  // New optional fields
  const [storageLocation, setStorageLocation] = useState<string>("");
  const [fridgeZone, setFridgeZone] = useState<string>("");
  const [foodCategory, setFoodCategory] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [assignedTo, setAssignedTo] = useState<string[]>([]); // empty = everyone

  const nameRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    onAdd(name.trim(), parseFloat(quantity) || 1, unit || undefined, {
      storageLocation: storageLocation || null,
      fridgeZone: storageLocation === "fridge" ? (fridgeZone || null) : null,
      foodCategory: foodCategory || null,
      expiresAt: expiresAt || null,
      assignedTo: assignedTo.length > 0 ? assignedTo : null,
    });

    setName("");
    setQuantity("1");
    setUnit("");
    setStorageLocation("");
    setFridgeZone("");
    setFoodCategory("");
    setExpiresAt("");
    setAssignedTo([]);
    nameRef.current?.focus();
  }

  function toggleMember(userId: string) {
    setAssignedTo((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  }

  const showMemberPicker = members.length >= 2;

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      {/* Name row */}
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
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col gap-3">
          {/* Quantity + unit */}
          <div className="flex items-center gap-2">
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
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-14 text-center text-sm font-medium text-gray-900 outline-none bg-transparent border border-gray-200 rounded-lg py-1"
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

          {/* Storage location */}
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1.5">Storage</p>
            <div className="flex flex-wrap gap-1.5">
              {STORAGE_LOCATIONS.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setStorageLocation(storageLocation === value ? "" : value);
                    if (value !== "fridge") setFridgeZone("");
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    storageLocation === value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Fridge zone (only when fridge selected) */}
          {storageLocation === "fridge" && (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1.5">Fridge zone</p>
              <div className="flex gap-1.5">
                {FRIDGE_ZONES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFridgeZone(fridgeZone === value ? "" : value)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      fridgeZone === value
                        ? "bg-blue-600 text-white"
                        : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Food category */}
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1.5">Category</p>
            <div className="flex flex-wrap gap-1.5">
              {FOOD_CATEGORIES.map(({ value, label, emoji }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFoodCategory(foodCategory === value ? "" : value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    foodCategory === value
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          </div>

          {/* Expiry date */}
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1.5">Expires</p>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
              className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1 outline-none w-full"
            />
          </div>

          {/* Owned by (only if household has ≥2 members) */}
          {showMemberPicker && (
            <div>
              <p className="text-xs text-gray-400 font-medium mb-1.5">For</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setAssignedTo([])}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    assignedTo.length === 0
                      ? "bg-gray-900 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  Everyone
                </button>
                {members.map((m) => {
                  const isMe = m.user_id === currentUserId;
                  const selected = assignedTo.includes(m.user_id);
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => toggleMember(m.user_id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                        selected
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {isMe ? "Me" : m.short_name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </form>
  );
}
