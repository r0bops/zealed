import { z } from "zod";
const text = z.string().trim().min(1).max(240);
export const taskInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("quiz"), title: text, options: z.array(text).min(2).max(6), answer: z.number().int().min(0).max(5) }).refine(t => t.answer < t.options.length),
  z.object({ kind: z.literal("social"), title: text, instructions: text }),
  z.object({ kind: z.literal("custom"), title: text, instructions: text }),
]);
export const prizeInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("giftcard"), title: text }),
  z.object({ kind: z.literal("esim"), title: text }),
  z.object({ kind: z.literal("zcash"), title: text, amountZat: z.number().int().min(1).max(100_000_000) }),
  z.object({ kind: z.literal("custom"), title: text, description: text }),
]);
export const programInput = z.object({ tasks: z.array(taskInput).min(1).max(10), prizes: z.array(prizeInput).min(1).max(8) });
export type ProgramInput = z.infer<typeof programInput>;
export type PublicTask = { id: string; kind: "quiz" | "social" | "custom"; title: string; options?: string[]; instructions?: string };
export type Prize = z.infer<typeof prizeInput> & { id: string };
export type PublicProgram = { tasks: PublicTask[]; prizes: Prize[] };
export type TaskResult = { task_id: string; status: "pending" | "approved" | "rejected"; evidence: string | null; attempts: number };
export type Redemption = { claim_id: string; prize_id: string; kind: Prize["kind"]; state: "requested" | "ready" | "acknowledged"; address: string | null; txid: string | null; sealed_payload: string | null };
export type ProgramStatus = PublicProgram & { results: TaskResult[]; eligible: boolean; redemption: Redemption | null; claimId: string; buyerKey?: string };
