// Signed checkout proposals. The agent's propose_order tool mints one only after the guardrails
// (and, when required, the buyer's approval) have passed; POST /api/orders accepts nothing else.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Verdict } from "./guardrails";

export interface Proposal {
  v: 1;
  sessionId: string;
  productId: string;
  productName: string;
  kind: "giftcard" | "esim" | "topup";
  packageValue: string;
  priceCents: number;
  verdict: Exclude<Verdict, "BLOCK">;
  approved: boolean; // true when the buyer approved a REQUIRE_HUMAN proposal
  exp: number; // ms epoch
}

export const PROPOSAL_TTL_MS = 15 * 60_000;

/** Server-only secret. Derived from the fulfillment key when no explicit secret is configured. */
export function serverSecret(purpose: string): string {
  const base = process.env.TOOL_APPROVAL_SECRET || process.env.FULFILL_SECRET_KEY;
  if (!base) throw new Error("set TOOL_APPROVAL_SECRET or FULFILL_SECRET_KEY");
  return createHash("sha256").update(`zealed:${purpose}:${base}`).digest("base64url");
}

export function signProposal(p: Proposal): string {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  const mac = createHmac("sha256", serverSecret("proposal")).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyProposal(token: unknown): Proposal | null {
  if (typeof token !== "string" || token.length > 4096) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", serverSecret("proposal")).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Proposal;
    if (p.v !== 1 || p.exp < Date.now()) return null;
    return p;
  } catch {
    return null;
  }
}
