/**
 * Validation for a lead-magnet REDIRECT destination.
 *
 * The destination is ALWAYS the owner/admin-configured value bound to the form —
 * never anything from the public submission. This policy is the gate that keeps
 * a configured redirect from becoming an open redirect or an injection vector:
 * production destinations must be structurally valid `https://` URLs with no
 * credentials, control characters, or dangerous schemes.
 */
export type RedirectValidation =
  | { ok: true; url: string }
  | {
      ok: false;
      reason:
        | "empty"
        | "too_long"
        | "control_chars"
        | "malformed"
        | "not_https"
        | "credentials_in_url"
        | "no_host";
    };

const MAX_LEN = 2048;

/** True if the string contains a CR/LF/NUL/other control char (charcode < 32 or 127). */
function hasControlChar(v: string): boolean {
  for (const ch of v) {
    const c = ch.charCodeAt(0);
    if (c < 32 || c === 127) return true;
  }
  return false;
}

/**
 * Validate a configured redirect destination. Accepts ONLY a structurally valid
 * absolute `https://` URL with a host and no embedded credentials. Rejects
 * `http:`, `javascript:`, `data:`, `blob:`, `file:`, `mailto:`, credentials in
 * the URL, control characters (header-injection safe), and anything unparsable.
 */
export function validateRedirectUrl(raw: unknown): RedirectValidation {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  const value = raw.trim();
  if (value === "") return { ok: false, reason: "empty" };
  if (value.length > MAX_LEN) return { ok: false, reason: "too_long" };
  if (hasControlChar(value)) return { ok: false, reason: "control_chars" };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  // Scheme allowlist — https ONLY (this rejects javascript:/data:/blob:/file:/
  // http: and every other scheme).
  if (url.protocol !== "https:") return { ok: false, reason: "not_https" };
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials_in_url" };
  }
  if (url.hostname === "") return { ok: false, reason: "no_host" };
  // Return the normalized URL (URL parsing has already canonicalized it).
  return { ok: true, url: url.toString() };
}
