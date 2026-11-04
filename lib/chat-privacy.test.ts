import { describe, expect, it } from "vitest";
import { looksSensitive, validateChatMessages } from "./chat-privacy";

describe("chat scanner", () => {
  it("treats decimal amounts as amounts, not phone numbers", () => {
    expect(looksSensitive("0.33333334")).toBe(false);
    expect(looksSensitive("12.34567891")).toBe(false);
    expect(looksSensitive("+91 98765 43210")).toBe(true);
    expect(looksSensitive("9876543210")).toBe(true);
  });
  it("accepts a real approval continuation (custom provider parts, empty streamed id, decimal quotes)", () => {
    const user = { id: "u1", role: "user", parts: [{ type: "text", text: "Buy me a 1000 rupee Flipkart gift card" }] };
    const assistant = {
      id: "",
      role: "assistant",
      parts: [
        { type: "step-start" },
        { type: "custom", kind: "anthropic.message_start", providerMetadata: { anthropic: { id: "msg_011Cgh", model: "claude-haiku-5-5" } } },
        { type: "reasoning", text: "Quote first.", providerMetadata: { anthropic: { signature: "CAQSjwcK/Low+abc=" } } },
        { type: "tool-quote", toolCallId: "toolu_01", state: "output-available", input: { productId: "flipkart-india", packageValue: "1000" },
          output: { priceUsd: "$11.20", authorisationZec: "0.37333334", verdict: "REQUIRE_HUMAN", btcUsd: { rate: 78340, source: "coinbase", at: 1793783548905 } } },
        { type: "tool-propose_order", toolCallId: "toolu_02", state: "approval-responded", input: { productId: "flipkart-india", packageValue: "1000" },
          approval: { id: "aitxt-kFqJcx7E", approved: true, signature: "VxmzNKIXQFvuar", reason: "Buyer approved in the app" } },
      ],
    };
    expect(validateChatMessages([user, assistant])).toHaveLength(2);
    expect(() => validateChatMessages([user, { ...assistant, parts: [{ type: "text", text: "the phone number is 98765 43210" }] }])).toThrow();
  });
});
