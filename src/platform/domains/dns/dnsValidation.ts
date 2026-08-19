/**
 * Server-side DNS validation + safety classification for Stage 8.
 *
 * Pure, dependency-free functions so both the service and its tests share one
 * source of truth. Two responsibilities:
 *
 *  1. Reject malformed nameservers / records BEFORE any provider call (never
 *     trust the client; the browser is not authoritative).
 *  2. Classify records that are *operationally sensitive* — mail (MX), sender
 *     auth (SPF/DKIM/DMARC), and certificate issuance (CAA/ACME). These are
 *     "protected": a change that would delete or overwrite one is refused unless
 *     the caller explicitly authorizes it, so a routine "point my domain at the
 *     site" edit can never silently break a customer's email or TLS.
 */

import type { DnsRecord, DnsRecordType } from "../RegistrarProvider";

export const DNS_RECORD_TYPES: DnsRecordType[] = [
  "A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "ALIAS",
];

export const TTL_MIN = 60;
export const TTL_MAX = 604_800; // 7 days
export const TXT_MAX = 2048;

export interface ValidationIssue {
  field: string;
  message: string;
}

/** A hostname label check that also accepts the apex marker "@" and wildcard. */
function isValidHost(host: string): boolean {
  if (host === "@") return true;
  const h = host.startsWith("*.") ? host.slice(2) : host;
  if (h.length === 0 || h.length > 253) return false;
  return h.split(".").every((l) => /^[a-z0-9_]([a-z0-9_-]{0,61}[a-z0-9_])?$/i.test(l));
}

/** A fully-qualified nameserver / target hostname (no apex marker, no wildcard). */
function isFqdn(name: string): boolean {
  if (name.length === 0 || name.length > 253) return false;
  const labels = name.replace(/\.$/, "").split(".");
  if (labels.length < 2) return false;
  return labels.every((l) => /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(l));
}

function isIPv4(v: string): boolean {
  const parts = v.split(".");
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255)
  );
}

function isIPv6(v: string): boolean {
  // Bounded, permissive-but-safe IPv6 check (hex groups + optional ::).
  if (!/^[0-9a-f:]+$/i.test(v) || v.length > 45) return false;
  if ((v.match(/::/g) ?? []).length > 1) return false;
  const groups = v.split(":");
  if (groups.length > 8) return false;
  return groups.every((g) => g === "" || /^[0-9a-f]{1,4}$/i.test(g));
}

/** Validates a set of nameservers for a delegation change. */
export function validateNameservers(nameservers: string[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (nameservers.length < 2) {
    issues.push({ field: "nameservers", message: "at least 2 nameservers are required" });
  }
  if (nameservers.length > 13) {
    issues.push({ field: "nameservers", message: "at most 13 nameservers are allowed" });
  }
  const seen = new Set<string>();
  for (const ns of nameservers) {
    const lc = ns.trim().toLowerCase();
    if (!isFqdn(lc)) {
      issues.push({ field: "nameservers", message: `invalid nameserver hostname: ${sanitizeLabel(lc)}` });
    }
    if (seen.has(lc)) {
      issues.push({ field: "nameservers", message: `duplicate nameserver: ${sanitizeLabel(lc)}` });
    }
    seen.add(lc);
  }
  return issues;
}

/** Validates a single DNS record (type-specific). */
export function validateRecord(record: DnsRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!DNS_RECORD_TYPES.includes(record.type)) {
    issues.push({ field: "type", message: `unsupported record type: ${sanitizeLabel(String(record.type))}` });
    return issues; // no point validating a value against an unknown type
  }
  if (!isValidHost(record.host)) {
    issues.push({ field: "host", message: `invalid host: ${sanitizeLabel(record.host)}` });
  }
  if (!Number.isInteger(record.ttl) || record.ttl < TTL_MIN || record.ttl > TTL_MAX) {
    issues.push({ field: "ttl", message: `ttl must be an integer in [${TTL_MIN}, ${TTL_MAX}]` });
  }
  const v = record.value?.trim() ?? "";
  switch (record.type) {
    case "A":
      if (!isIPv4(v)) issues.push({ field: "value", message: "A record requires an IPv4 address" });
      break;
    case "AAAA":
      if (!isIPv6(v)) issues.push({ field: "value", message: "AAAA record requires an IPv6 address" });
      break;
    case "CNAME":
    case "ALIAS":
    case "NS":
      if (!isFqdn(v)) issues.push({ field: "value", message: `${record.type} target must be a hostname` });
      break;
    case "MX":
      if (!isFqdn(v)) issues.push({ field: "value", message: "MX target must be a hostname" });
      if (record.priority == null || !Number.isInteger(record.priority) || record.priority < 0 || record.priority > 65535) {
        issues.push({ field: "priority", message: "MX requires a priority in [0, 65535]" });
      }
      break;
    case "SRV":
      if (record.priority == null || !Number.isInteger(record.priority) || record.priority < 0 || record.priority > 65535) {
        issues.push({ field: "priority", message: "SRV requires a priority in [0, 65535]" });
      }
      if (v.length === 0) issues.push({ field: "value", message: "SRV value is required" });
      break;
    case "TXT":
      if (v.length === 0) issues.push({ field: "value", message: "TXT value is required" });
      if (v.length > TXT_MAX) issues.push({ field: "value", message: `TXT value exceeds ${TXT_MAX} chars` });
      break;
    case "CAA":
      if (v.length === 0) issues.push({ field: "value", message: "CAA value is required" });
      break;
  }
  // CNAME/ALIAS at the apex conflicts with other records — flag, don't silently allow.
  if ((record.type === "CNAME") && record.host === "@") {
    issues.push({ field: "host", message: "CNAME is not allowed at the zone apex (use ALIAS/A)" });
  }
  return issues;
}

/**
 * Classifies a record as operationally protected (mail / sender-auth / cert
 * issuance). A change that deletes or overwrites a protected record requires an
 * explicit caller authorization; otherwise the platform preserves it.
 */
export function protectionReason(record: Pick<DnsRecord, "type" | "host" | "value">): string | null {
  const host = record.host.toLowerCase();
  const value = (record.value ?? "").toLowerCase();
  if (record.type === "MX") return "mail_exchange";
  if (record.type === "TXT") {
    if (value.startsWith("v=spf1") || host === "@") {
      if (value.startsWith("v=spf1")) return "spf";
    }
    if (value.startsWith("v=dmarc1") || host === "_dmarc" || host.startsWith("_dmarc.")) return "dmarc";
    if (host.includes("_domainkey")) return "dkim";
  }
  if (record.type === "CNAME" && host.includes("_domainkey")) return "dkim";
  if (record.type === "CAA") return "certificate_authorization";
  if (host.startsWith("_acme-challenge")) return "acme_challenge";
  if (record.type === "NS" && host !== "@") return "subdomain_delegation";
  return null;
}

export function isProtected(record: Pick<DnsRecord, "type" | "host" | "value">): boolean {
  return protectionReason(record) !== null;
}

/** Strips anything non-label so a validation message can never carry an injection/PII payload. */
export function sanitizeLabel(s: string): string {
  return (s ?? "").replace(/[^a-z0-9._*-]/gi, "_").slice(0, 80);
}
