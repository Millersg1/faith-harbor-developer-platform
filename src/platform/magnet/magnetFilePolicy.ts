/**
 * LAUNCH file policy for lead magnets: **PDF only**.
 *
 * The platform has NO malware/virus scanner and trusts the client-declared MIME
 * type at upload (the upload allowlist even includes `image/svg+xml` and
 * `application/zip`). Rather than invent protection, lead magnets are restricted
 * to PDFs for the initial release. SVG, ZIP, HTML, executables, scripts, and
 * arbitrary document types are NOT permitted as lead magnets.
 *
 * HONESTY: an expected-MIME + `.pdf` filename + `%PDF-` magic-byte check is NOT
 * malware scanning and cannot guarantee a PDF is harmless (a PDF can still carry
 * malicious JavaScript/embedded content). It only ensures the file is
 * structurally a PDF, not something else mislabelled. Broader file-type support
 * is BLOCKED until a real malware-scanning + file-validation pipeline exists.
 */
export const MAGNET_ALLOWED_MIME = "application/pdf";
export const DEFAULT_MAGNET_MAX_BYTES = 25 * 1024 * 1024; // 25 MB, configurable

export interface MagnetFileMeta {
  mimeType: string;
  name: string;
  size: number;
  deletedAt?: string;
}

export type FilePolicyResult =
  | { ok: true; normalizedName: string }
  | {
      ok: false;
      reason: "deleted" | "not_pdf_mime" | "not_pdf_name" | "too_large" | "empty";
    };

/** Strip path components + control chars and force a single `.pdf` extension. */
export function normalizePdfFilename(raw: string): string {
  const stripped = Array.from(raw.replace(/^.*[\\/]/, "")) // strip any path (/, \)
    .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127) // no control chars
    .join("")
    .trim()
    .slice(0, 200);
  const stem = stripped
    .replace(/\.pdf$/i, "")
    .replace(/[^A-Za-z0-9._-]/g, "_") // spaces + unsafe chars → underscore
    .trim();
  const safeStem = stem.replace(/^\.+/, "").slice(0, 180) || "download";
  return `${safeStem}.pdf`;
}

/**
 * Metadata eligibility (no bytes): the file must be a non-deleted PDF by declared
 * MIME + filename, within the size limit. The magic-byte check is a separate,
 * bytes-level step done at serve time (and at config-save time).
 */
export function checkMagnetFileMeta(
  file: MagnetFileMeta,
  maxBytes = DEFAULT_MAGNET_MAX_BYTES,
): FilePolicyResult {
  if (file.deletedAt) return { ok: false, reason: "deleted" };
  if (file.size <= 0) return { ok: false, reason: "empty" };
  if (file.size > maxBytes) return { ok: false, reason: "too_large" };
  if (file.mimeType.trim().toLowerCase() !== MAGNET_ALLOWED_MIME) {
    return { ok: false, reason: "not_pdf_mime" };
  }
  if (!/\.pdf$/i.test(file.name.trim())) {
    return { ok: false, reason: "not_pdf_name" };
  }
  return { ok: true, normalizedName: normalizePdfFilename(file.name) };
}

/**
 * Bytes-level PDF signature check. A real PDF begins with `%PDF-` (optionally
 * after a small BOM/whitespace preamble). NOT malware scanning — see file
 * header. Returns true only when the magic bytes are present near the start.
 */
export function hasPdfMagic(data: Buffer): boolean {
  if (data.length < 5) return false;
  // Allow a tiny preamble (some tools prepend whitespace/BOM before %PDF-).
  const head = data.subarray(0, Math.min(1024, data.length)).toString("latin1");
  return head.includes("%PDF-");
}
