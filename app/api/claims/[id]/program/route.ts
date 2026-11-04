import { z } from "zod";
import { bearer, claim, CampaignError } from "@/lib/campaigns";
import { programStatus, submitTask, reservePrize, acknowledgePrize } from "@/lib/program";
import { campaignResponse, campaignFailure, readBody } from "@/lib/campaign-http";
import { rateLimit } from "@/lib/rate-limit";
const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("task"), taskId: z.string().uuid(), answer: z.number().int().optional(), evidence: z.string().max(1000).optional(), code: z.string().max(80).optional() }),
  z.object({ action: z.literal("redeem"), prizeId: z.string().uuid(), address: z.string().max(1024).optional() }),
  z.object({ action: z.literal("acknowledge") }),
]);
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try { const c = claim((await ctx.params).id, bearer(req)); return campaignResponse(programStatus(c)); } catch (e) { return campaignFailure(e); }
}
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "program-action", 20, 60_000); if (limited) return limited;
  try {
    const c = claim((await ctx.params).id, bearer(req)), parsed = action.safeParse(await readBody(req));
    if (!parsed.success) throw new CampaignError(400, "Invalid mission or reward request.");
    const d = parsed.data;
    if (d.action === "task") submitTask(c, d.taskId, d.answer, d.evidence, d.code);
    if (d.action === "redeem") reservePrize(c, d.prizeId, d.address);
    if (d.action === "acknowledge") acknowledgePrize(c);
    return campaignResponse(programStatus(c));
  } catch (e) { return campaignFailure(e); }
}
