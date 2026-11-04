import { OrderHistory } from "../order-history";
import { RewardLayout } from "../reward-ui";
export default function OrdersPage() {
  return <RewardLayout title="Your rewards, all in one place." description="Pick up a mission, open a prize or return to a gift. Everything here is remembered on this browser."><OrderHistory active /></RewardLayout>;
}
