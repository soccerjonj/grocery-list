"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

interface PantryItemProps {
  item: PantryItemType;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onDelete: (id: string) => void;
  members: MemberProfile[];
  currentUserId: string | null;
}

// ── Expiry helpers ────────────────────────────────────────────────

function getExpiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  const diff = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

  if (diff < 0)
    return {
      label: diff === -1 ? "Yesterday" : `${Math.abs(diff)}d ago`,
      dot: "bg-red-500",
      text: "text-red-500",
      detail: diff === -1 ? "Expired yesterday" : `Expired ${Math.abs(diff)} days ago`,
      detailColor: "text-red-500",
    };
  if (diff === 0)
    return { label: "Today", dot: "bg-red-500", text: "text-red-500", detail: "Expires today", detailColor: "text-red-500" };
  if (diff === 1)
    return { label: "Tmw", dot: "bg-orange-400", text: "text-orange-500", detail: "Expires tomorrow", detailColor: "text-orange-500" };
  if (diff <= 3)
    return { label: `${diff}d`, dot: "bg-orange-400", text: "text-orange-500", detail: `Expires in ${diff} days`, detailColor: "text-orange-500" };
  if (diff <= 7)
    return { label: `${diff}d`, dot: "bg-yellow-400", text: "text-yellow-600", detail: `Expires in ${diff} days`, detailColor: "text-yellow-600" };

  const formatted = expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: formatted, dot: "bg-green-400", text: "text-green-600", detail: `Expires ${formatted}`, detailColor: "text-green-600" };
}

function getOwnerLabel(
  assignedTo: string[] | null,
  members: MemberProfile[],
  currentUserId: string | null
): string | null {
  if (!assignedTo || assignedTo.length === 0) return null;
  if (assignedTo.length >= members.length && members.length > 0) return null;
  if (assignedTo.length === 1) {
    if (assignedTo[0] === currentUserId) return "Mine";
    return members.find((m) => m.user_id === assignedTo[0])?.short_name ?? null;
  }
  return assignedTo
    .map((uid) => (uid === currentUserId ? "Me" : members.find((m) => m.user_id === uid)?.short_name ?? "?"))
    .join(" & ");
}

// ── Component ─────────────────────────────────────────────────────

export default function PantryItem({
  item,
  expanded,
  onToggleExpand,
  onUpdateQuantity,
  onDelete,
  members,
  currentUserId,
}: PantryItemProps) {
  const expiry = getExpiryBadge(item.expires_at);
  const category = FOOD_CATEGORIES.find((c) => c.value === item.food_category);
  const ownerLabel = getOwnerLabel(item.assigned_to, members, currentUserId);

  const qtyDisplay =
    item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toFixed(1);

  function increment() {
    onUpdateQuantity(item.id, item.quantity + 1);
  }
  function decrement() {
    const next = item.quantity - 1;
    if (next <= 0) onDelete(item.id);
    else onUpdateQuantity(item.id, next);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      {/* ── Compact row (always visible) ─────────────────────── */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left active:bg-gray-50 transition-colors"
      >
        {/* Name + owner */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
            {ownerLabel && (
              <span className="text-[10px] bg-indigo-50 text-indigo-400 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 leading-none">
                {ownerLabel}
              </span>
            )}
          </div>
        </div>

        {/* Right side: expiry dot + category + qty + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {expiry && (
            <span className={`text-xs font-medium ${expiry.text}`}>
              {expiry.label}
            </span>
          )}
          {category && (
            <span className="text-sm leading-none" title={category.label}>
              {category.emoji}
            </span>
          )}
          <span className="text-xs font-semibold text-gray-500 tabular-nums min-w-[1.5rem] text-right">
            ×{qtyDisplay}
            {item.unit ? (
              <span className="font-normal text-gray-400"> {item.unit}</span>
            ) : null}
          </span>
          <motion.svg
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ duration: 0.18 }}
            className="w-3.5 h-3.5 text-gray-300 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </motion.svg>
        </div>
      </button>

      {/* ── Expanded controls ────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="controls"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-50 px-4 pb-4 pt-3 flex flex-col items-center gap-3">
              {/* Expiry detail if present */}
              {expiry && (
                <p className={`text-xs font-medium ${expiry.detailColor}`}>
                  {expiry.detail}
                </p>
              )}

              {/* Big stepper */}
              <div className="flex items-center gap-5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={decrement}
                  className="w-14 h-14 rounded-2xl bg-gray-100 text-gray-700 flex items-center justify-center text-3xl leading-none font-light select-none"
                >
                  −
                </motion.button>

                <div className="w-20 text-center select-none">
                  <motion.p
                    key={qtyDisplay}
                    initial={{ scale: 1.25, opacity: 0.6 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="text-3xl font-bold text-gray-900 tabular-nums"
                  >
                    {qtyDisplay}
                  </motion.p>
                  {item.unit && (
                    <p className="text-xs text-gray-400 mt-0.5">{item.unit}</p>
                  )}
                </div>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={increment}
                  className="w-14 h-14 rounded-2xl bg-gray-900 text-white flex items-center justify-center text-3xl leading-none font-light select-none"
                >
                  +
                </motion.button>
              </div>

              {/* Remove */}
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="text-sm text-gray-400 hover:text-red-500 transition-colors py-1 px-3"
              >
                Remove from pantry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
