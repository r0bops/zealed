import { createHmac } from "node:crypto";
import { z } from "zod";
import { db } from "./db/client";
import { campaign, claimForCampaign, CampaignError, type Claim } from "./campaigns";
import { serverSecret } from "./server-secret";
import { programInput, type ProgramInput, type PublicProgram, type TaskResult, type Redemption, type ProgramStatus } from "./program-schema";

type Stored = PublicProgram & { answers: Record<string, string> };
const answerHash = (id: string, answer: number) => createHmac("sha256", serverSecret("quiz")).update(`${id}:${answer}`).digest("hex");
export function storeProgram(id: string, input: ProgramInput) {
  const parsed = programInput.parse(input), answers: Record<string, string> = {};
  const tasks = parsed.tasks.map(t => {
    const taskId = crypto.randomUUID();
    if (t.kind === "quiz") { answers[taskId] = answerHash(taskId, t.answer); return { id: taskId, kind: t.kind, title: t.title, options: t.options }; }
    return { ...t, id: taskId };
  });
  db().$client.prepare("INSERT INTO campaign_programs(campaign_id,config) VALUES (?,?)").run(id, JSON.stringify({ tasks, answers, prizes: parsed.prizes.map(p => ({ ...p, id: crypto.randomUUID() })) }));
}
function stored(id: string): Stored | null {
  const row = db().$client.prepare("SELECT config FROM campaign_programs WHERE campaign_id=?").get(id) as { config: string } | undefined;
  return row ? JSON.parse(row.config) : null;
}
export function publicProgram(id: string): PublicProgram | null {
  const p = stored(id); return p ? { tasks: p.tasks, prizes: p.prizes } : null;
}
export function programStatus(c: Claim, admin = false): ProgramStatus | null {
  const p = publicProgram(c.campaign_id); if (!p) return null;
  const results = db().$client.prepare("SELECT task_id,status,evidence,attempts FROM mission_results WHERE claim_id=?").all(c.id) as TaskResult[];
  const redemption = db().$client.prepare("SELECT * FROM prize_redemptions WHERE claim_id=?").get(c.id) as Redemption | undefined;
  return { ...p, claimId: c.id, results, eligible: p.tasks.every(t => results.some(r => r.task_id === t.id && r.status === "approved")), redemption: redemption ? { ...redemption, sealed_payload: admin ? null : redemption.sealed_payload } : null, ...(admin ? { buyerKey: c.buyer_key } : {}) };
}
function live(c: Claim) {
  if (campaign(c.campaign_id).expires_at <= Date.now()) throw new CampaignError(410, "Campaign expired.");
}
export function assertProgramEligible(c: Claim) {
  const p = programStatus(c); if (!p) return;
  if (!p.eligible) throw new CampaignError(403, "Complete every required task before redeeming.");
}
export function assertProgramPurchase(c: Claim, kind?: string) {
  const p = programStatus(c); if (!p) return;
  assertProgramEligible(c);
  if (!p.redemption || !["giftcard", "esim"].includes(p.redemption.kind) || kind && p.redemption.kind !== kind) throw new CampaignError(403, "Select this reward type before preparing a purchase.");
}
export function submitTask(c: Claim, taskId: string, answer?: number, evidence?: string) {
  return db().$client.transaction(() => {
    live(c);
    const p = stored(c.campaign_id), task = p?.tasks.find(t => t.id === taskId);
    if (!p || !task) throw new CampaignError(404, "Task not found.");
    const current = programStatus(c)!;
    const previous = current.results.find(r => r.task_id === taskId);
    if (previous?.status === "approved") return;
    if (previous && previous.attempts >= 5) throw new CampaignError(429, "Task attempt limit reached.");
    if (current.redemption) throw new CampaignError(409, "Reward already reserved.");
    let status = "pending", proof: string | null = null;
    if (task.kind === "quiz") {
      if (!Number.isInteger(answer) || answer! < 0 || answer! >= task.options!.length) throw new CampaignError(400, "Choose an answer.");
      status = answerHash(taskId, answer!) === p.answers[taskId] ? "approved" : "rejected";
    } else {
      const url = z.url().max(1000).safeParse(evidence);
      if (!url.success || !["https:", "http:"].includes(new URL(url.data).protocol) || new URL(url.data).username || new URL(url.data).password) throw new CampaignError(400, "Supply a public evidence URL without credentials.");
      proof = url.data;
    }
    db().$client.prepare(`INSERT INTO mission_results(claim_id,task_id,status,evidence,attempts) VALUES (?,?,?,?,1)
      ON CONFLICT(claim_id,task_id) DO UPDATE SET status=excluded.status,evidence=excluded.evidence,attempts=mission_results.attempts+1`).run(c.id, taskId, status, proof);
  }).immediate();
}
export function reviewTask(campaignId: string, taskId: string, approved: boolean) {
  const c = claimForCampaign(campaignId); if (!c) throw new CampaignError(404, "No participant yet.");
  return db().$client.transaction(() => {
    live(c);
    const task = publicProgram(campaignId)?.tasks.find(t => t.id === taskId);
    if (!task || task.kind === "quiz") throw new CampaignError(400, "This task cannot be manually reviewed.");
    if (programStatus(c)?.redemption) throw new CampaignError(409, "Reward already reserved.");
    const changed = db().$client.prepare("UPDATE mission_results SET status=? WHERE claim_id=? AND task_id=? AND status='pending'").run(approved ? "approved" : "rejected", c.id, taskId);
    if (!changed.changes) throw new CampaignError(409, "No pending submission to review.");
  }).immediate();
}
export function reservePrize(c: Claim, prizeId: string, address?: string) {
  return db().$client.transaction(() => {
    live(c); assertProgramEligible(c);
    const p = programStatus(c)!, prize = p.prizes.find(r => r.id === prizeId);
    if (!prize) throw new CampaignError(404, "Reward not found.");
    if (p.redemption) {
      if (p.redemption.prize_id === prizeId && (p.redemption.address ?? undefined) === address) return;
      throw new CampaignError(409, "A reward is already reserved. It cannot be changed.");
    }
    if (c.choice || c.order_id) throw new CampaignError(409, "A purchase already exists.");
    if (prize.kind === "zcash" && (!address || !/^utest1[02-9ac-hj-np-z]{40,1000}$/.test(address))) throw new CampaignError(400, "Use a shielded testnet unified address with an Ironwood or Sapling receiver.");
    if (prize.kind !== "zcash" && address) throw new CampaignError(400, "Only a Zcash reward needs an address.");
    db().$client.prepare("INSERT INTO prize_redemptions(claim_id,prize_id,kind,state,address) VALUES (?,?,?,'requested',?)").run(c.id, prize.id, prize.kind, address ?? null);
  }).immediate();
}
export function deliverPrize(campaignId: string, data: { txid?: string; sealedPayload?: string }) {
  const c = claimForCampaign(campaignId); if (!c) throw new CampaignError(404, "No participant yet.");
  return db().$client.transaction(() => {
    assertProgramEligible(c);
    const r = programStatus(c)?.redemption;
    if (!r || r.state !== "requested") throw new CampaignError(409, "No reward awaiting fulfillment.");
    if (r.kind === "zcash") {
      if (!data.txid || !/^[a-f0-9]{64}$/.test(data.txid) || data.sealedPayload) throw new CampaignError(400, "Provide the broadcast transaction ID. It is not confirmation of delivery.");
    } else if (r.kind === "custom") {
      if (!data.sealedPayload || !/^[A-Za-z0-9_-]{65,16000}$/.test(data.sealedPayload) || data.txid) throw new CampaignError(400, "Seal the reward instructions to the participant first.");
    } else throw new CampaignError(400, "Bitrefill rewards use the sponsor payment flow.");
    db().$client.prepare("UPDATE prize_redemptions SET state='ready',txid=?,sealed_payload=? WHERE claim_id=?").run(data.txid ?? null, data.sealedPayload ?? null, c.id);
  }).immediate();
}
export function acknowledgePrize(c: Claim) {
  const r = programStatus(c)?.redemption;
  if (!r || !["zcash", "custom"].includes(r.kind) || !["ready", "acknowledged"].includes(r.state)) throw new CampaignError(409, "There is no delivered reward to acknowledge.");
  db().$client.prepare("UPDATE prize_redemptions SET state='acknowledged' WHERE claim_id=?").run(c.id);
}
