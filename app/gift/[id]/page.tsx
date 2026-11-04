import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RewardLayout } from "../../reward-ui";
import { GiftOpen } from "./gift-open";

// The page itself carries nothing secret: the token lives in the URL fragment, which browsers and
// link-preview bots never send to the server. Everything else happens in GiftOpen, in the browser.
const title = "A sealed gift";
const description = "Opens once, for one person. Sealed in the browser with Zealed.";
export const metadata: Metadata = {
  title,
  description,
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  openGraph: { title, description, type: "website", siteName: "Zealed" },
  twitter: { card: "summary", title, description },
};

export default async function GiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{22}$/.test(id)) notFound();
  return (
    <RewardLayout title="A sealed gift for you">
      <GiftOpen giftId={id} />
    </RewardLayout>
  );
}
