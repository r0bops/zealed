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
