/**
 * Fail-closed PREFLIGHT for the isolated NameSilo-OTE + Stripe-test-mode contract
 * acceptance harness (Stage 12A preparation).
 *
 * This validator decides whether it is SAFE to run domain contract acceptance.
 * It is deliberately paranoid: it refuses to green-light unless EVERY safety
 * property is positively proven, and it treats anything that looks like a
 * production or live-provider value as a hard blocker. It performs NO network
 * calls and NO mutations — it only classifies the environment.
 *
 * A PASS means: an explicit acknowledgment is set; the Stripe key is a `sk_test_`
 * key (a `sk_live_` key is REFUSED); a Stripe test webhook secret is present; the
 * NameSilo endpoint is positively identified as OTE (the live host is REFUSED); an
 * OTE API key + a test-only encryption keyring are present; the PostgreSQL target
 * is an explicitly-confirmed disposable schema (never `public`, never the named
 * production database); the harness port is not a production port; the bind host
 * is loopback; and every domain MUTATION path is disabled.
 *
 * The report is SANITIZED: it reports classifications only (present yes/no, test
 * vs live, ote vs live vs unknown, disposable vs production) and NEVER echoes a
 * key, secret, full URL, contact, or provider response.
 */

export type PreflightEnv = Record<string, string | undefined>;

export interface PreflightCheck {
  name: string;
  status: "pass" | "blocked";
  /** Sanitized classification only — never a secret/URL/PII. */
  info: string;
}

export interface PreflightReport {
  checks: PreflightCheck[];
  readiness: "PASS" | "BLOCKED";
  blockers: string[];
}

/** Ports that belong to the running production services — never the harness. */
const PRODUCTION_PORTS = new Set(["3300", "3200"]);
/** The documented NameSilo OTE (sandbox) host. */
const OTE_HOST = "ote.namesilo.com";
/** The NameSilo LIVE host — must never be used by the acceptance harness. */
const LIVE_HOSTS = new Set(["www.namesilo.com", "namesilo.com"]);

const truthy = (v: string | undefined) =>
  ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase());

function hostOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host.toLowerCase();
  } catch {
    return null;
  }
}

export function preflightOteAcceptance(env: PreflightEnv): PreflightReport {
  const checks: PreflightCheck[] = [];
  const add = (name: string, ok: boolean, info: string) =>
    checks.push({ name, status: ok ? "pass" : "blocked", info });

  // 1. Explicit acknowledgment.
  add("acknowledgment", env.RUN_DOMAIN_OTE_ACCEPTANCE === "1",
    env.RUN_DOMAIN_OTE_ACCEPTANCE === "1" ? "acknowledged" : "RUN_DOMAIN_OTE_ACCEPTANCE!=1");

  // 2. Stripe key: must be sk_test_; sk_live_ is REFUSED.
  const sk = (env.STRIPE_DOMAIN_TEST_SECRET_KEY ?? "").trim();
  if (!sk) add("stripe_secret", false, "absent");
  else if (/^sk_live_/.test(sk)) add("stripe_secret", false, "LIVE_key_refused");
  else if (/^sk_test_/.test(sk)) add("stripe_secret", true, "test");
  else add("stripe_secret", false, "unrecognized");

  // 3. Stripe test webhook secret.
  add("stripe_webhook_secret", Boolean((env.STRIPE_DOMAIN_TEST_WEBHOOK_SECRET ?? "").trim()),
    (env.STRIPE_DOMAIN_TEST_WEBHOOK_SECRET ?? "").trim() ? "present" : "absent");

  // 4. NameSilo endpoint: positively OTE, or REFUSED.
  const nsHost = hostOf(env.NAMESILO_OTE_ENDPOINT);
  if (!nsHost) add("namesilo_endpoint", false, "absent_or_unparseable");
  else if (LIVE_HOSTS.has(nsHost)) add("namesilo_endpoint", false, "LIVE_endpoint_refused");
  else if (nsHost === OTE_HOST || nsHost.endsWith(`.${OTE_HOST}`)) add("namesilo_endpoint", true, "ote");
  else add("namesilo_endpoint", false, "unknown_endpoint_refused");

  // 5. NameSilo OTE API key present (identity proven at runtime by the OTE host).
  add("namesilo_ote_key", Boolean((env.NAMESILO_OTE_API_KEY ?? "").trim()),
    (env.NAMESILO_OTE_API_KEY ?? "").trim() ? "present" : "absent");

  // 6. Test-only encryption keyring (contact + blind index).
  const keyring = Boolean((env.DOMAIN_CONTACT_ENC_KEY_V1 ?? "").trim()) && Boolean((env.DOMAIN_BLIND_INDEX_KEY_V1 ?? "").trim());
  add("encryption_keyring", keyring, keyring ? "present_test_only" : "absent");

  // 7. Disposable PostgreSQL: confirmed, non-public schema, not the production db.
  const pgUrl = (env.OTE_PG_URL ?? "").trim();
  const schema = (env.OTE_PG_SCHEMA ?? "").trim();
  const confirmed = truthy(env.OTE_CONFIRM_DISPOSABLE);
  const prodDb = (env.PRODUCTION_PG_DATABASE ?? "").trim();
  let dbOk = false;
  let dbInfo = "missing";
  if (!pgUrl || !schema) dbInfo = "missing";
  else if (!confirmed) dbInfo = "not_confirmed_disposable";
  else if (schema.toLowerCase() === "public") dbInfo = "public_schema_refused";
  else if (prodDb && pgUrl.toLowerCase().includes(prodDb.toLowerCase())) dbInfo = "matches_production_db_refused";
  else { dbOk = true; dbInfo = "disposable_schema"; }
  add("disposable_pg", dbOk, dbInfo);

  // 8. Port isolation.
  const port = (env.OTE_HARNESS_PORT ?? "").trim();
  add("port_isolation", Boolean(port) && !PRODUCTION_PORTS.has(port),
    !port ? "missing" : PRODUCTION_PORTS.has(port) ? "production_port_refused" : "isolated");

  // 9. Loopback bind only.
  const bind = (env.OTE_BIND_HOST ?? "127.0.0.1").trim().toLowerCase();
  const loopback = bind === "127.0.0.1" || bind === "localhost" || bind === "::1";
  add("loopback_bind", loopback, loopback ? "loopback" : "non_loopback_refused");

  // 10. Every mutation path disabled (full mode / production purchasing REFUSED).
  const mode = (env.DOMAIN_OPERATIONS_MODE ?? "").trim().toLowerCase();
  const mutationsOff = (mode === "" || mode === "disabled" || mode === "reconcile_only") && !truthy(env.DOMAIN_PURCHASING_ENABLED);
  add("mutations_disabled", mutationsOff, mutationsOff ? "disabled" : "mutation_enabled_refused");

  const blockers = checks.filter((c) => c.status === "blocked").map((c) => c.name);
  return { checks, readiness: blockers.length === 0 ? "PASS" : "BLOCKED", blockers };
}

/** A one-line, secret-free classification per check + overall readiness. */
export function describePreflight(report: PreflightReport): string[] {
  return [
    ...report.checks.map((c) => `  [${c.status === "pass" ? "OK " : "BLOCK"}] ${c.name}: ${c.info}`),
    `READINESS: ${report.readiness}${report.blockers.length ? ` (blocked: ${report.blockers.join(", ")})` : ""}`,
  ];
}
