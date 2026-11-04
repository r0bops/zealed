import { redirect } from "next/navigation";

/** Keep old bookmarks useful without mounting the shopping agent. */
export default async function ChatPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  redirect(view === "orders" ? "/orders" : "/claim");
}
