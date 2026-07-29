import type { PgQueryable } from "../../persistence/PgQueryable";

/**
 * A global (not tenant-scoped) ledger of Stripe webhook event ids we have
 * already handled, so a duplicate or replayed delivery is a no-op. Dedup
 * happens before we resolve which tenant an event belongs to, so this
 * deliberately sits outside the tenant-scoped repositories.
 */
export class ProcessedEventsRepository {
  private readonly memory = new Set<string>();

  constructor(
    private readonly db?: PgQueryable,
  ) {}

  /**
   * Records that `eventId` has been processed. Returns `true` the first time
   * (the caller should process the event) and `false` if it was already
   * recorded (a duplicate — the caller must skip it).
   */
  async markProcessed(
    eventId: string,
    type: string,
  ): Promise<boolean> {
    if (!eventId) {
      // No id to dedupe on — process once, but we can't guarantee idempotency.
      return true;
    }

    if (this.db) {
      const result = await this.db.query(
        `INSERT INTO stripe_processed_events (event_id, type, processed_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (event_id) DO NOTHING`,
        [
          eventId,
          type,
          new Date().toISOString(),
        ],
      );

      return result.rowCount === 1;
    }

    if (this.memory.has(eventId)) {
      return false;
    }

    this.memory.add(eventId);

    return true;
  }
}
