export interface MemberColor {
  id: string;
  hex: string;
  label: string;
}

/**
 * 8 perceptually distinct colors — spaced ~30-87° apart on the hue wheel
 * so every avatar is immediately recognisable at a glance.
 *
 * Old palette had clusters: rose+orange+amber (all warm), emerald+teal+sky+blue (4 blue-greens).
 * New palette removes those clusters.
 */
export const MEMBER_COLORS: MemberColor[] = [
  { id: "red",    hex: "#ef4444", label: "Red"    }, // hue   0°
  { id: "orange", hex: "#f97316", label: "Orange" }, // hue  31°
  { id: "lime",   hex: "#84cc16", label: "Lime"   }, // hue  87°  — clearly yellow-green
  { id: "green",  hex: "#22c55e", label: "Green"  }, // hue 142°
  { id: "teal",   hex: "#14b8a6", label: "Teal"   }, // hue 174°
  { id: "blue",   hex: "#3b82f6", label: "Blue"   }, // hue 217°
  { id: "violet", hex: "#8b5cf6", label: "Violet" }, // hue 263°
  { id: "pink",   hex: "#ec4899", label: "Pink"   }, // hue 328°  — hot magenta-pink
];

export const DEFAULT_COLOR = "#6b7280"; // gray-500 fallback for unset profiles

/** Convert hex + opacity to a CSS rgba() string */
export function hexAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
