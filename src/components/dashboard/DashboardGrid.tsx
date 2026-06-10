"use client";

import Link from "next/link";
import { useHouseholdData } from "@/context/HouseholdDataContext";
import type { PantryItem } from "@/types/database";

/**
 * Desktop command-center grid. Reads everything from the already-lifted
 * HouseholdDataProvider (pantry + shopping), so it triggers ZERO new
 * fetches — it's a read-only overview that links into the full surfaces.
 */

function daysUntil(expiresAt: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + "T00:00:00");
  return Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
}

function isUseSoon(item: PantryItem): boolean {
  if ((item.kind ?? "food") !== "food") return false;
  if (!item.expires_at) return false;
  return daysUntil(item.expires_at) <= 7;
}

function WidgetCard({
  title,
  count,
  accent,
  href,
  children,
}: {
  title: string;
  count?: number;
  accent?: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl border border-gray-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm p-5 hover:shadow-md transition-shadow"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">{title}</h2>
        {count !== undefined && (
          <span
            className={`text-xs font-semibold tabular-nums px-2 py-0.5 rounded-full ${
              accent ?? "bg-gray-100 dark:bg-zinc-800 text-gray-500 dark:text-gray-400"
            }`}
          >
            {count}
          </span>
        )}
      </div>
      {children}
    </Link>
  );
}

function ItemLine({ name, trailing, trailingClass }: { name: string; trailing?: string; trailingClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="min-w-0 line-clamp-2 leading-snug text-gray-700 dark:text-gray-300">{name}</span>
      {trailing && (
        <span className={`flex-shrink-0 text-xs font-medium ${trailingClass ?? "text-gray-400 dark:text-gray-500"}`}>
          {trailing}
        </span>
      )}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 dark:text-gray-500">{text}</p>;
}

export default function DashboardGrid({ householdId }: { householdId: string }) {
  const { pantry, shopping } = useHouseholdData();
  const items = pantry.items ?? [];

  const useSoon = items
    .filter(isUseSoon)
    .sort((a, b) => daysUntil(a.expires_at!) - daysUntil(b.expires_at!));
  const runningLow = items.filter((i) => i.running_low && !i.running_low_dismissed);
  const foodCount = items.filter((i) => (i.kind ?? "food") === "food").length;
  const suppliesCount = items.filter((i) => i.kind === "supplies").length;
  const activeShopping = shopping.activeItems ?? [];

  const pantryHref = `/household/${householdId}/pantry`;
  const shoppingHref = `/household/${householdId}/shopping`;

  function expiryLabel(item: PantryItem): string {
    const d = daysUntil(item.expires_at!);
    if (d < 0) return d === -1 ? "yesterday" : `${Math.abs(d)}d ago`;
    if (d === 0) return "today";
    if (d === 1) return "tomorrow";
    return `${d}d`;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Use Soon */}
      <WidgetCard
        title="Use soon"
        count={useSoon.length}
        accent={useSoon.length ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400" : undefined}
        href={pantryHref}
      >
        {useSoon.length === 0 ? (
          <EmptyHint text="Nothing expiring in the next week." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {useSoon.slice(0, 5).map((i) => (
              <ItemLine key={i.id} name={i.name} trailing={expiryLabel(i)} trailingClass="text-red-500" />
            ))}
            {useSoon.length > 5 && <EmptyHint text={`+${useSoon.length - 5} more`} />}
          </div>
        )}
      </WidgetCard>

      {/* Active shopping list */}
      <WidgetCard
        title="Shopping list"
        count={activeShopping.length}
        accent={activeShopping.length ? "bg-gray-900 dark:bg-zinc-100 text-white dark:text-zinc-900" : undefined}
        href={shoppingHref}
      >
        {activeShopping.length === 0 ? (
          <EmptyHint text="Your shopping list is empty." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {activeShopping.slice(0, 5).map((i) => (
              <ItemLine
                key={i.id}
                name={i.name}
                trailing={i.store ?? undefined}
              />
            ))}
            {activeShopping.length > 5 && <EmptyHint text={`+${activeShopping.length - 5} more`} />}
          </div>
        )}
      </WidgetCard>

      {/* Running low */}
      <WidgetCard
        title="Running low"
        count={runningLow.length}
        accent={runningLow.length ? "bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400" : undefined}
        href={pantryHref}
      >
        {runningLow.length === 0 ? (
          <EmptyHint text="Nothing flagged as running low." />
        ) : (
          <div className="flex flex-col gap-1.5">
            {runningLow.slice(0, 5).map((i) => (
              <ItemLine key={i.id} name={i.name} trailing="low" trailingClass="text-amber-500" />
            ))}
            {runningLow.length > 5 && <EmptyHint text={`+${runningLow.length - 5} more`} />}
          </div>
        )}
      </WidgetCard>

      {/* Pantry overview */}
      <WidgetCard title="Pantry" count={items.length} href={pantryHref}>
        <div className="flex flex-col gap-1.5">
          <ItemLine name="Food" trailing={String(foodCount)} />
          <ItemLine name="Supplies" trailing={String(suppliesCount)} />
          {items.length === 0 && <EmptyHint text="Your pantry is empty." />}
        </div>
      </WidgetCard>
    </div>
  );
}
