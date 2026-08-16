/**
 * Safe helpers for Namecheap's legacy query/XML API.
 *
 * SECURITY: we deliberately do NOT use a general XML parser. Namecheap
 * responses are flat, attribute-bearing elements, so we extract exactly the
 * fields we need with bounded, targeted matching. Because nothing here resolves
 * entities or DTDs, the response is structurally immune to XXE and
 * entity-expansion ("billion laughs") attacks; we additionally bound input size
 * before scanning. Every logged/audited string is passed through
 * {@link redactSecrets} so an ApiKey/ApiUser can never leak.
 */

const MAX_BODY = 2_000_000; // 2 MB guard; real responses are tiny.

/** Extracts a double-quoted XML attribute value from an element's attr string. */
export function attr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(attrs);
  return m ? m[1] : undefined;
}

/** Returns each element body's attribute string for a given tag name. */
export function elements(body: string, tag: string): string[] {
  bound(body);
  const out: string[] = [];
  const re = new RegExp(`<${tag}\\b([^>]*?)/?>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1]);
  }
  return out;
}

function bound(body: string): void {
  if (typeof body !== "string") {
    throw new NamecheapParseError("Non-string response body.");
  }
  if (body.length > MAX_BODY) {
    throw new NamecheapParseError("Response body too large.");
  }
}

export class NamecheapParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NamecheapParseError";
  }
}

/** A sanitized API-level error (Status="ERROR"). Number is a safe category. */
export class NamecheapApiError extends Error {
  constructor(
    message: string,
    readonly number?: string,
  ) {
    super(message);
    this.name = "NamecheapApiError";
  }
}

/**
 * Precise decimal-string dollars -> integer minor units, WITHOUT floating
 * point. "10.98" -> 1098, "12" -> 1200, "0.1" -> 10. Rejects junk.
 */
export function decimalToMinor(s: string): number {
  const str = String(s).trim();
  if (!/^\d+(\.\d{1,4})?$/.test(str)) {
    throw new NamecheapParseError(`Invalid money value "${s}".`);
  }
  const [whole, frac = ""] = str.split(".");
  const cents = (frac + "00").slice(0, 2); // pad/truncate to 2 dp
  // If there were 3-4 dp, round the remainder half-up into cents.
  let minor = Number(whole) * 100 + Number(cents);
  if (frac.length > 2) {
    const third = Number(frac[2] ?? "0");
    if (third >= 5) {
      minor += 1;
    }
  }
  return minor;
}

/** True when the response envelope reports an API-level error. */
export function isApiError(body: string): boolean {
  bound(body);
  return /Status="ERROR"/i.test(body);
}

/** Extracts the first sanitized error {number, message} or a generic one. */
export function extractApiError(body: string): NamecheapApiError {
  const m = /<Error[^>]*\bNumber="([^"]*)"[^>]*>([^<]{0,200})<\/Error>/i.exec(
    body,
  );
  return new NamecheapApiError(
    m ? sanitizeText(m[2]) : "Namecheap API error.",
    m?.[1],
  );
}

/** Bounds + strips anything unsafe from a provider text fragment. */
export function sanitizeText(s: string): string {
  return s
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\x20-\x7e]/g, "")
    .trim()
    .slice(0, 200);
}

/**
 * Redacts credentials from any string before it is logged/audited. Strips the
 * values of ApiKey/ApiUser/UserName/ClientIp/password-like query params AND, as
 * a belt-and-braces measure, the entire query string of a Namecheap API URL.
 */
export function redactSecrets(s: string): string {
  let out = String(s);
  // Redact a full Namecheap API URL's query string entirely.
  out = out.replace(
    /(https?:\/\/[^?\s]*xml\.response)\?[^\s"']*/gi,
    "$1?[REDACTED]",
  );
  // Redact individual sensitive params anywhere they appear.
  out = out.replace(
    /\b(ApiKey|ApiUser|UserName|ClientIp|Password|Token)=([^&\s"']*)/gi,
    "$1=[REDACTED]",
  );
  return out;
}

/**
 * Classifies a thrown transport/parse error into the honest outcome category.
 * Connection resets / timeouts that could have been received mid-flight are
 * `ambiguous_unknown` (never blindly retried); pre-send failures are
 * `transport_failure_pre_acceptance`.
 */
export function classifyTransportError(
  err: unknown,
): "transport_failure_pre_acceptance" | "ambiguous_unknown" {
  const code = (err as { code?: string } | undefined)?.code ?? "";
  const msg = ((err as Error | undefined)?.message ?? "").toLowerCase();
  // Pre-acceptance: we never got the request onto the wire / TLS/DNS refused.
  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "EAI_AGAIN" ||
    /getaddrinfo|dns|refused|tls|certificate|self signed/.test(msg)
  ) {
    return "transport_failure_pre_acceptance";
  }
  // Reset/timeout/aborted mid-flight, or malformed XML we couldn't classify:
  // the registrar may or may not have acted -> ambiguous.
  return "ambiguous_unknown";
}
