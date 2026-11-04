// A best-effort input guard, not a guarantee that arbitrary prose contains no secrets.
export function looksSensitive(text: string): boolean {
  return /(?:\+?\d[\d\s().-]{7,}\d)|(?:zealed-key-v1-|sk-ant-|sk-proj-|LPA:1\$)|(?:\b[A-Z0-9]{4,}(?:-[A-Z0-9]{4,}){2,}\b)/.test(text)
    || /(?:my|the|this)\s+(?:phone(?: number)?|seed(?: phrase)?|private key|gift\s*card code|redemption code|activation code|password|api key)\s*(?:is|:|=)/i.test(text);
}

export function validateChatMessages(value: unknown): unknown[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 60) throw new Error("Invalid chat");
  const scan = (v: unknown, depth = 0): void => {
    if (depth > 12) throw new Error("Invalid chat");
    if (typeof v === "string" && looksSensitive(v)) throw new Error("Sensitive chat");
    if (Array.isArray(v)) v.forEach((x) => scan(x, depth + 1));
    else if (v && typeof v === "object") {
      for (const [key, entry] of Object.entries(v)) {
        // SDK signatures and signed proposals are opaque credentials, not prose.
        // They are never persisted by the event logger.
        if (["id", "toolCallId", "signature", "proposalToken"].includes(key)) {
          if (typeof entry !== "string" || entry.length > 4096 || !/^[A-Za-z0-9_./+=:-]+$/.test(entry)) throw new Error("Invalid chat");
        } else scan(entry, depth + 1);
      }
    }
  };
  for (const message of value) {
    if (!message || typeof message !== "object" || !["user", "assistant"].includes(message.role)
      || typeof message.id !== "string" || !Array.isArray(message.parts) || message.parts.length > 50) throw new Error("Invalid chat");
    for (const part of message.parts) {
      if (!part || typeof part !== "object" || typeof part.type !== "string") throw new Error("Invalid chat");
      if (message.role === "user" && (part.type !== "text" || typeof part.text !== "string" || part.text.length > 4000)) throw new Error("Invalid chat");
      if (message.role === "assistant" && !["text", "reasoning", "step-start", "tool-search_catalog", "tool-quote", "tool-propose_order", "tool-get_order_status"].includes(part.type)) throw new Error("Invalid chat");
    }
    scan(message);
  }
  return value;
}

/** Retain only fixed enums, booleans and bounded numbers; never prose or tool arguments. */
export function eventMetadata(payload: unknown): Record<string, boolean | number | string> {
  if (!payload || typeof payload !== "object") return {};
  const source = payload as Record<string, unknown>;
  const out: Record<string, boolean | number | string> = {};
  for (const key of ["proposed", "approved", "blocked", "found", "delivered", "phoneWiped", "simulatedCatalog"]) {
    if (typeof source[key] === "boolean") out[key] = source[key];
  }
  for (const key of ["count", "priceCents", "amountZat"]) {
    if (Number.isSafeInteger(source[key]) && (source[key] as number) >= 0) out[key] = source[key] as number;
  }
  for (const key of ["status", "verdict", "guardrail"]) {
    if (["ALLOW", "REQUIRE_HUMAN", "BLOCK", "awaiting_payment", "payment_seen", "paid", "fulfilling", "delivered", "failed", "failed_uncertain", "expired"].includes(source[key] as string)) out[key] = source[key] as string;
  }
  return out;
}
