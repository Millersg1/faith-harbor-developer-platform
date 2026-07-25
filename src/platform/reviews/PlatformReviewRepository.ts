import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { PlatformReviewRecord } from "./PlatformReview";

interface ReviewRow {
  id: string;
  organization_id: string;
  client_id: string | null;
  author: string;
  rating: number;
  comment: string | null;
  source: string | null;
  replied: boolean | number;
  reply_text: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Stores customer reviews, always scoped to the current tenant. Same
 * isolation contract as every tenant-scoped repository.
 */
export class PlatformReviewRepository extends TenantScopedRepository {
  private readonly memory =
    new Map<
      string,
      PlatformReviewRecord
    >();

  async create(
    review: Omit<
      PlatformReviewRecord,
      "organizationId"
    >,
  ): Promise<PlatformReviewRecord> {
    const organizationId =
      this.tenantId();

    const record: PlatformReviewRecord =
      { ...review, organizationId };

    if (this.db) {
      await this.db.query(
        `INSERT INTO reviews
           (id, organization_id, client_id, author, rating, comment,
            source, replied, reply_text, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          record.id,
          record.organizationId,
          record.clientId ?? null,
          record.author,
          record.rating,
          record.comment ?? null,
          record.source ?? null,
          record.replied,
          record.replyText ?? null,
          record.createdAt,
          record.updatedAt,
        ],
      );

      return record;
    }

    this.memory.set(
      record.id,
      record,
    );

    return record;
  }

  async get(
    id: string,
  ): Promise<
    PlatformReviewRecord | undefined
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          "SELECT * FROM reviews WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );

      const row = asRow(
        result.rows[0],
      );

      return row
        ? mapRow(row)
        : undefined;
    }

    const record = this.memory.get(id);

    return record &&
      record.organizationId ===
        organizationId
      ? record
      : undefined;
  }

  async list(): Promise<
    PlatformReviewRecord[]
  > {
    const organizationId =
      this.tenantId();

    if (this.db) {
      const result =
        await this.db.query(
          `SELECT * FROM reviews
            WHERE organization_id = $1
            ORDER BY created_at DESC`,
          [organizationId],
        );

      return result.rows
        .map(asRow)
        .filter(
          (
            row,
          ): row is ReviewRow =>
            row !== undefined,
        )
        .map(mapRow);
    }

    return Array.from(
      this.memory.values(),
    ).filter(
      (record) =>
        record.organizationId ===
        organizationId,
    );
  }

  async update(
    review: PlatformReviewRecord,
  ): Promise<PlatformReviewRecord> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        `UPDATE reviews
            SET client_id = $3, author = $4, rating = $5, comment = $6,
                source = $7, replied = $8, reply_text = $9, updated_at = $10
          WHERE id = $1 AND organization_id = $2`,
        [
          review.id,
          organizationId,
          review.clientId ?? null,
          review.author,
          review.rating,
          review.comment ?? null,
          review.source ?? null,
          review.replied,
          review.replyText ?? null,
          review.updatedAt,
        ],
      );

      return review;
    }

    const existing = this.memory.get(
      review.id,
    );

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.set(
        review.id,
        review,
      );
    }

    return review;
  }

  async delete(
    id: string,
  ): Promise<void> {
    const organizationId =
      this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM reviews WHERE id = $1 AND organization_id = $2",
        [id, organizationId],
      );

      return;
    }

    const existing = this.memory.get(id);

    if (
      existing &&
      existing.organizationId ===
        organizationId
    ) {
      this.memory.delete(id);
    }
  }
}

function asRow(
  row: Record<string, unknown> | undefined,
): ReviewRow | undefined {
  return row as ReviewRow | undefined;
}

function mapRow(
  row: ReviewRow,
): PlatformReviewRecord {
  const record: PlatformReviewRecord =
    {
      id: row.id,
      organizationId:
        row.organization_id,
      author: row.author,
      rating: Number(row.rating),
      replied:
        row.replied === true ||
        row.replied === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

  if (row.client_id)
    record.clientId = row.client_id;
  if (row.comment)
    record.comment = row.comment;
  if (row.source)
    record.source = row.source;
  if (row.reply_text)
    record.replyText = row.reply_text;

  return record;
}
