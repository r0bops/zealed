"use client";
// Recipient side of a one-time gift link. This browser creates the key, registers only its public half,
// takes the sealed blob once (the server deletes it in the same step) and decrypts it locally.
import { useEffect, useState } from "react";
import { createOrderKey, loadKey } from "@/lib/keystore";
import { fingerprint } from "@/lib/sodium";
import { isWebLink, openGiftEnvelope, type GiftEnvelope } from "@/lib/gift-envelope";
import { QR, button, buttonSecondary, panel, request } from "../../reward-ui";
import { giftStatusRequest, isOwnGift, loadReceived, saveReceived, type ReceivedGift } from "../gift-store";

type Phase = "loading" | "invalid" | "gone" | "taken" | "own" | "intro" | "waiting" | "opening" | "ready";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

async function decryptReceived(gift: ReceivedGift): Promise<GiftEnvelope> {
  const kp = await loadKey(gift.publicKey);
  if (!kp || !gift.sealed) throw new Error("This browser no longer holds the key for this gift.");
  return openGiftEnvelope(gift.sealed, kp);
}

/** One-time read. The ciphertext is saved in this browser first, because the server copy is gone after this call. */
async function takeGift(giftId: string, mine: ReceivedGift): Promise<ReceivedGift | null> {
  const res = await fetch(`/api/gifts/${giftId}/open`, { method: "POST", cache: "no-store", headers: { authorization: `Bearer ${mine.recipientToken}` } });
  if (res.status === 404) return null;
  const data = await res.json();
  if (!res.ok || typeof data.sealed !== "string") throw new Error(data.error ?? "Could not open the gift. Retrying.");
  const stored = { ...mine, sealed: data.sealed as string };
  await saveReceived(giftId, stored);
  return stored;
}

const hideFragment = () => window.history.replaceState(null, "", window.location.pathname);

export function GiftOpen({ giftId }: { giftId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [linkToken, setLinkToken] = useState("");
  const [mine, setMine] = useState<ReceivedGift | null>(null);
  const [keyCode, setKeyCode] = useState("");
  const [gift, setGift] = useState<GiftEnvelope | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Resume a gift this browser already accepted; otherwise check the link before offering to accept it.
  useEffect(() => {
    let live = true;
    (async () => {
      const stored = await loadReceived(giftId);
      if (stored) {
        const code = await fingerprint(stored.publicKey);
        if (!live) return;
        hideFragment();
        setKeyCode(code);
        setMine(stored);
        setPhase(stored.sealed ? "opening" : "waiting");
        return;
      }
      const token = window.location.hash.slice(1);
      if (!TOKEN_RE.test(token)) return void (live && setPhase("invalid"));
      const status = await giftStatusRequest(giftId, token);
      const own = await isOwnGift(giftId);
      if (!live) return;
      setLinkToken(token);
      setPhase(!status ? "gone" : status.state !== "waiting" ? "taken" : own ? "own" : "intro");
    })().catch((e) => { if (live) setError(message(e, "Could not check the gift link. Reload to try again.")); });
    return () => { live = false; };
  }, [giftId]);

  // Wait for the sender to seal, then take the blob exactly once.
  useEffect(() => {
    if (phase !== "waiting" || !mine) return;
    let live = true, taking = false;
    const tick = async () => {
      if (taking) return;
      try {
        const status = await giftStatusRequest(giftId, mine.recipientToken);
        if (!live) return;
        if (!status) return setPhase("gone");
        if (status.state !== "sealed") return;
        taking = true;
        const stored = await takeGift(giftId, mine);
        if (!live) return;
        if (!stored) return setPhase("gone");
        setMine(stored);
        setPhase("opening");
      } catch (e) {
        taking = false;
        if (live) setError(message(e, "Could not reach Zealed. Retrying."));
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), 4000);
    return () => { live = false; clearInterval(timer); };
  }, [phase, mine, giftId]);

  // Decrypt locally from the copy saved in this browser.
  useEffect(() => {
    if (phase !== "opening" || !mine?.sealed) return;
    let live = true;
    decryptReceived(mine).then(
      (g) => { if (live) { setGift(g); setError(""); setPhase("ready"); } },
      (e) => { if (live) setError(message(e, "Could not decrypt the gift in this browser.")); },
    );
    return () => { live = false; };
  }, [phase, mine]);

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const kp = await createOrderKey();
      const { recipientToken } = await request<{ recipientToken: string }>(`/api/gifts/${giftId}/accept`, linkToken, { publicKey: kp.publicKey });
      const stored = { publicKey: kp.publicKey, recipientToken };
      await saveReceived(giftId, stored);
      hideFragment(); // the link token is spent; keep it off screen
      setKeyCode(await fingerprint(kp.publicKey));
      setMine(stored);
      setPhase("waiting");
    } catch (e) {
      setError(message(e, "Could not accept the gift. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={panel} aria-live="polite">
      {phase === "loading" && !error && <p className="text-sm text-muted">Checking the gift link…</p>}
      {phase === "invalid" && <p className="text-sm">This link is incomplete. Ask the sender to copy the whole link, including the part after #.</p>}
      {phase === "gone" && <p className="text-sm">This gift link was already opened, has expired or was cancelled. Zealed keeps no copy.</p>}
      {phase === "taken" && (
        <p className="text-sm">Someone already opened this link in another browser. If that wasn&apos;t you, ask the sender to cancel it and send a new one.</p>
      )}

      {phase === "own" && (
        <>
          <p className="text-sm">You made this gift link. Send it to your friend instead: whoever opens it first becomes the only person who can read the gift.</p>
          <button className={buttonSecondary + " w-fit"} onClick={() => setPhase("intro")}>Open it here anyway (testing)</button>
        </>
      )}

      {phase === "intro" && (
        <>
          <h2 className="text-xl font-semibold">Someone sent you a sealed gift</h2>
          <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-muted">
            <li>This browser creates a private key. Only its public half goes to Zealed.</li>
            <li>You read a short key code to the sender, and they seal the gift to your key.</li>
            <li>It opens here once. Zealed deletes its copy in the same step.</li>
          </ol>
          <button className={button + " w-fit"} disabled={busy} onClick={() => void accept()}>{busy ? "Creating your key…" : "Accept the gift"}</button>
        </>
      )}

      {phase === "waiting" && (
        <>
          <h2 className="text-xl font-semibold">Read this code to the sender</h2>
          <p className="font-mono text-2xl tracking-wider">{keyCode || "…"}</p>
          <p className="text-sm text-muted">
            Tell them by call, voice note or in person. Once it matches on their screen, they seal the gift to your key and this page opens it on its own.
          </p>
        </>
      )}

      {phase === "opening" && !error && <p className="text-sm text-muted">Decrypting in your browser…</p>}

      {phase === "ready" && gift && <GiftContentView gift={gift} keyCode={keyCode} revealed={revealed} onToggle={() => setRevealed((r) => !r)} />}

      {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}
    </section>
  );
}

function GiftContentView({ gift, keyCode, revealed, onToggle }: { gift: GiftEnvelope; keyCode: string; revealed: boolean; onToggle: () => void }) {
  const c = gift.content;
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">{gift.label || "Your gift"}</h2>
      <p className="text-sm text-sealed">Decrypted in this browser with key {keyCode}. Zealed deleted its copy when you opened it.</p>
      <div className="flex flex-col gap-2 rounded-lg border border-sealed/40 p-3 text-sm">
        {c.code && <Secret label="Code" value={c.code} revealed={revealed} />}
        {c.pin && <Secret label="PIN" value={c.pin} revealed={revealed} />}
        {c.lpa && (
          <>
            {revealed ? <QR value={c.lpa} label="eSIM activation QR code" size={180} /> : <p className="text-muted">eSIM QR code hidden</p>}
            <Secret label="Activation" value={c.lpa} revealed={revealed} />
          </>
        )}
        {c.link && revealed && (isWebLink(c.link)
          ? <a href={c.link} target="_blank" rel="noopener noreferrer" className="underline">Redemption link</a>
          : <Secret label="Link" value={c.link} revealed />)}
        {c.instructions && (revealed
          ? <p className="whitespace-pre-wrap break-words">{c.instructions}</p>
          : <p className="text-muted">Instructions hidden</p>)}
      </div>
      <button type="button" className={buttonSecondary + " w-fit"} onClick={onToggle}>{revealed ? "Hide" : "Reveal"}</button>
      <p className="text-xs text-muted">The gift and its key stay in this browser only. Clearing site data removes them.</p>
    </div>
  );
}

function Secret({ label, value, revealed }: { label: string; value: string; revealed: boolean }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className="text-muted">{label}</span>
      <span className="font-mono break-all">{revealed ? value : "•".repeat(Math.min(value.length, 16))}</span>
      {revealed && (
        <button type="button" className="text-xs text-muted underline" onClick={() => void navigator.clipboard.writeText(value).catch(() => undefined)}>copy</button>
      )}
    </p>
  );
}
