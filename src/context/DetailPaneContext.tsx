"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * Tracks which row is selected for the desktop master-detail editor rail.
 * Scoped per page surface (one provider wraps the pantry list + rail,
 * another wraps the shopping list + rail) so a pantry selection and a
 * shopping selection never collide.
 *
 * On mobile this is simply unused — rows open their own bottom sheet via
 * local `expanded`/`sheetOpen` state exactly as before.
 */

interface DetailPaneValue {
  selectedId: string | null;
  select: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

const DetailPaneContext = createContext<DetailPaneValue | null>(null);

export function DetailPaneProvider({ children }: { children: React.ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const select = useCallback((id: string) => setSelectedId(id), []);
  const toggle = useCallback(
    (id: string) => setSelectedId((prev) => (prev === id ? null : id)),
    [],
  );
  const clear = useCallback(() => setSelectedId(null), []);

  const value = useMemo(
    () => ({ selectedId, select, toggle, clear }),
    [selectedId, select, toggle, clear],
  );

  return <DetailPaneContext.Provider value={value}>{children}</DetailPaneContext.Provider>;
}

/** Returns the detail-pane controller, or null when not inside a provider. */
export function useDetailPane(): DetailPaneValue | null {
  return useContext(DetailPaneContext);
}
