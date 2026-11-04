"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { rememberedOrderIds } from "@/lib/keystore";

export default function OrdersPage() {
  const [orders, setOrders] = useState<string[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    rememberedOrderIds().then((ids) => {
      if (active) { setOrders(ids); setState("ready"); }
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, [attempt]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <nav aria-label="Main navigation" className="flex items-center justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold focus-visible:outline-2 focus-visible:outline-accent">Zealed</Link>
        <Link href="/chat" className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 focus-visible:outline-2 focus-visible:outline-accent">Shopping chat</Link>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">My orders</h1>
        <p className="text-sm text-muted">Purchases remembered on this browser. Clearing a conversation leaves these links and your decryption keys intact. Clearing browser storage removes them; keep your order link and key backup.</p>
      </header>
      {state === "loading" && <p role="status">Loading orders from this browser…</p>}
      {state === "error" && <div role="alert" className="space-y-3 rounded-xl border border-line p-5">
        <p>We couldn’t read this browser’s saved orders. Enable browser storage or use your saved order link.</p>
        <button type="button" onClick={() => { setState("loading"); setAttempt((n) => n + 1); }} className="min-h-11 rounded-lg border border-line px-4 focus-visible:outline-2 focus-visible:outline-accent">Try again</button>
      </div>}
      {state === "ready" && !orders.length && <div className="space-y-3 rounded-xl border border-line p-6">
        <p>No orders saved in this browser yet.</p>
        <Link href="/chat" className="inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 text-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">Start shopping</Link>
      </div>}
      {state === "ready" && orders.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
        {orders.map((id) => <li key={id}><Link href={`/order/${encodeURIComponent(id)}`} className="flex min-h-16 flex-wrap items-center justify-between gap-2 p-4 focus-visible:outline-2 focus-visible:outline-accent">
          <span className="font-mono text-sm">Order {id.slice(0, 8)}</span><span className="text-sm">Open order →</span>
        </Link></li>)}
      </ul>}
    </main>
  );
}
