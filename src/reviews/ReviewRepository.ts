import type {
  DatabaseSync,
} from "node:sqlite";

import type {
  ReviewProfile,
  ReviewRecord,
} from "./ReviewTypes";

interface ProfileRow {
  client_id: string;
  business_name: string;
  review_url: string;
  google_place_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ReviewRow {
  id: string;
  client_id: string;
  author: string;
  rating: number;
  comment: string;
  created_at: string;
  replied: number;
  reply_text: string | null;
}

/**
 * Stores per-client review profiles and any imported Google reviews.
 *
 * Without a database connection everything is kept in memory; with
 * SQLite it persists across restarts.
 */
export class ReviewRepository {
  private readonly profiles =
    new Map<string, ReviewProfile>();

  private readonly reviews =
    new Map<string, ReviewRecord>();

  constructor(
    private readonly database?: DatabaseSync,
  ) {}

  upsertProfile(
    profile: ReviewProfile,
  ): ReviewProfile {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO review_profiles (
            client_id,
            business_name,
            review_url,
            google_place_id,
            created_at,
            updated_at
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(client_id) DO UPDATE SET
            business_name = excluded.business_name,
            review_url = excluded.review_url,
            google_place_id = excluded.google_place_id,
            updated_at = excluded.updated_at
        `)
        .run(
          profile.clientId,
          profile.businessName,
          profile.reviewUrl,
          profile.googlePlaceId ??
            null,
          profile.createdAt,
          profile.updatedAt,
        );

      return profile;
    }

    this.profiles.set(
      profile.clientId,
      profile,
    );

    return profile;
  }

  getProfile(
    clientId: string,
  ): ReviewProfile | undefined {
    if (this.database) {
      const row =
        this.database
          .prepare(`
            SELECT
              client_id,
              business_name,
              review_url,
              google_place_id,
              created_at,
              updated_at
            FROM review_profiles
            WHERE client_id = ?
          `)
          .get(clientId) as unknown as
          ProfileRow | undefined;

      return row
        ? this.mapProfile(row)
        : undefined;
    }

    return this.profiles.get(
      clientId,
    );
  }

  listProfiles(): ReviewProfile[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              client_id,
              business_name,
              review_url,
              google_place_id,
              created_at,
              updated_at
            FROM review_profiles
            ORDER BY business_name ASC
          `)
          .all() as unknown as
          ProfileRow[];

      return rows.map((row) =>
        this.mapProfile(row),
      );
    }

    return Array.from(
      this.profiles.values(),
    );
  }

  saveReview(
    review: ReviewRecord,
  ): ReviewRecord {
    if (this.database) {
      this.database
        .prepare(`
          INSERT INTO google_reviews (
            id, client_id, author, rating,
            comment, created_at, replied, reply_text
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            replied = excluded.replied,
            reply_text = excluded.reply_text
        `)
        .run(
          review.id,
          review.clientId,
          review.author,
          review.rating,
          review.comment,
          review.createdAt,
          review.replied ? 1 : 0,
          review.replyText ?? null,
        );

      return review;
    }

    this.reviews.set(
      review.id,
      review,
    );

    return review;
  }

  listReviews(
    clientId: string,
  ): ReviewRecord[] {
    if (this.database) {
      const rows =
        this.database
          .prepare(`
            SELECT
              id, client_id, author, rating,
              comment, created_at, replied, reply_text
            FROM google_reviews
            WHERE client_id = ?
            ORDER BY created_at DESC
          `)
          .all(clientId) as unknown as
          ReviewRow[];

      return rows.map((row) =>
        this.mapReview(row),
      );
    }

    return Array.from(
      this.reviews.values(),
    ).filter(
      (review) =>
        review.clientId === clientId,
    );
  }

  private mapProfile(
    row: ProfileRow,
  ): ReviewProfile {
    return {
      clientId: row.client_id,
      businessName:
        row.business_name,
      reviewUrl: row.review_url,
      googlePlaceId:
        row.google_place_id ??
        undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapReview(
    row: ReviewRow,
  ): ReviewRecord {
    return {
      id: row.id,
      clientId: row.client_id,
      author: row.author,
      rating: row.rating,
      comment: row.comment,
      createdAt: row.created_at,
      replied: row.replied === 1,
      replyText:
        row.reply_text ?? undefined,
    };
  }
}
