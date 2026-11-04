"use client";
import { useCallback, useEffect, useState } from "react";
import { set } from "idb-keyval";
import { createOrderKey, loadKey, rememberOrder } from "@/lib/keystore";
import { open } from "@/lib/sodium";
import type { ProgramStatus, PublicProgram } from "@/lib/program-schema";
import type { Choice } from "@/lib/campaigns";
import { Chest, Details, ErrorNote, LoadingLine, RewardLayout, button, buttonSecondary, choiceButton, field, formatUsd, panel, request } from "./reward-ui";
import { PaymentPanel } from "./order-details";
import { ClaimStepper, stepFromClaim } from "./claim-stepper";
type Session = { invitation: string; publicKey?: string; secret?: string; claimId?: string };
type Purchase = { choice: Choice | null; orderId: string | null; state: string };
export function ProgramPlayer({ campaignId, session, title, expired, onSession, program }: { campaignId: string; session: Session; title: string; expired: boolean; onSession: (s: Session) => void; program: PublicProgram }) {
  const [data, setData] = useState<ProgramStatus | null>(null), [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [inputs, setInputs] = useState<Record<string, string>>({});
  const [prizeId, setPrizeId] = useState(program.prizes[0]?.id ?? ""), [address, setAddress] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [days, setDays] = useState(7), [compatible, setCompatible] = useState(false), [privateText, setPrivateText] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null), [orderStatus, setOrderStatus] = useState<string | null>(null), [tick, setTick] = useState(0);
  const onOrderStatus = useCallback((next: string) => setOrderStatus(prev => prev === next ? prev : next), []);
  const url = `/api/claims/${session.claimId}/program`;
  useEffect(() => {
    if (!session.claimId || !session.secret) return;
    let live = true;
    const refresh = async () => {
      try {
        const [d, p] = await Promise.all([request<ProgramStatus>(url, session.secret!), request<Purchase>(`/api/claims/${session.claimId}`, session.secret!)]);
        if (p.orderId) await rememberOrder(p.orderId, session.publicKey!, session.secret);
        if (live) { setData(d); setPurchase(p); setError(""); }
      } catch { if (live) setError("Could not refresh progress. Check your connection and try again."); }
    };
    void refresh(); const timer = setInterval(refresh, 4000); return () => { live = false; clearInterval(timer); };
  }, [url, session, tick]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const act = async (body: object) => setData(await request<ProgramStatus>(url, session.secret!, body));
  async function start() {
    let next = session;
    if (!next.publicKey || !next.secret) {
      const key = await createOrderKey();
      const secret = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      next = { ...session, publicKey: key.publicKey, secret };
      await set(`zealed:claim:${campaignId}`, next); onSession(next);
    }
    const c = await request<{ id: string }>(`/api/campaigns/${campaignId}/claim`, next.invitation, { publicKey: next.publicKey, secret: next.secret });
    next = { ...next, claimId: c.id }; await set(`zealed:claim:${campaignId}`, next); onSession(next);
  }
  const redemption = data?.redemption, prize = program.prizes.find(p => p.id === (redemption?.prize_id ?? prizeId));
  const completed = data?.results.filter(result => result.status === "approved").length ?? 0;
  const catalog = !!redemption && ["giftcard", "esim"].includes(redemption.kind);
  const nextTaskId = data && !data.eligible ? program.tasks.find(t => {
    const result = data.results.find(r => r.task_id === t.id);
    return result?.status !== "approved" && result?.status !== "pending";
  })?.id : undefined;
  const primary = !session.claimId ? "join" : !data?.eligible ? "task" : !redemption ? "reserve" : catalog && !purchase?.choice ? "select" : !catalog && redemption.state === "ready" ? "ack" : "none";
  const step = stepFromClaim({
    joined: !!session.claimId,
    missionDone: !!data?.eligible,
    rewardPicked: !!redemption && (!catalog || !!purchase?.choice),
    orderId: catalog ? purchase?.orderId ?? null : redemption ? "set" : null,
    orderStatus: catalog ? orderStatus : redemption?.state === "acknowledged" ? "delivered" : redemption?.state === "ready" ? "paid" : redemption ? "awaiting_payment" : null,
  });
  const failed = orderStatus === "failed" || orderStatus === "failed_uncertain" || orderStatus === "expired" || purchase?.state === "selection_failed";
  return <RewardLayout title={title} role="claim">
    <ClaimStepper current={step} failed={failed} />
    <p className="text-muted">Finish every step, pick one reward, and receive it in this browser.</p>
    {error && <ErrorNote message={error} primary={primary === "none" && !purchase?.orderId} onRetry={() => setTick(n => n + 1)} />}
    {expired && !redemption && <p role="alert" className="text-danger">This invite has expired. Rewards already delivered can still be opened.</p>}
    {!session.claimId ? <section className={panel}><h2 className="text-xl font-semibold">Your mission</h2><ul className="space-y-3">{program.tasks.map((t, i) => <li key={t.id} className="border-b border-line pb-3"><span className="text-sm text-muted">Step {i + 1}</span><p className="text-base">{t.title}</p></li>)}</ul><button className={button} disabled={busy || expired} onClick={() => void run(start)}>{busy ? "Saving this browser…" : "Join"}</button><p className="text-sm text-muted">This keeps the invite for this browser. Don’t clear site data if you want to come back.</p></section> : !data ? <LoadingLine>Preparing your mission…</LoadingLine> : <>
      <div className="flex flex-wrap items-baseline justify-between gap-3"><h2 className="text-xl font-semibold">Mission</h2><span className="text-sm text-muted">{completed} of {program.tasks.length} done</span></div>
      {program.tasks.map((t, i) => {
        const result = data.results.find(r => r.task_id === t.id), approved = result?.status === "approved";
        const statusLabel = approved ? "Done" : result?.status === "pending" ? "Waiting for the sponsor" : result?.status === "rejected" ? "Not accepted · try again" : "Not started";
        return <form key={t.id} className={panel} onSubmit={e => { e.preventDefault(); void run(() => act({ action: "task", taskId: t.id, ...(t.kind === "quiz" ? { answer: Number(inputs[t.id]) } : { evidence: inputs[t.id] }) })); }}>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-sm text-muted">Step {i + 1}</span><span className="text-sm text-muted">{statusLabel}</span></div>
          <h3 className="text-lg font-semibold">{t.title}</h3>
          {!approved && <>{t.kind === "quiz" ? <div className="flex flex-col gap-3" role="group" aria-label="Choose an answer">{t.options?.map((o, j) => {
            const on = inputs[t.id] === String(j);
            return <button type="button" key={j} aria-pressed={on} className={`${choiceButton} ${on ? "border-accent bg-accent-soft" : "border-line bg-background"}`} onClick={() => setInputs({ ...inputs, [t.id]: String(j) })}>{o}</button>;
          })}</div> : <><p className="text-base text-muted">{t.instructions}</p><label className="flex flex-col gap-2 text-base">Link the sponsor can open<input className={field} type="url" required maxLength={1000} value={inputs[t.id] ?? ""} onChange={e => setInputs({ ...inputs, [t.id]: e.target.value })} placeholder="https://…" /></label><p className="text-sm text-muted">Use a public page. Don’t paste passwords or private codes.</p></>}
            <button className={t.id === nextTaskId && primary === "task" ? button : buttonSecondary} disabled={busy || expired || result?.status === "pending" || (result?.attempts ?? 0) >= 5 || (t.kind === "quiz" && inputs[t.id] === undefined)}>{result?.status === "pending" ? "Waiting for review" : t.kind === "quiz" ? "Check answer" : "Submit for review"}</button><p className="text-sm text-muted">{result?.attempts ?? 0} of 5 tries used.</p></>}
        </form>;
      })}
      <section className={panel}><h2 className="text-xl font-semibold">Pick your reward</h2>{!data.eligible ? <p className="text-muted">Locked until all {program.tasks.length} steps are done.</p> : !redemption ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(() => act({ action: "redeem", prizeId, ...(prize?.kind === "zcash" ? { address } : {}) })); }}>
        <label className="flex flex-col gap-2 text-base">Available reward<select className={field} value={prizeId} onChange={e => { setPrizeId(e.target.value); setConfirmed(false); }}>{program.prizes.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>
        {prize?.kind === "zcash" && <><p className="text-base">{prize.amountZat / 1e8} testnet coins. They have no cash value.</p><label className="flex flex-col gap-2 text-base">Your Zcash testnet address<textarea className={field} required maxLength={1024} value={address} onChange={e => setAddress(e.target.value.trim())} placeholder="Paste your wallet address" /></label><p className="text-sm text-muted">The sponsor needs this address to approve the reward. It is shared with them.</p><Details><p>Example address: utest1…</p></Details></>}
        {prize?.kind === "custom" && <p className="text-muted">{prize.description}</p>}
        <label className="flex min-h-12 items-start gap-3 text-base"><input type="checkbox" className="mt-1" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I choose this reward. It can’t be changed after this.</label><button className={button} disabled={busy || expired || !confirmed}>Reserve this reward</button>
      </form> : <div className="space-y-4"><h3 className="text-lg font-semibold">{prize?.title}</h3>
        {catalog ? <>{!purchase?.choice ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => { await request(`/api/claims/${session.claimId}/select`, session.secret!, { purpose: redemption.kind === "esim" ? "connectivity" : "gift", days, esimCompatible: compatible }); setPurchase(await request(`/api/claims/${session.claimId}`, session.secret!)); }); }}>
          {redemption.kind === "esim" && <><label className="flex flex-col gap-2 text-base">Days of coverage<input className={field} type="number" min={1} max={30} value={days} onChange={e => setDays(Number(e.target.value))} /></label><label className="flex min-h-12 items-start gap-3 text-base"><input type="checkbox" className="mt-1" required checked={compatible} onChange={e => setCompatible(e.target.checked)} />My phone supports eSIM and is unlocked. I’ll check that this package works where I am.</label></>}
          <button className={button} disabled={busy || expired}>{busy ? "Comparing options…" : "Find my reward"}</button><p className="text-sm text-muted">Up to three tries. If nothing fits, nothing is purchased.</p></form> : <><p className="text-base">{purchase.choice.productName}</p><p className="text-base text-muted">{purchase.choice.packageValue}{typeof purchase.choice.priceCents === "number" ? ` · ${formatUsd(purchase.choice.priceCents)}` : ""}</p><p className="text-base text-muted">{purchase.choice.reason}</p>{purchase.orderId ? <PaymentPanel orderId={purchase.orderId} compact onStatus={onOrderStatus} /> : <><Chest open={false} /><p role="status" className="text-base">Waiting for the sponsor to approve. Your reward will appear here.</p></>}</>}</> : <>
          {redemption.state === "requested" && <Chest open={false} />}
          <p role="status" className="text-base">{redemption.state === "requested" ? "Waiting for the sponsor to approve. Your reward will appear here." : redemption.state === "acknowledged" ? "You confirmed that this reward arrived." : "The sponsor sent your reward. Read it, then confirm."}</p>
          {(redemption.txid || redemption.sealed_payload) && <Details>
            {redemption.txid && <><a className="underline" href={`https://zexplorer.app/testnet/tx/${redemption.txid}`} target="_blank" rel="noreferrer">Transaction {redemption.txid}</a><p>The sponsor reported this. Zealed has not checked that it arrived. Look in your wallet.</p></>}
          </Details>}
          {redemption.sealed_payload && <><button type="button" className={buttonSecondary} onClick={() => void run(async () => { if (privateText !== null) { setPrivateText(null); return; } const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("This browser is missing the key that opens your reward."); const content = JSON.parse(await open(redemption.sealed_payload!, kp.publicKey, kp.secretKey)); if (typeof content.instructions !== "string") throw new Error("These instructions could not be read."); setPrivateText(content.instructions); })}>{privateText !== null ? "Hide instructions" : "Show instructions"}</button>{privateText !== null && <p className="text-lg whitespace-pre-wrap break-words rounded-lg border border-line p-4">{privateText}</p>}</>}
          {redemption.state === "ready" && <button className={button} disabled={busy} onClick={() => void run(() => act({ action: "acknowledge" }))}>I have my reward</button>}
        </>}
      </div>}</section>
    </>}
    {session.publicKey && <section className={panel}><h2 className="font-semibold">Keep this reward on this browser</h2><p className="text-base text-muted">Clearing site data removes access. A backup does not move the reward to another device.</p><button type="button" className={buttonSecondary} onClick={() => void run(async () => { if (backup) { setBackup(null); return; } const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("This browser is missing the key that opens your reward."); setBackup(kp.backup); })}>{backup ? "Hide backup" : "Show backup"}</button>{backup && <textarea readOnly aria-label="Backup" className={field + " font-mono text-sm"} value={backup} />}</section>}
  </RewardLayout>;
}
