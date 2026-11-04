import { publicProgram } from "@/lib/program";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import { acquireClaim, bearer, CampaignError, claimForCampaign, invitation } from "@/lib/campaigns";
import { isPublicKey } from "@/lib/sodium";
import { campaignFailure, campaignResponse, readBody } from "@/lib/campaign-http";
import { MissionProofError, reclaimEnabled, verifyMissionProof, type MissionProofResult } from "@/lib/reclaim";
import { attendeeEventId, attendeeNullifier, attendeePseudonym, emailModeEnabled, isApprovedAttendee } from "@/lib/attendees";
import { ATTENDEE_HASH_RE } from "@/lib/attendee-hash";
const credentials = { publicKey: z.string().max(100), secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) };
const input = z.object({ answer: z.number().int().min(0).max(2), ...credentials });
const proofInput = z.object({ proofs: z.unknown(), ...credentials });
const emailInput = z.object({ emailHash: z.string().regex(ATTENDEE_HASH_RE), ...credentials });
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "claim", 10, 60_000);
  if (limited) return limited;
  try {
    const { id } = await ctx.params;
    if (publicProgram(id)) {
      const body = z.object(credentials).safeParse(await readBody(req));
      if (!body.success || !await isPublicKey(body.data.publicKey)) throw new CampaignError(400, "Invalid claim credentials.");
      const c = acquireClaim(id, bearer(req), 1, body.data.publicKey, body.data.secret);
      return campaignResponse({ id: c.id, state: c.state });
    }
    if (emailModeEnabled()) return await claimWithEmailHash(req, id);
    if (reclaimEnabled()) return await claimWithProof(req, id);
    const body = input.safeParse(await readBody(req));
    if (!body.success || !await isPublicKey(body.data.publicKey)) throw new CampaignError(400, "Invalid claim credentials.");
    const c = acquireClaim(id, bearer(req), body.data.answer, body.data.publicKey, body.data.secret);
    return campaignResponse({ id: c.id, state: c.state });
  } catch (e) { return campaignFailure(e); }
}
// Email-list mode: the browser sends only the one-way hash of the attendee's email. An approved hash claims once
// per event (the keyed nullifier is unique in attendance_nullifiers); the raw email never reaches the server.
async function claimWithEmailHash(req: Request, id: string) {
  const body = emailInput.safeParse(await readBody(req));
  if (!body.success || !await isPublicKey(body.data.publicKey)) throw new CampaignError(400, "Enter the email you registered with on Luma.");
  const eventId = attendeeEventId()!;
  const { emailHash, publicKey, secret } = body.data;
  const approved = isApprovedAttendee(eventId, emailHash);
  const nullifier = attendeeNullifier(eventId, emailHash);
  const claim = acquireClaim(id, bearer(req), approved ? 1 : 0, publicKey, secret, {
    failure: approved ? undefined : "That email isn't on the approved attendee list for this event.",
    attendance: approved ? { eventId, nullifier } : undefined,
  });
  return campaignResponse({ id: claim.id, state: claim.state, attendee: attendeePseudonym(nullifier) });
}
// Reclaim mode: the quiz answer is not accepted. Proofs are verified in memory and never stored or logged.
async function claimWithProof(req: Request, id: string) {
  const body = proofInput.safeParse(await readBody(req, 256 * 1024));
  if (!body.success || !await isPublicKey(body.data.publicKey)) throw new CampaignError(400, "Invalid claim credentials.");
  if (body.data.proofs === undefined) throw new CampaignError(400, "This mission needs a Reclaim proof. Reload the invitation.");
  const { publicKey, secret, proofs } = body.data, token = bearer(req);
  const c = invitation(id, token); // authorize before contacting Reclaim
  let proved: MissionProofResult | undefined, failure: string | undefined;
  // A claimed, expired or exhausted invitation needs no proof check: acquireClaim settles those before counting an attempt.
  if (!claimForCampaign(id) && c.expires_at > Date.now() && c.attempts < 5) {
    try {
      proved = await verifyMissionProof(proofs, id, publicKey);
    } catch (e) {
      if (e instanceof MissionProofError && !e.countsAsAttempt) throw new CampaignError(503, e.message);
      failure = e instanceof MissionProofError ? e.message : "The proof did not verify for this mission.";
    }
  }
  // A failed proof is a failed attempt, exactly like a wrong quiz answer. Attendance stores only the one-way nullifier.
  const attendance = proved?.eventId && proved.nullifier ? { eventId: proved.eventId, nullifier: proved.nullifier } : undefined;
  const claim = acquireClaim(id, token, proved ? 1 : 0, publicKey, secret, { failure, attendance });
  return campaignResponse({ id: claim.id, state: claim.state });
}
