"use client";

import { Fragment, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import PantryItem from "./PantryItem";
import AddPantryItem from "./AddPantryItem";
import type { PantryItem as PantryItemType, Kind } from "@/types/database";
import { FOOD_CATEGORIES, SUPPLIES_CATEGORIES, SUPPLIES_LOCATIONS } from "@/types/database";
import type { AddPantryOptions } from "@/hooks/usePantry";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import AddToListModal from "./AddToListModal";
import SortFilterSheet, { type SortKey as SortFilterKey, type ViewLayout } from "./SortFilterSheet";
import { getPantryHint } from "@/lib/pantryHints";
import { useToast } from "@/context/ToastContext";

// Quick-add starter items shown on the empty state (audit M4). Picked
// to cover the most common household goods so a new user can populate
// their pantry with one tap each. pantryHints will auto-classify them
// into the right storage/category.
const STARTER_ITEMS: Record<Kind, string[]> = {
  food: ["Milk", "Eggs", "Bread", "Butter", "Cheese", "Apples", "Bananas", "Chicken", "Rice", "Pasta", "Yogurt", "Coffee"],
  supplies: ["Toilet paper", "Paper towels", "Toothpaste", "Dish soap", "Laundry detergent", "Trash bags", "Shampoo", "Hand soap"],
};

interface PantryListProps {
  items: PantryItemType[];
  loading: boolean;
  members: MemberProfile[];
  currentUserId: string | null;
  householdId: string;
  /** Active tab — owned by the parent so the page header can show kind tabs. */
  kind: Kind;
  /** Lets a horizontal swipe within the list switch tabs. */
  onKindChange?: (k: Kind) => void;
  /** Search text — owned by the parent (header has the input). Empty = no filter. */
  searchQuery: string;
  /** Called by the empty-state "Show all" affordance to clear parent search. */
  onClearSearch?: () => void;
  onAdd: (name: string, quantity: number, unit?: string, options?: AddPantryOptions) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateItem: (id: string, fields: Partial<Omit<PantryItemType, "id" | "household_id" | "created_at" | "added_by">>) => void;
  onDelete: (id: string) => void;
  onAddToShoppingList?: (name: string, quantity?: number | null, unit?: string | null, store?: string | null, assignedTo?: string[] | null, kind?: string | null) => Promise<boolean>;
}

type SortKey = SortFilterKey;

// Audit P2: dropped "Freshness" sort. It was a 6-tier hidden scoring
// algorithm that made the list look half-random because the rules
// weren't surfaced. Replaced with the "Use Soon" section at the top
// of the page (rendered below) — explicit & visible.
const FOOD_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",      label: "Name" },
  { key: "expiry",    label: "Expiry" },
  { key: "category",  label: "Category" },
  { key: "quantity",  label: "Quantity" },
];

// Supplies don't expire — fewer options
const SUPPLIES_SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "name",      label: "Name" },
  { key: "category",  label: "Category" },
  { key: "quantity",  label: "Quantity" },
];

function sortItems(items: PantryItemType[], sort: SortKey): PantryItemType[] {
  return [...items].sort((a, b) => {
    if (sort === "expiry") {
      if (!a.expires_at && !b.expires_at) return 0;
      if (!a.expires_at) return 1;
      if (!b.expires_at) return -1;
      return a.expires_at.localeCompare(b.expires_at);
    }
    if (sort === "name") return a.name.localeCompare(b.name);
    if (sort === "category") {
      const ca = a.food_category ?? "zzz";
      const cb = b.food_category ?? "zzz";
      return ca.localeCompare(cb) || a.name.localeCompare(b.name);
    }
    if (sort === "quantity") {
      if (a.quantity !== b.quantity) return b.quantity - a.quantity;
      return a.name.localeCompare(b.name);
    }
    return a.name.localeCompare(b.name);
  });
}

/** Days from today to the given ISO date string. Negative = past, 0 = today. */
function daysUntil(expiresAt: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

/** Items expiring within a week (or already expired) go in the Use Soon strip. */
function isUseSoon(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return daysUntil(expiresAt) <= 7;
}

function RunningLowRow({
  item,
  locationLabel,
  householdId,
  members,
  currentUserId,
  isFlashing,
  isDark,
  onIgnore,
  onAddedToList,
  onAddToList,
}: {
  item: PantryItemType;
  locationLabel: string | null;
  householdId: string;
  members: MemberProfile[];
  currentUserId: string | null;
  isFlashing: boolean;
  isDark: boolean;
  onIgnore: () => void;
  onAddedToList: () => void;
  onAddToList?: (qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) => Promise<boolean>;
}) {
  const [modalOpen, setModalOpen] = useState(false);

  async function handleConfirm(qty: number | null, unit: string | null, store: string | null, assignedTo: string[] | null) {
    if (!onAddToList) return;
    const ok = await onAddToList(qty, unit, store, assignedTo);
    if (ok) onAddedToList();
  }

  return (
    <>
      <motion.div
        animate={{
          backgroundColor: isDark
            ? isFlashing ? "rgb(5,36,17)"   : "rgb(28,16,3)"
            : isFlashing ? "#f0fdf4"         : "#fffbeb",
          borderColor: isDark
            ? isFlashing ? "rgb(22,101,52)"  : "rgb(120,53,15)"
            : isFlashing ? "#bbf7d0"         : "#fde68a",
        }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 border border-l-[3px] border-l-amber-500 dark:border-l-amber-600 rounded-xl px-3 py-2"
      >
        <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
          <p className={`text-xs font-semibold truncate transition-colors duration-250 ${isFlashing ? "text-green-600 dark:text-green-400" : "text-gray-800 dark:text-gray-200"}`}>
            {item.name}
          </p>
          {locationLabel && (
            <p className={`text-[10px] flex-shrink-0 transition-colors duration-250 ${isFlashing ? "text-green-500 dark:text-green-600" : "text-gray-400 dark:text-gray-500"}`}>
              {locationLabel}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isFlashing ? (
            <span className="text-[11px] font-medium px-2 py-1 rounded-lg bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400 flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              Added
            </span>
          ) : (
            <>
              {onAddToList && (
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className="text-[11px] font-medium px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-400 transition-all active:scale-95"
                >
                  + List
                </button>
              )}
              <button
                type="button"
                onClick={onIgnore}
                className="w-5 h-5 flex items-center justify-center rounded-md text-gray-300 dark:text-zinc-600 hover:text-gray-500 dark:hover:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors active:scale-90"
                aria-label="Dismiss"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </motion.div>

      {modalOpen && (
        <AddToListModal
          itemName={item.name}
          householdId={householdId}
          members={members}
          currentUserId={currentUserId}
          onConfirm={handleConfirm}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

interface SectionProps {
  label: string;
  items: PantryItemType[];
  members: MemberProfile[];
  currentUserId: string | null;
  householdId: string;
  sort: SortKey;
  expandedId: string | null;
  /** When true, this section subdivides fridge items by `fridge_zone`. Food only. */
  showFridgeZones?: boolean;
  /** Pantry item render variant — passed to each card. */
  layout: ViewLayout;
  /** Controlled open state — persisted at parent level (P4). */
  isOpen: boolean;
  onToggleOpen: () => void;
  /** Long-press handler: collapse all OTHER sections, leaving this one open. */
  onIsolate: () => void;
  /** Multi-select state (audit M1). */
  inMultiSelect: boolean;
  selectedIds: Set<string>;
  onSelectToggle: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onUpdateItem: (id: string, fields: Partial<Omit<PantryItemType, "id" | "household_id" | "created_at" | "added_by">>) => void;
  onDelete: (id: string) => void;
  onAddToShoppingList?: (name: string, quantity?: number | null, unit?: string | null, store?: string | null, assignedTo?: string[] | null, kind?: string | null) => Promise<boolean>;
}

function StorageSection({
  label,
  items,
  members,
  currentUserId,
  householdId,
  sort,
  expandedId,
  showFridgeZones = false,
  layout,
  isOpen,
  onToggleOpen,
  onIsolate,
  inMultiSelect,
  selectedIds,
  onSelectToggle,
  onToggleExpand,
  onUpdateQuantity,
  onUpdateItem,
  onDelete,
  onAddToShoppingList,
}: SectionProps) {
  const open = isOpen;
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  // Long-press the header → "show only this section" (P4 sub-feature).
  // Useful when the user only cares about the fridge today and has 50+
  // pantry items they don't want to scroll past.
  function startLongPress() {
    longPressFired.current = false;
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(20); } catch { /* ignore */ }
      }
      onIsolate();
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleHeaderClick() {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    onToggleOpen();
  }

  if (items.length === 0) return null;

  const isFridge = showFridgeZones && label === "Fridge";
  const quickUse = isFridge ? items.filter((i) => i.fridge_zone === "quick_use") : [];
  const longTerm  = isFridge ? items.filter((i) => i.fridge_zone === "long_term") : [];
  const unzoned   = isFridge ? items.filter((i) => !i.fridge_zone) : items;

  const itemProps = { members, currentUserId, householdId, onUpdateQuantity, onUpdateItem, onDelete, onAddToShoppingList, layout };

  function renderGrid(group: PantryItemType[]) {
    // Same 2-col grid for both layouts — list-layout items set
    // `gridColumn: span 2` on themselves so they fill the row.
    return (
      <div className={layout === "list" ? "flex flex-col gap-1.5" : "grid grid-cols-2 gap-2"}>
        <AnimatePresence mode="popLayout">
          {sortItems(group, sort).map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              expanded={expandedId === item.id}
              onToggleExpand={() => onToggleExpand(item.id)}
              inMultiSelect={inMultiSelect}
              selected={selectedIds.has(item.id)}
              onSelectToggle={() => onSelectToggle(item.id)}
              {...itemProps}
            />
          ))}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* Audit N7 — refined header: uppercase tracking, count right-aligned,
          smaller chevron. Less "chunky bold" and more iOS-section. */}
      <button
        onClick={handleHeaderClick}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onPointerCancel={cancelLongPress}
        className="flex items-center gap-1.5 py-0.5 w-full active:opacity-60 transition-opacity"
        title="Long-press to show only this section"
      >
        <motion.svg
          animate={{ rotate: open ? 90 : 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="w-2.5 h-2.5 text-gray-400 dark:text-zinc-500 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </motion.svg>
        <span className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-[10px] text-gray-300 dark:text-zinc-600 tabular-nums ml-auto">{items.length}</span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden pl-2"
          >
            {isFridge ? (
              <div className="flex flex-col gap-3">
                {quickUse.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider pl-1">Quick-use</p>
                    {renderGrid(quickUse)}
                  </div>
                )}
                {longTerm.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider pl-1">Long-term</p>
                    {renderGrid(longTerm)}
                  </div>
                )}
                {unzoned.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {(quickUse.length > 0 || longTerm.length > 0) && (
                      <p className="text-[10px] font-semibold text-gray-300 dark:text-gray-600 uppercase tracking-wider pl-1">General</p>
                    )}
                    {renderGrid(unzoned)}
                  </div>
                )}
              </div>
            ) : (
              renderGrid(unzoned)
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function PantryList({
  items,
  loading,
  members,
  currentUserId,
  householdId,
  kind,
  onKindChange,
  searchQuery,
  onClearSearch,
  onAdd,
  onUpdateQuantity,
  onUpdateItem,
  onDelete,
  onAddToShoppingList,
}: PantryListProps) {
  // Default sort is now "name" (predictable). Items needing attention
  // surface in the Use Soon and Running Low strips at the top.
  const [sort, setSort] = useState<SortKey>("name");
  useEffect(() => {
    // Supplies don't have "expiry" sort — fall back to name.
    // (We also defensively handle any legacy "freshness" value that may
    // have been persisted in some earlier version of the app.)
    if (kind === "supplies" && sort === "expiry") setSort("name");
    // The TS type no longer includes "freshness" but real-world state
    // might still carry it momentarily during the upgrade.
    if ((sort as string) === "freshness") setSort("name");
  }, [kind, sort]);

  const [filterCategory, setFilterCategory] = useState<string>("");
  // Reset category filter when switching tabs (categories differ between kinds)
  useEffect(() => { setFilterCategory(""); }, [kind]);

  // Card layout preference (P6) — persisted per household so users with
  // bigger inventories don't have to flip to list view every session.
  const VIEW_KEY = `pantry_view_${householdId}`;
  const [layout, setLayout] = useState<ViewLayout>("compact");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(VIEW_KEY);
    if (saved === "compact" || saved === "list") setLayout(saved);
  }, [VIEW_KEY]);
  function changeLayout(v: ViewLayout) {
    setLayout(v);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_KEY, v);
    }
  }

  // Sort & filter sheet (P3) — replaces the sticky chip bar that costs
  // ~36px of vertical real estate forever even though most users never
  // change the defaults.
  const [sortFilterOpen, setSortFilterOpen] = useState(false);

  // Section open state (P4) — persisted per household + kind so a user
  // who collapses Freezer today still has it collapsed tomorrow. Also
  // lets the parent implement "isolate this section" (long-press a
  // header → collapse all others).
  const SECTION_KEY = `pantry_sections_${householdId}_${kind}`;
  const [sectionOpen, setSectionOpen] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SECTION_KEY);
      setSectionOpen(raw ? JSON.parse(raw) : {});
    } catch {
      setSectionOpen({});
    }
  }, [SECTION_KEY]);
  function persistSectionState(next: Record<string, boolean>) {
    setSectionOpen(next);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(SECTION_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  }
  function toggleSection(label: string) {
    const currentlyOpen = sectionOpen[label] ?? true;
    persistSectionState({ ...sectionOpen, [label]: !currentlyOpen });
  }
  function isolateSection(label: string, allLabels: string[]) {
    const next: Record<string, boolean> = {};
    for (const l of allLabels) next[l] = l === label;
    persistSectionState(next);
  }

  // First-time tip: long-press → mark running low (audit M6). Shown once
  // per household, only after the user has enough items to make it a
  // useful gesture. Stored in localStorage so it doesn't nag.
  const { info: toastInfo } = useToast();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (items.length < 3) return;
    const HINT_KEY = `pantry_longpress_hint_${householdId}`;
    if (window.localStorage.getItem(HINT_KEY)) return;
    const timer = setTimeout(() => {
      toastInfo("Tip: long-press an item to mark it running low");
      window.localStorage.setItem(HINT_KEY, "1");
    }, 2500);
    return () => clearTimeout(timer);
  }, [items.length, householdId, toastInfo]);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Multi-select (audit M1). Entered via the "Select" button next to the
  // sort/filter pill. Cards show a check overlay; the action bar at the
  // top lets the user delete or mark running-low in bulk.
  const [inMultiSelect, setInMultiSelect] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  function enterSelect() {
    setInMultiSelect(true);
    setSelectedIds(new Set());
  }
  function exitSelect() {
    setInMultiSelect(false);
    setSelectedIds(new Set());
  }
  function toggleSelectItem(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Remove ${ids.length} item${ids.length === 1 ? "" : "s"} from your pantry?`)) return;
    for (const id of ids) await Promise.resolve(onDelete(id));
    exitSelect();
  }
  function bulkMarkRunningLow() {
    for (const id of selectedIds) onUpdateItem(id, { running_low: true });
    exitSelect();
  }
  // Exit select mode automatically when switching tabs.
  useEffect(() => { exitSelect(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [kind]);
  const [exitReasons, setExitReasons] = useState<Record<string, "dismiss" | "added">>({});
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set());
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const sortOptions = kind === "supplies" ? SUPPLIES_SORT_OPTIONS : FOOD_SORT_OPTIONS;
  const categoryOptions = kind === "supplies" ? SUPPLIES_CATEGORIES : FOOD_CATEGORIES;

  function dismissItem(id: string, reason: "dismiss" | "added") {
    setExitReasons((prev) => ({ ...prev, [id]: reason }));
    onUpdateItem(id, { running_low_dismissed: true });
  }

  function handleAddedToList(id: string) {
    setFlashingIds((prev) => new Set([...prev, id]));
    setTimeout(() => {
      setFlashingIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      dismissItem(id, "added");
    }, 600);
  }

  function handleToggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // ── Horizontal swipe between Food / Supplies tabs ────────────────────
  // Tracks a single-finger gesture and only commits a tab change when:
  //  – the touch is single-finger,
  //  – the start target is not inside a horizontal scroll container
  //    (e.g. the sort/filter chip bar — those need to scroll freely),
  //  – no sheet/modal is open (we read body.overflow as the signal),
  //  – horizontal motion clearly exceeds vertical,
  //  – distance ≥ SWIPE_DISTANCE OR a fast flick (velocity ≥ SWIPE_VELOCITY).
  const SWIPE_DISTANCE = 60;        // px
  const SWIPE_VELOCITY = 0.4;        // px/ms — flick threshold for a quick gesture
  const AXIS_LOCK_DISTANCE = 8;      // px — distance before we lock to an axis
  const AXIS_HORIZONTAL_RATIO = 1.3; // |dx| must exceed |dy| × this to be horizontal
  const swipeStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const swipeAxis = useRef<"none" | "horizontal" | "vertical">("none");

  function startsInHorizontalScroller(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      if (
        (style.overflowX === "auto" || style.overflowX === "scroll") &&
        el.scrollWidth > el.clientWidth + 1
      ) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function handleSwipeStart(e: React.TouchEvent) {
    if (!onKindChange) return;
    if (e.touches.length !== 1) return;
    if (document.body.style.overflow === "hidden") return;
    if (startsInHorizontalScroller(e.target)) return;
    const t = e.touches[0];
    swipeStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    swipeAxis.current = "none";
  }

  function handleSwipeMove(e: React.TouchEvent) {
    if (!swipeStart.current) return;
    const t = e.touches[0];
    const ax = Math.abs(t.clientX - swipeStart.current.x);
    const ay = Math.abs(t.clientY - swipeStart.current.y);
    if (swipeAxis.current === "none") {
      if (ax < AXIS_LOCK_DISTANCE && ay < AXIS_LOCK_DISTANCE) return;
      swipeAxis.current = ax > ay * AXIS_HORIZONTAL_RATIO ? "horizontal" : "vertical";
      if (swipeAxis.current === "vertical") {
        // Disengage so vertical scroll feels native and we don't fire on touchend
        swipeStart.current = null;
      }
    }
  }

  function handleSwipeEnd(e: React.TouchEvent) {
    if (!swipeStart.current || swipeAxis.current !== "horizontal") {
      swipeStart.current = null;
      swipeAxis.current = "none";
      return;
    }
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStart.current.x;
    const dt = Math.max(1, Date.now() - swipeStart.current.t);
    const velocity = Math.abs(dx) / dt;
    swipeStart.current = null;
    swipeAxis.current = "none";

    if (Math.abs(dx) < SWIPE_DISTANCE && velocity < SWIPE_VELOCITY) return;

    // dx < 0 means finger moved left — advance from Food → Supplies
    if (dx < 0 && kind === "food") {
      onKindChange?.("supplies");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(6); } catch { /* ignore */ }
      }
    } else if (dx > 0 && kind === "supplies") {
      onKindChange?.("food");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        try { navigator.vibrate(6); } catch { /* ignore */ }
      }
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-[52px] bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse" />
        <div className="grid grid-cols-2 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-28 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-100 dark:border-zinc-800 shadow-sm animate-pulse" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Partition by kind first — items without a kind default to 'food' for safety
  const kindFiltered = items.filter((i) => (i.kind ?? "food") === kind);

  const searched = searchQuery.trim()
    ? kindFiltered.filter((i) => i.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : kindFiltered;

  const filtered = filterCategory
    ? searched.filter((i) => i.food_category === filterCategory)
    : searched;

  // Running-low scoped to active tab so users only see what's relevant
  const runningLowItems = kindFiltered.filter((i) => i.running_low && !i.running_low_dismissed);
  const runningLowIds = new Set(runningLowItems.map((i) => i.id));

  // Audit P2: "Use Soon" strip — items expiring within a week (or already
  // expired). Surfaces them at the top of the list explicitly instead of
  // burying them in a hidden "freshness" sort algorithm. Excludes items
  // already in the Running Low strip (user's explicit signal wins).
  const useSoonItems = kind === "food"
    ? kindFiltered
        .filter((i) => isUseSoon(i.expires_at) && !runningLowIds.has(i.id))
        // Most urgent first
        .sort((a, b) => (a.expires_at ?? "").localeCompare(b.expires_at ?? ""))
    : [];
  const useSoonIds = new Set(useSoonItems.map((i) => i.id));

  // P5 + P2: items already shown in either attention strip should NOT
  // duplicate in their storage section. The strips are the canonical
  // "needs action" views; sections are inventory.
  const sectionItems = filtered.filter((i) => !runningLowIds.has(i.id) && !useSoonIds.has(i.id));

  // Food sections (only used when kind === 'food')
  const fridgeItems   = sectionItems.filter((i) => i.storage_location === "fridge");
  const freezerItems  = sectionItems.filter((i) => i.storage_location === "freezer");
  const pantryItems   = sectionItems.filter((i) => i.storage_location === "pantry");
  const roomTempItems = sectionItems.filter((i) => i.storage_location === "room_temp");

  // Supplies section bins, keyed by SUPPLIES_LOCATIONS values.
  // Items with null/unknown storage_location land in the "other" bin so they
  // never get hidden from the user. P5: running-low items already removed.
  const supplyKnown = new Set(SUPPLIES_LOCATIONS.map((l) => l.value as string));
  const suppliesByLocation = SUPPLIES_LOCATIONS.map((loc) => ({
    value: loc.value,
    label: loc.label,
    items: sectionItems.filter((i) => {
      // The "other" bin catches three cases: items explicitly placed there,
      // items with no location set, and items with a location we don't know
      // about (e.g. legacy food locations on a row that flipped to supplies).
      if (loc.value === "other") {
        return (
          i.storage_location === "other" ||
          !i.storage_location ||
          !supplyKnown.has(i.storage_location)
        );
      }
      return i.storage_location === loc.value;
    }),
  }));
  // Food sections use a fixed list above; "unsorted" food = no storage_location set
  const foodKnown = new Set(["fridge", "freezer", "pantry", "room_temp"]);
  const unsortedItems = sectionItems.filter(
    (i) => !i.storage_location || !foodKnown.has(i.storage_location)
  );

  // All section labels for the active kind — needed by `isolateSection`
  // to know which other sections to collapse.
  const allSectionLabels = kind === "food"
    ? ["Fridge", "Freezer", "Pantry", "Counter", "Other"]
    : SUPPLIES_LOCATIONS.map((l) => l.label);

  const hasItems = filtered.length > 0;

  const LOCATION_LABEL: Record<string, string> = {
    fridge: "Fridge", freezer: "Freezer", pantry: "Pantry", room_temp: "Counter",
    bathroom: "Bathroom", laundry: "Laundry", kitchen: "Kitchen", garage: "Garage", other: "Other",
  };

  const sectionProps = {
    members, currentUserId, householdId, sort, expandedId, layout,
    inMultiSelect, selectedIds, onSelectToggle: toggleSelectItem,
    onToggleExpand: handleToggleExpand, onUpdateQuantity, onUpdateItem, onDelete, onAddToShoppingList,
  };
  // Helper to build the controlled-section props for each <StorageSection>.
  function sectionControl(label: string) {
    return {
      isOpen: sectionOpen[label] ?? true,
      onToggleOpen: () => toggleSection(label),
      onIsolate: () => isolateSection(label, allSectionLabels),
    };
  }

  return (
    <div className="flex flex-col gap-3">
      <AddPantryItem onAdd={onAdd} members={members} currentUserId={currentUserId} householdId={householdId} existingNames={items.map((i) => i.name.toLowerCase())} kind={kind} />

      {/* Swipeable region — covers sort/filter row + sections + empty state.
          Excludes AddPantryItem above so input taps & drags work normally. */}
      <div
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
        onTouchCancel={handleSwipeEnd}
        className="flex flex-col gap-4"
      >

      {kindFiltered.length > 0 && (() => {
        // Audit P3: replaced the sticky horizontal chip bar (15+ items
        // sharing two concerns: sort vs filter) with a single small pill
        // that summarizes current state. Tap → opens the SortFilterSheet.
        // 95% of users never change defaults, so the pill is unobtrusive
        // by design and shows extra info only when the user has tweaked
        // something.
        const defaultSort: SortKey = "name";
        const sortLabel = sortOptions.find((s) => s.key === sort)?.label;
        const filterLabel = filterCategory
          ? categoryOptions.find((c) => c.value === filterCategory)?.label
          : null;
        const isDefault = sort === defaultSort && !filterCategory && layout === "compact";
        const pillText = isDefault
          ? "Sort & filter"
          : [
              sort !== defaultSort && sortLabel ? sortLabel : null,
              filterLabel,
              layout === "list" ? "List view" : null,
            ].filter(Boolean).join(" · ");
        return inMultiSelect ? (
          /* Multi-select action bar (audit M1) — replaces the pill row
             while the user is in selection mode. Sticky so actions are
             always reachable while scrolling. */
          <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-blue-50/95 dark:bg-blue-950/30 backdrop-blur-sm border-b border-blue-100 dark:border-blue-900/50 flex items-center gap-2">
            <button
              type="button"
              onClick={exitSelect}
              className="text-xs font-medium text-gray-600 dark:text-gray-300 active:opacity-60"
            >Cancel</button>
            <span className="flex-1 text-center text-xs font-semibold text-gray-800 dark:text-gray-100 tabular-nums">
              {selectedIds.size} selected
            </span>
            <button
              type="button"
              onClick={bulkMarkRunningLow}
              disabled={selectedIds.size === 0}
              className="text-xs font-medium px-2.5 py-1 rounded-lg text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/40 active:scale-95 transition-transform disabled:opacity-40"
            >Mark low</button>
            <button
              type="button"
              onClick={bulkDelete}
              disabled={selectedIds.size === 0}
              className="text-xs font-medium px-2.5 py-1 rounded-lg text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 active:scale-95 transition-transform disabled:opacity-40"
            >Delete</button>
          </div>
        ) : (
          <div className="sticky top-0 z-10 -mx-4 px-4 py-1 bg-gray-50/90 dark:bg-zinc-950/90 backdrop-blur-sm flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSortFilterOpen(true)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors active:scale-[0.96] ${
                isDefault
                  ? "bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400"
                  : "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              {pillText}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={enterSelect}
                className="text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-50 active:opacity-60 transition-colors"
              >Select</button>
              <span className="text-[11px] text-gray-400 dark:text-zinc-500 tabular-nums">
                {filtered.length} item{filtered.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        );
      })()}

      {!hasItems && kindFiltered.length === 0 ? (
        <div className="flex flex-col items-center py-10 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 dark:bg-zinc-800 flex items-center justify-center">
            {kind === "supplies" ? (
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M5 10V7a2 2 0 012-2h10a2 2 0 012 2v3M6 10v9a2 2 0 002 2h8a2 2 0 002-2v-9" />
              </svg>
            ) : (
              <svg className="w-8 h-8 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4" />
              </svg>
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              {kind === "supplies" ? "No supplies tracked yet" : "Your pantry is empty"}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Tap to add common items, or use the input above
            </p>
          </div>
          {/* Quick-add starter chips (audit M4). One tap → adds with auto-
              detected storage/category via pantryHints. */}
          <div className="flex flex-wrap justify-center gap-1.5 max-w-md mt-1 px-4">
            {STARTER_ITEMS[kind].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  const hint = getPantryHint(name);
                  onAdd(name, 1, undefined, {
                    kind: hint?.kind ?? kind,
                    storageLocation: hint?.storage_location ?? null,
                    fridgeZone: hint?.fridge_zone ?? null,
                    foodCategory: hint?.food_category ?? null,
                  });
                  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                    try { navigator.vibrate(8); } catch { /* ignore */ }
                  }
                }}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-zinc-500 hover:text-gray-900 dark:hover:text-gray-50 active:scale-95 transition-all"
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      ) : !hasItems ? (
        <div className="flex flex-col items-center py-10 gap-2">
          <p className="text-sm font-medium text-gray-400 dark:text-gray-500">
            {searchQuery ? `No results for "${searchQuery}"` : "Nothing in this category"}
          </p>
          <button
            onClick={() => { onClearSearch?.(); setFilterCategory(""); }}
            className="text-xs text-gray-400 dark:text-gray-500 underline underline-offset-2 active:opacity-60"
          >
            Show all
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">

          {/* ── Use Soon (audit P2) ─────────────────────────────
              Items expiring within 7 days (or already expired) get a
              dedicated strip at the top of the list. Replaces the
              old "Freshness" sort whose ordering was invisible logic. */}
          <AnimatePresence>
            {useSoonItems.length > 0 && (
              <motion.div
                key="use-soon"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-100 dark:bg-red-950/40 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold text-red-600 dark:text-red-400">Use soon</span>
                  <span className="text-xs text-red-400 dark:text-red-500 tabular-nums">({useSoonItems.length})</span>
                </div>
                <div className="flex flex-col gap-1">
                  {useSoonItems.map((item) => {
                    const d = item.expires_at ? daysUntil(item.expires_at) : 7;
                    const urgencyLabel = d < 0
                      ? (d === -1 ? "Expired yesterday" : `Expired ${Math.abs(d)} days ago`)
                      : d === 0 ? "Expires today"
                      : d === 1 ? "Expires tomorrow"
                      : `${d} days left`;
                    const locationLabel = LOCATION_LABEL[item.storage_location ?? ""] ?? null;
                    return (
                      <Fragment key={item.id}>
                        <button
                          type="button"
                          onClick={() => handleToggleExpand(item.id)}
                          className="flex items-center gap-2 border border-red-200 dark:border-red-900/50 border-l-[3px] border-l-red-500 rounded-xl px-3 py-2 bg-red-50/50 dark:bg-red-950/20 text-left active:scale-[0.99] transition-transform"
                        >
                          <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                            <p className="text-xs font-semibold truncate text-gray-800 dark:text-gray-200">
                              {item.name}
                            </p>
                            {locationLabel && (
                              <p className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">
                                {locationLabel}
                              </p>
                            )}
                          </div>
                          <span className="text-[11px] font-medium text-red-600 dark:text-red-400 flex-shrink-0">
                            {urgencyLabel}
                          </span>
                        </button>
                        {/* Hidden PantryItem instance: card suppressed, but
                            its bottom-sheet still attaches to expandedId so
                            tapping the row above opens the editor like
                            normal pantry items. Without this, Use Soon
                            items were filtered out of the sections below
                            and had no sheet mounted. */}
                        <PantryItem
                          item={item}
                          hideCard
                          expanded={expandedId === item.id}
                          onToggleExpand={() => handleToggleExpand(item.id)}
                          onUpdateQuantity={onUpdateQuantity}
                          onUpdateItem={onUpdateItem}
                          onDelete={onDelete}
                          onAddToShoppingList={onAddToShoppingList}
                          members={members}
                          currentUserId={currentUserId}
                          householdId={householdId}
                        />
                      </Fragment>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Running Low ─────────────────────────────────── */}
          <AnimatePresence>
            {runningLowItems.length > 0 && (
              <motion.div
                key="running-low"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                    <svg className="w-2.5 h-2.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2.25a.75.75 0 01.75.75v11.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM12 18a.75.75 0 100 1.5.75.75 0 000-1.5z" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold text-amber-600">Running low</span>
                  <span className="text-xs text-amber-400 tabular-nums">({runningLowItems.length})</span>
                  <button
                    type="button"
                    onClick={() => runningLowItems.forEach((i) => dismissItem(i.id, "dismiss"))}
                    className="ml-auto text-xs font-medium text-gray-400 hover:text-gray-600 transition-colors active:opacity-60"
                  >
                    Dismiss all
                  </button>
                </div>
                <div className="flex flex-col gap-1">
                  <AnimatePresence mode="popLayout">
                    {runningLowItems.map((item, index) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0, transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } }}
                        exit="exit"
                        custom={{ reason: exitReasons[item.id] ?? "dismiss", index }}
                        variants={{
                          exit: ({ reason, index: i }: { reason: string; index: number }) => ({
                            opacity: 0,
                            x: reason === "dismiss" ? 56 : 0,
                            y: reason === "added" ? -10 : 0,
                            scale: reason === "added" ? 0.93 : 1,
                            transition: {
                              duration: reason === "dismiss" ? 0.22 : 0.3,
                              delay: i * 0.07,
                              ease: [0.4, 0, 1, 1],
                            },
                          }),
                        }}
                      >
                        <RunningLowRow
                          item={item}
                          locationLabel={LOCATION_LABEL[item.storage_location ?? ""] ?? null}
                          isFlashing={flashingIds.has(item.id)}
                          isDark={isDark}
                          onIgnore={() => dismissItem(item.id, "dismiss")}
                          onAddedToList={() => handleAddedToList(item.id)}
                          members={members}
                          currentUserId={currentUserId}
                          householdId={householdId}
                          onAddToList={onAddToShoppingList ? (qty, unit, store, assignedTo) => onAddToShoppingList(item.name, qty, unit, store, assignedTo, item.kind ?? "food") : undefined}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {kind === "food" ? (
            <>
              <StorageSection label="Fridge"  items={fridgeItems}   showFridgeZones {...sectionProps} {...sectionControl("Fridge")} />
              <StorageSection label="Freezer" items={freezerItems}  {...sectionProps} {...sectionControl("Freezer")} />
              <StorageSection label="Pantry"  items={pantryItems}   {...sectionProps} {...sectionControl("Pantry")} />
              <StorageSection label="Counter" items={roomTempItems} {...sectionProps} {...sectionControl("Counter")} />
              {unsortedItems.length > 0 && (
                <StorageSection label="Other" items={unsortedItems} {...sectionProps} {...sectionControl("Other")} />
              )}
            </>
          ) : (
            <>
              {suppliesByLocation.map((bin) => (
                <StorageSection key={bin.value} label={bin.label} items={bin.items} {...sectionProps} {...sectionControl(bin.label)} />
              ))}
            </>
          )}
        </div>
      )}
      </div>

      <SortFilterSheet
        open={sortFilterOpen}
        onClose={() => setSortFilterOpen(false)}
        kind={kind}
        sort={sort}
        onSortChange={setSort}
        filterCategory={filterCategory}
        onFilterChange={setFilterCategory}
        view={layout}
        onViewChange={changeLayout}
        availableSorts={sortOptions}
      />
    </div>
  );
}
