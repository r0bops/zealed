import type { ProgramInput } from "@/lib/program-schema";

// India demo defaults. Availability and current prices are checked by the server at creation and selection.
export const PRIZE_PRESETS = {
  giftcard: { title: "Gift card", description: "Flipkart India · value selected within your budget", productId: "flipkart-india" },
  esim: { title: "Mobile data eSIM", description: "India mobile data · package selected within your budget", productId: "bitrefill-esim-india" },
  zcash: { title: "Zcash prize", description: "0.01 TAZ by default · testnet coins, no monetary value" },
  custom: { title: "Custom reward", description: "Merchandise, tickets or private collection instructions" },
} as const;

export function presetProductIds(program: ProgramInput): string[] {
  return [...new Set(program.prizes.flatMap(p => p.kind === "giftcard" || p.kind === "esim" ? [PRIZE_PRESETS[p.kind].productId] : []))];
}
