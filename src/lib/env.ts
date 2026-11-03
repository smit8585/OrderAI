import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_URL: z.string().default("http://localhost:3000"),
  ENCRYPTION_KEY: z.string().optional(),
  SHIPROCKET_EMAIL: z.string().optional(),
  SHIPROCKET_PASSWORD: z.string().optional(),
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  cached = parsed.data;
  return cached;
}
