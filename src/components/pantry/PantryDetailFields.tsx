"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FOOD_CATEGORIES, STORAGE_LOCATIONS, FRIDGE_ZONES,
  SUPPLIES_CATEGORIES, SUPPLIES_LOCATIONS,
} from "@/types/database";
import type { MemberProfile } from "@/hooks/useHouseholdMembers";
import { DEFAULT_COLOR, hexAlpha } from "@/lib/memberColors";
import { getExpiryDisplay, EXPIRY_PRESETS, isoDateOffsetDays } from "@/lib/expiry";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import AmountField from "@/components/ui/AmountField";
import AttributeTile from "./AttributeTile";
import FreshnessRing from "./FreshnessRing";

type AttrKey = "expires" | "storage" | "category" | "assigned" | "note";

export interface PantryDetailFieldsProps {
  kind: string;
  quantity: number;
  unit: string | null;
  storageLocation: string | null;
  fridgeZone: string | null;
  foodCategory: string | null;
  expiresAt: string | null;
  assignedTo: string[] | null;
  notes: string | null;
  onQuantityChange: (n: number) => void;
  onUnitChange: (u: string | null) => void;
  /** Parent is responsible for clearing fridge_zone when loc !== "fridge". */
  onStorageChange: (loc: string | null) => void;
  onFridgeZoneChange: (z: string | null) => void;
  onCategoryChange: (c: string | null) => void;
  onExpiresChange: (d: string | null) => void;
  onAssignedChange: (a: string[] | null) => void;
  onNotesChange: (n: string) => void;
  /** Decrement pressed at quantity 1 (edit sheet → confirm-delete). */
  onUnderflow?: () => void;
  members: MemberProfile[];
  currentUserId: string | null;
  /** Add flow only: suggested shelf-life offset for a one-tap expiry chip. */
  suggestedExpiryDays?: number | null;
}

const LABEL = "text-xs font-medium text-gray-400 dark:text-gray-500";
const chip = (active: boolean) =>
  `px-2.5 py-1 rounded-full text-xs font-medium transition-colors active:scale-[0.94] ${
    active
      ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
      : "bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700"
  }`;

// Display label: a built-in's label, else the raw stored value (which for a
// household custom IS the label). null only when nothing is set.
function labelFor(list: readonly { value: string; label: string }[], value: string | null) {
  if (!value) return null;
  return list.find((o) => o.value === value)?.label ?? value;
}

/**
 * A chip selector combining built-in options with the household's custom
 * ones, an inline "+ New" to add a custom pill (which persists + gets
 * selected), and an Edit toggle to delete customs — mirrors the custom-store
 * pattern. Built-ins store their slug value; customs store their label.
 */
function CustomPillGroup({
  options, custom, value, onSelect, onAddCustom, onRemoveCustom,
}: {
  options: readonly { value: string; label: string }[];
  custom: string[];
  value: string | null;
  onSelect: (v: string | null) => void;
  onAddCustom: (label: string) => Promise<string | null> | void;
  onRemoveCustom: (label: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);

  async function commit() {
    const label = draft.trim();
    setDraft("");
    setAdding(false);
    if (!label) return;
    const saved = await onAddCustom(label);
    onSelect(typeof saved === "string" ? saved : label);
  }

  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {options.map(({ value: v, label }) => (
        <button key={v} type="button" onClick={() => onSelect(value === v ? null : v)} className={chip(value === v)}>{label}</button>
      ))}
      {custom.map((label) => {
        const active = value === label;
        return (
          <span key={label} className={`inline-flex items-center gap-1 rounded-full ${active ? "bg-gray-900 dark:bg-zinc-100" : "bg-gray-100 dark:bg-zinc-800"} ${editing ? "pr-1" : ""}`}>
            <button type="button" onClick={() => onSelect(active ? null : label)}
              className={`pl-2.5 py-1 text-xs font-medium ${editing ? "" : "pr-2.5"} rounded-full ${active ? "text-white dark:text-zinc-900" : "text-gray-600 dark:text-gray-400"}`}>{label}</button>
            {editing && (
              <button type="button" onClick={() => onRemoveCustom(label)} aria-label={`Delete ${label}`}
                className={`w-4 h-4 flex items-center justify-center rounded-full ${active ? "text-white/70 hover:text-white" : "text-gray-400 hover:text-red-500"}`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </span>
        );
      })}
      {adding ? (
        <input
          autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 30))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") { setDraft(""); setAdding(false); } }}
          placeholder="New…"
          className="w-24 px-2.5 py-1 rounded-full text-xs bg-white dark:bg-zinc-900 border border-gray-300 dark:border-zinc-600 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-500"
        />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="px-2.5 py-1 rounded-full text-xs font-medium border border-dashed border-gray-300 dark:border-zinc-600 text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-zinc-500 active:scale-[0.94] transition-colors">+ New</button>
      )}
      {custom.length > 0 && (
        <button type="button" onClick={() => setEditing((v) => !v)} className="px-2 py-1 rounded-full text-[11px] font-medium text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300">
          {editing ? "Done" : "Edit"}
        </button>
      )}
    </div>
  );
}

export default function PantryDetailFields(p: PantryDetailFieldsProps) {
  const { taxonomy } = useHouseholdData();
  const isSupplies = (p.kind ?? "food") === "supplies";
  const locationOptions = isSupplies ? SUPPLIES_LOCATIONS : STORAGE_LOCATIONS;
  const categoryOptions = isSupplies ? SUPPLIES_CATEGORIES : FOOD_CATEGORIES;

  const [openAttr, setOpenAttr] = useState<AttrKey | null>(null);
  const toggle = (k: AttrKey) => setOpenAttr((cur) => (cur === k ? null : k));

  // Local note draft so the textarea stays responsive while the parent
  // debounces / persists via onNotesChange.
  const [noteDraft, setNoteDraft] = useState(p.notes ?? "");
  useEffect(() => {
    if (openAttr !== "note") setNoteDraft(p.notes ?? "");
  }, [p.notes, openAttr]);

  // ── Tile value displays ────────────────────────────────────────────
  const exp = getExpiryDisplay(p.expiresAt);
  const storageLabel = labelFor(locationOptions, p.storageLocation);
  const zoneLabel = !isSupplies && p.storageLocation === "fridge"
    ? labelFor(FRIDGE_ZONES, p.fridgeZone) : null;
  const categoryLabel = labelFor(categoryOptions, p.foodCategory);

  const assignedMembers = (() => {
    const a = p.assignedTo;
    if (!a || a.length === 0) return [];
    if (a.length >= p.members.length && p.members.length > 0) return [];
    return a.flatMap((uid) => { const m = p.members.find((x) => x.user_id === uid); return m ? [m] : []; });
  })();
  const isEveryone = assignedMembers.length === 0;

  const muted = "text-sm text-gray-300 dark:text-zinc-600";

  return (
    <div className="flex flex-col gap-4">
      {/* Quantity — prominent hero block */}
      <div className="rounded-2xl bg-gray-50 dark:bg-zinc-800/50 px-4 py-3 flex flex-col gap-2.5">
        <span className={LABEL}>Quantity</span>
        <AmountField
          quantity={String(p.quantity)}
          unit={p.unit ?? ""}
          onQuantityChange={(q) => { const n = parseFloat(q); if (!isNaN(n) && n >= 1) p.onQuantityChange(n); }}
          onUnitChange={(u) => p.onUnitChange(u || null)}
          size="md"
          min={1}
          onUnderflow={p.onUnderflow}
        />
      </div>

      {/* Attribute tile grid */}
      <div className="grid grid-cols-2 gap-2">
        {!isSupplies && (
          <AttributeTile
            label="Expires" open={openAttr === "expires"} onClick={() => toggle("expires")}
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            value={
              <div className="flex items-center gap-2.5">
                <FreshnessRing expiresAt={p.expiresAt} />
                <span className={`text-sm font-medium ${p.expiresAt ? exp.textClass : "text-gray-400 dark:text-gray-500"}`}>
                  {p.expiresAt ? exp.label : "No date"}
                </span>
              </div>
            }
          />
        )}

        <AttributeTile
          label={isSupplies ? "Location" : "Storage"} open={openAttr === "storage"} onClick={() => toggle("storage")}
          icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
          value={
            storageLabel
              ? <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{storageLabel}{zoneLabel ? <span className="text-gray-400 dark:text-gray-500"> · {zoneLabel}</span> : null}</span>
              : <span className={muted}>Anywhere</span>
          }
        />

        <AttributeTile
          label="Category" open={openAttr === "category"} onClick={() => toggle("category")}
          icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M7 3h5a2 2 0 011.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A2 2 0 013 11V6a3 3 0 013-3z" /></svg>}
          value={
            categoryLabel
              ? <span className="inline-block text-xs font-medium px-2.5 py-1 rounded-full bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900">{categoryLabel}</span>
              : <span className={muted}>None</span>
          }
        />

        {p.members.length > 1 && (
          <AttributeTile
            label="Assigned" open={openAttr === "assigned"} onClick={() => toggle("assigned")}
            icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4z" /></svg>}
            value={
              isEveryone
                ? <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Everyone</span>
                : (
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1">
                      {assignedMembers.map((m) => { const c = m.color ?? DEFAULT_COLOR; return (
                        <span key={m.user_id} className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-1 ring-white dark:ring-zinc-900" style={{ backgroundColor: hexAlpha(c, 0.18), color: c }}>{m.initials}</span>
                      ); })}
                    </div>
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                      {assignedMembers.map((m) => m.user_id === p.currentUserId ? "Me" : m.short_name).join(", ")}
                    </span>
                  </div>
                )
            }
          />
        )}

        <AttributeTile
          wide label="Note" open={openAttr === "note"} onClick={() => toggle("note")}
          icon={<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>}
          value={
            p.notes?.trim()
              ? <span className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 leading-snug">{p.notes}</span>
              : <span className={muted}>Add a note</span>
          }
        />
      </div>

      {/* Inline editor for the open tile */}
      <AnimatePresence initial={false}>
        {openAttr && (
          <motion.div
            key={openAttr}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3.5 flex flex-col gap-3">

              {openAttr === "expires" && !isSupplies && (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={p.expiresAt ?? ""}
                      onChange={(e) => p.onExpiresChange(e.target.value || null)}
                      className="flex-1 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors min-w-0"
                    />
                    {p.expiresAt && (
                      <button type="button" onClick={() => p.onExpiresChange(null)} className="flex-shrink-0 px-3 py-2.5 bg-red-50 dark:bg-red-950/30 text-red-400 text-xs font-medium rounded-xl hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors active:scale-[0.96]">Clear</button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.suggestedExpiryDays ? (
                      <button type="button" onClick={() => p.onExpiresChange(isoDateOffsetDays(p.suggestedExpiryDays!))}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 active:scale-[0.94] transition-colors">
                        Suggested (~{p.suggestedExpiryDays}d)
                      </button>
                    ) : null}
                    {EXPIRY_PRESETS.map((pr) => (
                      <button key={pr.label} type="button" onClick={() => p.onExpiresChange(isoDateOffsetDays(pr.days))}
                        className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-zinc-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 active:scale-[0.94] transition-colors">{pr.label}</button>
                    ))}
                  </div>
                </>
              )}

              {openAttr === "storage" && (
                <>
                  <CustomPillGroup
                    options={locationOptions}
                    custom={taxonomy.listFor("location", p.kind)}
                    value={p.storageLocation}
                    onSelect={(v) => p.onStorageChange(v)}
                    onAddCustom={(label) => taxonomy.add("location", p.kind, label)}
                    onRemoveCustom={(label) => { taxonomy.remove("location", p.kind, label); if (p.storageLocation === label) p.onStorageChange(null); }}
                  />
                  {!isSupplies && p.storageLocation === "fridge" && (
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-100 dark:border-zinc-800">
                      <span className={LABEL}>Fridge zone</span>
                      <div className="flex gap-1.5">
                        {FRIDGE_ZONES.map(({ value, label }) => (
                          <button key={value} type="button" onClick={() => p.onFridgeZoneChange(p.fridgeZone === value ? null : value)} className={chip(p.fridgeZone === value)}>{label}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {openAttr === "category" && (
                <CustomPillGroup
                  options={categoryOptions}
                  custom={taxonomy.listFor("category", p.kind)}
                  value={p.foodCategory}
                  onSelect={(v) => p.onCategoryChange(v)}
                  onAddCustom={(label) => taxonomy.add("category", p.kind, label)}
                  onRemoveCustom={(label) => { taxonomy.remove("category", p.kind, label); if (p.foodCategory === label) p.onCategoryChange(null); }}
                />
              )}

              {openAttr === "assigned" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => p.onAssignedChange(null)} className={chip(isEveryone)}>Everyone</button>
                  {p.members.map((m) => {
                    const selected = !!p.assignedTo?.includes(m.user_id);
                    const color = m.color ?? DEFAULT_COLOR;
                    return (
                      <button key={m.user_id} type="button"
                        onClick={() => {
                          const cur = p.assignedTo ?? [];
                          const next = selected ? cur.filter((id) => id !== m.user_id) : [...cur, m.user_id];
                          p.onAssignedChange(next.length === 0 ? null : next);
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all active:scale-[0.94]"
                        style={selected ? { backgroundColor: color, color: "#fff" } : { backgroundColor: hexAlpha(color, 0.1), color }}>
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0" style={selected ? { backgroundColor: "rgba(255,255,255,0.25)", color: "#fff" } : { backgroundColor: hexAlpha(color, 0.2), color }}>{m.initials}</span>
                        {m.user_id === p.currentUserId ? "Me" : m.short_name}
                      </button>
                    );
                  })}
                </div>
              )}

              {openAttr === "note" && (
                <>
                  <textarea
                    placeholder="Brand, location, anything useful…"
                    value={noteDraft}
                    onChange={(e) => { const v = e.target.value.slice(0, 150); setNoteDraft(v); p.onNotesChange(v); }}
                    rows={2}
                    maxLength={150}
                    autoFocus
                    className="w-full text-sm text-gray-700 dark:text-gray-300 placeholder:text-gray-400 dark:placeholder:text-gray-600 bg-gray-50 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-gray-400 dark:focus:border-zinc-500 transition-colors resize-none"
                  />
                  {noteDraft.length >= 130 && (
                    <p className="text-[10px] text-right text-gray-400 dark:text-gray-500">{150 - noteDraft.length} left</p>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
