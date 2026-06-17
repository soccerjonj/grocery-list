import { createBrowserClient } from "@supabase/ssr";

// Single shared browser client. Each React hook calls createClient(), and
// previously every call built a fresh client — meaning several independent
// realtime websocket connections. Memoizing a module-level instance gives the
// whole app ONE authenticated realtime socket (createBrowserClient wires the
// session JWT into realtime via supabase-js's internal auth listener), which
// is both lighter and avoids inconsistent per-connection auth state.

// NB: the singleton's type is derived from this non-generic wrapper rather than
// `ReturnType<typeof createBrowserClient>` — the latter resolves an overload
// that widens the client to `any` and breaks type inference app-wide.
function makeClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let browserClient: ReturnType<typeof makeClient> | undefined;

export function createClient() {
  return (browserClient ??= makeClient());
}
