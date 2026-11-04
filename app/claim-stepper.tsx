const STEPS = ["Join", "Mission", "Reward picked", "Approved", "Delivered"] as const;

/** 0-based index of the current step. `5` means all five are done. */
export function flowStep(flags: { joined: boolean; missionDone: boolean; rewardPicked: boolean; approved: boolean; delivered: boolean }): number {
  if (!flags.joined) return 0;
  if (!flags.missionDone) return 1;
  if (!flags.rewardPicked) return 2;
  if (!flags.approved) return 3;
  if (!flags.delivered) return 4;
  return 5;
}

const OPEN_ORDER = new Set(["awaiting_payment", "awaiting_seller", "expired"]);

/** Map the claim/order state this page already has onto the five steps. */
export function stepFromClaim(input: { joined: boolean; missionDone: boolean; rewardPicked: boolean; orderId: string | null; orderStatus: string | null }): number {
  const status = input.orderStatus ?? "";
  const approved = !!input.orderId && status !== "" && !OPEN_ORDER.has(status) && status !== "failed" && status !== "failed_uncertain";
  return flowStep({
    joined: input.joined,
    missionDone: input.missionDone,
    rewardPicked: input.rewardPicked,
    approved,
    delivered: status === "delivered",
  });
}

export function ClaimStepper({ current, failed = false }: { current: number; failed?: boolean }) {
  const stepNumber = current >= STEPS.length ? STEPS.length : current + 1;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted">Step {stepNumber} of 5</p>
      <ol aria-label="Claim progress" className="grid grid-cols-5 gap-1 sm:gap-3">
        {STEPS.map((label, i) => {
          const state = i < current ? "done" : i === current ? (failed ? "failed" : "current") : "todo";
          return (
            <li key={label} aria-current={state === "current" || state === "failed" ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-2 text-center">
              <span aria-hidden className={`grid size-8 place-items-center rounded-full text-sm font-semibold sm:size-10 ${state === "done" ? "bg-sealed text-background" : state === "current" ? "bg-accent text-background" : state === "failed" ? "bg-danger text-background" : "bg-line text-muted"}`}>
                {state === "done" ? "✓" : state === "failed" ? "!" : i + 1}
              </span>
              <span className={`text-[11px] leading-tight sm:text-xs ${state === "current" ? "font-medium text-accent" : state === "done" ? "text-foreground" : state === "failed" ? "font-medium text-danger" : "text-muted"}`}>
                {label}
                <span className="sr-only">{state === "done" ? " (done)" : state === "current" ? " (current step)" : state === "failed" ? " (needs attention)" : " (not started)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
