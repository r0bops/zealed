"use client";
import { useEffect, useState, type FormEvent } from "react";
import { RewardLayout, QR, QRPresenter, Details, LoadingLine, field, button, buttonSecondary, humanizeError, panel, request, formatUsd } from "../reward-ui";
import { Steps } from "../role-switch";
import { NoirPayButton } from "../noir-pay";
import type { CatalogProduct } from "@/lib/bitrefill";
import type { Choice } from "@/lib/campaigns";
import { ProgramBuilder, initialProgram } from "../program-builder";
import { ProgramAdmin } from "../program-admin";
import type { ProgramInput, PublicProgram } from "@/lib/program-schema";
type Summary = { program?: PublicProgram; acknowledged?: number; id: string; title: string; budgetCents: number; country: string; claimed: number; delivered: number; reservedCents: number; deliveredCents: number; status: string; choice: Choice | null };
type Listing = { campaigns: Summary[]; simulatedCatalog: boolean; purchaseMode: string };
type Payment = { id: string; to: string; amountZec: string; memo: string; zip321: string; status: string; simulated: boolean; expiresAt: number };
const TRACK = ["Shared", "Joined", "Reward picked", "Approved", "Delivered"];
const WIZARD = ["Mission", "Budget", "Invite"];
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
function friendlyStatus(status: string): string {
  const labels: Record<string, string> = {
    available: "Waiting for someone to join",
    tasks_pending: "Mission in progress",
    prize_unlocked: "Ready to pick a reward",
    prize_reserved: "Reward picked",
    prize_requested: "Waiting for you to approve",
    prize_ready: "Approved",
    prize_acknowledged: "Delivered",
    selecting: "Picking a reward",
    selection_failed: "No matching reward",
    proposed: "Waiting for you to approve",
    awaiting_payment: "Waiting for your approval",
    payment_seen: "Approved privately with Zcash",
    paid: "Approved privately with Zcash",
    fulfilling: "Preparing the reward",
    delivered: "Delivered",
    expired: "Request expired",
    failed: "Needs attention",
    failed_uncertain: "Needs attention",
  };
  return labels[status] ?? "In progress";
}
function needsApprove(c: Summary): boolean {
  return c.status === "proposed" || c.status === "awaiting_payment" || (c.status === "expired" && !!c.choice);
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
  const [wizard, setWizard] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const tick = () => request<Listing>("/api/campaigns", token).then(d => { if (live) setData(d); }).catch(e => { if (live) setError((e as Error).message); });
    void tick(); const timer = setInterval(tick, 4000); return () => { live = false; clearInterval(timer); };
  }, [token]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function unlock(e: FormEvent) { e.preventDefault(); void run(async () => { const d = await request<Listing>("/api/campaigns", login); setData(d); setToken(login); setLogin(""); }); }
  const approval = data?.campaigns.find(needsApprove);
  const paying = !!(payment && data?.campaigns.some(c => c.id === payCampaign && c.status === "awaiting_payment"));
  const missionReady = !!title.trim() && /^[A-Za-z]{2}$/.test(country) && program.prizes.length > 0 && (!needsCatalog || (selected.length > 0 && eligibility));
  const budgetOk = /^\d{1,2}(\.\d{1,2})?$/.test(budget);
  const primary = !token ? "unlock" : paying ? "pay" : approval ? "approve" : invite ? "copy" : wizard === 2 ? "create" : "continue";
  const gold = (name: string) => primary === name ? button : buttonSecondary;
  return <RewardLayout title="Create campaign" role="fund">
    <p className="text-muted">Set the mission and the budget, then share one invite. You approve the reward with Zcash. Nothing is held up front.</p>
    {error && <p role="alert" className="rounded-lg border border-danger p-3 text-base text-danger">{humanizeError(error).text}</p>}
    {!token ? <form onSubmit={unlock} className={panel}>
      <label className="flex flex-col gap-2 text-base">Organizer access<input autoComplete="current-password" type="password" required minLength={32} value={login} onChange={e => setLogin(e.target.value)} className={field} /></label>
      <p className="text-sm text-muted">Use the access code from the Zealed operator. It stays in this tab until you lock it.</p>
      <button disabled={busy} className={button}>{busy ? "Opening your campaigns…" : "Open campaigns"}</button>
    </form> : <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>{data?.simulatedCatalog ? "Demo catalog" : "Live catalog"} · Purchases: <strong>{data?.purchaseMode}</strong>{(data?.purchaseMode === "test" || data?.purchaseMode === "simulate") && " (not redeemable)"}</p>
        <button type="button" className={buttonSecondary} onClick={() => { setToken(""); setData(null); setInvite(""); setPayment(null); }}>Lock</button>
      </div>
      {!data && <LoadingLine>Opening your campaigns…</LoadingLine>}
      <section className={panel}>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted">Step {Math.min(wizard, 2) + 1} of 3</p>
          <ol aria-label="Create a campaign" className="grid grid-cols-3 gap-2">
            {WIZARD.map((label, i) => <li key={label} aria-current={i === wizard ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
              <span aria-hidden className={`h-1 rounded-full ${i < wizard ? "bg-sealed" : i === wizard ? "bg-accent" : "bg-line"}`} />
              <span className={`text-sm ${i === wizard ? "font-medium text-accent" : i < wizard ? "text-foreground" : "text-muted"}`}>{label}</span>
            </li>)}
          </ol>
        </div>
        {wizard === 0 && <>
          <ProgramBuilder value={program} onChange={setProgram} />
          <h2 className="text-lg font-semibold">Name the campaign</h2>
          <label className="flex flex-col gap-2 text-base">Campaign name<input className={field} value={title} maxLength={80} onChange={e => setTitle(e.target.value)} /></label>
          <label className="flex flex-col gap-2 text-base">Country (two letters, like US)<input className={field} value={country} maxLength={2} autoComplete="country" onChange={e => { setCountry(e.target.value.toUpperCase()); setSelected([]); setProducts([]); setEligibility(false); }} /></label>
          {needsCatalog && <>
            <form onSubmit={e => { e.preventDefault(); void run(async () => { const d = await request<{ products: CatalogProduct[] }>(`/api/campaigns/catalog?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`, token); setProducts(d.products); setSearched(true); }); }} className="flex flex-col gap-3">
              <label className="flex flex-col gap-2 text-base">Search rewards<input type="search" className={field} value={query} minLength={2} maxLength={60} required onChange={e => setQuery(e.target.value)} /></label>
              <button disabled={busy} className={buttonSecondary}>{busy ? "Searching…" : "Search"}</button>
            </form>
            {searched && !products.length && <p className="text-base text-muted">Nothing matched. Try a different search.</p>}
            <fieldset className="flex flex-col gap-2"><legend className="mb-2 text-base">Choose up to five ({selected.length} selected)</legend>{products.map(p => <label key={p.id} className="flex min-h-12 items-start gap-3 rounded-lg border border-line p-3"><input type="checkbox" className="mt-1" checked={selected.includes(p.id)} onChange={e => { setSelected(ids => e.target.checked ? [...ids, p.id].slice(0, 5) : ids.filter(id => id !== p.id)); setEligibility(false); }} /><span className="text-base">{p.name}<span className="block text-sm text-muted">{p.kind === "esim" ? "Mobile data" : "Gift card"} · {p.country ?? "Check the country"}</span></span></label>)}</fieldset>
            <label className="flex min-h-12 items-start gap-3 text-base"><input type="checkbox" className="mt-1" checked={eligibility} onChange={e => setEligibility(e.target.checked)} />I checked coverage, account requirements and redemption restrictions for these products. Catalog inclusion alone does not prove eligibility.</label>
          </>}
          <button type="button" className={gold("continue")} disabled={!missionReady} onClick={() => setWizard(1)}>Continue</button>
          {!missionReady && <p className="text-sm text-muted">Add a name, a two-letter country, and at least one reward.</p>}
        </>}
        {wizard === 1 && <>
          <h2 className="text-lg font-semibold">Set a budget</h2>
          <p className="text-base text-muted">The reward stays inside this amount.</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Budget suggestions">
            {["5", "10", "20"].map(n => {
              const on = Number(budget) === Number(n);
              return <button type="button" key={n} aria-pressed={on} className={`min-h-12 rounded-full border px-4 text-base ${on ? "border-accent text-accent" : "border-line text-foreground"}`} onClick={() => setBudget(Number(n).toFixed(2))}>${n}</button>;
            })}
          </div>
          <label className="flex flex-col gap-2 text-base">Or type an amount in USD<input className={field} inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} /></label>
          <button type="button" className={gold("continue")} disabled={!budgetOk} onClick={() => setWizard(2)}>Continue</button>
          <button type="button" className={buttonSecondary} onClick={() => setWizard(0)}>Back</button>
        </>}
        {wizard === 2 && <>
          <h2 className="text-lg font-semibold">{invite ? "Share the invite" : "Invite one person"}</h2>
          <p className="text-base text-muted">{title} · {country} · up to {budgetOk ? formatUsd(Math.round(Number(budget) * 100)) : budget}</p>
          {!invite ? <>
            <button type="button" disabled={busy || !missionReady || !budgetOk} className={gold("create")} onClick={() => void run(async () => {
              if (!budgetOk) throw new Error("Enter a budget between $0.01 and $20.");
              const d = await request<{ id: string; token: string }>("/api/campaigns", token, { title, country, budgetCents: Math.round(Number(budget) * 100), productIds: needsCatalog ? selected : [], program });
              setInvite(`${location.origin}/claim/${d.id}#${d.token}`); setCopied(false); setData(await request<Listing>("/api/campaigns", token));
            })}>{busy ? "Creating the invite…" : "Create campaign"}</button>
            <p className="text-sm text-muted">The invite lasts 24 hours and works once. You can’t edit the mission after this.</p>
            <button type="button" className={buttonSecondary} onClick={() => setWizard(1)}>Back</button>
          </> : <>
            <p className="text-base text-muted">They scan this code or open the link. Only the first person to open it gets the reward.</p>
            <QR value={invite} label="Invite QR code" size={240} />
            <button type="button" className={gold("copy")} onClick={() => void run(async () => { await navigator.clipboard.writeText(invite); setCopied(true); })}>{copied ? "Copied" : "Copy invite link"}</button>
            <button type="button" className={buttonSecondary} onClick={() => setPresenting("invite")}>Show the QR full screen</button>
            {"share" in navigator && <button type="button" className={buttonSecondary} onClick={() => void navigator.share({ title: "Your Zealed reward invite", url: invite }).catch(() => undefined)}>Share</button>}
            <button type="button" className={buttonSecondary} onClick={() => { setInvite(""); setCopied(false); setWizard(0); }}>Create another campaign</button>
            <Details><a className="underline" href={invite} target="_blank" rel="noreferrer">{invite}</a><p>Save this link now. It is not stored for you later.</p></Details>
          </>}
        </>}
      </section>
      {presenting === "invite" && invite && <QRPresenter value={invite} label="Invite QR code" title="Scan to claim your reward" hint="Point your phone camera at this code. Keep the page that opens: your reward stays in that browser." onClose={() => setPresenting("")} />}
      <section className="flex flex-col gap-4"><h2 className="text-xl font-semibold">Your campaigns</h2>
        {data && !data.campaigns.length && <p className="text-muted">No campaigns yet. Create one above.</p>}
        {data?.campaigns.map(c => <article key={c.id} className={panel}>
          <h3 className="text-lg font-semibold">{c.title}</h3>
          <Steps label={`Progress for ${c.title}`} steps={c.program ? ["Shared", "Mission", "Reward picked", "Approved", "Delivered"] : TRACK} current={progress(c.status).done} failed={progress(c.status).failed} />
          <p className="text-base">{friendlyStatus(c.status)}</p>
          <p className="text-sm text-muted">{c.claimed} joined · {c.delivered} delivered</p>
          {c.choice && <p className="text-base">{c.choice.productName} · {c.choice.packageValue} · {formatUsd(c.choice.priceCents)}</p>}
          {c.choice && <p className="text-sm text-muted">{c.choice.reason}</p>}
          {c.program && <ProgramAdmin campaignId={c.id} token={token} />}
          {needsApprove(c) && !(payment && payCampaign === c.id && c.status === "awaiting_payment") && <button className={c.id === approval?.id ? gold("approve") : buttonSecondary} disabled={busy} onClick={() => void run(async () => { const d = await request<{ payment: Payment }>(`/api/campaigns/${c.id}/approve`, token, {}); setPayment(d.payment); setPayCampaign(c.id); setData(await request<Listing>("/api/campaigns", token)); })}>{c.status === "expired" ? "Prepare the approval again" : c.status === "proposed" ? "Approve this reward" : "Show the approval"}</button>}
          {payment && payCampaign === c.id && c.status === "awaiting_payment" && <div className="flex flex-col gap-3">
            <p className="text-base">Approve this with Zcash before {new Date(payment.expiresAt).toLocaleTimeString()}. Do it once.</p>
            <p className="text-base">Amount to authorise: {payment.amountZec} TAZ</p>
            <NoirPayButton key={payment.id} to={payment.to} amountZec={payment.amountZec} memo={payment.memo} simulatedDetection={payment.simulated} variant={primary === "pay" ? "primary" : "link"} />
            <p className="text-sm text-muted">Or scan with your Zcash wallet.</p>
            <QR value={payment.zip321} label="Approval QR code" />
            <button type="button" className={buttonSecondary} onClick={() => setPresenting("payment")}>Show the QR full screen</button>
            <a className={buttonSecondary} href={payment.zip321}>Open in your wallet</a>
            {payment.simulated && <p className="text-accent">Demo approval only. This is not a real purchase.</p>}
            <Details><p className="break-all">Note: {payment.memo}</p><p>Leave the note unchanged so the reward can be matched.</p></Details>
          </div>}
          {presenting === "payment" && payment && payCampaign === c.id && <QRPresenter value={payment.zip321} label="Approval QR code" title="Scan with your Zcash wallet" hint={`${payment.amountZec} TAZ. Approve it once and leave the note unchanged.`} onClose={() => setPresenting("")} />}
          <Details>
            <p>Status: {c.status.replaceAll("_", " ")}</p>
            <p>{formatUsd(c.reservedCents)} reserved · {formatUsd(c.deliveredCents ?? 0)} delivered</p>
            <p>{c.acknowledged ?? 0} other rewards confirmed</p>
          </Details>
          {["failed", "failed_uncertain", "expired", "selection_failed"].includes(c.status) && <p className="text-sm text-muted">Contact the player or the operator before approving another reward.</p>}
        </article>)}
      </section>
    </>}
  </RewardLayout>;
}
