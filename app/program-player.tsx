"use client";
import { useEffect, useState } from "react";
import { set } from "idb-keyval";
import { createOrderKey, loadKey, rememberOrder } from "@/lib/keystore";
import { open } from "@/lib/sodium";
import { SOCIAL_PLATFORMS, type ProgramStatus, type PublicProgram, type PublicTask } from "@/lib/program-schema";
import type { Choice } from "@/lib/campaigns";
import { RewardLayout, button, buttonSecondary, field, panel, request, StatusTag, Notice } from "./reward-ui";
import { PaymentPanel } from "./order-details";
import { Icon } from "./ui-icon";
import { GiftButton } from "./gift/gift-button";
import { Steps } from "./role-switch";
type Session = { invitation: string; publicKey?: string; secret?: string; claimId?: string };
type Purchase = { choice: Choice | null; orderId: string | null; state: string };
const platformOf = (t: PublicTask) => t.kind === "social" && t.platform && t.platform !== "other" ? SOCIAL_PLATFORMS[t.platform] : null;
const taskHint = (t: PublicTask) => t.kind === "quiz" ? "Quiz · instant check" : t.kind === "code" ? "Code · instant check" : platformOf(t) ? `${platformOf(t)!.label} · reviewed by your organizer` : "Public evidence · reviewed by your organizer";
export function ProgramPlayer({ campaignId, session, title, expired, claimed, onSession, program }: { campaignId: string; session: Session; title: string; expired: boolean; claimed?: boolean; onSession: (s: Session) => void; program: PublicProgram }) {
  const [data, setData] = useState<ProgramStatus | null>(null), [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [inputs, setInputs] = useState<Record<string, string>>({});
  const [prizeId, setPrizeId] = useState(program.prizes[0]?.id ?? ""), [address, setAddress] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [days, setDays] = useState(7), [compatible, setCompatible] = useState(false), [privateText, setPrivateText] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const [backup, setBackup] = useState<string | null>(null);
  const url = `/api/claims/${session.claimId}/program`;
  useEffect(() => {
    if (!session.claimId || !session.secret) return;
    let live = true;
    const refresh = async () => {
      try {
        const [d, p] = await Promise.all([request<ProgramStatus>(url, session.secret!), request<Purchase>(`/api/claims/${session.claimId}`, session.secret!)]);
        if (p.orderId) await rememberOrder(p.orderId, session.publicKey!, session.secret);
        if (live) { setData(d); setPurchase(p); setConnectionError(false); }
      } catch { if (live) setConnectionError(true); }
    };
    void refresh(); const timer = setInterval(refresh, 4000); return () => { live = false; clearInterval(timer); };
  }, [url, session]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const act = async (body: object) => setData(await request<ProgramStatus>(url, session.secret!, body));
  async function selectPackage(kind: string) {
    await request(`/api/claims/${session.claimId}/select`, session.secret!, { purpose: kind === "esim" ? "connectivity" : "gift", days, esimCompatible: compatible });
    setPurchase(await request(`/api/claims/${session.claimId}`, session.secret!));
  }
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
  const r = data?.redemption, prize = program.prizes.find(p => p.id === (r?.prize_id ?? prizeId));
  const completed = data?.results.filter(r => r.status === "approved").length ?? 0;
  const received = r?.state === "acknowledged" || purchase?.state === "delivered";
  const prizeIcon = (kind: string) => kind === "zcash" ? "wallet" as const : kind === "esim" ? "globe" as const : "gift" as const;
  return <RewardLayout title={title} role="claim" description="A little participation. A reward of your choice. Complete every mission below to unlock one prize.">
    <Steps label="Reward progress" steps={["Join", "Complete tasks", "Choose prize", "Receive"]} current={!session.claimId ? 0 : !data?.eligible ? 1 : !r ? 2 : received ? 4 : 3} />
    {error && <Notice tone="error">{error}</Notice>}
    {connectionError && <Notice>Connection interrupted. Your progress is saved; we’re trying to reconnect.</Notice>}
    {expired && !r && <Notice tone="error">This invitation has expired. Existing deliveries can still be opened.</Notice>}
    <div className="workspace-split">
      <div className="workspace-stack">
        {!session.claimId ? <section className={panel}>
          <div className="flex flex-wrap items-center justify-between gap-3"><h2>Your mission checklist</h2><StatusTag>{program.tasks.length} required</StatusTag></div>
          <div className="workspace-list">{program.tasks.map((t, i) => <div className="workspace-list-row" key={t.id}><div className="flex items-center gap-3"><span className="workspace-task-number">{i + 1}</span><div><p className="font-medium">{t.title}</p><p className="workspace-note">{taskHint(t)}</p></div></div></div>)}</div>
          <button className={button} disabled={busy || expired || claimed} onClick={() => void run(start)}>{claimed ? "Invitation already claimed" : busy ? "Creating private access…" : "Join & start missions"}<Icon name="arrow" /></button>
          {claimed && <Notice>Reopen this invitation in the browser that joined it, or ask your organizer for another link.</Notice>}<p className="workspace-note">Joining reserves this invitation for your browser. Keep its storage to recover your progress and reward.</p>
        </section> : !data ? <div className={panel} role="status"><h2>Opening your missions…</h2><p className="workspace-note">Restoring the progress saved for this browser.</p></div> : <section className={panel} aria-label="Required tasks">
          <div className="flex flex-wrap items-center justify-between gap-3"><h2>Your missions</h2><span className="text-sm text-accent" aria-live="polite">{completed} / {program.tasks.length} complete</span></div>
          <progress className="workspace-progress" value={completed} max={program.tasks.length} aria-label="Completed tasks" />
          <div>{program.tasks.map((t, i) => {
            const result = data.results.find(r => r.task_id === t.id), approved = result?.status === "approved", pending = result?.status === "pending", exhausted = (result?.attempts ?? 0) >= 5;
            return <form key={t.id} className="workspace-task" onSubmit={e => { e.preventDefault(); void run(() => act({ action: "task", taskId: t.id, ...(t.kind === "quiz" ? { answer: Number(inputs[t.id]) } : t.kind === "code" ? { code: inputs[t.id] ?? "" } : { evidence: inputs[t.id] }) })); }}>
              <div className="workspace-task-head"><span className="workspace-task-number" data-done={approved}>{approved ? <Icon name="check" width={16} /> : i + 1}</span><div className="min-w-0 flex-1"><h3 className="text-lg leading-snug">{t.title}</h3><p className="workspace-note mt-1">{taskHint(t)}</p></div></div>
              {approved ? <StatusTag tone="success">Completed</StatusTag> : pending ? <><StatusTag tone="attention"><Icon name="clock" width={14} />Awaiting organizer review</StatusTag><p className="workspace-note">Your evidence was submitted. You can continue with the other missions while you wait.</p>{result.evidence && <a className="workspace-inline-link break-all" href={result.evidence} target="_blank" rel="noreferrer">View your submission<Icon name="arrow" width={16} /></a>}</> : <>
                {result?.status === "rejected" && <Notice tone="error">{exhausted ? "All five attempts have been used. Ask the organizer for a new invitation." : t.kind === "quiz" ? "That answer didn’t pass. Check the options and try again." : t.kind === "code" ? "That code didn’t match. Check it with the organizer and try again." : "Your organizer did not approve this evidence. Check the instructions before resubmitting."}</Notice>}
                {t.kind === "quiz" ? <fieldset className="space-y-3" disabled={busy || expired || exhausted}><legend className="sr-only">Choose an answer for {t.title}</legend>{t.options?.map((o, j) => <label key={j} className="workspace-choice"><input type="radio" name={t.id} value={j} required checked={inputs[t.id] === String(j)} onChange={e => setInputs({ ...inputs, [t.id]: e.target.value })} /><span className="text-sm">{o}</span></label>)}</fieldset> : t.kind === "code" ? <><p className="workspace-note">{t.instructions}</p><label className="flex flex-col gap-2 text-sm">Code<input className={field} required autoComplete="off" autoCapitalize="characters" spellCheck={false} disabled={busy || expired || exhausted} maxLength={80} value={inputs[t.id] ?? ""} onChange={e => setInputs({ ...inputs, [t.id]: e.target.value })} /></label></> : <><p className="workspace-note">{t.instructions}</p>{t.target && <a className="workspace-inline-link break-all" href={t.target} target="_blank" rel="noreferrer noopener">Open on {platformOf(t)?.label ?? "the organizer’s link"}<Icon name="arrow" width={16} /></a>}<label className="flex flex-col gap-2 text-sm">{platformOf(t) && t.platform !== "discord" ? `Public link on ${platformOf(t)!.label}` : "Public evidence URL"}<input className={field} type="url" required disabled={busy || expired || exhausted} maxLength={1000} value={inputs[t.id] ?? ""} onChange={e => setInputs({ ...inputs, [t.id]: e.target.value })} placeholder={platformOf(t) && t.platform !== "discord" ? `https://${platformOf(t)!.hosts[0]}/…` : "https://…"} /></label><p className="workspace-note">Your organizer and the server can read this link. Share public evidence only, never credentials or private codes.</p></>}
                <div className="flex flex-wrap items-center justify-between gap-3"><button className={buttonSecondary} disabled={busy || expired || exhausted}>{busy ? "Saving…" : t.kind === "quiz" ? "Check answer" : t.kind === "code" ? "Check code" : "Submit for review"}</button><span className="workspace-note">{5 - (result?.attempts ?? 0)} attempts left</span></div>
              </>}
            </form>;
          })}</div>
        </section>}
        {session.publicKey && <details className="border-t border-line pt-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted"><Icon name="lock" width={16} />Keep access to your reward</summary><div className="space-y-4 py-3"><p className="workspace-note">This browser holds your key and claim access. Clearing site storage can lose both. A key backup alone cannot restore access on another device.</p><button className={buttonSecondary} onClick={() => void run(async () => { if (backup) { setBackup(null); return; } const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("Key missing from this browser."); setBackup(kp.backup); })}>{backup ? "Hide private backup" : "Show private key backup"}</button>{backup && <textarea readOnly aria-label="Private key backup" className={field} value={backup} />}</div></details>}
      </div>
      <aside className="workspace-aside">
        <section className={panel} aria-label="Your prize">
          <div className="flex items-center justify-between gap-3"><h2>{received ? "Reward received" : r ? "Your chosen prize" : "Your reward"}</h2><Icon name={received ? "check" : data?.eligible ? "gift" : "lock"} className={received ? "text-sealed" : "text-accent"} /></div>
          {!data?.eligible ? <><p className="workspace-note">Complete {program.tasks.length === 1 ? "the required task" : `all ${program.tasks.length} tasks`} to unlock your choice of one prize.</p><div className="workspace-list">{program.prizes.map(p => <div key={p.id} className="workspace-list-row"><div className="flex items-center gap-3"><Icon name={prizeIcon(p.kind)} className="shrink-0 text-muted" /><div><p className="text-sm font-medium">{p.title}</p><p className="text-xs text-muted">{p.kind === "zcash" ? `${p.amountZat / 1e8} TAZ · testnet` : p.kind === "custom" ? "From your organizer" : "Selected from Bitrefill"}</p></div></div><Icon name="lock" width={14} className="shrink-0 text-muted" /></div>)}</div></> : !r ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => { await act({ action: "redeem", prizeId, ...(prize?.kind === "zcash" ? { address } : {}) }); if (prize?.kind === "giftcard" || prize?.kind === "esim") await selectPackage(prize.kind); }); }}>
            <StatusTag tone="success">All missions complete</StatusTag>
            <fieldset className="space-y-3"><legend className="mb-3 text-sm">Choose one available reward</legend>{program.prizes.map(p => <label key={p.id} className="workspace-choice"><input type="radio" name="prize" value={p.id} checked={prizeId === p.id} onChange={() => { setPrizeId(p.id); setConfirmed(false); }} /><span className="text-sm font-medium">{p.title}</span></label>)}</fieldset>
            {prize?.kind === "zcash" && <><p className="workspace-note">{prize.amountZat / 1e8} TAZ · testnet coins with no monetary value</p><label className="flex flex-col gap-2 text-sm">Your shielded testnet address<textarea className={field} required maxLength={1024} value={address} onChange={e => { setAddress(e.target.value.trim()); setConfirmed(false); }} placeholder="utest1…" /></label><p className="workspace-note">Use an Ironwood or Sapling receiver. Your organizer and the server see this address.</p></>}
            {prize?.kind === "custom" && <p className="workspace-note">{prize.description}</p>}
            {prize?.kind === "esim" && <><p className="workspace-note">The agent will find a data package for your trip.</p><label className="flex flex-col gap-2 text-sm">Days of coverage<select className={field} value={days} onChange={e => setDays(Number(e.target.value))}>{[1, 7, 14, 30].map(n => <option key={n} value={n}>{n} {n === 1 ? "day" : "days"}</option>)}</select></label><label className="workspace-choice"><input type="checkbox" required checked={compatible} onChange={e => setCompatible(e.target.checked)} /><span className="text-sm">My phone is unlocked and supports eSIM.</span></label></>}
            {prize?.kind === "giftcard" && <p className="workspace-note">The agent selects a gift card from your organizer’s approved products. No shopping or payment needed from you.</p>}
            <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-0.5 size-5 shrink-0" type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><span>I choose this prize. {prize?.kind === "zcash" ? "The reward and payout address" : "This choice"} cannot be changed afterward.</span></label><button className={button + " w-full"} disabled={busy || expired || !confirmed || (prize?.kind === "esim" && !compatible)}>{busy ? "Preparing your reward…" : prize?.kind === "giftcard" ? "Claim gift card" : prize?.kind === "esim" ? "Claim eSIM" : prize?.kind === "zcash" ? "Request TAZ prize" : "Reserve this prize"}<Icon name="arrow" width={16} /></button>
          </form> : <div className="space-y-4"><div className="flex items-center gap-3"><Icon name={prizeIcon(r.kind)} className="shrink-0 text-accent" /><h3 className="text-lg">{prize?.title}</h3></div>
            {["giftcard", "esim"].includes(r.kind) ? <>{!purchase?.choice ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(() => selectPackage(r.kind)); }}>
              {r.kind === "esim" && <><label className="flex flex-col gap-2 text-sm">Days of coverage<input className={field} type="number" min={1} max={30} required value={days} onChange={e => setDays(Number(e.target.value))} /></label><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 size-5 shrink-0" required checked={compatible} onChange={e => setCompatible(e.target.checked)} /><span>My phone supports eSIM and is carrier-unlocked. I’ll check the package coverage before using it.</span></label></>}
              <button className={button + " w-full"} disabled={busy || expired}>{busy ? "Comparing packages…" : "Find my reward package"}</button><p className="workspace-note">The agent compares your organizer’s allowed packages. Up to three attempts; no suitable option means no purchase.</p>
            </form> : <><p className="text-sm">{purchase.choice.productName} · {purchase.choice.packageValue}</p><p className="workspace-note">{purchase.choice.reason}</p>{purchase.orderId ? <PaymentPanel orderId={purchase.orderId} compact /> : <Notice>Waiting for your organizer to approve and pay. No payment is needed from you.</Notice>}</>}</> : <>
              <p role="status" className="workspace-note">{r.state === "requested" ? "Your organizer is up next. This page updates when they send your prize." : r.state === "acknowledged" ? "Receipt acknowledged by you. You can return here to open your reward." : "Your organizer has sent the reward. Check receipt before acknowledging."}</p>
              {r.txid && <><a className="workspace-inline-link" href={`https://testnet.zcashexplorer.app/transactions/${r.txid}`} target="_blank" rel="noreferrer">View reported transaction<Icon name="arrow" width={16} /></a><p className="workspace-note">Zealed has not verified the destination, amount or confirmations. Check your wallet.</p></>}
              {r.sealed_payload && <><div className="workspace-secret"><p className="mb-3 text-sm text-muted">{privateText !== null ? "Decrypted on this device" : "Encrypted instructions · ready to open"}</p>{privateText !== null && <p className="mb-4 whitespace-pre-wrap text-sm">{privateText}</p>}<button className={(privateText !== null ? buttonSecondary : button) + " w-full"} onClick={() => void run(async () => { if (privateText !== null) { setPrivateText(null); return; } const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("This browser is missing the decryption key."); const content = JSON.parse(await open(r.sealed_payload!, kp.publicKey, kp.secretKey)); if (typeof content.instructions !== "string") throw new Error("Invalid reward instructions."); setPrivateText(content.instructions); })}>{privateText !== null ? "Hide instructions" : "Decrypt & reveal instructions"}</button></div><details className="border-t border-line pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-muted">Pass this reward to a friend</summary><GiftButton sealedPayload={r.sealed_payload} buyerPublicKey={session.publicKey!} /></details></>}
              {r.state === "ready" && <button className={button + " w-full"} disabled={busy} onClick={() => void run(() => act({ action: "acknowledge" }))}>I have received my prize<Icon name="check" width={16} /></button>}
            </>}
          </div>}
        </section>
        <p className="workspace-note flex gap-3"><Icon name="shield" className="shrink-0" />Your decryption key stays on this device. Public task evidence is visible to your organizer.</p>
      </aside>
    </div>
  </RewardLayout>;
}
