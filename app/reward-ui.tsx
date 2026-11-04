"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { RoleSwitch, type Role } from "./role-switch";
export const field = "min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-accent";
export const button = "min-h-11 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const buttonSecondary = "min-h-11 rounded-lg border border-line px-4 py-2 text-sm font-medium hover:bg-background disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const panel = "flex flex-col gap-4 rounded-xl border border-line bg-surface p-5";
export function RewardLayout({ title, role, children }: { title: string; role?: Role; children: ReactNode }) {
  return <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
    <nav className="flex items-center justify-between"><Link className="py-2 text-lg font-semibold" href="/">Zealed</Link><Link className="py-2 text-sm underline" href="/chat?view=orders">My orders</Link></nav>
    <RoleSwitch active={role} />
    <div className="flex flex-col gap-2">{role && <p className="text-xs font-medium tracking-widest text-muted uppercase">{role === "fund" ? "Sponsor side" : "Player side"}</p>}<h1 className="text-3xl font-semibold tracking-tight">{title}</h1></div>{children}
    <p className="text-xs text-muted">Shielded testnet payments authorise purchases funded separately by event credits. Bitrefill and our fulfillment service briefly handle redemption details before encryption. Issuer eligibility still applies.</p>
  </main>;
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
