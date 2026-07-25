import { randomUUID } from "node:crypto";

import type { PlatformClientService } from "../clients/PlatformClientService";
import {
  normalizeRating,
  type CreatePlatformReviewRequest,
  type PlatformReviewRecord,
  type UpdatePlatformReviewRequest,
} from "./PlatformReview";
import { PlatformReviewRepository } from "./PlatformReviewRepository";

/**
 * Manages customer reviews for the acting tenant. A referenced client is
 * validated through the tenant-scoped client service, so a review can never
 * reference another tenant's client.
 */
export class PlatformReviewService {
  constructor(
    private readonly repository =
      new PlatformReviewRepository(),
    private readonly clients?: PlatformClientService,
  ) {}

  async create(
    request: CreatePlatformReviewRequest,
  ): Promise<PlatformReviewRecord> {
    const author =
      request.author.trim();

    if (!author) {
      throw new Error(
        "A review needs an author.",
      );
    }

    if (request.clientId) {
      await this.assertClientInTenant(
        request.clientId,
      );
    }

    const now =
      new Date().toISOString();

    const replyText =
      request.replyText?.trim() ||
      undefined;

    return this.repository.create({
      id: randomUUID(),
      clientId: request.clientId,
      author,
      rating: normalizeRating(
        request.rating,
      ),
      comment:
        request.comment?.trim() ||
        undefined,
      source:
        request.source?.trim() ||
        undefined,
      replied: Boolean(replyText),
      replyText,
      createdAt: now,
      updatedAt: now,
    });
  }

  async get(
    id: string,
  ): Promise<PlatformReviewRecord> {
    const review =
      await this.repository.get(id);

    if (!review) {
      throw new Error(
        "Review not found.",
      );
    }

    return review;
  }

  async list(): Promise<
    readonly PlatformReviewRecord[]
  > {
    return this.repository.list();
  }

  async update(
    id: string,
    changes: UpdatePlatformReviewRequest,
  ): Promise<PlatformReviewRecord> {
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

    const replyText =
      changes.replyText !== undefined
        ? changes.replyText.trim() ||
          undefined
        : existing.replyText;

    const updated: PlatformReviewRecord =
      {
        ...existing,
        clientId,
        author:
          changes.author?.trim() ||
          existing.author,
        rating:
          changes.rating !== undefined
            ? normalizeRating(
                changes.rating,
              )
            : existing.rating,
        comment:
          changes.comment !==
          undefined
            ? changes.comment.trim() ||
              undefined
            : existing.comment,
        source:
          changes.source !== undefined
            ? changes.source.trim() ||
              undefined
            : existing.source,
        replyText,
        replied: Boolean(replyText),
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
