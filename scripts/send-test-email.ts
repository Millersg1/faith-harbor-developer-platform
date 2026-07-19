import "dotenv/config";

import { SmtpEmailTransport } from "../src/communications/SmtpEmailTransport";

/**
 * Sends one real email through the configured SMTP server to verify
 * delivery. Usage:
 *
 *   npx tsx scripts/send-test-email.ts recipient@example.com
 *
 * The recipient defaults to ADMIN_EMAIL. Nothing is stored; this only
 * exercises the SMTP transport and prints the result.
 */
async function main(): Promise<void> {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    console.error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD in .env.",
    );
    process.exit(1);
  }

  const port = Number(process.env.SMTP_PORT ?? "465");

  const secure =
    process.env.SMTP_SECURE === undefined || process.env.SMTP_SECURE === ""
      ? undefined
      : process.env.SMTP_SECURE === "true";

  const from = process.env.EMAIL_FROM ?? user;
  const to = process.argv[2] ?? process.env.ADMIN_EMAIL;

  if (!to) {
    console.error(
      "No recipient. Pass one as an argument or set ADMIN_EMAIL.",
    );
    process.exit(1);
  }

  const rejectUnauthorized =
    process.env.SMTP_REJECT_UNAUTHORIZED === undefined ||
    process.env.SMTP_REJECT_UNAUTHORIZED === ""
      ? undefined
      : process.env.SMTP_REJECT_UNAUTHORIZED === "true";

  const transport = new SmtpEmailTransport({
    host,
    port,
    user,
    password,
    secure,
    rejectUnauthorized,
  });

  console.log(`Sending test email from ${from} to ${to} via ${host}:${port} ...`);

  const result = await transport.send({
    from,
    to,
    subject: "Faith Harbor OS — SMTP test",
    body:
      "This is a live test from Faith Harbor OS.\n\n" +
      "If you can read this, SMTP delivery is working and approved automation drafts will send.\n\n" +
      "Technology is our tool. People are our purpose. Christ is our foundation.",
  });

  console.log("RESULT:", JSON.stringify(result));
  process.exit(result.status === "sent" ? 0 : 1);
}

void main();
