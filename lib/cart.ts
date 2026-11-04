// Binds the shielded payment to one exact order: the memo carries the order tag plus a hash of
// what is being bought. fulfill.ts recomputes it and refuses to buy if anything changed.
import { createHash } from "node:crypto";

export interface CartFields {
  orderId: string;
  productId: string;
  packageValue: string;
  priceUsdCents: number;
  amountZat: number;
  buyerPubKey: string;
  expiresAt: number;
}

/** 16-byte SHA-256 prefix, base64url (22 chars). Canonical field order, newline-separated. */
export function cartHash(c: CartFields): string {
  const canonical = [
    "zealed-cart-v1",
    c.orderId,
    c.productId,
    c.packageValue,
    String(c.priceUsdCents),
    String(c.amountZat),
    c.buyerPubKey,
    String(c.expiresAt),
  ].join("\n");
  return createHash("sha256").update(canonical).digest().subarray(0, 16).toString("base64url");
}

export function buildMemo(memoTag: string, hash: string): string {
  return `${memoTag} cart:${hash}`;
}

export function memoCartHash(memo: string | null | undefined): string | null {
  const m = /cart:([A-Za-z0-9_-]{22})/.exec(memo ?? "");
  return m ? m[1] : null;
}
