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

  ADMIN_EMAIL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  ADMIN_PASSWORD: z
    .string()
    .optional()
    .transform((value) => value || undefined),

  ADMIN_PASSWORD_HASH: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  SESSION_TTL_HOURS: z.coerce
    .number()
    .positive()
    .max(720)
    .default(12),

  CORS_ORIGIN: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  EMAIL_FROM: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  EMAIL_API_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  EMAIL_API_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  // ---- SMTP delivery (e.g. a cPanel mailbox) ----
  // When SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are all set, email
  // is delivered through this SMTP server. SMTP takes precedence over
  // the HTTP email API when both are configured.
  SMTP_HOST: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  SMTP_PORT: z.coerce
    .number()
    .int()
    .positive()
    .max(65535)
    .default(465),

  SMTP_USER: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  SMTP_PASSWORD: z
    .string()
    .optional()
    .transform((value) => value || undefined),

  // Implicit TLS from the first byte. Leave unset to derive from the
  // port (true on 465). Set to "false" for a STARTTLS port like 587.
  SMTP_SECURE: z
    .enum(["true", "false"])
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : value === "true",
    ),

  // Verify the mail server's TLS certificate. Defaults to true. Set
  // to "false" only for a self-signed or otherwise unverifiable
  // certificate (e.g. a local mail server), accepting the tradeoff.
  SMTP_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .optional()
    .transform((value) =>
      value === undefined
        ? undefined
        : value === "true",
    ),

  // How often the automation scheduler scans for time-based work
  // (for example overdue invoices). Set to 0 to disable scheduling.
  AUTOMATION_SCAN_INTERVAL_MINUTES: z.coerce
    .number()
    .int()
    .min(0)
    .max(1440)
    .default(360),

  // Days without an update before an open lead is treated as quiet
  // and a follow-up draft is prepared.
  AUTOMATION_LEAD_QUIET_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(7),

  // Days without an update before an active project is treated as
  // stalled and a check-in draft is prepared.
  AUTOMATION_PROJECT_STALLED_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(14),

  // The public URL of this app, used for payment redirects and links.
  APP_URL: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  // ---- Payments (Stripe, optional) ----
  // When set, invoices can be paid by card through Stripe Checkout.
  STRIPE_SECRET_KEY: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  // The signing secret for the Stripe webhook endpoint.
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  // ---- Backups ----
  // Directory for database snapshots. Defaults to data/backups.
  BACKUP_DIR: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),

  // Hours between automatic backups. 0 disables scheduling (manual
  // backups still work). Default 24.
  BACKUP_INTERVAL_HOURS: z.coerce
    .number()
    .min(0)
    .max(168)
    .default(24),

  // How many recent snapshots to keep. Default 14.
  BACKUP_RETAIN: z.coerce
    .number()
    .int()
    .min(1)
    .max(365)
    .default(14),
});

export const config = schema.parse(process.env);