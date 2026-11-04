// Per-client fixed-window rate limiting for the public reward endpoints. In memory (one server
// process), so no IP address is ever written to disk: buckets are keyed by a salted hash that
// changes on every restart, and expire with their window.
import { createHash, randomBytes } from "node:crypto";

type Bucket = { count: number; resetAt: number };
const g = globalThis as unknown as { __zealedRate?: Map<string, Bucket>; __zealedRateSalt?: string };
const buckets = () => (g.__zealedRate ??= new Map());
const salt = () => (g.__zealedRateSalt ??= randomBytes(16).toString("hex"));

/** First hop of X-Forwarded-For (set by the proxy in front of the app), else X-Real-IP, else one shared local bucket. */
function clientId(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || req.headers.get("x-real-ip")?.trim() || "local";
  return createHash("sha256").update(`${salt()}:${ip}`).digest("hex").slice(0, 32);
}

function enabled(): boolean {
  if (process.env.RATE_LIMIT === "off") return false;
  return process.env.NODE_ENV !== "test" || process.env.RATE_LIMIT === "on";
}

/**
 * Returns a 429 Response when the client exceeded `limit` requests in `windowMs` for this scope,
 * otherwise null. Usage: `const limited = rateLimit(req, "claim", 10, 60_000); if (limited) return limited;`
 */
export function rateLimit(req: Request, scope: string, limit: number, windowMs: number): Response | null {
  if (!enabled()) return null;
  const map = buckets(), now = Date.now(), key = `${scope}:${clientId(req)}`;
  if (map.size > 10_000) for (const [k, b] of map) if (b.resetAt <= now) map.delete(k);
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (bucket.count >= limit) {
    const retryAfterS = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    return Response.json(
      { error: `Too many attempts. Wait ${retryAfterS} seconds and try again.` },
      { status: 429, headers: { "Retry-After": String(retryAfterS), "Cache-Control": "no-store" } },
    );
  }
  bucket.count += 1;
  return null;
}

/** Tests only: forget every bucket. */
export function resetRateLimits() {
  buckets().clear();
}
