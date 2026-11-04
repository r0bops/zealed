import { PaymentPanel } from "../../checkout";

// Standalone order page: payment request, live status and local decryption. The key for this
// order lives only in the browser that created it (or comes from its backup string).
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-10">
      <p className="text-sm text-muted">Zealed order</p>
      <PaymentPanel orderId={id} />
    </main>
  );
}
