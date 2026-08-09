import { createHash, randomBytes } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * A controlled, time-limited DOWNLOAD capability for a lead magnet.
 *
 * The capability is an OPAQUE random token (never a predictable file id). Only
 * its SHA-256 hash is stored; the raw token exists in memory only long enough to
 * build the fragment URL, travels only in a URL fragment, and is exchanged via
 * POST (never a path/query/log/referrer). It is bound to
 * (organization, form, fulfillment, file), has a short TTL, and a bounded use
 * count (single-use by default). Redemption is atomic, so a replay/race can't
 * exceed the use limit.
 *
 * SIBLINGS: a single fulfillment may have a small, bounded number of active
 * capabilities (e.g. a deliberate email retry, or a lost immediate-download
 * response). Minting past the cap expires the OLDEST. Redeeming ANY sibling
 * invalidates the rest for that fulfillment — so at most one download ever
 * succeeds per fulfillment.
 */
function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
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

/** Default capability policy: 24h TTL, single use, ≤3 live siblings per fulfillment. */
export const DEFAULT_CAPABILITY_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_CAPABILITY_MAX_USES = 1;
export const DEFAULT_SIBLING_CAP = 3;

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

  /** Active (unrevoked, unexpired, unexhausted) capabilities for a fulfillment, oldest first. */
  async activeForFulfillment(
    fulfillmentId: string,
    nowIso: string,
  ): Promise<{ token_hash: string; created_at: string }[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT token_hash, created_at FROM lead_magnet_capabilities
           WHERE fulfillment_id=$1 AND revoked=FALSE AND expires_at>$2
             AND used_count < max_uses
           ORDER BY created_at ASC, token_hash ASC`,
        [fulfillmentId, nowIso],
      );
      return r.rows as unknown as { token_hash: string; created_at: string }[];
    }
    return [...this.rows.values()]
      .filter(
        (row) =>
          row.fulfillment_id === fulfillmentId &&
          !row.revoked &&
          row.expires_at > nowIso &&
          row.used_count < row.max_uses,
      )
      .sort((a, b) =>
        a.created_at < b.created_at
          ? -1
          : a.created_at > b.created_at
            ? 1
            : a.token_hash < b.token_hash
              ? -1
              : 1,
      )
      .map((row) => ({ token_hash: row.token_hash, created_at: row.created_at }));
  }

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

  async revokeByHash(tokenHash: string): Promise<void> {
    if (this.db) {
      await this.db.query(
        "UPDATE lead_magnet_capabilities SET revoked=TRUE WHERE token_hash=$1",
        [tokenHash],
      );
      return;
    }
    const row = this.rows.get(tokenHash);
    if (row) row.revoked = true;
  }

  /** Revoke every capability for a fulfillment EXCEPT the given hash. */
  async revokeSiblings(fulfillmentId: string, keepHash: string): Promise<void> {
    if (this.db) {
      await this.db.query(
        "UPDATE lead_magnet_capabilities SET revoked=TRUE WHERE fulfillment_id=$1 AND token_hash<>$2",
        [fulfillmentId, keepHash],
      );
      return;
    }
    for (const row of this.rows.values()) {
      if (row.fulfillment_id === fulfillmentId && row.token_hash !== keepHash) {
        row.revoked = true;
      }
    }
  }

  async revokeForFulfillment(fulfillmentId: string): Promise<void> {
    if (this.db) {
      await this.db.query(
        "UPDATE lead_magnet_capabilities SET revoked=TRUE WHERE fulfillment_id=$1",
        [fulfillmentId],
      );
      return;
    }
    for (const row of this.rows.values()) {
      if (row.fulfillment_id === fulfillmentId) row.revoked = true;
    }
  }
}

export interface MintInput {
  organizationId: string;
  formId: string;
  fulfillmentId: string;
  fileId: string;
  ttlMs?: number;
  maxUses?: number;
  siblingCap?: number;
}

export class LeadMagnetCapabilityService {
  constructor(
    private readonly repo = new LeadMagnetCapabilityRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Mint a capability, returning the RAW token ONCE plus its hash (so a caller
   * can revoke exactly this attempt's capability, e.g. on a pre-acceptance
   * failure). Enforces a bounded sibling cap: minting past the cap expires the
   * OLDEST active capability for the fulfillment first — repeated requests can
   * never mint unlimited tokens.
   */
  async mint(input: MintInput): Promise<{ token: string; tokenHash: string }> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const cap = input.siblingCap ?? DEFAULT_SIBLING_CAP;
    // Bound live siblings: expire the oldest until there's room for the new one.
    const active = await this.repo.activeForFulfillment(input.fulfillmentId, nowIso);
    const excess = active.length - (cap - 1);
    for (let i = 0; i < excess; i += 1) {
      await this.repo.revokeByHash(active[i].token_hash);
    }
    const raw = randomBytes(32).toString("hex");
    const tokenHash = hashToken(raw);
    await this.repo.create({
      token_hash: tokenHash,
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
      created_at: nowIso,
    });
    return { token: raw, tokenHash };
  }

  /**
   * Redeem a raw token: validate the hash, expiry, revocation, and usage limit,
   * consuming one use ATOMICALLY. On success, invalidate every SIBLING capability
   * for that fulfillment so at most one download can ever succeed. Never throws.
   */
  async redeem(rawToken: string): Promise<RedeemOutcome> {
    if (!rawToken || !/^[a-f0-9]{64}$/.test(rawToken)) {
      return { ok: false, reason: "invalid" };
    }
    const hash = hashToken(rawToken);
    const nowIso = new Date(this.now()).toISOString();
    const consumed = await this.repo.consume(hash, nowIso);
    if (consumed) {
      await this.repo.revokeSiblings(consumed.fulfillment_id, hash);
      return {
        ok: true,
        organizationId: consumed.organization_id,
        formId: consumed.form_id,
        fulfillmentId: consumed.fulfillment_id,
        fileId: consumed.file_id,
      };
    }
    const row = await this.repo.get(hash);
    if (!row) return { ok: false, reason: "invalid" };
    if (row.revoked) return { ok: false, reason: "revoked" };
    if (row.expires_at <= nowIso) return { ok: false, reason: "expired" };
    return { ok: false, reason: "exhausted" };
  }

  /** Revoke exactly one capability by its raw token (e.g. a failed attempt's). */
  async revoke(rawToken: string): Promise<void> {
    if (!/^[a-f0-9]{64}$/.test(rawToken)) return;
    await this.repo.revokeByHash(hashToken(rawToken));
  }

  /** Revoke all capabilities for a fulfillment (owner/admin control). */
  async revokeForFulfillment(fulfillmentId: string): Promise<void> {
    await this.repo.revokeForFulfillment(fulfillmentId);
  }
}
