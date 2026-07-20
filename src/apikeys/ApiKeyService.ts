import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import { ApiKeyRepository } from "./ApiKeyRepository";
import type {
  ApiKeyRecord,
  ApiKeySummary,
  CreatedApiKey,
} from "./ApiKeyTypes";

/**
 * The prefix that marks a Faith Harbor API key. "fhk" = Faith Harbor
 * Key. External systems send it in the X-API-Key header.
 */
const KEY_PREFIX = "fhk_";

/**
 * Hashes a raw key with SHA-256, returning a hex digest. Keys are
 * high-entropy random tokens, so a fast hash is appropriate (unlike
 * user passwords, there is nothing to brute-force).
 */
function hashKey(raw: string): string {
  return createHash("sha256")
    .update(raw)
    .digest("hex");
}

/**
 * Issues and verifies API keys for the SaaS Surface API.
 */
export class ApiKeyService {
  constructor(
    private readonly repository =
      new ApiKeyRepository(),
  ) {}

  /**
   * Creates a new key. The raw key is returned exactly once; only its
   * hash is stored. Callers must copy it immediately.
   */
  createKey(request: {
    name: string;
    brandId?: string;
  }): CreatedApiKey {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "An API key requires a name.",
      );
    }

    const raw =
      KEY_PREFIX +
      randomBytes(24).toString("hex");

    const record: ApiKeyRecord = {
      id: randomUUID(),
      name,
      keyHash: hashKey(raw),
      prefix: raw.slice(0, 12),
      createdAt:
        new Date().toISOString(),
    };

    if (request.brandId) {
      record.brandId =
        request.brandId.trim();
    }

    this.repository.create(record);

    return {
      key: raw,
      apiKey: this.toSummary(record),
    };
  }

  /**
   * Verifies a presented raw key. On success, records the use and
   * returns the key record; otherwise returns undefined. The lookup
   * is by hash and the comparison is constant-time.
   */
  verify(
    rawKey: string | undefined,
  ): ApiKeyRecord | undefined {
    if (
      !rawKey ||
      !rawKey.startsWith(KEY_PREFIX)
    ) {
      return undefined;
    }

    const presentedHash =
      hashKey(rawKey.trim());

    const record =
      this.repository.findByHash(
        presentedHash,
      );

    if (!record) {
      return undefined;
    }

    // Defense in depth: confirm the stored hash matches in constant
    // time. (The DB lookup already matched by hash; this guards against
    // any future non-exact lookup.)
    const a = Buffer.from(
      presentedHash,
      "hex",
    );

    const b = Buffer.from(
      record.keyHash,
      "hex",
    );

    if (
      a.length !== b.length ||
      !timingSafeEqual(a, b)
    ) {
      return undefined;
    }

    this.repository.touch(
      record.id,
      new Date().toISOString(),
    );

    return record;
  }

  list(): ApiKeySummary[] {
    return this.repository
      .list()
      .map((record) =>
        this.toSummary(record),
      );
  }

  delete(id: string): void {
    this.repository.delete(id);
  }

  private toSummary(
    record: ApiKeyRecord,
  ): ApiKeySummary {
    const summary: ApiKeySummary = {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      createdAt: record.createdAt,
    };

    if (record.brandId) {
      summary.brandId = record.brandId;
    }

    if (record.lastUsedAt) {
      summary.lastUsedAt =
        record.lastUsedAt;
    }

    return summary;
  }
}
