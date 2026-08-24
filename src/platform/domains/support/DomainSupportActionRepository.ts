/**
 * Append-only audit of PLATFORM-ADMIN support actions against the cross-tenant
 * ops queue (`domain_support_queue_actions`; distinct from the older order-scoped
 * `domain_support_actions` table). Cross-tenant (NOT tenant-scoped): each
 * row explicitly carries the owning organization of the queue item it concerns.
 * Rows are ONLY ever inserted — never updated or deleted — so the support trail
 * is immutable. No registrant PII / EPP / payment id / contact value / price /
 * raw provider response is stored: only a coarse queue reference, the acting
 * admin id, an action verb, and the evidence/note the admin typed.
 */

import type { PgQueryable } from "../../../persistence/PgQueryable";
import type { SupportCategory } from "./DomainSupportQueue";

export type SupportActionVerb =
  | "acknowledge"
  | "record_reconciliation"
  | "mark_resolved"
  | "escalate";

export interface SupportActionRow {
  id: string;
  organizationId: string;
  adminId: string;
  itemCategory: SupportCategory;
  itemRef: string;
  action: SupportActionVerb;
  evidence?: string;
  note?: string;
  createdAt: string;
}

export class DomainSupportActionRepository {
  private readonly mem: SupportActionRow[] = [];

  constructor(private readonly db?: PgQueryable) {}

  async append(input: Omit<SupportActionRow, "createdAt"> & { now: string }): Promise<void> {
    if (this.db) {
      await this.db.query(
        `INSERT INTO domain_support_queue_actions
           (id, organization_id, admin_id, item_category, item_ref, action, evidence, note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [input.id, input.organizationId, input.adminId, input.itemCategory, input.itemRef, input.action, input.evidence ?? null, input.note ?? null, input.now],
      );
      return;
    }
    this.mem.push({ id: input.id, organizationId: input.organizationId, adminId: input.adminId, itemCategory: input.itemCategory, itemRef: input.itemRef, action: input.action, evidence: input.evidence, note: input.note, createdAt: input.now });
  }

  /** Immutable action history for one queue item (oldest first). */
  async listForItem(itemCategory: SupportCategory, itemRef: string): Promise<SupportActionRow[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_support_queue_actions WHERE item_category=$1 AND item_ref=$2 ORDER BY created_at ASC`,
        [itemCategory, itemRef],
      );
      return r.rows.map(mapAction);
    }
    return this.mem.filter((a) => a.itemCategory === itemCategory && a.itemRef === itemRef).map((a) => ({ ...a }));
  }
}

export function mapAction(row: Record<string, unknown>): SupportActionRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    adminId: String(row.admin_id),
    itemCategory: String(row.item_category) as SupportCategory,
    itemRef: String(row.item_ref),
    action: String(row.action) as SupportActionVerb,
    evidence: row.evidence ? String(row.evidence) : undefined,
    note: row.note ? String(row.note) : undefined,
    createdAt: String(row.created_at),
  };
}
