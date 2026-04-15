"use client";

import { motion } from "framer-motion";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES, STORAGE_LOCATIONS } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

interface PantryItemProps {
  item: PantryItemType;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
  members: MemberProfile[];
  currentUserId: string | null;
}

function getExpiryInfo(expiresAt: string | null): {
  label: string;
  color: string;
} | null {
  if (!expiresAt) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  const diffDays = Math.round(
    (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) {
    return {
      label: diffDays === -1 ? "Expired yesterday" : `Expired ${Math.abs(diffDays)}d ago`,
      color: "bg-red-100 text-red-600",
    };
  }
  if (diffDays === 0) return { label: "Expires today", color: "bg-red-100 text-red-600" };
  if (diffDays === 1) return { label: "Tomorrow", color: "bg-orange-100 text-orange-600" };
  if (diffDays <= 3) return { label: `${diffDays} days`, color: "bg-orange-100 text-orange-600" };
  if (diffDays <= 7) return { label: `${diffDays} days`, color: "bg-yellow-100 text-yellow-700" };

  // Show month/day for further out
  const formatted = expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: formatted, color: "bg-green-50 text-green-700" };
}

function getOwnerLabel(
  assignedTo: string[] | null,
  members: MemberProfile[],
  currentUserId: string | null
): string | null {
  if (!assignedTo || assignedTo.length === 0) return null;
  if (assignedTo.length === members.length) return null; // everyone = no label

  if (assignedTo.length === 1) {
    if (assignedTo[0] === currentUserId) return "Mine";
    const m = members.find((m) => m.user_id === assignedTo[0]);
    return m?.short_name ?? null;
  }

  const names = assignedTo.map((uid) => {
    if (uid === currentUserId) return "Me";
    return members.find((m) => m.user_id === uid)?.short_name ?? "?";
  });
  return names.join(" & ");
}

export default function PantryItem({
  item,
  onUpdateQuantity,
  onDelete,
  members,
  currentUserId,
}: PantryItemProps) {
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

  const expiryInfo = getExpiryInfo(item.expires_at);
  const categoryInfo = FOOD_CATEGORIES.find((c) => c.value === item.food_category);
  const ownerLabel = getOwnerLabel(item.assigned_to, members, currentUserId);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex items-center gap-3 bg-white rounded-2xl border border-gray-100 px-4 py-3"
    >
      {/* Name + metadata */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
          {ownerLabel && (
            <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
              {ownerLabel}
            </span>
          )}
        </div>

        {/* Tags row */}
        {(expiryInfo || categoryInfo) && (
          <div className="flex items-center gap-1 mt-1 flex-wrap">
            {expiryInfo && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${expiryInfo.color}`}>
                {expiryInfo.label}
              </span>
            )}
            {categoryInfo && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                {categoryInfo.emoji} {categoryInfo.label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Quantity controls */}
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

      {/* Delete */}
      <button
        onClick={() => onDelete(item.id)}
        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}
