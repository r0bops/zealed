"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { Role } from "./role-switch";

export const field = "min-h-12 min-w-0 w-full rounded-lg border border-line bg-background px-3 py-2 text-base focus-visible:outline-2 focus-visible:outline-accent";
export const button = "inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-5 py-3 text-center text-base font-semibold text-background hover:brightness-110 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const buttonSecondary = "inline-flex min-h-12 items-center justify-center text-center text-base font-medium text-foreground underline decoration-muted underline-offset-4 hover:text-accent disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2";
export const choiceButton = "min-h-14 w-full rounded-xl border px-4 py-3 text-left text-base";
export const panel = "flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-6";

const TABS = [
  { href: "/campaigns", label: "Create campaign", current: (path: string) => path.startsWith("/campaigns") },
  { href: "/claim", label: "Claim reward", current: (path: string) => path === "/claim" || path.startsWith("/claim/") },
  { href: "/orders", label: "My rewards", current: (path: string) => path === "/orders" || path.startsWith("/order/") },
];

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2).replace(/\.00$/, "")}`;
}

export function humanizeError(message: string): { text: string; detail?: string } {
  const raw = message?.trim() || "Something went wrong.";
  const lower = raw.toLowerCase();
  if (/failed to fetch|networkerror|load failed|aborted|econnrefused/.test(lower)) {
    return { text: "We couldn’t connect. Check your internet and try again.", detail: raw };
  }
  if (/reclaim|zktls|frost|viewing key|ufvk|shielded|txid|ciphertext/.test(lower)) {
    return { text: "That step didn’t finish. Try again.", detail: raw };
  }
  if (lower === "order not found") return { text: "We couldn’t open this reward from this browser.", detail: raw };
  if (lower === "request failed. try again.") return { text: "Something went wrong. Try again." };
  return { text: raw };
}

export function Details({ children }: { children: ReactNode }) {
  return (
    <details className="rounded-lg border border-line px-4 text-sm text-muted">
      <summary className="flex min-h-12 cursor-pointer items-center font-medium text-foreground">Details</summary>
      <div className="flex flex-col gap-2 pb-4 break-all">{children}</div>
    </details>
  );
}

export function LoadingLine({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3">
      <p className="text-base text-muted">{children}</p>
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-line" />
      <div className="h-3 w-1/2 animate-pulse rounded-full bg-line" />
      <div className="h-16 animate-pulse rounded-xl bg-line/60" />
    </div>
  );
}

export function ErrorNote({ message, onRetry, primary = true }: { message: string; onRetry?: () => void; primary?: boolean }) {
  const nice = humanizeError(message);
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger/40 p-4">
      <p className="text-base">{nice.text}</p>
      {onRetry && <button type="button" className={primary ? button : buttonSecondary} onClick={onRetry}>Try again</button>}
      {nice.detail && <Details><p className="font-mono text-xs">{nice.detail}</p></Details>}
    </div>
  );
}

export function Chest({ open }: { open: boolean }) {
  return (
    <div className={open ? "chest-open mx-auto w-24" : "mx-auto w-24"} aria-hidden>
      <svg viewBox="0 0 80 64" className="h-20 w-24">
        <path className="chest-lid" d="M10 30 V24 Q40 6 70 24 V30 Z" fill={open ? "#6FBF8E" : "#C8921A"} />
        <rect x="8" y="28" width="64" height="28" rx="4" fill="#F4B728" />
        <rect x="36" y="36" width="8" height="10" rx="2" fill="#0A0A0A" />
      </svg>
    </div>
  );
}

export function RewardLayout({ title, role, children }: { title: string; role?: Role; children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const kicker = role === "fund" ? "Sponsor" : role === "claim" ? "Your reward" : "This browser";
  return <div className="workspace-shell">
    <a href="#workspace" className="sr-only z-50 rounded bg-accent p-3 text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
    <div className="fixed inset-x-0 top-0 z-40 border-b border-line bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col px-3 sm:flex-row sm:items-center sm:gap-6 sm:px-8">
        <Link className="inline-flex h-12 shrink-0 items-center" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element -- local SVG brand asset */}
          <img src="/logo.svg" width={112} height={24} alt="Zealed home" />
        </Link>
        <nav aria-label="Main" className="grid grid-cols-3 sm:flex sm:h-14 sm:flex-1 sm:items-stretch">
          {TABS.map(tab => {
            const on = tab.current(pathname);
            return <Link key={tab.href} href={tab.href} aria-current={on ? "page" : undefined} className={`relative inline-flex min-h-12 items-center justify-center px-1 text-center text-[13px] leading-tight font-medium sm:flex-1 sm:text-base ${on ? "text-accent" : "text-muted hover:text-foreground"}`}>
              {tab.label}
              {on && <span aria-hidden className="absolute inset-x-1 bottom-0 h-0.5 rounded-full bg-accent sm:inset-x-3" />}
            </Link>;
          })}
        </nav>
      </div>
    </div>
    <main id="workspace" className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pt-36 pb-12 sm:px-8 sm:pt-28">
      <header className="flex flex-col gap-2 border-b border-line pb-6">
        <p className="text-sm text-muted">{kicker}</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      </header>
      {children}
      <footer className="mt-4 border-t border-line pt-6 text-xs text-muted">Test coins have no cash value. A sponsor approves the reward privately with Zcash. The code stays in this browser.</footer>
    </main>
  </div>;
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
