"use client";
import { useEffect, useState, type FormEvent } from "react";
import { RewardLayout, QR, field, button, panel, request } from "../reward-ui";
import { NoirPayButton } from "../noir-pay";
import type { CatalogProduct } from "@/lib/bitrefill";
import type { Choice } from "@/lib/campaigns";
type Summary = { id: string; title: string; budgetCents: number; country: string; claimed: number; delivered: number; reservedCents: number; deliveredCents: number; status: string; choice: Choice | null };
type Listing = { campaigns: Summary[]; simulatedCatalog: boolean; purchaseMode: string };
type Payment = { id: string; to: string; amountZec: string; memo: string; zip321: string; status: string; simulated: boolean; expiresAt: number };
export function CampaignDashboard() {
  const [token, setToken] = useState(""), [login, setLogin] = useState("");
  const [data, setData] = useState<Listing | null>(null), [error, setError] = useState("");
  const [title, setTitle] = useState("Welcome to the community"), [country, setCountry] = useState("IN"), [budget, setBudget] = useState("5.00");
  const [query, setQuery] = useState("esim"), [products, setProducts] = useState<CatalogProduct[]>([]), [selected, setSelected] = useState<string[]>([]);
  const [searched, setSearched] = useState(false), [eligibility, setEligibility] = useState(false), [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState(""), [payment, setPayment] = useState<Payment | null>(null), [payCampaign, setPayCampaign] = useState("");
  useEffect(() => {
    if (!token) return;
    let live = true;
    const load = () => request<Listing>("/api/campaigns", token).then(d => { if (live) setData(d); }).catch(e => { if (live) setError(e.message); });
    load(); const timer = setInterval(load, 4000); return () => { live = false; clearInterval(timer); };
  }, [token]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function unlock(e: FormEvent) { e.preventDefault(); void run(async () => { const d = await request<Listing>("/api/campaigns", login); setData(d); setToken(login); setLogin(""); }); }
  return <RewardLayout title="Sponsor a private reward">
    <p className="text-muted">Create one invitation. A player completes a short mission, the agent selects a perk, and you authorise the exact purchase. No deposit is held.</p>
    {error && <p role="alert" className="rounded-lg border border-danger p-3 text-sm text-danger">{error}</p>}
    {!token ? <form onSubmit={unlock} className={panel}>
      <label className="flex flex-col gap-2">Organizer access token<input autoComplete="current-password" type="password" required minLength={32} value={login} onChange={e => setLogin(e.target.value)} className={field} /></label>
      <p className="text-xs text-muted">Use the token provided by the Zealed operator. It stays in memory for this session.</p><button disabled={busy} className={button}>{busy ? "Checking access…" : "Open organizer workspace"}</button>
    </form> : <>
      <div className="flex items-center justify-between gap-3 text-sm"><p>{data?.simulatedCatalog ? "SIMULATED catalog" : "Live catalog"} · Purchases: <strong>{data?.purchaseMode}</strong>{data?.purchaseMode === "test" && " (not redeemable)"}</p><button className="min-h-11 underline" onClick={() => { setToken(""); setData(null); setInvite(""); setPayment(null); }}>Lock workspace</button></div>
      <section className={panel}><h2 className="text-lg font-semibold">New invitation</h2>
        <label className="flex flex-col gap-2">Campaign name<input className={field} value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2">Destination country code<input className={field} value={country} maxLength={2} autoComplete="country" onChange={e => { setCountry(e.target.value.toUpperCase()); setSelected([]); setProducts([]); setEligibility(false); }} /></label><label className="flex flex-col gap-2">Maximum reward (USD)<input className={field} inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} /></label></div>
        <form onSubmit={e => { e.preventDefault(); void run(async () => { const d = await request<{ products: CatalogProduct[] }>(`/api/campaigns/catalog?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`, token); setProducts(d.products); setSearched(true); }); }} className="flex flex-col gap-3">
          <label className="flex flex-col gap-2">Find eligible perks<input type="search" className={field} value={query} minLength={2} maxLength={60} required onChange={e => setQuery(e.target.value)} /></label><button disabled={busy} className={button}>{busy ? "Working…" : "Search catalog"}</button>
        </form>
        {searched && !products.length && <p className="text-sm text-muted">No gift cards or eSIMs found. Try a different search.</p>}
        <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-sm">Allow up to five products ({selected.length} selected)</legend>{products.map(p => <label key={p.id} className="flex min-h-11 items-start gap-3 rounded-lg border border-line p-3"><input type="checkbox" className="mt-1" checked={selected.includes(p.id)} onChange={e => { setSelected(ids => e.target.checked ? [...ids, p.id].slice(0, 5) : ids.filter(id => id !== p.id)); setEligibility(false); }} /><span className="text-sm">{p.name}<span className="block text-xs text-muted">{p.kind} · {p.country ?? "Check regional eligibility"}</span></span></label>)}</fieldset>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={eligibility} onChange={e => setEligibility(e.target.checked)} />I checked coverage, account requirements and redemption restrictions for these products. Catalog inclusion alone does not prove eligibility.</label>
        <button disabled={busy || !selected.length || !eligibility} className={button} onClick={() => void run(async () => {
          if (!/^\d{1,2}(\.\d{1,2})?$/.test(budget)) throw new Error("Enter a budget between $0.01 and $20.");
          const d = await request<{ id: string; token: string }>("/api/campaigns", token, { title, country, budgetCents: Math.round(Number(budget) * 100), productIds: selected });
          setInvite(`${location.origin}/claim/${d.id}#${d.token}`); setData(await request<Listing>("/api/campaigns", token));
        })}>Create one-use invitation</button>
        <p className="text-xs text-muted">Expires in 24 hours. The first successful claimant reserves it. A quiz is not proof of unique humanity.</p>
      </section>
      {invite && <section className={panel}><h2 className="font-semibold">Invitation ready</h2><QR value={invite} label="Player invitation QR code" /><a className="break-all text-sm underline" href={invite} target="_blank" rel="noreferrer">Open player invitation</a><button className={button} onClick={() => void run(() => navigator.clipboard.writeText(invite))}>Copy invitation link</button><p className="text-xs text-muted">Save this link now; its secret is not stored on the server. Share it privately with the intended player.</p></section>}
      <section className="flex flex-col gap-4"><h2 className="text-xl font-semibold">Campaigns</h2>{!data?.campaigns.length && <p className="text-muted">No campaigns yet. Create an invitation above.</p>}{data?.campaigns.map(c => <article key={c.id} className={panel}>
        <h3 className="font-semibold">{c.title}</h3><p className="text-sm">{c.claimed}/1 claimed · {c.delivered} delivered · ${(c.reservedCents / 100).toFixed(2)} reserved · ${((c.deliveredCents ?? 0) / 100).toFixed(2)} delivered value</p><p className="text-sm text-muted">Status: {c.status}</p>
        {c.choice && <><p className="text-sm">{c.choice.productName} · {c.choice.packageValue} · ${(c.choice.priceCents / 100).toFixed(2)}</p><p className="text-sm text-muted">{c.choice.reason}</p></>}
        {(c.status === "proposed" || c.status === "awaiting_payment") && <button className={button} disabled={busy} onClick={() => void run(async () => { const d = await request<{ payment: Payment }>(`/api/campaigns/${c.id}/approve`, token, {}); setPayment(d.payment); setPayCampaign(c.id); setData(await request<Listing>("/api/campaigns", token)); })}>{c.status === "proposed" ? "Approve exact reward & prepare payment" : "Show payment request"}</button>}
        {payment && payCampaign === c.id && c.status === "awaiting_payment" && <div className="flex flex-col gap-3"><p className="text-sm">Payment request expires {new Date(payment.expiresAt).toLocaleTimeString()}. Confirm once in your wallet.</p><NoirPayButton key={payment.id} to={payment.to} amountZec={payment.amountZec} memo={payment.memo} simulatedDetection={payment.simulated} /><QR value={payment.zip321} label="Sponsor payment QR code" /><a className="min-h-11 break-all text-sm underline" href={payment.zip321}>Open payment in wallet</a>{payment.simulated && <p className="text-accent">SIMULATED payment detection. Not real purchase evidence.</p>}</div>}
        {["failed", "failed_uncertain", "expired", "selection_failed"].includes(c.status) && <p className="text-sm text-muted">Contact the player or operator. Uncertain purchases must be reconciled before spending again.</p>}
      </article>)}</section>
    </>}
  </RewardLayout>;
}
