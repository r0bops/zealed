import { z } from "zod";
const text = z.string().trim().min(1).max(240);

/** Social platforms an organizer can point a task at. `hosts` limits both the organizer's link and the participant's evidence link. */
export const SOCIAL_PLATFORMS = {
  x: { label: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
  telegram: { label: "Telegram", hosts: ["t.me", "telegram.me"] },
  discord: { label: "Discord", hosts: ["discord.com", "discord.gg"] },
  github: { label: "GitHub", hosts: ["github.com"] },
  linkedin: { label: "LinkedIn", hosts: ["linkedin.com"] },
  farcaster: { label: "Farcaster", hosts: ["farcaster.xyz", "warpcast.com"] },
  instagram: { label: "Instagram", hosts: ["instagram.com"] },
  youtube: { label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  other: { label: "Other site", hosts: [] },
} as const satisfies Record<string, { label: string; hosts: readonly string[] }>;
export type SocialPlatform = keyof typeof SOCIAL_PLATFORMS;
const platforms = Object.keys(SOCIAL_PLATFORMS) as [SocialPlatform, ...SocialPlatform[]];

/** True when `url` is on one of the platform's hosts (or any URL for "other"). */
export function onPlatform(platform: SocialPlatform | undefined, url: string): boolean {
  const hosts: readonly string[] = SOCIAL_PLATFORMS[platform ?? "other"].hosts;
  if (!hosts.length) return true;
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  return hosts.some(h => host === h || host.endsWith(`.${h}`));
}

/** Check-in, booth and session codes compare case-insensitively, ignoring spaces and dashes. */
export const normalizeCode = (code: string) => code.normalize("NFKC").toLowerCase().replace(/[\s_-]+/g, "");

// An empty string means "no link" so the builder can keep a controlled input.
const optionalLink = z.union([z.literal(""), z.url({ protocol: /^https$/ }).max(300)]).optional();
export const taskInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quiz"), title: text, options: z.array(text).min(2).max(6), answer: z.number().int().min(0).max(5) }).refine(t => t.answer < t.options.length),
  z.object({ kind: z.literal("code"), title: text, instructions: text, code: z.string().trim().min(4).max(40).refine(c => normalizeCode(c).length >= 4) }),
  z.object({ kind: z.literal("social"), title: text, instructions: text, platform: z.enum(platforms).optional(), target: optionalLink })
    .refine(t => !t.target || onPlatform(t.platform, t.target), { path: ["target"] }),
  z.object({ kind: z.literal("custom"), title: text, instructions: text }),
]);
export type TaskInput = z.infer<typeof taskInput>;

/** A plain-language reason a task in the builder isn't ready yet, or null when it is. */
export function taskProblem(t: TaskInput, n: number): string | null {
  if (taskInput.safeParse(t).success) return null;
  const at = `Task ${n}`;
  if (!t.title?.trim()) return `${at} needs a title.`;
  if (t.kind === "quiz") return `${at}: a quiz needs 2–6 non-empty answer options and a correct answer.`;
  if (t.kind === "code") return !t.instructions?.trim() ? `${at}: say where participants get the code.` : `${at}: set a secret code of 4–40 characters.`;
  if (t.kind === "social" && t.target?.trim()) return `${at}: the link must be an https:// address on ${SOCIAL_PLATFORMS[t.platform ?? "other"].label}.`;
  return `${at} needs instructions that say what evidence to submit.`;
}

export const prizeInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("giftcard"), title: text }),
  z.object({ kind: z.literal("esim"), title: text }),
  z.object({ kind: z.literal("zcash"), title: text, amountZat: z.number().int().min(1).max(100_000_000) }),
  z.object({ kind: z.literal("custom"), title: text, description: text }),
]);
export const programInput = z.object({ tasks: z.array(taskInput).min(1).max(10), prizes: z.array(prizeInput).min(1).max(8) });
export type ProgramInput = z.infer<typeof programInput>;
export type PublicTask = { id: string; kind: "quiz" | "code" | "social" | "custom"; title: string; options?: string[]; instructions?: string; platform?: SocialPlatform; target?: string };
export type Prize = z.infer<typeof prizeInput> & { id: string };
export type PublicProgram = { tasks: PublicTask[]; prizes: Prize[] };
export type TaskResult = { task_id: string; status: "pending" | "approved" | "rejected"; evidence: string | null; attempts: number };
export type Redemption = { claim_id: string; prize_id: string; kind: Prize["kind"]; state: "requested" | "ready" | "acknowledged"; address: string | null; txid: string | null; sealed_payload: string | null };
export type ProgramStatus = PublicProgram & { results: TaskResult[]; eligible: boolean; redemption: Redemption | null; claimId: string; buyerKey?: string };
