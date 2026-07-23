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
  createdAt: string;
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
