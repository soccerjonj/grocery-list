/**
 * A durable "you have a finished trip waiting to be stocked" marker.
 *
 * The post-trip "Add to pantry?" prompt used to live only in React state, so
 * tapping "Later", refreshing, or navigating away destroyed the entry point —
 * the user's just-bought items never made it into the pantry. This persists a
 * lightweight marker in localStorage so the Pantry tab can resurface a
 * dismissible "ready to stock" banner until the user acts on or dismisses it.
 */

const KEY = (householdId: string) => `pending_pantry_import_${householdId}`;

export interface PendingImport {
  listId: string;
  count: number;
}

export function setPendingImport(householdId: string, listId: string, count: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(householdId), JSON.stringify({ listId, count }));
  } catch { /* ignore quota/availability errors */ }
}

export function getPendingImport(householdId: string): PendingImport | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(householdId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingImport;
    return parsed?.listId ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPendingImport(householdId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY(householdId));
  } catch { /* ignore */ }
}
