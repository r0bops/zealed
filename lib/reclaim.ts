// Server-only: reads the Reclaim app secret. Never import this module from a client component.
import { createHash, createHmac } from "node:crypto";
import { z } from "zod";
import { ReclaimProofRequest, verifyProof, type Proof } from "@reclaimprotocol/js-sdk";
import { serverSecret } from "./server-secret";

/**
 * Reclaim (zkTLS) mission verification.
 *
 * The player proves one fact about a web account (the configured Reclaim provider) instead of answering the quiz.
 * Privacy rules for this module:
 * - The app secret stays here. The browser gets `toJsonString()`, which carries a signature over
 *   `{providerId, timestamp}` and a keccak-derived attestation nonce, never the secret itself.
 * - Proofs are checked in memory and dropped. Nothing from a proof (usernames, emails, extracted parameters,
 *   public data) is stored, logged or returned. Callers see `{ verified, providerId, eventId }`, plus in attendance
 *   mode a keyed one-way nullifier that is the only thing persisted.
 *
 * Attendance mode (LUMA_EVENT_ID set): the proof must come from a Luma provider and show an approved registration for
 * that event. HMAC(server secret, eventId:lumaUserId) becomes the nullifier, so each attendee claims once per event
 * across all campaigns while Zealed never learns who they are.
 */

export type MissionMode = "reclaim" | "quiz";
type Attendance = { eventIds: string[]; statuses: string[] };
type ReclaimConfig = { appId: string; appSecret: string; providerId: string; attendance: Attendance | null };
/** Reclaim's public "Luma Invited to an Event" provider, the default in attendance mode. */
export const LUMA_PROVIDER_ID = "bee752c9-c41b-44b8-9e3d-d3462bcb3dbc";
const csv = (value: string | undefined) => (value ?? "").split(",").map(v => v.trim()).filter(Boolean);

function attendance(): Attendance | null {
  // The first id is canonical (it keys the nullifier); later ones are aliases, e.g. the event's URL slug.
  const eventIds = csv(process.env.LUMA_EVENT_ID);
  if (!eventIds.length) return null;
  const statuses = csv(process.env.LUMA_APPROVED_STATUSES).map(s => s.toLowerCase());
  return { eventIds, statuses: statuses.length ? statuses : ["approved"] };
}
function config(): ReclaimConfig | null {
  const appId = process.env.RECLAIM_APP_ID?.trim(), appSecret = process.env.RECLAIM_APP_SECRET?.trim(), a = attendance();
  const providerId = process.env.RECLAIM_PROVIDER_ID?.trim() || (a ? LUMA_PROVIDER_ID : "");
  return appId && appSecret && providerId ? { appId, appSecret, providerId, attendance: a } : null;
}
export function reclaimEnabled() { return config() !== null; }
export function attendanceEnabled() { return !!config()?.attendance; }
export function missionMode(): MissionMode { return reclaimEnabled() ? "reclaim" : "quiz"; }
export function missionLabel() {
  return process.env.RECLAIM_MISSION_LABEL?.trim().slice(0, 120)
    || (attendanceEnabled() ? "Prove you're an approved Free Society Hack attendee with Reclaim." : "Prove a fact about one of your web accounts");
}
function nullifierKey() {
  try { return serverSecret("attendance"); } catch { throw new MissionProofError("Attendance verification is not configured on this server.", false); }
}

/** A proof failure the player can see. `countsAsAttempt` is false when Reclaim itself was unreachable. */
export class MissionProofError extends Error {
  constructor(message: string, readonly countsAsAttempt = true) { super(message); }
}

/**
 * Binds a proof to exactly one campaign and one player key. Reclaim (and anyone reading the proof) sees only this hash,
 * not the campaign id or the player's public key. The value lands in `claimData.context`, which the attestors sign.
 */
export function missionContext(campaignId: string, playerPublicKey: string) {
  return "0x" + createHash("sha256").update(`zealed-mission:v1:${campaignId}:${playerPublicKey}`).digest("hex");
}
const CONTEXT_MESSAGE = "Zealed reward mission";

/** Starts a Reclaim session on the server and returns the request JSON the browser hands to `fromJsonString`. */
export async function createMissionRequest(campaignId: string, playerPublicKey: string): Promise<string> {
  const c = config();
  if (!c) throw new MissionProofError("Reclaim verification is not configured.", false);
  if (c.attendance) nullifierKey(); // fail before the player spends time on a proof we could not accept
  let json: string;
  try {
    const request = await ReclaimProofRequest.init(c.appId, c.appSecret, c.providerId);
    request.setContext(missionContext(campaignId, playerPublicKey), CONTEXT_MESSAGE);
    json = request.toJsonString();
  } catch {
    // SDK errors can embed backend responses; surface a fixed message only.
    throw new MissionProofError("Could not start Reclaim verification. Try again shortly.", false);
  }
  // Defence in depth: the serialized request must never carry the secret, with or without a 0x prefix.
  const bare = c.appSecret.replace(/^0x/i, "").toLowerCase();
  if (bare.length >= 16 && json.toLowerCase().includes(bare)) throw new MissionProofError("Reclaim request was refused for safety.", false);
  return json;
}

const proofShape = z.looseObject({
  identifier: z.string().max(200),
  claimData: z.looseObject({
    provider: z.string(), parameters: z.string(), owner: z.string(), timestampS: z.number(),
    context: z.string(), identifier: z.string(), epoch: z.number(),
  }),
  signatures: z.array(z.string()).min(1).max(20),
  witnesses: z.array(z.unknown()).max(20),
});
const proofsShape = z.union([proofShape, z.array(proofShape).min(1).max(5)]);
const MAX_AGE_S = 60 * 60, MAX_SKEW_S = 5 * 60;
// Field names differ between Luma providers, so match on a normalized key (lowercase, letters and digits only).
const EVENT_KEYS = ["eventid", "event", "eventapiid", "eventurl", "eventslug"];
const USER_KEYS = ["userid", "user", "userapiid", "guestid", "guestapiid", "ticketkey", "proxykey", "secretkey", "invitekey"];
const STATUS_KEYS = ["approvalstatus", "approval", "gueststatus", "registrationstatus", "status"];
const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Extracted parameters from the signed part of each proof (`claimData.context.extractedParameters`, the same source the
 * SDK's `verifyProof` reports as `data[].extractedParameters`). The top-level `extractedParameterValues` is not signed
 * and is ignored. Values exist only in memory and only for the checks below.
 */
function signedParameters(proofs: Proof[]) {
  const merged = new Map<string, string>();
  for (const proof of proofs) {
    let params: unknown;
    try { params = (JSON.parse(proof.claimData.context) as { extractedParameters?: unknown }).extractedParameters; } catch { params = undefined; }
    if (!params || typeof params !== "object") continue;
    for (const [key, raw] of Object.entries(params)) {
      if (typeof raw !== "string") continue;
      const k = normalize(key), v = raw.trim();
      if (merged.has(k) && merged.get(k) !== v) throw new MissionProofError("The proofs disagree with each other. Start the verification again.");
      merged.set(k, v);
    }
  }
  return (keys: string[]) => keys.map(k => merged.get(k)).find(v => !!v);
}
// Verification errors that mean "Reclaim could not be reached", not "the player sent a bad proof".
const UNAVAILABLE = new Set(["BackendServerError", "ProviderConfigFetchError", "TimeoutError", "TypeError"]);

export type MissionProofResult = { verified: true; providerId: string; eventId?: string; nullifier?: string };
/**
 * Verifies the attestor signatures and the provider (pinned from env, never taken from the request), then checks the
 * proof is bound to this campaign and player key. In attendance mode it also checks the event and approval status and
 * derives the nullifier. Throws `MissionProofError` on any failure.
 */
export async function verifyMissionProof(proofs: unknown, campaignId: string, playerPublicKey: string): Promise<MissionProofResult> {
  const c = config();
  if (!c) throw new MissionProofError("Reclaim verification is not configured.", false);
  const key = c.attendance ? nullifierKey() : "";
  const parsed = proofsShape.safeParse(proofs);
  if (!parsed.success) throw new MissionProofError("That proof could not be read. Start the verification again.");
  const list = (Array.isArray(parsed.data) ? parsed.data : [parsed.data]) as unknown as Proof[];
  const expected = missionContext(campaignId, playerPublicKey), now = Date.now() / 1000;
  for (const proof of list) {
    let address: unknown;
    try { address = (JSON.parse(proof.claimData.context) as { contextAddress?: unknown }).contextAddress; } catch { address = undefined; }
    if (address !== expected) throw new MissionProofError("This proof was made for a different invitation or browser. Start the verification again here.");
    if (proof.claimData.timestampS < now - MAX_AGE_S || proof.claimData.timestampS > now + MAX_SKEW_S) throw new MissionProofError("This proof has expired. Start the verification again.");
  }
  const result = await verifyProof(list, {
    providerId: c.providerId,
    ...(process.env.RECLAIM_REQUIRE_TEE === "true" ? { teeAttestation: { appSecret: c.appSecret } } : {}),
  });
  if (!result.isVerified) {
    if (UNAVAILABLE.has(result.error?.name ?? "")) throw new MissionProofError("Reclaim could not be reached to check the proof. Try again shortly.", false);
    throw new MissionProofError("The proof did not verify for this mission.");
  }
  if (!c.attendance) return { verified: true, providerId: c.providerId };
  const field = signedParameters(list);
  const event = field(EVENT_KEYS), status = field(STATUS_KEYS), user = field(USER_KEYS);
  if (!event || !c.attendance.eventIds.includes(event)) throw new MissionProofError("This proof is for a different Luma event.");
  if (!status || !c.attendance.statuses.includes(status.toLowerCase())) throw new MissionProofError("Your Luma registration for this event is not approved.");
  if (!user || user.length > 512) throw new MissionProofError("The proof did not include a Luma attendee code. Start the verification again.");
  const eventId = c.attendance.eventIds[0];
  const nullifier = createHmac("sha256", key).update(`${eventId}:${user}`).digest("hex");
  return { verified: true, providerId: c.providerId, eventId, nullifier };
}
