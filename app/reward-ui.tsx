"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { Role } from "./role-switch";
import { Icon, type IconName } from "./ui-icon";
import "./workspace.css";
export const field = "workspace-field";
export const button = "workspace-button workspace-button-primary";
export const buttonSecondary = "workspace-button workspace-button-secondary";
export const panel = "workspace-panel";
export function StatusTag({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "attention" | "error" }) {
  return <span className="workspace-status" data-tone={tone}>{children}</span>;
}
export function Notice({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "error" }) {
  return <div className="workspace-callout" data-tone={tone} role={tone === "error" ? "alert" : undefined}><Icon name={tone === "success" ? "check" : "shield"} /><div className="min-w-0">{children}</div></div>;
}
export function CopyButton({ value, label = "Copy link" }: { value: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  useEffect(() => { if (state === "idle") return; const timer = setTimeout(() => setState("idle"), 2500); return () => clearTimeout(timer); }, [state]);
  return <button type="button" className={buttonSecondary} onClick={() => void navigator.clipboard.writeText(value).then(() => setState("copied")).catch(() => setState("failed"))}><Icon name={state === "copied" ? "check" : "copy"} /><span aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Could not copy. Try again" : label}</span></button>;
}
export function RewardLayout({ title, role, description, action, children }: { title: string; role?: Role; description?: string; action?: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const links: { href: string; label: string; icon: IconName; active: boolean }[] = [
    { href: "/campaigns", label: "Organize", icon: "grid", active: role === "fund" },
    { href: "/claim", label: "Claim a reward", icon: "qr", active: role === "claim" },
    { href: "/orders", label: "My rewards", icon: "gift", active: path.startsWith("/order") || path.startsWith("/gift") },
  ];
  return <div className="workspace-shell">
    <a href="#workspace" className="sr-only z-50 rounded bg-accent p-3 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <nav aria-label="Main navigation" className="workspace-nav"><div className="workspace-nav-inner"><Link className="workspace-brand" href="/">
      {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset */}
      <img src="/logo.svg" width={112} height={24} alt="Zealed home" />
    </Link><div className="workspace-links">{links.map(l => <Link key={l.href} href={l.href} aria-current={l.active ? "page" : undefined}><Icon name={l.icon} />{l.label}</Link>)}</div><span className="workspace-network">Testnet</span></div></nav>
    <main id="workspace" className="workspace-main">
      <header className="workspace-heading"><div><h1>{title}</h1>{description && <p className="workspace-description">{description}</p>}</div>{action}</header>
      {children}
      <footer className="workspace-footer"><span>Zealed · Rewards worth completing.</span><details><summary><Icon name="shield" /> Privacy & testnet information</summary><p>Testnet TAZ has no monetary value. Bitrefill purchases are funded separately; Bitrefill and our fulfillment service handle redemption details before sealing. Custom instructions are encrypted in the organizer’s browser.</p></details></footer>
    </main>
  </div>;
}
export function QR({ value, label, size = 220 }: { value: string; label: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => { let live = true; QRCode.toDataURL(value, { width: size * 2, margin: 4, errorCorrectionLevel: value.length > 400 ? "L" : "M" }).then(s => { if (live) setSrc(s); }).catch(() => { if (live) setSrc(""); }); return () => { live = false; }; }, [value, size]);
  // eslint-disable-next-line @next/next/no-img-element -- generated locally; never sent to an image service
  return src ? <img src={src} alt={label} width={size} height={size} className="h-auto max-w-full rounded-lg bg-white" /> : <p className="text-sm text-muted">QR unavailable. Use the link below.</p>;
}
/** Full-screen QR for handing an invitation to someone in person (phone held up, or a laptop turned around). */
export function QRPresenter({ value, label, title, hint, onClose }: { value: string; label: string; title: string; hint: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = dialog.current; el?.showModal();
    return () => { el?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={dialog} className="workspace-dialog" aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }}><div className="workspace-dialog-content">
    <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
    <QR value={value} label={label} size={360} />
    <p className="text-sm text-muted">{hint}</p>
    <button autoFocus className={button} onClick={onClose}>Done</button>
  </div></dialog>;
}

export async function request<T>(url: string, token: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed. Try again.");
  return data as T;
}
