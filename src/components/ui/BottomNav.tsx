"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface BottomNavProps {
  householdId: string;
}

const tabs = [
  {
    label: "Pantry",
    href: (id: string) => `/household/${id}/pantry`,
    icon: (active: boolean) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={active ? 2.5 : 1.8}
        stroke="currentColor"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 2h6M8 6h8a2 2 0 012 2v12a2 2 0 01-2 2H8a2 2 0 01-2-2V8a2 2 0 012-2zM10 11h4M10 15h4"
        />
      </svg>
    ),
  },
  {
    label: "Shopping",
    href: (id: string) => `/household/${id}/shopping`,
    icon: (active: boolean) => (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        strokeWidth={active ? 2.5 : 1.8}
        stroke="currentColor"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 6h2l1 9h12l1.5-6H7M9 19.5a.5.5 0 11-1 0 .5.5 0 011 0zM18 19.5a.5.5 0 11-1 0 .5.5 0 011 0z"
        />
      </svg>
    ),
  },
];

export default function BottomNav({ householdId }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 pb-safe">
      <div className="max-w-lg mx-auto flex">
        {tabs.map((tab) => {
          const href = tab.href(householdId);
          const active = pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors duration-150",
                active ? "text-gray-900" : "text-gray-400 hover:text-gray-600"
              )}
            >
              {tab.icon(active)}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
