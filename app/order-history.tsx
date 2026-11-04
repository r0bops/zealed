"use client";
import Link from "next/link";
import { get, keys } from "idb-keyval";
import { useEffect, useState } from "react";
import { PaymentPanel, statusText } from "./order-details";
import { rememberedOrderIds, orderAccessToken } from "@/lib/keystore";
import { button, buttonSecondary, field, Notice, request, StatusTag } from "./reward-ui";
import { Icon } from "./ui-icon";
type SavedReward = { id: string; title: string; detail: string; kind: "mission" | "order" | "gift"; status?: string };
export function OrderHistory({ active }: { active: boolean }) {
  const [selected, setSelected] = useState<string | null>(null), [items, setItems] = useState<SavedReward[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0), [filter, setFilter] = useState("all"), [query, setQuery] = useState("");
  useEffect(() => {
    if (!active) return;
    let live = true;
    (async () => {
      const [orderIds, storedKeys] = await Promise.all([rememberedOrderIds(), keys()]);
      const claimIds = storedKeys.filter((k): k is string => typeof k === "string" && k.startsWith("zealed:claim:")).slice(-20);
      const claims = await Promise.all(claimIds.map(async key => {
        const id = key.slice("zealed:claim:".length);
        const saved = await get<{ invitation: string; claimId?: string; secret?: string }>(key);
        let title = "Saved invitation", status = saved?.claimId ? "Joined" : "Not started";
        try {
          if (saved) title = (await request<{ title: string }>(`/api/campaigns/${id}`, saved.invitation)).title;
          if (saved?.claimId && saved.secret) {
            const progress = await request<{ eligible: boolean; redemption?: { state: string } } | null>(`/api/claims/${saved.claimId}/program`, saved.secret);
            if (progress) status = progress.redemption?.state === "acknowledged" ? "Received" : progress.redemption?.state === "ready" ? "Ready to open" : progress.redemption ? "Prize reserved" : progress.eligible ? "Prize unlocked" : "Missions in progress";
          }
        } catch { /* links remain useful while offline */ }
        return { id, title, detail: "Missions and prize delivery", kind: "mission" as const, status };
      }));
      const orders = await Promise.all(orderIds.slice(-20).map(async id => {
        let title = `Order ${id.slice(0, 8)}`, status = "Saved order";
        try {
          const data = await request<{ order: { productName: string; status: string }; sponsored?: boolean }>(`/api/orders/${id}`, await orderAccessToken(id) ?? "");
          title = data.order.productName; status = statusText(data.order.status, data.sponsored);
        } catch { /* the original page can explain authorization or connection errors */ }
        return { id, title, status, detail: `Bitrefill order · ${id.slice(0, 8)}`, kind: "order" as const };
      }));
      const gifts = storedKeys.filter((k): k is string => typeof k === "string" && k.startsWith("zealed:gift-received:")).slice(-20).map(key => ({ id: key.slice("zealed:gift-received:".length), title: "A sealed gift", detail: "Received on this browser", kind: "gift" as const }));
      if (live) { setItems([...claims.reverse(), ...gifts.reverse(), ...orders.reverse()]); setState("ready"); }
    })().catch(() => { if (live) setState("error"); });
    return () => { live = false; };
  }, [attempt, active]);
  if (selected) return <section className="workspace-stack" aria-label="Order details"><button type="button" className={buttonSecondary + " self-start"} onClick={() => setSelected(null)}>Back to my rewards</button><PaymentPanel key={selected} orderId={selected} /></section>;
  const visible = items.filter(i => (filter === "all" || i.kind === filter) && i.title.toLowerCase().includes(query.toLowerCase()));
  return <section aria-label="Saved rewards" className="workspace-stack">
    <div className="flex flex-wrap items-center justify-between gap-4"><div className="workspace-tabs" aria-label="Reward types">{[["all", "All"], ["mission", "Missions"], ["order", "Orders"], ["gift", "Gifts"]].map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div><label className="w-full sm:w-64"><span className="sr-only">Search saved rewards</span><input className={field} type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a reward…" /></label></div>
    {state === "loading" && <p className="workspace-note py-8" role="status">Opening the rewards saved on this browser…</p>}
    {state === "error" && <Notice tone="error"><p>We couldn’t read saved rewards. Enable browser storage or reopen your invitation link.</p><button className={buttonSecondary + " mt-3"} onClick={() => { setState("loading"); setAttempt(n => n + 1); }}>Try again</button></Notice>}
    {state === "ready" && !visible.length && <div className="workspace-empty"><Icon name="gift" /><h2 className="text-2xl font-semibold">{items.length ? "No rewards match yet" : "Your rewards belong here"}</h2><p>{items.length ? "Try another filter or search term." : "Join an event invitation to start a mission. Your progress, prizes and received gifts will be saved here on this browser."}</p>{items.length ? <button className={buttonSecondary} onClick={() => { setFilter("all"); setQuery(""); }}>Show all rewards</button> : <Link href="/claim" className={button}>Open an invitation<Icon name="arrow" /></Link>}</div>}
    {state === "ready" && visible.length > 0 && <div className="workspace-list">{visible.map(item => {
      const content = <><div className="flex min-w-0 items-center gap-4"><Icon name={item.kind === "mission" ? "list" : "gift"} className="shrink-0 text-accent" /><div><p className="font-medium">{item.title}</p><p className="workspace-note mt-1">{item.detail}</p></div></div><div className="flex shrink-0 items-center gap-3">{item.status && <span className="hidden sm:block"><StatusTag tone={["delivered", "Received"].includes(item.status) ? "success" : "neutral"}>{item.status}</StatusTag></span>}<Icon name="arrow" width={18} className="text-muted" /></div></>;
      return item.kind === "order" ? <button key={item.id} className="workspace-list-row w-full text-left" onClick={() => setSelected(item.id)}>{content}</button> : <Link className="workspace-list-row" key={item.id} href={item.kind === "mission" ? `/claim/${item.id}` : `/gift/${item.id}`}>{content}</Link>;
    })}</div>}
    <p className="workspace-note flex gap-3 border-t border-line pt-5"><Icon name="lock" className="shrink-0" />Saved on this device. Clearing site data removes your links, claim access and decryption keys.</p>
  </section>;
}
