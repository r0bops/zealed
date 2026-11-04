import { randomBytes } from "node:crypto";

/**
 * Short, scannable links for verification URLs the server created itself.
 *
 * Reclaim's request link carries the whole signed request in its query string (about 1.7 KB) when Reclaim's own
 * shortener is unavailable. A QR code of that size is too dense for a phone camera, so the QR points at
 * `/v/<id>` instead, which redirects to the full link.
 *
 * - Only https links on Reclaim's verification hosts are accepted, so this can never become an open redirect.
 * - Links live in memory for 15 minutes and are never written to the database or logs.
 */
const HOSTS = new Set(["portal.reclaimprotocol.org", "share.reclaimprotocol.org"]);
const TTL_MS = 15 * 60_000, MAX_LINKS = 2000;
type Entry = { url: string; expiresAt: number };
const store = () => ((globalThis as unknown as { __zealedShortLinks?: Map<string, Entry> }).__zealedShortLinks ??= new Map());

export function isShortLinkTarget(url: string) {
  try { const u = new URL(url); return u.protocol === "https:" && HOSTS.has(u.hostname) && !u.username && !u.password; } catch { return false; }
}

/** Stores `url` and returns its id, or throws for a link that isn't a Reclaim verification link. */
export function createShortLink(url: string, now = Date.now()): string {
  if (url.length > 8000 || !isShortLinkTarget(url)) throw new Error("Not a verification link.");
  const links = store();
  for (const [id, e] of links) if (e.expiresAt <= now) links.delete(id);
  while (links.size >= MAX_LINKS) links.delete(links.keys().next().value!);
  const id = randomBytes(12).toString("base64url");
  links.set(id, { url, expiresAt: now + TTL_MS });
  return id;
}

export function resolveShortLink(id: string, now = Date.now()): string | null {
  if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
  const links = store(), e = links.get(id);
  if (!e) return null;
  if (e.expiresAt <= now) { links.delete(id); return null; }
  return e.url;
}
