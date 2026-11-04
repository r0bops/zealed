"use client";
import Link from "next/link";
import { get, keys } from "idb-keyval";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { RewardLayout, field, button, buttonSecondary, panel, request } from "../reward-ui";
import { ClaimStepper } from "../claim-stepper";

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
    <button type="button" className={buttonSecondary} onClick={onClose}>Stop camera</button>
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
  return <RewardLayout title="Claim reward" role="claim">
    <ClaimStepper current={0} />
    <p className="text-muted">Your sponsor shares a private invite as a QR code or a link. You don’t need a wallet or an account. The reward stays in this browser.</p>
    {saved.length > 0 && <section className={panel}>
      <h2 className="text-lg font-semibold">Continue on this browser</h2>
      <ul className="flex flex-col divide-y divide-line">{saved.map(s => <li key={s.id}><Link href={`/claim/${s.id}`} className="flex min-h-12 items-center justify-between gap-3 py-2 text-base hover:underline"><span>{s.title ?? "Invite unavailable or expired"}<span className="block text-sm text-muted">{s.claimed ? "Started" : "Not started yet"}</span></span><span aria-hidden>→</span></Link></li>)}</ul>
    </section>}
    <form className={panel} onSubmit={submit}>
      <h2 className="text-lg font-semibold">Paste your invite link</h2>
      <label className="flex flex-col gap-2 text-base">Invite link<input className={field} type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={link} placeholder="https://…/claim/…#…" aria-invalid={!!error} onChange={e => { setLink(e.target.value); setError(""); }} /></label>
      {error && <p role="alert" className="text-base text-danger">{error}</p>}
      <button className={button}>Open invitation</button>
      <p className="text-sm text-muted">Keep your invite private. The first person to open it gets the reward.</p>
    </form>
    <section className={panel}>
      <h2 className="text-lg font-semibold">Or scan the QR code</h2>
      {canScan === false && <p className="text-base text-muted">Point your phone’s camera at the sponsor’s QR code. It opens your invite directly.</p>}
      {canScan && !scanning && <button type="button" className={buttonSecondary} onClick={() => setScanning(true)}>Scan a QR code</button>}
      {canScan && scanning && <Scanner onFound={open} onClose={() => setScanning(false)} />}
      <p className="text-sm text-muted">Scanning stays on this device. Camera images are never uploaded.</p>
    </section>
  </RewardLayout>;
}
