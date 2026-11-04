// The one-way attendee hash. The SAME input runs in the player's browser (WebCrypto) and in the
// organizer's import script (Node), so the raw email never has to reach Zealed's server.
// Browser- and server-safe: no Node-only imports here.
export const ATTENDEE_HASH_PREFIX = "zealed:attendee:v1:";
export const ATTENDEE_HASH_RE = /^[A-Za-z0-9_-]{43}$/; // base64url SHA-256, no padding

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function attendeeHashInput(eventId: string, email: string): string {
  return `${ATTENDEE_HASH_PREFIX}${eventId}:${normalizeEmail(email)}`;
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/** Browser: SHA-256 → base64url via WebCrypto. */
export async function attendeeHashBrowser(eventId: string, email: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(attendeeHashInput(eventId, email))));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
