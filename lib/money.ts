// Integer money only: USD cents and zatoshis. Never floats for arithmetic.
export const ZAT_PER_ZEC = 100_000_000n;

export function assertCents(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid cents: ${value}`);
  return value;
}

/** Convert USD cents to zatoshis at a fixed demo rate (USD per ZEC). Rounds up so we never under-charge. */
export function centsToZat(cents: number, usdPerZec: number): bigint {
  assertCents(cents);
  if (!(usdPerZec > 0)) throw new Error("invalid ZEC_USD_RATE");
  // zat = cents / 100 / rate * 1e8 = cents * 1e6 / rate. Use micro-dollar integer rate to stay exact.
  const rateMicro = BigInt(Math.round(usdPerZec * 1_000_000));
  const numerator = BigInt(cents) * 1_000_000n * 1_000_000n;
  return (numerator + rateMicro - 1n) / rateMicro;
}

/** "0.01234567" — decimal ZEC string for ZIP-321 URIs and display. */
export function zatToZec(zat: bigint): string {
  const whole = zat / ZAT_PER_ZEC;
  const frac = (zat % ZAT_PER_ZEC).toString().padStart(8, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

export function zecToZat(zec: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,8}))?$/.exec(zec.trim());
  if (!m) throw new Error(`invalid ZEC amount: ${zec}`);
  return BigInt(m[1]) * ZAT_PER_ZEC + BigInt((m[2] ?? "").padEnd(8, "0"));
}

export function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
