"use client";

import Link from "next/link";
import { PaymentPanel } from "./order-details";
import { useEffect, useState } from "react";
import { orderAccessToken, rememberedOrderIds } from "@/lib/keystore";
import { ErrorNote, LoadingLine, button, buttonSecondary } from "./reward-ui";

type Row = { id: string; status?: string; name?: string };

function pillFor(status?: string): { label: string; className: string } | null {
  if (!status) return null;
  if (status === "delivered") return { label: "Delivered ✓", className: "bg-sealed/15 text-sealed" };
  if (status === "paid" || status === "fulfilling" || status === "payment_seen") return { label: "Approved", className: "bg-accent/15 text-accent" };
  if (status === "failed" || status === "failed_uncertain") return { label: "Needs attention", className: "bg-danger/15 text-danger" };
  return { label: "Pending", className: "bg-muted/15 text-muted" };
}

export function OrderHistory({ active }: { active: boolean }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [orders, setOrders] = useState<Row[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    rememberedOrderIds().then(async (ids) => {
      const rows = await Promise.all(ids.map(async (id): Promise<Row> => {
        try {
          const res = await fetch(`/api/orders/${id}`, { cache: "no-store", headers: { authorization: `Bearer ${await orderAccessToken(id) ?? ""}` } });
          if (!res.ok) return { id };
          const data = await res.json() as { order?: { status?: string; productName?: string } };
          return { id, status: data.order?.status, name: data.order?.productName };
        } catch {
          return { id };
        }
      }));
      if (mounted) { setOrders(rows); setState("ready"); }
    }).catch(() => { if (mounted) setState("error"); });
    return () => { mounted = false; };
  }, [attempt, active]);

  if (selected) return <section aria-label="Reward details" className="space-y-4">
    <button type="button" onClick={() => setSelected(null)} className={buttonSecondary}>All rewards</button>
    <PaymentPanel key={selected} orderId={selected} />
  </section>;
  return (
    <section aria-label="My rewards" className="flex flex-col gap-5">
      <p className="text-base text-muted">Rewards saved on this browser. Clearing site data removes them from this list.</p>
      {state === "loading" && <LoadingLine>Looking for rewards on this browser…</LoadingLine>}
      {state === "error" && <ErrorNote message="We couldn’t read this browser’s saved rewards." onRetry={() => { setState("loading"); setAttempt(n => n + 1); }} />}
      {state === "ready" && !orders.length && <div className="flex flex-col items-start gap-4 rounded-xl border border-line p-6">
        <p className="text-base">No rewards saved in this browser yet.</p>
        <Link href="/claim" className={button}>Claim reward</Link>
      </div>}
      {state === "ready" && orders.length > 0 && <ul className="flex flex-col gap-3">
        {orders.map((order) => {
          const pill = pillFor(order.status);
          return <li key={order.id}><button type="button" onClick={() => setSelected(order.id)} className="flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4 text-left focus-visible:outline-2 focus-visible:outline-accent">
            <span className="text-base font-medium">{order.name ?? "Reward"}</span>
            {pill && <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-medium ${pill.className}`}>{pill.label}</span>}
          </button></li>;
        })}
      </ul>}
    </section>
  );
}
