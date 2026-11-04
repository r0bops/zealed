"use client";
import Link from "next/link";
import { get, keys } from "idb-keyval";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RewardLayout, field, button, buttonSecondary, panel, request, StatusTag } from "../reward-ui";
import { Icon } from "../ui-icon";

type Saved = { id: string; title: string | null; claimed: boolean };
type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorCtor = new (options: { formats: string[] }) => Detector;
const PREFIX = "zealed:claim:";

/** Accept only a same-origin Zealed invitation (/claim/<uuid>#<token>) and return its in-app path. */
function invitationPath(value: string): string | null {
  try {
    const url = new URL(value.trim(), location.origin);
    if (url.origin !== location.origin || url.search || !/^\/claim\/[a-f0-9-]{36}\/?$/.test(url.pathname) || !/^#[A-Za-z0-9_-]{43}$/.test(url.hash)) return null;
    return url.pathname.replace(/\/$/, "") + url.hash;
  } catch { return null; }
}

function Scanner({ onFound, onClose }: { onFound: (path: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Point the camera at your sponsor’s QR code.");
  useEffect(() => {
    let live = true, timer = 0, stream: MediaStream | undefined;
    (async () => {
      const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
      if (!Ctor) throw new Error("This browser cannot scan QR codes. Use your phone’s camera app, or paste the link.");
      const detector = new Ctor({ formats: ["qr_code"] });
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!live) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      if (!video.current) return;
      video.current.srcObject = s;
      await video.current.play();
      const tick = async () => {
        if (!live || !video.current) return;
        try {
          const codes = await detector.detect(video.current);
          for (const code of codes) {
            const path = invitationPath(code.rawValue);
            if (path) { live = false; onFound(path); return; }
          }
          if (codes.length) setMessage("That QR code is not a Zealed invitation for this site.");
        } catch { /* frame not ready yet */ }
        timer = window.setTimeout(tick, 250);
      };
      void tick();
    })().catch((e: Error) => { if (live) setMessage(e.name === "NotAllowedError" ? "Camera permission was denied. Paste the link instead." : e.message); });
    return () => { live = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, [onFound]);
  return <div className="flex flex-col gap-3">
    <video ref={video} muted playsInline className="aspect-square w-full max-w-sm rounded-lg bg-foreground object-cover" aria-label="Camera preview for QR scanning" />
    <p role="status" className="text-sm text-muted">{message}</p>
    <button className={buttonSecondary} onClick={onClose}>Stop camera</button>
  </div>;
}

export function ClaimEntry() {
  const [link, setLink] = useState(""), [error, setError] = useState("");
  const [canScan, setCanScan] = useState<boolean | null>(null), [scanning, setScanning] = useState(false);
  const [saved, setSaved] = useState<Saved[]>([]);
  useEffect(() => {
    // Feature detection only runs in the browser, after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanScan("BarcodeDetector" in window && !!navigator.mediaDevices?.getUserMedia);
    let live = true;
    (async () => {
      const ids = (await keys()).filter((k): k is string => typeof k === "string" && k.startsWith(PREFIX)).map(k => k.slice(PREFIX.length));
      const found = await Promise.all(ids.slice(0, 10).map(async id => {
        const session = await get<{ invitation: string; claimId?: string }>(PREFIX + id);
        let title: string | null = null;
        try { if (session) title = (await request<{ title: string }>(`/api/campaigns/${id}`, session.invitation)).title; } catch { /* expired or unavailable */ }
        return { id, title, claimed: !!session?.claimId };
      }));
      if (live) setSaved(found);
    })().catch(() => undefined);
    return () => { live = false; };
  }, []);
  const open = useCallback((path: string) => { location.assign(path); }, []);
  function submit(e: FormEvent) {
    e.preventDefault();
    const path = invitationPath(link);
    if (!path) { setError("Use the complete Zealed invitation link from your sponsor, including the part after #."); return; }
    open(path);
  }
  return <RewardLayout title="A reward is waiting for you." role="claim" description="Open your event invitation, complete the missions and choose your prize. No Zealed account needed.">
    <div className="workspace-split">
      <form className={panel} onSubmit={submit}>
        <Icon name="gift" className="text-accent" width={28} height={28} />
        <h2>Open your invitation</h2>
        <p className="workspace-note">Paste the complete link from your organizer, including the part after #.</p>
        <label className="flex flex-col gap-2 text-sm">Invitation link<input className={field} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={link} placeholder="https://…/claim/…#…" aria-invalid={!!error} aria-describedby={error ? "invite-error" : undefined} onChange={e => { setLink(e.target.value); setError(""); }} /></label>
        {error && <p id="invite-error" role="alert" className="text-sm text-danger">{error}</p>}
        <button className={button}>Open invitation<Icon name="arrow" /></button>
        <p className="workspace-note">This link is private. Whoever joins first reserves the invitation.</p>
      </form>
      <aside className="workspace-stack"><section className={panel}><Icon name="qr" className="text-accent" width={28} height={28} /><h2>Have a QR code?</h2><p className="workspace-note">Point your phone’s camera at the organizer’s code to open the invitation directly.</p>{canScan && !scanning && <button className={buttonSecondary} onClick={() => setScanning(true)}>Scan with this camera</button>}{canScan && scanning && <Scanner onFound={open} onClose={() => setScanning(false)} />}<p className="text-xs text-muted">Camera images stay on your device.</p></section><p className="workspace-note flex gap-3"><Icon name="wallet" className="shrink-0" />You only need a wallet if you choose a Zcash testnet prize.</p></aside>
    </div>
    {saved.length > 0 && <section className="workspace-stack"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Continue where you left off</h2><span className="workspace-note">Saved on this browser</span></div><div className="workspace-list">{saved.map(s => <Link key={s.id} href={`/claim/${s.id}`} className="workspace-list-row"><div><p className="font-medium">{s.title ?? "Saved invitation"}</p><p className="workspace-note">{s.title ? "Open your missions and reward" : "Reconnect to check this invitation"}</p></div><div className="flex items-center gap-3"><StatusTag tone={s.claimed ? "attention" : "neutral"}>{s.claimed ? "Joined" : "Not started"}</StatusTag><Icon name="arrow" className="shrink-0 text-muted" /></div></Link>)}</div></section>}
  </RewardLayout>;
}
