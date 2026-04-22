"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import { useItemSuggestions } from "@/hooks/useItemSuggestions";

interface ShoppingItemProps {
  item: ShoppingItemType;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, fields: Partial<Pick<ShoppingItemType, "name" | "quantity" | "unit" | "store" | "assigned_to">>) => void;
  members?: MemberProfile[];
  currentUserId?: string | null;
}

function getAssignedMembers(assignedTo: string[] | null, members: MemberProfile[]): MemberProfile[] {
  if (!assignedTo || assignedTo.length === 0) return [];
  if (assignedTo.length >= members.length && members.length > 0) return [];
  return assignedTo.flatMap((uid) => {
    const m = members.find((m) => m.user_id === uid);
    return m ? [m] : [];
  });
}

const CHECK_ANIMATION_MS = 850;

export default function ShoppingItem({
  item,
  onToggle,
  onDelete,
  onUpdate,
  members = [],
  currentUserId = null,
}: ShoppingItemProps) {
  const [checking, setChecking] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Edit state (seeded from item when sheet opens)
  const [editName, setEditName] = useState(item.name);
  const [editQty, setEditQty] = useState(item.quantity != null ? String(item.quantity) : "");
  const [editUnit, setEditUnit] = useState(item.unit ?? "");
  const [editStore, setEditStore] = useState(item.store ?? "");
  const [editAssigned, setEditAssigned] = useState<string[] | null>(item.assigned_to ?? null);

  const { getStores } = useItemSuggestions(item.household_id);
  const knownStores = getStores();
  const [customStoreMode, setCustomStoreMode] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Sync edit fields if item changes externally while sheet is closed
  useEffect(() => {
    if (!sheetOpen) {
      setEditName(item.name);
      setEditQty(item.quantity != null ? String(item.quantity) : "");
      setEditUnit(item.unit ?? "");
      setEditStore(item.store ?? "");
      setEditAssigned(item.assigned_to ?? null);
    }
  }, [item, sheetOpen]);

  // Body scroll lock
  useEffect(() => {
    if (sheetOpen) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [sheetOpen]);

  function openSheet() {
    if (item.completed || checking) return;
    setCustomStoreMode(!!item.store && !knownStores.includes(item.store));
    setSheetOpen(true);
    setTimeout(() => nameInputRef.current?.focus(), 80);
  }

  function closeSheet() { setSheetOpen(false); }

  function handleSave() {
    if (!onUpdate) return;
    const name = editName.trim();
    if (!name) return;
    onUpdate(item.id, {
      name,
      quantity: editQty ? parseFloat(editQty) : null,
      unit: editUnit.trim() || null,
      store: editStore.trim() || null,
      assigned_to: editAssigned,
    });
    closeSheet();
  }

  function toggleMember(userId: string) {
    setEditAssigned((prev) => {
      const current = prev ?? [];
      const next = current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId];
      return next.length === 0 ? null : next;
    });
  }

  function handleCheck() {
    if (checking) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
    if (item.completed) { onToggle(item.id); return; }
    setChecking(true);
    timerRef.current = setTimeout(() => { setChecking(false); onToggle(item.id); }, CHECK_ANIMATION_MS);
  }

  const isChecked = checking || item.completed;
  const assignedMembers = getAssignedMembers(item.assigned_to, members);

  // ── Swipe-to-delete ──────────────────────────────────────────────
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-72, -24], [1, 0]);
  const rowBg = useTransform(x, [-72, -20, 0], ["rgb(254,226,226)", "rgb(255,241,242)", "rgb(255,255,255)"]);

  // ── Edit sheet ───────────────────────────────────────────────────
  const sheet = (
    <AnimatePresence>
      {sheetOpen && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={closeSheet}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
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
              <h2 className="text-lg font-semibold text-gray-900 flex-1">Edit item</h2>
              <button
                type="button"
                onClick={closeSheet}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-5 pb-6 flex flex-col gap-4">

              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Item</p>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="w-full text-sm text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 transition-colors"
                />
              </div>

              {/* Qty + unit */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Quantity &amp; unit</p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="1"
                    step="any"
                    placeholder="Qty"
                    value={editQty}
                    onChange={(e) => setEditQty(e.target.value)}
                    className="w-20 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 text-center transition-colors"
                  />
                  <input
                    type="text"
                    placeholder="Unit (optional)"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 transition-colors"
                  />
                </div>
              </div>

              {/* Store */}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Store</p>
                <div className="flex flex-wrap gap-1.5">
                  {knownStores.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => { setEditStore(editStore === s ? "" : s); setCustomStoreMode(false); }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        editStore === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >{s}</button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setCustomStoreMode((v) => !v); if (customStoreMode) setEditStore(""); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                      customStoreMode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >{knownStores.length === 0 ? "Add store" : "+ New"}</button>
                </div>
                {customStoreMode && (
                  <input
                    type="text"
                    placeholder="Store name"
                    value={editStore}
                    onChange={(e) => setEditStore(e.target.value)}
                    autoFocus
                    className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 transition-colors"
                  />
                )}
              </div>

              {/* Assigned to */}
              {members.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">For</p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setEditAssigned(null)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                        !editAssigned || editAssigned.length === 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                    >
                      Everyone
                    </button>
                    {members.map((m) => {
                      const selected = !!editAssigned?.includes(m.user_id);
                      const color = m.color ?? DEFAULT_COLOR;
                      return (
                        <button
                          key={m.user_id}
                          type="button"
                          onClick={() => toggleMember(m.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                          style={selected ? { backgroundColor: color, color: "#fff" } : { backgroundColor: hexAlpha(color, 0.1), color }}
                        >
                          <span
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={selected ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: hexAlpha(color, 0.2) }}
                          >
                            {m.initials}
                          </span>
                          {m.user_id === currentUserId ? "Me" : m.short_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Save */}
              <button
                type="button"
                onClick={handleSave}
                disabled={!editName.trim()}
                className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-2xl disabled:opacity-30 active:scale-[0.98] transition-all mt-1"
              >
                Save changes
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={() => { onDelete(item.id); closeSheet(); }}
                className="text-sm text-gray-400 hover:text-red-500 transition-colors py-1 self-center active:opacity-60"
              >
                Remove from list
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0 }}
        transition={{
          opacity: { duration: 0.15 },
          height: { duration: 0.2, ease: [0.4, 0, 1, 1] },
          y: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
        }}
        className="relative overflow-hidden"
      >
        {/* ── Swipe delete reveal zone ── */}
        <motion.div
          style={{ opacity: deleteOpacity }}
          className="absolute right-0 inset-y-0 w-20 bg-red-500 flex items-center justify-center rounded-r-xl pointer-events-none"
          aria-hidden
        >
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </motion.div>

        {/* ── Swipeable row ── */}
        <motion.div
          drag={!isChecked ? "x" : false}
          dragConstraints={{ left: -80, right: 0 }}
          dragElastic={{ left: 0.12, right: 0 }}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) {
              if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
              onDelete(item.id);
            }
          }}
          style={{ x, backgroundColor: rowBg }}
          className="flex items-center gap-3 px-1 py-3 relative z-10"
        >
        {/* ── Checkbox ── */}
        <button
          onClick={handleCheck}
          className="flex-shrink-0 w-6 h-6 focus-visible:outline-none"
          aria-label={item.completed ? "Mark as not done" : "Mark as done"}
        >
          <motion.div
            animate={isChecked ? { backgroundColor: "#16a34a", borderColor: "#16a34a" } : { backgroundColor: "#ffffff", borderColor: "#d1d5db" }}
            transition={{ duration: 0.18 }}
            className="w-6 h-6 rounded-full border-2 flex items-center justify-center"
          >
            <AnimatePresence>
              {isChecked && (
                <motion.svg
                  key="check"
                  className="w-3.5 h-3.5 text-white overflow-visible"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                >
                  <motion.path
                    d="M2 7 L5.5 10.5 L12 4"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                  />
                </motion.svg>
              )}
            </AnimatePresence>
          </motion.div>
        </button>

        {/* ── Label — tap to edit ── */}
        <button
          type="button"
          onClick={openSheet}
          disabled={isChecked}
          className="flex-1 min-w-0 text-left relative"
        >
          <motion.p
            animate={{ opacity: isChecked ? 0.38 : 1 }}
            transition={{ duration: 0.2, delay: isChecked ? 0.12 : 0 }}
            className="text-sm font-medium text-gray-900 truncate"
          >
            {item.name}
            {item.quantity && item.quantity !== 1 && (
              <span className="text-gray-400 font-normal ml-1.5">
                ×{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
                {item.unit ? ` ${item.unit}` : ""}
              </span>
            )}
          </motion.p>

          {!isChecked && item.store && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{item.store}</p>
          )}

          {/* Strikethrough */}
          <AnimatePresence>
            {checking && (
              <motion.span
                key="strike"
                aria-hidden
                className="absolute inset-y-0 left-0 right-0 flex items-center pointer-events-none"
              >
                <motion.span
                  className="block h-px w-full bg-green-500 rounded-full origin-left"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.38, delay: 0.15, ease: [0.33, 1, 0.68, 1] }}
                />
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {/* ── Member avatars ── */}
        {assignedMembers.length > 0 && !isChecked && (
          <div className="flex -space-x-1 flex-shrink-0">
            {assignedMembers.map((m) => {
              const c = m.color ?? DEFAULT_COLOR;
              return (
                <span
                  key={m.user_id}
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ring-1 ring-white"
                  style={{ backgroundColor: hexAlpha(c, 0.18), color: c }}
                  title={m.short_name}
                >
                  {m.initials}
                </span>
              );
            })}
          </div>
        )}

        {/* ── Delete ── */}
        <motion.button
          animate={{ opacity: isChecked ? 0 : 1 }}
          transition={{ duration: 0.15 }}
          onClick={() => onDelete(item.id)}
          className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
          aria-label="Remove item"
          tabIndex={isChecked ? -1 : 0}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </motion.button>
        </motion.div>
      </motion.div>

      {mounted && createPortal(sheet, document.body)}
    </>
  );
}
