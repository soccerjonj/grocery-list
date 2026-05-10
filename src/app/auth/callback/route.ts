import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Validate that a `next` query param is a safe same-origin path.
 * Rejects open-redirect vectors:
 *   - missing or non-string
 *   - doesn't start with "/"
 *   - starts with "//" or "/\" (protocol-relative)
 *   - starts with "/.." (path traversal up)
 */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (raw.startsWith("/..")) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next")) ?? "/auth/confirmed";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Session is now set — redirect to the requested next path (default
      // /auth/confirmed, which handles profile sync + auto-join on invite).
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Something went wrong — redirect with an error flag
  return NextResponse.redirect(`${origin}/auth/login?error=confirmation_failed`);
}
