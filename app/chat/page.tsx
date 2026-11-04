import Link from "next/link";
import { AGENT_MODEL } from "@/lib/agent";
import { isSimulated } from "@/lib/bitrefill";
import { limitsFromEnv } from "@/lib/guardrails";
import { formatUsd } from "@/lib/money";
import { ChatWorkspace } from "../chat-workspace";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shopping chat · Zealed" };

export default async function ChatPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  const limits = limitsFromEnv();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      <nav aria-label="Main navigation" className="flex items-center justify-between gap-4">
        <Link href="/" className="inline-flex min-h-11 items-center font-semibold focus-visible:outline-2 focus-visible:outline-accent">Zealed</Link>
        <span className="text-sm text-muted">Shopping & orders</span>
      </nav>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">What do you need?</h1>
        <p className="text-sm text-muted">Find a gift card, eSIM or phone top-up. Keep phone numbers, codes and keys out of chat.</p>
        <p className="text-sm">Automatic up to {formatUsd(limits.autoLimitCents)} · Your approval up to {formatUsd(limits.approvalLimitCents)} · Daily cap {formatUsd(limits.dailyLimitCents)}</p>
      </header>
      <ChatWorkspace initialView={view === "orders" ? "orders" : "conversation"} model={AGENT_MODEL} simulatedCatalog={isSimulated()} hasModelKey={Boolean(process.env.ANTHROPIC_API_KEY)} />
      <details className="rounded-lg border border-line px-4 py-2 text-sm">
        <summary className="min-h-10 cursor-pointer py-2 font-medium focus-visible:outline-2 focus-visible:outline-accent">Conversation privacy</summary>
        <p className="pb-3 text-muted">This conversation stays in page memory and resets on reload or when you clear it. Messages are sent to our AI provider; clearing here does not erase provider records. Zealed retains limited activity metadata, not chat transcripts. Order records and saved decryption keys are separate. Open Orders above to return to a purchase.</p>
      </details>
    </main>
  );
}
