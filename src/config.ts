import "dotenv/config";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const packageJsonPath = resolve(process.cwd(), "package.json");
const packageJson = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
) as {
  version?: string;
};

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
    .default(packageJson.version ?? "0.0.0"),

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

  WHM_HOST: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  WHM_API_TOKEN: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  WHM_USER: z
    .string()
    .trim()
    .default("root"),

  WHM_PORT: z.coerce
    .number()
    .int()
    .positive()
    .max(65535)
    .default(2087),
});

export const config = schema.parse(process.env);