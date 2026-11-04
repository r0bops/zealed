"use client";
import { set } from "idb-keyval";
import { useEffect, useRef, useState } from "react";
import { createOrderKey } from "@/lib/keystore";
import { Details, QR, button, buttonSecondary, humanizeError, panel, request } from "../reward-ui";

type ClaimSession = { invitation: string; publicKey?: string; secret?: string; claimId?: string };
type MissionInvitation = { expired: boolean; claimed: boolean; missionLabel?: string; missionAttendance?: boolean };
type ProofRequest = Awaited<ReturnType<typeof import("@reclaimprotocol/js-sdk").ReclaimProofRequest.fromJsonString>>;
type Phase = "idle" | "starting" | "ready" | "submitting";

const randomSecret = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Says which mission the player faces, without putting protocol names on the main view. */
export function MissionModeNote({ mode }: { mode?: "reclaim" | "quiz" }) {
  return <p className="sr-only" data-mission-mode={mode ?? "quiz"}>
    {mode === "reclaim" ? "This step checks one fact from an account you already use." : "Answer one short question."}
  </p>;
}

function plainLabel(label?: string): string {
  if (!label) return "Confirm one fact from an account you already use.";
  const cleaned = label.replace(/\s+with\s+Reclaim\.?$/i, ".").replace(/Reclaim\s*/gi, "").replace(/zkTLS\s*/gi, "").replace(/\s{2,}/g, " ").replace(/\s+\./g, ".").trim();
  return cleaned || "Confirm one fact from an account you already use.";
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

  const nice = error ? humanizeError(error) : null;
  return <section className={panel} aria-busy={phase === "starting" || phase === "submitting"}>
    <h2 className="text-lg font-semibold">{invitation.missionAttendance ? "Attendee check" : "Confirm this step"}</h2>
    <p className="text-base font-medium">{plainLabel(invitation.missionLabel)}</p>
    <p className="text-base text-muted">{invitation.missionAttendance
      ? "We check that you’re on the approved list, then reserve the reward. Account details are not stored."
      : "You’ll confirm one fact in a window we open. We don’t store the account details."}</p>
    {nice && <p role="alert" className="text-base text-danger">{nice.text}</p>}
    {nice?.detail && <Details><p className="font-mono text-xs">{nice.detail}</p></Details>}
    {phase === "idle" || phase === "starting"
      ? <button className={button} disabled={blocked || phase === "starting"} onClick={() => void start()}>
          {phase === "starting" ? "Preparing this step…" : invitation.claimed && !session?.secret ? "Invitation already claimed" : error ? "Try again" : "Start verification"}
        </button>
      : phase === "submitting"
        ? <p role="status" className="text-base">Checking that step and reserving your reward…</p>
        : <>
            <button className={button} onClick={() => void open()}>Continue verification</button>
            <p role="status" className="text-base text-muted">Keep this page open. It finishes on its own.</p>
            {link && <Details>
              <p>Or do this step on your phone.</p>
              <QR value={link} label="QR code for verification" size={180} />
              <a className={buttonSecondary} href={link} target="_blank" rel="noopener noreferrer">Open the link</a>
            </Details>}
            <button type="button" className={buttonSecondary} onClick={() => void start()}>Start over</button>
          </>}
    <p className="text-sm text-muted">You can try five times.</p>
  </section>;
}
