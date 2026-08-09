import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * Durable pause state for MARKETING only. Tenant-wide or per-sequence. These
 * rows never affect transactional email (verification, password reset,
 * privacy-request, consent-confirmation, security) — the worker consults them
 * ONLY on the marketing path.
 *
 * Auto-pause records carry a reason ENUM + a threshold string + a recovery note.
 * They NEVER contain an address, SMTP response body, message content, or
 * credential — audit-safe by construction.
 */
export type PauseScope = "tenant" | "sequence";

export type AutoPauseReason =
  | "failure_rate"
  | "connection_failures"
  | "auth_failures"
  | "tls_failures"
  | "permanent_rejections"
  | "repeated_terminal"
  | "delivery_unknown_rate";

export interface PauseRecord {
  scope: PauseScope;
  scopeId: string;
  paused: boolean;
  reason: string | null;
  threshold: string | null;
  recovery: string | null;
  auto: boolean;
  updatedBy: string | null;
  updatedAt: string;
}

interface Row {
  scope: string;
  scope_id: string;
  paused: boolean;
  reason: string | null;
  threshold: string | null;
  recovery: string | null;
  auto: boolean;
  updated_by: string | null;
  updated_at: string;
}

function mapRow(r: Row): PauseRecord {
  return {
    scope: r.scope as PauseScope,
    scopeId: r.scope_id,
    paused: Boolean(r.paused),
    reason: r.reason,
    threshold: r.threshold,
    recovery: r.recovery,
    auto: Boolean(r.auto),
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/** Tenant scope id is the org; sequence scope id is namespaced by org. */
function sequenceScopeId(org: string, sequenceId: string): string {
  return `${org}:${sequenceId}`;
}

export class MarketingPauseRepository {
  private readonly rows = new Map<string, PauseRecord>();

  constructor(private readonly db?: PgQueryable) {}

  private key(scope: PauseScope, scopeId: string): string {
    return `${scope}|${scopeId}`;
  }

  async upsert(rec: PauseRecord): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO marketing_pause
           (scope, scope_id, paused, reason, threshold, recovery, auto,
            updated_by, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (scope, scope_id) DO UPDATE SET
           paused=$3, reason=$4, threshold=$5, recovery=$6, auto=$7,
           updated_by=$8, updated_at=$9`,
        [
          rec.scope, rec.scopeId, rec.paused, rec.reason, rec.threshold,
          rec.recovery, rec.auto, rec.updatedBy, rec.updatedAt,
        ],
      );
      return;
    }
    this.rows.set(this.key(rec.scope, rec.scopeId), rec);
  }

  async get(scope: PauseScope, scopeId: string): Promise<PauseRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM marketing_pause WHERE scope=$1 AND scope_id=$2",
        [scope, scopeId],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    return this.rows.get(this.key(scope, scopeId));
  }

  /** All pause rows for a tenant (tenant row + its sequence rows). */
  async listForOrg(org: string): Promise<PauseRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_pause
           WHERE (scope='tenant' AND scope_id=$1)
              OR (scope='sequence' AND scope_id LIKE $2)`,
        [org, `${org}:%`],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    const out: PauseRecord[] = [];
    for (const rec of this.rows.values()) {
      if (
        (rec.scope === "tenant" && rec.scopeId === org) ||
        (rec.scope === "sequence" && rec.scopeId.startsWith(`${org}:`))
      ) {
        out.push(rec);
      }
    }
    return out;
  }
}

export class MarketingPauseService {
  constructor(
    private readonly repo = new MarketingPauseRepository(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async pauseTenant(
    org: string,
    opts: {
      actor: string;
      auto?: boolean;
      reason?: string;
      threshold?: string;
      recovery?: string;
    },
  ): Promise<void> {
    await this.repo.upsert({
      scope: "tenant",
      scopeId: org,
      paused: true,
      reason: opts.reason ?? "manual",
      threshold: opts.threshold ?? null,
      recovery: opts.recovery ?? "manual_resume_required",
      auto: opts.auto ?? false,
      updatedBy: opts.actor,
      updatedAt: this.now(),
    });
  }

  async resumeTenant(org: string, actor: string): Promise<void> {
    await this.repo.upsert({
      scope: "tenant",
      scopeId: org,
      paused: false,
      reason: null,
      threshold: null,
      recovery: null,
      auto: false,
      updatedBy: actor,
      updatedAt: this.now(),
    });
  }

  async isTenantPaused(org: string): Promise<boolean> {
    return Boolean((await this.repo.get("tenant", org))?.paused);
  }

  async pauseSequence(org: string, sequenceId: string, actor: string): Promise<void> {
    await this.repo.upsert({
      scope: "sequence",
      scopeId: sequenceScopeId(org, sequenceId),
      paused: true,
      reason: "manual",
      threshold: null,
      recovery: null,
      auto: false,
      updatedBy: actor,
      updatedAt: this.now(),
    });
  }

  async resumeSequence(org: string, sequenceId: string, actor: string): Promise<void> {
    await this.repo.upsert({
      scope: "sequence",
      scopeId: sequenceScopeId(org, sequenceId),
      paused: false,
      reason: null,
      threshold: null,
      recovery: null,
      auto: false,
      updatedBy: actor,
      updatedAt: this.now(),
    });
  }

  async isSequencePaused(org: string, sequenceId: string): Promise<boolean> {
    return Boolean(
      (await this.repo.get("sequence", sequenceScopeId(org, sequenceId)))?.paused,
    );
  }

  /** Owner/admin visibility (PII-free pause rows). */
  async list(org: string): Promise<PauseRecord[]> {
    return this.repo.listForOrg(org);
  }
}
