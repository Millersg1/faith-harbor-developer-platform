import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type {
  DueRunRef,
  WorkflowRecord,
  WorkflowRunLogEntry,
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowStatus,
  WorkflowStep,
} from "./WorkflowTypes";

interface WorkflowRow {
  id: string;
  organization_id: string;
  name: string;
  trigger: string;
  status: string;
  steps: unknown;
  created_at: string;
  updated_at: string;
}

interface RunRow {
  id: string;
  organization_id: string;
  workflow_id: string;
  trigger_type: string;
  subject_type: string | null;
  subject_id: string | null;
  context_email: string | null;
  context_name: string | null;
  step_index: number;
  status: string;
  next_run_at: string;
  log: unknown;
  created_at: string;
  updated_at: string;
}

/**
 * Stores workflows and their runs — tenant-scoped, except {@link dueRuns},
 * the cross-tenant scan the worker uses to find runs ready to advance.
 */
export class WorkflowRepository extends TenantScopedRepository {
  private readonly workflows =
    new Map<string, WorkflowRecord>();

  private readonly runs = new Map<
    string,
    WorkflowRunRecord
  >();

  // ---- Workflows -----------------------------------------------------

  async create(
    record: Omit<
      WorkflowRecord,
      "organizationId"
    >,
  ): Promise<WorkflowRecord> {
    const organizationId =
      this.tenantId();
    const full: WorkflowRecord = {
      ...record,
      organizationId,
    };

    if (this.db) {
      await this.db.query(
        `INSERT INTO workflows
           (id, organization_id, name, trigger, status, steps,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          full.id,
          full.organizationId,
          full.name,
          full.trigger,
          full.status,
          JSON.stringify(full.steps),
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.workflows.set(
      full.id,
      full,
    );

    return full;
  }

  async get(
    id: string,
  ): Promise<
    WorkflowRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM workflows WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | WorkflowRow
        | undefined;

      return row
        ? mapWorkflow(row)
        : undefined;
    }

    const record =
      this.workflows.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(): Promise<
    WorkflowRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM workflows
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return (
        result.rows as unknown as WorkflowRow[]
      ).map(mapWorkflow);
    }

    return [
      ...this.workflows.values(),
    ].filter(
      (w) =>
        w.organizationId ===
        organizationId,
    );
  }

  async listActiveByTrigger(
    trigger: string,
  ): Promise<WorkflowRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM workflows
            WHERE organization_id = $1 AND status = 'active'
              AND trigger = $2`,
          [organizationId, trigger],
        );

      return (
        result.rows as unknown as WorkflowRow[]
      ).map(mapWorkflow);
    }

    return [
      ...this.workflows.values(),
    ].filter(
      (w) =>
        w.organizationId ===
          organizationId &&
        w.status === "active" &&
        w.trigger === trigger,
    );
  }

  async update(
    record: WorkflowRecord,
  ): Promise<WorkflowRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE workflows
            SET name = $3, trigger = $4, status = $5, steps = $6,
                updated_at = $7
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.name,
          record.trigger,
          record.status,
          JSON.stringify(
            record.steps,
          ),
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.workflows.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.workflows.set(
        record.id,
        record,
      );
    }

    return record;
  }

  // ---- Runs ----------------------------------------------------------

  async createRun(
    record: Omit<
      WorkflowRunRecord,
      "organizationId"
    > & { organizationId: string },
  ): Promise<WorkflowRunRecord> {
    const full: WorkflowRunRecord =
      record;

    if (this.db) {
      await this.db.query(
        `INSERT INTO workflow_runs
           (id, organization_id, workflow_id, trigger_type, subject_type,
            subject_id, context_email, context_name, step_index, status,
            next_run_at, log, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          full.id,
          full.organizationId,
          full.workflowId,
          full.triggerType,
          full.subjectType ?? null,
          full.subjectId ?? null,
          full.contextEmail ?? null,
          full.contextName ?? null,
          full.stepIndex,
          full.status,
          full.nextRunAt,
          JSON.stringify(full.log),
          full.createdAt,
          full.updatedAt,
        ],
      );

      return full;
    }

    this.runs.set(full.id, full);

    return full;
  }

  async getRun(
    id: string,
  ): Promise<
    WorkflowRunRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM workflow_runs WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
      const row = result
        .rows[0] as unknown as
        | RunRow
        | undefined;

      return row
        ? mapRun(row)
        : undefined;
    }

    const record = this.runs.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async updateRun(
    record: WorkflowRunRecord,
  ): Promise<WorkflowRunRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE workflow_runs
            SET step_index = $3, status = $4, next_run_at = $5,
                log = $6, updated_at = $7
          WHERE id = $1 AND organization_id = $2`,
        [
          record.id,
          organizationId,
          record.stepIndex,
          record.status,
          record.nextRunAt,
          JSON.stringify(record.log),
          record.updatedAt,
        ],
      );

      return record;
    }

    if (
      this.runs.get(record.id)
        ?.organizationId ===
      organizationId
    ) {
      this.runs.set(
        record.id,
        record,
      );
    }

    return record;
  }

  async listRuns(
    workflowId: string,
    limit = 50,
  ): Promise<WorkflowRunRecord[]> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM workflow_runs
            WHERE organization_id = $1 AND workflow_id = $2
            ORDER BY created_at DESC
            LIMIT $3`,
          [
            organizationId,
            workflowId,
            limit,
          ],
        );

      return (
        result.rows as unknown as RunRow[]
      ).map(mapRun);
    }

    return [...this.runs.values()]
      .filter(
        (r) =>
          r.organizationId ===
            organizationId &&
          r.workflowId ===
            workflowId,
      )
      .sort((a, b) =>
        a.createdAt < b.createdAt
          ? 1
          : -1,
      )
      .slice(0, limit);
  }

  /**
   * SYSTEM ONLY — cross-tenant scan for the worker: running runs due at or
   * before `nowIso`. Each is processed inside its own tenant scope.
   */
  async dueRuns(
    nowIso: string,
    limit: number,
  ): Promise<DueRunRef[]> {
    if (this.db) {
      const result =
        await this.db.query(
          `SELECT id, organization_id FROM workflow_runs
            WHERE status = 'running' AND next_run_at <= $1
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

    return [...this.runs.values()]
      .filter(
        (r) =>
          r.status === "running" &&
          r.nextRunAt <= nowIso,
      )
      .sort((a, b) =>
        a.nextRunAt < b.nextRunAt
          ? -1
          : 1,
      )
      .slice(0, limit)
      .map((r) => ({
        id: r.id,
        organizationId:
          r.organizationId,
      }));
  }
}

function mapWorkflow(
  row: WorkflowRow,
): WorkflowRecord {
  return {
    id: row.id,
    organizationId:
      row.organization_id,
    name: row.name,
    trigger: row.trigger,
    status: row.status as WorkflowStatus,
    steps: parseJson<WorkflowStep[]>(
      row.steps,
      [],
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(
  row: RunRow,
): WorkflowRunRecord {
  const record: WorkflowRunRecord = {
    id: row.id,
    organizationId:
      row.organization_id,
    workflowId: row.workflow_id,
    triggerType: row.trigger_type,
    stepIndex: Number(row.step_index),
    status:
      row.status as WorkflowRunStatus,
    nextRunAt: row.next_run_at,
    log: parseJson<
      WorkflowRunLogEntry[]
    >(row.log, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.subject_type)
    record.subjectType =
      row.subject_type;
  if (row.subject_id)
    record.subjectId = row.subject_id;
  if (row.context_email)
    record.contextEmail =
      row.context_email;
  if (row.context_name)
    record.contextName =
      row.context_name;

  return record;
}

function parseJson<T>(
  value: unknown,
  fallback: T,
): T {
  if (Array.isArray(value))
    return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}
