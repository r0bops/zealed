import { OrderHistory } from "../order-history";
import { RewardLayout } from "../reward-ui";
import Link from "next/link";

export default function OrdersPage() {
  return <RewardLayout title="My rewards and orders"><p className="text-sm text-muted">Custom prizes, Zcash rewards and unfinished missions stay with your saved invitations. <Link className="inline-flex min-h-11 items-center text-accent underline" href="/claim">Continue an invitation →</Link></p><OrderHistory active /></RewardLayout>;
}
