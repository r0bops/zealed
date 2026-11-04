"use client";
import { useEffect, useState } from "react";
import { set } from "idb-keyval";
import { createOrderKey, loadKey, rememberOrder } from "@/lib/keystore";
import { open } from "@/lib/sodium";
import type { ProgramStatus, PublicProgram } from "@/lib/program-schema";
import type { Choice } from "@/lib/campaigns";
import { RewardLayout, button, buttonSecondary, field, panel, request } from "./reward-ui";
import { PaymentPanel } from "./order-details";
import { Steps } from "./role-switch";
type Session = { invitation: string; publicKey?: string; secret?: string; claimId?: string };
type Purchase = { choice: Choice | null; orderId: string | null; state: string };
export function ProgramPlayer({ campaignId, session, title, expired, onSession, program }: { campaignId: string; session: Session; title: string; expired: boolean; onSession: (s: Session) => void; program: PublicProgram }) {
  const [data, setData] = useState<ProgramStatus | null>(null), [purchase, setPurchase] = useState<Purchase | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [inputs, setInputs] = useState<Record<string, string>>({});
  const [prizeId, setPrizeId] = useState(program.prizes[0]?.id ?? ""), [address, setAddress] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [days, setDays] = useState(7), [compatible, setCompatible] = useState(false), [privateText, setPrivateText] = useState<string | null>(null);
  const [backup, setBackup] = useState<string | null>(null);
  const url = `/api/claims/${session.claimId}/program`;
  useEffect(() => {
    if (!session.claimId || !session.secret) return;
    let live = true;
    const refresh = async () => {
      try {
        const [d, p] = await Promise.all([request<ProgramStatus>(url, session.secret!), request<Purchase>(`/api/claims/${session.claimId}`, session.secret!)]);
        if (p.orderId) await rememberOrder(p.orderId, session.publicKey!, session.secret);
        if (live) { setData(d); setPurchase(p); }
      } catch { if (live) setError("Could not refresh progress. Check your connection; retrying automatically."); }
    };
    void refresh(); const timer = setInterval(refresh, 4000); return () => { live = false; clearInterval(timer); };
  }, [url, session]);
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
  const r = data?.redemption, prize = program.prizes.find(p => p.id === (r?.prize_id ?? prizeId));
  const completed = data?.results.filter(r => r.status === "approved").length ?? 0;
  return <RewardLayout title={title} role="claim">
    <p className="text-muted">Complete every mission, unlock your prize, and receive it privately. One participant and one reward per invitation.</p>
    <Steps label="Reward progress" steps={["Join", "Complete tasks", "Choose prize", "Receive"]} current={!session.claimId ? 0 : !data?.eligible ? 1 : !r ? 2 : r.state === "acknowledged" ? 4 : 3} />
    {error && <p role="alert" className="rounded-lg border border-danger p-4 text-danger">{error}</p>}
    {expired && !r && <p role="alert" className="text-danger">This invitation has expired. Existing deliveries can still be opened.</p>}
    {!session.claimId ? <section className={panel}><h2 className="text-xl font-semibold">Your mission checklist</h2><ul className="space-y-3">{program.tasks.map(t => <li key={t.id} className="border-b border-line pb-3"><span className="font-mono text-xs text-accent">{t.kind.toUpperCase()}</span><p>{t.title}</p></li>)}</ul><button className={button} disabled={busy || expired} onClick={() => void run(start)}>{busy ? "Creating private access…" : "Join & start missions"}</button><p className="text-xs text-muted">This reserves the invitation for this browser. Keep its storage to recover your reward.</p></section> : !data ? <p role="status">Loading your missions…</p> : <>
      <div className="flex flex-wrap justify-between gap-3"><h2 className="text-xl font-semibold">Required tasks</h2><span className="font-mono text-sm text-accent">{completed} / {program.tasks.length} complete</span></div>
      {program.tasks.map((t, i) => {
        const result = data.results.find(r => r.task_id === t.id), approved = result?.status === "approved";
        return <form key={t.id} className={panel} onSubmit={e => { e.preventDefault(); void run(() => act({ action: "task", taskId: t.id, ...(t.kind === "quiz" ? { answer: Number(inputs[t.id]) } : { evidence: inputs[t.id] }) })); }}>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="font-mono text-xs text-accent">MISSION {String(i + 1).padStart(2, "0")} / {t.kind.toUpperCase()}</span><span className="text-sm text-muted">{approved ? "✓ Approved" : result?.status === "pending" ? "Awaiting organizer review" : result?.status === "rejected" ? "Not approved · try again" : "Not started"}</span></div>
          <h3 className="text-lg font-semibold">{t.title}</h3>
          {!approved && <>{t.kind === "quiz" ? <fieldset className="space-y-2"><legend className="sr-only">Choose an answer</legend>{t.options?.map((o, j) => <label key={j} className="flex min-h-11 items-center gap-3 rounded border border-line p-3"><input type="radio" name={t.id} value={j} required checked={inputs[t.id] === String(j)} onChange={e => setInputs({ ...inputs, [t.id]: e.target.value })} />{o}</label>)}</fieldset> : <><p className="text-sm text-muted">{t.instructions}</p><label className="space-y-2"><span>Public evidence URL</span><input className={field} type="url" required maxLength={1000} value={inputs[t.id] ?? ""} onChange={e => setInputs({ ...inputs, [t.id]: e.target.value })} placeholder="https://…" /></label><p className="text-xs text-muted">The organizer and server can read this link. Use a public post or evidence page, never credentials or private codes. Verification is manual.</p></>}
            <button className={buttonSecondary} disabled={busy || expired || result?.status === "pending" || (result?.attempts ?? 0) >= 5}>{result?.status === "pending" ? "Waiting for review" : t.kind === "quiz" ? "Check answer" : "Submit for review"}</button><p className="text-xs text-muted">{result?.attempts ?? 0}/5 attempts used.</p></>}
        </form>;
      })}
      <section className={panel}><h2 className="text-xl font-semibold">Choose your prize</h2>{!data.eligible ? <p className="text-muted">Locked · complete all {program.tasks.length} tasks first.</p> : !r ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(() => act({ action: "redeem", prizeId, ...(prize?.kind === "zcash" ? { address } : {}) })); }}>
        <label className="block space-y-2"><span>Available reward</span><select className={field} value={prizeId} onChange={e => { setPrizeId(e.target.value); setConfirmed(false); }}>{program.prizes.map(p => <option key={p.id} value={p.id}>{p.title} · {p.kind}</option>)}</select></label>
        {prize?.kind === "zcash" && <><p>{prize.amountZat / 1e8} TAZ · testnet coins with no monetary value</p><label className="block space-y-2"><span>Your shielded testnet unified address</span><textarea className={field} required maxLength={1024} value={address} onChange={e => setAddress(e.target.value.trim())} placeholder="utest1…" /></label><p className="text-xs text-muted">Use a wallet with an Ironwood or Sapling receiver. Your address is shared with the organizer and server.</p></>}
        {prize?.kind === "custom" && <p className="text-muted">{prize.description}</p>}
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I choose this prize. The reward and payout address cannot be changed after reservation.</label><button className={button} disabled={busy || expired || !confirmed}>Reserve this prize</button>
      </form> : <div className="space-y-4"><h3 className="text-lg font-semibold">{prize?.title}</h3>
        {["giftcard", "esim"].includes(r.kind) ? <>{!purchase?.choice ? <form className="space-y-4" onSubmit={e => { e.preventDefault(); void run(async () => { await request(`/api/claims/${session.claimId}/select`, session.secret!, { purpose: r.kind === "esim" ? "connectivity" : "gift", days, esimCompatible: compatible }); setPurchase(await request(`/api/claims/${session.claimId}`, session.secret!)); }); }}>
          {r.kind === "esim" && <><label className="block space-y-2"><span>Days of coverage</span><input className={field} type="number" min={1} max={30} value={days} onChange={e => setDays(Number(e.target.value))} /></label><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" required checked={compatible} onChange={e => setCompatible(e.target.checked)} />My device supports eSIM and is carrier-unlocked. I will check the selected package’s coverage.</label></>}
          <button className={button} disabled={busy || expired}>{busy ? "Comparing packages…" : "Ask agent to select my package"}</button><p className="text-xs text-muted">The agent compares allowed packages. Up to three attempts; no suitable option means no purchase.</p></form> : <><p>{purchase.choice.productName} · {purchase.choice.packageValue}</p><p className="text-sm text-muted">{purchase.choice.reason}</p>{purchase.orderId ? <PaymentPanel orderId={purchase.orderId} compact /> : <p role="status">Waiting for sponsor approval and payment.</p>}</>}</> : <>
          <p role="status">{r.state === "requested" ? "Waiting for the organizer to fulfill your prize." : r.state === "acknowledged" ? "Receipt acknowledged by you." : "Organizer sent the reward. Check receipt before acknowledging."}</p>
          {r.txid && <><a className="block break-all text-sm underline" href={`https://zexplorer.app/testnet/tx/${r.txid}`} target="_blank" rel="noreferrer">View reported transaction ↗</a><p className="text-xs text-muted">The organizer reported this transaction. Zealed has not verified its destination, amount or confirmations. Check your wallet.</p></>}
          {r.sealed_payload && <><button className={buttonSecondary} onClick={() => void run(async () => { if (privateText !== null) { setPrivateText(null); return; } const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("This browser is missing the decryption key."); const content = JSON.parse(await open(r.sealed_payload!, kp.publicKey, kp.secretKey)); if (typeof content.instructions !== "string") throw new Error("Invalid reward instructions."); setPrivateText(content.instructions); })}>{privateText !== null ? "Hide instructions" : "Decrypt & reveal instructions"}</button>{privateText !== null && <p className="whitespace-pre-wrap break-words rounded border border-line p-4">{privateText}</p>}</>}
          {r.state === "ready" && <button className={button} disabled={busy} onClick={() => void run(() => act({ action: "acknowledge" }))}>I have received my prize</button>}
        </>}
      </div>}</section>
    </>}
    {session.publicKey && <section className={panel}><h2 className="font-semibold">Keep access on this browser</h2><p className="text-sm text-muted">Clearing site storage removes your key and claim access. A key backup alone cannot restore authorization on another device.</p><button className={buttonSecondary} onClick={() => void run(async () => { if (backup) { setBackup(null); return; } const kp = await loadKey(session.publicKey!); if (!kp) throw new Error("Key missing from this browser."); setBackup(kp.backup); })}>{backup ? "Hide private backup" : "Show private key backup"}</button>{backup && <textarea readOnly aria-label="Private key backup" className={field} value={backup} />}</section>}
  </RewardLayout>;
}
