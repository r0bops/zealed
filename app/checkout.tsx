"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { createOrderKey, importKey, loadKey, rememberOrder } from "@/lib/keystore";
import { decodeContent, type SealedContent } from "@/lib/payload";
import { fingerprint, open, seal } from "@/lib/sodium";
import { NoirPayButton } from "./noir-pay";

export interface CheckoutProposal {
  proposalToken: string;
  productName: string;
  packageValue: string;
  kind: "giftcard" | "esim" | "topup";
  priceUsd: string;
  authorisationZec: string;
  verdict: "ALLOW" | "REQUIRE_HUMAN" | "BLOCK";
  approved: boolean;
  needsPhone: boolean;
  btcUsd?: { rate: number; source: string } | null;
}

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
}

const STEPS = [
  { key: "awaiting_payment", label: "Waiting for payment" },
  { key: "payment_seen", label: "Seen in mempool" },
  { key: "paid", label: "Confirmed" },
  { key: "fulfilling", label: "Buying from Bitrefill" },
  { key: "delivered", label: "Delivered" },
];
const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");

// ---------------------------------------------------------------- checkout card (in chat)

export function CheckoutCard({ proposal }: { proposal: CheckoutProposal }) {
  const [orderId, setOrderId] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    let e164: string | null = null;
    if (proposal.needsPhone) {
      const digits = phone.replace(/\D/g, "");
      e164 = digits.length === 10 ? `+91${digits}` : digits.length === 12 && digits.startsWith("91") ? `+${digits}` : null;
      if (!e164 || !/^\+91[6-9]\d{9}$/.test(e164)) {
        setError("Enter a 10-digit Indian mobile number.");
        return;
      }
    }
    setBusy(true);
    try {
      const key = await createOrderKey();
      let sealedPhone: string | undefined;
      if (e164) {
        const { publicKey } = (await (await fetch("/api/fulfill-key")).json()) as { publicKey: string };
        sealedPhone = await seal(e164, publicKey);
        e164 = null;
        setPhone(""); // the plain number leaves component state as soon as it's sealed
      }
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ proposalToken: proposal.proposalToken, buyerPubKey: key.publicKey, sealedPhone }),
      });
      const data = (await res.json()) as OrderResponse & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Couldn't create the order");
      await rememberOrder(data.order.id, key.publicKey);
      setOrderId(data.order.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (orderId) return <PaymentPanel orderId={orderId} compact />;

  return (
    <div className="flex max-w-md flex-col gap-3 rounded-xl border border-accent/50 bg-accent-soft/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Checkout</p>
          <p className="font-semibold">{proposal.productName}</p>
          <p className="text-sm text-muted">{proposal.packageValue}</p>
        </div>
        <span className="shrink-0 rounded-full border border-sealed/40 px-2 py-0.5 text-xs font-medium text-sealed">
          {proposal.approved ? "Approved by you" : "Within auto limit"}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Price</dt>
          <dd className="font-mono tabular-nums">{proposal.priceUsd}</dd>
        </div>
        <div>
          <dt className="text-muted">Authorise with</dt>
          <dd className="font-mono tabular-nums">≈{proposal.authorisationZec} TAZ</dd>
        </div>
      </dl>
      {proposal.needsPhone && (
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Mobile number (encrypted in your browser)</span>
          <span className="flex items-center gap-2">
            <span className="rounded-lg border border-line bg-background px-2.5 py-2 font-mono text-muted">+91</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
              inputMode="numeric"
              autoComplete="off"
              placeholder="98765 43210"
              className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-2 font-mono outline-none focus-visible:border-accent"
            />
          </span>
          <span className="text-xs text-muted">Sealed to the fulfilment key. Used once for the top-up, then wiped.</span>
        </label>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity disabled:opacity-50"
      >
        {busy ? "Creating your key and payment request…" : "Create payment request"}
      </button>
      <p className="text-xs text-muted">
        A one-time key is created in this browser. Only it can open what you buy.
        {proposal.btcUsd && ` Priced at BTC/USD ${proposal.btcUsd.rate.toLocaleString("en-US")} (${proposal.btcUsd.source}).`}
      </p>
    </div>
  );
}

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
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        const d = (await res.json()) as OrderResponse & { error?: string };
        if (!res.ok) throw new Error(d.error ?? "order not found");
        if (!stop) setData(d);
        if (!stop && !["delivered", "failed", "failed_uncertain", "expired"].includes(d.order.status)) timer = setTimeout(load, 2500);
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
        {!compact && <Link href="/" className="text-sm text-muted underline">New chat</Link>}
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

      {status === "awaiting_payment" && (
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
