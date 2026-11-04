"use client";

import { PaymentPanel } from "./checkout";
import { useEffect, useState } from "react";
import { rememberedOrderIds } from "@/lib/keystore";

export function OrderHistory({ active, onShop }: { active: boolean; onShop: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [orders, setOrders] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    rememberedOrderIds().then((ids) => {
      if (mounted) { setOrders(ids); setState("ready"); }
    }).catch(() => { if (mounted) setState("error"); });
    return () => { mounted = false; };
  }, [attempt, active]);

  if (selected) return <section aria-label="Order details" className="space-y-4">
    <button type="button" onClick={() => setSelected(null)} className="min-h-11 rounded-lg border border-line px-4 focus-visible:outline-2 focus-visible:outline-accent">← All orders</button>
    <PaymentPanel key={selected} orderId={selected} />
  </section>;
  return (
    <section aria-label="My orders" className="flex flex-col gap-5">
      <header className="space-y-2">
        <h2 className="text-xl font-semibold">My orders</h2>
        <p className="text-sm text-muted">Purchases remembered on this browser. Clearing a conversation leaves these links and your decryption keys intact. Clearing browser storage removes them; keep your order link and key backup.</p>
      </header>
      {state === "loading" && <p role="status">Loading orders from this browser…</p>}
      {state === "error" && <div role="alert" className="space-y-3 rounded-xl border border-line p-5">
        <p>We couldn’t read this browser’s saved orders. Enable browser storage or use your saved order link.</p>
        <button type="button" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }} className="min-h-11 rounded-lg border border-line px-4 focus-visible:outline-2 focus-visible:outline-accent">Try again</button>
      </div>}
      {state === "ready" && !orders.length && <div className="space-y-3 rounded-xl border border-line p-6">
        <p>No orders saved in this browser yet.</p>
        <button type="button" onClick={onShop} className="inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Start shopping</button>
      </div>}
      {state === "ready" && orders.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {orders.map((id) => <li key={id}><button type="button" onClick={() => setSelected(id)} className="flex w-full text-left min-h-16 flex-wrap items-center justify-between gap-2 p-4 focus-visible:outline-2 focus-visible:outline-accent">
          <span className="font-mono text-sm">Order {id.slice(0, 8)}</span><span className="text-sm">Open order →</span>
        </button></li>)}
      </ul>}
    </section>
  );
}
