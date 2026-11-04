import { PaymentPanel } from "../../order-details";
import { RewardLayout } from "../../reward-ui";

// Standalone order page: payment request, live status and local decryption. The key for this
// order lives only in the browser that created it (or comes from its backup string).
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <RewardLayout title="Your reward, sealed for you." description="Follow the delivery and open your reward on this device. Codes stay hidden until you choose to reveal them.">
      <PaymentPanel orderId={id} />
    </RewardLayout>
  );
}
