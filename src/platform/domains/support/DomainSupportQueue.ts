/**
 * The REDACTED, cross-tenant platform-admin support queue (credential-free
 * release). It surfaces the items that need platform (support-staff) attention
 * across ALL tenants, but every row is minimum-necessary and carries NO
 * registrant PII, domain name, EPP code, payment-method id, contact value/
 * ciphertext, wholesale price, provider credential, or raw provider response —
 * only a coarse category, an opaque item reference, the owning organization, a
 * coarse state, and a timestamp. Support reads this to KNOW where to look; it
 * acts through the owner/admin tools (owners keep their rights), and it can never
 * silently change registrant / nameservers / contacts / privacy / consent /
 * payment authorization from here.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";

export type SupportCategory =
  | "registration_unknown"
  | "renewal_unknown"
  | "transfer_unknown"
  | "delivery_unknown"
  | "needs_attention"
  | "refund_failure"
  | "stale_sync"
  | "stuck_lease"
  | "registrar_funding"
  | "pending_owner_action";

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  "registration_unknown", "renewal_unknown", "transfer_unknown", "delivery_unknown",
  "needs_attention", "refund_failure", "stale_sync", "stuck_lease",
  "registrar_funding", "pending_owner_action",
];

/** One redacted queue row. Deliberately minimal — see the module header. */
export interface SupportQueueItem {
  category: SupportCategory;
  /** Opaque source-row id (order / notice / sync-state key). NOT a domain. */
  itemRef: string;
  organizationId: string;
  /** Coarse state label (never a raw provider message). */
  state: string;
  /** When the underlying row was last observed/updated (ISO), if known. */
  since?: string;
}

export interface SupportQueueQuery {
  nowIso: string;
  /** Lease older than this ISO counts as "stuck". */
  staleLeaseBeforeIso: string;
  category?: SupportCategory;
  limit?: number;
}

/** The read side. A fake implements this for unit tests; PG for real. */
export interface SupportQueueReader {
  listQueue(q: SupportQueueQuery): Promise<SupportQueueItem[]>;
  counts(q: SupportQueueQuery): Promise<Record<SupportCategory, number>>;
}

/** Cross-tenant Postgres reader. Read-only; selects only redacted columns. */
export class PgDomainSupportQueueReader implements SupportQueueReader {
  constructor(private readonly db: PgQueryable) {}

  private selects(): Array<{ category: SupportCategory; sql: (staleParam: string) => string }> {
    // Each fragment returns exactly (category, item_ref, organization_id, state, since).
    return [
      { category: "registration_unknown", sql: () => `SELECT 'registration_unknown' category, id item_ref, organization_id, 'registration_unknown' state, updated_at since FROM domain_orders WHERE status='registration_unknown' OR registrar_state='unknown'` },
      { category: "renewal_unknown", sql: () => `SELECT 'renewal_unknown', id, organization_id, 'renewal_unknown', updated_at FROM domain_renewal_orders WHERE status='renewal_unknown' OR renewal_state='unknown'` },
      { category: "transfer_unknown", sql: () => `SELECT 'transfer_unknown', id, organization_id, 'transfer_unknown', updated_at FROM domain_transfer_requests WHERE state='transfer_unknown'` },
      { category: "delivery_unknown", sql: () => `SELECT 'delivery_unknown', id, organization_id, 'delivery_unknown', updated_at FROM domain_notices WHERE status='delivery_unknown'` },
      { category: "needs_attention", sql: () => `SELECT 'needs_attention', id, organization_id, 'needs_attention', updated_at FROM domain_orders WHERE status='needs_attention'
        UNION ALL SELECT 'needs_attention', id, organization_id, 'needs_attention', updated_at FROM domain_dns_state WHERE provisioning_status='needs_attention'` },
      { category: "refund_failure", sql: () => `SELECT 'refund_failure', id, organization_id, 'refund_failed', updated_at FROM domain_refunds WHERE state IN ('failed','unknown')
        UNION ALL SELECT 'refund_failure', id, organization_id, 'refund_failed', updated_at FROM domain_orders WHERE refund_state IN ('failed','unknown')
        UNION ALL SELECT 'refund_failure', id, organization_id, 'refund_failed', updated_at FROM domain_renewal_orders WHERE refund_state IN ('failed','unknown')` },
      { category: "stale_sync", sql: () => `SELECT 'stale_sync', registration_id, organization_id, 'sync_error', updated_at FROM domain_sync_state WHERE sync_state='error'` },
      // "stuck_lease": a lease that outlived its window across any leased table.
      { category: "stuck_lease", sql: (p) => `SELECT 'stuck_lease', id, organization_id, 'stuck_lease', updated_at FROM domain_orders WHERE lease_until IS NOT NULL AND lease_until < ${p}
        UNION ALL SELECT 'stuck_lease', id, organization_id, 'stuck_lease', updated_at FROM domain_renewal_orders WHERE lease_until IS NOT NULL AND lease_until < ${p}
        UNION ALL SELECT 'stuck_lease', id, organization_id, 'stuck_lease', updated_at FROM domain_refunds WHERE lease_until IS NOT NULL AND lease_until < ${p}
        UNION ALL SELECT 'stuck_lease', registration_id, organization_id, 'stuck_lease', updated_at FROM domain_notices WHERE lease_until IS NOT NULL AND lease_until < ${p}
        UNION ALL SELECT 'stuck_lease', registration_id, organization_id, 'stuck_lease', updated_at FROM domain_sync_state WHERE lease_until IS NOT NULL AND lease_until < ${p}
        UNION ALL SELECT 'stuck_lease', registration_id, organization_id, 'stuck_lease', updated_at FROM domain_lifecycle_state WHERE lease_until IS NOT NULL AND lease_until < ${p}` },
      // "registrar_funding": no telemetry source exists yet in this release, so it
      // is intentionally empty (never fabricated). Kept for shape stability.
      { category: "registrar_funding", sql: () => `SELECT 'registrar_funding'::text, ''::text, ''::text, ''::text, NULL::text WHERE false` },
      { category: "pending_owner_action", sql: () => `SELECT 'pending_owner_action', registration_id, organization_id, notice_type, updated_at FROM domain_notices WHERE notice_type IN ('auto_renew_action_required','contact_verification_required') AND status NOT IN ('accepted','rejected','skipped','terminal')` },
    ];
  }

  async listQueue(q: SupportQueueQuery): Promise<SupportQueueItem[]> {
    const chosen = q.category ? this.selects().filter((s) => s.category === q.category) : this.selects();
    if (chosen.length === 0) return [];
    // $1 = staleLeaseBeforeIso. Only the stuck_lease fragment references it, so
    // when that fragment isn't selected we still anchor $1's type in the outer
    // WHERE (always-true) — otherwise Postgres cannot infer the parameter type.
    const body = chosen.map((s) => `(${s.sql("$1")})`).join("\nUNION ALL\n");
    const r = await this.db.query(`SELECT category, item_ref, organization_id, state, since FROM (\n${body}\n) q WHERE $1::text IS NOT NULL ORDER BY since ASC NULLS FIRST LIMIT $2`, [q.staleLeaseBeforeIso, q.limit ?? 200]);
    return r.rows.map((x) => ({ category: String(x.category) as SupportCategory, itemRef: String(x.item_ref), organizationId: String(x.organization_id), state: String(x.state), since: x.since ? String(x.since) : undefined }));
  }

  async counts(q: SupportQueueQuery): Promise<Record<SupportCategory, number>> {
    const rows = await this.listQueue({ ...q, limit: 100_000 });
    const out = emptyCounts();
    for (const it of rows) out[it.category] += 1;
    return out;
  }
}

export function emptyCounts(): Record<SupportCategory, number> {
  return Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c, 0])) as Record<SupportCategory, number>;
}

/**
 * In-memory reader over an injected set of already-redacted rows — used by unit
 * and real-browser tests (which run without Postgres). Applies the same category
 * filter + ordering + limit as the Postgres reader.
 */
export class InMemorySupportQueueReader implements SupportQueueReader {
  constructor(private readonly rows: SupportQueueItem[] = []) {}

  async listQueue(q: SupportQueueQuery): Promise<SupportQueueItem[]> {
    return this.rows
      .filter((r) => !q.category || r.category === q.category)
      .slice()
      .sort((a, b) => (a.since ?? "") < (b.since ?? "") ? -1 : 1)
      .slice(0, q.limit ?? 200)
      .map((r) => ({ ...r }));
  }

  async counts(q: SupportQueueQuery): Promise<Record<SupportCategory, number>> {
    const out = emptyCounts();
    for (const it of await this.listQueue({ ...q, limit: 100_000 })) out[it.category] += 1;
    return out;
  }
}
