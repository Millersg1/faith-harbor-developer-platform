import "dotenv/config";

import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .max(65535)
    .default(3000),

  APP_NAME: z
    .string()
    .min(1)
    .default("Faith Harbor OS"),

  APP_VERSION: z
    .string()
    .min(1)
    .default("4.0.0"),

  DATABASE_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  OPENAI_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  OPENAI_ORGANIZATION: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  OPENAI_PROJECT: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  BLACKBOX_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
});

export const config = schema.parse(process.env);