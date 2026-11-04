import { createAgentUIStreamResponse } from "ai";
import { createZealedAgent } from "@/lib/agent";
import { validateChatMessages } from "@/lib/chat-privacy";
import { log, safeError } from "@/lib/log";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY is not set on the server" }, { status: 503 });
  }
  let sessionId: string;
  let messages: unknown[];
  try {
    const raw = await req.text();
    if (raw.length > 128_000) return Response.json({ error: "Chat is too large" }, { status: 413 });
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object") throw new Error("Invalid chat");
    sessionId = typeof body.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.id) ? body.id : crypto.randomUUID();
    messages = validateChatMessages(body.messages);
  } catch {
    return Response.json({ error: "Invalid chat or sensitive information detected. Keep phone numbers, codes and keys out of chat; use the secure checkout field." }, { status: 400 });
  }

  try {
    return await createAgentUIStreamResponse({
      agent: createZealedAgent(sessionId),
      uiMessages: messages,
      onError: () => "Agent request failed. Please try again.",
    });
  } catch (err) {
    log.error("agent failed", { err: safeError(err) });
    return Response.json({ error: "Agent error" }, { status: 500 });
  }
}
