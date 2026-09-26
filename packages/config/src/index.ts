import { z } from "zod";

export const appEnvSchema = z.enum(["development", "test", "staging", "production"]);
export const dataModeSchema = z.enum(["demo", "real"]);

const baseSchema = z.object({
  APP_ENV: appEnvSchema,
  DATA_MODE: dataModeSchema,
  NEXT_PUBLIC_APP_URL: z.string().url()
});

export const publicEnvSchema = baseSchema.extend({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1)
});

export const serverEnvSchema = publicEnvSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_DB_URL: z.string().min(1),
  CSRF_SECRET: z.string().min(16)
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  return publicEnvSchema.parse(source);
}

export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const parsed = serverEnvSchema.parse(source);
  if (parsed.APP_ENV === "production" && parsed.DATA_MODE === "real" && parsed.NEXT_PUBLIC_APP_URL.includes("localhost")) {
    throw new Error("Production real mode cannot use a localhost app URL");
  }
  return parsed;
}
