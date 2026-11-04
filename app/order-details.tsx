"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { importKey, loadKey, orderAccessToken } from "@/lib/keystore";
import { decodeContent, type SealedContent } from "@/lib/payload";
import { fingerprint, open } from "@/lib/sodium";
import { button, buttonSecondary, field, Notice, StatusTag, CopyButton } from "./reward-ui";
import { Icon } from "./ui-icon";
import { GiftButton } from "./gift/gift-button";
import { NoirPayButton } from "./noir-pay";

interface PublicOrder {
  id: string;
  type: "giftcard" | "esim" | "topup";
  productName: string;
  packageValue: string | null;
  buyerPubKey: string;
  priceUsdCents: number;
  amountZat: number;
  payAddr: string;
  memoTag: string;
  status: string;
  txid: string | null;
  minedHeight: number | null;
  phoneWiped: boolean | null;
  bitrefillOrderId: string | null;
  failure: string | null;
  expiresAt: number;
  sealedPayload: string | null;
}
interface OrderResponse {
  order: PublicOrder;
  zip321: string;
  memo: string;
  simulatedPayment: boolean;
  sponsored?: boolean;
}

// Plain words for each stage. Transaction and invoice ids live under "Details".
const STEPS = [
  { key: "awaiting_payment", label: "Waiting for approval" },
  { key: "payment_seen", label: "Approval on its way" },
  { key: "paid", label: "Approved privately with Zcash" },
  { key: "fulfilling", label: "Getting your reward" },
  { key: "delivered", label: "Delivered" },
];
const STATUS_TEXT: Record<string, string> = {
  payment_seen: "Approval on its way", paid: "Approved", fulfilling: "Getting your reward", delivered: "Delivered",
  expired: "Expired", failed: "Needs attention", failed_uncertain: "Needs attention",
};
export const statusText = (status: string, sponsored?: boolean) => status === "awaiting_payment" ? (sponsored ? "Waiting for your sponsor" : "Waiting for your payment") : STATUS_TEXT[status] ?? status.replaceAll("_", " ");
const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
/** Two short lines on how to use a delivered reward. */
function howToUse(content: SealedContent): [string, string] {
  if (content.kind === "giftcard") return ["Open the store’s website or app.", "Paste this code where it asks for a gift card."];
  if (content.kind === "esim") return ["On your phone, open Settings and add an eSIM.", "Scan the QR code, or paste the activation code."];
  return ["Your reward is ready in this browser.", "Come back to this page if you need it again."];
}

// ---------------------------------------------------------------- payment + delivery panel

export function PaymentPanel({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const [data, setData] = useState<OrderResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [simBusy, setSimBusy] = useState(false);
  const status = data?.order.status;

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store", headers: { authorization: `Bearer ${await orderAccessToken(orderId) ?? ""}` } });
        const d = (await res.json()) as OrderResponse & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "order not found");
        if (!stop) { setData(d); setError(null); }
        if (!stop && !["delivered", "failed", "expired"].includes(d.order.status)) timer = setTimeout(load, 2500);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId, reload]);

  useEffect(() => {
    if (!data) return;
    QRCode.toDataURL(data.zip321, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null));
    fingerprint(data.order.buyerPubKey).then(setFp).catch(() => setFp(null));
  }, [data?.zip321, data?.order.buyerPubKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function simulate() {
    setSimBusy(true);
    await fetch(`/api/dev/simulate-payment/${orderId}`, { method: "POST" });
    setSimBusy(false);
  }

  if (error) return <Notice tone="error"><p>{error}</p><button type="button" className={buttonSecondary + " mt-3"} onClick={() => { setError(null); setReload(n => n + 1); }}>Retry order</button></Notice>;
  if (!data) return <p className="workspace-note py-8" role="status">Opening your reward details…</p>;
  const o = data.order;
  const stepIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className={compact ? "workspace-stack" : "workspace-panel mx-auto w-full max-w-3xl"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold">{o.productName}</p>
          <p className="text-sm text-muted">
            {o.packageValue} · ${(o.priceUsdCents / 100).toFixed(2)}
          </p>
        </div>
        {!compact && <Link href="/claim" className="workspace-inline-link">Claim a reward</Link>}
        {compact && (
          <a href={`/order/${o.id}`} target="_blank" rel="noreferrer" className="workspace-inline-link">
            Order page
          </a>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusTag tone={status === "delivered" ? "success" : status === "failed" || status === "failed_uncertain" || status === "expired" ? "error" : "attention"}>{statusText(o.status, data.sponsored)}</StatusTag>
        {data.simulatedPayment && <StatusTag tone="attention">Simulated approval</StatusTag>}
      </div>
      <ol className="flex flex-col gap-3 border-y border-line py-5 text-sm" aria-label="Reward progress">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-2 ${i <= stepIndex ? "text-foreground" : "text-muted"}`}>
            <span
              aria-hidden
              className={`size-2 rounded-full ${i < stepIndex || status === "delivered" ? "bg-sealed" : i === stepIndex ? "animate-pulse bg-accent" : "bg-line"}`}
            />
            {s.key === "awaiting_payment" && !data.sponsored ? "Waiting for your payment" : s.label}
          </li>
        ))}
      </ol>

      {(status === "failed" || status === "failed_uncertain" || status === "expired") && (
        <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          {status === "expired" ? "This payment request expired. Ask your organizer to prepare a new payment request." : o.failure ?? "Fulfilment failed."}
        </p>
      )}

      {status === "awaiting_payment" && data.sponsored && <p className="text-sm text-muted">Your sponsor is authorising this reward. You do not need to pay.</p>}
      {status === "awaiting_payment" && !data.sponsored && (
        <div className="flex flex-col gap-3">
          <NoirPayButton to={o.payAddr} amountZec={zec(o.amountZat)} memo={data.memo} simulatedDetection={data.simulatedPayment} />
          <p className="text-xs text-muted">Or pay from any testnet wallet:</p>
          <div className="flex flex-wrap gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL */}
            {qr && <img src={qr} alt="Zcash payment QR code" className="size-32 shrink-0 rounded-lg bg-white p-1" />}
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <p>
                Send <span className="font-mono font-medium">{zec(o.amountZat)} TAZ</span> (shielded) with the memo. Scan with a testnet Zcash wallet.
              </p>
              <p className="truncate font-mono text-xs text-muted" title={data.memo}>
                memo: {data.memo}
              </p>
              <a href={data.zip321} className="text-sm underline">
                Open in wallet
              </a>
              <CopyButton value={data.zip321} label="Copy payment link" />
            </div>
          </div>
          {data.simulatedPayment && (
            <button
              type="button"
              onClick={simulate}
              disabled={simBusy}
              className="rounded-lg border border-dashed border-accent px-3 py-2 text-sm font-medium text-accent disabled:opacity-50"
            >
              SIMULATED payment (dev only)
            </button>
          )}
        </div>
      )}

      {status === "delivered" && <Delivered order={o} />}
      {status === "delivered" && o.type !== "topup" && o.sealedPayload && <details className="border-t border-line pt-3"><summary className="min-h-11 cursor-pointer py-2 text-sm text-muted">Pass this reward to a friend</summary><GiftButton sealedPayload={o.sealedPayload} buyerPublicKey={o.buyerPubKey} label={o.productName} /></details>}

      <details className="border-t border-line pt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-2 text-muted">Details</summary>
        <div className="flex flex-col gap-2 break-all pb-2 text-xs text-muted">
          <p>Reward reference <span className="font-mono">{o.id}</span></p>
          {o.txid && <a className="workspace-inline-link" href={`https://testnet.zcashexplorer.app/transactions/${o.txid}`} target="_blank" rel="noreferrer">Zcash transaction {o.txid}</a>}
          {o.minedHeight != null && <p>Recorded at block {o.minedHeight}</p>}
          {o.bitrefillOrderId && <p>Bitrefill order {o.bitrefillOrderId}</p>}
          <p>Your browser key <span className="font-mono">{fp ?? "…"}</span>. The server stores this reward only in encrypted form.</p>
          {data.simulatedPayment && <p>Approval detection on this server is simulated.</p>}
        </div>
      </details>
    </div>
  );
}

function Delivered({ order }: { order: PublicOrder }) {
  const [content, setContent] = useState<SealedContent | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [esimQr, setEsimQr] = useState<string | null>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  async function decrypt() {
    if (!order.sealedPayload) return;
    const kp = await loadKey(order.buyerPubKey);
    if (!kp) return setMissingKey(true);
    const c = decodeContent(await open(order.sealedPayload, kp.publicKey, kp.secretKey));
    setContent(c);
    if (c.kind === "esim") setEsimQr(await QRCode.toDataURL(c.lpa, { margin: 1, width: 220 }));
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!order.sealedPayload) return;
        const kp = await loadKey(order.buyerPubKey);
        if (cancelled) return;
        if (!kp) return setMissingKey(true);
        const c = decodeContent(await open(order.sealedPayload, kp.publicKey, kp.secretKey));
        if (cancelled) return;
        setContent(c);
        if (c.kind === "esim") setEsimQr(await QRCode.toDataURL(c.lpa, { margin: 1, width: 220 }));
      } catch {
        if (!cancelled) setMissingKey(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.sealedPayload, order.buyerPubKey]);

  if (order.type === "topup")
    return (
      <p className="rounded-lg border border-sealed/40 px-3 py-2 text-sm text-sealed">
        Delivered. Your number was used once and {order.phoneWiped ? "has been deleted" : "is being deleted"}. Zealed keeps only the Bitrefill order ID.
      </p>
    );

  if (missingKey)
    return (
      <form
        className="flex flex-col gap-2 text-sm"
        onSubmit={async (e) => {
          e.preventDefault();
          await importKey(backupRef.current?.value ?? "").catch(() => null);
          setMissingKey(false);
          decrypt().catch(() => setMissingKey(true));
        }}
      >
        <p>This browser doesn&apos;t hold the key for this order. Paste your key backup to open it.</p>
        <label className="flex flex-col gap-2">Private key backup<input ref={backupRef} type="password" autoComplete="off" className={field} placeholder="zealed-key-v1-…" /></label>
        <button className={button}>Restore key & open reward</button>
      </form>
    );

  if (!content) return <p className="text-sm text-muted" role="status">Opening your reward in this browser…</p>;

  const code = content.kind === "giftcard" ? content.code : content.kind === "esim" ? content.lpa : undefined;
  const pin = content.kind === "giftcard" ? content.pin : undefined;
  const link = content.kind === "giftcard" ? content.link : undefined;
  const [line1, line2] = howToUse(content);
  const dots = (v: string) => "•".repeat(Math.min(v.length, 16));
  // Copies without putting the code on screen; the code stays masked until "Show code" (demos are recorded).
  async function copyCode() {
    if (!code) return;
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setRevealed(true); }
  }

  return (
    <div className="workspace-secret flex flex-col gap-4">
      <p className="flex items-center gap-2 font-medium text-sealed"><Icon name="shield" width={16} />Your reward is ready · opened in this browser</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL */}
      {content.kind === "esim" && revealed && esimQr && <img src={esimQr} alt="eSIM activation QR code" className="size-44 self-center rounded-lg bg-white p-1" />}
      {code && <p className="break-all text-center font-mono text-2xl tracking-wide text-foreground sm:text-3xl" aria-live="polite">{revealed ? code : dots(code)}</p>}
      {pin && <p className="text-center text-base text-muted">PIN <span className="font-mono text-foreground">{revealed ? pin : dots(pin)}</span></p>}
      <div className="space-y-1"><p className="text-base">{line1}</p><p className="text-sm text-muted">{line2}</p></div>
      {"instructions" in content && content.instructions && <p className="text-xs text-muted">{content.instructions}</p>}
      {code && <button type="button" className={button} onClick={() => void copyCode()}>{copied ? "Copied" : content.kind === "esim" ? "Copy activation code" : "Copy code"}</button>}
      {(code || pin || link) && <button type="button" onClick={() => setRevealed((r) => !r)} className={buttonSecondary}>{revealed ? "Hide" : code ? "Show code" : "Show redemption details"}</button>}
      {pin && revealed && <CopyButton value={pin} label="Copy PIN" />}
      {link && revealed && <a href={link} target="_blank" rel="noreferrer" className={code ? "workspace-inline-link" : button}>Open the redemption page<Icon name="arrow" width={16} /></a>}
    </div>
  );
}
