"use client";

import { AnimatePresence } from "framer-motion";
import PantryItem from "./PantryItem";
import AddPantryItem from "./AddPantryItem";
import Spinner from "@/components/ui/Spinner";
import type { PantryItem as PantryItemType } from "@/types/database";

interface PantryListProps {
  items: PantryItemType[];
  loading: boolean;
  onAdd: (name: string, quantity: number, unit?: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
}

export default function PantryList({
  items,
  loading,
  onAdd,
  onUpdateQuantity,
  onDelete,
}: PantryListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <AddPantryItem onAdd={onAdd} />

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <svg
            className="w-10 h-10 mx-auto mb-3 opacity-40"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4"
            />
          </svg>
          <p className="text-sm">Your pantry is empty</p>
          <p className="text-xs mt-1 opacity-60">Add items to track what you have</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {items.map((item) => (
              <PantryItem
                key={item.id}
                item={item}
                onUpdateQuantity={onUpdateQuantity}
                onDelete={onDelete}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
