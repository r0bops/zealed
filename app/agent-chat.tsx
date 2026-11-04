"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import type { ZealedAgentUIMessage } from "@/lib/agent";

const SUGGESTIONS = ["Get me a ₹10 Airtel top-up", "I need an eSIM for India", "A ₹50 Flipkart gift card", "How do you keep my code private?"];

// Same check as the server: phone numbers and long digit runs never leave the browser.
const LOOKS_SENSITIVE = /(\+?\d[\d\s-]{8,}\d)/;

type Part = ZealedAgentUIMessage["parts"][number];

export function AgentChat({ model, simulatedCatalog, hasModelKey }: { model: string; simulatedCatalog: boolean; hasModelKey: boolean }) {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const { messages, sendMessage, status, error, stop } = useChat<ZealedAgentUIMessage>({
    id: sessionId,
    transport: new DefaultChatTransport({ api: "/api/agent" }),
  });
  const scroller = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    if (LOOKS_SENSITIVE.test(t)) {
      setWarning("That looks like a phone number or code. It wasn't sent. Use the secure field on the checkout card instead.");
      return;
    }
    setWarning(null);
    sendMessage({ text: t });
    setInput("");
  }

  return (
    <section
      aria-label="Zealed shopping agent"
      className="flex h-[min(78vh,720px)] min-h-[520px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-2 rounded-full bg-sealed" />
          <p className="font-medium">Shopping agent</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs">
          <Badge>{model}</Badge>
          {simulatedCatalog && <Badge tone="warn">Catalog SIMULATED</Badge>}
        </div>
      </div>

      <div ref={scroller} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {!hasModelKey && (
          <Notice tone="danger">
            <code className="font-mono">AI_GATEWAY_API_KEY</code> isn&apos;t set on the server. Add it to <code className="font-mono">.env.local</code> and restart.
          </Notice>
        )}
        {messages.length === 0 && (
          <div className="flex flex-1 flex-col items-start justify-end gap-3">
            <p className="text-sm text-muted">Try one of these:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="rounded-full border border-line px-3 py-1.5 text-sm transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex flex-col gap-2"}>
            {m.role === "user" ? (
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-foreground px-3.5 py-2 text-background whitespace-pre-wrap">
                {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
              </p>
            ) : (
              m.parts.map((p, i) => <AssistantPart key={`${m.id}-${i}`} part={p} />)
            )}
          </div>
        ))}

        {status === "submitted" && <p className="text-sm text-muted">Thinking…</p>}
        {error && <Notice tone="danger">{friendlyError(error)}</Notice>}
      </div>

      <form
        className="flex flex-col gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {warning && <Notice tone="warn">{warning}</Notice>}
        <div className="flex gap-2">
          <label htmlFor="agent-input" className="sr-only">
            Message the agent
          </label>
          <input
            id="agent-input"
            value={input}
            onChange={(e) => setInput(e.currentTarget.value)}
            placeholder="What do you need? (never type phone numbers or codes here)"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3.5 py-2.5 outline-none focus-visible:border-accent"
          />
          {busy ? (
            <button type="button" onClick={() => stop()} className="rounded-xl border border-line px-4 font-medium">
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-xl bg-accent px-4 font-medium text-black transition-opacity disabled:opacity-40"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function friendlyError(error: Error): string {
  const msg = error.message || "";
  try {
    const parsed = JSON.parse(msg) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    /* not JSON */
  }
  return msg.length > 0 && msg.length < 200 ? msg : "Something went wrong. Try again.";
}

function AssistantPart({ part }: { part: Part }) {
  switch (part.type) {
    case "text":
      return part.text ? (
        <p className="max-w-[90%] rounded-2xl rounded-bl-sm bg-background px-3.5 py-2 whitespace-pre-wrap">{part.text}</p>
      ) : null;

    case "tool-search_catalog":
      if (part.state !== "output-available") return <ToolChip pending={part.state !== "output-error"}>Searching the catalog…</ToolChip>;
      return (
        <ToolChip>
          Searched catalog for “{part.input.query}”: {part.output.count} result{part.output.count === 1 ? "" : "s"}
          {part.output.simulatedCatalog ? " (simulated)" : ""}
        </ToolChip>
      );

    case "tool-quote":
      if (part.state !== "output-available") return <ToolChip pending={part.state !== "output-error"}>Pricing and checking caps…</ToolChip>;
      if ("error" in part.output) return <ToolChip>Quote failed: {part.output.error}</ToolChip>;
      return (
        <ToolChip>
          Quoted {part.output.productName} · {part.output.packageValue} · {part.output.priceUsd} · <Verdict v={part.output.verdict} />
        </ToolChip>
      );

    case "tool-propose_order":
      if (part.state !== "output-available") return <ToolChip pending={part.state !== "output-error"}>Preparing checkout…</ToolChip>;
      return <CheckoutCard proposal={part.output} />;

    case "tool-get_order_status":
      if (part.state !== "output-available") return <ToolChip pending>Checking order…</ToolChip>;
      return <ToolChip>{part.output.found ? `Order status: ${part.output.status}` : "Order not found"}</ToolChip>;

    default:
      return null;
  }
}

type Proposal = Extract<Part, { type: "tool-propose_order"; state: "output-available" }>["output"];

function CheckoutCard({ proposal }: { proposal: Proposal }) {
  if (!proposal.proposed) {
    return (
      <Notice tone="danger">
        {"blocked" in proposal && proposal.blocked ? `Blocked by guardrails: ${proposal.reason}` : `Couldn't propose: ${"error" in proposal ? proposal.error : "unknown error"}`}
      </Notice>
    );
  }
  return (
    <div className="flex max-w-md flex-col gap-3 rounded-xl border border-accent/50 bg-accent-soft/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Checkout proposal</p>
          <p className="font-semibold">{proposal.productName}</p>
          <p className="text-sm text-muted">{proposal.packageValue}</p>
        </div>
        <Verdict v={proposal.verdict} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted">Price</dt>
          <dd className="font-mono tabular-nums">{proposal.priceUsd}</dd>
        </div>
        <div>
          <dt className="text-muted">Authorise with</dt>
          <dd className="font-mono tabular-nums">{proposal.authorisationZec} TAZ</dd>
        </div>
      </dl>
      {proposal.needsPhone && (
        <p className="text-sm">The phone number goes in a secure field at checkout. It&apos;s encrypted in your browser and wiped after delivery.</p>
      )}
      <button type="button" disabled className="rounded-lg bg-foreground px-3 py-2 text-sm font-medium text-background opacity-50" title="Checkout is the next build step">
        Continue to checkout (coming next)
      </button>
    </div>
  );
}

function Verdict({ v }: { v: "ALLOW" | "REQUIRE_HUMAN" | "BLOCK" }) {
  const map = {
    ALLOW: ["Within auto limit", "text-sealed border-sealed/40"],
    REQUIRE_HUMAN: ["Needs your approval", "text-accent border-accent/50"],
    BLOCK: ["Blocked", "text-danger border-danger/40"],
  } as const;
  const [label, cls] = map[v];
  return <span className={`inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function ToolChip({ children, pending = false }: { children: React.ReactNode; pending?: boolean }) {
  return (
    <p className="flex w-fit max-w-full items-center gap-2 rounded-lg border border-line px-2.5 py-1 font-mono text-xs text-muted">
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${pending ? "animate-pulse bg-accent" : "bg-sealed"}`} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 font-mono ${tone === "warn" ? "border-accent/50 text-accent" : "border-line text-muted"}`}>
      {children}
    </span>
  );
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "warn" | "danger" }) {
  return (
    <p role={tone === "danger" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${tone === "danger" ? "border-danger/40 text-danger" : "border-accent/50 text-accent"}`}>
      {children}
    </p>
  );
}
