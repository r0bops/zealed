"use client";
import { get, set } from "idb-keyval";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createOrderKey, rememberOrder, loadKey } from "@/lib/keystore";
import { PaymentPanel } from "../../order-details";
import { Chest, Details, ErrorNote, LoadingLine, RewardLayout, button, buttonSecondary, choiceButton, field, panel, request, formatUsd } from "../../reward-ui";
import { ClaimStepper, stepFromClaim } from "../../claim-stepper";
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
  const [reload, setReload] = useState(0), [orderStatus, setOrderStatus] = useState<string | null>(null);
  const onOrderStatus = useCallback((next: string) => setOrderStatus(prev => prev === next ? prev : next), []);
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
      if (answer === "") throw new Error("Choose an answer first.");
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
  const step = stepFromClaim({
    joined: !!invitation,
    missionDone: !!session?.claimId,
    rewardPicked: !!status?.choice,
    orderId: status?.orderId ?? null,
    orderStatus,
  });
  const failed = status?.state === "selection_failed" || orderStatus === "failed" || orderStatus === "failed_uncertain" || orderStatus === "expired";
  if (invitation?.program && session) return <ProgramPlayer campaignId={campaignId} session={session} title={invitation.title} expired={invitation.expired} program={invitation.program} onSession={setSession} />;
  const budget = invitation ? formatUsd(invitation.budgetCents) : "";
  return <RewardLayout title={invitation?.title ?? "Claim reward"} role="claim">
    <ClaimStepper current={step} failed={failed} />
    {error && !invitation && <ErrorNote message={error} onRetry={() => setReload(r => r + 1)} />}
    {error && invitation && <ErrorNote message={error} primary={false} onRetry={() => setReload(r => r + 1)} />}
    {!invitation && !error && <LoadingLine>Preparing your mission…</LoadingLine>}
    {invitation && <><p className="text-muted">One reward up to {budget} for use in {invitation.country}. Your sponsor approves it with Zcash. The code stays in this browser.</p>
      {!session?.claimId && invitation.missionMode !== "email" && <MissionModeNote mode={invitation.missionMode} />}
      {!session?.claimId && invitation.missionMode === "email" && <EmailVerify campaignId={campaignId} storageKey={storageKey} session={session} invitation={invitation} onSession={setSession} />}
      {!session?.claimId && invitation.missionMode === "reclaim" && <ReclaimVerify campaignId={campaignId} storageKey={storageKey} session={session} invitation={invitation} onSession={setSession} />}
      {!session?.claimId && invitation.missionMode !== "reclaim" && invitation.missionMode !== "email" && <form className={panel} onSubmit={complete}>
        <h2 className="text-lg font-semibold">A short question</h2>
        <p className="text-base text-muted">Pick one answer to reserve your reward.</p>
        <fieldset className="flex flex-col gap-3"><legend className="mb-1 text-base font-medium">{invitation.mission.question}</legend>{invitation.mission.options.map((option, i) => {
          const on = answer === String(i);
          return <button type="button" key={option} aria-pressed={on} className={`${choiceButton} ${on ? "border-accent bg-accent-soft" : "border-line bg-background"}`} onClick={() => setAnswer(String(i))}>{option}</button>;
        })}</fieldset>
        <button className={button} disabled={busy || answer === "" || invitation.expired || invitation.claimed && !session?.secret}>{busy ? "Reserving your reward…" : invitation.claimed && !session?.secret ? "Invitation already claimed" : "Reserve my reward"}</button>
        <p className="text-sm text-muted">This is a short activity, not an identity check. You can try five times.</p>
      </form>}
      {session?.claimId && !status && <LoadingLine>Checking your reward…</LoadingLine>}
      {session?.claimId && status && !status.choice && <form className={panel} onSubmit={e => { e.preventDefault(); void run(async () => {
        await request(`/api/claims/${session.claimId}/select`, session.secret!, { purpose, days: Number(days), esimCompatible: compatible });
        setStatus(await request<Status>(`/api/claims/${session.claimId}`, session.secret!));
      }); }}>
        <h2 className="text-lg font-semibold">What should we get you?</h2>
        <p className="text-base text-muted">We match the sponsor’s allowed rewards to what you need. Don’t enter a phone number or other personal details.</p>
        {status.state === "selection_failed" && <p role="status" className="text-base">We couldn’t find a match. Try a different choice.</p>}
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="What would you use?">
          {([["connectivity", "Mobile data"], ["gift", "Gift card"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={purpose === value} className={`${choiceButton} ${purpose === value ? "border-accent bg-accent-soft" : "border-line bg-background"}`} onClick={() => setPurpose(value)}>{label}</button>)}
        </div>
        <label className="flex flex-col gap-2 text-base">How many days?<input className={field} inputMode="numeric" pattern="[0-9]{1,2}" required value={days} onChange={e => setDays(e.target.value)} /></label>
        {purpose === "connectivity" && <label className="flex min-h-12 items-start gap-3 text-base"><input type="checkbox" className="mt-1" checked={compatible} onChange={e => setCompatible(e.target.checked)} />My phone supports eSIM and is unlocked. I’ll check that this package works where I am.</label>}
        <button disabled={busy || purpose === "connectivity" && !compatible} className={button}>{busy || status.state === "selecting" ? "Finding a reward that fits…" : "Find my reward"}</button>
        <p className="text-sm text-muted">Up to three tries. If nothing fits, nothing is purchased.</p>
      </form>}
      {status?.choice && !status.orderId && <section className={panel}>
        <h2 className="text-lg font-semibold">{status.choice.productName}</h2>
        <p className="text-base">{status.choice.packageValue}</p>
        <p className="text-base font-medium">{formatUsd(status.choice.priceCents)} of {budget} budget</p>
        <p className="text-base text-muted">{status.choice.reason}</p>
        <Chest open={false} />
        <p role="status" className="text-base">Waiting for the sponsor to approve. Your reward will appear here.</p>
      </section>}
      {ready && status?.orderId && <PaymentPanel orderId={status.orderId} compact budgetCents={invitation?.budgetCents} onStatus={onOrderStatus} />}
      {session?.publicKey && <section className={panel}><h2 className="font-semibold">Keep this reward on this browser</h2><p className="text-base text-muted">This browser stores what opens your reward. Clearing site data can remove it. A backup does not move the reward to another device.</p><button type="button" className={buttonSecondary} onClick={() => void run(async () => { const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("This browser is missing the key that opens your reward."); setBackup(kp.backup); })}>Show backup</button>{backup && <><label className="flex flex-col gap-2 text-base">Backup<textarea className={field + " font-mono text-sm break-all"} readOnly value={backup} /></label><button type="button" className={buttonSecondary} onClick={() => setBackup("")}>Hide backup</button><Details><p>The backup alone cannot open the reward on another device.</p></Details></>}</section>}
    </>}
  </RewardLayout>;
}
