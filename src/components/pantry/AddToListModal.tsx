"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useItemSuggestions } from "@/hooks/useItemSuggestions";
import { checkShoppingDuplicate, increaseShoppingQty } from "@/lib/checkShoppingDuplicate";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";

interface Props {
  itemName: string;
  householdId: string;
  members: MemberProfile[];
  currentUserId: string | null;
  onConfirm: (qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) => Promise<void>;
  onClose: () => void;
}

export default function AddToListModal({ itemName, householdId, members, currentUserId, onConfirm, onClose }: Props) {
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("");
  const [store, setStore] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [customStoreMode, setCustomStoreMode] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; quantity: number } | null>(null);
  const { getStores, saveStore } = useItemSuggestions(householdId);
  const knownStores = getStores();

  useEffect(() => { setMounted(true); }, []);

  function toggleMember(uid: string) {
    setAssignedTo((prev) => {
      const cur = prev ?? [];
      const next = cur.includes(uid) ? cur.filter((id) => id !== uid) : [...cur, uid];
      return next.length === 0 ? null : next;
    });
  }

  async function handleConfirm() {
    setSaving(true);
    const dup = await checkShoppingDuplicate(householdId, itemName);
    if (dup) { setDuplicate(dup); setSaving(false); return; }

    await onConfirm(qty ? parseFloat(qty) : null, unit.trim() || null, store.trim() || null, assignedTo);
    if (customStoreMode && store.trim()) saveStore(store.trim());
    setSaving(false);
    onClose();
  }

  async function handleIncreaseQty() {
    if (!duplicate) return;
    setSaving(true);
    await increaseShoppingQty(duplicate.id, duplicate.quantity, qty ? parseFloat(qty) : 1);
    setSaving(false);
    onClose();
  }

  const modal = (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-5"
        onClick={onClose}
      >
        <motion.div
          key="card"
          initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 36 }}
          className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 flex flex-col gap-4"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Add to shopping list</p>
              <p className="text-base font-semibold text-gray-900">{itemName}</p>
            </div>
            <button type="button" onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 text-gray-400 hover:bg-gray-200 transition-colors active:scale-90 flex-shrink-0 mt-0.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Duplicate warning */}
          {duplicate && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex flex-col gap-2">
              <p className="text-xs font-semibold text-amber-700">Already on the list (×{duplicate.quantity})</p>
              <p className="text-xs text-amber-600">Would you like to increase the quantity or add it again separately?</p>
              <div className="flex gap-2 mt-1">
                <button type="button" onClick={handleIncreaseQty} disabled={saving}
                  className="flex-1 py-2 bg-amber-500 text-white text-xs font-medium rounded-xl active:scale-[0.97] disabled:opacity-40"
                >Increase qty</button>
                <button type="button" onClick={async () => {
                  setDuplicate(null);
                  setSaving(true);
                  await onConfirm(qty ? parseFloat(qty) : null, unit.trim() || null, store.trim() || null, assignedTo);
                  setSaving(false);
                  onClose();
                }} disabled={saving}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 text-xs font-medium rounded-xl active:scale-[0.97] disabled:opacity-40"
                >Add anyway</button>
                <button type="button" onClick={() => setDuplicate(null)}
                  className="px-3 py-2 text-gray-400 text-xs active:opacity-60"
                >Cancel</button>
              </div>
            </div>
          )}

          {!duplicate && (
            <>
              {/* Qty + unit */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Quantity &amp; unit</p>
                <div className="flex gap-2">
                  <input type="number" min="1" step="any" placeholder="Qty" value={qty} onChange={(e) => setQty(e.target.value)}
                    className="w-20 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 text-center transition-colors" />
                  <input type="text" placeholder="Unit (optional)" value={unit} onChange={(e) => setUnit(e.target.value)}
                    className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 transition-colors" />
                </div>
              </div>

              {/* Store */}
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Store</p>
                <div className="flex flex-wrap gap-1.5">
                  {knownStores.map((s) => (
                    <button key={s} type="button"
                      onClick={() => { setStore(store === s ? "" : s); setCustomStoreMode(false); }}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${store === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >{s}</button>
                  ))}
                  <button type="button"
                    onClick={() => { setCustomStoreMode((v) => !v); if (customStoreMode) setStore(""); }}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${customStoreMode ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                  >{knownStores.length === 0 ? "Add store" : "+ New"}</button>
                </div>
                {customStoreMode && (
                  <div className="flex gap-2">
                    <input type="text" placeholder="Store name" value={store} onChange={(e) => setStore(e.target.value)} autoFocus
                      className="flex-1 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 outline-none focus:border-gray-400 transition-colors" />
                    {store.trim() && (
                      <button type="button" onClick={() => { saveStore(store.trim()); setCustomStoreMode(false); }}
                        className="px-3 py-1.5 rounded-xl bg-gray-900 text-white text-xs font-medium active:scale-[0.94]"
                      >Save</button>
                    )}
                  </div>
                )}
              </div>

              {/* Members */}
              {members.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">For</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setAssignedTo(null)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${!assignedTo || assignedTo.length === 0 ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                    >Everyone</button>
                    {members.map((m) => {
                      const selected = !!assignedTo?.includes(m.user_id);
                      const color = m.color ?? DEFAULT_COLOR;
                      return (
                        <button key={m.user_id} type="button" onClick={() => toggleMember(m.user_id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                          style={selected ? { backgroundColor: color, color: "#fff" } : { backgroundColor: hexAlpha(color, 0.1), color }}
                        >
                          <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                            style={selected ? { backgroundColor: "rgba(255,255,255,0.25)" } : { backgroundColor: hexAlpha(color, 0.2) }}
                          >{m.initials}</span>
                          {m.user_id === currentUserId ? "Me" : m.short_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button type="button" onClick={handleConfirm} disabled={saving}
                className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-2xl disabled:opacity-40 active:scale-[0.98] transition-all"
              >{saving ? "Checking…" : "Add to list"}</button>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );

  return mounted ? createPortal(modal, document.body) : null;
}
