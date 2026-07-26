import { randomUUID } from "node:crypto";

import { requireTenant } from "../../tenancy/TenantContext";
import {
  PlatformFileRepository,
  type ListFilesOptions,
} from "./PlatformFileRepository";
import type {
  PlatformFileRecord,
  UploadFileRequest,
} from "./PlatformFile";
import type { StorageProvider } from "./StorageProvider";

/** Default per-file cap (10 MB) and per-tenant quota (2 GB). */
const DEFAULT_MAX_FILE_BYTES =
  10 * 1024 * 1024;
const DEFAULT_QUOTA_BYTES =
  2 * 1024 * 1024 * 1024;

/**
 * Allowed content types. Uploads are refused unless their declared MIME type
 * is on this list — an allowlist, never a blocklist, and never based on the
 * filename extension.
 */
const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

export interface FileServiceOptions {
  maxFileBytes?: number;
  quotaBytes?: number;
  now?: () => number;
}

export class FileQuotaError extends Error {}
export class FileValidationError extends Error {}

/**
 * Manages a tenant's files: validated uploads to an injected StorageProvider,
 * tenant-scoped metadata, quota enforcement, authorized downloads, and soft
 * delete/restore. All authorization is tenant scope — a download only ever
 * resolves a file the acting organization owns.
 */
export class PlatformFileService {
  private readonly maxFileBytes: number;

  private readonly quotaBytes: number;

  private readonly now: () => number;

  constructor(
    private readonly repository: PlatformFileRepository,
    private readonly storage: StorageProvider,
    options: FileServiceOptions = {},
  ) {
    this.maxFileBytes =
      options.maxFileBytes ??
      DEFAULT_MAX_FILE_BYTES;
    this.quotaBytes =
      options.quotaBytes ??
      DEFAULT_QUOTA_BYTES;
    this.now =
      options.now ??
      (() => Date.now());
  }

  async upload(
    request: UploadFileRequest,
  ): Promise<PlatformFileRecord> {
    const name = sanitizeName(
      request.name,
    );

    if (!name) {
      throw new FileValidationError(
        "A file name is required.",
      );
    }

    const mimeType = (
      request.mimeType || ""
    )
      .trim()
      .toLowerCase();

    if (!ALLOWED_MIME.has(mimeType)) {
      throw new FileValidationError(
        "That file type isn't allowed.",
      );
    }

    let data: Buffer;

    try {
      data = Buffer.from(
        request.data ?? "",
        "base64",
      );
    } catch {
      throw new FileValidationError(
        "The file contents could not be read.",
      );
    }

    if (data.length === 0) {
      throw new FileValidationError(
        "The file is empty.",
      );
    }

    if (
      data.length > this.maxFileBytes
    ) {
      throw new FileValidationError(
        `Files must be ${Math.floor(this.maxFileBytes / (1024 * 1024))} MB or smaller.`,
      );
    }

    const used =
      await this.repository.totalSize();

    if (
      used + data.length >
      this.quotaBytes
    ) {
      throw new FileQuotaError(
        "Your storage quota is full. Delete files or upgrade your plan.",
      );
    }

    // Tenant-prefixed, random key — never derived from the user's filename,
    // so it can't traverse paths or collide across tenants.
    const organizationId =
      requireTenant().organizationId;
    const storedKey = `${organizationId}/${randomUUID()}`;

    await this.storage.put(
      storedKey,
      data,
    );

    const nowIso = new Date(
      this.now(),
    ).toISOString();

    return this.repository.create({
      id: randomUUID(),
      name,
      storedKey,
      mimeType,
      size: data.length,
      tags: normalizeTags(
        request.tags,
      ),
      subjectType:
        request.subjectType,
      subjectId: request.subjectId,
      uploadedBy:
        request.uploadedBy,
      createdAt: nowIso,
    });
  }

  async list(
    options: ListFilesOptions = {},
  ): Promise<
    readonly PlatformFileRecord[]
  > {
    return this.repository.list(
      options,
    );
  }

  async get(
    id: string,
  ): Promise<PlatformFileRecord> {
    const file =
      await this.repository.get(id);

    if (!file || file.deletedAt) {
      throw new Error(
        "File not found.",
      );
    }

    return file;
  }

  /**
   * Returns a file's metadata and bytes for download. Only ever resolves a
   * file the acting tenant owns (the repository is tenant-scoped).
   */
  async download(id: string): Promise<{
    file: PlatformFileRecord;
    data: Buffer;
  }> {
    const file = await this.get(id);
    const data =
      await this.storage.get(
        file.storedKey,
      );

    return { file, data };
  }

  async softDelete(
    id: string,
  ): Promise<void> {
    const file = await this.get(id);

    await this.repository.update({
      ...file,
      deletedAt: new Date(
        this.now(),
      ).toISOString(),
    });
  }

  async restore(
    id: string,
  ): Promise<PlatformFileRecord> {
    const file =
      await this.repository.get(id);

    if (!file) {
      throw new Error(
        "File not found.",
      );
    }

    const restored = {
      ...file,
    };
    delete restored.deletedAt;

    return this.repository.update(
      restored,
    );
  }

  async usage(): Promise<{
    usedBytes: number;
    quotaBytes: number;
  }> {
    return {
      usedBytes:
        await this.repository.totalSize(),
      quotaBytes: this.quotaBytes,
    };
  }
}

/**
 * Sanitizes a display filename: strips any path components and control
 * characters. The result is metadata only — it is never used to build a
 * storage path (that's the random storedKey).
 */
function sanitizeName(
  raw: string,
): string {
  return (raw || "")
    .replace(/[\r\n\0]/g, "")
    .replace(/^.*[\\/]/, "")
    .trim()
    .slice(0, 255);
}

function normalizeTags(
  tags: string[] | undefined,
): string[] {
  if (!Array.isArray(tags)) {
    return [];
  }

  return tags
    .map((t) => String(t).trim())
    .filter(Boolean)
    .slice(0, 20);
}
