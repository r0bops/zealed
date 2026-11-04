import { OrderHistory } from "../order-history";
import { RewardLayout } from "../reward-ui";

export default function OrdersPage() {
  return <RewardLayout title="My rewards"><OrderHistory active /></RewardLayout>;
}
