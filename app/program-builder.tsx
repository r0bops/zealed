"use client";
import { field, buttonSecondary } from "./reward-ui";
import { Icon, type IconName } from "./ui-icon";
import { SOCIAL_PLATFORMS, type ProgramInput, type SocialPlatform, type TaskInput } from "@/lib/program-schema";
import { useState } from "react";
import { PRIZE_PRESETS } from "./prize-presets";
export const initialProgram: ProgramInput = {
  tasks: [{ kind: "quiz", title: "When should Zealed release a reward?", options: ["After broadcast", "After the exact payment is confirmed"], answer: 1 }],
  prizes: [{ kind: "giftcard", title: "Gift card" }, { kind: "esim", title: "Mobile data eSIM" }, { kind: "zcash", title: "Zcash prize", amountZat: 1_000_000 }],
};
const social = (platform: SocialPlatform, title: string, instructions: string): TaskInput => ({ kind: "social", platform, title, instructions, target: "" });
/** Event-themed starting points. Every field stays editable after it's added. */
const TEMPLATES: { group: string; icon: IconName; items: { label: string; task: TaskInput }[] }[] = [
  { group: "At the event", icon: "qr", items: [
    { label: "Venue check-in", task: { kind: "code", title: "Check in at the venue", instructions: "Get the check-in code at the registration desk.", code: "" } },
    { label: "Sponsor booth visit", task: { kind: "code", title: "Visit a sponsor booth", instructions: "Ask the team at the booth for today's code.", code: "" } },
    { label: "Talk or workshop", task: { kind: "code", title: "Attend a talk or workshop", instructions: "The speaker shares the code at the end of the session.", code: "" } },
    { label: "Keynote quiz", task: { kind: "quiz", title: "What was announced in the keynote?", options: ["", ""], answer: 0 } },
  ] },
  { group: "Social media", icon: "globe", items: [
    { label: "Follow on X", task: social("x", "Follow us on X", "Follow the account, then submit your X profile link.") },
    { label: "Repost the announcement", task: social("x", "Repost the event announcement", "Quote or repost it with the event hashtag, then submit the link to your post.") },
    { label: "Post an event photo", task: social("x", "Post a photo from the event", "Share a photo with the event hashtag, then submit the link to your post.") },
    { label: "Join Telegram", task: social("telegram", "Join the Telegram group", "Join the group, then submit your Telegram profile link (t.me/yourname).") },
    { label: "Join Discord", task: social("discord", "Join the Discord server", "Join the server, then submit your Discord profile link or a public screenshot link.") },
    { label: "Star on GitHub", task: social("github", "Star our GitHub repository", "Star the repository, then submit your GitHub profile link.") },
    { label: "Follow on LinkedIn", task: social("linkedin", "Follow us on LinkedIn", "Follow the page, then submit your LinkedIn profile link.") },
    { label: "Follow on Farcaster", task: social("farcaster", "Follow us on Farcaster", "Follow the account, then submit your Farcaster profile link.") },
  ] },
  { group: "Build and share", icon: "list", items: [
    { label: "Submit a project", task: { kind: "custom", title: "Submit your hackathon project", instructions: "Submit the public link to your repository or demo." } },
    { label: "Write a recap", task: { kind: "custom", title: "Write a recap of the event", instructions: "Publish a short blog post or thread about the event, then submit its link." } },
  ] },
  { group: "Start blank", icon: "plus", items: [
    { label: "Quiz", task: { kind: "quiz", title: "", options: ["", ""], answer: 0 } },
    { label: "Secret code", task: { kind: "code", title: "", instructions: "", code: "" } },
    { label: "Social action", task: social("x", "", "") },
    { label: "Custom task", task: { kind: "custom", title: "", instructions: "" } },
  ] },
];
const kindLabel = (t: TaskInput) => t.kind === "quiz" ? "Quiz · checked instantly" : t.kind === "code" ? "Secret code · checked instantly" : t.kind === "social" ? `${SOCIAL_PLATFORMS[t.platform ?? "other"].label} · you review the evidence` : "Custom task · you review the evidence";
function ZcashAmount({ amountZat, onChange }: { amountZat: number; onChange: (n: number) => void }) {
  const [amount, setAmount] = useState(String(amountZat / 1e8));
  function update(v: string) {
    setAmount(v);
    onChange(/^\d+(\.\d{0,8})?$/.test(v) ? Math.round(Number(v) * 1e8) : 0);
  }
  return <div className="space-y-3"><label className="block space-y-2"><span>Prize amount (TAZ)</span><input className={field} type="text" inputMode="decimal" value={amount} onChange={e => update(e.target.value)} aria-invalid={!Number.isSafeInteger(amountZat) || amountZat < 1 || amountZat > 1e8} /></label><div className="flex flex-wrap gap-2">{["0.001", "0.01", "0.1"].map(n => <button key={n} type="button" className={buttonSecondary} aria-pressed={Number(amount) === Number(n)} onClick={() => update(n)}>{n} TAZ</button>)}</div><p className="workspace-note">Testnet coins only. Maximum 1 TAZ.</p></div>;
}

export function ProgramBuilder({ value, onChange, section, presets = false }: { value: ProgramInput; onChange: (v: ProgramInput) => void; section?: "missions" | "prizes"; presets?: boolean }) {
  const update = (i: number, patch: Partial<TaskInput>) => onChange({ ...value, tasks: value.tasks.map((t, j) => i === j ? { ...t, ...patch } as typeof t : t) });
  const full = value.tasks.length >= 10;
  return <div className="space-y-6">
    {section !== "prizes" && <><p className="workspace-note">Every mission is required. Quizzes and secret codes are checked instantly; you review the evidence for social and custom tasks.</p>
    {value.tasks.map((t, i) => <fieldset key={i} className="workspace-builder-task"><legend>Task {i + 1} · {kindLabel(t)}</legend>
      <label className="block space-y-2"><span>{t.kind === "quiz" ? "Question" : "Task title"}</span><input className={field} maxLength={240} value={t.title} onChange={e => update(i, { title: e.target.value })} /></label>
      {t.kind === "quiz" && <><label className="block space-y-2"><span>Answer options (one per line, 2–6)</span><textarea className={field} rows={3} value={t.options.join("\n")} onChange={e => update(i, { options: e.target.value.split("\n"), answer: 0 })} /></label><label className="block space-y-2"><span>Correct answer · organizer only</span><select className={field} value={t.answer} onChange={e => update(i, { answer: Number(e.target.value) })}>{t.options.map((o, j) => <option key={j} value={j}>{o || `Option ${j + 1}`}</option>)}</select></label></>}
      {t.kind === "code" && <><label className="block space-y-2"><span>Where participants get the code</span><textarea className={field} maxLength={240} value={t.instructions} onChange={e => update(i, { instructions: e.target.value })} /></label><label className="block space-y-2"><span>Secret code · organizer only</span><input className={field} maxLength={40} autoComplete="off" spellCheck={false} value={t.code} onChange={e => update(i, { code: e.target.value })} placeholder="e.g. SHIELDED-42" /></label><p className="workspace-note">4–40 characters, matched ignoring case, spaces and dashes. Zealed keeps only a keyed hash, and participants get five tries. Anyone who hears the code can use it, so announce it only in the room.</p></>}
      {t.kind === "social" && <div className="grid gap-4 sm:grid-cols-2"><label className="block space-y-2"><span>Platform</span><select className={field} value={t.platform ?? "other"} onChange={e => update(i, { platform: e.target.value as SocialPlatform })}>{(Object.keys(SOCIAL_PLATFORMS) as SocialPlatform[]).map(p => <option key={p} value={p}>{SOCIAL_PLATFORMS[p].label}</option>)}</select></label><label className="block space-y-2"><span>Link to open · optional</span><input className={field} type="url" inputMode="url" maxLength={300} value={t.target ?? ""} onChange={e => update(i, { target: e.target.value.trim() })} placeholder={SOCIAL_PLATFORMS[t.platform ?? "other"].hosts[0] ? `https://${SOCIAL_PLATFORMS[t.platform ?? "other"].hosts[0]}/…` : "https://…"} /></label></div>}
      {(t.kind === "social" || t.kind === "custom") && <><label className="block space-y-2"><span>Instructions and what evidence you will review</span><textarea className={field} maxLength={240} value={t.instructions} onChange={e => update(i, { instructions: e.target.value })} /></label>{t.kind === "social" && t.platform !== "other" && <p className="workspace-note">{t.platform === "discord" ? "Discord has no public member pages, so any public link is accepted. You decide when you review." : `Participants must submit a link on ${SOCIAL_PLATFORMS[t.platform ?? "other"].hosts.join(" or ")}. You still review it; Zealed doesn't log in to ${SOCIAL_PLATFORMS[t.platform ?? "other"].label}.`}</p>}</>}
      <button type="button" className="min-h-11 self-start text-sm underline" disabled={value.tasks.length === 1} onClick={() => onChange({ ...value, tasks: value.tasks.filter((_, j) => i !== j) })}>Remove task</button>
    </fieldset>)}
    <section className="space-y-5" aria-label="Add a mission">
      <div><h3 className="text-lg">Add a mission</h3><p className="workspace-note mt-1">{full ? "You've reached the limit of 10 missions." : "Pick a starting point for your event, then edit the details."}</p></div>
      {TEMPLATES.map(g => <div key={g.group} className="space-y-2"><p className="flex items-center gap-2 text-sm font-medium"><Icon name={g.icon} width={16} className="text-muted" />{g.group}</p>
        <div className="flex flex-wrap gap-2">{g.items.map(item => <button key={item.label} type="button" disabled={full} className={buttonSecondary} onClick={() => onChange({ ...value, tasks: [...value.tasks, structuredClone(item.task)] })}><Icon name="plus" />{item.label}</button>)}</div>
      </div>)}
    </section>
    </>}{section !== "missions" && <><p className="workspace-note">Offer the prizes that fit your event. Each participant chooses one after completing every task.</p>
    {(["giftcard", "esim", "zcash", "custom"] as const).map(kind => {
      const prize = value.prizes.find(p => p.kind === kind);
      const change = (patch: object) => onChange({ ...value, prizes: value.prizes.map(p => p.kind === kind ? { ...p, ...patch } : p) });
      return <fieldset key={kind} className="min-w-0"><label className="workspace-choice workspace-prize-option"><Icon name={kind === "zcash" ? "wallet" : kind === "esim" ? "globe" : "gift"} /><input type="checkbox" checked={!!prize} onChange={e => onChange({ ...value, prizes: e.target.checked ? [...value.prizes, kind === "zcash" ? { kind, title: "Zcash prize", amountZat: 1000000 } : kind === "custom" ? { kind, title: "Event reward", description: "Organizer-managed reward" } : { kind, title: PRIZE_PRESETS[kind].title }] : value.prizes.filter(p => p.kind !== kind) })} /><span><span className="block font-medium">{PRIZE_PRESETS[kind].title}</span><span className="mt-1 block text-xs text-muted">{kind === "zcash" ? "Send directly to the participant’s testnet wallet" : presets || kind === "custom" ? PRIZE_PRESETS[kind].description : "Choose products in the catalog below"}</span></span></label>
        {prize && <div className="workspace-prize-config">
          {prize.kind === "zcash" && <ZcashAmount amountZat={prize.amountZat} onChange={amountZat => change({ amountZat })} />}
          <details open={prize.kind === "custom" ? true : undefined}><summary className="min-h-11 cursor-pointer py-3 text-sm text-muted">{prize.kind === "custom" ? "Reward details" : "Edit prize name"}</summary><label className="block space-y-2"><span>Prize name</span><input className={field} maxLength={240} value={prize.title} onChange={e => change({ title: e.target.value })} /></label>{prize.kind === "custom" && <label className="mt-4 block space-y-2"><span>Public description · no private codes</span><textarea className={field} maxLength={240} value={prize.description} onChange={e => change({ description: e.target.value })} /></label>}</details>
        </div>}
      </fieldset>;
    })}</>}
  </div>;
}
