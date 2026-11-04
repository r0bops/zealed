// Pure spend policy for agent-initiated purchases. No I/O: callers pass in today's spend.
export type Verdict = "ALLOW" | "REQUIRE_HUMAN" | "BLOCK";

export interface GuardrailLimits {
  autoLimitCents: number; // at or below: goes through automatically
  approvalLimitCents: number; // above auto, at or below this: buyer must approve
  dailyLimitCents: number; // total agent spend per UTC day, including this order
}

export interface GuardrailInput {
  priceCents: number;
  spentTodayCents: number;
  limits: GuardrailLimits;
}

export interface GuardrailDecision {
  verdict: Verdict;
  reason: string;
  checks: { name: string; ok: boolean; detail: string }[];
}

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): GuardrailLimits {
  const n = (key: string, fallback: number) => {
    const v = Number(env[key]);
    return Number.isSafeInteger(v) && v >= 0 ? v : fallback;
  };
  return {
    autoLimitCents: n("AGENT_AUTO_LIMIT_CENTS", 500),
    approvalLimitCents: n("AGENT_APPROVAL_LIMIT_CENTS", 2000),
    dailyLimitCents: n("AGENT_DAILY_LIMIT_CENTS", 2500),
  };
}

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/**
 * Catalog prices move with the live BTC/USD rate. A purchase may go ahead if the current cost is at most
 * PRICE_DRIFT_TOLERANCE above the price the buyer (or sponsor) approved, and never above `hardCapCents`.
 * Zealed absorbs that small drift; the order keeps its approved price.
 */
export const PRICE_DRIFT_TOLERANCE = 0.05;
export function priceDriftOk(currentCents: number | null, approvedCents: number, hardCapCents: number): boolean {
  if (currentCents == null || !Number.isSafeInteger(currentCents) || currentCents < 1) return false;
  return currentCents <= Math.min(Math.ceil(approvedCents * (1 + PRICE_DRIFT_TOLERANCE)), hardCapCents);
}

export function evaluateGuardrails({ priceCents, spentTodayCents, limits }: GuardrailInput): GuardrailDecision {
  const checks: GuardrailDecision["checks"] = [];
  const validPrice = Number.isSafeInteger(priceCents) && priceCents > 0;
  checks.push({ name: "PRICE_VALID", ok: validPrice, detail: `price ${validPrice ? usd(priceCents) : "invalid"}` });
  if (!validPrice) return { verdict: "BLOCK", reason: "Invalid price", checks };

  const underHardCap = priceCents <= limits.approvalLimitCents;
  checks.push({
    name: "PER_ORDER_CAP",
    ok: underHardCap,
    detail: `${usd(priceCents)} vs hard cap ${usd(limits.approvalLimitCents)}`,
  });

  const projected = spentTodayCents + priceCents;
  const underDaily = projected <= limits.dailyLimitCents;
  checks.push({
    name: "DAILY_CAP",
    ok: underDaily,
    detail: `${usd(projected)} today vs daily cap ${usd(limits.dailyLimitCents)}`,
  });

  if (!underHardCap) return { verdict: "BLOCK", reason: `Over the ${usd(limits.approvalLimitCents)} per-order cap`, checks };
  if (!underDaily) return { verdict: "BLOCK", reason: `Would exceed the ${usd(limits.dailyLimitCents)} daily cap`, checks };

  const auto = priceCents <= limits.autoLimitCents;
  checks.push({
    name: "AUTO_LIMIT",
    ok: auto,
    detail: auto ? `within ${usd(limits.autoLimitCents)} auto limit` : `above ${usd(limits.autoLimitCents)}: buyer approval needed`,
  });
  return auto
    ? { verdict: "ALLOW", reason: "Within automatic limit", checks }
    : { verdict: "REQUIRE_HUMAN", reason: `Above ${usd(limits.autoLimitCents)}: needs buyer approval`, checks };
}
