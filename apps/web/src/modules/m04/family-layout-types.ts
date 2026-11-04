import { z } from "zod";

export const familyLayoutRequestSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), width: z.number().positive(), height: z.number().positive(), lane: z.number().int().min(-6).max(6) })).max(300),
  edges: z.array(z.object({ id: z.string(), source: z.string(), target: z.string() }))
});
export type FamilyLayoutRequest = z.infer<typeof familyLayoutRequestSchema>;
export const familyLayoutResultSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), nodes: z.array(z.object({ id: z.string(), x: z.number().finite(), y: z.number().finite() })).max(300) }),
  z.object({ ok: z.literal(false) })
]);
export type FamilyLayoutResult = z.infer<typeof familyLayoutResultSchema>;
