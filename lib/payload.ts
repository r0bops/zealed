// What gets sealed to the buyer. Serialized to JSON, then crypto_box_seal'd.
export type SealedContent =
  | { kind: "giftcard"; code?: string; pin?: string; link?: string; instructions?: string }
  | { kind: "esim"; lpa: string; instructions?: string }
  | { kind: "topup"; delivered: true; operator?: string };

export function encodeContent(content: SealedContent): string {
  return JSON.stringify({ v: 1, ...content });
}

export function decodeContent(json: string): SealedContent {
  const parsed = JSON.parse(json) as SealedContent & { v?: number };
  if (!parsed || typeof parsed !== "object" || !("kind" in parsed)) throw new Error("invalid sealed content");
  return parsed;
}
