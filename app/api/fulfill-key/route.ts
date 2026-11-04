import { fulfillPublicKey } from "@/lib/fulfill-key";

/** Public key browsers seal top-up phone numbers to. Only fulfill.ts holds the secret half. */
export async function GET() {
  return Response.json({ publicKey: await fulfillPublicKey() });
}
