import { createAgentUIStreamResponse } from "ai";
import { createZealedAgent } from "@/lib/agent";
import { logAgentEvent } from "@/lib/orders";
import { log, safeError } from "@/lib/log";

export const maxDuration = 60;

// Phone numbers or long digit runs must never reach the model or the agent log.
const LOOKS_SENSITIVE = /(\+?\d[\d\s-]{8,}\d)/;

export async function POST(req: Request) {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "AI_GATEWAY_API_KEY is not set on the server" }, { status: 503 });
  }
  const body = (await req.json()) as { id?: string; messages?: unknown[] };
  const sessionId = typeof body.id === "string" ? body.id.slice(0, 64) : crypto.randomUUID();
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const last = messages.at(-1) as { role?: string; parts?: { type: string; text?: string }[] } | undefined;
  const lastText = last?.role === "user" ? (last.parts ?? []).filter((p) => p.type === "text").map((p) => p.text).join(" ") : "";
  if (LOOKS_SENSITIVE.test(lastText)) {
    return Response.json(
      { error: "That looks like a phone number or code. Don't share it in chat: use the secure field on the checkout card." },
      { status: 400 },
    );
  }
  if (lastText) logAgentEvent(sessionId, "user", null, { text: lastText.slice(0, 500) });

  try {
    return await createAgentUIStreamResponse({
      agent: createZealedAgent(sessionId),
      uiMessages: messages,
    });
  } catch (err) {
    log.error("agent failed", { err: safeError(err) });
    return Response.json({ error: "Agent error" }, { status: 500 });
  }
}
