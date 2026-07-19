import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { ProgramRecord } from "./ProgramRecord";
import { ProgramRepository } from "./ProgramRepository";
import type { ProgramRequest } from "./ProgramRequest";

/**
 * Creates and manages ministry programs.
 */
export class ProgramService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new ProgramRepository(),
  ) {}

  /**
   * Creates and stores a new ministry program.
   */
  create(
    request: ProgramRequest,
  ): ProgramRecord {
    // Validate the client only when one is supplied.
    if (request.clientId) {
      this.clients.get(
        request.clientId,
      );
    }

    const name =
      request.name.trim();

    if (!name) {
      throw new Error(
        "A ministry program requires a name.",
      );
    }

    const now =
      new Date().toISOString();

    const program: ProgramRecord = {
      id: randomUUID(),

      clientId:
        request.clientId,

      name,

      category:
        request.category,

      status:
        request.status ??
        "planned",

      leader:
        request.leader,

      schedule:
        request.schedule,

      participants:
        request.participants,

      startDate:
        request.startDate,

      endDate:
        request.endDate,

      description:
        request.description,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      program,
    );
  }

  /**
   * Returns every program.
   */
  list(): readonly ProgramRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one program.
   */
  get(
    programId: string,
  ): ProgramRecord {
    return this.repository.get(
      programId,
    );
  }

  /**
   * Returns all programs for one client.
   */
  listForClient(
    clientId: string,
  ): readonly ProgramRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing program.
   */
  update(
    program: ProgramRecord,
  ): ProgramRecord {
    if (program.clientId) {
      this.clients.get(
        program.clientId,
      );
    }

    return this.repository.update({
      ...program,
      name: program.name.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a program.
   */
  delete(
    programId: string,
  ): void {
    this.repository.delete(
      programId,
    );
  }
}
