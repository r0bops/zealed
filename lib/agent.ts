// The Zealed shopping agent. Its tools take identifiers and metadata only, and return
// metadata only: no codes, no phone numbers, no keys ever pass through the model.
import { anthropic } from "@ai-sdk/anthropic";
import { isStepCount, tool, ToolLoopAgent, type InferAgentUIMessage } from "ai";
import { z } from "zod";
import { getProduct, isSimulated, priceFor, searchProducts, type CatalogProduct } from "./bitrefill";
import { evaluateGuardrails, limitsFromEnv } from "./guardrails";
import { centsToZat, formatUsd, zatToZec } from "./money";
import { agentSpentTodayCents, getOrder, logAgentEvent } from "./orders";
import { PROPOSAL_TTL_MS, serverSecret, signProposal } from "./proposal";

// Direct Anthropic API model id (dashes). Swap with an env change, e.g. claude-sonnet-5-5.
export const AGENT_MODEL = process.env.AGENT_MODEL || "claude-haiku-5-5";
const ZEC_USD_RATE = Number(process.env.ZEC_USD_RATE || 30);

const INSTRUCTIONS = `You are Zealed's shopping agent. You help people in India buy phone top-ups, eSIMs and gift cards from the Bitrefill catalog.

How Zealed works (explain briefly when relevant):
- The buyer's browser encrypts phone numbers. A separate fulfillment service briefly receives Bitrefill codes and seals them to the buyer's key. Never put secrets in chat; chat is sent to the AI provider.
- A shielded ZEC payment on Zcash testnet authorises each purchase. Zealed then pays Bitrefill from its own credit balance, within fixed spending caps. Never say ZEC "pays for" the product.

Spending caps (enforced in code, not by you): orders up to {AUTO} go through automatically, up to {APPROVAL} need the buyer's explicit approval, anything above is blocked, and agent orders are capped at {DAILY} per day.

Rules:
- Use search_catalog to find products and quote to price them. Never invent products, prices or package values; copy package values exactly as returned.
- As soon as the buyer has clearly asked for a specific product and package (or accepted your suggestion), call propose_order right away, without asking "shall I?". If the order needs approval, the app shows the buyer an Approve/Decline card; you never approve on their behalf. Only ask a question first if the product or package is ambiguous.
- If the buyer declines, or a guardrail blocks an order, do NOT retry the same order. Instead recommend up to 3 alternatives that fit within the automatic limit: first a smaller package of the same brand, then similar products. Use search_catalog with maxPriceUsd to find them.
- After propose_order succeeds, tell the buyer to finish in the checkout card: it creates a one-time key in their browser and shows the shielded payment request. If its result says approved: true, the buyer has ALREADY approved; don't ask them to approve again.
- NEVER ask for, repeat or store a phone number, gift card code or key in chat. For top-ups, the number goes into the secure field on the checkout card, where it is encrypted in the buyer's browser.
- You can check an order with get_order_status, which returns status only. You can never see a delivered code.
- Be brief and friendly. Show prices in USD, plus the face value (e.g. 199 INR) when known.`;

const kindEnum = z.enum(["topup", "esim", "giftcard"]);

function safeProduct(p: CatalogProduct, maxPriceCents?: number) {
  const packages = p.packages.filter((k) => maxPriceCents == null || (k.priceCents != null && k.priceCents <= maxPriceCents));
  return {
    id: p.id,
    name: p.name,
    kind: p.kind,
    country: p.country,
    inStock: p.inStock,
    packages: packages.slice(0, 6).map((k) => ({
      value: k.value,
      face: k.faceAmount != null ? `${k.faceAmount} ${p.currency}` : null,
      priceUsd: k.priceCents != null ? formatUsd(k.priceCents) : null,
    })),
    range: p.range ? { min: p.range.min, max: p.range.max, step: p.range.step, currency: p.currency } : null,
  };
}

async function priceCheck(productId: string, packageValue: string) {
  const product = await getProduct(productId);
  if (!product) return { ok: false as const, error: `Unknown product "${productId}". Search the catalog first.` };
  if (!product.inStock) return { ok: false as const, error: `${product.name} is out of stock.` };
  const priceCents = priceFor(product, packageValue);
  if (priceCents == null)
    return { ok: false as const, error: `Package "${packageValue}" isn't available or can't be priced for ${product.name}.` };
  const decision = evaluateGuardrails({ priceCents, spentTodayCents: agentSpentTodayCents(), limits: limitsFromEnv() });
  return {
    ok: true as const,
    product,
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
  const limits = limitsFromEnv();
  const logged = <I, O>(name: string, fn: (input: I) => Promise<O>) => async (input: I): Promise<O> => {
    logAgentEvent(sessionId, "tool_call", name, input);
    const output = await fn(input);
    logAgentEvent(sessionId, "tool_result", name, output);
    return output;
  };

  const tools = {
    search_catalog: tool({
      description:
        "Search the Bitrefill catalog (India) for top-ups, eSIMs or gift cards. Returns product ids, package values, face values and USD prices. Use maxPriceUsd to find alternatives within a budget.",
      inputSchema: z.object({
        query: z.string().min(2).max(80).describe('Brand or product, e.g. "airtel", "esim india", "flipkart"'),
        kind: kindEnum.optional().describe("Filter by product type"),
        maxPriceUsd: z.number().positive().optional().describe("Only return packages at or below this USD price"),
      }),
      execute: logged("search_catalog", async ({ query, kind, maxPriceUsd }: { query: string; kind?: z.infer<typeof kindEnum>; maxPriceUsd?: number }) => {
        const items = await searchProducts(query, "IN");
        const maxCents = maxPriceUsd != null ? Math.round(maxPriceUsd * 100) : undefined;
        const products = (kind ? items.filter((p) => p.kind === kind) : items)
          .map((p) => safeProduct(p, maxCents))
          .filter((p) => maxCents == null || p.packages.length > 0)
          .slice(0, 6);
        return { simulatedCatalog: isSimulated(), count: products.length, products };
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
        "Propose an order for the buyer to check out. Orders above the automatic limit ask the buyer for approval first; blocked orders are refused. On success the app shows a checkout card where the buyer creates a one-time key, enters any phone number in a secure field, and authorises with a shielded ZEC payment.",
      inputSchema: z.object({
        productId: z.string(),
        packageValue: z.string(),
      }),
      execute: logged("propose_order", async ({ productId, packageValue }: { productId: string; packageValue: string }) => {
        const r = await priceCheck(productId, packageValue);
        if (!r.ok) return { proposed: false as const, error: r.error };
        const q = r.quote;
        if (q.verdict === "BLOCK") return { proposed: false as const, blocked: true as const, reason: q.reason };
        // Reaching here with REQUIRE_HUMAN means the buyer approved: the approval policy below is
        // re-evaluated on continuation and the approval is HMAC-signed by the server.
        const proposalToken = signProposal({
          v: 1,
          sessionId,
          productId: q.productId,
          productName: q.productName,
          kind: q.kind,
          packageValue: q.packageValue,
          priceCents: q.priceCents,
          verdict: q.verdict,
          approved: q.verdict === "REQUIRE_HUMAN",
          exp: Date.now() + PROPOSAL_TTL_MS,
        });
        return { proposed: true as const, needsPhone: q.kind === "topup", approved: q.verdict === "REQUIRE_HUMAN", proposalToken, ...q };
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
  };

  return new ToolLoopAgent({
    model: anthropic(AGENT_MODEL),
    reasoning: "medium",
    instructions: INSTRUCTIONS.replace("{AUTO}", formatUsd(limits.autoLimitCents))
      .replace("{APPROVAL}", formatUsd(limits.approvalLimitCents))
      .replace("{DAILY}", formatUsd(limits.dailyLimitCents)),
    stopWhen: isStepCount(10),
    tools,
    // Guardrail triggers: the buyer approves mid-range orders in the UI; blocked orders are denied in code.
    toolApproval: {
      propose_order: async ({ productId, packageValue }: { productId: string; packageValue: string }) => {
        const r = await priceCheck(productId, packageValue);
        if (!r.ok) return undefined; // execute reports the error
        const q = r.quote;
        logAgentEvent(sessionId, "tool_result", "guardrails", { productId, packageValue, priceCents: q.priceCents, verdict: q.verdict, reason: q.reason });
        if (q.verdict === "BLOCK") return { type: "denied" as const, reason: `Blocked by guardrails: ${q.reason}` };
        if (q.verdict === "REQUIRE_HUMAN")
          return { type: "user-approval" as const, reason: `${q.productName} · ${q.packageValue} costs ${q.priceUsd}, above the ${formatUsd(limits.autoLimitCents)} automatic limit.` };
        return undefined;
      },
    },
    experimental_toolApprovalSecret: serverSecret("tool-approval"),
  });
}

export type ZealedAgentUIMessage = InferAgentUIMessage<ReturnType<typeof createZealedAgent>>;
