"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const STAGES = [
  { name: "Mission", number: "01", title: "A little knowledge.\nA useful reward.", description: "Complete a short learning mission from your sponsor.", label: "Your mission", detail: "When should a private reward be released?" },
  { name: "Match", number: "02", title: "A perk that\nfits your plans.", description: "The agent compares allowed packages with your needs and the sponsor’s budget.", label: "Example match", detail: "Mobile data for a week away" },
  { name: "Receive", number: "03", title: "Approved by them.\nOpened by you.", description: "After sponsor approval and confirmed payment, delivery is encrypted for your browser.", label: "Private delivery", detail: "Your activation details stay sealed until you reveal them." },
];

export function RewardPreview() {
  const [step, setStep] = useState(0);
  const stage = STAGES[step];
  return <section className="reward-preview" aria-label="Interactive example of the reward flow">
    <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
      <span className="text-xs font-medium tracking-widest uppercase">Inside an invitation</span>
      <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">Example preview</span>
    </div>
    <div className="px-6 pt-7 sm:px-8">
      <div className="flex items-center gap-2 text-xs text-muted"><span className="size-1.5 rounded-full bg-accent" aria-hidden />Zealed community reward</div>
      <h2 className="mt-4 whitespace-pre-line text-3xl font-semibold leading-tight tracking-tight">{stage.title}</h2>
      <p className="mt-3 min-h-16 max-w-sm text-sm leading-relaxed text-muted">{stage.description}</p>
    </div>
    <div className="reward-ticket mx-6 my-7 sm:mx-8" aria-live="polite">
      <div className="flex items-center justify-between border-b border-dashed border-foreground/20 px-5 py-4">
        <span className="font-mono text-xs uppercase tracking-widest">{stage.label}</span>
        <span className="font-mono text-xs">{stage.number} / 03</span>
      </div>
      <div className="flex min-h-44 flex-col justify-between gap-5 p-5">
        <p className="max-w-64 text-lg font-medium leading-snug">{stage.detail}</p>
        {step === 0 && <div className="flex items-start gap-2 rounded-lg border border-foreground/15 px-3 py-2 text-sm"><span aria-hidden>↳</span>After the exact payment is confirmed.</div>}
        {step === 1 && <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-foreground/20 px-3 py-1.5">eSIM compatible</span><span className="rounded-full border border-foreground/20 px-3 py-1.5">Within sponsor budget</span></div>}
        {step === 2 && <div className="flex items-center justify-between rounded-lg border border-foreground/15 px-3 py-3"><span className="font-mono text-sm tracking-widest" aria-label="Illustrative masked reward">•••• •••• ••••</span><span className="text-xs font-medium">Sealed</span></div>}
      </div>
      <div className="flex items-center justify-between border-t border-dashed border-foreground/20 px-5 py-3 text-xs"><span>One invitation. One recipient.</span><span aria-hidden>↗</span></div>
    </div>
    <div className="grid grid-cols-3 gap-2 px-6 pb-5" aria-label="Explore the example">
      {STAGES.map((item, index) => <button key={item.name} type="button" aria-pressed={index === step} onClick={() => setStep(index)} className={`landing-focus flex min-h-11 items-center justify-center gap-2 rounded-lg border text-sm transition-colors ${index === step ? "border-foreground bg-foreground text-background" : "border-line text-muted hover:text-foreground"}`}><span className="font-mono text-xs opacity-70">{item.number}</span>{item.name}</button>)}
    </div>
    <p className="px-6 pb-5 text-center text-xs text-muted">Illustration only. No purchase or reward is created here.</p>
  </section>;
}

export function InvitationEntry() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  function openInvitation(event: FormEvent) {
    event.preventDefault();
    try {
      const url = new URL(value.trim(), location.origin);
      if (url.origin !== location.origin || !/^\/claim\/[a-f0-9-]{36}\/?$/.test(url.pathname) || !/^#[A-Za-z0-9_-]{43}$/.test(url.hash) || url.search) {
        throw new Error("Use the complete Zealed invitation link from your sponsor, including the part after #.");
      }
      setError("");
      router.push(url.pathname + url.hash);
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith("Use the") ? e.message : "That link could not be opened. Paste the full invitation from your sponsor.");
    }
  }
  return <form onSubmit={openInvitation} className="flex flex-col gap-3">
    <label htmlFor="invitation-link" className="text-sm font-medium">Your invitation link</label>
    <div className="flex flex-col gap-3 sm:flex-row">
      <input id="invitation-link" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false} required value={value} onChange={e => { setValue(e.target.value); setError(""); }} aria-invalid={!!error} aria-describedby={error ? "invitation-error" : "invitation-hint"} placeholder="Paste the complete link from your sponsor" className="landing-focus min-h-12 min-w-0 flex-1 rounded-lg border border-line bg-background px-4 text-sm placeholder:text-muted" />
      <button className="landing-primary landing-focus shrink-0" type="submit">Open invitation <span aria-hidden>↗</span></button>
    </div>
    {error ? <p id="invitation-error" role="alert" className="text-sm text-danger">{error}</p> : <p id="invitation-hint" className="text-xs leading-relaxed text-muted">Or scan your sponsor’s QR code. Keep your invitation private: whoever claims it first reserves the reward.</p>}
  </form>;
}
