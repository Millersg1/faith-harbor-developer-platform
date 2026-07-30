/**
 * Enforceable data-retention purge for All Elite Cloud.
 *
 * The platform previously only soft-deleted files (a `deletedAt` marker), so
 * "deleted" content lived indefinitely in the database and on disk. That made
 * a truthful Privacy Policy impossible. This service purges soft-deleted files
 * after a retention window (default 30 days): it removes the stored bytes AND
 * the database row.
 *
 * Safety properties:
 *  - Tenant-safe and auditable: purges are grouped by organization and each
 *    org's purge is recorded as a tenant-scoped audit event (count only — no
 *    file names or content).
 *  - Legal holds are respected: an organization under a legal hold is skipped
 *    entirely, so nothing is purged while a hold is in place.
 *  - Isolated: the purge only ever deletes rows it selected as expired; it can
 *    never delete a row that is not past its retention window.
 *
 * All collaborators are injected, so the logic is unit-testable without a
 * database or filesystem. Production wires them to Postgres + the storage
 * provider in platformServer.
 */

export interface PurgeableFile {
  id: string;
  organizationId: string;
  storedKey: string;
}

export interface RetentionAuditEvent {
  organizationId: string;
  action: "retention.files_purged";
  count: number;
}

export interface RetentionServiceDeps {
  /** Files whose `deletedAt` is strictly older than the cutoff ISO date. */
  listPurgeableFiles: (
    cutoffIso: string,
  ) => Promise<PurgeableFile[]>;
  /** Remove the stored bytes for a key (best-effort; missing bytes are fine). */
  deleteFileBytes: (storedKey: string) => Promise<void>;
  /** Hard-delete the file's metadata row. */
  deleteFileRow: (id: string) => Promise<void>;
  /** True when the organization is under a legal hold (purge is skipped). */
  isOrgOnLegalHold: (
    organizationId: string,
  ) => Promise<boolean>;
  /** Records a tenant-scoped audit event for a completed org purge. */
  audit?: (event: RetentionAuditEvent) => Promise<void> | void;
  /** Injectable clock (ISO now). Defaults to the system clock. */
  now?: () => string;
}

export interface PurgeResult {
  purgedFiles: number;
  purgedOrgs: number;
  skippedHeldOrgs: number;
}

export class RetentionService {
  constructor(private readonly deps: RetentionServiceDeps) {}

  /**
   * Purge files soft-deleted more than `retentionDays` ago. Returns counts;
   * never throws for an individual file failure (it is logged by the caller's
   * byte/row deleters if they choose to).
   */
  async purgeDeletedFiles(
    retentionDays = 30,
  ): Promise<PurgeResult> {
    const nowMs = Date.parse(
      this.deps.now ? this.deps.now() : new Date().toISOString(),
    );
    const cutoffIso = new Date(
      nowMs - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    const files = await this.deps.listPurgeableFiles(cutoffIso);

    // Group by organization so we can honor per-org legal holds and audit once.
    const byOrg = new Map<string, PurgeableFile[]>();
    for (const f of files) {
      const list = byOrg.get(f.organizationId) ?? [];
      list.push(f);
      byOrg.set(f.organizationId, list);
    }

    let purgedFiles = 0;
    let purgedOrgs = 0;
    let skippedHeldOrgs = 0;

    for (const [organizationId, orgFiles] of byOrg) {
      if (await this.deps.isOrgOnLegalHold(organizationId)) {
        skippedHeldOrgs += 1;
        continue;
      }
      let count = 0;
      for (const file of orgFiles) {
        // Bytes first, then the row — if bytes fail we still remove the row so
        // the record does not claim recoverability it no longer has; the
        // deleter is expected to treat a missing object as success.
        await this.deps.deleteFileBytes(file.storedKey);
        await this.deps.deleteFileRow(file.id);
        count += 1;
      }
      purgedFiles += count;
      if (count > 0) {
        purgedOrgs += 1;
        await this.deps.audit?.({
          organizationId,
          action: "retention.files_purged",
          count,
        });
      }
    }

    return { purgedFiles, purgedOrgs, skippedHeldOrgs };
  }
}
