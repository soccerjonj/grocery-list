"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES, STORAGE_LOCATIONS, FRIDGE_ZONES } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

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
    return { label: diff === -1 ? "Yesterday" : `${Math.abs(diff)}d ago`, text: "text-red-500", detail: diff === -1 ? "Expired yesterday" : `Expired ${Math.abs(diff)} days ago`, detailColor: "text-red-500", bg: "bg-red-50 border-red-200" };
  if (diff === 0)
    return { label: "Today", text: "text-red-500", detail: "Expires today", detailColor: "text-red-500", bg: "bg-red-50 border-red-200" };
  if (diff === 1)
    return { label: "Tmw", text: "text-red-500", detail: "Expires tomorrow", detailColor: "text-red-500", bg: "bg-red-50 border-red-200" };
  if (diff <= 7)
    return { label: `${diff}d`, text: "text-red-500", detail: `Expires in ${diff} days`, detailColor: "text-red-500", bg: "bg-red-50 border-red-200" };
  if (diff <= 28)
    return { label: `${diff}d`, text: "text-yellow-600", detail: `Expires in ${diff} days`, detailColor: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200" };
  if (diff >= 364)
    return { label: "1yr+", text: "text-green-500", detail: "Expires in over a year", detailColor: "text-green-500", bg: "bg-green-50 border-green-200" };
  const formatted = expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return { label: formatted, text: "text-green-600", detail: `Expires ${formatted}`, detailColor: "text-green-600", bg: "bg-green-50 border-green-200" };
}

interface OwnerInfo { label: string; color: string }

function getOwnerInfo(
  assignedTo: string[] | null,
  members: MemberProfile[],
  currentUserId: string | null
): OwnerInfo | null {
  if (!assignedTo || assignedTo.length === 0) return null;
  if (assignedTo.length >= members.length && members.length > 0) return null;
  if (assignedTo.length === 1) {
    const m = members.find((m) => m.user_id === assignedTo[0]);
    const label = assignedTo[0] === currentUserId ? "Mine" : (m?.short_name ?? null);
    if (!label) return null;
    return { label, color: m?.color ?? DEFAULT_COLOR };
  }
  const first = members.find((m) => m.user_id === assignedTo[0]);
  const label = assignedTo
    .map((uid) => (uid === currentUserId ? "Me" : members.find((m) => m.user_id === uid)?.short_name ?? "?"))
    .join(" & ");
  return { label, color: first?.color ?? DEFAULT_COLOR };
}

/** Returns member objects for assigned users, empty when assigned to everyone. */
function getAssignedMembers(assignedTo: string[] | null, members: MemberProfile[]): MemberProfile[] {
  if (!assignedTo || assignedTo.length === 0) return [];
  if (assignedTo.length >= members.length && members.length > 0) return [];
  return assignedTo.flatMap((uid) => {
    const m = members.find((m) => m.user_id === uid);
    return m ? [m] : [];
  });
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
  const [mounted, setMounted] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMounted(true), []);

  function triggerExit(type: "consume" | "delete") {
    onToggleExpand(); // close sheet first
    setConfirmDelete(false);
    setExitVariant(type);
    setTimeout(() => onDelete(item.id), type === "consume" ? 320 : 260);
  }

  async function handleAddToListAndRemove() {
    if (onAddToShoppingList) await onAddToShoppingList(item.name);
    triggerExit("consume");
  }

  useEffect(() => {
    if (!editingName) setEditName(item.name);
  }, [item.name, editingName]);

  useEffect(() => {
    if (!expanded) setConfirmDelete(false);
  }, [expanded]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [expanded]);

  const expiry = getExpiryBadge(item.expires_at);
  const ownerInfo = getOwnerInfo(item.assigned_to, members, currentUserId);
  const assignedMembers = getAssignedMembers(item.assigned_to, members);
  const qtyDisplay = item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toFixed(1);

  function increment() { onUpdateQuantity(item.id, item.quantity + 1); }

  function decrement() {
    if (item.quantity <= 1) {
      setConfirmDelete(true);
    } else {
      setFlashDecrement(true);
      setTimeout(() => setFlashDecrement(false), 500);
      onUpdateQuantity(item.id, item.quantity - 1);
    }
  }

  function handleSaveName() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== item.name) onUpdateItem(item.id, { name: trimmed });
    else setEditName(item.name);
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

  // ── Bottom sheet content ─────────────────────────────────────────
  const sheet = (
    <AnimatePresence>
      {expanded && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onToggleExpand}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 40 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[88vh] flex flex-col"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-2 pb-3 flex-shrink-0">
              <div className="flex-1 min-w-0">
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
                    className="w-full text-lg font-semibold text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:border-gray-400 transition-colors"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{item.name}</h2>
                    <button
                      type="button"
                      onClick={() => { setEditName(item.name); setEditingName(true); }}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors active:scale-90"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  {expiry && <span className={`text-xs font-medium ${expiry.text}`}>{expiry.detail}</span>}
                  {item.running_low && <span className="text-xs text-amber-500 font-medium">· Running low</span>}
                  {ownerInfo && (
                    <span className="text-xs font-medium" style={{ color: ownerInfo.color }}>{ownerInfo.label}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleExpand}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-5 pb-6 flex flex-col gap-5">

              {/* Quantity stepper */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex-1">Quantity</span>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={decrement}
                  animate={{
                    backgroundColor: flashDecrement ? "#dcfce7" : "#e5e7eb",
                    color: flashDecrement ? "#15803d" : "#374151",
                  }}
                  transition={{ duration: 0.15 }}
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-lg leading-none font-light select-none flex-shrink-0"
                >
                  −
                </motion.button>
                <div className="w-10 text-center select-none">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={qtyDisplay}
                      initial={{ scale: 1.2, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1, color: flashDecrement ? "#15803d" : "#111827" }}
                      transition={{ duration: 0.15, ease: "easeOut" }}
                      className="text-base font-bold tabular-nums"
                    >
                      {qtyDisplay}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  onClick={increment}
                  className="w-9 h-9 rounded-xl bg-gray-900 text-white flex items-center justify-center text-lg leading-none font-light select-none flex-shrink-0"
                >
                  +
                </motion.button>
              </div>

              {/* Quick actions */}
              <div className="flex flex-wrap gap-2">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onUpdateItem(item.id, { running_low: !item.running_low })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex-1 justify-center min-w-[90px] ${
                    item.running_low ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                  </svg>
                  {item.running_low ? "Running low" : "Mark low"}
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.94 }}
                  onClick={() => onUpdateItem(item.id, { opened: !item.opened })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors flex-1 justify-center min-w-[80px] ${
                    item.opened ? "bg-orange-100 text-orange-700 border border-orange-200" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {item.opened
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    }
                  </svg>
                  {item.opened ? "Opened" : "Sealed"}
                </motion.button>

                {onAddToShoppingList && (
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.94 }}
                    onClick={handleAddToList}
                    disabled={addedToList}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all flex-1 justify-center min-w-[90px] ${
                      addedToList ? "bg-green-100 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {addedToList ? (
                        <motion.span key="added" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                          Added!
                        </motion.span>
                      ) : (
                        <motion.span key="add" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" /></svg>
                          Add to list
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )}
              </div>

              {/* Expiry */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Expires</p>
                {item.expires_at ? (
                  <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 self-start border ${expiry?.bg ?? "bg-green-50 border-green-200"}`}>
                    <svg className={`w-3.5 h-3.5 flex-shrink-0 ${expiry?.detailColor ?? "text-green-600"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <label className={`relative text-xs font-medium cursor-pointer ${expiry?.detailColor ?? "text-green-700"}`}>
                      {formatDateDisplay(item.expires_at)}
                      <input type="date" value={item.expires_at ?? ""} onChange={(e) => onUpdateItem(item.id, { expires_at: e.target.value || null })} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                    </label>
                    <button type="button" onClick={() => onUpdateItem(item.id, { expires_at: null })} className={`${expiry?.detailColor ?? "text-green-600"} hover:opacity-70 transition-opacity ml-0.5`}>
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex items-center gap-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-xl px-3 py-1.5 text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors self-start cursor-pointer relative">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Set expiry date
                    <input type="date" value={item.expires_at ?? ""} onChange={(e) => onUpdateItem(item.id, { expires_at: e.target.value || null })} className="absolute inset-0 opacity-0 cursor-pointer w-full" />
                  </label>
                )}
              </div>

              {/* Storage */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Storage</p>
                <div className="flex flex-wrap gap-1.5">
                  {STORAGE_LOCATIONS.map(({ value, label }) => (
                    <button key={value} type="button"
                      onClick={() => onUpdateItem(item.id, { storage_location: item.storage_location === value ? null : value, fridge_zone: value !== "fridge" ? null : item.fridge_zone })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.storage_location === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Fridge zone */}
              <AnimatePresence>
                {item.storage_location === "fridge" && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden flex flex-col gap-1.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Fridge zone</p>
                    <div className="flex gap-1.5">
                      {FRIDGE_ZONES.map(({ value, label }) => (
                        <button key={value} type="button"
                          onClick={() => onUpdateItem(item.id, { fridge_zone: item.fridge_zone === value ? null : value })}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.fridge_zone === value ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
                        >{label}</button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Category */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Category</p>
                <div className="flex flex-wrap gap-1.5">
                  {FOOD_CATEGORIES.map(({ value, label }) => (
                    <button key={value} type="button"
                      onClick={() => onUpdateItem(item.id, { food_category: item.food_category === value ? null : value })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.food_category === value ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >{label}</button>
                  ))}
                </div>
              </div>

              {/* Assigned to */}
              {members.length > 1 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Assigned to</p>
                  <div className="flex gap-2 flex-wrap">
                    {/* "Everyone" chip */}
                    <button
                      type="button"
                      onClick={() => onUpdateItem(item.id, { assigned_to: null })}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        !item.assigned_to || item.assigned_to.length === 0
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Everyone
                    </button>
                    {members.map((member) => {
                      const selected = !!item.assigned_to?.includes(member.user_id);
                      const color = member.color ?? DEFAULT_COLOR;
                      function toggleMember() {
                        const current = item.assigned_to ?? [];
                        const next = selected
                          ? current.filter((id) => id !== member.user_id)
                          : [...current, member.user_id];
                        onUpdateItem(item.id, { assigned_to: next.length === 0 ? null : next });
                      }
                      return (
                        <button
                          key={member.user_id}
                          type="button"
                          onClick={toggleMember}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                          style={
                            selected
                              ? { backgroundColor: color, color: "#fff" }
                              : { backgroundColor: hexAlpha(color, 0.1), color }
                          }
                        >
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={selected ? { backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" } : { backgroundColor: hexAlpha(color, 0.2), color }}
                          >
                            {member.initials}
                          </span>
                          {member.user_id === currentUserId ? "Me" : member.short_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Delete confirmation */}
              <AnimatePresence>
                {confirmDelete && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                    <div className="bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3.5 flex flex-col gap-2">
                      <p className="text-sm font-semibold text-gray-800 text-center">Are you sure?</p>
                      <button type="button" onClick={() => { setConfirmDelete(false); onUpdateQuantity(item.id, Math.max(1, item.quantity - 1)); }}
                        className="w-full px-3 py-2.5 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-xl active:scale-[0.97] transition-all">
                        Just reduce the quantity
                      </button>
                      {onAddToShoppingList && (
                        <button type="button" onClick={handleAddToListAndRemove}
                          className="w-full px-3 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-xl active:scale-[0.97] transition-all">
                          Add to shopping list & remove
                        </button>
                      )}
                      <button type="button" onClick={() => triggerExit("delete")}
                        className="w-full px-3 py-2.5 text-red-500 text-sm font-medium active:opacity-60 transition-colors">
                        Remove from pantry
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(false)}
                        className="w-full px-3 py-1.5 text-gray-400 text-xs active:opacity-60 transition-colors">
                        Cancel
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Remove button — always shows confirm */}
              {!confirmDelete && (
                <button type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-red-50 text-red-500 text-sm font-medium hover:bg-red-100 transition-colors active:scale-[0.97]">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Remove from pantry
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* ── Compact card (always) ─────────────────────────────── */}
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={
          exitVariant === "consume"
            ? { opacity: 0, x: -52, scale: 0.93, backgroundColor: "#dcfce7" }
            : exitVariant === "delete"
            ? { opacity: 0, x: 52, scale: 0.93, backgroundColor: "#fee2e2" }
            : { opacity: 1, scale: 1, x: 0 }
        }
        exit={{ opacity: 0, scale: 0.9 }}
        transition={
          exitVariant
            ? { duration: exitVariant === "consume" ? 0.3 : 0.24, ease: [0.4, 0, 1, 1] }
            : { duration: 0.18, ease: "easeOut" }
        }
        className="bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer active:scale-[0.97] transition-transform"
        onClick={onToggleExpand}
      >
        <div className="p-3 flex flex-col gap-2 min-h-[76px]">
          <div className="flex items-start gap-1.5">
            {item.running_low && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0 mt-[3px]" />}
            <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2 flex-1">{item.name}</p>
            {assignedMembers.length > 0 && (
              <div className="flex -space-x-1 flex-shrink-0 mt-[1px]">
                {assignedMembers.slice(0, 2).map((m) => {
                  const c = m.color ?? DEFAULT_COLOR;
                  return (
                    <span
                      key={m.user_id}
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ring-1 ring-white"
                      style={{ backgroundColor: hexAlpha(c, 0.18), color: c }}
                      title={m.short_name}
                    >
                      {m.initials[0]}
                    </span>
                  );
                })}
                {assignedMembers.length > 2 && (
                  <span className="w-4 h-4 rounded-full bg-gray-100 ring-1 ring-white flex items-center justify-center text-[7px] font-bold text-gray-400">
                    +{assignedMembers.length - 2}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between mt-auto">
            <div className="flex items-center gap-1.5">
              {expiry
                ? <span className={`text-xs font-medium ${expiry.text}`}>{expiry.label}</span>
                : <span className="text-xs text-gray-300">—</span>
              }
              {item.opened && <span className="w-1 h-1 rounded-full bg-orange-300 flex-shrink-0" />}
            </div>
            <span className="text-xs font-semibold text-gray-400 tabular-nums">×{qtyDisplay}</span>
          </div>
        </div>
      </motion.div>

      {/* ── Bottom sheet (portal) ─────────────────────────────── */}
      {mounted && createPortal(sheet, document.body)}
    </>
  );
}
