"use client";

import { useState } from "react";
import { AgentChat } from "./agent-chat";
import { OrderHistory } from "./order-history";

export function ChatWorkspace({ initialView, ...chatProps }: {
  initialView: "conversation" | "orders";
  model: string;
  simulatedCatalog: boolean;
  hasModelKey: boolean;
}) {
  const [view, setView] = useState(initialView);
  return (
    <div className="space-y-4">
      <nav aria-label="Shopping views" className="flex gap-2">
        {(["conversation", "orders"] as const).map((item) => (
          <button key={item} type="button" aria-pressed={view === item} aria-controls={`shopping-${item}`} onClick={() => setView(item)}
            className={`min-h-11 rounded-lg border px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${view === item ? "border-foreground bg-foreground text-background" : "border-line bg-surface"}`}>
            {item === "conversation" ? "Conversation" : "Orders"}
          </button>
        ))}
      </nav>
      {/* Keep the chat mounted: viewing an order must not discard messages or approvals. */}
      <div id="shopping-conversation" hidden={view !== "conversation"} className="space-y-3"><AgentChat {...chatProps} /></div>
      <div id="shopping-orders" hidden={view !== "orders"}><OrderHistory active={view === "orders"} onShop={() => setView("conversation")} /></div>
    </div>
  );
}
