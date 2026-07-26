import { randomUUID } from "node:crypto";

import { AuditRepository } from "./AuditRepository";
import type {
  AuditEventRecord,
  RecordAuditInput,
} from "./AuditEvent";

/**
 * Records security-relevant audit events for the acting tenant. Recording is
 * best-effort — a failure to write the audit trail must never break (or
 * silently allow) the action being audited; it's logged and swallowed. Reads
 * are tenant-scoped.
 */
export class AuditService {
  constructor(
    private readonly repository =
      new AuditRepository(),
    private readonly now: () => number = () =>
      Date.now(),
  ) {}

  async record(
    input: RecordAuditInput,
  ): Promise<void> {
    try {
      await this.repository.create({
        id: randomUUID(),
        action: input.action,
        actorType:
          input.actorType ?? "user",
        actorId: input.actorId,
        actorLabel:
          input.actorLabel,
        targetType:
          input.targetType,
        targetId: input.targetId,
        outcome: input.outcome,
        ip: input.ip,
        metadata: input.metadata,
        createdAt: new Date(
          this.now(),
        ).toISOString(),
      });
    } catch {
      // Best-effort; never throw into the audited action.
    }
  }

  async list(
    limit?: number,
  ): Promise<
    readonly AuditEventRecord[]
  > {
    return this.repository.list(
      limit,
    );
  }
}
