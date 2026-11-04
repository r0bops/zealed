// One-time gift links. A delivered reward is re-sealed in the giver's browser to a key that the friend's browser
// created, so the server only relays ciphertext. A row holds SHA-256 hashes of three bearer tokens (the link,
// the giver's management token and the friend's open token), the friend's public key and one sealed blob. There is
// no order ID, wallet, txid or giver identity. The blob is handed out once and its row deleted in the same
// transaction; anything not opened is deleted after GIFT_TTL_HOURS, swept lazily on every request.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "./db/client";
import { isPublicKey } from "./sodium";

export class GiftError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** waiting: link not opened yet · accepted: the friend's key is registered · sealed: the blob is ready to open once. */
export type GiftState = "waiting" | "accepted" | "sealed";
/** link: anyone holding the shared URL · owner: the giver's browser · recipient: the browser that accepted. */
export type GiftRole = "link" | "owner" | "recipient";

export const GIFT_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const GIFT_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
// A sealed box adds 48 bytes, so even an empty payload is at least 64 base64url characters.
export const GIFT_SEALED_RE = /^[A-Za-z0-9_-]{64,16000}$/;
const MAX_OPEN_GIFTS = 5000;
const NOT_FOUND = "This gift link was already opened, has expired or was cancelled.";

const DDL = `
CREATE TABLE IF NOT EXISTS gift_links (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  owner_hash TEXT NOT NULL,
  recipient_hash TEXT,
  recipient_pubkey TEXT,
  sealed TEXT,
  state TEXT NOT NULL CHECK (state IN ('waiting', 'accepted', 'sealed')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS gift_links_expires_at ON gift_links (expires_at);`;

type Row = {
  id: string;
  token_hash: string;
  owner_hash: string;
  recipient_hash: string | null;
  recipient_pubkey: string | null;
  sealed: string | null;
  state: GiftState;
  created_at: number;
  expires_at: number;
};

// The table lives outside the shared schema and is created once per connection.
const prepared = new WeakSet<object>();
function sqlite() {
  const client = db().$client;
  if (!prepared.has(client)) {
    client.exec(DDL);
    prepared.add(client);
  }
  return client;
}

export function giftTtlMs(): number {
  const hours = Number(process.env.GIFT_TTL_HOURS);
  return (Number.isFinite(hours) && hours > 0 ? Math.min(hours, 720) : 72) * 3_600_000;
}

const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
const hashToken = (token: string) => createHash("sha256").update(token).digest();

function sameHash(stored: string | null, token: string): boolean {
  if (!stored) return false;
  const expected = Buffer.from(stored, "hex");
  const actual = hashToken(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Deletes every gift past its expiry. Called at the start of each operation. */
export function purgeExpiredGifts(now = Date.now()): number {
  return sqlite().prepare("DELETE FROM gift_links WHERE expires_at <= ?").run(now).changes;
}

// A wrong ID, a wrong token and a gift that's gone all look the same to the caller.
function authorize(id: string, token: string, roles: GiftRole[], now: number): { row: Row; role: GiftRole } {
  purgeExpiredGifts(now);
  if (!GIFT_ID_RE.test(id) || !GIFT_TOKEN_RE.test(token)) throw new GiftError(404, NOT_FOUND);
  const row = sqlite().prepare("SELECT * FROM gift_links WHERE id = ?").get(id) as Row | undefined;
  if (row) {
    const hashes: Record<GiftRole, string | null> = { link: row.token_hash, owner: row.owner_hash, recipient: row.recipient_hash };
    for (const role of roles) if (sameHash(hashes[role], token)) return { row, role };
  }
  throw new GiftError(404, NOT_FOUND);
}

/** Starts a gift. The giver's browser keeps both tokens; the giftToken goes in the URL fragment of the link. */
export function createGift(now = Date.now()) {
  purgeExpiredGifts(now);
  const client = sqlite();
  const { n } = client.prepare("SELECT COUNT(*) AS n FROM gift_links").get() as { n: number };
  if (n >= MAX_OPEN_GIFTS) throw new GiftError(503, "Too many gift links are open right now. Try again later.");
  const giftId = newToken(16), giftToken = newToken(), ownerToken = newToken(), expiresAt = now + giftTtlMs();
  client
    .prepare("INSERT INTO gift_links (id, token_hash, owner_hash, state, created_at, expires_at) VALUES (?, ?, ?, 'waiting', ?, ?)")
    .run(giftId, hashToken(giftToken).toString("hex"), hashToken(ownerToken).toString("hex"), now, expiresAt);
  return { giftId, giftToken, ownerToken, expiresAt };
}

/** Status for whichever token is presented. Never returns the sealed blob. */
export function giftStatus(id: string, token: string, now = Date.now()) {
  const { row, role } = authorize(id, token, ["owner", "recipient", "link"], now);
  return { state: row.state, role, recipientPublicKey: row.recipient_pubkey, expiresAt: row.expires_at };
}

/** The friend's browser registers its public key with the link token. The first accept wins. */
export async function acceptGift(id: string, linkToken: string, publicKey: string, now = Date.now()) {
  if (!(await isPublicKey(publicKey))) throw new GiftError(400, "Invalid public key.");
  const { row } = authorize(id, linkToken, ["link"], now);
  const recipientToken = newToken();
  const { changes } = sqlite()
    .prepare("UPDATE gift_links SET state = 'accepted', recipient_pubkey = ?, recipient_hash = ? WHERE id = ? AND state = 'waiting'")
    .run(publicKey, hashToken(recipientToken).toString("hex"), row.id);
  if (changes !== 1) throw new GiftError(409, "Someone already opened this link. Ask the sender for a new one.");
  return { recipientToken, expiresAt: row.expires_at };
}

/** The giver uploads the reward re-sealed to the friend's key. The key must match the one the giver was shown. */
export function sealGift(id: string, ownerToken: string, sealed: string, recipientPublicKey: string, now = Date.now()) {
  if (!GIFT_SEALED_RE.test(sealed)) throw new GiftError(400, "Invalid sealed gift.");
  const { row } = authorize(id, ownerToken, ["owner"], now);
  if (row.state === "waiting") throw new GiftError(409, "Nobody has opened the link yet.");
  if (row.state === "sealed") throw new GiftError(409, "This gift is already sealed.");
  if (row.recipient_pubkey !== recipientPublicKey) throw new GiftError(409, "The recipient's key changed. Reload and compare the code again.");
  const { changes } = sqlite()
    .prepare("UPDATE gift_links SET state = 'sealed', sealed = ? WHERE id = ? AND state = 'accepted' AND recipient_pubkey = ?")
    .run(sealed, row.id, recipientPublicKey);
  if (changes !== 1) throw new GiftError(409, "This gift is already sealed.");
  return { state: "sealed" as const };
}

/** One-time read: returns the sealed blob to the accepted recipient and deletes the row in the same transaction. */
export function takeSealedGift(id: string, recipientToken: string, now = Date.now()): { sealed: string } {
  const client = sqlite();
  purgeExpiredGifts(now); // outside the transaction, so a rejected open doesn't roll the sweep back
  return client.transaction(() => {
    const { row } = authorize(id, recipientToken, ["recipient"], now);
    if (row.state !== "sealed" || !row.sealed) throw new GiftError(409, "The sender hasn't sealed the gift yet.");
    const { changes } = client.prepare("DELETE FROM gift_links WHERE id = ? AND state = 'sealed'").run(row.id);
    if (changes !== 1) throw new GiftError(404, NOT_FOUND);
    return { sealed: row.sealed };
  }).immediate();
}

/** The giver withdraws the link, e.g. when the fingerprints don't match. */
export function cancelGift(id: string, ownerToken: string, now = Date.now()) {
  const { row } = authorize(id, ownerToken, ["owner"], now);
  sqlite().prepare("DELETE FROM gift_links WHERE id = ?").run(row.id);
}

// ---------------------------------------------------------------- HTTP helpers for app/api/gifts

export function giftJson(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" },
  });
}

/** Known errors keep their message; anything else becomes a generic 503 and is never logged. */
export function giftFailure(e: unknown) {
  if (e instanceof GiftError) return giftJson({ error: e.message }, e.status);
  return giftJson({ error: "Could not complete the request. Try again." }, 503);
}

export function bearerToken(req: Request): string {
  return /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.get("authorization") ?? "")?.[1] ?? "";
}

export async function readGiftBody(req: Request, limit = 20_000): Promise<unknown> {
  const raw = await req.text();
  if (raw.length > limit) throw new GiftError(413, "Request too large.");
  try {
    return JSON.parse(raw);
  } catch {
    throw new GiftError(400, "Invalid request.");
  }
}
