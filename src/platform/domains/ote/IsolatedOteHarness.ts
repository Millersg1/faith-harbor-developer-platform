/**
 * Isolated NON-PRODUCTION harness for NameSilo-OTE + Stripe-test contract
 * acceptance (Stage 12A). It is a SEPARATE process from the production service:
 *
 *  - it takes an EXPLICIT env object (never reads production process.env directly);
 *  - it runs {@link preflightOteAcceptance} and REFUSES to start unless PASS;
 *  - it binds to LOOPBACK only, on a NON-production port;
 *  - it starts with EVERY domain mutation disabled (DOMAIN_OPERATIONS_MODE
 *    disabled → no workers claim/submit/charge/refund);
 *  - it uses a disposable PostgreSQL SCHEMA (never production `public`);
 *  - it exposes only a sanitized preflight/health surface — no secrets, URLs,
 *    contacts, EPP codes, or raw provider responses;
 *  - it wires no email transport, so it cannot send real mail, and it touches no
 *    cPanel/Apache/DNS/production-Stripe/production-NameSilo object.
 *
 * With no OTE/test credentials present the harness reports BLOCKED and cannot be
 * started — the correct, honest state until credentials are provisioned.
 */

import { buildDomainRuntime } from "../domainIntegration";
import {
  describePreflight,
  preflightOteAcceptance,
  type PreflightEnv,
  type PreflightReport,
} from "./oteAcceptancePreflight";

export interface StartedHarness {
  port: number;
  stop: () => Promise<void>;
}

export class HarnessBlockedError extends Error {
  constructor(readonly report: PreflightReport) {
    super(`OTE acceptance harness is BLOCKED (blockers: ${report.blockers.join(", ")}).`);
    this.name = "HarnessBlockedError";
  }
}

export interface IsolatedOteHarness {
  readonly readiness: "PASS" | "BLOCKED";
  readonly report: PreflightReport;
  /** Sanitized, secret-free lines for the preflight command. */
  describe(): string[];
  /** Starts the loopback harness. THROWS HarnessBlockedError unless PASS. */
  start(): Promise<StartedHarness>;
}

/** Maps the isolated OTE env to the domain-runtime env (test values only). */
function toRuntimeEnv(env: PreflightEnv): PreflightEnv {
  return {
    ...env,
    // Never inherit a production registrar/purchasing/mode.
    DOMAIN_REGISTRAR_MODE: "namesilo_sandbox",
    DOMAIN_PURCHASING_ENABLED: "false",
    DOMAIN_PREMIUM_PURCHASING_ENABLED: "false",
    DOMAIN_INCOMING_TRANSFERS_ENABLED: "false",
    DOMAIN_OPERATIONS_MODE: "disabled",
    NAMESILO_SANDBOX_API_KEY: env.NAMESILO_OTE_API_KEY,
    STRIPE_DOMAIN_SECRET_KEY: env.STRIPE_DOMAIN_TEST_SECRET_KEY,
    STRIPE_DOMAIN_WEBHOOK_SECRET: env.STRIPE_DOMAIN_TEST_WEBHOOK_SECRET,
  };
}

export function createIsolatedOteHarness(env: PreflightEnv): IsolatedOteHarness {
  const report = preflightOteAcceptance(env);
  return {
    readiness: report.readiness,
    report,
    describe: () => describePreflight(report),
    async start(): Promise<StartedHarness> {
      if (report.readiness !== "PASS") throw new HarnessBlockedError(report);

      // Lazy imports: keep the module graph free of pg/http until a green
      // preflight actually starts the harness.
      const httpMod = await import("node:http");
      const pgMod = await import("pg");

      const schema = (env.OTE_PG_SCHEMA ?? "").trim();
      const pool = new pgMod.Pool({
        connectionString: env.OTE_PG_URL,
        options: `-c search_path=${schema}`,
      });
      const db = { query: (text: string, params?: unknown[]) => pool.query(text, params) };
      // Ensure the disposable schema exists; NEVER touch public.
      await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

      // Build the runtime (webhook + sagas) against OTE + Stripe test. Workers
      // stay OFF (mode disabled) — no mutation runs until acceptance drives it.
      const runtime = buildDomainRuntime(toRuntimeEnv(env), db as never);

      const bind = (env.OTE_BIND_HOST ?? "127.0.0.1").trim();
      const port = Number(env.OTE_HARNESS_PORT);
      const server = httpMod.createServer((req, res) => {
        // Only a sanitized preflight/health surface — nothing sensitive.
        if (req.url === "/preflight") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ readiness: report.readiness, checks: report.checks }));
          return;
        }
        if (req.url === "/health") {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ status: "ok", isolated: true, mutations: "disabled", runtime: runtime ? "configured" : "absent" }));
          return;
        }
        res.statusCode = 404;
        res.end("{}");
      });
      await new Promise<void>((resolve) => server.listen(port, bind, resolve));
      return {
        port,
        stop: async () => {
          await new Promise<void>((r) => server.close(() => r()));
          await pool.end().catch(() => undefined);
        },
      };
    },
  };
}
