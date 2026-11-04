/** Legacy chat checkout is retired, including previously issued signed proposals. */
export async function POST() {
  return Response.json(
    { error: "Standalone checkout is disabled. Rewards must be approved through a campaign.", next: "/claim" },
    { status: 410, headers: { "Cache-Control": "no-store" } },
  );
}
