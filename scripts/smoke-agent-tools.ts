// Dev smoke test: runs the agent's tools directly (no LLM call). Uses DATABASE_PATH or ./data/zealed.db.
import { createZealedAgent } from "../lib/agent";

async function main() {
  const agent = createZealedAgent("smoke-test") as unknown as { tools: Record<string, { execute: (i: unknown, o: unknown) => Promise<unknown> }> };
  const opts = { toolCallId: "smoke", messages: [] };
  const run = async (name: string, input: unknown) => console.log(name, JSON.stringify(await agent.tools[name].execute(input, opts)));
  await run("search_catalog", { query: "airtel" });
  await run("quote", { productId: "airtel-india", packageValue: "10" });
  await run("propose_order", { productId: "bitrefill-esim-india", packageValue: "1GB, 7 Days" });
  await run("propose_order", { productId: "flipkart-india", packageValue: "999" });
  await run("get_order_status", { orderId: "nope" });
}
main();
