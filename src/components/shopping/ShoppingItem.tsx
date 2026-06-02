"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from "framer-motion";
import { useTheme } from "next-themes";
import type { ShoppingItem as ShoppingItemType } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import { useItemSuggestions } from "@/hooks/useItemSuggestions";
import AmountField from "@/components/ui/AmountField";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";

interface ShoppingItemProps {
  item: ShoppingItemType;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdate?: (id: string, fields: Partial<Pick<ShoppingItemType, "name" | "quantity" | "unit" | "store" | "notes" | "assigned_to">>) => void;
  members?: MemberProfile[];
  currentUserId?: string | null;
  /** Edit-surface chrome — "sheet" (mobile bottom sheet) or "rail" (desktop docked panel). */
  sheetVariant?: "sheet" | "rail";
  /** Whether this instance emits the edit surface. Desktop rows set false; the shared rail owns editing. */
  renderSheet?: boolean;
  /** When defined, overrides the local open state (the desktop rail forces this true). */
  controlledOpen?: boolean;
  /** Notified when the row requests open/close. Desktop routes this to selection instead of a local sheet. */
  onOpenChange?: (open: boolean) => void;
  /** Render only the edit surface, no row (used by the desktop rail instance). */
  hideRow?: boolean;
}

function getAssignedMembers(assignedTo: string[] | null, members: MemberProfile[]): MemberProfile[] {
  if (!assignedTo || assignedTo.length === 0) return [];
  if (assignedTo.length >= members.length && members.length > 0) return [];
  return assignedTo.flatMap((uid) => {
    const m = members.find((m) => m.user_id === uid);
    return m ? [m] : [];
  });
}

export default function ShoppingItem({
  item,
  onToggle,
  onDelete,
  onUpdate,
  members = [],
  currentUserId = null,
  sheetVariant = "sheet",
  renderSheet = true,
  controlledOpen,
  onOpenChange,
  hideRow = false,
}: ShoppingItemProps) {
  const [checking, setChecking] = useState(false);
  const [localSheetOpen, setLocalSheetOpen] = useState(false);
  // The rail forces open via controlledOpen; otherwise local state drives it.
  const sheetOpen = controlledOpen !== undefined ? controlledOpen : localSheetOpen;

  // Name is the one field we still buffer locally — we only commit on
  // blur / Enter so we don't fire a DB write per keystroke. Every other
  // field auto-saves on change (matching PantryItem's model — P1).
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.name);

  // Notes are debounced (same iOS-keyboard-blur trap as PantryItem M7).
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { getStores } = useItemSuggestions(item.household_id);
  const knownStores = getStores();
  const [customStoreMode, setCustomStoreMode] = useState(false);

  // Keep nameDraft in sync if the item updates externally while we
  // aren't actively editing it.
  useEffect(() => {
    if (!editingName) setNameDraft(item.name);
  }, [item.name, editingName]);

  useEffect(() => {
    if (!sheetOpen) setNotesDraft(item.notes ?? "");
  }, [item.notes, sheetOpen]);

  // Decide custom-store mode whenever the sheet opens.
  useEffect(() => {
    if (sheetOpen) {
      setCustomStoreMode(!!item.store && !knownStores.includes(item.store));
    }
  }, [sheetOpen, item.store, knownStores]);

  // Flush pending notes save when the sheet closes.
  function commitNotesNow(value: string) {
    if (!onUpdate) return;
    const trimmed = value.trim().slice(0, 150) || null;
    if (trimmed !== (item.notes ?? null)) onUpdate(item.id, { notes: trimmed });
  }
  function handleNotesChange(value: string) {
    const capped = value.slice(0, 150);
    setNotesDraft(capped);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => commitNotesNow(capped), 500);
  }
  useEffect(() => {
    if (sheetOpen) return;
    if (notesSaveTimer.current) {
      clearTimeout(notesSaveTimer.current);
      notesSaveTimer.current = null;
      commitNotesNow(notesDraft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);

  function openSheet() {
    if (item.completed || checking) return;
    // Desktop lifts selection to the parent (which fills the rail); mobile
    // opens its own local bottom sheet.
    if (onOpenChange) onOpenChange(true);
    else setLocalSheetOpen(true);
  }

  function closeSheet() {
    if (onOpenChange) onOpenChange(false);
    else setLocalSheetOpen(false);
  }

  function commitName() {
    setEditingName(false);
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === item.name) {
      setNameDraft(item.name);
      return;
    }
    onUpdate?.(item.id, { name: trimmed });
  }

  function toggleMember(userId: string) {
    if (!onUpdate) return;
    const current = item.assigned_to ?? [];
    const exists = current.includes(userId);
    const next = exists ? current.filter((id) => id !== userId) : [...current, userId];
    onUpdate(item.id, { assigned_to: next.length === 0 ? null : next });
  }

  function handleCheck() {
    if (checking) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
    if (item.completed) { onToggle(item.id); return; }
    // Persist the check-off IMMEDIATELY. The old code deferred the DB
    // write by CHECK_ANIMATION_MS so the in-place ripple could play first
    // — but if the phone locked or the app was backgrounded within that
    // window, the pending timer was killed and the check-off was silently
    // lost. (That's how a finished trip ended up empty with the "checked"
    // items back on the active list.) We now write right away; the ripple
    // still plays during the row's exit animation as the item reflows
    // into the Checked-off section.
    setChecking(true);
    onToggle(item.id);
  }

  const isChecked = checking || item.completed;
  const assignedMembers = getAssignedMembers(item.assigned_to, members);

  // ── Swipe-to-delete ──────────────────────────────────────────────
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-72, -24], [1, 0]);
  const rowBg = useTransform(
    x, [-72, -20, 0],
    isDark
      ? ["rgb(69,10,10)", "rgb(40,15,15)", "rgb(24,24,27)"]
      : ["rgb(254,226,226)", "rgb(255,241,242)", "rgb(255,255,255)"]
  );

  // ── Edit-sheet header meta (M7+M10): clean chip-style row with
  // avatar pills, no mid-sentence "·" separators. ─────────────────
  const headerMeta = (
    <>
      {item.quantity && item.quantity !== 1 && (
        <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
          ×{item.quantity % 1 === 0 ? item.quantity : item.quantity.toFixed(1)}
          {item.unit ? ` ${item.unit}` : ""}
        </span>
      )}
      {item.store && (
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {item.store}
        </span>
      )}
      {assignedMembers.length > 0 && (
        <div className="flex -space-x-1">
          {assignedMembers.map((m) => {
            const c = m.color ?? DEFAULT_COLOR;
            return (
              <span
                key={m.user_id}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ring-1 ring-white dark:ring-zinc-900"
                style={{ backgroundColor: hexAlpha(c, 0.18), color: c }}
                title={m.short_name}
              >
                {m.initials}
              </span>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <>
      {!hideRow && (
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
            } else {
              animate(x, 0, { type: "spring", stiffness: 500, damping: 36 });
            }
          }}
          style={{ x, backgroundColor: rowBg }}
          className="flex items-center gap-3 px-1 py-3 relative z-10"
        >
          {/* ── Checkbox ── */}
          <button
            onClick={handleCheck}
            className="relative flex-shrink-0 w-6 h-6 focus-visible:outline-none"
            aria-label={item.completed ? "Mark as not done" : "Mark as done"}
          >
            <AnimatePresence>
              {checking && (
                <motion.span
                  key="ripple"
                  className="absolute inset-0 rounded-full bg-green-400 pointer-events-none"
                  initial={{ scale: 1, opacity: 0.45 }}
                  animate={{ scale: 3.8, opacity: 0 }}
                  exit={{}}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              )}
            </AnimatePresence>

            <motion.div
              animate={isChecked ? {
                backgroundColor: "#16a34a",
                borderColor: "#16a34a",
                scale: checking ? [1, 1.24, 0.9, 1] : 1,
              } : {
                backgroundColor: isDark ? "#27272a" : "#ffffff",
                borderColor: isDark ? "#52525b" : "#d1d5db",
                scale: 1,
              }}
              transition={{
                backgroundColor: { duration: 0.2 },
                borderColor: { duration: 0.2 },
                scale: checking
                  ? { duration: 0.44, times: [0, 0.28, 0.65, 1], ease: "easeOut" }
                  : { duration: 0.18 },
              }}
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
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.5, opacity: 0 }}
                    transition={{ duration: 0.18, ease: [0.34, 1.56, 0.64, 1] }}
                  >
                    <motion.path
                      d="M2 7 L5.5 10.5 L12 4"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
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
              className="text-sm font-medium text-gray-900 dark:text-gray-50 truncate"
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
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{item.store}</p>
            )}
            {!isChecked && item.notes && (
              <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 italic">{item.notes}</p>
            )}

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
            className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
            aria-label="Remove item"
            tabIndex={isChecked ? -1 : 0}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </motion.button>
        </motion.div>
      </motion.div>
      )}

      {/* ── Edit surface (bottom sheet on mobile, docked rail on desktop).
           Suppressed when renderSheet is false — desktop rows delegate to a
           single shared rail instance. ────────────────────────────── */}
      {renderSheet && (
      <ItemSheet
        open={sheetOpen}
        onClose={closeSheet}
        variant={sheetVariant}
        header={
          <ItemSheetHeader
            title={item.name}
            meta={headerMeta}
            onClose={closeSheet}
            onEditTitle={() => { setNameDraft(item.name); setEditingName(true); }}
            editing={editingName}
            editValue={nameDraft}
            onEditChange={setNameDraft}
            onEditCommit={commitName}
            onEditCancel={() => { setNameDraft(item.name); setEditingName(false); }}
          />
        }
      >
        {/* Amount — auto-saves on change */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Amount</p>
          <AmountField
            quantity={item.quantity != null ? String(item.quantity) : ""}
            unit={item.unit ?? ""}
            onQuantityChange={(q) =>
              onUpdate?.(item.id, { quantity: q ? parseFloat(q) : null })
            }
            onUnitChange={(u) => onUpdate?.(item.id, { unit: u || null })}
            size="sm"
          />
        </div>

        {/* Store */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Store</p>
          <div className="flex flex-wrap gap-1.5">
            {knownStores.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setCustomStoreMode(false);
                  onUpdate?.(item.id, { store: item.store === s ? null : s });
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                  item.store === s
                    ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >
                {s}
              </button>
            ))}
            <button
              type="button"
              onClick={() => {
                if (customStoreMode) {
                  setCustomStoreMode(false);
                  if (item.store && !knownStores.includes(item.store)) {
                    onUpdate?.(item.id, { store: null });
                  }
                } else {
                  setCustomStoreMode(true);
                }
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                customStoreMode
                  ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
              }`}
            >
              {knownStores.length === 0 ? "Add store" : "+ New"}
            </button>
          </div>
          {customStoreMode && (
            <input
              type="text"
              placeholder="Store name"
              value={item.store ?? ""}
              onChange={(e) => onUpdate?.(item.id, { store: e.target.value || null })}
              autoFocus
              className="w-full text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors"
            />
          )}
        </div>

        {/* Notes — debounced save */}
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
            Note <span className="font-normal">(optional)</span>
          </p>
          <textarea
            placeholder="Brand, location, anything useful…"
            value={notesDraft}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={2}
            maxLength={150}
            className="w-full text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-300 dark:placeholder:text-gray-600 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors resize-none"
          />
          {/* Audit M9: only surface the counter in the final stretch. */}
          {notesDraft.length >= 130 && (
            <p className="text-[10px] text-right text-gray-400 dark:text-gray-500">
              {150 - notesDraft.length} left
            </p>
          )}
        </div>

        {/* Assigned to */}
        {members.length > 1 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-gray-400 dark:text-gray-500">For</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onUpdate?.(item.id, { assigned_to: null })}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                  !item.assigned_to || item.assigned_to.length === 0
                    ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                    : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
                }`}
              >
                Everyone
              </button>
              {members.map((m) => {
                const selected = !!item.assigned_to?.includes(m.user_id);
                const color = m.color ?? DEFAULT_COLOR;
                return (
                  <button
                    key={m.user_id}
                    type="button"
                    onClick={() => toggleMember(m.user_id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                    style={
                      selected
                        ? { backgroundColor: color, color: "#fff" }
                        : { backgroundColor: hexAlpha(color, 0.1), color }
                    }
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

        {/* Remove — uses the existing undo-toast on delete (see
            useShoppingFlow.deleteItem). */}
        <button
          type="button"
          onClick={() => { onDelete(item.id); closeSheet(); }}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-medium transition-colors active:scale-[0.97]"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Remove from list
        </button>
      </ItemSheet>
      )}
    </>
  );
}
