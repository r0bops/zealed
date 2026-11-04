"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";
import { importKey, loadKey, orderAccessToken } from "@/lib/keystore";
import { decodeContent, type SealedContent } from "@/lib/payload";
import { fingerprint, open } from "@/lib/sodium";
import { NoirPayButton } from "./noir-pay";
import { Chest, Details, ErrorNote, LoadingLine, button, buttonSecondary, field, formatUsd } from "./reward-ui";

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

const zec = (zat: number) => (zat / 1e8).toFixed(8).replace(/0+$/, "").replace(/\.$/, "");

function friendlyStatus(status: string, sponsored?: boolean): string {
  switch (status) {
    case "awaiting_payment":
    case "awaiting_seller":
      return sponsored
        ? "Waiting for the sponsor to approve. Your reward will appear here."
        : "Waiting for this reward to be approved with Zcash.";
    case "payment_seen":
    case "paid":
      return "Approved privately with Zcash.";
    case "fulfilling":
      return "Approved privately with Zcash. Preparing your reward.";
    case "delivered":
      return "Your reward is ready.";
    case "expired":
      return "This request expired. Ask the sponsor for a new one.";
    case "failed":
    case "failed_uncertain":
      return "We couldn’t finish this reward. Ask the sponsor to take a look.";
    default:
      return "Checking your reward.";
  }
}

function howToUse(content: SealedContent): [string, string] {
  if (content.kind === "giftcard") return ["Open the store’s website or app.", "Paste this code where it asks for a gift card."];
  if (content.kind === "esim") return ["On your phone, open Settings and add an eSIM.", "Scan the QR code, or paste the activation code."];
  return ["Your reward is ready in this browser.", "Come back to this page if you need it again."];
}

export function PaymentPanel({ orderId, compact = false, budgetCents, onStatus }: { orderId: string; compact?: boolean; budgetCents?: number; onStatus?: (status: string) => void }) {
  const [data, setData] = useState<OrderResponse | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [fp, setFp] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [simBusy, setSimBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
    void load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId, attempt]);

  useEffect(() => {
    if (status) onStatus?.(status);
  }, [status, onStatus]);

  useEffect(() => {
    if (!data) return;
    QRCode.toDataURL(data.zip321, { margin: 1, width: 240 }).then(setQr).catch(() => setQr(null));
    fingerprint(data.order.buyerPubKey).then(setFp).catch(() => setFp(null));
    // Regenerate only when the payment URI or buyer key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.zip321, data?.order.buyerPubKey]);

  async function simulate() {
    setSimBusy(true);
    await fetch(`/api/dev/simulate-payment/${orderId}`, { method: "POST" });
    setSimBusy(false);
  }

  if (error) return <ErrorNote message={error} onRetry={() => { setError(null); setAttempt(n => n + 1); }} />;
  if (!data) return <LoadingLine>Getting your reward ready…</LoadingLine>;
  const o = data.order;
  const waiting = o.status === "awaiting_payment" || o.status === "awaiting_seller" || o.status === "payment_seen";
  const problem = o.status === "failed" || o.status === "failed_uncertain" || o.status === "expired";

  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-line bg-surface p-4 sm:p-6">
      <div>
        <p className="text-lg font-semibold">{o.productName}</p>
        {o.packageValue && <p className="text-base text-muted">{o.packageValue}</p>}
        <p className="text-base">
          {formatUsd(o.priceUsdCents)}
          {typeof budgetCents === "number" ? ` of ${formatUsd(budgetCents)} budget` : ""}
        </p>
      </div>

      {o.status !== "delivered" && (
        <>
          {waiting && <Chest open={false} />}
          <p role={problem ? "alert" : "status"} className={`text-base ${problem ? "text-danger" : ""}`}>{friendlyStatus(o.status, data.sponsored)}</p>
        </>
      )}

      {o.status === "awaiting_payment" && !data.sponsored && (
        <div className="flex flex-col gap-3">
          <NoirPayButton to={o.payAddr} amountZec={zec(o.amountZat)} memo={data.memo} simulatedDetection={data.simulatedPayment} />
          <p className="text-sm text-muted">Or scan this with your Zcash wallet.</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* eslint-disable-next-line @next/next/no-img-element -- local data: URL */}
            {qr && <img src={qr} alt="Zcash approval QR code" className="size-32 shrink-0 rounded-lg bg-white p-1" />}
            <a href={data.zip321} className={buttonSecondary}>Open in your wallet</a>
          </div>
        </div>
      )}

      {data.simulatedPayment && o.status === "awaiting_payment" && (
        <button type="button" onClick={simulate} disabled={simBusy} className={buttonSecondary}>
          {simBusy ? "Working…" : "Simulate approval (demo only)"}
        </button>
      )}

      {o.status === "delivered" && <Delivered order={o} />}

      <Details>
        <p>Reward reference {o.id}</p>
        {o.txid && <a className="underline" href={`https://zexplorer.app/testnet/tx/${o.txid}`} target="_blank" rel="noreferrer">Transaction {o.txid}</a>}
        {o.minedHeight != null && <p>Recorded at block {o.minedHeight}</p>}
        {o.bitrefillOrderId && <p>Invoice {o.bitrefillOrderId}</p>}
        <p className="break-all">Note: {data.memo}</p>
        {fp && <p className="font-mono text-xs">Browser key {fp}</p>}
        {data.simulatedPayment && <p>Approval detection on this demo is simulated.</p>}
        {o.failure && <p>{o.failure}</p>}
        {!compact && <Link href="/claim" className="underline">Claim a reward</Link>}
        <a href={`/order/${o.id}`} target="_blank" rel="noreferrer" className="underline">Open this reward on its own page</a>
      </Details>
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
    if (c.kind === "esim") setEsimQr(await QRCode.toDataURL(c.lpa, { margin: 1, width: 280 }));
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
        if (c.kind === "esim") setEsimQr(await QRCode.toDataURL(c.lpa, { margin: 1, width: 280 }));
      } catch {
        if (!cancelled) setMissingKey(true);
      }
    })();
    return () => { cancelled = true; };
  }, [order.sealedPayload, order.buyerPubKey]);

  if (order.type === "topup")
    return (
      <div className="flex flex-col gap-3">
        <Chest open />
        <p className="text-base text-sealed">Delivered. The phone number was used once and {order.phoneWiped ? "has been deleted" : "is being deleted"}.</p>
      </div>
    );

  if (missingKey)
    return (
      <form
        className="flex flex-col gap-3 text-base"
        onSubmit={async (e) => {
          e.preventDefault();
          await importKey(backupRef.current?.value ?? "").catch(() => null);
          setMissingKey(false);
          decrypt().catch(() => setMissingKey(true));
        }}
      >
        <p>This browser doesn’t have the key for this reward. Paste your backup to open it.</p>
        <input ref={backupRef} className={field + " font-mono text-sm"} placeholder="Paste your backup" aria-label="Backup" />
        <button className={button}>Open reward</button>
      </form>
    );

  if (!content) return <LoadingLine>Opening your reward in this browser…</LoadingLine>;

  const code = content.kind === "giftcard" ? content.code : content.kind === "esim" ? content.lpa : undefined;
  const pin = content.kind === "giftcard" ? content.pin : undefined;
  const link = content.kind === "giftcard" ? content.link : undefined;
  const [line1, line2] = howToUse(content);
  const masked = code ? "•".repeat(Math.min(code.length, 16)) : "";

  async function copyCode() {
    if (!code) return;
    setRevealed(true);
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Chest open />
      <p className="text-base font-medium text-sealed">Your reward is ready.</p>
      {content.kind === "esim" && revealed && esimQr && (
        // eslint-disable-next-line @next/next/no-img-element -- local data: URL
        <img src={esimQr} alt="eSIM activation QR code" className="size-44 rounded-lg bg-white p-1" />
      )}
      {code && (
        <p className="break-all text-center font-mono text-2xl tracking-wide text-foreground sm:text-3xl">{revealed ? code : masked}</p>
      )}
      {pin && (
        <p className="text-center text-base text-muted">PIN <span className="font-mono text-foreground">{revealed ? pin : "•".repeat(Math.min(pin.length, 16))}</span></p>
      )}
      <p className="text-base">{line1}</p>
      <p className="text-base text-muted">{line2}</p>
      {"instructions" in content && content.instructions && <p className="text-sm text-muted">{content.instructions}</p>}
      {code && <button type="button" className={button} onClick={() => void copyCode()}>{copied ? "Copied" : "Copy code"}</button>}
      {code && <button type="button" className={buttonSecondary} onClick={() => setRevealed(r => !r)}>{revealed ? "Hide code" : "Show code"}</button>}
      {pin && revealed && <button type="button" className={buttonSecondary} onClick={() => void navigator.clipboard.writeText(pin)}>Copy PIN</button>}
      {link && revealed && <a href={link} target="_blank" rel="noreferrer" className={code ? buttonSecondary : button}>Open the redemption page</a>}
      {!code && !link && <p className="text-base">Nothing else to copy. Follow the two lines above.</p>}
    </div>
  );
}
