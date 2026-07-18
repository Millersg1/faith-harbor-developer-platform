import type { Request } from "express";

export const SESSION_COOKIE =
  "fh_session";

/**
 * Reads a cookie value from the request without requiring a
 * cookie-parser dependency.
 */
export function readCookie(
  req: Request,
  name: string,
): string | undefined {
  const header = req.headers.cookie;

  if (!header) {
    return undefined;
  }

  for (
    const part of header.split(";")
  ) {
    const index =
      part.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = part
      .slice(0, index)
      .trim();

    if (key === name) {
      return decodeURIComponent(
        part
          .slice(index + 1)
          .trim(),
      );
    }
  }

  return undefined;
}
