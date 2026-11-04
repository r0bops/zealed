import { PlayerClaim } from "./player";
export default async function ClaimPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PlayerClaim campaignId={id} />;
}
