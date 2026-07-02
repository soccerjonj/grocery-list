"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import type { PantryItem as PantryItemType } from "@/types/database";
import { FOOD_CATEGORIES, STORAGE_LOCATIONS, FRIDGE_ZONES, SUPPLIES_CATEGORIES, SUPPLIES_LOCATIONS } from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import AddToListModal from "./AddToListModal";
import AmountField from "@/components/ui/AmountField";
import ItemSheet, { ItemSheetHeader } from "@/components/ui/ItemSheet";

// Expiry preset offsets — chips that one-tap an "expires in N" date.
// (Audit M5.) Same idea as the suggested-expiry chip in AddPantryItem
// but with a small ladder of common windows for quick correction.
const EXPIRY_PRESETS: { label: string; days: number }[] = [
  { label: "+3 days",   days: 3 },
  { label: "+1 week",   days: 7 },
  { label: "+1 month",  days: 30 },
  { label: "+3 months", days: 90 },
];

function isoDateOffsetDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

interface PantryItemProps {
  item: PantryItemType;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateItem: (id: string, fields: Partial<Omit<PantryItemType, "id" | "household_id" | "created_at" | "added_by">>) => void;
  onDelete: (id: string) => void;
  onAddToShoppingList?: (name: string, quantity?: number | null, unit?: string | null, store?: string | null, assignedTo?: string[] | null, kind?: string | null) => Promise<boolean>;
  members: MemberProfile[];
  householdId: string;
  currentUserId: string | null;
  /** "compact" = 2-col tile (default); "list" = 1-row row with full name. */
  layout?: "compact" | "list";
  /** Multi-select mode props (audit M1). When inMultiSelect is true,
      tapping the card toggles selection instead of opening the sheet. */
  inMultiSelect?: boolean;
  selected?: boolean;
  onSelectToggle?: () => void;
  /**
   * When true, skip rendering the card body entirely — only the sheet
   * and confirm/add modals are emitted. The parent draws the visual
   * (e.g. the bespoke Use Soon strip row) and this instance is mounted
   * purely so that `expanded` can flip the sheet open. Without this,
   * items filtered out of the regular sections (Use Soon, Running Low)
   * have no PantryItem mounted and the sheet can't open.
   */
  hideCard?: boolean;
  /**
   * Chrome for the edit surface. "sheet" (default) = mobile bottom sheet
   * via portal. "rail" = desktop docked panel rendered inline (the parent
   * supplies the bordered/sticky column). Passed straight to <ItemSheet>.
   */
  sheetVariant?: "sheet" | "rail";
  /**
   * Whether this instance emits the edit surface at all. Defaults to true.
   * On desktop, grid cards set this false so they render card-only and a
   * single shared rail (a separate hideCard instance) owns editing.
   */
  renderSheet?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Returns a badge object suitable for at-a-glance display (card + sheet header).
 *
 * Audit M10: items expiring more than 90 days out are deliberately
 * unbadged — a green "1yr+" pill suggests freshness but is mostly noise
 * (shelf-stable items will permanently show it). Callers that want the
 * raw date for far-future items should read `item.expires_at` directly.
 */
function getExpiryBadge(expiresAt: string | null) {
  if (!expiresAt) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  const diff = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);

  if (diff < 0)
    return { label: diff === -1 ? "Yesterday" : `${Math.abs(diff)}d ago`, text: "text-red-500", detail: diff === -1 ? "Expired yesterday" : `Expired ${Math.abs(diff)} days ago` };
  if (diff === 0)
    return { label: "Today", text: "text-red-500", detail: "Expires today" };
  if (diff === 1)
    return { label: "Tmw", text: "text-red-500", detail: "Expires tomorrow" };
  if (diff <= 7)
    return { label: `${diff}d`, text: "text-red-500", detail: `Expires in ${diff} days` };
  if (diff <= 28)
    return { label: `${diff}d`, text: "text-yellow-600", detail: `Expires in ${diff} days` };
  if (diff <= 90) {
    const formatted = expiry.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { label: formatted, text: "text-green-600", detail: `Expires ${formatted}` };
  }
  // A year or more out: "1yr+". Quiet gray — so much shelf life left it's not
  // worth a color signal, and (since many staples are 1yr+) keeping it neutral
  // stops green from becoming noise that drowns out the genuinely-fresh items.
  if (diff >= 365)
    return { label: "1yr+", text: "text-gray-400 dark:text-gray-500", detail: "Expires in over a year" };
  // 91–364 days: still months out, so quiet gray like 1yr+. Green is reserved
  // for the ≤90-day "use it while it's good" window where it's actionable.
  const monthYear = expiry.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  return { label: monthYear, text: "text-gray-400 dark:text-gray-500", detail: `Expires ${monthYear}` };
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
  householdId,
  layout = "compact",
  inMultiSelect = false,
  selected = false,
  onSelectToggle,
  hideCard = false,
  sheetVariant = "sheet",
  renderSheet = true,
}: PantryItemProps) {
  const [editingName, setEditingName] = useState(false);
  const [editName, setEditName] = useState(item.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [addedToList, setAddedToList] = useState(false);
  const [flashDecrement, setFlashDecrement] = useState(false);
  const [exitVariant, setExitVariant] = useState<"consume" | "delete" | null>(null);
  const [mounted, setMounted] = useState(false);
  // Notes — controlled state with debounced save (audit M7). The old
  // approach used defaultValue + onBlur which lost edits when the iOS
  // keyboard dismissed without firing blur reliably.
  const [notesDraft, setNotesDraft] = useState(item.notes ?? "");
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  useEffect(() => setMounted(true), []);

  function triggerExit(type: "consume" | "delete") {
    onToggleExpand(); // close sheet first
    setConfirmDelete(false);
    setExitVariant(type);
    setTimeout(() => onDelete(item.id), type === "consume" ? 320 : 260);
  }

  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalIsDelete, setAddModalIsDelete] = useState(false);

  async function handleAddToListAndRemove() {
    setConfirmDelete(false);
    setAddModalIsDelete(true);
    setShowAddModal(true);
  }

  async function handleAddModalConfirm(qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) {
    // Capture success so "Add to list & remove" never removes the pantry
    // item when the shopping insert actually failed (previously the delete
    // ran unconditionally — a failed add silently destroyed the item).
    const ok = onAddToShoppingList
      ? await onAddToShoppingList(item.name, qty, unit, store, assignedTo, item.kind ?? "food")
      : false;
    setShowAddModal(false);
    if (addModalIsDelete) {
      if (ok) triggerExit("consume");
      // If the add failed, keep the pantry item — nothing is lost.
    } else if (ok) {
      setAddedToList(true);
      setTimeout(() => setAddedToList(false), 1500);
    }
    setAddModalIsDelete(false);
  }

  useEffect(() => {
    if (!editingName) setEditName(item.name);
  }, [item.name, editingName]);

  useEffect(() => {
    if (!expanded) setConfirmDelete(false);
  }, [expanded]);

  // Keep notesDraft in sync if the item's notes change externally (e.g.
  // another household member edits) while the sheet is closed.
  useEffect(() => {
    if (!expanded) setNotesDraft(item.notes ?? "");
  }, [item.notes, expanded]);

  // Debounced notes save (audit M7). Save 500ms after the user stops
  // typing — no more lost edits when iOS dismisses the keyboard without
  // firing onBlur. Also flush on unmount / sheet close.
  function commitNotesNow(value: string) {
    const trimmed = value.trim().slice(0, 150) || null;
    if (trimmed !== (item.notes ?? null)) onUpdateItem(item.id, { notes: trimmed });
  }
  function handleNotesChange(value: string) {
    const capped = value.slice(0, 150);
    setNotesDraft(capped);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => commitNotesNow(capped), 500);
  }
  // Flush pending notes save when the sheet closes.
  useEffect(() => {
    if (expanded) return;
    if (notesSaveTimer.current) {
      clearTimeout(notesSaveTimer.current);
      notesSaveTimer.current = null;
      commitNotesNow(notesDraft);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  // Body scroll lock is now handled inside <ItemSheet/>.

  const isSupplies = (item.kind ?? "food") === "supplies";
  const expiry = isSupplies ? null : getExpiryBadge(item.expires_at);
  const assignedMembers = getAssignedMembers(item.assigned_to, members);
  const qtyDisplay = item.quantity % 1 === 0 ? String(item.quantity) : item.quantity.toFixed(1);
  const locationOptions = isSupplies ? SUPPLIES_LOCATIONS : STORAGE_LOCATIONS;
  const categoryOptions = isSupplies ? SUPPLIES_CATEGORIES : FOOD_CATEGORIES;

  function increment() { onUpdateQuantity(item.id, item.quantity + 1); }

  /** Quick +1 from the card itself — bypasses opening the sheet (audit M2). */
  function handleQuickIncrement(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation();
    onUpdateQuantity(item.id, item.quantity + 1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(8); } catch { /* ignore */ }
    }
  }

  function decrement() {
    if (item.quantity <= 1) {
      setConfirmDelete(true);
    } else {
      setFlashDecrement(true);
      setTimeout(() => setFlashDecrement(false), 500);
      onUpdateQuantity(item.id, item.quantity - 1);
    }
  }

  function handleLongPressStart() {
    if (inMultiSelect) return; // No long-press in multi-select mode
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(30);
      onUpdateItem(item.id, { running_low: !item.running_low });
    }, 500);
  }

  function handleLongPressEnd() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  }

  function handleCardClick() {
    if (longPressFired.current) { longPressFired.current = false; return; }
    if (inMultiSelect) {
      onSelectToggle?.();
      return;
    }
    onToggleExpand();
  }

  function handleSaveName() {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== item.name) onUpdateItem(item.id, { name: trimmed });
    else setEditName(item.name);
    setEditingName(false);
  }

  function handleAddToList() {
    setShowAddModal(true);
  }

  // ── Bottom sheet content ─────────────────────────────────────────
  // Audit M7+M10: chip-style meta with avatar pills instead of text·dots.
  const headerMeta = (
    <>
      {expiry && (
        <span className={`text-[11px] font-semibold ${expiry.text}`}>
          {expiry.detail}
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

  // Audit M1: status toggles moved into the header as icon buttons.
  // Frees a whole row in the sheet body and gives them parity with the X.
  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => onUpdateItem(item.id, { running_low: !item.running_low })}
        aria-label={item.running_low ? "Mark as in stock" : "Mark as running low"}
        title={item.running_low ? "Running low" : "Mark as running low"}
        className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors active:scale-90 ${
          item.running_low
            ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
            : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 hover:text-gray-600"
        }`}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
        </svg>
      </button>
      {!isSupplies && (
        <button
          type="button"
          onClick={() => onUpdateItem(item.id, { opened: !item.opened })}
          aria-label={item.opened ? "Mark sealed" : "Mark opened"}
          title={item.opened ? "Opened" : "Sealed"}
          className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors active:scale-90 ${
            item.opened
              ? "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-400"
              : "bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 hover:text-gray-600"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {item.opened
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            }
          </svg>
        </button>
      )}
    </>
  );

  const sheet = (
    <ItemSheet
      open={expanded}
      onClose={onToggleExpand}
      variant={sheetVariant}
      header={
        <ItemSheetHeader
          title={item.name}
          meta={headerMeta}
          actions={headerActions}
          onClose={onToggleExpand}
          onEditTitle={() => { setEditName(item.name); setEditingName(true); }}
          editing={editingName}
          editValue={editName}
          onEditChange={setEditName}
          onEditCommit={handleSaveName}
          onEditCancel={() => { setEditName(item.name); setEditingName(false); }}
        />
      }
    >
      {/* Quantity (P3) — shared AmountField. Decrement at quantity 1
          opens the confirm-delete modal via onUnderflow. */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Quantity</p>
        <AmountField
          quantity={String(item.quantity)}
          unit={item.unit ?? ""}
          onQuantityChange={(q) => {
            const num = parseFloat(q);
            if (!isNaN(num) && num >= 1) onUpdateQuantity(item.id, num);
          }}
          onUnitChange={(u) => onUpdateItem(item.id, { unit: u || null })}
          size="md"
          min={1}
          onUnderflow={() => setConfirmDelete(true)}
        />
      </div>

      {/* Add to list (audit M1) — now a single full-width primary CTA
          since Mark low + Sealed/Opened moved to the header. */}
      {onAddToShoppingList && (
        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={handleAddToList}
          disabled={addedToList}
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl text-sm font-medium transition-colors ${
            addedToList
              ? "bg-green-100 text-green-700 border border-green-200"
              : "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-zinc-700"
          }`}
        >
          <AnimatePresence mode="wait" initial={false}>
            {addedToList ? (
              <motion.span key="added" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                Added to list
              </motion.span>
            ) : (
              <motion.span key="add" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z" /></svg>
                Add to shopping list
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      )}

      {/* Expiry — food only */}
      {!isSupplies && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Expires</p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={item.expires_at ?? ""}
              onChange={(e) => onUpdateItem(item.id, { expires_at: e.target.value || null })}
              className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors min-w-0"
            />
            {item.expires_at && (
              <button
                type="button"
                onClick={() => onUpdateItem(item.id, { expires_at: null })}
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 bg-red-50 dark:bg-red-950/30 text-red-400 text-xs font-medium rounded-xl hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors active:scale-[0.96]"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EXPIRY_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onUpdateItem(item.id, { expires_at: isoDateOffsetDays(p.days) })}
                className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 active:scale-[0.94] transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Storage + Fridge zone grouped — they're conceptually related
          so we use a tighter gap-3 internal cluster. (Section rhythm.) */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
            {isSupplies ? "Location" : "Storage"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {locationOptions.map(({ value, label }) => (
              <button key={value} type="button"
                onClick={() => onUpdateItem(item.id, { storage_location: item.storage_location === value ? null : value, fridge_zone: value !== "fridge" ? null : item.fridge_zone })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.storage_location === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
              >{label}</button>
            ))}
          </div>
        </div>

        {/* Fridge zone — food only, only when fridge is selected (M2:
            re-colored to match every other chip — was the only blue
            accent in the form). */}
        {!isSupplies && (
          <AnimatePresence initial={false}>
            {item.storage_location === "fridge" && (
              <motion.div key="fridge-zone" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} className="overflow-hidden flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Fridge zone</p>
                <div className="flex gap-1.5">
                  {FRIDGE_ZONES.map(({ value, label }) => (
                    <button key={value} type="button"
                      onClick={() => onUpdateItem(item.id, { fridge_zone: item.fridge_zone === value ? null : value })}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.fridge_zone === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
                    >{label}</button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      {/* Category */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Category</p>
        <div className="flex flex-wrap gap-1.5">
          {categoryOptions.map(({ value, label }) => (
            <button key={value} type="button"
              onClick={() => onUpdateItem(item.id, { food_category: item.food_category === value ? null : value })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${item.food_category === value ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"}`}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Assigned to */}
      {members.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500">Assigned to</p>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onUpdateItem(item.id, { assigned_to: null })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
                !item.assigned_to || item.assigned_to.length === 0
                  ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
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

      {/* Note */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-gray-400 dark:text-gray-500">
          Note <span className="font-normal">(optional)</span>
        </p>
        <textarea
          placeholder="Brand, location, anything useful…"
          value={notesDraft}
          onChange={(e) => handleNotesChange(e.target.value)}
          rows={2}
          maxLength={150}
          className="w-full text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-600 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors resize-none"
        />
        {/* Audit M9: only show the char counter when it actually matters
            (last 20 of 150) instead of jumping in halfway through. */}
        {notesDraft.length >= 130 && (
          <p className="text-[10px] text-right text-gray-400 dark:text-gray-500">
            {150 - notesDraft.length} left
          </p>
        )}
      </div>

      {/* Remove */}
      <button type="button"
        onClick={() => setConfirmDelete(true)}
        className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-sm font-medium transition-colors active:scale-[0.97]">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        Remove from pantry
      </button>
    </ItemSheet>
  );

  return (
    <>
      {/* ── Compact card (hidden when caller provides its own visual
           — e.g. the Use Soon strip on PantryList — and only mounts
           this PantryItem so the sheet can attach to expandedId.) ── */}
      {!hideCard && (
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
        style={{ gridColumn: layout === "list" ? "span 2" : "span 1" }}
        className={`relative bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden cursor-pointer active:scale-[0.97] transition-transform border ${
          selected
            ? "border-blue-500 ring-2 ring-blue-500/30"
            : "border-gray-100 dark:border-zinc-800"
        } ${item.running_low && !selected ? "border-l-[3px] border-l-amber-400" : ""}`}
        onClick={handleCardClick}
        onPointerDown={handleLongPressStart}
        onPointerUp={handleLongPressEnd}
        onPointerLeave={handleLongPressEnd}
        onPointerCancel={handleLongPressEnd}
      >
        {/* Selection check overlay (audit M1) — shown only in multi-select
            mode. Top-left so it doesn't compete with the member dots in
            the top-right. */}
        {inMultiSelect && (
          <span
            className={`absolute top-1.5 left-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center transition-colors ${
              selected ? "bg-blue-500 text-white" : "bg-white/90 dark:bg-zinc-800/90 border border-gray-300 dark:border-zinc-600"
            }`}
            aria-hidden
          >
            {selected && (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </span>
        )}
        {layout === "list" ? (
          /* List layout (audit P6) — single row, full name visible.
             Spans both grid columns so 2-col-grid pages render this as
             one row of items. */
          <div className="px-3 py-2.5 flex items-center gap-3">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-50 leading-snug flex-1 min-w-0 line-clamp-2">
              {item.name}
            </p>
            {expiry && (
              <span className={`text-xs font-medium flex-shrink-0 ${expiry.text}`}>{expiry.label}</span>
            )}
            {/* Tap to +1 (audit M2). stopPropagation so the card itself
                still opens the sheet on tap elsewhere. */}
            <button
              type="button"
              onClick={handleQuickIncrement}
              aria-label="Add one"
              className={`text-xs font-semibold tabular-nums flex-shrink-0 px-2 py-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all ${item.running_low ? "text-amber-500" : "text-gray-500 dark:text-gray-400"}`}
            >
              ×{qtyDisplay}
            </button>
            {assignedMembers.length > 0 && (
              <div className="flex -space-x-1 flex-shrink-0">
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
          </div>
        ) : (
          /* Compact card layout (default). Audit P1: dropped the bare
             "opened" (orange) and "notes" (blue) glance dots — they were
             unlabelled, present 5% of the time, and meaningless on first
             encounter. Those properties remain visible & editable in the
             bottom-sheet. Audit N4: dropped the fixed min-h. */
          <div className="p-3 flex flex-col gap-2">
            <div className="flex items-start gap-1.5">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-50 leading-snug line-clamp-2 flex-1">{item.name}</p>
              {assignedMembers.length > 0 && (
                <div className="flex -space-x-1 flex-shrink-0 mt-[1px]">
                  {assignedMembers.map((m) => {
                    const c = m.color ?? DEFAULT_COLOR;
                    return (
                      <span
                        key={m.user_id}
                        // Audit M9: bump from w-4/h-4 to w-5/h-5 and show full
                        // 2-char initials. With 3+ members the single-letter
                        // version was hard to disambiguate.
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
            </div>
            <div className="flex items-center justify-between mt-auto">
              {/* No expiry badge when there's no date — an empty slot reads
                  cleaner than a placeholder "—" (which looked like an error). */}
              {expiry
                ? <span className={`text-xs font-medium ${expiry.text}`}>{expiry.label}</span>
                : <span />
              }
              {/* Tap-to-+1 (audit M2). The rest of the card still opens
                  the sheet; this is the "just bought another" shortcut. */}
              <button
                type="button"
                onClick={handleQuickIncrement}
                aria-label="Add one"
                className={`text-xs font-semibold tabular-nums px-2 py-0.5 -mr-1 rounded-md hover:bg-gray-100 dark:hover:bg-zinc-800 active:scale-95 transition-all ${item.running_low ? "text-amber-500" : "text-gray-400"}`}
              >
                ×{qtyDisplay}
              </button>
            </div>
          </div>
        )}
      </motion.div>
      )}

      {/* ── Edit surface (bottom sheet or docked rail). Suppressed when
           renderSheet is false — desktop grid cards delegate editing to a
           single shared rail instance. ─────────────────────────── */}
      {renderSheet && sheet}

      {/* ── Confirm delete modal (portal) ────────────────────── */}
      {renderSheet && mounted && createPortal(
        <AnimatePresence>
          {confirmDelete && (
            <>
              <motion.div
                key="confirm-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[60] bg-black/50"
                onClick={() => setConfirmDelete(false)}
              />
              <motion.div
                key="confirm-modal"
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={{ type: "spring", stiffness: 420, damping: 36 }}
                className="fixed z-[61] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100vw-48px)] max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-5 flex flex-col gap-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-50">Remove item?</p>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-zinc-800 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors active:scale-90"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <p className="text-sm text-gray-400 dark:text-gray-500 -mt-1">What would you like to do with <span className="font-medium text-gray-600 dark:text-gray-300">{item.name}</span>?</p>

                <div className="flex flex-col gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => { setConfirmDelete(false); onUpdateQuantity(item.id, Math.max(1, item.quantity - 1)); }}
                    className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-2xl active:scale-[0.97] transition-all text-left"
                  >
                    Just reduce the quantity
                  </button>
                  {onAddToShoppingList && (
                    <button
                      type="button"
                      onClick={handleAddToListAndRemove}
                      className="w-full px-4 py-3 bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium rounded-2xl active:scale-[0.97] transition-all text-left"
                    >
                      Add to shopping list &amp; remove
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { setConfirmDelete(false); triggerExit("delete"); }}
                    className="w-full px-4 py-3 bg-red-50 text-red-500 text-sm font-medium rounded-2xl active:scale-[0.97] transition-all text-left"
                  >
                    Remove from pantry
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}

      {renderSheet && mounted && showAddModal && onAddToShoppingList && (
        <AddToListModal
          itemName={item.name}
          householdId={householdId}
          members={members}
          currentUserId={currentUserId}
          onConfirm={handleAddModalConfirm}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </>
  );
}
