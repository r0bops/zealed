"use client";
import { field, buttonSecondary } from "./reward-ui";
import type { ProgramInput } from "@/lib/program-schema";
export const initialProgram: ProgramInput = {
  tasks: [{ kind: "quiz", title: "When should Zealed release a reward?", options: ["After broadcast", "After the exact payment is confirmed"], answer: 1 }],
  prizes: [{ kind: "esim", title: "Mobile data eSIM" }],
};
export function ProgramBuilder({ value, onChange }: { value: ProgramInput; onChange: (v: ProgramInput) => void }) {
  const update = (i: number, patch: Partial<ProgramInput["tasks"][number]>) => onChange({ ...value, tasks: value.tasks.map((t, j) => i === j ? { ...t, ...patch } as typeof t : t) });
  return <div className="space-y-6">
    <div><h3 className="text-lg font-semibold">Mission</h3><p className="text-base text-muted">Every step must be done. For a link or a custom step, you review what they submit.</p></div>
    {value.tasks.map((t, i) => <fieldset key={i} className="space-y-3 rounded-lg border border-line p-4"><legend className="px-2 text-sm text-muted">Step {i + 1}</legend>
      <label className="block space-y-2"><span>{t.kind === "quiz" ? "Question" : "Task title"}</span><input className={field} maxLength={240} value={t.title} onChange={e => update(i, { title: e.target.value })} /></label>
      {t.kind === "quiz" ? <><label className="block space-y-2"><span>Answer options (one per line, 2–6)</span><textarea className={field} rows={3} value={t.options.join("\n")} onChange={e => update(i, { options: e.target.value.split("\n"), answer: 0 })} /></label><label className="block space-y-2"><span>Correct answer · organizer only</span><select className={field} value={t.answer} onChange={e => update(i, { answer: Number(e.target.value) })}>{t.options.map((o, j) => <option key={j} value={j}>{o || `Option ${j + 1}`}</option>)}</select></label></> : <label className="block space-y-2"><span>Instructions and what evidence you will review</span><textarea className={field} maxLength={240} value={t.instructions} onChange={e => update(i, { instructions: e.target.value })} /></label>}
      <button type="button" className="min-h-11 text-sm underline" disabled={value.tasks.length === 1} onClick={() => onChange({ ...value, tasks: value.tasks.filter((_, j) => i !== j) })}>Remove task</button>
    </fieldset>)}
    <div className="flex flex-wrap gap-4">{(["quiz", "social", "custom"] as const).map(kind => <button key={kind} type="button" disabled={value.tasks.length >= 10} className={buttonSecondary} onClick={() => onChange({ ...value, tasks: [...value.tasks, kind === "quiz" ? { kind, title: "", options: ["", ""], answer: 0 } : { kind, title: "", instructions: "" }] })}>{kind === "quiz" ? "Add a question" : kind === "social" ? "Add a link step" : "Add a custom step"}</button>)}</div>
    <div><h3 className="text-lg font-semibold">Reward options</h3><p className="text-base text-muted">They choose one after the mission.</p></div>
    {(["giftcard", "esim", "zcash", "custom"] as const).map(kind => {
      const prize = value.prizes.find(p => p.kind === kind);
      const change = (patch: object) => onChange({ ...value, prizes: value.prizes.map(p => p.kind === kind ? { ...p, ...patch } : p) });
      return <fieldset key={kind} className="space-y-3 rounded-lg border border-line p-4"><label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={!!prize} onChange={e => onChange({ ...value, prizes: e.target.checked ? [...value.prizes, kind === "zcash" ? { kind, title: "Zcash testnet prize", amountZat: 1000000 } : kind === "custom" ? { kind, title: "Event reward", description: "Organizer-managed reward" } : { kind, title: kind === "esim" ? "Mobile data eSIM" : "Gift card" }] : value.prizes.filter(p => p.kind !== kind) })} /><span className="font-medium">{kind === "zcash" ? "Zcash testnet reward (no cash value)" : kind === "giftcard" ? "Gift card" : kind === "esim" ? "Mobile data" : "Custom reward"}</span></label>
        {prize && <><label className="block space-y-2"><span>Reward name</span><input className={field} maxLength={240} value={prize.title} onChange={e => change({ title: e.target.value })} /></label>{prize.kind === "zcash" && <label className="block space-y-2"><span>Testnet amount (100,000,000 = 1 TAZ, maximum 1 TAZ)</span><input className={field} type="number" min={1} max={100000000} step={1} value={prize.amountZat} onChange={e => change({ amountZat: Number(e.target.value) })} /></label>}{prize.kind === "custom" && <label className="block space-y-2"><span>Public description · no private codes</span><textarea className={field} maxLength={240} value={prize.description} onChange={e => change({ description: e.target.value })} /></label>}</>}
      </fieldset>;
    })}
  </div>;
}
