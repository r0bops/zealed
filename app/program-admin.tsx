"use client";
import { useEffect, useState } from "react";
import { buttonSecondary, field, request } from "./reward-ui";
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
  return <section className="space-y-4 border-t border-line pt-4"><button type="button" className={buttonSecondary} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>{expanded ? "Close review" : "Review the mission"}</button>
    {expanded && <>{error && <p role="alert" className="text-danger">{error}</p>}{!data ? <p className="text-base text-muted">No one has joined yet.</p> : <>
      {data.tasks.map(t => { const result = data.results.find(item => item.task_id === t.id); return <div key={t.id} className="space-y-2 rounded-lg border border-line p-4"><h4 className="font-medium">{t.title}</h4><p className="text-sm text-muted">{result?.status === "approved" ? "Approved" : result?.status === "pending" ? "Waiting for you" : result?.status === "rejected" ? "Not accepted" : "Not submitted"}</p>{result?.evidence && <a href={result.evidence} target="_blank" rel="noreferrer" className="block break-all text-base underline">Open their link</a>}{result?.status === "pending" && <div className="flex flex-wrap gap-4"><button type="button" disabled={busy} className={buttonSecondary} onClick={() => void act({ action: "review", taskId: t.id, approved: true })}>Approve this step</button><button type="button" disabled={busy} className={buttonSecondary} onClick={() => void act({ action: "review", taskId: t.id, approved: false })}>Ask them to try again</button></div>}</div>; })}
      <p className="text-base">{data.eligible ? "All steps are approved. They can pick one reward." : "The reward stays locked until every step is approved."}</p>
      {r && <div className="space-y-3 border-t border-line pt-4"><h4 className="font-semibold">{prize?.title}</h4><p className="text-base">{r.state === "ready" ? "Sent. Waiting for them to confirm." : r.state === "requested" ? "Waiting for you to send it." : r.state === "acknowledged" ? "They confirmed it arrived." : r.state}</p>
        {r.kind === "zcash" && r.state === "requested" && <><p className="text-base text-muted">Check that this is their Zcash testnet address, approve it once, then save the transaction reference. Saving it does not by itself prove it arrived.</p><p className="break-all font-mono text-xs">{r.address}</p><NoirPayButton to={r.address!} amountZec={amount} memo={memo} simulatedDetection={false} onSent={setTxid} variant="link" /><a className={buttonSecondary} href={uri}>Open in another wallet</a><label className="flex flex-col gap-2 text-base">Transaction reference<input className={field} value={txid} maxLength={64} onChange={e => setTxid(e.target.value)} /></label><button type="button" className={buttonSecondary} disabled={busy || !/^[a-f0-9]{64}$/.test(txid)} onClick={() => void act({ action: "deliver", txid })}>Save the reference</button></>}
        {r.kind === "custom" && r.state === "requested" && <><label className="flex flex-col gap-2 text-base">Private note or code for them<textarea className={field} maxLength={6000} value={secret} onChange={e => setSecret(e.target.value)} /></label><p className="text-sm text-muted">This is sealed in your browser for them. For a physical reward, say where to collect it. That does not prove they received it.</p><button type="button" className={buttonSecondary} disabled={busy || !secret.trim()} onClick={async () => { setBusy(true); try { const sealedPayload = await seal(JSON.stringify({ instructions: secret }), data.buyerKey!); setSecret(""); await act({ action: "deliver", sealedPayload }); } catch { setError("Could not seal the note."); } finally { setBusy(false); } }}>Send the note</button></>}
        {["giftcard", "esim"].includes(r.kind) && <p className="text-base text-muted">They’ll pick a package. Then use Approve this reward above.</p>}
      </div>}
    </>}</>}
  </section>;
}
