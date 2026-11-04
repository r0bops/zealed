"use client";
import { useEffect, useState, type FormEvent } from "react";
import { RewardLayout, QR, QRPresenter, field, button, buttonSecondary, panel, request } from "../reward-ui";
import { Steps } from "../role-switch";
import { NoirPayButton } from "../noir-pay";
import type { CatalogProduct } from "@/lib/bitrefill";
import type { Choice } from "@/lib/campaigns";
import { ProgramBuilder, initialProgram } from "../program-builder";
import { ProgramAdmin } from "../program-admin";
import type { ProgramInput, PublicProgram } from "@/lib/program-schema";
type Summary = { program?: PublicProgram; acknowledged?: number; id: string; title: string; budgetCents: number; country: string; claimed: number; delivered: number; reservedCents: number; deliveredCents: number; status: string; choice: Choice | null };
type Listing = { campaigns: Summary[]; simulatedCatalog: boolean; purchaseMode: string; openSponsor?: boolean; maxBudgetCents?: number };
// The anonymous sponsor key for this browser. The server stores only its hash.
const SPONSOR_STORAGE = "zealed:sponsor";
const forgetSponsor = () => { try { localStorage.removeItem(SPONSOR_STORAGE); } catch { /* storage unavailable */ } };
type Payment = { id: string; to: string; amountZec: string; memo: string; zip321: string; status: string; simulated: boolean; expiresAt: number };
const TRACK = ["Shared", "Claimed", "Perk chosen", "Paid", "Delivered"];
/** Steps completed for one campaign, from the claim state or the order status. */
function progress(status: string): { done: number; failed: boolean } {
  if (status === "available") return { done: 1, failed: false };
  if (["tasks_pending", "prize_unlocked", "prize_reserved"].includes(status)) return { done: 2, failed: false };
  if (status === "prize_requested") return { done: 3, failed: false };
  if (status === "prize_ready") return { done: 4, failed: false };
  if (status === "prize_acknowledged") return { done: 5, failed: false };
  if (status === "selecting" || status === "selection_failed") return { done: 2, failed: false };
  if (["proposed", "awaiting_payment", "payment_seen"].includes(status)) return { done: 3, failed: false };
  if (status === "expired") return { done: 3, failed: true };
  if (status === "paid" || status === "fulfilling") return { done: 4, failed: false };
  if (status === "delivered") return { done: 5, failed: false };
  return { done: 4, failed: true };
}
export function CampaignDashboard() {
  const [program, setProgram] = useState<ProgramInput>(initialProgram);
  const needsCatalog = program.prizes.some(p => p.kind === "giftcard" || p.kind === "esim");
  const [token, setToken] = useState(""), [login, setLogin] = useState("");
  const [data, setData] = useState<Listing | null>(null), [error, setError] = useState("");
  const [title, setTitle] = useState("Welcome to the community"), [country, setCountry] = useState("IN"), [budget, setBudget] = useState("5.00");
  const [query, setQuery] = useState("esim"), [products, setProducts] = useState<CatalogProduct[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [searched, setSearched] = useState(false), [eligibility, setEligibility] = useState(false), [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(""), [payment, setPayment] = useState<Payment | null>(null), [payCampaign, setPayCampaign] = useState("");
  const [presenting, setPresenting] = useState<"" | "invite" | "payment">("");
  const [openAccess, setOpenAccess] = useState<boolean | null>(null), [maxBudget, setMaxBudget] = useState(500);
  useEffect(() => {
    let saved = "";
    try { saved = localStorage.getItem(SPONSOR_STORAGE) ?? ""; } catch { /* storage unavailable */ }
    fetch("/api/sponsors", { cache: "no-store" }).then(r => r.json()).then((d: { open: boolean; maxBudgetCents: number }) => {
      setOpenAccess(d.open); setMaxBudget(d.maxBudgetCents);
      if (d.open && saved) setToken(saved);
    }).catch(() => setOpenAccess(false));
  }, []);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const load = () => request<Listing>("/api/campaigns", token).then(d => { if (live) setData(d); }).catch(e => {
      if (!live) return;
      if ((e as Error).message.startsWith("Your sponsor session")) { forgetSponsor(); setToken(""); }
      setError((e as Error).message);
    });
    load(); const timer = setInterval(load, 4000); return () => { live = false; clearInterval(timer); };
  }, [token]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function unlock(e: FormEvent) { e.preventDefault(); void run(async () => { const d = await request<Listing>("/api/campaigns", login); setData(d); setToken(login); setLogin(""); }); }
  const latest = data?.campaigns[0], latestProgress = latest ? progress(latest.status) : null;
  const fundStep = !latestProgress ? 0 : [0, 1, 1, 2, 3, 4][latestProgress.done];
  return <RewardLayout title="Fund a reward" role="fund">
    <p className="text-muted">Create one invitation. Set required tasks and prize options. A participant completes every task, then chooses one reward. You review social/custom evidence and fulfill the selected prize. No deposit is held.</p>
    {error && <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}
    {!token ? <section className={panel}>
      {openAccess !== false && <>
        <h2 className="text-lg font-semibold">Start funding</h2>
        <p className="text-sm text-muted">No account or code needed. This browser keeps a private sponsor key, so only you see and manage your campaigns. Test purchases only, up to ${(maxBudget / 100).toFixed(2)} per campaign.</p>
        <button className={button} disabled={busy || openAccess === null} onClick={() => void run(async () => {
          const d = await request<{ token: string }>("/api/sponsors", "", {});
          try { localStorage.setItem(SPONSOR_STORAGE, d.token); } catch { /* storage unavailable: the session lasts until reload */ }
          setToken(d.token);
        })}>{busy ? "Starting…" : openAccess === null ? "Loading…" : "Start funding"}</button>
      </>}
      <details open={openAccess === false} className="text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-muted">{openAccess === false ? "Organizer access token" : "I have an organizer token"}</summary>
        <form onSubmit={unlock} className="mt-2 flex flex-col gap-3">
          <input aria-label="Organizer access token" autoComplete="current-password" type="password" required minLength={32} value={login} onChange={e => setLogin(e.target.value)} className={field} />
          <p className="text-xs text-muted">Use the token provided by the Zealed operator. It stays in memory for this session.</p>
          <button disabled={busy} className={buttonSecondary}>{busy ? "Checking access…" : "Open organizer workspace"}</button>
        </form>
      </details>
    </section> : <>
      <div className="flex items-center justify-between gap-3 text-sm"><p>{data?.simulatedCatalog ? "SIMULATED catalog" : "Live catalog"} · Purchases: <strong>{data?.purchaseMode}</strong>{data?.purchaseMode === "test" && " (not redeemable)"}</p>{data?.openSponsor ? <span className="text-xs text-muted">Sponsor key saved in this browser</span> : <button className="min-h-11 underline" onClick={() => { setToken(""); setData(null); setInvite(""); setPayment(null); }}>Lock workspace</button>}</div>
      <Steps label="Progress for your latest invitation" steps={["Create invitation", "Share the QR", "Review & fulfill", "Received"]} current={fundStep} failed={!!latestProgress?.failed} />
      <section className={panel}><ProgramBuilder value={program} onChange={setProgram} /><h2 className="text-lg font-semibold">New invitation</h2>
        <label className="flex flex-col gap-2">Campaign name<input className={field} value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2">Destination country code<input className={field} value={country} maxLength={2} autoComplete="country" onChange={e => { setCountry(e.target.value.toUpperCase()); setSelected([]); setProducts([]); setEligibility(false); }} /></label><label className="flex flex-col gap-2">Maximum reward (USD)<input className={field} inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} /></label></div>
        {needsCatalog && <><form onSubmit={e => { e.preventDefault(); void run(async () => { const d = await request<{ products: CatalogProduct[] }>(`/api/campaigns/catalog?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`, token); setProducts(d.products); setSearched(true); }); }} className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">Find eligible perks<input type="search" className={field} value={query} minLength={2} maxLength={60} required onChange={e => setQuery(e.target.value)} /></label><button disabled={busy} className={button}>{busy ? "Working…" : "Search catalog"}</button>
        </form>
        {searched && !products.length && <p className="text-sm text-muted">No gift cards or eSIMs found. Try a different search.</p>}
        <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm">Allow up to five products ({selected.length} selected)</legend>{products.map(p => <label key={p.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3"><input type="checkbox" className="mt-1" checked={selected.includes(p.id)} onChange={e => { setSelected(ids => e.target.checked ? [...ids, p.id].slice(0, 5) : ids.filter(id => id !== p.id)); setEligibility(false); }} /><span className="text-sm">{p.name}<span className="block text-xs text-muted">{p.kind} · {p.country ?? "Check regional eligibility"}</span></span></label>)}</fieldset>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={eligibility} onChange={e => setEligibility(e.target.checked)} />I checked coverage, account requirements and redemption restrictions for these products. Catalog inclusion alone does not prove eligibility.</label></>}
        <button disabled={busy || !program.prizes.length || (needsCatalog && (!selected.length || !eligibility))} className={button} onClick={() => void run(async () => {
          if (!/^\d{1,2}(\.\d{1,2})?$/.test(budget)) throw new Error("Enter a budget between $0.01 and $20.");
          const d = await request<{ id: string; token: string }>("/api/campaigns", token, { title, country, budgetCents: Math.round(Number(budget) * 100), productIds: needsCatalog ? selected : [], program });
          setInvite(`${location.origin}/claim/${d.id}#${d.token}`); setData(await request<Listing>("/api/campaigns", token));
        })}>Create one-use invitation</button>
        <p className="text-xs text-muted">Expires in 24 hours. One participant per invitation. Requirements cannot be edited after creation. Quizzes and public evidence are not proof of unique humanity.</p>
      </section>
      {invite && <section className={panel}><h2 className="text-lg font-semibold">Share with your player</h2>
        <p className="text-sm text-muted">The player scans this with their phone camera or opens the link. Whoever claims first reserves the reward, so show it only to the intended player.</p>
        <QR value={invite} label="Player invitation QR code" size={240} />
        <div className="grid gap-2 sm:grid-cols-3"><button className={button} onClick={() => setPresenting("invite")}>Show QR full screen</button><button className={buttonSecondary} onClick={() => void run(() => navigator.clipboard.writeText(invite))}>Copy link</button>{"share" in navigator && <button className={buttonSecondary} onClick={() => void navigator.share({ title: "Your Zealed reward invitation", url: invite }).catch(() => undefined)}>Share…</button>}</div>
        <a className="break-all text-sm underline" href={invite} target="_blank" rel="noreferrer">Open player invitation</a>
        <p className="text-xs text-muted">Save this link now; its secret is not stored on the server.</p></section>}
      {presenting === "invite" && invite && <QRPresenter value={invite} label="Player invitation QR code" title="Scan to claim your reward" hint="Point your phone camera at this code. Keep the page that opens: your reward is sealed to that browser." onClose={() => setPresenting("")} />}
      <section className="flex flex-col gap-4"><h2 className="text-xl font-semibold">Campaigns</h2>{!data?.campaigns.length && <p className="text-muted">No campaigns yet. Create an invitation above.</p>}{data?.campaigns.map(c => <article key={c.id} className={panel}>
        <h3 className="font-semibold">{c.title}</h3><Steps label={`Progress for ${c.title}`} steps={c.program ? ["Shared", "Tasks", "Prize chosen", "Sent", "Received"] : TRACK} current={progress(c.status).done} failed={progress(c.status).failed} /><p className="text-sm">{c.claimed}/1 joined · {c.delivered} Bitrefill delivered · {c.acknowledged ?? 0} other prizes acknowledged</p><p className="text-xs text-muted">Bitrefill: ${(c.reservedCents / 100).toFixed(2)} reserved · ${((c.deliveredCents ?? 0) / 100).toFixed(2)} delivered value</p><p className="text-sm text-muted">Status: {c.status.replaceAll("_", " ")}</p>
        {c.program && <ProgramAdmin campaignId={c.id} token={token} />}
        {c.choice && <><p className="text-sm">{c.choice.productName} · {c.choice.packageValue} · ${(c.choice.priceCents / 100).toFixed(2)}</p><p className="text-sm text-muted">{c.choice.reason}</p></>}
        {(c.status === "proposed" || c.status === "awaiting_payment" || c.status === "expired" && !!c.choice) && <button className={button} disabled={busy} onClick={() => void run(async () => { const d = await request<{ payment: Payment }>(`/api/campaigns/${c.id}/approve`, token, {}); setPayment(d.payment); setPayCampaign(c.id); setData(await request<Listing>("/api/campaigns", token)); })}>{c.status === "expired" ? "Prepare a new payment request" : c.status === "proposed" ? "Approve exact reward & prepare payment" : "Show payment request"}</button>}
        {payment && payCampaign === c.id && c.status === "awaiting_payment" && <div className="flex flex-col gap-3"><p className="text-sm">Payment request expires {new Date(payment.expiresAt).toLocaleTimeString()}. Confirm once in your wallet.</p><NoirPayButton key={payment.id} to={payment.to} amountZec={payment.amountZec} memo={payment.memo} simulatedDetection={payment.simulated} /><p className="text-sm text-muted">Or scan with a testnet Zcash wallet on your phone:</p><QR value={payment.zip321} label="Sponsor payment QR code" /><div className="flex flex-wrap gap-x-5"><button className="min-h-11 text-sm underline" onClick={() => setPresenting("payment")}>Show payment QR full screen</button><a className="inline-flex min-h-11 items-center break-all text-sm underline" href={payment.zip321}>Open payment in wallet</a></div>{presenting === "payment" && <QRPresenter value={payment.zip321} label="Sponsor payment QR code" title="Scan with your Zcash wallet" hint={`${payment.amountZec} TAZ to a shielded testnet address. The memo identifies this order; keep it unchanged.`} onClose={() => setPresenting("")} />}{payment.simulated && <p className="text-accent">SIMULATED payment detection. Not real purchase evidence.</p>}</div>}
        {["failed", "failed_uncertain", "expired", "selection_failed"].includes(c.status) && <p className="text-sm text-muted">Contact the player or operator. Uncertain purchases must be reconciled before spending again.</p>}
      </article>)}</section>
    </>}
  </RewardLayout>;
}
