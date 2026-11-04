import Link from "next/link";
import { limitsFromEnv } from "@/lib/guardrails";
import { formatUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

const POINTS = [
  {
    title: "Sealed for your device",
    body: "Your browser encrypts phone numbers. A fulfillment service briefly handles Bitrefill codes and seals them to your browser’s key. Chat is not a secure place for secrets.",
  },
  {
    title: "Shielded ZEC authorises",
    body: "A shielded Zcash testnet payment authorises each purchase. Zealed then pays Bitrefill from its credit balance, within fixed caps.",
  },
  {
    title: "Separate checkout for secrets",
    body: "It searches, prices and proposes. A separate function fulfils, seals the result to your key and wipes phone numbers.",
  },
];

export default function Home() {
  const limits = limitsFromEnv();

  return (
    <main className="mx-auto grid w-full max-w-3xl flex-1 gap-10 px-4 py-8 sm:px-6 lg:py-14">
      <section className="flex flex-col gap-8">
        <header className="flex items-center gap-2">
          <span aria-hidden className="grid size-8 place-items-center rounded-full bg-accent text-sm font-bold text-black">
            Z
          </span>
          <span className="text-lg font-semibold tracking-tight">Zealed</span>
        </header>

        <div className="flex flex-col gap-4">
          <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight text-balance sm:text-5xl">
            Gift cards, eSIMs and top-ups. Your codes stay sealed.
          </h1>
          <p className="max-w-prose text-lg text-muted text-pretty">
            Ask the agent for what you need. It finds it in the Bitrefill catalog for India, checks the spending caps and
            hands you a checkout only you can open.
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {POINTS.map((p) => (
            <li key={p.title} className="flex gap-3">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-sealed" />
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-sm text-muted">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <dl className="grid grid-cols-3 gap-3 rounded-xl border border-line bg-surface p-4 text-sm">
          <div>
            <dt className="text-muted">Automatic up to</dt>
            <dd className="font-mono font-medium tabular-nums">{formatUsd(limits.autoLimitCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Your approval up to</dt>
            <dd className="font-mono font-medium tabular-nums">{formatUsd(limits.approvalLimitCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Daily cap</dt>
            <dd className="font-mono font-medium tabular-nums">{formatUsd(limits.dailyLimitCents)}</dd>
          </div>
        </dl>
      </section>

      <nav aria-label="Shopping" className="flex flex-wrap items-center gap-3">
        <Link href="/chat" className="inline-flex min-h-11 items-center rounded-xl bg-foreground px-5 py-3 font-medium text-background focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">Start shopping</Link>
        <Link href="/chat?view=orders" className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 py-3 font-medium focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">My orders</Link>
      </nav>
    </main>
  );
}
