import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  DripEnrollmentRecord,
  DripEnrollmentStatus,
  DripSequenceRecord,
  DripStatus,
  DripStepRecord,
  DripTrigger,
  DueEnrollmentRef,
} from "./DripTypes";

interface SequenceRow {
  id: string;
  organization_id: string;
  name: string;
  trigger: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  id: string;
  organization_id: string;
  sequence_id: string;
  position: number;
  delay_hours: number;
  subject: string;
  body: string;
  created_at: string;
}

interface EnrollmentRow {
  id: string;
  organization_id: string;
  sequence_id: string;
  email: string;
  name: string | null;
  step_index: number;
  status: string;
  next_run_at: string;
  last_event: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores drip sequences, their steps, and enrollments — all tenant-scoped,
 * except {@link dueRefs}, a deliberately global scan used only by the system
 * worker to discover which enrollments are due across every organization.
 */
export class DripRepository extends TenantScopedRepository {
  private readonly sequences =
    new Map<string, DripSequenceRecord>();

  private readonly steps = new Map<
    string,
    DripStepRecord
  >();

  private readonly enrollments =
    new Map<
      string,
      DripEnrollmentRecord
    >();

  // ---- Sequences -----------------------------------------------------

  async createSequence(
    record: Omit<
      DripSequenceRecord,
      "organizationId"
    >,
  ): Promise<DripSequenceRecord> {
    const organizationId =
      this.tenantId();
    const full: DripSequenceRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO drip_sequences
           (id, organization_id, name, trigger, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          full.id,
          full.organizationId,
          full.name,
          full.trigger,
          full.status,
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.sequences.set(full.id, full);

    return full;
  }

  async getSequence(
    id: string,
  ): Promise<
    DripSequenceRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM drip_sequences WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | SequenceRow
        | undefined;

      return row
        ? mapSequence(row)
        : undefined;
    }

    const record =
      this.sequences.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async listSequences(): Promise<
    DripSequenceRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM drip_sequences
            WHERE organization_id = $1
            ORDER BY created_at ASC`,
          [organizationId],
        );

      return (
        result.rows as unknown as SequenceRow[]
      ).map(mapSequence);
    }

    return [
      ...this.sequences.values(),
    ].filter(
      (s) =>
        s.organizationId ===
        organizationId,
    );
  }

  async updateSequence(
    record: DripSequenceRecord,
  ): Promise<DripSequenceRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE drip_sequences
            SET name = $3, trigger = $4, status = $5, updated_at = $6
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.name,
          record.trigger,
          record.status,
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.sequences.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.sequences.set(
        record.id,
        record,
      );
    }

    return record;
  }

  // ---- Steps ---------------------------------------------------------

  async createStep(
    record: Omit<
      DripStepRecord,
      "organizationId"
    >,
  ): Promise<DripStepRecord> {
    const organizationId =
      this.tenantId();
    const full: DripStepRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO drip_steps
           (id, organization_id, sequence_id, position,
            delay_hours, subject, body, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          full.id,
          full.organizationId,
          full.sequenceId,
          full.position,
          full.delayHours,
          full.subject,
          full.body,
          full.createdAt,
        ],
      );

      return full;
    }

    this.steps.set(full.id, full);

    return full;
  }

  /** Steps for a sequence, ordered by position. Tenant-scoped. */
  async listSteps(
    sequenceId: string,
  ): Promise<DripStepRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM drip_steps
            WHERE organization_id = $1 AND sequence_id = $2
            ORDER BY position ASC`,
          [organizationId, sequenceId],
        );

      return (
        result.rows as unknown as StepRow[]
      ).map(mapStep);
    }

    return [...this.steps.values()]
      .filter(
        (s) =>
          s.organizationId ===
            organizationId &&
          s.sequenceId === sequenceId,
      )
      .sort(
        (a, b) =>
          a.position - b.position,
      );
  }

  // ---- Enrollments ---------------------------------------------------

  async createEnrollment(
    record: Omit<
      DripEnrollmentRecord,
      "organizationId"
    >,
  ): Promise<DripEnrollmentRecord> {
    const organizationId =
      this.tenantId();
    const full: DripEnrollmentRecord =
      { ...record, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO drip_enrollments
           (id, organization_id, sequence_id, email, name,
            step_index, status, next_run_at, last_event, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          full.id,
          full.organizationId,
          full.sequenceId,
          full.email,
          full.name ?? null,
          full.stepIndex,
          full.status,
          full.nextRunAt,
          full.lastEvent ?? null,
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.enrollments.set(
      full.id,
      full,
    );

    return full;
  }

  async getEnrollment(
    id: string,
  ): Promise<
    DripEnrollmentRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM drip_enrollments WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | EnrollmentRow
        | undefined;

      return row
        ? mapEnrollment(row)
        : undefined;
    }

    const record =
      this.enrollments.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async listEnrollments(): Promise<
    DripEnrollmentRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM drip_enrollments
            WHERE organization_id = $1
            ORDER BY created_at DESC
            LIMIT 200`,
          [organizationId],
        );

      return (
        result.rows as unknown as EnrollmentRow[]
      ).map(mapEnrollment);
    }

    return [
      ...this.enrollments.values(),
    ].filter(
      (e) =>
        e.organizationId ===
        organizationId,
    );
  }

  /** An active enrollment for this email in this sequence, if any. */
  async findActiveEnrollment(
    sequenceId: string,
    email: string,
  ): Promise<
    DripEnrollmentRecord | undefined
  > {
    const organizationId =
      this.tenantId();
    const normalized = email
      .trim()
      .toLowerCase();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM drip_enrollments
            WHERE organization_id = $1 AND sequence_id = $2
              AND email = $3 AND status = 'active'
            LIMIT 1`,
          [
            organizationId,
            sequenceId,
            normalized,
          ],
        );
      const row = result
        .rows[0] as unknown as
        | EnrollmentRow
        | undefined;

      return row
        ? mapEnrollment(row)
        : undefined;
    }

    return [
      ...this.enrollments.values(),
    ].find(
      (e) =>
        e.organizationId ===
          organizationId &&
        e.sequenceId ===
          sequenceId &&
        e.email === normalized &&
        e.status === "active",
    );
  }

  async updateEnrollment(
    record: DripEnrollmentRecord,
  ): Promise<DripEnrollmentRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE drip_enrollments
            SET step_index = $3, status = $4,
                next_run_at = $5, last_event = $6, updated_at = $7
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.stepIndex,
          record.status,
          record.nextRunAt,
          record.lastEvent ?? null,
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.enrollments.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.enrollments.set(
        record.id,
        record,
      );
    }

    return record;
  }

  /**
   * SYSTEM ONLY — a deliberately cross-tenant scan for the drip worker.
   * Returns active enrollments due at or before `nowIso`, each paired with
   * its organization so the caller can process it inside that tenant's
   * scope. Not tenant-filtered: this is the one place the worker needs to
   * see every tenant at once.
   */
  async dueRefs(
    nowIso: string,
    limit: number,
  ): Promise<DueEnrollmentRef[]> {
    if (this.db) {
      const result =
        await this.db.query(
          `SELECT id, organization_id FROM drip_enrollments
            WHERE status = 'active' AND next_run_at <= $1
            ORDER BY next_run_at ASC
            LIMIT $2`,
          [nowIso, limit],
        );

      return (
        result.rows as unknown as {
          id: string;
          organization_id: string;
        }[]
      ).map((r) => ({
        id: r.id,
        organizationId:
          r.organization_id,
      }));
    }

    return [
      ...this.enrollments.values(),
    ]
      .filter(
        (e) =>
          e.status === "active" &&
          e.nextRunAt <= nowIso,
      )
      .sort((a, b) =>
        a.nextRunAt < b.nextRunAt
          ? -1
          : 1,
      )
      .slice(0, limit)
      .map((e) => ({
        id: e.id,
        organizationId:
          e.organizationId,
      }));
  }

  /**
   * System-only cross-tenant scan of ALL active enrollments (no time filter),
   * for the legacy→outbox migration/reconciliation. Returns refs only; the
   * caller re-fetches each in its own tenant scope. Ordered by created_at for
   * deterministic, resumable paging.
   */
  async activeRefs(
    limit: number,
    afterCreatedAt?: string,
  ): Promise<DueEnrollmentRef[]> {
    if (this.db) {
      const result = afterCreatedAt
        ? await this.db.query(
            `SELECT id, organization_id FROM drip_enrollments
              WHERE status = 'active' AND created_at > $1
              ORDER BY created_at ASC LIMIT $2`,
            [afterCreatedAt, limit],
          )
        : await this.db.query(
            `SELECT id, organization_id FROM drip_enrollments
              WHERE status = 'active'
              ORDER BY created_at ASC LIMIT $1`,
            [limit],
          );
      return (
        result.rows as unknown as { id: string; organization_id: string }[]
      ).map((r) => ({ id: r.id, organizationId: r.organization_id }));
    }
    return [...this.enrollments.values()]
      .filter(
        (e) =>
          e.status === "active" &&
          (afterCreatedAt === undefined || e.createdAt > afterCreatedAt),
      )
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
      .slice(0, limit)
      .map((e) => ({ id: e.id, organizationId: e.organizationId }));
  }
}

function mapSequence(
  row: SequenceRow,
): DripSequenceRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    name: row.name,
    trigger:
      row.trigger as DripTrigger,
    status: row.status as DripStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapStep(
  row: StepRow,
): DripStepRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    sequenceId: row.sequence_id,
    position: Number(row.position),
    delayHours: Number(
      row.delay_hours,
    ),
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapEnrollment(
  row: EnrollmentRow,
): DripEnrollmentRecord {
  const record: DripEnrollmentRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      sequenceId: row.sequence_id,
      email: row.email,
      stepIndex: Number(
        row.step_index,
      ),
      status:
        row.status as DripEnrollmentStatus,
      nextRunAt: row.next_run_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.name) {
    record.name = row.name;
  }
  if (row.last_event) {
    record.lastEvent = row.last_event;
  }

  return record;
}
