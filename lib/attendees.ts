// Anonymous attendee list. The organizer imports the event's approved-guest emails; Zealed stores only
// one-way hashes. A player proves eligibility by sending the hash of their email (computed in their
// browser), and each hash can claim once (a keyed nullifier in attendance_nullifiers).
import { createHash, createHmac } from "node:crypto";
import { db } from "./db/client";
import { attendeeHashInput, ATTENDEE_HASH_RE } from "./attendee-hash";
import { serverSecret } from "./server-secret";

/** Canonical event id: the first entry of LUMA_EVENT_ID (later entries are aliases such as the URL slug). */
export function attendeeEventId(): string | null {
  const first = (process.env.LUMA_EVENT_ID ?? "").split(",").map((s) => s.trim()).find(Boolean);
  return first ?? null;
}

/** Email-list mission: MISSION_MODE=email and an event id configured. */
export function emailModeEnabled(): boolean {
  return process.env.MISSION_MODE === "email" && attendeeEventId() !== null;
}

function ensureTable() {
  db().$client.exec(
    "CREATE TABLE IF NOT EXISTS attendee_hashes (event_id TEXT NOT NULL, email_hash TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (event_id, email_hash))",
  );
}

/** Node side of the shared hash (used by the import script and tests). */
export function attendeeHash(eventId: string, email: string): string {
  return createHash("sha256").update(attendeeHashInput(eventId, email)).digest("base64url");
}

/** Store hashes only. Returns how many were new. */
export function importAttendeeHashes(eventId: string, hashes: string[]): number {
  ensureTable();
  const insert = db().$client.prepare("INSERT OR IGNORE INTO attendee_hashes (event_id, email_hash, created_at) VALUES (?, ?, ?)");
  const now = Date.now();
  return db().$client.transaction(() => hashes.filter((h) => ATTENDEE_HASH_RE.test(h)).reduce((n, h) => n + insert.run(eventId, h, now).changes, 0))();
}

export function isApprovedAttendee(eventId: string, emailHash: string): boolean {
  if (!ATTENDEE_HASH_RE.test(emailHash)) return false;
  ensureTable();
  return !!db().$client.prepare("SELECT 1 FROM attendee_hashes WHERE event_id = ? AND email_hash = ?").get(eventId, emailHash);
}

export function attendeeCount(eventId: string): number {
  ensureTable();
  return (db().$client.prepare("SELECT count(*) AS n FROM attendee_hashes WHERE event_id = ?").get(eventId) as { n: number }).n;
}

/** Keyed, so the stored claim marker can't be matched to the list without the server secret. */
export function attendeeNullifier(eventId: string, emailHash: string): string {
  return createHmac("sha256", serverSecret("attendance")).update(`${eventId}:${emailHash}`).digest("hex");
}

/** Short, human-readable pseudonym shown to the player ("Attendee 7F3A-91C2"); reveals nothing. */
export function attendeePseudonym(nullifier: string): string {
  const h = createHash("sha256").update(`zealed:pseudonym:${nullifier}`).digest("hex").slice(0, 8).toUpperCase();
  return `${h.slice(0, 4)}-${h.slice(4)}`;
}
