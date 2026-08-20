/**
 * DNS AUTHORITY model (Stage 8 boundary reconciliation).
 *
 * Three DNS capabilities are DELIBERATELY SEPARATE and must never be conflated:
 *
 *   1. **Registrar nameserver management** — which nameservers the registrar
 *      delegates the domain to (registrar API: NameSilo `changeNameServers`).
 *      This is delegation, NOT zone content.
 *   2. **Registry DS / glue management** — DNSSEC DS records and host glue held
 *      at the REGISTRY via the registrar. We only READ DNSSEC status; we do not
 *      offer DS/glue mutation here.
 *   3. **Authoritative DNS-zone management** — the A/AAAA/MX/TXT/… records, held
 *      by whichever DNS service the nameservers actually point at.
 *
 * A registrar can only mutate ZONE RECORDS when the domain is actually using
 * THAT registrar's own authoritative DNS service. NameSilo can edit records only
 * when the nameservers point at NameSilo DNS (dnsowl.com). If the nameservers
 * point at All Elite Hosting / cPanel — or anywhere else — the zone is authored
 * elsewhere and NameSilo record edits are meaningless or wrong. Until a dedicated
 * cPanel DNS adapter exists, cPanel-authoritative domains are represented as
 * `externally_managed` and record mutation is unsupported (fail-closed).
 *
 * This module is a PURE classifier: given the live nameservers and an injected
 * map of provider → nameserver suffixes (never hard-coded here, so nothing is
 * fabricated), it decides who is authoritative for the zone.
 */

/** A provider's authoritative-DNS nameserver fingerprint (suffixes). */
export interface AuthoritativeDnsProvider {
  /** e.g. "namesilo", "cpanel". */
  provider: string;
  /** Nameserver suffixes that identify this provider's DNS, e.g. ["dnsowl.com"]. */
  nsSuffixes: string[];
  /**
   * Whether the platform can manage zone records for this authority today.
   * NameSilo: true (registrar API). cPanel: false until an adapter is built.
   */
  recordManagement: "supported" | "externally_managed";
}

export type AuthorityState = "fresh" | "stale" | "unknown";

export interface AuthorityClassification {
  /** The provider authoritative for the zone, "external", or "unknown". */
  provider: string;
  /** Whether the platform can manage records for this authority. */
  recordManagement: "supported" | "externally_managed" | "unknown";
}

function suffixMatch(ns: string, suffix: string): boolean {
  const n = ns.trim().toLowerCase().replace(/\.$/, "");
  const s = suffix.trim().toLowerCase().replace(/^\.|\.$/g, "");
  return n === s || n.endsWith(`.${s}`);
}

/**
 * Classifies zone authority from the live nameservers. Requires ALL nameservers
 * to belong to the SAME known provider; a mixed / partially-unknown set is
 * treated as `external` (fail-closed — we never assume we own a zone we might
 * not). An empty set is `unknown`.
 */
export function classifyAuthority(
  nameservers: string[],
  providers: AuthoritativeDnsProvider[],
): AuthorityClassification {
  const ns = nameservers.map((n) => n.trim().toLowerCase()).filter(Boolean);
  if (ns.length === 0) {
    return { provider: "unknown", recordManagement: "unknown" };
  }
  for (const p of providers) {
    const all = ns.every((n) => p.nsSuffixes.some((suf) => suffixMatch(n, suf)));
    if (all) {
      return { provider: p.provider, recordManagement: p.recordManagement };
    }
  }
  // Known to at least one provider but not uniformly, or entirely unrecognized:
  // the zone is authored somewhere we do not manage.
  return { provider: "external", recordManagement: "externally_managed" };
}
