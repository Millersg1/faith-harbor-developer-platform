import type { RequestHandler } from "express";

const SAFE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
]);

/**
 * CSRF protection for authenticated, state-changing routes.
 *
 * The session lives in a `SameSite=Lax`, host-only cookie, which already stops
 * a cross-site page from driving a POST/PATCH/DELETE with the victim's cookie.
 * This guard is defense-in-depth on top of that: for unsafe methods it rejects
 * any request the browser marks cross-site (`Sec-Fetch-Site: cross-site`) or
 * whose `Origin` host doesn't match the request host.
 *
 * It deliberately allows requests that carry neither header — same-origin form
 * posts, non-browser API clients (which use a Bearer token, not the cookie),
 * and older browsers — because for those the `SameSite=Lax` cookie remains the
 * backstop. So it strengthens the common case without breaking legitimate
 * callers (or the test suite, whose requests carry no Origin/Sec-Fetch-Site).
 */
export function createCsrfGuard(): RequestHandler {
  return (req, res, next) => {
    if (SAFE_METHODS.has(req.method)) {
      next();

      return;
    }

    const site =
      req.headers["sec-fetch-site"];

    if (site === "cross-site") {
      reject(res);

      return;
    }

    const origin = req.headers.origin;

    if (
      typeof origin === "string" &&
      origin.length > 0
    ) {
      const originHost =
        hostOf(origin);

      // A present Origin must match a host we're actually serving. Behind the
      // reverse proxy the app may see the internal Host while the browser's
      // Origin carries the public host, so accept the forwarded host too.
      // `\0` is an unparseable sentinel that can never equal a real host.
      const servedHosts = [
        req.headers.host,
        req.headers[
          "x-forwarded-host"
        ],
      ]
        .flatMap((h) =>
          typeof h === "string"
            ? h.split(",")
            : [],
        )
        .map((h) =>
          h.trim().toLowerCase(),
        )
        .filter(Boolean);

      if (
        !servedHosts.includes(
          originHost,
        )
      ) {
        reject(res);

        return;
      }
    }

    next();
  };
}

function hostOf(origin: string): string {
  try {
    return new URL(
      origin,
    ).host.toLowerCase();
  } catch {
    return "\0";
  }
}

function reject(
  res: Parameters<RequestHandler>[1],
): void {
  res.status(403).json({
    error: {
      code: "CSRF_BLOCKED",
      message:
        "This request looks cross-site and was blocked.",
    },
  });
}
