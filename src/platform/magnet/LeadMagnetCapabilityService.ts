import { createHash, randomBytes } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * A controlled, time-limited DOWNLOAD capability for a lead magnet.
 *
 * The capability is an OPAQUE random token (never a predictable file id). Only
 * its SHA-256 hash is stored; the raw token is returned once, travels only in a
 * URL fragment, and is exchanged via POST (never a path/query/log/referrer). It
 * is bound to (organization, form, fulfillment, file), has a short TTL, and a
 * bounded use count (one-time by default). Redemption is atomic, so a replay/
 * race can't exceed the use limit.
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface CapabilityRecord {
  organizationId: string;
  formId: string;
  fulfillmentId: string;
  fileId: string;
  expiresAt: string;
  maxUses: number;
  usedCount: number;
  revoked: boolean;
  createdAt: string;
}

interface Row {
  token_hash: string;
  organization_id: string;
  form_id: string;
  fulfillment_id: string;
  file_id: string;
  expires_at: string;
  max_uses: number;
  used_count: number;
  revoked: boolean;
  created_at: string;
}

export type RedeemOutcome =
  | {
      ok: true;
      organizationId: string;
      formId: string;
      fulfillmentId: string;
      fileId: string;
    }
  | { ok: false; reason: "invalid" | "expired" | "revoked" | "exhausted" };

/** Default capability policy: 24h TTL, single use (one-time exchange). */
export const DEFAULT_CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CAPABILITY_MAX_USES = 1;

export class LeadMagnetCapabilityRepository {
  private readonly rows = new Map<string, Row>();

  constructor(private readonly db?: PgQueryable) {}

  async create(row: Row): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO lead_magnet_capabilities
           (token_hash, organization_id, form_id, fulfillment_id, file_id,
            expires_at, max_uses, used_count, revoked, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          row.token_hash, row.organization_id, row.form_id, row.fulfillment_id,
          row.file_id, row.expires_at, row.max_uses, row.used_count,
          row.revoked, row.created_at,
        ],
      );
      return;
    }
    this.rows.set(row.token_hash, { ...row });
  }

  /** Peek WITHOUT consuming — used to classify why a redemption fails. */
  async get(tokenHash: string): Promise<Row | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM lead_magnet_capabilities WHERE token_hash=$1",
        [tokenHash],
      );
      return (r.rows[0] as unknown as Row) ?? undefined;
    }
    const row = this.rows.get(tokenHash);
    return row ? { ...row } : undefined;
  }

  /**
   * Atomically consume ONE use iff live (not revoked, not expired, under the
   * limit). Returns the row on success, undefined otherwise — so a replay/race
   * can never exceed max_uses.
   */
  async consume(tokenHash: string, nowIso: string): Promise<Row | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE lead_magnet_capabilities
            SET used_count = used_count + 1
          WHERE token_hash = $1 AND revoked = FALSE
            AND expires_at > $2 AND used_count < max_uses
          RETURNING *`,
        [tokenHash, nowIso],
      );
      return (r.rows[0] as unknown as Row) ?? undefined;
    }
    const row = this.rows.get(tokenHash);
    if (
      !row ||
      row.revoked ||
      row.expires_at <= nowIso ||
      row.used_count >= row.max_uses
    ) {
      return undefined;
    }
    row.used_count += 1;
    return { ...row };
  }

  async revokeForFulfillment(fulfillmentId: string): Promise<void> {
    if (this.db) {
      await this.db.query(
        "UPDATE lead_magnet_capabilities SET revoked = TRUE WHERE fulfillment_id=$1",
        [fulfillmentId],
      );
      return;
    }
    for (const row of this.rows.values()) {
      if (row.fulfillment_id === fulfillmentId) row.revoked = true;
    }
  }
}

export class LeadMagnetCapabilityService {
  constructor(
    private readonly repo = new LeadMagnetCapabilityRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Mint a capability, returning the RAW token ONCE. The caller decides how to
   * deliver it (email link or the download page). Bound to org/form/fulfillment/
   * file. Idempotency lives at the FULFILLMENT layer (one fulfillment per
   * submission), so this is called at most once per fulfillment.
   */
  async mint(input: {
    organizationId: string;
    formId: string;
    fulfillmentId: string;
    fileId: string;
    ttlMs?: number;
    maxUses?: number;
  }): Promise<string> {
    const raw = randomBytes(32).toString("hex");
    const nowMs = this.now();
    await this.repo.create({
      token_hash: hashToken(raw),
      organization_id: input.organizationId,
      form_id: input.formId,
      fulfillment_id: input.fulfillmentId,
      file_id: input.fileId,
      expires_at: new Date(
        nowMs + (input.ttlMs ?? DEFAULT_CAPABILITY_TTL_MS),
      ).toISOString(),
      max_uses: input.maxUses ?? DEFAULT_CAPABILITY_MAX_USES,
      used_count: 0,
      revoked: false,
      created_at: new Date(nowMs).toISOString(),
    });
    return raw;
  }

  /**
   * Redeem a raw token: validate the hash, expiry, revocation, and usage limit,
   * consuming one use ATOMICALLY. Returns the binding on success. Never throws;
   * a forged/expired/revoked/exhausted/cross-tenant token fails closed.
   */
  async redeem(rawToken: string): Promise<RedeemOutcome> {
    if (!rawToken || !/^[a-f0-9]{64}$/.test(rawToken)) {
      return { ok: false, reason: "invalid" };
    }
    const hash = hashToken(rawToken);
    const nowIso = new Date(this.now()).toISOString();
    const consumed = await this.repo.consume(hash, nowIso);
    if (consumed) {
      return {
        ok: true,
        organizationId: consumed.organization_id,
        formId: consumed.form_id,
        fulfillmentId: consumed.fulfillment_id,
        fileId: consumed.file_id,
      };
    }
    // Classify the failure without leaking anything (generic to the caller).
    const row = await this.repo.get(hash);
    if (!row) return { ok: false, reason: "invalid" };
    if (row.revoked) return { ok: false, reason: "revoked" };
    if (row.expires_at <= nowIso) return { ok: false, reason: "expired" };
    return { ok: false, reason: "exhausted" };
  }

  /** Revoke all capabilities for a fulfillment (owner/admin control). */
  async revokeForFulfillment(fulfillmentId: string): Promise<void> {
    await this.repo.revokeForFulfillment(fulfillmentId);
  }
}
