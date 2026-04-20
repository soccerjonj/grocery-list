export interface MemberColor {
  id: string;
  hex: string;
  label: string;
}

export const MEMBER_COLORS: MemberColor[] = [
  { id: "rose",    hex: "#f43f5e", label: "Rose"    },
  { id: "orange",  hex: "#f97316", label: "Orange"  },
  { id: "amber",   hex: "#f59e0b", label: "Amber"   },
  { id: "lime",    hex: "#84cc16", label: "Lime"    },
  { id: "emerald", hex: "#10b981", label: "Emerald" },
  { id: "teal",    hex: "#14b8a6", label: "Teal"    },
  { id: "sky",     hex: "#0ea5e9", label: "Sky"     },
  { id: "blue",    hex: "#3b82f6", label: "Blue"    },
  { id: "violet",  hex: "#8b5cf6", label: "Violet"  },
  { id: "pink",    hex: "#ec4899", label: "Pink"    },
];

export const DEFAULT_COLOR = "#6b7280"; // gray-500

/** Hex with given opacity (0–1) as a CSS rgba string */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
