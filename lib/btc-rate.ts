// Live BTC/USD rate for pricing our BTC-denominated Bitrefill balance. Public price endpoints only:
// a plain GET from the server, nothing about users is sent. Falls back to BTC_USD_RATE so the
// guardrails always have a rate. (ZEC stays at a fixed demo rate: testnet TAZ has no market price.)
export interface BtcUsdRate {
  rate: number;
  source: "coinbase" | "kraken" | "fixed";
  at: number; // ms epoch when fetched
}

const TTL_MS = 5 * 60_000;
const RETRY_AFTER_FAILURE_MS = 60_000;
const MAX_DEVIATION = 0.25; // reject a live value more than 25% away from BTC_USD_RATE

const g = globalThis as unknown as { __zealedBtcUsd?: BtcUsdRate; __zealedBtcUsdInflight?: Promise<BtcUsdRate> };

export function fixedBtcUsd(): number {
  const r = Number(process.env.BTC_USD_RATE || 70_000);
  return Number.isFinite(r) && r > 0 ? r : 70_000;
}

function sane(value: number, reference: number): boolean {
  return Number.isFinite(value) && value > 0 && Math.abs(value - reference) / reference <= MAX_DEVIATION;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(3_000), cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`price feed ${res.status}`);
  return res.json();
}

async function coinbase(): Promise<number> {
  const j = (await getJson("https://api.coinbase.com/v2/prices/BTC-USD/spot")) as { data?: { amount?: string } };
  return Number(j.data?.amount);
}

async function kraken(): Promise<number> {
  const j = (await getJson("https://api.kraken.com/0/public/Ticker?pair=XBTUSD")) as { result?: Record<string, { c?: string[] }> };
  const first = j.result ? Object.values(j.result)[0] : undefined;
  return Number(first?.c?.[0]);
}

async function fetchRate(): Promise<BtcUsdRate> {
  const reference = fixedBtcUsd();
  for (const [source, fn] of [["coinbase", coinbase], ["kraken", kraken]] as const) {
    try {
      const rate = await fn();
      if (sane(rate, reference)) return { rate, source, at: Date.now() };
    } catch {
      /* try the next source */
    }
  }
  // Both failed or were rejected: use the fixed rate, and try the feeds again in a minute.
  return { rate: reference, source: "fixed", at: Date.now() - TTL_MS + RETRY_AFTER_FAILURE_MS };
}

/** Current BTC/USD rate: cached for 5 minutes, live when possible, fixed otherwise. */
export async function btcUsdRate(): Promise<BtcUsdRate> {
  if (process.env.BTC_USD_LIVE === "off") return { rate: fixedBtcUsd(), source: "fixed", at: Date.now() };
  const cached = g.__zealedBtcUsd;
  if (cached && Date.now() - cached.at < TTL_MS) return cached;
  if (!g.__zealedBtcUsdInflight) {
    g.__zealedBtcUsdInflight = fetchRate()
      .then((r) => (g.__zealedBtcUsd = r))
      .finally(() => (g.__zealedBtcUsdInflight = undefined));
  }
  return g.__zealedBtcUsdInflight;
}
