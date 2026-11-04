import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db } from "./db/client";
import { getOrder, reserveOrder } from "./orders";
import type { Order } from "./db/schema";

import { programInput } from "./program-schema";
import { storeProgram, assertProgramPurchase, publicProgram } from "./program";

export const mission = {
  question: "When should Zealed release a reward?",
  options: ["When a wallet broadcasts a transaction", "After the exact shielded payment is confirmed", "When someone posts a transaction screenshot"],
};
export const campaignInput = z.object({
  title: z.string().trim().min(3).max(80),
  budgetCents: z.number().int().min(1).max(2000),
  country: z.string().regex(/^[A-Z]{2}$/),
  productIds: z.array(z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/)).max(5),
  program: programInput.optional(),
}).refine(c => c.program ? !c.program.prizes.some(p => p.kind === "giftcard" || p.kind === "esim") || c.productIds.length > 0 : c.productIds.length > 0);
export type CampaignInput = z.infer<typeof campaignInput>;
export type Choice = { productId: string; productName: string; kind: "giftcard" | "esim"; packageValue: string; priceCents: number; reason: string };
export type Campaign = { id: string; title: string; budget_cents: number; country: string; product_ids: string; invite_hash: string; expires_at: number; attempts: number; created_at: number };
export type Claim = { id: string; campaign_id: string; secret_hash: string; buyer_key: string; state: "selecting" | "selection_failed" | "proposed" | "ordered"; choice: string | null; order_id: string | null; attempts: number; updated_at: number };
export class CampaignError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const digest = (value: string) => createHash("sha256").update(value).digest("hex");
export function secretMatches(value: string, hash: string) { return timingSafeEqual(Buffer.from(digest(value)), Buffer.from(hash)); }
export function bearer(req: Request) { return req.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""; }
export function requireAdmin(req: Request) {
  const key = process.env.CAMPAIGN_ADMIN_TOKEN;
  if (!key || key.length < 32) throw new CampaignError(503, "Campaign creation is not configured. Ask the organizer to set a strong admin token.");
  if (!secretMatches(bearer(req), digest(key))) throw new CampaignError(401, "Enter the organizer access token.");
}
export function campaign(id: string): Campaign {
  const c = db().$client.prepare("SELECT * FROM campaigns WHERE id = ?").get(id) as Campaign | undefined;
  if (!c) throw new CampaignError(404, "Campaign not found.");
  return c;
}
export function invitation(id: string, token: string) {
  const c = campaign(id);
  if (!secretMatches(token, c.invite_hash)) throw new CampaignError(404, "Invitation not found.");
  return c;
}
export function claim(id: string, token: string): Claim {
  const c = db().$client.prepare("SELECT * FROM reward_claims WHERE id = ?").get(id) as Claim | undefined;
  if (!c || !secretMatches(token, c.secret_hash)) throw new CampaignError(404, "Claim not found. Reopen it in the original browser.");
  return c;
}
export function claimForCampaign(id: string) {
  return db().$client.prepare("SELECT * FROM reward_claims WHERE campaign_id = ?").get(id) as Claim | undefined;
}
export function createCampaign(input: CampaignInput) {
  const id = crypto.randomUUID();
  const token = randomBytes(32).toString("base64url");
  return db().$client.transaction(() => {
  db().$client.prepare("INSERT INTO campaigns (id,title,budget_cents,country,product_ids,invite_hash,expires_at,attempts,created_at) VALUES (?,?,?,?,?,?,?,0,?)")
    .run(id, input.title, input.budgetCents, input.country, JSON.stringify([...new Set(input.productIds)]), digest(token), Date.now() + 24 * 60 * 60_000, Date.now());
  if (input.program) storeProgram(id, input.program);
  return { id, token };
  }).immediate();
}
// Reserve the sole claim before any model request. A retry must present both the same key and secret.
export type ClaimOptions = { failure?: string; attendance?: { eventId: string; nullifier: string } };
export function acquireClaim(id: string, inviteToken: string, answer: number, buyerKey: string, secret: string, options: ClaimOptions = {}) {
  const result = db().$client.transaction(() => {
    const c = invitation(id, inviteToken);
    const previous = claimForCampaign(id);
    if (previous) {
      if (previous.buyer_key === buyerKey && secretMatches(secret, previous.secret_hash)) return previous;
      throw new CampaignError(409, "This invitation has already been claimed.");
    }
    if (c.expires_at <= Date.now()) throw new CampaignError(410, "This invitation expired.");
    if (c.attempts >= 5) throw new CampaignError(429, "Attempt limit reached. Ask for a new invitation.");
    db().$client.prepare("UPDATE campaigns SET attempts = attempts + 1 WHERE id = ?").run(id);
    if (answer !== 1) return null; // commit failed attempt; do not roll it back with an exception
    const claimId = crypto.randomUUID();
    db().$client.prepare("INSERT INTO reward_claims (id,campaign_id,secret_hash,buyer_key,state,attempts,updated_at) VALUES (?,?,?,?,'selection_failed',0,?)")
      .run(claimId, id, digest(secret), buyerKey, Date.now());
    if (options.attendance) {
      // Same transaction as the claim: a repeat attendee rolls back the claim and the attempt together.
      const added = db().$client.prepare("INSERT OR IGNORE INTO attendance_nullifiers (event_id,nullifier,claim_id,created_at) VALUES (?,?,?,?)")
        .run(options.attendance.eventId, options.attendance.nullifier, claimId, Date.now());
      if (added.changes === 0) throw new CampaignError(409, "This attendee has already claimed a reward.");
    }
    return claim(claimId, secret);
  }).immediate();
  if (!result) throw new CampaignError(400, options.failure ?? "Not quite. Review the payment explanation and try again.");
  return result;
}
export function beginSelection(id: string, token: string) {
  return db().$client.transaction(() => {
    const c = claim(id, token);
    assertProgramPurchase(c);
    if (c.state === "proposed" || c.state === "ordered") return false;
    if (campaign(c.campaign_id).expires_at <= Date.now()) throw new CampaignError(410, "Campaign expired.");
    if (c.attempts >= 3) throw new CampaignError(429, "Selection attempt limit reached. Contact the organizer.");
    // A terminated model request may be retried after its lease expires.
    if (c.state === "selecting" && c.updated_at > Date.now() - 90_000) return false;
    db().$client.prepare("UPDATE reward_claims SET state='selecting', attempts=attempts+1, updated_at=? WHERE id=?").run(Date.now(), id);
    return true;
  }).immediate();
}
export function finishSelection(id: string, choice: Choice | null, attempt: number) {
  db().$client.prepare("UPDATE reward_claims SET state=?, choice=?, updated_at=? WHERE id=? AND state='selecting' AND attempts=?")
    .run(choice ? "proposed" : "selection_failed", choice ? JSON.stringify(choice) : null, Date.now(), id, attempt);
}
export function checkChoice(c: Campaign, choice: Choice) {
  if (!(JSON.parse(c.product_ids) as string[]).includes(choice.productId) || !Number.isSafeInteger(choice.priceCents) || choice.priceCents < 1 || choice.priceCents > c.budget_cents || !["esim", "giftcard"].includes(choice.kind)) {
    throw new CampaignError(403, "Selected reward is outside the campaign policy.");
  }
}
/**
 * An order that expired without any payment can never be paid or fulfilled (the watcher ignores it and
 * `expired` is terminal), so the claim may be re-approved with a fresh order. Anything else stays bound.
 */
export function expiredUnpaid(o: Order | undefined): boolean {
  return !!o && o.status === "expired" && !o.txid;
}
export function reserveSponsoredOrder(campaignId: string, row: typeof import("./db/schema").orders.$inferInsert) {
  return db().$client.transaction(() => {
    const c = campaign(campaignId);
    const player = claimForCampaign(campaignId);
    if (!player || !player.choice) throw new CampaignError(409, "Wait for the player to finish the mission.");
    const previous = player.order_id ? getOrder(player.order_id) : undefined;
    if (player.order_id && !expiredUnpaid(previous)) return previous!;
    if (c.expires_at <= Date.now()) throw new CampaignError(410, "Campaign expired.");
    const chosen = JSON.parse(player.choice) as Choice;
    checkChoice(c, chosen);
    assertProgramPurchase(player, chosen.kind);
    const reapproval = player.state === "ordered" && expiredUnpaid(previous);
    if ((player.state !== "proposed" && !reapproval) || row.buyerPubKey !== player.buyer_key || row.productId !== chosen.productId || row.packageValue !== chosen.packageValue || row.priceUsdCents !== chosen.priceCents || row.type !== chosen.kind) {
      throw new CampaignError(409, "Reward or recipient changed. Reload before approving.");
    }
    // One dedupe key per approval attempt: the first is the claim itself, a retry is keyed to the expired order.
    const key = reapproval ? `reward-claim:${player.id}:after:${previous!.id}` : `reward-claim:${player.id}`;
    const order = reserveOrder(row, key, true);
    db().$client.prepare("UPDATE reward_claims SET state='ordered', order_id=?, updated_at=? WHERE id=?").run(order.id, Date.now(), player.id);
    return order;
  }).immediate();
}
export function canReadRewardOrder(orderId: string, token: string) {
  const row = db().$client.prepare("SELECT secret_hash FROM reward_claims WHERE order_id=?").get(orderId) as { secret_hash: string } | undefined;
  return !row || secretMatches(token, row.secret_hash);
}
export function sponsorSummary(c: Campaign) {
  const p = claimForCampaign(c.id);
  const o: Order | undefined = p?.order_id ? getOrder(p.order_id) : undefined;
  return { id: c.id, title: c.title, budgetCents: c.budget_cents, country: c.country, expiresAt: c.expires_at,
    program: publicProgram(c.id),
    claimed: p ? 1 : 0, delivered: o?.status === "delivered" ? 1 : 0,
    reservedCents: o && ["awaiting_payment", "payment_seen", "paid", "fulfilling", "failed_uncertain"].includes(o.status) ? o.priceUsdCents : 0,
    deliveredCents: o?.status === "delivered" ? o.priceUsdCents : 0, status: o?.status ?? p?.state ?? "available",
    choice: p?.choice ? JSON.parse(p.choice) as Choice : null };
}
