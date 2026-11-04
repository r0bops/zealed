"use client";
import { get, set } from "idb-keyval";
import { useEffect, useState, type FormEvent } from "react";
import { createOrderKey, rememberOrder, loadKey } from "@/lib/keystore";
import { PaymentPanel } from "../../order-details";
import { RewardLayout, field, button, panel, request } from "../../reward-ui";
import { Steps } from "../../role-switch";
import { MissionModeNote, ReclaimVerify } from "../reclaim-verify";
import { EmailVerify } from "../email-verify";
import type { Choice } from "@/lib/campaigns";
import { ProgramPlayer } from "../../program-player";
import type { PublicProgram } from "@/lib/program-schema";
type Session = { invitation: string; publicKey?: string; secret?: string; claimId?: string };
type Invitation = { program?: PublicProgram; title: string; country: string; budgetCents: number; claimed: boolean; expired: boolean; expiresAt: number; mission: { question: string; options: string[] }; missionMode?: "reclaim" | "quiz" | "email"; missionLabel?: string; attendeeEventId?: string };
type Status = { id: string; state: string; choice: Choice | null; orderId: string | null };
export function PlayerClaim({ campaignId }: { campaignId: string }) {
  const storageKey = `zealed:claim:${campaignId}`;
  const [session, setSession] = useState<Session | null>(null), [invitation, setInvitation] = useState<Invitation | null>(null), [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [answer, setAnswer] = useState(""), [purpose, setPurpose] = useState("connectivity"), [days, setDays] = useState("7"), [compatible, setCompatible] = useState(false), [backup, setBackup] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    (async () => {
      let saved = await get<Session>(storageKey);
      const fragment = location.hash.slice(1);
      if (/^[A-Za-z0-9_-]{43}$/.test(fragment)) {
        if (!saved) { saved = { invitation: fragment }; await set(storageKey, saved); }
        history.replaceState(null, "", location.pathname);
      }
      if (!saved) throw new Error("Open the complete invitation link supplied by your sponsor.");
      const info = await request<Invitation>(`/api/campaigns/${campaignId}`, saved.invitation);
      if (live) { setSession(saved); setInvitation(info); setError(""); }
    })().catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [campaignId, storageKey, reload]);
  useEffect(() => {
    if (!session?.claimId || !session.secret || !session.publicKey) return;
    let live = true;
    const current = session;
    async function refresh() {
      try {
        const s = await request<Status>(`/api/claims/${current.claimId}`, current.secret!);
        if (s.orderId) await rememberOrder(s.orderId, current.publicKey!, current.secret);
        if (live) { setStatus(s); setReady(!!s.orderId); }
      } catch (e) { if (live) setError((e as Error).message); }
    }
    void refresh(); const timer = setInterval(refresh, 3000);
    return () => { live = false; clearInterval(timer); };
  }, [session]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  async function complete(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      if (!session) throw new Error("Reopen the invitation.");
      let next = session;
      if (!next.secret || !next.publicKey) {
        const kp = await createOrderKey();
        const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        next = { ...next, publicKey: kp.publicKey, secret };
        await set(storageKey, next); setSession(next);
      }
      const result = await request<{ id: string }>(`/api/campaigns/${campaignId}/claim`, next.invitation, { answer: Number(answer), publicKey: next.publicKey, secret: next.secret });
      next = { ...next, claimId: result.id }; await set(storageKey, next); setSession(next);
    });
  }
  const claimStep = !session?.claimId ? 0 : !status?.choice ? 1 : !status.orderId ? 2 : 3;
  if (invitation?.program && session) return <ProgramPlayer campaignId={campaignId} session={session} title={invitation.title} expired={invitation.expired} program={invitation.program} onSession={setSession} />;
  return <RewardLayout title={invitation?.title ?? "Claim a reward"} role="claim">
    {error && <div role="alert" className="rounded-lg border border-danger p-3 text-sm"><p className="text-danger">{error}</p><button className="min-h-11 underline" onClick={() => setReload(r => r + 1)}>Reload invitation</button></div>}
    {!invitation && !error && <p role="status">Loading invitation…</p>}
    {invitation && <><p className="text-muted">One reward up to ${(invitation.budgetCents / 100).toFixed(2)} for use in {invitation.country}. Your sponsor authorises the purchase; your browser receives the encrypted result.</p>
      <Steps label="Your claim progress" steps={["Mission", "Pick a perk", "Sponsor approves", "Open your reward"]} current={claimStep} />
      {!session?.claimId && invitation.missionMode !== "email" && <MissionModeNote mode={invitation.missionMode} />}
      {!session?.claimId && invitation.missionMode === "email" && <EmailVerify campaignId={campaignId} storageKey={storageKey} session={session} invitation={invitation} onSession={setSession} />}
      {!session?.claimId && invitation.missionMode === "reclaim" && <ReclaimVerify campaignId={campaignId} storageKey={storageKey} session={session} invitation={invitation} onSession={setSession} />}
      {!session?.claimId && invitation.missionMode !== "reclaim" && invitation.missionMode !== "email" && <form className={panel} onSubmit={complete}>
        <h2 className="text-lg font-semibold">A short privacy mission</h2>
        <p className="text-sm text-muted">A broadcast is only a request to the network. Zealed waits for confirmation and checks the recipient, amount and order memo before fulfillment.</p>
        <fieldset className="flex flex-col gap-2"><legend className="mb-3 font-medium">{invitation.mission.question}</legend>{invitation.mission.options.map((option, i) => <label key={option} className="flex min-h-11 items-center gap-3 rounded-lg border border-line p-3 text-sm"><input type="radio" name="answer" required value={i} checked={answer === String(i)} onChange={e => setAnswer(e.target.value)} />{option}</label>)}</fieldset>
        <button className={button} disabled={busy || invitation.expired || invitation.claimed && !session?.secret}>{busy ? "Reserving your invitation…" : invitation.claimed && !session?.secret ? "Invitation already claimed" : "Complete mission & reserve reward"}</button>
        <p className="text-xs text-muted">This is a learning activity, not proof of identity or attendance. Five answer attempts per invitation.</p>
      </form>}
      {session?.claimId && !status && <p role="status">Loading your claim…</p>}
      {session?.claimId && status && !status.choice && <form className={panel} onSubmit={e => { e.preventDefault(); void run(async () => {
        await request(`/api/claims/${session.claimId}/select`, session.secret!, { purpose, days: Number(days), esimCompatible: compatible });
        setStatus(await request<Status>(`/api/claims/${session.claimId}`, session.secret!));
      }); }}>
        <h2 className="text-lg font-semibold">Find your perk</h2><p className="text-sm text-muted">The agent compares the sponsor’s allowed products against your needs. Do not enter phone numbers or personal details.</p>
        <label className="flex flex-col gap-2">What would you use?<select className={field} value={purpose} onChange={e => setPurpose(e.target.value)}><option value="connectivity">Mobile data eSIM</option><option value="gift">Gift card or voucher</option></select></label>
        <label className="flex flex-col gap-2">Duration in days<input className={field} inputMode="numeric" pattern="[0-9]{1,2}" required value={days} onChange={e => setDays(e.target.value)} /></label>
        {purpose === "connectivity" && <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" checked={compatible} onChange={e => setCompatible(e.target.checked)} />My phone supports eSIM and is carrier-unlocked. I will verify this package’s coverage and installation requirements.</label>}
        <button disabled={busy || purpose === "connectivity" && !compatible} className={button}>{busy || status.state === "selecting" ? "Selecting… (retry after 90 seconds if interrupted)" : "Ask agent to select a reward"}</button>
        <p className="text-xs text-muted">Up to three selection attempts. No suitable option means no purchase.</p>
      </form>}
      {status?.choice && <section className={panel}><h2 className="font-semibold">{status.choice.productName}</h2><p>{status.choice.packageValue} · ${(status.choice.priceCents / 100).toFixed(2)}</p><p className="text-sm text-muted">{status.choice.reason}</p>{!status.orderId && <p role="status">Waiting for sponsor approval and payment. Keep this browser’s storage to recover your reward.</p>}</section>}
      {ready && status?.orderId && <PaymentPanel orderId={status.orderId} compact />}
      {session?.publicKey && <section className={panel}><h2 className="font-semibold">Keep access to your reward</h2><p className="text-sm text-muted">This browser stores your claim access and decryption key. Clearing site storage can lose access. Save the key privately; it is never sent to the sponsor.</p><button className={button} onClick={() => void run(async () => { const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("The decryption key is missing from this browser."); setBackup(kp.backup); })}>Show private key backup</button>{backup && <><label className="flex flex-col gap-2 text-sm">Private backup<textarea className={field + " font-mono break-all"} readOnly value={backup} /></label><button className="min-h-11 text-sm underline" onClick={() => setBackup("")}>Hide backup</button><p className="text-xs text-muted">The key alone does not restore claim authorization on another device. Cross-device claim recovery is not supported yet.</p></>}</section>}
    </>}
  </RewardLayout>;
}
