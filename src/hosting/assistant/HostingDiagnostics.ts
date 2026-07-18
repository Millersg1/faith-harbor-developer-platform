import {
  resolve4,
  resolveMx,
} from "node:dns/promises";

import type { HostingAccountRecord } from "../HostingAccountRecord";

export type DiagnosticSeverity =
  | "info"
  | "warning"
  | "critical";

export interface DiagnosticFinding {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
}

/**
 * DNS lookups the assistant depends on. Injectable so the
 * diagnostics can be tested without real network access.
 */
export interface DnsResolver {
  resolveA(
    domain: string,
  ): Promise<string[]>;

  resolveMx(
    domain: string,
  ): Promise<
    { exchange: string; priority: number }[]
  >;
}

/**
 * Real DNS resolver backed by Node's DNS module.
 */
export const nodeDnsResolver: DnsResolver = {
  async resolveA(domain) {
    return resolve4(domain);
  },

  async resolveMx(domain) {
    const records =
      await resolveMx(domain);

    return records.map((record) => ({
      exchange: record.exchange,
      priority: record.priority,
    }));
  },
};

/**
 * Deterministic checks against the stored account record.
 * These never touch the network.
 */
export function runAccountChecks(
  account: HostingAccountRecord,
): DiagnosticFinding[] {
  const findings: DiagnosticFinding[] =
    [];

  if (account.status === "suspended") {
    findings.push({
      code: "ACCOUNT_SUSPENDED",
      severity: "critical",
      message:
        "The account is suspended, so the site and email are offline.",
    });
  }

  if (account.status === "pending") {
    findings.push({
      code: "ACCOUNT_PENDING",
      severity: "warning",
      message:
        "The account is still pending and may not be provisioned yet.",
    });
  }

  if (
    account.diskLimitMb &&
    account.diskUsedMb !== undefined &&
    account.diskLimitMb > 0
  ) {
    const percent =
      (account.diskUsedMb /
        account.diskLimitMb) *
      100;

    if (percent >= 95) {
      findings.push({
        code: "DISK_CRITICAL",
        severity: "critical",
        message:
          `Disk usage is at ${Math.round(
            percent,
          )}%. Uploads, email, and databases may fail.`,
      });
    } else if (percent >= 80) {
      findings.push({
        code: "DISK_WARNING",
        severity: "warning",
        message:
          `Disk usage is at ${Math.round(
            percent,
          )}%. Plan a cleanup or upgrade soon.`,
      });
    }
  }

  return findings;
}

const DNS_TIMEOUT_MS = 5000;

/**
 * Bounds a DNS lookup so an unavailable or slow resolver can never
 * hang a diagnosis request.
 */
function withTimeout<T>(
  promise: Promise<T>,
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error(
            "DNS lookup timed out.",
          ),
        );
      }, DNS_TIMEOUT_MS);

      if (
        typeof timer.unref ===
        "function"
      ) {
        timer.unref();
      }
    }),
  ]);
}

/**
 * Network checks for a domain's DNS. Failures and timeouts become
 * findings rather than thrown errors so a diagnosis always completes.
 */
export async function runDnsChecks(
  domain: string,
  resolver: DnsResolver,
): Promise<DiagnosticFinding[]> {
  // Both lookups are independent, so run them concurrently.
  const [aFinding, mxFinding] =
    await Promise.all([
      checkARecord(
        domain,
        resolver,
      ),
      checkMxRecord(
        domain,
        resolver,
      ),
    ]);

  return [
    aFinding,
    mxFinding,
  ].filter(
    (finding): finding is DiagnosticFinding =>
      finding !== null,
  );
}

async function checkARecord(
  domain: string,
  resolver: DnsResolver,
): Promise<DiagnosticFinding | null> {
  try {
    const records =
      await withTimeout(
        resolver.resolveA(domain),
      );

    if (records.length === 0) {
      return {
        code: "DNS_NO_A_RECORD",
        severity: "critical",
        message:
          "No A record was found, so the website will not resolve.",
      };
    }

    return null;
  } catch {
    return {
      code: "DNS_A_LOOKUP_FAILED",
      severity: "critical",
      message:
        "The A record lookup failed. The domain may be misconfigured or unregistered.",
    };
  }
}

async function checkMxRecord(
  domain: string,
  resolver: DnsResolver,
): Promise<DiagnosticFinding | null> {
  try {
    const records =
      await withTimeout(
        resolver.resolveMx(domain),
      );

    if (records.length === 0) {
      return {
        code: "DNS_NO_MX_RECORD",
        severity: "warning",
        message:
          "No MX record was found, so email delivery may not work.",
      };
    }

    return null;
  } catch {
    return {
      code: "DNS_MX_LOOKUP_FAILED",
      severity: "warning",
      message:
        "The MX record lookup failed. Email routing may be misconfigured.",
    };
  }
}
