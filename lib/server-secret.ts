import { createHash } from "node:crypto";

/** Server-only secret. Derived from the fulfillment key when no explicit secret is configured. */
export function serverSecret(purpose: string): string {
  const base = process.env.TOOL_APPROVAL_SECRET || process.env.FULFILL_SECRET_KEY;
  if (!base) throw new Error("set TOOL_APPROVAL_SECRET or FULFILL_SECRET_KEY");
  return createHash("sha256").update(`zealed:${purpose}:${base}`).digest("base64url");
}

