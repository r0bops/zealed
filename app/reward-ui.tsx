"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
export const field = "min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent";
export const button = "min-h-11 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const panel = "flex flex-col gap-4 rounded-xl border border-line bg-surface p-5";
export function RewardLayout({ title, children }: { title: string; children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <nav className="flex items-center justify-between"><Link className="py-2 text-lg font-semibold" href="/">Zealed</Link><Link className="py-2 text-sm underline" href="/chat?view=orders">My orders</Link></nav>
    <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>{children}
    <p className="text-xs text-muted">Shielded testnet payments authorise purchases funded separately by event credits. Bitrefill and our fulfillment service briefly handle redemption details before encryption. Issuer eligibility still applies.</p>
  </main>;
}
export function QR({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let live = true; QRCode.toDataURL(value, { width: 220, margin: 2 }).then(s => { if (live) setSrc(s); }).catch(() => { if (live) setSrc(""); }); return () => { live = false; }; }, [value]);
  // eslint-disable-next-line @next/next/no-img-element -- generated locally; never sent to an image service
  return src ? <img src={src} alt={label} width={220} height={220} className="max-w-full rounded-lg" /> : <p className="text-sm text-muted">QR unavailable. Use the link below.</p>;
}
export async function request<T>(url: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed. Try again.");
  return data as T;
}
