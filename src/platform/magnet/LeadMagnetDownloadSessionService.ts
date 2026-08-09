import { createHash, randomBytes } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * A one-time, opaque DOWNLOAD-SESSION capability issued by the fragment-exchange
 * POST and consumed by the file GET. The post-exchange URL carries no token, but
 * this session cookie IS an opaque authentication capability and is treated as
 * one: SHORT-lived, SINGLE-use, HASH-ONLY at rest, bound server-side to the exact
 * (organization, fulfillment, file, purpose), atomically consumed, and rotated
 * fresh on every exchange. The raw id lives only in an httpOnly/Secure/host-only
 * cookie — never in a URL, log, audit, JSON body, or JavaScript.
 *
 * It is durable (survives restart within its short TTL) and consumed atomically,
 * so it is multi-worker-safe.
 */
function hashId(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export const DOWNLOAD_SESSION_TTL_MS = 2 * 60 * 1000; // short: the download follows immediately
export const DOWNLOAD_SESSION_PURPOSE = "magnet_download";

interface Row {
  session_hash: string;
  organization_id: string;
  fulfillment_id: string;
  file_id: string;
  purpose: string;
  expires_at: string;
  used: boolean;
  created_at: string;
}

export type ConsumeOutcome =
  | { ok: true; organizationId: string; fulfillmentId: string; fileId: string }
  | { ok: false };

export class LeadMagnetDownloadSessionRepository {
  private readonly rows = new Map<string, Row>();

  constructor(private readonly db?: PgQueryable) {}

  async create(row: Row): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO lead_magnet_download_sessions
           (session_hash, organization_id, fulfillment_id, file_id, purpose,
            expires_at, used, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          row.session_hash, row.organization_id, row.fulfillment_id, row.file_id,
          row.purpose, row.expires_at, row.used, row.created_at,
        ],
      );
      return;
    }
    this.rows.set(row.session_hash, { ...row });
  }

  /** Atomically mark used iff live (not used, unexpired, matching purpose). */
  async consume(
    sessionHash: string,
    purpose: string,
    nowIso: string,
  ): Promise<Row | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE lead_magnet_download_sessions
            SET used = TRUE
          WHERE session_hash = $1 AND purpose = $2 AND used = FALSE
            AND expires_at > $3
          RETURNING *`,
        [sessionHash, purpose, nowIso],
      );
      return (r.rows[0] as unknown as Row) ?? undefined;
    }
    const row = this.rows.get(sessionHash);
    if (!row || row.used || row.purpose !== purpose || row.expires_at <= nowIso) {
      return undefined;
    }
    row.used = true;
    return { ...row };
  }
}

export class LeadMagnetDownloadSessionService {
  constructor(
    private readonly repo = new LeadMagnetDownloadSessionRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Issue a fresh one-time session, returning the RAW id ONCE (for the cookie).
   * Bound to the exact org/fulfillment/file + purpose. Rotating: each exchange
   * mints a new id, so a pre-set (fixated) cookie is always superseded.
   */
  async issue(input: {
    organizationId: string;
    fulfillmentId: string;
    fileId: string;
    ttlMs?: number;
  }): Promise<string> {
    const raw = randomBytes(24).toString("hex");
    const nowMs = this.now();
    await this.repo.create({
      session_hash: hashId(raw),
      organization_id: input.organizationId,
      fulfillment_id: input.fulfillmentId,
      file_id: input.fileId,
      purpose: DOWNLOAD_SESSION_PURPOSE,
      expires_at: new Date(nowMs + (input.ttlMs ?? DOWNLOAD_SESSION_TTL_MS)).toISOString(),
      used: false,
      created_at: new Date(nowMs).toISOString(),
    });
    return raw;
  }

  /** Atomically consume a session by its raw cookie id. Fails closed. */
  async consume(rawSessionId: string): Promise<ConsumeOutcome> {
    if (!rawSessionId || !/^[a-f0-9]{48}$/.test(rawSessionId)) return { ok: false };
    const nowIso = new Date(this.now()).toISOString();
    const row = await this.repo.consume(hashId(rawSessionId), DOWNLOAD_SESSION_PURPOSE, nowIso);
    if (!row) return { ok: false };
    return {
      ok: true,
      organizationId: row.organization_id,
      fulfillmentId: row.fulfillment_id,
      fileId: row.file_id,
    };
  }
}
