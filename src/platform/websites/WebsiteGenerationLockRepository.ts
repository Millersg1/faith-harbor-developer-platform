import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";

/**
 * A durable, per-website lock guarding AI generation. While a generation is in
 * flight there is exactly one row for that website; a second concurrent or
 * duplicate request fails to claim the lock and is rejected, so no two
 * generations for the same site can both run and both meter AI usage.
 *
 * The Postgres path relies on the primary-key `ON CONFLICT DO NOTHING` for
 * atomic claiming (safe across processes and restarts — unlike an in-memory
 * boolean). The in-memory path (tests) uses a Map with the same semantics.
 * Every operation is tenant-scoped.
 */
export class WebsiteGenerationLockRepository extends TenantScopedRepository {
  private readonly memory = new Set<string>();

  /** Atomically claims the lock. Returns true if claimed, false if already held. */
  async tryLock(websiteId: string, idempotencyKey?: string): Promise<boolean> {
    const organizationId = this.tenantId();

    if (this.db) {
      const result = await this.db.query(
        `INSERT INTO website_generation_locks
             (website_id, organization_id, idempotency_key, started_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (website_id) DO NOTHING
           RETURNING website_id`,
        [
          websiteId,
          organizationId,
          idempotencyKey ?? null,
          new Date().toISOString(),
        ],
      );

      return result.rows.length > 0;
    }

    const key = `${organizationId}:${websiteId}`;
    if (this.memory.has(key)) {
      return false;
    }
    this.memory.add(key);
    return true;
  }

  /** Releases the lock (idempotent). */
  async unlock(websiteId: string): Promise<void> {
    const organizationId = this.tenantId();

    if (this.db) {
      await this.db.query(
        "DELETE FROM website_generation_locks WHERE website_id = $1 AND organization_id = $2",
        [websiteId, organizationId],
      );
      return;
    }

    this.memory.delete(`${organizationId}:${websiteId}`);
  }
}
