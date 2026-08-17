/**
 * Hardened fetcher for registrar GET-query APIs (NameSilo/Namecheap put the API
 * key in the query string, so transport safety is critical).
 *
 * Guarantees:
 *  - HTTPS only; the request host must be on an explicit allowlist (the approved
 *    provider API hostname) — anything else fails closed.
 *  - Redirects are REFUSED (`redirect: "error"`), so a secret-bearing URL is
 *    never followed to another host.
 *  - Time-bounded (AbortController) and size-bounded response.
 *  - **Errors NEVER contain the request URL or key** — the underlying fetch
 *    error (which may embed the full URL) is swallowed and replaced with a
 *    generic {@link RegistrarTransportError} carrying only a safe code. DNS/TLS
 *    failures therefore fail closed without leaking the URL.
 *
 * No provider request is ever made from the browser — this runs server-side only.
 */

export class RegistrarTransportError extends Error {
  constructor(readonly code: string) {
    super(`Registrar transport error (${code}).`);
    this.name = "RegistrarTransportError";
  }
}

export type Fetcher = (
  url: string,
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

type UnderlyingFetch = (
  url: string,
  init: { redirect: "error"; signal: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  headers?: { get(name: string): string | null };
  text: () => Promise<string>;
}>;

export interface HardenedFetchOptions {
  allowedHosts: string[];
  timeoutMs?: number;
  maxBytes?: number;
}

export function createHardenedFetcher(
  opts: HardenedFetchOptions,
  underlyingFetch?: UnderlyingFetch,
): Fetcher {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const doFetch: UnderlyingFetch =
    underlyingFetch ?? ((url, init) => fetch(url, init) as ReturnType<UnderlyingFetch>);

  return async (url: string) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      throw new RegistrarTransportError("bad-url"); // never echoes the input
    }
    if (u.protocol !== "https:") {
      throw new RegistrarTransportError("insecure-scheme");
    }
    if (!opts.allowedHosts.includes(u.hostname)) {
      throw new RegistrarTransportError("host-not-allowed");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Awaited<ReturnType<UnderlyingFetch>>;
    try {
      res = await doFetch(url, { redirect: "error", signal: controller.signal });
    } catch (err) {
      // The underlying error may embed the full URL (with the key). NEVER
      // surface it — map to a bounded, URL-free code.
      throw new RegistrarTransportError(safeCode(err));
    } finally {
      clearTimeout(timer);
    }

    // Reject oversized responses by declared length up front.
    const len = Number(res.headers?.get?.("content-length") ?? "0");
    if (len > maxBytes) {
      throw new RegistrarTransportError("response-too-large");
    }
    return {
      ok: res.ok,
      status: res.status,
      text: async () => {
        const body = await res.text();
        if (body.length > maxBytes) {
          throw new RegistrarTransportError("response-too-large");
        }
        return body;
      },
    };
  };
}

/** Extracts only a safe, URL-free error code. */
function safeCode(err: unknown): string {
  const code = (err as { code?: string; name?: string } | undefined)?.code;
  if (typeof code === "string" && /^[A-Z_]+$/.test(code)) return code;
  const name = (err as { name?: string } | undefined)?.name;
  if (name === "AbortError") return "timeout";
  if (name === "TypeError") return "network"; // fetch redirect/DNS/TLS failures
  return "transport";
}
