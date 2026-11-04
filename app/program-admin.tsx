"use client";
import { useEffect, useState } from "react";
import { button, buttonSecondary, field, request } from "./reward-ui";
import { seal } from "@/lib/sodium";
import { NoirPayButton } from "./noir-pay";
import type { ProgramStatus } from "@/lib/program-schema";
export function ProgramAdmin({ campaignId, token }: { campaignId: string; token: string }) {
  const [expanded, setExpanded] = useState(false), [data, setData] = useState<ProgramStatus | null>(null), [error, setError] = useState("");
  const [secret, setSecret] = useState(""), [txid, setTxid] = useState(""), [busy, setBusy] = useState(false);
  const url = `/api/campaigns/${campaignId}/program`;
  useEffect(() => {
    if (!expanded) return;
    let live = true;
    const refresh = () => request<ProgramStatus | null>(url, token).then(d => { if (live) setData(d); }).catch(() => { if (live) setError("Could not refresh the mission review."); });
    void refresh(); const timer = setInterval(refresh, 5000); return () => { live = false; clearInterval(timer); };
  }, [expanded, url, token]);
  async function act(body: object) { setBusy(true); setError(""); try { setData(await request(url, token, body)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }
  const r = data?.redemption, prize = data?.prizes.find(p => p.id === r?.prize_id);
  const memo = data ? `Zealed prize ${data.claimId}` : "";
  const amount = prize?.kind === "zcash" ? (prize.amountZat / 1e8).toFixed(8) : "";
  const uri = r?.address ? `zcash:${r.address}?amount=${amount}&memo=${btoa(memo).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")}` : "";
  return <section className="space-y-4 border-t border-line pt-4"><button className={buttonSecondary} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "Close mission review" : "Review tasks & fulfill prize"}</button>
    {expanded && <>{error && <p role="alert" className="text-danger">{error}</p>}{!data ? <p className="text-sm text-muted">No participant has started yet.</p> : <>
      {data.tasks.map(t => { const result = data.results.find(r => r.task_id === t.id); return <div key={t.id} className="space-y-2 rounded-lg border border-line p-4"><h4 className="font-medium">{t.title}</h4><p className="text-sm text-muted">{result?.status ?? "Not submitted"}</p>{result?.evidence && <a href={result.evidence} target="_blank" rel="noreferrer" className="block break-all text-sm underline">Open public evidence ↗</a>}{result?.status === "pending" && <div className="flex flex-wrap gap-2"><button disabled={busy} className={button} onClick={() => void act({ action: "review", taskId: t.id, approved: true })}>Approve task</button><button disabled={busy} className={buttonSecondary} onClick={() => void act({ action: "review", taskId: t.id, approved: false })}>Reject submission</button></div>}</div>; })}
      <p className="text-sm">{data.eligible ? "All tasks approved. Participant can select one prize." : "Redemption locked until every task passes."}</p>
      {r && <div className="space-y-3 border-t border-line pt-4"><h4 className="font-semibold">{prize?.title}</h4><p className="text-sm">Status: {r.state === "ready" ? "Sent / awaiting participant acknowledgment" : r.state}</p>
        {r.kind === "zcash" && r.state === "requested" && <><p className="text-sm text-muted">Direct testnet payout. Verify this is a shielded address with a supported receiver. Send once, then record the txid. Recording a txid does not verify on-chain delivery.</p><p className="break-all font-mono text-xs">{r.address}</p><NoirPayButton to={r.address!} amountZec={amount} memo={memo} simulatedDetection={false} onSent={setTxid} /><a className="inline-flex min-h-11 items-center underline" href={uri}>Open payout in another wallet</a><label className="block space-y-2"><span>Broadcast transaction ID</span><input className={field} value={txid} maxLength={64} onChange={e => setTxid(e.target.value)} /></label><button className={button} disabled={busy || !/^[a-f0-9]{64}$/.test(txid)} onClick={() => void act({ action: "deliver", txid })}>Record submitted payout</button></>}
        {r.kind === "custom" && r.state === "requested" && <><label className="block space-y-2"><span>Private code or fulfillment instructions</span><textarea className={field} maxLength={6000} value={secret} onChange={e => setSecret(e.target.value)} /></label><p className="text-xs text-muted">Encrypted in this browser to the participant. For physical prizes, provide collection instructions. This does not prove physical delivery.</p><button className={button} disabled={busy || !secret.trim()} onClick={async () => { setBusy(true); try { const sealedPayload = await seal(JSON.stringify({ instructions: secret }), data.buyerKey!); setSecret(""); await act({ action: "deliver", sealedPayload }); } catch { setError("Could not encrypt the instructions."); } finally { setBusy(false); } }}>Seal & send instructions</button></>}
        {["giftcard", "esim"].includes(r.kind) && <p className="text-sm text-muted">The participant asks the agent to select a package. Then use the campaign’s approval and payment controls.</p>}
      </div>}
    </>}</>}
  </section>;
}
