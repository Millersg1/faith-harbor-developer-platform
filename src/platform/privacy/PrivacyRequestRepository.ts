import type { PgQueryable } from "../../persistence/PgQueryable";
import type {
  PrivacyCategory,
  PrivacyDestination,
  PrivacyRequestNote,
  PrivacyRequestRecord,
  PrivacyStatus,
  VerificationState,
} from "./PrivacyRequest";

/** Token secrets stored ONLY as hashes, alongside the request row. */
export interface PrivacyRequestSecrets {
  verifyTokenHash: string | null;
  verifyExpiresAt: string | null;
  statusTokenHash: string | null;
}

interface Row {
  id: string;
  destination: string;
  organization_id: string | null;
  type: string; // reused column = category
  name: string | null;
  email: string;
  details: string | null; // reused column = description
  relationship: string | null;
  verification_state: string;
  status: string;
  assigned_to: string | null;
  resolution_summary: string | null;
  due_date: string | null;
  due_date_source: string | null;
  created_at: string;
  updated_at: string;
  verified_at: string | null;
  acknowledged_at: string | null;
  completed_at: string | null;
  denied_at: string | null;
  closed_at: string | null;
  purge_after: string | null;
  verify_token_hash: string | null;
  verify_expires_at: string | null;
  status_token_hash: string | null;
}

export interface ListFilters {
  status?: PrivacyStatus;
  category?: PrivacyCategory;
}

/**
 * Stores privacy requests. NOT a blanket TenantScopedRepository, because
 * platform requests have no organization. Instead every management read/write
 * takes an EXPLICIT scope and fails closed:
 *  - tenant methods require a non-empty organization id and filter on it;
 *  - platform methods only ever match rows with destination='platform'
 *    (organization_id IS NULL).
 * Token lookups are by hash (the unguessable token is the capability) and are
 * intentionally destination-agnostic. In memory for tests; Postgres otherwise.
 */
export class PrivacyRequestRepository {
  private readonly memory = new Map<string, Row>();
  private readonly notes = new Map<string, PrivacyRequestNote>();

  constructor(private readonly db?: PgQueryable) {}

  async create(
    record: PrivacyRequestRecord,
    secrets: PrivacyRequestSecrets,
  ): Promise<PrivacyRequestRecord> {
    const row = toRow(record, secrets);
    if (this.db) {
      await this.db.query(
        `INSERT INTO privacy_requests
           (id, destination, organization_id, type, name, email, details,
            relationship, verification_state, status, assigned_to,
            resolution_summary, due_date, due_date_source, created_at,
            updated_at, verified_at, acknowledged_at, completed_at, denied_at,
            closed_at, purge_after, verify_token_hash, verify_expires_at,
            status_token_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20,$21,$22,$23,$24,$25)`,
        [
          row.id, row.destination, row.organization_id, row.type, row.name,
          row.email, row.details, row.relationship, row.verification_state,
          row.status, row.assigned_to, row.resolution_summary, row.due_date,
          row.due_date_source, row.created_at, row.updated_at, row.verified_at,
          row.acknowledged_at, row.completed_at, row.denied_at, row.closed_at,
          row.purge_after, row.verify_token_hash, row.verify_expires_at,
          row.status_token_hash,
        ],
      );
      return record;
    }
    this.memory.set(row.id, row);
    return record;
  }

  async getForTenant(
    id: string,
    organizationId: string,
  ): Promise<PrivacyRequestRecord | undefined> {
    if (!organizationId) {
      throw new Error("Tenant scope required.");
    }
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM privacy_requests
          WHERE id=$1 AND organization_id=$2 AND destination='tenant'`,
        [id, organizationId],
      );
      return mapOne(r.rows[0]);
    }
    const row = this.memory.get(id);
    return row &&
      row.organization_id === organizationId &&
      row.destination === "tenant"
      ? mapRow(row)
      : undefined;
  }

  async getPlatform(
    id: string,
  ): Promise<PrivacyRequestRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM privacy_requests WHERE id=$1 AND destination='platform'`,
        [id],
      );
      return mapOne(r.rows[0]);
    }
    const row = this.memory.get(id);
    return row && row.destination === "platform"
      ? mapRow(row)
      : undefined;
  }

  async listForTenant(
    organizationId: string,
    filters: ListFilters = {},
  ): Promise<PrivacyRequestRecord[]> {
    if (!organizationId) {
      throw new Error("Tenant scope required.");
    }
    return this.list(
      { destination: "tenant", organizationId },
      filters,
    );
  }

  async listPlatform(
    filters: ListFilters = {},
  ): Promise<PrivacyRequestRecord[]> {
    return this.list({ destination: "platform" }, filters);
  }

  private async list(
    scope: { destination: PrivacyDestination; organizationId?: string },
    filters: ListFilters,
  ): Promise<PrivacyRequestRecord[]> {
    if (this.db) {
      const clauses = ["destination=$1"];
      const params: unknown[] = [scope.destination];
      if (scope.destination === "tenant") {
        params.push(scope.organizationId);
        clauses.push(`organization_id=$${params.length}`);
      } else {
        clauses.push("organization_id IS NULL");
      }
      if (filters.status) {
        params.push(filters.status);
        clauses.push(`status=$${params.length}`);
      }
      if (filters.category) {
        params.push(filters.category);
        clauses.push(`type=$${params.length}`);
      }
      const r = await this.db.query(
        `SELECT * FROM privacy_requests WHERE ${clauses.join(
          " AND ",
        )} ORDER BY created_at DESC`,
        params,
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return Array.from(this.memory.values())
      .filter((row) => {
        if (row.destination !== scope.destination) return false;
        if (
          scope.destination === "tenant" &&
          row.organization_id !== scope.organizationId
        )
          return false;
        if (filters.status && row.status !== filters.status) return false;
        if (filters.category && row.type !== filters.category) return false;
        return true;
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map(mapRow);
  }

  /** Lookup for email verification. Returns the record + verify metadata. */
  async findByVerifyTokenHash(
    hash: string,
  ): Promise<
    | { record: PrivacyRequestRecord; verifyExpiresAt: string | null }
    | undefined
  > {
    const row = await this.rowByColumn("verify_token_hash", hash);
    return row
      ? { record: mapRow(row), verifyExpiresAt: row.verify_expires_at }
      : undefined;
  }

  async findByStatusTokenHash(
    hash: string,
  ): Promise<PrivacyRequestRecord | undefined> {
    const row = await this.rowByColumn("status_token_hash", hash);
    return row ? mapRow(row) : undefined;
  }

  private async rowByColumn(
    column: "verify_token_hash" | "status_token_hash",
    value: string,
  ): Promise<Row | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM privacy_requests WHERE ${column}=$1 LIMIT 1`,
        [value],
      );
      return (r.rows[0] as unknown as Row) ?? undefined;
    }
    return Array.from(this.memory.values()).find(
      (row) => row[column] === value,
    );
  }

  /**
   * Persist mutable fields. `secrets` (when provided) updates the token hashes
   * — e.g. clearing the verify token on single use.
   */
  async update(
    record: PrivacyRequestRecord,
    secrets?: Partial<PrivacyRequestSecrets>,
  ): Promise<PrivacyRequestRecord> {
    if (this.db) {
      const existing = await this.db.query(
        "SELECT verify_token_hash, verify_expires_at, status_token_hash FROM privacy_requests WHERE id=$1",
        [record.id],
      );
      const cur = (existing.rows[0] as unknown as Row) ?? undefined;
      const s: PrivacyRequestSecrets = {
        verifyTokenHash:
          secrets && "verifyTokenHash" in secrets
            ? secrets.verifyTokenHash ?? null
            : cur?.verify_token_hash ?? null,
        verifyExpiresAt:
          secrets && "verifyExpiresAt" in secrets
            ? secrets.verifyExpiresAt ?? null
            : cur?.verify_expires_at ?? null,
        statusTokenHash:
          secrets && "statusTokenHash" in secrets
            ? secrets.statusTokenHash ?? null
            : cur?.status_token_hash ?? null,
      };
      const row = toRow(record, s);
      await this.db.query(
        `UPDATE privacy_requests SET
           type=$2, name=$3, details=$4, relationship=$5,
           verification_state=$6, status=$7, assigned_to=$8,
           resolution_summary=$9, due_date=$10, due_date_source=$11,
           updated_at=$12, verified_at=$13, acknowledged_at=$14,
           completed_at=$15, denied_at=$16, closed_at=$17, purge_after=$18,
           verify_token_hash=$19, verify_expires_at=$20, status_token_hash=$21
         WHERE id=$1`,
        [
          row.id, row.type, row.name, row.details, row.relationship,
          row.verification_state, row.status, row.assigned_to,
          row.resolution_summary, row.due_date, row.due_date_source,
          row.updated_at, row.verified_at, row.acknowledged_at,
          row.completed_at, row.denied_at, row.closed_at, row.purge_after,
          row.verify_token_hash, row.verify_expires_at, row.status_token_hash,
        ],
      );
      return record;
    }
    const cur = this.memory.get(record.id);
    const s: PrivacyRequestSecrets = {
      verifyTokenHash:
        secrets && "verifyTokenHash" in secrets
          ? secrets.verifyTokenHash ?? null
          : cur?.verify_token_hash ?? null,
      verifyExpiresAt:
        secrets && "verifyExpiresAt" in secrets
          ? secrets.verifyExpiresAt ?? null
          : cur?.verify_expires_at ?? null,
      statusTokenHash:
        secrets && "statusTokenHash" in secrets
          ? secrets.statusTokenHash ?? null
          : cur?.status_token_hash ?? null,
    };
    this.memory.set(record.id, toRow(record, s));
    return record;
  }

  async addNote(note: PrivacyRequestNote): Promise<PrivacyRequestNote> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO privacy_request_notes
           (id, request_id, visibility, author_id, body, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          note.id, note.requestId, note.visibility, note.authorId,
          note.body, note.createdAt,
        ],
      );
      return note;
    }
    this.notes.set(note.id, note);
    return note;
  }

  async listNotes(
    requestId: string,
  ): Promise<PrivacyRequestNote[]> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM privacy_request_notes WHERE request_id=$1 ORDER BY created_at",
        [requestId],
      );
      return r.rows.map((raw) => {
        const n = raw as unknown as {
          id: string;
          request_id: string;
          visibility: string;
          author_id: string | null;
          body: string;
          created_at: string;
        };
        return {
          id: n.id,
          requestId: n.request_id,
          visibility: n.visibility as "internal" | "requester",
          authorId: n.author_id,
          body: n.body,
          createdAt: n.created_at,
        };
      });
    }
    return Array.from(this.notes.values())
      .filter((n) => n.requestId === requestId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}

function toRow(
  r: PrivacyRequestRecord,
  s: PrivacyRequestSecrets,
): Row {
  return {
    id: r.id,
    destination: r.destination,
    organization_id: r.organizationId,
    type: r.category,
    name: r.name,
    email: r.email,
    details: r.description,
    relationship: r.relationship,
    verification_state: r.verificationState,
    status: r.status,
    assigned_to: r.assignedTo,
    resolution_summary: r.resolutionSummary,
    due_date: r.dueDate,
    due_date_source: r.dueDateSource,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
    verified_at: r.verifiedAt,
    acknowledged_at: r.acknowledgedAt,
    completed_at: r.completedAt,
    denied_at: r.deniedAt,
    closed_at: r.closedAt,
    purge_after: r.purgeAfter,
    verify_token_hash: s.verifyTokenHash,
    verify_expires_at: s.verifyExpiresAt,
    status_token_hash: s.statusTokenHash,
  };
}

function mapOne(
  raw: Record<string, unknown> | undefined,
): PrivacyRequestRecord | undefined {
  return raw ? mapRow(raw as unknown as Row) : undefined;
}

function mapRow(row: Row): PrivacyRequestRecord {
  return {
    id: row.id,
    destination: row.destination as PrivacyDestination,
    organizationId: row.organization_id,
    category: row.type as PrivacyCategory,
    name: row.name ?? "",
    email: row.email,
    description: row.details ?? "",
    relationship: row.relationship,
    verificationState: row.verification_state as VerificationState,
    status: row.status as PrivacyStatus,
    assignedTo: row.assigned_to,
    resolutionSummary: row.resolution_summary,
    dueDate: row.due_date,
    dueDateSource:
      (row.due_date_source as "staff" | "policy" | null) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    verifiedAt: row.verified_at,
    acknowledgedAt: row.acknowledged_at,
    completedAt: row.completed_at,
    deniedAt: row.denied_at,
    closedAt: row.closed_at,
    purgeAfter: row.purge_after,
  };
}
