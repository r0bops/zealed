import Link from "next/link";

export type Role = "fund" | "claim";

const ROLES = [
  { role: "fund" as const, href: "/campaigns", label: "Fund a reward" },
  { role: "claim" as const, href: "/claim", label: "Claim a reward" },
];

/** Segmented control shown on every reward page so each person always knows which side they are on. */
export function RoleSwitch({ active }: { active?: Role }) {
  return <nav aria-label="Choose your side" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1">
    {ROLES.map(r => <Link key={r.role} href={r.href} aria-current={active === r.role ? "page" : undefined}
      className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-center text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${active === r.role ? "bg-accent text-background" : "text-muted hover:text-foreground"}`}>{r.label}</Link>)}
  </nav>;
}

/** The first choice on the landing page: fund (sponsor) or claim (player). */
export function RoleCards() {
  return <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Choose your side">
    <Link href="/campaigns" className="group flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent hover:border-foreground">
      <span className="text-xs font-medium tracking-widest text-muted uppercase">For sponsors</span>
      <span className="text-xl font-semibold tracking-tight">Fund a reward</span>
      <span className="text-sm leading-relaxed text-muted">Set a budget and allowed perks, share an invitation QR, then authorise the exact purchase with a shielded testnet payment.</span>
      <span className="mt-auto text-xs text-muted">Needs an organizer token and a testnet Zcash wallet.</span>
      <span className="text-sm font-medium">Start funding <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span></span>
    </Link>
    <Link href="/claim" className="group flex flex-col gap-3 rounded-2xl border border-accent bg-accent-soft p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent hover:border-foreground">
      <span className="text-xs font-medium tracking-widest text-muted uppercase">For players</span>
      <span className="text-xl font-semibold tracking-tight">Claim a reward</span>
      <span className="text-sm leading-relaxed text-muted">Scan your sponsor’s QR or paste the link, finish a short mission, and open a reward sealed to this browser.</span>
      <span className="mt-auto text-xs text-muted">Needs only the invitation. No wallet, no account.</span>
      <span className="text-sm font-medium">Claim a reward <span aria-hidden className="inline-block transition-transform group-hover:translate-x-0.5">→</span></span>
    </Link>
  </div>;
}

/** Progress tracker. `current` is the index of the active step; `current >= steps.length` means all done. */
export function Steps({ steps, current, label, failed = false }: { steps: string[]; current: number; label: string; failed?: boolean }) {
  return <ol aria-label={label} className="workspace-steps" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
    {steps.map((step, i) => {
      const state = i < current ? "done" : i === current ? (failed ? "failed" : "current") : "todo";
      return <li key={step} aria-current={state === "current" || state === "failed" ? "step" : undefined} className="flex min-w-0 flex-col gap-2">
        <span aria-hidden className={`workspace-steps-track ${state === "done" ? "bg-sealed" : state === "current" ? "bg-accent" : state === "failed" ? "bg-danger" : "bg-line"}`} />
        <span className={`text-xs leading-snug ${state === "todo" ? "text-muted" : "font-medium"}`}>
          <span className="font-mono text-muted">{String(i + 1).padStart(2, "0")}</span> {step}
          <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (current step)" : state === "failed" ? " (needs attention)" : ""}</span>
        </span>
      </li>;
    })}
  </ol>;
}
