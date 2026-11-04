"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { RoleSwitch, type Role } from "./role-switch";
export const field = "min-h-11 min-w-0 w-full rounded-lg border border-line bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-accent";
export const button = "min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background hover:brightness-110 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const buttonSecondary = "min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const panel = "flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-6";
export function RewardLayout({ title, role, children }: { title: string; role?: Role; children: ReactNode }) {
  return <div className="workspace-shell">
    <a href="#workspace" className="sr-only z-50 rounded bg-accent p-3 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <nav aria-label="Main navigation" className="border-b border-line bg-background"><div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-4 px-4 sm:px-8"><Link className="inline-flex min-h-11 items-center" href="/">
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset */}
      <img src="/logo.svg" width={112} height={24} alt="Zealed home" />
    </Link><Link className="inline-flex min-h-11 items-center text-sm text-muted hover:text-foreground" href="/orders">My rewards ↗</Link></div></nav>
    <main id="workspace" className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8 sm:py-12">
    <RoleSwitch active={role} />
    <header className="flex flex-col gap-3 border-b border-line pb-6"><p className="font-mono text-xs tracking-widest text-accent uppercase">{role === "fund" ? "Organizer workspace" : role === "claim" ? "Participant workspace" : "Your private rewards"}</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1></header>{children}
    <footer className="mt-4 border-t border-line pt-6 text-xs text-muted">Testnet TAZ has no monetary value. Bitrefill purchases are funded separately; Bitrefill and our fulfillment service handle redemption details before sealing. Custom instructions are encrypted in the organizer’s browser.</footer>
  </main></div>;
}
export function QR({ value, label, size = 220 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let live = true; QRCode.toDataURL(value, { width: size * 2, margin: 2 }).then(s => { if (live) setSrc(s); }).catch(() => { if (live) setSrc(""); }); return () => { live = false; }; }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element -- generated locally; never sent to an image service
  return src ? <img src={src} alt={label} width={size} height={size} className="h-auto max-w-full rounded-lg bg-white" /> : <p className="text-sm text-muted">QR unavailable. Use the link below.</p>;
}
/** Full-screen QR for handing an invitation to someone in person (phone held up, or a laptop turned around). */
export function QRPresenter({ value, label, title, hint, onClose }: { value: string; label: string; title: string; hint: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-background p-6 text-center">
    <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
    <div className="w-full max-w-[420px]"><QR value={value} label={label} size={420} /></div>
    <p className="max-w-sm text-sm text-muted">{hint}</p>
    <button autoFocus className={button} onClick={onClose}>Done</button>
  </div>;
}
export async function request<T>(url: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed. Try again.");
  return data as T;
}
