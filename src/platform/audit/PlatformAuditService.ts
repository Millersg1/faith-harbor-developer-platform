import { randomUUID } from "node:crypto";

import {
  PlatformAuditRepository,
  type PlatformAuditEventRecord,
} from "./PlatformAuditRepository";

export interface RecordPlatformAuditInput {
  action: string;
  actorType?: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  outcome?: "success" | "failure" | null;
  /** Compact enums/identifiers ONLY — never PII, notes, bodies, or tokens. */
  metadata?: Record<string, unknown>;
}

/**
 * Records durable, queryable, tenant-neutral platform-admin audit events.
 * Recording is best-effort — a failure to write the trail must never break (or
 * silently block) the audited action. Callers pass only compact enums and
 * identifiers; this service never receives or stores names, emails,
 * descriptions, notes, request bodies, or tokens.
 */
export class PlatformAuditService {
  constructor(
    private readonly repository = new PlatformAuditRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async record(input: RecordPlatformAuditInput): Promise<void> {
    try {
      await this.repository.create({
        id: randomUUID(),
        action: input.action,
        actorType: input.actorType ?? "platform_admin",
        actorId: input.actorId ?? null,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        outcome: input.outcome ?? null,
        metadata: input.metadata ?? {},
        createdAt: new Date(this.now()).toISOString(),
      });
    } catch {
      // Best-effort; never throw into the audited action.
    }
  }

  async list(limit?: number): Promise<readonly PlatformAuditEventRecord[]> {
    return this.repository.list(limit);
  }

  async listForTarget(
    targetType: string,
    targetId: string,
    limit?: number,
  ): Promise<readonly PlatformAuditEventRecord[]> {
    return this.repository.listForTarget(targetType, targetId, limit);
  }
}
