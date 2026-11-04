"use client";
import { set } from "idb-keyval";
import { useState } from "react";
import { attendeeHashBrowser, looksLikeEmail } from "@/lib/attendee-hash";
import { createOrderKey } from "@/lib/keystore";
import { button, panel, request } from "../reward-ui";

type ClaimSession = { invitation: string; publicKey?: string; secret?: string; claimId?: string; attendee?: string };
type EmailInvitation = { expired: boolean; claimed: boolean; attendeeEventId?: string };

const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * Email-list mission. The organizer imported the event's approved guests as one-way hashes. The player types the
 * email they registered with; this browser hashes it and sends only the hash, so Zealed never receives the email.
 * Each attendee can claim once.
 */
export function EmailVerify({ campaignId, storageKey, session, invitation, onSession }: {
  campaignId: string; storageKey: string; session: ClaimSession | null; invitation: EmailInvitation; onSession: (next: ClaimSession) => void;
}) {
  const [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const blocked = invitation.expired || (invitation.claimed && !session?.secret) || !invitation.attendeeEventId;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return setError("Reopen the invitation.");
    if (!looksLikeEmail(email)) return setError("Enter the email you used to register on Luma.");
    setBusy(true); setError("");
    try {
      let next = session;
      if (!next.publicKey || !next.secret) {
        const kp = await createOrderKey();
        next = { ...next, publicKey: kp.publicKey, secret: randomSecret() };
        await set(storageKey, next); onSession(next);
      }
      const emailHash = await attendeeHashBrowser(invitation.attendeeEventId!, email);
      setEmail(""); // the plain email leaves component state as soon as it's hashed
      const result = await request<{ id: string; attendee?: string }>(`/api/campaigns/${campaignId}/claim`, next.invitation, { emailHash, publicKey: next.publicKey, secret: next.secret });
      const done = { ...next, claimId: result.id, attendee: result.attendee };
      await set(storageKey, done); onSession(done);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form className={panel} onSubmit={submit}>
      <h2 className="text-lg font-semibold">Approved attendees only</h2>
      <p className="text-sm text-muted">Enter the email you registered with on Luma. Your browser turns it into a one-way hash and sends only that, so Zealed never sees your email. Each attendee can claim once.</p>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Luma email</span>
        <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} placeholder="you@example.com"
          className="min-h-11 rounded-lg border border-line bg-background px-3 py-2 outline-none focus-visible:border-accent" />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <button className={button} disabled={busy || blocked}>{busy ? "Checking the attendee list…" : invitation.claimed && !session?.secret ? "Invitation already claimed" : "Check & reserve my reward"}</button>
      <p className="text-xs text-muted" data-mission-mode="email">Mission mode: approved-attendee email list (hashed in your browser).</p>
    </form>
  );
}
