"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { RewardLayout, QR, QRPresenter, field, button, buttonSecondary, panel, request, CopyButton, Notice, StatusTag } from "../reward-ui";
import { Steps } from "../role-switch";
import { NoirPayButton } from "../noir-pay";
import type { CatalogProduct } from "@/lib/bitrefill";
import type { Choice } from "@/lib/campaigns";
import { ProgramBuilder, initialProgram } from "../program-builder";
import { ProgramAdmin } from "../program-admin";
import { taskProblem, programInput, type ProgramInput, type PublicProgram } from "@/lib/program-schema";
import { Icon } from "../ui-icon";
type Summary = { program?: PublicProgram; acknowledged?: number; id: string; title: string; expiresAt?: number; budgetCents: number; country: string; claimed: number; delivered: number; reservedCents: number; deliveredCents: number; status: string; choice: Choice | null };
type Listing = { campaigns: Summary[]; simulatedCatalog: boolean; purchaseMode: string; openSponsor?: boolean; maxBudgetCents?: number };
// The anonymous sponsor key for this browser. The server stores only its hash.
const SPONSOR_STORAGE = "zealed:sponsor";
const INVITES_STORAGE = "zealed:sponsor:invitations";
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
  const [view, setView] = useState<"create" | "manage">("create");
  const [step, setStep] = useState(0);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const [knownProducts, setKnownProducts] = useState<Record<string, CatalogProduct>>({});
  const [refreshedAt, setRefreshedAt] = useState(0);
  const [savedInvites, setSavedInvites] = useState<Record<string, string>>({});
  const [campaignQuery, setCampaignQuery] = useState("");
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
    try {
      const entries = Object.entries(JSON.parse(localStorage.getItem(INVITES_STORAGE) ?? "{}"));
      const safe = entries.filter(([id, token]) => /^[a-f0-9-]{36}$/.test(id) && typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore browser-only invitation capabilities after hydration
      setSavedInvites(Object.fromEntries(safe) as Record<string, string>);
    } catch { /* invitation copy still works for this session */ }
    const moved = location.hash.match(/^#sponsor=(zs_[A-Za-z0-9_-]{43})$/);
    if (moved) {
      // A sponsor access link from another device: keep the key in this browser and drop it from the address bar.
      saved = moved[1];
      try { localStorage.setItem(SPONSOR_STORAGE, saved); } catch { /* storage unavailable: access lasts until reload */ }
      history.replaceState(null, "", location.pathname);
    } else {
      try { saved = localStorage.getItem(SPONSOR_STORAGE) ?? ""; } catch { /* storage unavailable */ }
    }
    fetch("/api/sponsors", { cache: "no-store" }).then(r => r.json()).then((d: { open: boolean; maxBudgetCents: number }) => {
      setOpenAccess(d.open); setMaxBudget(d.maxBudgetCents);
      if (d.open && saved) setToken(saved);
    }).catch(() => setOpenAccess(false));
  }, []);
  useEffect(() => {
    if (!token) return;
    let live = true;
    const load = () => request<Listing>("/api/campaigns", token).then(d => { if (live) { setData(d); setRefreshedAt(Date.now()); } }).catch(e => {
      if (!live) return;
      if ((e as Error).message.startsWith("Your sponsor session")) { forgetSponsor(); setToken(""); }
      setError((e as Error).message);
    });
    load(); const timer = setInterval(load, 4000); return () => { live = false; clearInterval(timer); };
  }, [token]);
  async function run(action: () => Promise<void>) { setBusy(true); setError(""); try { await action(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  function unlock(e: FormEvent) { e.preventDefault(); void run(async () => { const d = await request<Listing>("/api/campaigns", login); setData(d); setToken(login); setLogin(""); }); }
  const stepNames = ["Details", "Missions", "Prizes"];
  const budgetLimit = data?.maxBudgetCents ?? (data?.openSponsor ? maxBudget : 2000);
  function moveStep(next: number) {
    setError("");
    if (next > step && step === 0 && title.trim().length < 3) { setError("Give your campaign a name of at least 3 characters."); return; }
    const problem = next > step && step === 1 ? program.tasks.map((t, i) => taskProblem(t, i + 1)).find(Boolean) : null;
    if (problem) { setError(problem); return; }
    setStep(next); requestAnimationFrame(() => stepTitle.current?.focus());
  }
  async function createInvitation() {
    if (!programInput.safeParse(program).success) throw new Error("Complete every mission and prize description before creating the invitation.");
    if (!/^\d{1,2}(\.\d{1,2})?$/.test(budget) || Number(budget) <= 0 || Math.round(Number(budget) * 100) > budgetLimit) throw new Error(`Enter a budget between $0.01 and $${(budgetLimit / 100).toFixed(2)}.`);
    const d = await request<{ id: string; token: string }>("/api/campaigns", token, { title, country, budgetCents: Math.round(Number(budget) * 100), productIds: needsCatalog ? selected : [], program });
    const invitations = { ...savedInvites, [d.id]: d.token };
    setSavedInvites(invitations);
    try { localStorage.setItem(INVITES_STORAGE, JSON.stringify(invitations)); } catch { /* keep in memory and offer Copy */ }
    setProgram(structuredClone(initialProgram)); setTitle("Welcome to the community"); setStep(0); setSelected([]); setProducts([]); setSearched(false); setEligibility(false);
    setInvite(`${location.origin}/claim/${d.id}#${d.token}`); setData(await request<Listing>("/api/campaigns", token)); setView("manage");
  }
  const campaigns = data?.campaigns.filter(c => c.title.toLowerCase().includes(campaignQuery.toLowerCase())) ?? [];
  return <RewardLayout title="Your event. Their next reward." role="fund" description="Give people a reason to take part. Create a mission checklist, offer prizes and follow every invitation from start to finish.">
    {error && <Notice tone="error">{error}</Notice>}
    {!token ? <section className={`${panel} workspace-login`}>
      <Icon name="gift" />
      <h2>Bring your rewards to life</h2>
      <p className="workspace-note">One invitation, one participant, one prize. You choose the tasks and review the results.</p>
      {openAccess !== false && <>
        <button className={button} disabled={busy || openAccess === null} onClick={() => void run(async () => {
          const d = await request<{ token: string }>("/api/sponsors", "", {});
          try { localStorage.setItem(SPONSOR_STORAGE, d.token); } catch { /* session remains in memory */ }
          setToken(d.token);
        })}>{busy ? "Starting…" : openAccess === null ? "Checking availability…" : "Start funding"}<Icon name="arrow" /></button>
        <p className="workspace-note">No account needed. This browser saves your organizer access. Test purchases are limited to ${(maxBudget / 100).toFixed(2)} per campaign.</p>
      </>}
      {openAccess === false && <details open className="border-t border-line pt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-muted">{openAccess === false ? "Enter your organizer token" : "Already have an organizer token?"}</summary>
        <form onSubmit={unlock} className="mt-3 flex flex-col gap-4">
          <label className="space-y-2"><span>Organizer access token</span><input autoComplete="current-password" type="password" required minLength={32} value={login} onChange={e => setLogin(e.target.value)} className={field} /></label>
          <p className="workspace-note">Your token stays in memory for this session.</p>
          <button disabled={busy} className={buttonSecondary}>{busy ? "Checking access…" : "Open organizer workspace"}</button>
        </form>
      </details>}
    </section> : <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="workspace-tabs" aria-label="Organizer views">
          <button aria-pressed={view === "create"} onClick={() => setView("create")}>Create invitation</button>
          <button aria-pressed={view === "manage"} onClick={() => setView("manage")}>Your campaigns <span className="ml-1 text-muted">{data?.campaigns.length ?? 0}</span></button>
        </div>
        <div className="flex items-center gap-3"><StatusTag tone="attention">{data?.purchaseMode === "test" ? "Test products · not redeemable" : data?.purchaseMode === "simulate" ? "Simulated purchases" : data ? "Live purchases" : "Loading…"}</StatusTag>{data?.openSponsor && <button className="min-h-11 text-xs text-muted underline" title="Anyone with this link can manage your campaigns. Share it only with yourself." onClick={() => void run(() => navigator.clipboard.writeText(`${location.origin}/campaigns#sponsor=${token}`))}>Copy access link for another device</button>}{!data?.openSponsor && <button className="min-h-11 text-sm text-muted underline" onClick={() => { setToken(""); setData(null); setInvite(""); setPayment(null); }}>Lock</button>}</div>
      </div>
      {view === "create" ? <div className="workspace-split">
        <section className={panel}>
          <ol className="workspace-stages" aria-label="Invitation setup">{stepNames.map((name, i) => <li key={name}><button type="button" aria-current={step === i ? "step" : undefined} disabled={i > step} onClick={() => moveStep(i)}><span className="workspace-stage-number">{i < step ? <Icon name="check" width={14} /> : i + 1}</span>{name}</button></li>)}</ol>
          <h2 ref={stepTitle} tabIndex={-1}>{step === 0 ? "Give your campaign a name" : step === 1 ? "What should participants do?" : "What can they unlock?"}</h2>
          {step === 0 && <>
            <p className="workspace-note">This is the name participants see when they open your invitation.</p>
            <label className="flex flex-col gap-2">Campaign name<input className={field} value={title} maxLength={80} onChange={e => setTitle(e.target.value)} placeholder="e.g. Community workshop rewards" /></label>
            <Notice><strong className="block text-foreground">A private invitation for one person</strong>Share its QR or link with the intended participant. They have 24 hours to join, complete the tasks and reserve a prize.</Notice>
          </>}
          {step === 1 && <ProgramBuilder value={program} onChange={setProgram} section="missions" />}
          {step === 2 && <>
            <ProgramBuilder value={program} onChange={setProgram} section="prizes" />
            {needsCatalog && <section className="workspace-stack border-t border-line pt-6" aria-label="Bitrefill product eligibility">
              <div><h3 className="text-lg">Choose eligible Bitrefill products</h3><p className="workspace-note mt-2">The agent selects from your allowlist. Include at least one product for each Bitrefill prize type you offer.</p></div>
              <div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2">Country code<input className={field} value={country} maxLength={2} autoComplete="country" onChange={e => { setCountry(e.target.value.toUpperCase()); setSelected([]); setProducts([]); setEligibility(false); }} placeholder="IN" /></label><label className="flex flex-col gap-2">Maximum spend (USD)<input className={field} inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} /><span className="workspace-note">Up to ${(budgetLimit / 100).toFixed(2)} per reward.</span></label></div>
              <form onSubmit={e => { e.preventDefault(); void run(async () => { const d = await request<{ products: CatalogProduct[] }>(`/api/campaigns/catalog?q=${encodeURIComponent(query)}&country=${encodeURIComponent(country)}`, token); setProducts(d.products); setKnownProducts(all => ({ ...all, ...Object.fromEntries(d.products.map(p => [p.id, p])) })); setSearched(true); }); }} className="flex flex-col gap-3">
                <label className="flex flex-col gap-2">Search the catalog<input type="search" className={field} value={query} minLength={2} maxLength={60} required onChange={e => setQuery(e.target.value)} placeholder="eSIM, gift card or brand" /></label><button disabled={busy} className={buttonSecondary}>{busy ? "Searching…" : "Search catalog"}</button>
              </form>
              {searched && !products.length && <p role="status" className="workspace-note">No products found. Try a different search or country.</p>}
              {products.length > 0 && <fieldset className="space-y-3"><legend className="mb-3 text-sm">Select up to five products</legend>{products.map(p => <label key={p.id} className="workspace-choice"><input type="checkbox" checked={selected.includes(p.id)} disabled={!selected.includes(p.id) && selected.length >= 5} onChange={e => { setSelected(ids => e.target.checked ? [...ids, p.id].slice(0, 5) : ids.filter(id => id !== p.id)); setEligibility(false); }} /><span className="text-sm">{p.name}<span className="block text-xs text-muted">{p.kind === "esim" ? "eSIM" : "Gift card"} · {p.country ?? "Check regional eligibility"}</span></span></label>)}</fieldset>}
              {selected.length > 0 && <div className="space-y-2"><p className="workspace-note">{selected.length}/5 allowed products</p>{selected.map(id => <div key={id} className="flex items-center justify-between gap-2 border-b border-line text-sm"><span>{knownProducts[id]?.name ?? id}</span><button type="button" aria-label={`Remove ${knownProducts[id]?.name ?? id}`} className="flex min-h-11 min-w-11 items-center justify-center" onClick={() => { setSelected(ids => ids.filter(x => x !== id)); setEligibility(false); }}><Icon name="close" width={16} /></button></div>)}</div>}
              <label className="workspace-choice"><input type="checkbox" checked={eligibility} onChange={e => setEligibility(e.target.checked)} /><span className="text-sm">I checked coverage, account requirements and redemption restrictions. Catalog inclusion alone does not prove eligibility.</span></label>
            </section>}
            <p className="workspace-note">Requirements and prize options are locked after creation. You can review submissions and fulfill the chosen prize afterward.</p>
          </>}
          <div className="workspace-form-actions">{step > 0 ? <button className={buttonSecondary} disabled={busy} onClick={() => moveStep(step - 1)}>Back</button> : <span className="workspace-note">Step 1 of 3</span>}{step < 2 ? <button className={button} onClick={() => moveStep(step + 1)}>Continue<Icon name="arrow" /></button> : <button disabled={busy || !program.prizes.length || (needsCatalog && (!selected.length || !eligibility))} className={button} onClick={() => void run(createInvitation)}>{busy ? "Creating invitation…" : "Create one-use invitation"}<Icon name="arrow" /></button>}</div>
        </section>
        <aside className="workspace-aside"><div className={panel}><Icon name="gift" className="text-accent" width={28} height={28} /><h2>{title.trim() || "Your campaign"}</h2><dl className="workspace-summary"><dt>Required missions</dt><dd>{program.tasks.length}</dd><dt>Prize options</dt><dd>{program.prizes.length}</dd><dt>Participants</dt><dd>1 per invitation</dd><dt>Claim window</dt><dd>24 hours</dd>{needsCatalog && <><dt>Bitrefill budget</dt><dd>${Number(budget || 0).toFixed(2)}</dd></>}</dl></div><p className="workspace-note flex gap-3"><Icon name="lock" className="shrink-0" />No deposit is held. You authorize Bitrefill purchases individually and fulfill custom or Zcash prizes yourself.</p></aside>
      </div> : <>
        {invite && <section className={panel} aria-label="Invitation ready"><div className="flex flex-wrap items-start justify-between gap-3"><div><StatusTag tone="success"><Icon name="check" width={14} /> Invitation ready</StatusTag><h2 className="mt-3">Your participant can start now</h2></div><button className="flex min-h-11 min-w-11 items-center justify-center" aria-label="Dismiss invitation link" onClick={() => setInvite("")}><Icon name="close" /></button></div><div className="grid items-start gap-6 sm:grid-cols-[180px_1fr]"><QR value={invite} label="Player invitation QR code" size={180} /><div className="space-y-4"><p className="workspace-note">Share privately with your intended participant. The first person to join reserves the invitation.</p><div className="flex flex-wrap gap-2"><CopyButton value={invite} /><button className={buttonSecondary} onClick={() => setPresenting("invite")}><Icon name="qr" />Enlarge QR</button></div><a className="workspace-inline-link" href={invite} target="_blank" rel="noreferrer">Open player invitation<Icon name="arrow" width={16} /></a><p className="text-xs text-accent">Save this link now. Its secret cannot be retrieved from the server.</p></div></div></section>}
        {presenting === "invite" && invite && <QRPresenter value={invite} label="Player invitation QR code" title="Scan to start your missions" hint="Open this invitation in the participant’s browser. Keep its storage to receive the reward." onClose={() => setPresenting("")} />}
        <section className="workspace-stack"><div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">Your campaigns</h2>{!!data?.campaigns.length && <label className="w-full sm:w-64"><span className="sr-only">Find a campaign</span><input type="search" className={field} placeholder="Find a campaign…" value={campaignQuery} onChange={e => setCampaignQuery(e.target.value)} /></label>}</div>
          {!campaigns.length && <div className="workspace-empty"><Icon name="grid" /><h3 className="text-xl font-semibold">{campaignQuery ? "No matching campaigns" : "Your first reward starts here"}</h3><p>{campaignQuery ? "Try another campaign name." : "Create an invitation, share it with a participant and follow their progress here."}</p>{!campaignQuery && <button className={button} onClick={() => { setView("create"); moveStep(0); }}>Create an invitation<Icon name="plus" /></button>}</div>}
          {campaigns.map(c => <article key={c.id} className={panel}>
            <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-xl">{c.title}</h3><StatusTag tone={progress(c.status).failed ? "error" : ["delivered", "prize_acknowledged"].includes(c.status) ? "success" : "attention"}>{c.status.replaceAll("_", " ")}</StatusTag></div>
            <Steps label={`Progress for ${c.title}`} steps={c.program ? ["Shared", "Tasks", "Prize chosen", "Sent", "Received"] : TRACK} current={progress(c.status).done} failed={progress(c.status).failed} />
            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted"><span>{c.claimed}/1 joined</span><span>{c.delivered} Bitrefill delivered</span><span>{c.acknowledged ?? 0} {(c.acknowledged ?? 0) === 1 ? "other prize" : "other prizes"} acknowledged</span><span>${(c.reservedCents / 100).toFixed(2)} reserved</span></div>
            {c.status === "available" && savedInvites[c.id] && (!c.expiresAt || c.expiresAt > refreshedAt) && <div className="flex flex-wrap gap-2"><CopyButton value={`${location.origin}/claim/${c.id}#${savedInvites[c.id]}`} /><button className={buttonSecondary} onClick={() => { setInvite(`${location.origin}/claim/${c.id}#${savedInvites[c.id]}`); setPresenting("invite"); }}><Icon name="qr" />Show invitation QR</button></div>}
            {c.program && <ProgramAdmin campaignId={c.id} token={token} />}
            {c.choice && <div className="space-y-2"><p>{c.choice.productName} · {c.choice.packageValue} · ${(c.choice.priceCents / 100).toFixed(2)}</p><p className="workspace-note">{c.choice.reason}</p></div>}
            {(c.status === "proposed" || c.status === "awaiting_payment" || c.status === "expired" && !!c.choice) && <button className={button} disabled={busy} onClick={() => void run(async () => { const d = await request<{ payment: Payment }>(`/api/campaigns/${c.id}/approve`, token, {}); setPayment(d.payment); setPayCampaign(c.id); setData(await request<Listing>("/api/campaigns", token)); })}>{c.status === "expired" ? "Prepare a new payment request" : c.status === "proposed" ? "Approve exact reward & prepare payment" : "Show payment request"}</button>}
            {payment && payCampaign === c.id && c.status === "awaiting_payment" && <div className="workspace-stack border-t border-line pt-5"><p className="workspace-note">Expires {new Date(payment.expiresAt).toLocaleTimeString()}. Confirm once in your wallet.</p><NoirPayButton key={payment.id} to={payment.to} amountZec={payment.amountZec} memo={payment.memo} simulatedDetection={payment.simulated} /><div className="flex flex-wrap items-start gap-6"><QR value={payment.zip321} label="Sponsor payment QR code" /><div className="space-y-3"><p className="workspace-note">Scan with a testnet Zcash wallet.</p><button className={buttonSecondary} onClick={() => setPresenting("payment")}><Icon name="qr" />Enlarge payment QR</button><a className="workspace-inline-link" href={payment.zip321}>Open payment in wallet<Icon name="arrow" /></a></div></div>{presenting === "payment" && <QRPresenter value={payment.zip321} label="Sponsor payment QR code" title="Scan with your Zcash wallet" hint={`${payment.amountZec} TAZ to a shielded testnet address. Keep the memo unchanged.`} onClose={() => setPresenting("")} />}{payment.simulated && <StatusTag tone="attention">SIMULATED payment detection</StatusTag>}</div>}
            {["failed", "failed_uncertain", "expired", "selection_failed"].includes(c.status) && <Notice>Contact the participant or operator. Uncertain purchases must be reconciled before spending again.</Notice>}
          </article>)}
        </section>
      </>}
    </>}
  </RewardLayout>;
}
