"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES, STORAGE_LOCATIONS, FRIDGE_ZONES } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";

interface PantryItemProps {
  item: PantryItemType;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateItem: (id: string, fields: Partial<Omit<PantryItemType, "id" | "household_id" | "created_at" | "added_by">>) => void;
  onDelete: (id: string) => void;
  onAddToShoppingList?: (name: string) => Promise<boolean>;
  members: MemberProfile[];
  currentUserId: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────

function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getExpiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  const diff = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

  if (diff < 0)
    return { label: diff === -1 ? "Yesterday" : `${Math.abs(diff)}d ago`, dot: "bg-red-500", text: "text-red-500", detail: diff === -1 ? "Expired yesterday" : `Expired ${Math.abs(diff)} days ago`, detailColor: "text-red-500" };
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

function getOwnerLabel(assignedTo: string[] | null, members: MemberProfile[], currentUserId: string | null): string | null {
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
  onUpdateItem,
  onDelete,
  onAddToShoppingList,
  members,
  currentUserId,
}: PantryItemProps) {
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [flashDecrement, setFlashDecrement] = useState(false);
  const [exitVariant, setExitVariant] = useState<"consume" | "delete" | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  function triggerExit(type: "consume" | "delete") {
    setConfirmDelete(false);
    setExitVariant(type);
    setTimeout(() => onDelete(item.id), type === "consume" ? 320 : 260);
  }

  async function handleAddToListAndRemove() {
    if (onAddToShoppingList) await onAddToShoppingList(item.name);
    triggerExit("consume");
  }

  // Sync edit name if item name changes externally (realtime)
  useEffect(() => {
    if (!editingName) setEditName(item.name);
  }, [item.name, editingName]);

  // Reset confirm delete when collapsed
  useEffect(() => {
    if (!expanded) setConfirmDelete(false);
  }, [expanded]);

  const expiry = getExpiryBadge(item.expires_at);
  const category = FOOD_CATEGORIES.find((c) => c.value === item.food_category);
  const ownerLabel = getOwnerLabel(item.assigned_to, members, currentUserId);
  const qtyDisplay = item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toFixed(1);

  function increment() {
    onUpdateQuantity(item.id, item.quantity + 1);
  }

  function decrement() {
    if (item.quantity <= 1) {
      setConfirmDelete(true);
    } else {
      // Brief green flash on consume
      setFlashDecrement(true);
      setTimeout(() => setFlashDecrement(false), 500);
      onUpdateQuantity(item.id, item.quantity - 1);
    }
  }

  function handleSaveName() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== item.name) {
      onUpdateItem(item.id, { name: trimmed });
    } else {
      setEditName(item.name);
    }
    setEditingName(false);
  }

  async function handleAddToList() {
    if (!onAddToShoppingList) return;
    const ok = await onAddToShoppingList(item.name);
    if (ok) {
      setAddedToList(true);
      setTimeout(() => setAddedToList(false), 1500);
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={
        exitVariant === "consume"
          ? { opacity: 0, x: -52, scale: 0.93, backgroundColor: "#dcfce7" }
          : exitVariant === "delete"
          ? { opacity: 0, x: 52, scale: 0.93, backgroundColor: "#fee2e2" }
          : { opacity: 1, y: 0, x: 0, scale: 1 }
      }
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={
        exitVariant
          ? { duration: exitVariant === "consume" ? 0.3 : 0.24, ease: [0.4, 0, 1, 1] }
          : { duration: 0.2, ease: "easeOut" }
      }
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      {/* ── Compact row ──────────────────────────────────────── */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left active:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {item.running_low && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
            )}
            <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
            {item.opened && (
              <span className="text-[10px] bg-orange-50 text-orange-400 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 leading-none">
                Opened
              </span>
            )}
            {ownerLabel && (
              <span className="text-[10px] bg-indigo-50 text-indigo-400 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 leading-none">
                {ownerLabel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {expiry && <span className={`text-xs font-medium ${expiry.text}`}>{expiry.label}</span>}
          {category && <span className="text-xs text-gray-400">{category.label}</span>}
          <span className="text-xs font-semibold text-gray-500 tabular-nums min-w-[1.5rem] text-right">
            ×{qtyDisplay}
          </span>
          <motion.svg
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
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

      {/* ── Expanded detail panel ────────────────────────────── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expanded"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-50 px-4 pb-4 pt-3 flex flex-col gap-4">

              {/* Name edit */}
              <div className="flex items-center gap-2">
                {editingName ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { handleSaveName(); nameInputRef.current?.blur(); }
                      if (e.key === "Escape") { setEditName(item.name); setEditingName(false); }
                    }}
                    autoFocus
                    className="flex-1 text-sm font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-gray-400 transition-colors"
                  />
                ) : (
                  <p className="flex-1 text-sm font-semibold text-gray-900">{item.name}</p>
                )}
                <button
                  type="button"
                  onClick={() => { setEditName(item.name); setEditingName(true); }}
                  className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors active:scale-90"
                  aria-label="Edit name"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>

              {/* Expiry */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Expires</p>
                <input
                  ref={dateRef}
                  type="date"
                  value={item.expires_at ?? ""}
                  onChange={(e) => onUpdateItem(item.id, { expires_at: e.target.value || null })}
                  className="sr-only"
                />
                {item.expires_at ? (
                  <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 self-start border ${expiry ? `${expiry.detailColor === "text-red-500" ? "bg-red-50 border-red-200" : expiry.detailColor === "text-orange-500" ? "bg-orange-50 border-orange-200" : expiry.detailColor === "text-yellow-600" ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200"}` : "bg-green-50 border-green-200"}`}>
                    <svg className={`w-3.5 h-3.5 flex-shrink-0 ${expiry?.detailColor ?? "text-green-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <button
                      type="button"
                      onClick={() => dateRef.current?.showPicker?.()}
                      className={`text-xs font-medium ${expiry?.detailColor ?? "text-green-700"}`}
                    >
                      {formatDateDisplay(item.expires_at)}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateItem(item.id, { expires_at: null })}
                      className={`${expiry?.detailColor ?? "text-green-600"} hover:opacity-70 transition-opacity ml-0.5`}
                      aria-label="Clear date"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => dateRef.current?.showPicker?.()}
                    className="inline-flex items-center gap-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors self-start active:opacity-60"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Set expiry date
                  </button>
                )}
              </div>

              {/* Storage location */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Storage</p>
                <div className="flex flex-wrap gap-1.5">
                  {STORAGE_LOCATIONS.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        onUpdateItem(item.id, {
                          storage_location: item.storage_location === value ? null : value,
                          fridge_zone: value !== "fridge" ? null : item.fridge_zone,
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        item.storage_location === value
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fridge zone */}
              <AnimatePresence>
                {item.storage_location === "fridge" && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="overflow-hidden flex flex-col gap-1.5"
                  >
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fridge zone</p>
                    <div className="flex gap-1.5">
                      {FRIDGE_ZONES.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            onUpdateItem(item.id, {
                              fridge_zone: item.fridge_zone === value ? null : value,
                            })
                          }
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                            item.fridge_zone === value
                              ? "bg-blue-600 text-white"
                              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Food category */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {FOOD_CATEGORIES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        onUpdateItem(item.id, {
                          food_category: item.food_category === value ? null : value,
                        })
                      }
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        item.food_category === value
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Running low + Opened + Add to list */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Running low */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onUpdateItem(item.id, { running_low: !item.running_low })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex-1 justify-center min-w-[90px] ${
                    item.running_low
                      ? "bg-amber-100 text-amber-700 border border-amber-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  </svg>
                  {item.running_low ? "Running low" : "Mark low"}
                </motion.button>

                {/* Opened / Sealed */}
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onUpdateItem(item.id, { opened: !item.opened })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex-1 justify-center min-w-[80px] ${
                    item.opened
                      ? "bg-orange-100 text-orange-700 border border-orange-200"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {item.opened ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    )}
                  </svg>
                  {item.opened ? "Opened" : "Sealed"}
                </motion.button>

                {/* Add to shopping list */}
                {onAddToShoppingList && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={handleAddToList}
                    disabled={addedToList}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-1 justify-center min-w-[90px] ${
                      addedToList
                        ? "bg-green-100 text-green-700 border border-green-200"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {addedToList ? (
                        <motion.span
                          key="added"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Added!
                        </motion.span>
                      ) : (
                        <motion.span
                          key="add"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="flex items-center gap-1.5"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" />
                          </svg>
                          Add to list
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )}
              </div>

              {/* Quantity stepper */}
              <div className="flex items-center justify-center gap-5">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={decrement}
                  animate={{
                    backgroundColor: flashDecrement ? "#dcfce7" : "#f3f4f6",
                    color: flashDecrement ? "#15803d" : "#374151",
                  }}
                  transition={{ duration: 0.15 }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl leading-none font-light select-none"
                >
                  −
                </motion.button>

                <div className="w-20 text-center select-none">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={qtyDisplay}
                      initial={{ scale: 1.25, opacity: 0.5 }}
                      animate={{
                        scale: 1,
                        opacity: 1,
                        color: flashDecrement ? "#15803d" : "#111827",
                      }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="text-3xl font-bold tabular-nums"
                    >
                      {qtyDisplay}
                    </motion.p>
                  </AnimatePresence>
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

              {/* Delete confirmation */}
              <AnimatePresence>
                {confirmDelete && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                    className="overflow-hidden"
                  >
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3.5 flex flex-col gap-2">
                      <p className="text-sm font-semibold text-amber-800 text-center">Remove from pantry?</p>
                      <button
                        type="button"
                        onClick={() => { setConfirmDelete(false); onUpdateQuantity(item.id, 1); }}
                        className="w-full px-3 py-2 bg-white border border-gray-200 text-gray-700 text-xs font-medium rounded-xl hover:bg-gray-50 active:scale-[0.97] transition-all"
                      >
                        Keep (set to 1)
                      </button>
                      {onAddToShoppingList && (
                        <button
                          type="button"
                          onClick={handleAddToListAndRemove}
                          className="w-full px-3 py-2 bg-gray-900 text-white text-xs font-medium rounded-xl hover:bg-gray-700 active:scale-[0.97] transition-all"
                        >
                          Add to shopping list & remove
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => triggerExit("delete")}
                        className="w-full px-3 py-2 text-red-500 text-xs font-medium hover:text-red-700 active:opacity-60 transition-colors"
                      >
                        Remove from pantry
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Remove link */}
              {!confirmDelete && (
                <button
                  type="button"
                  onClick={() => {
                    if (item.quantity <= 1) {
                      setConfirmDelete(true);
                    } else {
                      triggerExit("delete");
                    }
                  }}
                  className="text-sm text-gray-400 hover:text-red-500 transition-colors py-1 px-3 active:opacity-60 self-center"
                >
                  Remove from pantry
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
