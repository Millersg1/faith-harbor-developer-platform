#!/usr/bin/env node
/**
 * Redacted preflight command for the isolated OTE acceptance harness (Stage 12A).
 *
 * Loads an ISOLATED, non-production env file (path as the first argument, or
 * $OTE_ENV_FILE) and prints ONLY sanitized classifications + readiness — never a
 * key, secret, full URL, contact, or provider response. Makes NO network calls
 * and NO mutations. Exits 0 on PASS, 1 on BLOCKED.
 *
 *   npm run build && node scripts/ote-preflight.mjs ./ote-acceptance.env
 *
 * It never reads the ambient/production process.env: an env file must be given.
 */
import { readFileSync } from "node:fs";

const { preflightOteAcceptance, describePreflight } = await import(
  "../dist/platform/domains/ote/oteAcceptancePreflight.js"
);

const file = process.argv[2] ?? process.env.OTE_ENV_FILE;
if (!file) {
  console.error("Usage: node scripts/ote-preflight.mjs <isolated-env-file>");
  console.error("(An explicit non-production env file is required; the production env is never read.)");
  process.exit(2);
}

/** Parse KEY=VALUE lines; values are used only to CLASSIFY, never printed. */
function parseEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return env;
}

let env;
try {
  env = parseEnv(readFileSync(file, "utf8"));
} catch {
  console.error(`Could not read env file: ${file}`);
  process.exit(2);
}

const report = preflightOteAcceptance(env);
console.log("OTE acceptance preflight (redacted — classifications only):");
for (const line of describePreflight(report)) console.log(line);
process.exit(report.readiness === "PASS" ? 0 : 1);
