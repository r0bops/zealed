// Dev end-to-end check of the agent's approval trigger, driven like useChat does (real model, running server).
// Approve path: ask → approval card → approve → proposal → order → SIMULATED payment → delivered → decrypt.
// Decline path: ask → approval card → decline → agent recommends cheaper alternatives.
// Run: npx tsx --env-file=.env.local scripts/e2e-agent-approval.ts [approve|decline]
import { DefaultChatTransport, readUIMessageStream, type UIMessage } from "ai";
import { decodeContent } from "../lib/payload";
import { generateKeyPair, open } from "../lib/sodium";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const transport = new DefaultChatTransport<UIMessage>({ api: `${BASE}/api/agent` });
type Part = UIMessage["parts"][number] & { state?: string; toolCallId?: string; approval?: { id: string; approved?: boolean; reason?: string; requestReason?: string; isAutomatic?: boolean }; output?: Record<string, unknown>; input?: unknown };

// continueFrom: after an approval response the server continues the same assistant message (as useChat does).
async function turn(chatId: string, messages: UIMessage[], continueFrom?: UIMessage): Promise<UIMessage> {
  const stream = await transport.sendMessages({ trigger: "submit-message", chatId, messageId: undefined, messages, abortSignal: undefined });
  let last: UIMessage | undefined;
  for await (const m of readUIMessageStream<UIMessage>({ stream, message: continueFrom ? structuredClone(continueFrom) : undefined })) last = m;
  if (!last) throw new Error("no assistant message");
  return last;
}

function describe(m: UIMessage) {
  for (const p of m.parts as Part[]) {
    if (p.type === "text" && "text" in p && p.text) console.log(`  agent: ${String(p.text).replace(/\s+/g, " ").slice(0, 300)}`);
    else if (p.type.startsWith("tool-")) console.log(`  ${p.type} [${p.state}]${p.approval?.requestReason ? ` "${p.approval.requestReason}"` : ""}${p.approval?.reason ? ` reason="${p.approval.reason}"` : ""}`);
  }
}

async function main() {
  const mode = process.argv[2] === "decline" ? "decline" : "approve";
  const chatId = `e2e-approval-${mode}-${Date.now()}`;
  const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Buy me a 1000 rupee Flipkart gift card please" }] };

  console.log(`turn 1 (${mode})`);
  const a1 = await turn(chatId, [user]);
  describe(a1);
  const approvalPart = (a1.parts as Part[]).find((p) => p.type === "tool-propose_order" && p.state === "approval-requested");
  if (!approvalPart?.approval) return console.log("✗ no approval request");

  // What addToolApprovalResponse does in the browser.
  approvalPart.state = "approval-responded";
  approvalPart.approval = { ...approvalPart.approval, approved: mode === "approve", reason: mode === "approve" ? "Buyer approved in the app" : "Buyer declined in the app" };

  console.log("turn 2");
  const a2 = await turn(chatId, [user, a1], a1);
  describe({ ...a2, parts: a2.parts.slice(a1.parts.length - 1) });
  const all = a2.parts as Part[];
  const proposal = all.find((p) => p.type === "tool-propose_order" && p.state === "output-available")?.output as { proposed?: boolean; proposalToken?: string; approved?: boolean } | undefined;

  if (mode === "decline") {
    const denied = all.some((p) => p.type === "tool-propose_order" && p.state === "output-denied");
    const searchedCheaper = (a2.parts as Part[]).some((p) => p.type === "tool-search_catalog" && JSON.stringify(p.input ?? {}).includes("maxPriceUsd"));
    return console.log(denied ? `✓ declined; agent searched with a budget: ${searchedCheaper}` : "✗ decline not recorded");
  }
  if (!proposal?.proposed || !proposal.proposalToken) return console.log("✗ no proposal after approval");
  console.log(`  proposal approved=${proposal.approved}`);

  const buyer = await generateKeyPair();
  const res = await fetch(`${BASE}/api/orders`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proposalToken: proposal.proposalToken, buyerPubKey: buyer.publicKey }) });
  const created = await res.json();
  if (!res.ok) return console.log(`✗ order: ${res.status} ${created.error}`);
  const id = created.order.id;
  console.log(`  order ${id.slice(0, 8)} ${created.order.status} guardrail=${created.order.guardrail} approvedAt=${Boolean(created.order.approvedAt)}`);
  await fetch(`${BASE}/api/dev/simulate-payment/${id}`, { method: "POST" });
  for (let i = 0; i < 30; i++) {
    const { order } = await (await fetch(`${BASE}/api/orders/${id}`)).json();
    if (order.status === "delivered") {
      const c = decodeContent(await open(order.sealedPayload, buyer.publicKey, buyer.secretKey));
      return console.log(`✓ delivered and decrypted locally (${c.kind}${c.kind === "giftcard" ? `, code ${c.code?.slice(0, 4)}•••` : ""})`);
    }
    if (["failed", "failed_uncertain", "expired"].includes(order.status)) return console.log(`✗ ${order.status}: ${order.failure}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log("✗ timed out");
}
main();
