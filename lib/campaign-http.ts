import { CampaignError } from "./campaigns";
import { ReservationError } from "./orders";
export function campaignResponse(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
export function campaignFailure(e: unknown) {
  return campaignResponse({ error: e instanceof CampaignError || e instanceof ReservationError ? e.message : "Could not complete the request. Retry or contact the organizer." }, e instanceof CampaignError || e instanceof ReservationError ? e.status : 503);
}
export async function readBody(req: Request) {
  const raw = await req.text();
  if (raw.length > 8192) throw new CampaignError(413, "Request too large.");
  try { return JSON.parse(raw); } catch { throw new CampaignError(400, "Invalid request."); }
}
