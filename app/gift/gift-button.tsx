"use client";
// Giver side of a one-time gift link. The reward is decrypted with the giver's own key and re-sealed to the
// friend's key in this browser, only after the giver has compared the friend's key code out of band.
import { useEffect, useRef, useState } from "react";
import { loadKey } from "@/lib/keystore";
import { fingerprint, open } from "@/lib/sodium";
import { giftableContent, resealForFriend } from "@/lib/gift-envelope";
import { button, buttonSecondary, request } from "../reward-ui";
import { forgetSent, giftLink, giftStatusRequest, loadSent, saveSent, telegramShareUrl, type SentGift } from "./gift-store";

type Status = NonNullable<Awaited<ReturnType<typeof giftStatusRequest>>>;
type Ended = "" | "opened" | "expired" | "cancelled" | "gone";

export function GiftButton({ sealedPayload, buyerPublicKey, label }: { sealedPayload: string; buyerPublicKey: string; label?: string }) {
  const [sent, setSent] = useState<SentGift | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [friendKey, setFriendKey] = useState("");
  const [ended, setEnded] = useState<Ended>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const lastState = useRef<Status["state"] | "">(""); // survives re-renders, so a seal here counts before the next poll

  // Resume a gift this browser already started for this reward.
  useEffect(() => {
    let live = true;
    loadSent(buyerPublicKey).then((s) => { if (live && s) setSent(s); }).catch(() => undefined);
    return () => { live = false; };
  }, [buyerPublicKey]);

  // Follow the gift until it's opened, expires or is cancelled.
  useEffect(() => {
    if (!sent) return;
    let live = true;
    const tick = async () => {
      try {
        const s = await giftStatusRequest(sent.giftId, sent.ownerToken);
        if (!live) return;
        if (!s) {
          await forgetSent(buyerPublicKey, sent.giftId);
          if (!live) return;
          setEnded(Date.now() >= sent.expiresAt ? "expired" : lastState.current === "sealed" ? "opened" : "gone");
          lastState.current = "";
          setSent(null);
          setStatus(null);
          return;
        }
        lastState.current = s.state;
        const code = s.recipientPublicKey ? await fingerprint(s.recipientPublicKey) : "";
        if (live) { setStatus(s); setFriendKey(code); setError(""); }
      } catch {
        if (live) setError("Could not check the gift. Retrying.");
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 4000);
    return () => { live = false; clearInterval(timer); };
  }, [sent, buyerPublicKey]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Try again."); } finally { setBusy(false); }
  }

  const ownKey = async () => {
    const kp = await loadKey(buyerPublicKey);
    if (!kp) throw new Error("This browser doesn't hold the key for this reward, so it can't pass it on.");
    return kp;
  };

  const start = () => run(async () => {
    const kp = await ownKey();
    giftableContent(await open(sealedPayload, kp.publicKey, kp.secretKey)); // fail early if there's nothing to give
    const res = await fetch("/api/gifts", { method: "POST", cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not create the gift link.");
    const gift: SentGift = { giftId: data.giftId, giftToken: data.giftToken, ownerToken: data.ownerToken, expiresAt: data.expiresAt };
    await saveSent(buyerPublicKey, gift);
    setEnded("");
    setSent(gift);
  });

  const sealToFriend = () => run(async () => {
    if (!sent || !status?.recipientPublicKey) return;
    const sealed = await resealForFriend(sealedPayload, await ownKey(), status.recipientPublicKey, label);
    await request(`/api/gifts/${sent.giftId}/seal`, sent.ownerToken, { sealed, recipientPublicKey: status.recipientPublicKey });
    lastState.current = "sealed";
    setStatus({ ...status, state: "sealed" });
  });

  const cancel = () => run(async () => {
    if (!sent) return;
    const res = await fetch(`/api/gifts/${sent.giftId}`, { method: "DELETE", cache: "no-store", headers: { authorization: `Bearer ${sent.ownerToken}` } });
    if (!res.ok && res.status !== 404) throw new Error("Could not cancel the gift. Try again.");
    await forgetSent(buyerPublicKey, sent.giftId);
    setSent(null);
    setStatus(null);
    lastState.current = "";
    setEnded("cancelled");
  });

  const link = sent ? giftLink(sent.giftId, sent.giftToken) : "";
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const state = status?.state ?? "waiting";

  return (
    <section className="workspace-stack py-4" aria-live="polite">
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold">Gift it to a friend</h2>
        <p className="text-sm text-muted">
          Send a one-time link in any chat. Your friend&apos;s browser makes its own key, and you seal the reward to that key here, so Zealed only relays ciphertext. The link opens once.
        </p>
      </div>

      {!sent && (
        <>
          {ended === "opened" && <p className="text-sm text-sealed">Your friend opened the gift. Zealed deleted its copy.</p>}
          {ended === "expired" && <p className="text-sm text-muted">The link expired before it was opened. Zealed deleted it.</p>}
          {ended === "cancelled" && <p className="text-sm text-muted">The gift link was cancelled.</p>}
          {ended === "gone" && <p className="text-sm text-muted">The gift link is no longer on the server: it was opened, expired or cancelled elsewhere.</p>}
          <button className={button + " w-fit"} disabled={busy} onClick={() => void start()}>
            {busy ? "Creating the link…" : ended ? "Make a new gift link" : "Gift it"}
          </button>
        </>
      )}

      {sent && state === "waiting" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">1 · Send this link to your friend</p>
          <p className="truncate rounded-lg border border-line px-3 py-2 font-mono text-xs text-muted" title="The part after # is the secret and never reaches Zealed's page server">
            {`${window.location.host}/gift/${sent.giftId.slice(0, 6)}…#••••••••`}
          </p>
          <div className="flex flex-wrap gap-2">
            <a className={button + " inline-flex items-center"} href={telegramShareUrl(link)} target="_blank" rel="noopener noreferrer">Share on Telegram</a>
            <button className={buttonSecondary} onClick={() => void copy().catch(() => setError("Copy failed. Use Share instead."))}>{copied ? "Copied" : "Copy link"}</button>
            {typeof navigator.share === "function" && (
              <button className={buttonSecondary} onClick={() => void navigator.share({ title: "A sealed gift", url: link }).catch(() => undefined)}>More apps…</button>
            )}
          </div>
          <p className="text-sm text-muted">Waiting for your friend to open it… Whoever opens it first gets a key code, and you&apos;ll compare that code before anything is sealed.</p>
        </div>
      )}

      {sent && state === "accepted" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">2 · Your friend opened the link. Compare their key code</p>
          <p className="font-mono text-2xl tracking-wider">{friendKey || "…"}</p>
          <p className="text-sm text-muted">
            Ask your friend to read out the code on their screen, by call, voice note or in person. Seal only if it matches: a different code means someone else opened the link.
          </p>
          <div className="flex flex-wrap gap-2">
            <button className={button} disabled={busy || !friendKey} onClick={() => void sealToFriend()}>{busy ? "Sealing…" : "It matches, seal the gift"}</button>
            <button className={buttonSecondary} disabled={busy} onClick={() => void cancel()}>It doesn&apos;t match, cancel</button>
          </div>
        </div>
      )}

      {sent && state === "sealed" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">3 · Sealed to <span className="font-mono">{friendKey}</span></p>
          <p className="text-sm text-muted">Your friend&apos;s page opens it on its own. Zealed deletes its copy at that first open.</p>
          <button className={buttonSecondary + " w-fit"} disabled={busy} onClick={() => void cancel()}>Cancel the gift</button>
        </div>
      )}

      {sent && (
        <p className="text-xs text-muted">
          Unopened links are deleted {new Date(sent.expiresAt).toLocaleString()}. A gift link doesn&apos;t revoke your own copy, so don&apos;t redeem the code yourself.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
