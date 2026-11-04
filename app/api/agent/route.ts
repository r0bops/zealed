/** Standalone shopping is retired. Reward selection requires an authenticated campaign claim. */
export async function POST() {
  return Response.json(
    { error: "Shopping chat is disabled. Open a reward invitation to use Zealed.", next: "/claim" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
