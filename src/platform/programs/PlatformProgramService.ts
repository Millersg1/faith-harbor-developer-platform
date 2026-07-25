import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isProgramStatus,
  type CreatePlatformProgramRequest,
  type PlatformProgramRecord,
  type UpdatePlatformProgramRequest,
} from "./PlatformProgram";
import { PlatformProgramRepository } from "./PlatformProgramRepository";

/**
 * Manages programs for the acting tenant. A referenced client is validated
 * through the tenant-scoped client service.
 */
export class PlatformProgramService {
  constructor(
    private readonly repository =
      new PlatformProgramRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformProgramRequest,
  ): Promise<PlatformProgramRecord> {
    const name = request.name.trim();

    if (!name) {
      throw new Error(
        "A program needs a name.",
      );
    }

    if (request.clientId) {
      await this.assertClientInTenant(
        request.clientId,
      );
    }

    const now =
      new Date().toISOString();

    return this.repository.create({
      id: randomUUID(),
      clientId: request.clientId,
      name,
      category: t(request.category),
      status: isProgramStatus(
        request.status,
      )
        ? request.status
        : "planned",
      leader: t(request.leader),
      schedule: t(request.schedule),
      description: t(
        request.description,
      ),
      notes: t(request.notes),
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformProgramRecord> {
    const program =
      await this.repository.get(id);

    if (!program) {
      throw new Error(
        "Program not found.",
      );
    }

    return program;
  }

  async list(): Promise<
    readonly PlatformProgramRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformProgramRequest,
  ): Promise<PlatformProgramRecord> {
    const existing =
      await this.get(id);

    if (changes.clientId) {
      await this.assertClientInTenant(
        changes.clientId,
      );
    }

    const clientId =
      changes.clientId === null
        ? undefined
        : (changes.clientId ??
          existing.clientId);

    const updated: PlatformProgramRecord =
      {
        ...existing,
        clientId,
        name:
          changes.name?.trim() ||
          existing.name,
        category: u(
          changes.category,
          existing.category,
        ),
        status: isProgramStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
        leader: u(
          changes.leader,
          existing.leader,
        ),
        schedule: u(
          changes.schedule,
          existing.schedule,
        ),
        description: u(
          changes.description,
          existing.description,
        ),
        notes: u(
          changes.notes,
          existing.notes,
        ),
        updatedAt:
          new Date().toISOString(),
      };

    return this.repository.update(
      updated,
    );
  }

  async delete(
    id: string,
  ): Promise<void> {
    await this.repository.delete(id);
  }

  private async assertClientInTenant(
    clientId: string,
  ): Promise<void> {
    if (!this.clients) {
      throw new Error(
        "Cannot attach a client: client service is unavailable.",
      );
    }

    await this.clients.get(clientId);
  }
}

function t(
  v: string | undefined,
): string | undefined {
  return v?.trim() || undefined;
}

function u(
  change: string | undefined,
  existing: string | undefined,
): string | undefined {
  if (change === undefined)
    return existing;
  return change.trim() || undefined;
}
