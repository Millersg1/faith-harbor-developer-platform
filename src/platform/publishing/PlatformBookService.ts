import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  isBookStatus,
  type CreatePlatformBookRequest,
  type PlatformBookRecord,
  type UpdatePlatformBookRequest,
} from "./PlatformBook";
import { PlatformBookRepository } from "./PlatformBookRepository";

/**
 * Manages books for the acting tenant. A referenced client is validated
 * through the tenant-scoped client service.
 */
export class PlatformBookService {
  constructor(
    private readonly repository =
      new PlatformBookRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformBookRequest,
  ): Promise<PlatformBookRecord> {
    const title = request.title.trim();

    if (!title) {
      throw new Error(
        "A book needs a title.",
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
      title,
      subtitle: t(request.subtitle),
      author: t(request.author),
      status: isBookStatus(
        request.status,
      )
        ? request.status
        : "draft",
      format: t(request.format),
      isbn: t(request.isbn),
      notes: t(request.notes),
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformBookRecord> {
    const book =
      await this.repository.get(id);

    if (!book) {
      throw new Error(
        "Book not found.",
      );
    }

    return book;
  }

  async list(): Promise<
    readonly PlatformBookRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformBookRequest,
  ): Promise<PlatformBookRecord> {
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

    const updated: PlatformBookRecord =
      {
        ...existing,
        clientId,
        title:
          changes.title?.trim() ||
          existing.title,
        subtitle: u(
          changes.subtitle,
          existing.subtitle,
        ),
        author: u(
          changes.author,
          existing.author,
        ),
        status: isBookStatus(
          changes.status,
        )
          ? changes.status
          : existing.status,
        format: u(
          changes.format,
          existing.format,
        ),
        isbn: u(
          changes.isbn,
          existing.isbn,
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
