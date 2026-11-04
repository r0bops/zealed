"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { importKey, loadKey, orderAccessToken } from "@/lib/keystore";
import { decodeContent, type SealedContent } from "@/lib/payload";
import { fingerprint, open } from "@/lib/sodium";
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

const STEPS = [
  { key: "awaiting_payment", label: "Waiting for payment" },
  { key: "payment_seen", label: "Seen in mempool" },
  { key: "paid", label: "Confirmed" },
  { key: "fulfilling", label: "Buying from Bitrefill" },
  { key: "delivered", label: "Delivered" },
];
const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");

// ---------------------------------------------------------------- payment + delivery panel

export function PaymentPanel({ orderId, compact = false }: { orderId: string; compact?: boolean }) {
  const [data, setData] = useState<OrderResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        if (!stop) setData(d);
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
  }, [orderId]);

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

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading order…</p>;
  const o = data.order;
  const stepIndex = STEPS.findIndex((s) => s.key === status);

  return (
    <div className="flex w-full max-w-md flex-col gap-3 rounded-xl border border-line bg-background p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{o.productName}</p>
          <p className="text-sm text-muted">
            {o.packageValue} · ${(o.priceUsdCents / 100).toFixed(2)}
          </p>
        </div>
        {!compact && <Link href="/claim" className="text-sm text-muted underline">Claim a reward</Link>}
        {compact && (
          <a href={`/order/${o.id}`} target="_blank" className="text-xs text-muted underline">
            Order page
          </a>
        )}
      </div>

      <ol className="flex flex-col gap-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-2 ${i <= stepIndex ? "text-foreground" : "text-muted"}`}>
            <span
              aria-hidden
              className={`size-2 rounded-full ${i < stepIndex || status === "delivered" ? "bg-sealed" : i === stepIndex ? "animate-pulse bg-accent" : "bg-line"}`}
            />
            {s.label}
            {s.key === "payment_seen" && o.txid && i <= stepIndex && <span className="font-mono text-xs text-muted">{o.txid.slice(0, 12)}…</span>}
          </li>
        ))}
      </ol>

      {(status === "failed" || status === "failed_uncertain" || status === "expired") && (
        <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">
          {status === "expired" ? "This payment request expired. Ask the agent for a new one." : o.failure ?? "Fulfilment failed."}
        </p>
      )}

      {status === "awaiting_payment" && data.sponsored && <p className="text-sm text-muted">Your sponsor is authorising this reward. You do not need to pay.</p>}
      {status === "awaiting_payment" && !data.sponsored && (
        <div className="flex flex-col gap-3">
          <NoirPayButton to={o.payAddr} amountZec={zec(o.amountZat)} memo={data.memo} simulatedDetection={data.simulatedPayment} />
          <p className="text-xs text-muted">Or pay from any testnet wallet:</p>
          <div className="flex gap-3">
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
              <button type="button" onClick={() => navigator.clipboard.writeText(data.zip321)} className="w-fit text-xs text-muted underline">
                Copy payment URI
              </button>
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

      <p className="text-xs text-muted">
        Your key {fp ? <span className="font-mono">{fp}</span> : "…"} · the server only ever stores ciphertext for this order.
        {data.simulatedPayment && <span className="ml-1 font-medium text-accent">Payment: SIMULATED</span>}
      </p>
    </div>
  );
}

function Delivered({ order }: { order: PublicOrder }) {
  const [content, setContent] = useState<SealedContent | null>(null);
  const [missingKey, setMissingKey] = useState(false);
  const [revealed, setRevealed] = useState(false);
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
        <input ref={backupRef} className="rounded-lg border border-line bg-background px-3 py-2 font-mono text-xs" placeholder="zealed-key-v1-…" />
        <button className="w-fit rounded-lg bg-foreground px-3 py-1.5 text-background">Open</button>
      </form>
    );

  if (!content) return <p className="text-sm text-muted">Decrypting in your browser…</p>;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-sealed/40 p-3 text-sm">
      <p className="font-medium text-sealed">Decrypted in your browser</p>
      {content.kind === "giftcard" && (
        <>
          {content.code && <Secret label="Code" value={content.code} revealed={revealed} />}
          {content.pin && <Secret label="PIN" value={content.pin} revealed={revealed} />}
          {content.link && revealed && (
            <a href={content.link} target="_blank" rel="noreferrer" className="underline">
              Redemption link
            </a>
          )}
        </>
      )}
      {content.kind === "esim" && (
        <div className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL */}
          {revealed && esimQr ? <img src={esimQr} alt="eSIM activation QR code" className="size-40 rounded-lg bg-white p-1" /> : <p className="text-muted">eSIM QR code hidden</p>}
          <Secret label="Activation" value={content.lpa} revealed={revealed} />
        </div>
      )}
      {"instructions" in content && content.instructions && <p className="text-xs text-muted">{content.instructions}</p>}
      <button type="button" onClick={() => setRevealed((r) => !r)} className="w-fit rounded-lg border border-line px-3 py-1.5">
        {revealed ? "Hide" : "Reveal"}
      </button>
    </div>
  );
}

function Secret({ label, value, revealed }: { label: string; value: string; revealed: boolean }) {
  return (
    <p className="flex items-center gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-mono break-all">{revealed ? value : "•".repeat(Math.min(value.length, 16))}</span>
      {revealed && (
        <button type="button" onClick={() => navigator.clipboard.writeText(value)} className="text-xs text-muted underline">
          copy
        </button>
      )}
    </p>
  );
}
