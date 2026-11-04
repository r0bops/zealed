"use client";
import { set } from "idb-keyval";
import { useEffect, useRef, useState } from "react";
import { createOrderKey } from "@/lib/keystore";
import { QR, button, buttonSecondary, panel, request } from "../reward-ui";

type ClaimSession = { invitation: string; publicKey?: string; secret?: string; claimId?: string };
type MissionInvitation = { expired: boolean; claimed: boolean; missionLabel?: string; missionAttendance?: boolean };
type ProofRequest = Awaited<ReturnType<typeof import("@reclaimprotocol/js-sdk").ReclaimProofRequest.fromJsonString>>;
type Phase = "idle" | "starting" | "ready" | "submitting";

const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Says which mission the player faces, so a quiz fallback is never mistaken for a verified proof. */
export function MissionModeNote({ mode }: { mode?: "reclaim" | "quiz" }) {
  return <p className="text-xs text-muted" data-mission-mode={mode ?? "quiz"}>
    Mission mode: {mode === "reclaim" ? "Reclaim zkTLS proof of a web-account fact." : "quiz. Reclaim zkTLS verification is not configured on this server."}
  </p>;
}

/**
 * Reclaim mission. The server creates the proof request (it holds the app secret) bound to this campaign and this
 * browser's public key. The proof goes straight from Reclaim to this page and on to the claim endpoint, which checks it
 * in memory. Zealed never stores the account data inside the proof.
 */
export function ReclaimVerify({ campaignId, storageKey, session, invitation, onSession }: {
  campaignId: string; storageKey: string; session: ClaimSession | null; invitation: MissionInvitation; onSession: (next: ClaimSession) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle"), [link, setLink] = useState(""), [error, setError] = useState("");
  const flow = useRef<ProofRequest | null>(null);
  useEffect(() => () => { void flow.current?.cancelSession(); }, []);
  const blocked = invitation.expired || invitation.claimed && !session?.secret;

  async function submit(creds: ClaimSession, proofs: unknown[]) {
    setPhase("submitting"); setError("");
    try {
      if (!proofs.length) throw new Error("Reclaim returned no proof. Start the verification again.");
      const result = await request<{ id: string }>(`/api/campaigns/${campaignId}/claim`, creds.invitation, { proofs, publicKey: creds.publicKey, secret: creds.secret });
      const next = { ...creds, claimId: result.id };
      await set(storageKey, next); onSession(next);
    } catch (e) { setError((e as Error).message); setPhase("idle"); setLink(""); }
  }

  async function start() {
    if (!session) { setError("Reopen the invitation."); return; }
    void flow.current?.cancelSession(); flow.current = null;
    setPhase("starting"); setError(""); setLink("");
    try {
      let next = session;
      if (!next.publicKey || !next.secret) {
        const kp = await createOrderKey();
        next = { ...next, publicKey: kp.publicKey, secret: randomSecret() };
        await set(storageKey, next); onSession(next);
      }
      const creds = next;
      const { request: json } = await request<{ request: string }>(`/api/campaigns/${campaignId}/reclaim`, creds.invitation, { publicKey: creds.publicKey });
      const { ReclaimProofRequest } = await import("@reclaimprotocol/js-sdk");
      const proofRequest = await ReclaimProofRequest.fromJsonString(json);
      flow.current = proofRequest;
      setLink(await proofRequest.getRequestUrl());
      await proofRequest.startSession({
        onSuccess: proofs => { void submit(creds, Array.isArray(proofs) ? proofs : [proofs]); },
        onError: e => { setError(e?.name === "TimeoutError" ? "Verification timed out. Start again." : "Verification did not finish. Start again."); setPhase("idle"); setLink(""); },
      });
      setPhase("ready");
    } catch (e) { setError((e as Error).message || "Could not start verification."); setPhase("idle"); }
  }

  async function open() {
    try { await flow.current?.triggerReclaimFlow(); } catch { setError("Your browser blocked the verification window. Use the link or QR code below."); }
  }

  return <section className={panel} aria-busy={phase === "starting" || phase === "submitting"}>
    <h2 className="text-lg font-semibold">{invitation.missionAttendance ? "Attendee check" : "A short verified mission"}</h2>
    <p className="font-medium">{invitation.missionLabel ?? "Prove a fact about one of your web accounts"}</p>
    <p className="text-sm text-muted">{invitation.missionAttendance
      ? "Zealed never sees your email or Luma account; we keep a one-way code so each attendee can claim once."
      : "Reclaim creates a zkTLS proof from your own logged-in session. Zealed checks the proof once to reserve your reward and does not store the account details inside it."}</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {phase === "idle" || phase === "starting"
      ? <button className={button} disabled={blocked || phase === "starting"} onClick={() => void start()}>
          {phase === "starting" ? "Preparing verification…" : invitation.claimed && !session?.secret ? "Invitation already claimed" : "Start Reclaim verification"}
        </button>
      : phase === "submitting"
        ? <p role="status">Proof received. Checking it and reserving your reward…</p>
        : <>
            <button className={button} onClick={() => void open()}>Open Reclaim verification</button>
            <p role="status" className="text-sm text-muted">Waiting for your proof. Keep this page open; it continues automatically.</p>
            {link && <details className="text-sm"><summary className="min-h-11 cursor-pointer py-2">Verify on your phone or open the link yourself</summary>
              <div className="flex flex-col items-start gap-3 pt-2"><QR value={link} label="QR code for the Reclaim verification" size={180} />
                <a className={buttonSecondary + " inline-flex items-center"} href={link} target="_blank" rel="noopener noreferrer">Open verification link</a></div>
            </details>}
            <button className="min-h-11 self-start text-sm underline" onClick={() => void start()}>Start over</button>
          </>}
    <p className="text-xs text-muted">Five attempts per invitation. A proof that fails verification uses one.</p>
  </section>;
}
