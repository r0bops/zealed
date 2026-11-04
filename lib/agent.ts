// The Zealed shopping agent. Its tools take identifiers and metadata only, and return
// metadata only: no codes, no phone numbers, no keys ever pass through the model.
import { isStepCount, tool, ToolLoopAgent, type InferAgentUIMessage } from "ai";
import { z } from "zod";
import { getProduct, isSimulated, priceFor, searchProducts } from "./bitrefill";
import { evaluateGuardrails, limitsFromEnv } from "./guardrails";
import { centsToZat, formatUsd, zatToZec } from "./money";
import { agentSpentTodayCents, getOrder, logAgentEvent } from "./orders";

// Vercel AI Gateway model string (provider/model). Swap with an env change, e.g. anthropic/claude-sonnet-5.5.
export const AGENT_MODEL = process.env.AGENT_MODEL || "anthropic/claude-haiku-5.5";
const ZEC_USD_RATE = Number(process.env.ZEC_USD_RATE || 30);

const INSTRUCTIONS = `You are Zealed's shopping agent. You help people in India buy phone top-ups, eSIMs and gift cards from the Bitrefill catalog.

How Zealed works (explain briefly when relevant):
- The buyer's browser encrypts everything sensitive. Codes, eSIM activation strings and phone numbers are sealed so that Zealed's database, its logs and you (the agent) never see them.
- A shielded ZEC payment on Zcash testnet authorises each purchase. Zealed then pays Bitrefill from its own credit balance, within fixed spending caps. Never say ZEC "pays for" the product.

Rules:
- Use search_catalog to find products and quote to price them. Never invent products, prices or package values; copy package values exactly as returned.
- When the buyer has picked a product and package, call propose_order. The app then shows a checkout card.
- NEVER ask for, repeat or store a phone number, gift card code or key in chat. For top-ups, tell the buyer to type the number into the secure field on the checkout card, where it is encrypted in their browser.
- If a guardrail blocks an order or requires approval, say so plainly and explain the cap.
- You can check an order with get_order_status, which returns status only. You can never see a delivered code.
- Be brief and friendly. Show prices in USD (and INR value where the package is in rupees).`;

const kindEnum = z.enum(["topup", "esim", "giftcard"]);

function safeProduct(p: Awaited<ReturnType<typeof searchProducts>>[number]) {
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    country: p.country,
    inStock: p.inStock,
    packages: p.packages.slice(0, 6).map((k) => ({
      value: k.value,
      priceUsd: k.priceCents != null ? formatUsd(k.priceCents) : null,
    })),
    range: p.range ?? null,
  };
}

async function priceCheck(productId: string, packageValue: string) {
  const product = await getProduct(productId);
  if (!product) return { ok: false as const, error: `Unknown product "${productId}". Search the catalog first.` };
  const priceCents = priceFor(product, packageValue);
  if (priceCents == null)
    return { ok: false as const, error: `Package "${packageValue}" isn't available or can't be priced for ${product.name}.` };
  const decision = evaluateGuardrails({
    priceCents,
    spentTodayCents: agentSpentTodayCents(),
    limits: limitsFromEnv(),
  });
  return {
    ok: true as const,
    product,
    priceCents,
    quote: {
      productId: product.id,
      productName: product.name,
      kind: product.kind,
      packageValue,
      priceCents,
      priceUsd: formatUsd(priceCents),
      authorisationZec: zatToZec(centsToZat(priceCents, ZEC_USD_RATE)),
      verdict: decision.verdict,
      reason: decision.reason,
      checks: decision.checks,
    },
  };
}

/** One agent instance per chat session, so every tool call is logged against that session. */
export function createZealedAgent(sessionId: string) {
  const logged = <I, O>(name: string, fn: (input: I) => Promise<O>) => async (input: I): Promise<O> => {
    logAgentEvent(sessionId, "tool_call", name, input);
    const output = await fn(input);
    logAgentEvent(sessionId, "tool_result", name, output);
    return output;
  };

  return new ToolLoopAgent({
    model: AGENT_MODEL,
    reasoning: "medium",
    instructions: INSTRUCTIONS,
    stopWhen: isStepCount(8),
    tools: {
      search_catalog: tool({
        description: "Search the Bitrefill catalog (India) for top-ups, eSIMs or gift cards. Returns product ids, package values and USD prices.",
        inputSchema: z.object({
          query: z.string().min(2).max(80).describe('Brand or product, e.g. "airtel", "esim india", "flipkart"'),
          kind: kindEnum.optional().describe("Filter by product type"),
        }),
        execute: logged("search_catalog", async ({ query, kind }: { query: string; kind?: z.infer<typeof kindEnum> }) => {
          const items = await searchProducts(query, "IN");
          const filtered = (kind ? items.filter((p) => p.kind === kind) : items).slice(0, 6);
          return { simulatedCatalog: isSimulated(), count: filtered.length, products: filtered.map(safeProduct) };
        }),
      }),

      quote: tool({
        description: "Price one product package and run the spending guardrails. Does not create an order.",
        inputSchema: z.object({
          productId: z.string().describe("Product id from search_catalog"),
          packageValue: z.string().describe("Package value copied exactly from search_catalog"),
        }),
        execute: logged("quote", async ({ productId, packageValue }: { productId: string; packageValue: string }) => {
          const r = await priceCheck(productId, packageValue);
          return r.ok ? r.quote : { error: r.error };
        }),
      }),

      propose_order: tool({
        description:
          "Propose an order for the buyer to check out. The app shows a checkout card where the buyer generates their key, types any phone number into a secure field, and authorises with a shielded ZEC payment. Call only after the buyer picked a product and package.",
        inputSchema: z.object({
          productId: z.string(),
          packageValue: z.string(),
        }),
        execute: logged("propose_order", async ({ productId, packageValue }: { productId: string; packageValue: string }) => {
          const r = await priceCheck(productId, packageValue);
          if (!r.ok) return { proposed: false as const, error: r.error };
          if (r.quote.verdict === "BLOCK") return { proposed: false as const, blocked: true, ...r.quote };
          return { proposed: true as const, needsPhone: r.quote.kind === "topup", ...r.quote };
        }),
      }),

      get_order_status: tool({
        description: "Get the status of an order. Returns status only, never codes or phone numbers.",
        inputSchema: z.object({ orderId: z.string() }),
        execute: logged("get_order_status", async ({ orderId }: { orderId: string }) => {
          const o = getOrder(orderId);
          if (!o) return { found: false };
          return {
            found: true,
            status: o.status,
            productName: o.productName,
            delivered: o.status === "delivered",
            phoneWiped: o.type === "topup" ? o.wipedAt != null : null,
          };
        }),
      }),
    },
  });
}

export type ZealedAgentUIMessage = InferAgentUIMessage<ReturnType<typeof createZealedAgent>>;
