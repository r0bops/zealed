import { resolveShortLink } from "@/lib/short-links";
import { rateLimit } from "@/lib/rate-limit";

// Short link behind a verification QR code: redirects a phone to the full Reclaim link the server created.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const limited = rateLimit(req, "short-link", 60, 60_000);
  if (limited) return limited;
  const url = resolveShortLink((await ctx.params).id);
  const headers = { "cache-control": "no-store", "referrer-policy": "no-referrer" };
  if (!url) return new Response("This verification link has expired. Go back to your invitation and start the verification again.", { status: 404, headers: { ...headers, "content-type": "text/plain; charset=utf-8" } });
  return new Response(null, { status: 303, headers: { ...headers, location: url } });
}
