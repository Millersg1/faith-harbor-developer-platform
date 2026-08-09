import { describe, expect, it } from "vitest";

import {
  checkMagnetFileMeta,
  hasPdfMagic,
  normalizePdfFilename,
} from "./magnetFilePolicy";

const pdf = { mimeType: "application/pdf", name: "guide.pdf", size: 1000 };

describe("magnetFilePolicy — PDF-only launch policy", () => {
  it("accepts a live PDF within the size limit and normalizes the filename", () => {
    const r = checkMagnetFileMeta(pdf);
    expect(r.ok).toBe(true);
    expect(r.ok && r.normalizedName).toBe("guide.pdf");
  });

  it("rejects non-PDF MIME (svg/zip/html/etc. are NOT permitted)", () => {
    for (const mime of ["image/svg+xml", "application/zip", "text/html", "application/octet-stream", "image/png"]) {
      expect(checkMagnetFileMeta({ ...pdf, mimeType: mime }).ok).toBe(false);
    }
  });

  it("rejects a non-.pdf filename, deleted, empty, and over-size files", () => {
    expect(checkMagnetFileMeta({ ...pdf, name: "guide.exe" })).toMatchObject({ ok: false, reason: "not_pdf_name" });
    expect(checkMagnetFileMeta({ ...pdf, deletedAt: "2026-01-01T00:00:00Z" })).toMatchObject({ ok: false, reason: "deleted" });
    expect(checkMagnetFileMeta({ ...pdf, size: 0 })).toMatchObject({ ok: false, reason: "empty" });
    expect(checkMagnetFileMeta({ ...pdf, size: 999_999_999 }, 1000)).toMatchObject({ ok: false, reason: "too_large" });
  });

  it("normalizePdfFilename strips paths/control chars and always ends in .pdf", () => {
    expect(normalizePdfFilename("../../etc/passwd")).toBe("passwd.pdf");
    expect(normalizePdfFilename("C:\\Users\\x\\report.pdf")).toBe("report.pdf");
    expect(normalizePdfFilename("weird name!.pdf")).toBe("weird_name_.pdf");
    expect(normalizePdfFilename("")).toBe("download.pdf");
  });

  it("hasPdfMagic validates the %PDF- signature at the bytes level", () => {
    expect(hasPdfMagic(Buffer.from("%PDF-1.7\n...", "latin1"))).toBe(true);
    expect(hasPdfMagic(Buffer.from("PK\u0003\u0004zip", "latin1"))).toBe(false);
    expect(hasPdfMagic(Buffer.from("<html>", "latin1"))).toBe(false);
    expect(hasPdfMagic(Buffer.alloc(2))).toBe(false);
  });
});
