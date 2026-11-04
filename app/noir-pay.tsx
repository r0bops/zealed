"use client";
// Authorise with Noir Wallet from the browser. The wallet sees the address, amount and memo, never a code.
import { getNoirWallet } from "@noir-wallet/sdk";
import { useEffect, useState } from "react";
import { Details } from "./reward-ui";

const TESTNET_RELEASES = "https://github.com/NoirWallet/noir-wallet/releases";
const isShieldedTestnetAddress = (a: string) => /^(utest1|ztestsapling)[0-9a-z]+$/.test(a) && !a.includes("simulated");

type State =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "sending" }
  | { kind: "sent"; txid: string }
  | { kind: "error"; message: string; hint?: string };

/** Shown on the main view after a wallet authorisation. The id is truncated; the click copies the full value. */
export function PaymentConfirmation({ txid }: { txid: string }) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-base font-medium text-sealed">Authorised ✓</p>
      <button type="button" className="font-mono text-sm text-foreground underline decoration-muted underline-offset-4" onClick={() => void navigator.clipboard.writeText(txid)}>
        <span className="sr-only">Copy transaction id </span>{txid.slice(0, 12)}…
      </button>
      <a href={`https://zexplorer.app/testnet/tx/${txid}`} target="_blank" rel="noreferrer" className="text-base underline">View on explorer</a>
    </div>
  );
}

export function NoirPayButton({ to, amountZec, memo, simulatedDetection, onSent, variant = "primary" }: { to: string; amountZec: string; memo: string; simulatedDetection: boolean; onSent?: (txid: string) => void; variant?: "primary" | "link" }) {
  const [installed, setInstalled] = useState<boolean | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    // The extension injects window.noirwallet after load; it can be null on the first render.
    let tries = 0;
    const check = () => {
      if (getNoirWallet()) return setInstalled(true);
      if (++tries < 10) timer = setTimeout(check, 300);
      else setInstalled(false);
    };
    let timer = setTimeout(check, 0);
    return () => clearTimeout(timer);
  }, []);

  async function pay() {
    const wallet = getNoirWallet();
    if (!wallet) return setInstalled(false);
    if (!isShieldedTestnetAddress(to)) return setState({ kind: "error", message: "This demo can’t be approved from a wallet." });
    try {
      setState({ kind: "connecting" });
      await wallet.zcash.connect();
      const balance = await wallet.zcash.getBalance();
      if (Number(balance.shielded) < Number(amountZec)) {
        return setState({
          kind: "error",
          message: "Your wallet doesn’t have enough testnet funds to authorise this.",
          hint: `This needs ${amountZec} TAZ. This wallet has ${balance.shielded} TAZ. Get testnet coins from a faucet first.`,
        });
      }
      setState({ kind: "sending" });
      const txid = await wallet.zcash.sendTransaction({ to, amount: amountZec, memo, fundingSource: "shielded" });
      setState({ kind: "sent", txid });
      onSent?.(txid);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      const cancelled = err.code === 4001 || /reject|denied|cancel/i.test(err.message ?? "");
      setState({ kind: "error", message: cancelled ? "You cancelled in the wallet." : `Noir Wallet error: ${(err.message ?? "unknown").slice(0, 140)}` });
    }
  }

  if (installed === false)
    return (
      <p className="text-sm text-muted">
        Have a browser wallet?{" "}
        <a href={TESTNET_RELEASES} target="_blank" rel="noreferrer" className="underline">
          Install the testnet wallet
        </a>{" "}
        to authorise in one step.
      </p>
    );
  if (installed === null) return null;

  if (state.kind === "sent") return <PaymentConfirmation txid={state.txid} />;

  const busy = state.kind === "connecting" || state.kind === "sending";
  const label = state.kind === "connecting" ? "Connecting to your wallet…" : state.kind === "sending" ? "Approve this in your wallet…" : "Authorise with your wallet";
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className={variant === "link"
          ? "inline-flex min-h-12 items-center text-base font-medium underline underline-offset-4 disabled:opacity-50"
          : "inline-flex min-h-12 items-center justify-center rounded-lg bg-accent px-5 py-3 text-base font-semibold text-background disabled:opacity-50"}
      >
        {label}
      </button>
      <p className="text-sm text-muted">
        Your wallet gets the amount and a note, not what was bought.
        {simulatedDetection && " Detection on this demo is simulated."}
      </p>
      {state.kind === "error" && <p className="text-base text-danger">{state.message}</p>}
      {state.kind === "error" && state.hint && <Details><p>{state.hint}</p></Details>}
    </div>
  );
}
