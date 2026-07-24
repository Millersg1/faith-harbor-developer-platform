/**
 * A custom (white-label) domain mapped to one organization. When a
 * request arrives for this host, the platform resolves it to the owning
 * tenant — this is what lets a Platform Partner run the platform on their
 * own domain (e.g. cloud.theirbrand.com).
 *
 * Domains are globally unique, so two organizations can never claim the
 * same host.
 */
export interface OrganizationDomainRecord {
  id: string;
  organizationId: string;
  domain: string;
  verified: boolean;
  /**
   * A per-domain secret the tenant publishes as a DNS TXT record to prove
   * they control the domain. Until the record is found, the domain stays
   * unverified and does NOT resolve to the tenant.
   */
  verificationToken: string;
  createdAt: string;
}

/**
 * The DNS host the tenant creates a TXT record on to prove ownership of a
 * domain, e.g. `_aecloud-verify.cloud.theirbrand.com`.
 */
export function verificationHost(
  domain: string,
): string {
  return `_aecloud-verify.${domain}`;
}

/**
 * The exact TXT record value the tenant must publish for a given token.
 */
export function verificationValue(
  token: string,
): string {
  return `aecloud-verify=${token}`;
}

/**
 * Normalizes a host into a comparable domain: lowercased, port stripped,
 * no trailing dot or surrounding whitespace. Returns an empty string when
 * nothing usable remains.
 */
export function normalizeDomain(
  raw: string,
): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .split(":")[0]
    .replace(/\.+$/, "");
}

const DOMAIN_RE =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * True when the value looks like a valid fully-qualified domain name.
 */
export function isValidDomain(
  domain: string,
): boolean {
  return DOMAIN_RE.test(domain);
}
