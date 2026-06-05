import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF-hardened server-side fetch for user-supplied URLs (recipe import).
 *
 * Without this, POST /api/extract-recipe would fetch any URL a user sent,
 * letting them reach cloud metadata (169.254.169.254), localhost, and RFC1918
 * internal services — and `redirect: "follow"` let a public URL 30x-redirect
 * into those ranges.
 *
 * Defenses here:
 *   • http/https only.
 *   • Resolve the hostname and reject if ANY resolved address is private /
 *     loopback / link-local / CGNAT / metadata / IPv6 ULA.
 *   • redirect: "manual" — every hop's host is re-validated before we follow.
 *   • Hard byte cap on the response (defeats giant-body OOM) and a timeout.
 *
 * Residual: a determined attacker could DNS-rebind between our resolve and
 * the kernel's connect (the TTL window). Closing that fully needs IP-pinned
 * connect (custom undici dispatcher); the checks here eliminate the practical
 * direct-internal / redirect-to-internal vectors, which is the real risk for
 * this app. Documented intentionally.
 */

const MAX_REDIRECTS = 4;

/** IPv4 dotted-quad → 32-bit int, or null if malformed. */
function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const o = Number(p);
    if (!Number.isInteger(o) || o < 0 || o > 255) return null;
    n = n * 256 + o;
  }
  return n >>> 0;
}

function isBlockedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // unparseable → treat as blocked
  const inRange = (base: string, bits: number) => {
    const b = ipv4ToInt(base)!;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (n & mask) === (b & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||        // "this" network
    inRange("10.0.0.0", 8) ||       // private
    inRange("100.64.0.0", 10) ||    // CGNAT
    inRange("127.0.0.0", 8) ||      // loopback
    inRange("169.254.0.0", 16) ||   // link-local (incl. 169.254.169.254 metadata)
    inRange("172.16.0.0", 12) ||    // private
    inRange("192.0.0.0", 24) ||     // IETF protocol assignments
    inRange("192.168.0.0", 16) ||   // private
    inRange("198.18.0.0", 15) ||    // benchmarking
    inRange("224.0.0.0", 4) ||      // multicast
    inRange("240.0.0.0", 4)         // reserved
  );
}

function isBlockedIpv6(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // strip zone id
  if (addr === "::1" || addr === "::") return true;           // loopback / unspecified
  // IPv4-mapped (::ffff:a.b.c.d) — validate the embedded v4
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return isBlockedIpv4(mapped[1]);
  const first = addr.split(":")[0] ?? "";
  const hi = parseInt(first || "0", 16);
  if (Number.isNaN(hi)) return true;
  // fc00::/7 unique-local (fc00–fdff), fe80::/10 link-local (fe80–febf)
  if ((hi & 0xfe00) === 0xfc00) return true;
  if ((hi & 0xffc0) === 0xfe80) return true;
  return false;
}

function isBlockedIp(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) return isBlockedIpv4(ip);
  if (fam === 6) return isBlockedIpv6(ip);
  return true; // not a valid IP → block
}

/** Throws if the URL's host resolves to any blocked address. */
async function assertHostAllowed(parsed: URL): Promise<void> {
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfBlockedError("Only http/https URLs are allowed");
  }
  const host = parsed.hostname;
  // If the host is already a literal IP, check it directly.
  if (isIP(host)) {
    if (isBlockedIp(host)) throw new SsrfBlockedError("URL resolves to a blocked address");
    return;
  }
  // Resolve ALL addresses and reject if any is blocked.
  let results: { address: string }[];
  try {
    results = await lookup(host, { all: true });
  } catch {
    throw new SsrfBlockedError("Could not resolve host");
  }
  if (results.length === 0) throw new SsrfBlockedError("Host did not resolve");
  for (const r of results) {
    if (isBlockedIp(r.address)) throw new SsrfBlockedError("URL resolves to a blocked address");
  }
}

export class SsrfBlockedError extends Error {}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  text: string;
}

/**
 * Fetch a user-supplied URL with SSRF protection + size cap. Returns the
 * decoded text body (truncated to maxBytes). Throws SsrfBlockedError for
 * disallowed targets; other fetch failures throw normally.
 */
export async function safeFetchText(
  rawUrl: string,
  opts: { maxBytes: number; timeoutMs: number; headers?: Record<string, string> },
): Promise<SafeFetchResult> {
  let current: URL;
  try {
    current = new URL(rawUrl);
  } catch {
    throw new SsrfBlockedError("Invalid URL");
  }

  const signal = AbortSignal.timeout(opts.timeoutMs);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertHostAllowed(current);

    const res = await fetch(current.toString(), {
      headers: { ...opts.headers },
      redirect: "manual",
      signal,
    });

    // Manual redirect handling — re-validate the next host before following.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return { ok: res.ok, status: res.status, text: "" };
      if (hop === MAX_REDIRECTS) throw new SsrfBlockedError("Too many redirects");
      let next: URL;
      try {
        next = new URL(loc, current);
      } catch {
        throw new SsrfBlockedError("Invalid redirect target");
      }
      current = next;
      continue;
    }

    // Reject oversized bodies up-front when the server declares length.
    const declared = Number(res.headers.get("content-length") ?? "");
    if (Number.isFinite(declared) && declared > opts.maxBytes) {
      throw new SsrfBlockedError("Response too large");
    }

    const text = await readCapped(res, opts.maxBytes);
    return { ok: res.ok, status: res.status, text };
  }

  throw new SsrfBlockedError("Too many redirects");
}

/** Stream the body, stopping once maxBytes is reached. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  if (!res.body) return await res.text();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          chunks.push(value.slice(0, value.byteLength - (total - maxBytes)));
          break;
        }
        chunks.push(value);
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* ignore */ }
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(concat(chunks));
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((a, c) => a + c.byteLength, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
