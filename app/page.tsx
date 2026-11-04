import Link from "next/link";
import { limitsFromEnv } from "@/lib/guardrails";
import { formatUsd } from "@/lib/money";
import { InvitationEntry, RewardPreview } from "./landing-preview";
import { RoleCards } from "./role-switch";

export const dynamic = "force-dynamic";

const STEPS = [
  { number: "01", who: "The sponsor", title: "Give it a purpose.", body: "Pick eligible perks, set the budget, and share a private invitation. Each campaign has one claim and a 24-hour expiry." },
  { number: "02", who: "The player + agent", title: "Complete. Then choose.", body: "Finish a short learning mission. Tell the agent what you need; it selects a suitable option from the sponsor’s allowed products." },
  { number: "03", who: "The sponsor → player", title: "Approve. Seal. Deliver.", body: "The sponsor reviews the exact order and authorises it with a shielded testnet payment. The player opens the delivered reward locally." },
];

export default function Home() {
  const limits = limitsFromEnv();
  const maxReward = Math.min(2000, limits.approvalLimitCents, limits.dailyLimitCents);
  return <div className="landing-shell">
    <a href="#main" className="sr-only z-50 rounded bg-foreground p-3 text-background focus:not-sr-only focus:absolute">Skip to content</a>
    <header className="landing-container flex min-h-24 items-center justify-between gap-4 border-b border-line">
      <Link href="/" aria-label="Zealed home" className="landing-focus flex items-center gap-2.5 rounded text-xl font-semibold tracking-tight"><span aria-hidden className="zealed-mark">z</span>zealed<span className="text-accent">.</span></Link>
      <nav aria-label="Main navigation" className="flex items-center gap-2 text-sm sm:gap-6">
        <a href="#how-it-works" className="landing-focus hidden min-h-11 items-center rounded text-muted hover:text-foreground sm:inline-flex">How it works</a>
        <Link href="/chat?view=orders" className="landing-focus inline-flex min-h-11 items-center rounded px-2 text-muted hover:text-foreground">My rewards</Link>
        <Link href="/campaigns" className="landing-focus inline-flex min-h-11 items-center rounded-lg border border-line px-3 font-medium sm:px-4">For sponsors <span className="ml-2" aria-hidden>↗</span></Link>
      </nav>
    </header>

    <main id="main">
      <section className="landing-container grid items-center gap-12 py-14 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-24" aria-labelledby="hero-title">
        <div>
          <p className="mb-7 flex items-center gap-2.5 text-xs font-medium tracking-widest uppercase"><span className="size-2 rounded-full bg-accent" aria-hidden />Private rewards. Shared purpose.</p>
          <h1 id="hero-title" className="landing-title">Small missions.<br />Useful rewards.<br /><span className="text-muted">Yours to unlock.</span></h1>
          <p className="mt-7 max-w-md text-lg leading-relaxed text-muted">Turn a moment of participation into something useful. An agent finds the perk. A sponsor approves it. The reward arrives sealed for you.</p>
          <div className="mt-9"><RoleCards /></div>
          <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-xs text-muted"><span className="font-medium text-foreground">Testnet prototype</span><span>Shielded authorization with Zcash</span><span>Fulfillment by Bitrefill</span></div>
        </div>
        <RewardPreview />
      </section>

      <section id="how-it-works" className="landing-container scroll-mt-8 border-t border-line py-14 lg:py-20" aria-labelledby="how-title">
        <div className="mb-10 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="landing-eyebrow">From invitation to delivery</p><h2 id="how-title" className="landing-heading mt-3">A clear path to your perk.</h2></div><p className="max-w-xs text-sm leading-relaxed text-muted">One bounded invitation. Approval before spending. Delivery to the player’s browser.</p></div>
        <ol className="grid gap-8 md:grid-cols-3 md:gap-10">{STEPS.map(step => <li key={step.number} className="border-t border-line pt-5"><div className="mb-7 flex items-center justify-between"><span className="font-mono text-sm text-muted">{step.number}</span><span className="text-xs text-muted">{step.who}</span></div><h3 className="text-xl font-semibold tracking-tight">{step.title}</h3><p className="mt-3 text-sm leading-7 text-muted">{step.body}</p></li>)}</ol>
      </section>

      <section className="landing-container pb-14 lg:pb-20" aria-labelledby="perks-title">
        <div className="landing-perks grid gap-10 rounded-2xl p-6 sm:p-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
          <div><p className="landing-eyebrow">Something you can use</p><h2 id="perks-title" className="landing-heading mt-3">Less collecting.<br />More connecting.</h2><p className="mt-5 max-w-sm text-sm leading-7 text-muted">Mobile data for the next stop. A voucher for an everyday need. The sponsor defines the options; the agent helps find a fit.</p><p className="mt-6 max-w-sm text-xs leading-relaxed text-muted">Availability, destination coverage, device compatibility and issuer account requirements vary. Eligibility is checked per product.</p></div>
          <div className="flex flex-col justify-center">
            <div className="flex gap-5 border-b border-line py-6"><span aria-hidden className="perk-symbol">↗</span><div><h3 className="text-xl font-semibold">A little more connected.</h3><p className="mt-2 text-sm leading-7 text-muted">eSIM data packages selected for your duration and a compatible, unlocked phone.</p></div></div>
            <div className="flex gap-5 py-6"><span aria-hidden className="perk-symbol">✳</span><div><h3 className="text-xl font-semibold">A perk with possibilities.</h3><p className="mt-2 text-sm leading-7 text-muted">Gift cards and vouchers from an organizer-approved list, within a fixed budget.</p></div></div>
          </div>
        </div>
      </section>

      <section className="landing-container grid gap-10 border-t border-line py-14 lg:grid-cols-2 lg:gap-20 lg:py-20" aria-labelledby="privacy-title">
        <div><p className="landing-eyebrow">Boundaries built in</p><h2 id="privacy-title" className="landing-heading mt-3">The sponsor sees progress.<br />You open the reward.</h2><p className="mt-5 max-w-md text-sm leading-7 text-muted">Zealed separates the person authorising a purchase from the person receiving it. Redemption details stay out of the organizer dashboard and the agent’s context.</p><Link className="landing-focus mt-6 inline-flex min-h-11 items-center gap-3 rounded text-sm font-medium underline underline-offset-4" href="/campaigns">Set up your first invitation <span aria-hidden>↗</span></Link></div>
        <dl className="flex flex-col divide-y divide-line">
          <div className="grid grid-cols-[1fr_auto] gap-3 py-5"><dt className="text-sm text-muted">Claims per invitation</dt><dd className="font-mono text-sm">One</dd></div>
          <div className="grid grid-cols-[1fr_auto] gap-3 py-5"><dt className="text-sm text-muted">Maximum campaign reward</dt><dd className="font-mono text-sm">{formatUsd(maxReward)}</dd></div>
          <div className="grid grid-cols-[1fr_auto] gap-3 py-5"><dt className="text-sm text-muted">Before every purchase</dt><dd className="text-sm font-medium">Sponsor approval</dd></div>
          <div className="grid grid-cols-[1fr_auto] gap-3 py-5"><dt className="text-sm text-muted">Delivery key</dt><dd className="text-sm font-medium">Player’s browser</dd></div>
        </dl>
      </section>

      <section id="claim" className="landing-container scroll-mt-8 pb-14 lg:pb-20" aria-labelledby="claim-title">
        <div className="rounded-2xl border border-line bg-surface p-6 sm:p-10"><div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="landing-eyebrow">Your next step</p><h2 id="claim-title" className="landing-heading mt-3">Got an invitation?</h2></div><p className="max-w-xs text-sm leading-relaxed text-muted">Your sponsor covers the purchase. Bring the link and the browser you’ll keep your reward in.</p></div><InvitationEntry /></div>
      </section>

      <section className="landing-container grid gap-8 border-t border-line py-14 lg:grid-cols-[0.65fr_1.35fr] lg:gap-20" aria-labelledby="questions-title">
        <div><p className="landing-eyebrow">Before you claim</p><h2 id="questions-title" className="landing-heading mt-3">A few things<br />worth knowing.</h2></div>
        <div className="divide-y divide-line">
          {[
            ["Do I need a wallet or a Zealed account?", "Players need an invitation and a browser. The sponsor approves the order and uses their testnet Zcash wallet to authorise it. An issuer may still require its own account to redeem a particular perk."],
            ["Who can read the reward?", "The delivered copy is encrypted to the player’s browser key. The agent, database and organizer view do not receive the readable code. Bitrefill and Zealed’s fulfillment service briefly handle it before encryption; the service operator remains a trusted party."],
            ["What if I close the page?", "Your claim credentials and decryption key are saved in this browser. You can return to your invitation and reopen orders here. Clearing browser storage can lose access; moving a claim to another device is not supported yet."],
            ["Is this real money or a testnet demo?", "Shielded testnet TAZ authorises purchases; it does not pay Bitrefill. Purchases use separate event credits. The app labels simulated and test-product modes. A paid campaign demo is still pending; test-product rewards are not redeemable."],
          ].map(([question, answer]) => <details key={question} className="group py-5"><summary className="landing-focus cursor-pointer rounded py-1 pr-2 text-sm font-medium">{question}</summary><p className="mt-3 max-w-prose text-sm leading-7 text-muted">{answer}</p></details>)}
        </div>
      </section>
    </main>

    <footer className="landing-container flex flex-col justify-between gap-4 border-t border-line py-7 text-xs text-muted sm:flex-row"><p><span className="font-semibold text-foreground">Zealed.</span> A small mission. A useful reward.</p><nav aria-label="Footer" className="flex flex-wrap gap-5"><Link className="landing-focus inline-flex min-h-11 items-center rounded" href="/campaigns">Organizer workspace</Link><Link className="landing-focus inline-flex min-h-11 items-center rounded" href="/chat">Shopping chat</Link><a className="landing-focus inline-flex min-h-11 items-center rounded" href="https://github.com/r0bops/zealed" target="_blank" rel="noreferrer">Source ↗</a></nav></footer>
  </div>;
}
