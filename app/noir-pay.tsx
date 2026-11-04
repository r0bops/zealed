"use client";
// "Pay with Noir Wallet": the buyer pays the exact shielded amount + memo from their own browser wallet.
// The wallet sees our address, the amount and the memo (order tag + cart hash), never a code or phone number.
import { button } from "./reward-ui";
import { getNoirWallet } from "@noir-wallet/sdk";
import { useEffect, useState } from "react";

const TESTNET_RELEASES = "https://github.com/NoirWallet/noir-wallet/releases";
const isShieldedTestnetAddress = (a: string) => /^(utest1|ztestsapling)[0-9a-z]+$/.test(a) && !a.includes("simulated");

type State =
  | { kind: "idle" }
  | { kind: "connecting" }
  | { kind: "sending" }
  | { kind: "sent"; txid: string }
  | { kind: "error"; message: string };

export function NoirPayButton({ to, amountZec, memo, simulatedDetection, onSent }: { to: string; amountZec: string; memo: string; simulatedDetection: boolean; onSent?: (txid: string) => void }) {
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
    if (!isShieldedTestnetAddress(to)) return setState({ kind: "error", message: "This order has no real testnet address to pay (SIMULATED backend)." });
    try {
      setState({ kind: "connecting" });
      await wallet.zcash.connect();
      const balance = await wallet.zcash.getBalance();
      if (Number(balance.shielded) < Number(amountZec)) {
        return setState({ kind: "error", message: `Your shielded balance is ${balance.shielded} TAZ; this needs ${amountZec} TAZ. Get TAZ from a faucet first.` });
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
      <p className="text-xs text-muted">
        Have a browser wallet?{" "}
        <a href={TESTNET_RELEASES} target="_blank" rel="noreferrer" className="underline">
          Install [Testnet] Noir Wallet
        </a>{" "}
        to pay in one click.
      </p>
    );
  if (installed === null) return null;

  if (state.kind === "sent")
    return (
      <p className="rounded-lg border border-sealed/40 px-3 py-2 text-sm text-sealed">
        Sent from Noir Wallet.{" "}
        <a href={`https://testnet.zcashexplorer.app/transactions/${state.txid}`} target="_blank" rel="noreferrer" className="font-mono underline">
          {state.txid.slice(0, 12)}…
        </a>{" "}
        Waiting for the network to confirm.
      </p>
    );

  const busy = state.kind === "connecting" || state.kind === "sending";
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className={button}
      >
        {state.kind === "connecting" ? "Connecting to Noir Wallet…" : state.kind === "sending" ? "Approve the payment in Noir Wallet…" : `Pay ${amountZec} TAZ with Noir Wallet`}
      </button>
      <p className="text-xs text-muted">
        Shielded payment with the memo pre-filled. Noir sees our address, the amount and the memo, nothing you bought.
        {simulatedDetection && " Detection is SIMULATED in this build."}
      </p>
      {state.kind === "error" && <p className="text-sm text-danger">{state.message}</p>}
    </div>
  );
}
