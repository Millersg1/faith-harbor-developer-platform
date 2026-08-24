/**
 * Application service for the platform-admin support queue. Composes the redacted
 * cross-tenant reader with the append-only action audit and enforces the safety
 * rules the owner set:
 *
 *  - EVIDENCE-GATED actions: `record_reconciliation` and `escalate` require a
 *    typed note; `mark_resolved` requires typed evidence.
 *  - READ-ONLY RECONCILIATION BEFORE RESOLUTION: an item can only be
 *    `mark_resolved` after a `record_reconciliation` has been logged for it.
 *  - NO BLIND RETRY: there is no retry/mutate verb here at all — support records
 *    findings and routes work; it never changes registrant / nameservers /
 *    contacts / privacy / consent / payment auth from this surface.
 *  - The acting item's owning organization is taken from the AUTHORITATIVE live
 *    queue row, never from client input, and an item must currently be in the
 *    queue to be acted on.
 *
 * Reauthentication of the admin is performed by the router (per-call, via
 * PlatformAdminService.authenticate) BEFORE calling `recordAction`; this service
 * receives an already-verified admin id.
 */

import type { DomainSupportActionRepository, SupportActionRow, SupportActionVerb } from "./DomainSupportActionRepository";
import type { SupportCategory, SupportQueueItem, SupportQueueReader } from "./DomainSupportQueue";

export class SupportQueueError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "SupportQueueError";
  }
}

export interface DomainSupportQueueServiceDeps {
  reader: SupportQueueReader;
  actions: DomainSupportActionRepository;
  now: () => string;
  newId: () => string;
  /** How old a lease must be (ms) to count as "stuck". */
  stuckLeaseAfterMs?: number;
}

const VALID_VERBS: SupportActionVerb[] = ["acknowledge", "record_reconciliation", "mark_resolved", "escalate"];

export class DomainSupportQueueService {
  constructor(private readonly d: DomainSupportQueueServiceDeps) {}

  private query(category?: SupportCategory, limit?: number) {
    const now = this.d.now();
    return {
      nowIso: now,
      staleLeaseBeforeIso: new Date(Date.parse(now) - (this.d.stuckLeaseAfterMs ?? 15 * 60_000)).toISOString(),
      category,
      limit,
    };
  }

  async listQueue(category?: SupportCategory, limit?: number): Promise<SupportQueueItem[]> {
    return this.d.reader.listQueue(this.query(category, limit));
  }

  async counts(): Promise<Record<SupportCategory, number>> {
    return this.d.reader.counts(this.query());
  }

  /** Redacted detail: the live queue row (if still present) + its audit history. */
  async getItem(category: SupportCategory, itemRef: string): Promise<{ item: SupportQueueItem | null; actions: SupportActionRow[] }> {
    const item = (await this.d.reader.listQueue(this.query(category, 100_000))).find((i) => i.itemRef === itemRef) ?? null;
    const actions = await this.d.actions.listForItem(category, itemRef);
    return { item, actions };
  }

  /**
   * Records an evidence-gated support action against a live queue item. Returns
   * the appended (redacted) audit row. `adminId` MUST already be reauthenticated.
   */
  async recordAction(input: {
    adminId: string;
    category: SupportCategory;
    itemRef: string;
    action: SupportActionVerb;
    evidence?: string;
    note?: string;
  }): Promise<SupportActionRow> {
    if (!input.adminId) throw new SupportQueueError("UNAUTHENTICATED", "A reauthenticated admin id is required.");
    if (!VALID_VERBS.includes(input.action)) throw new SupportQueueError("INVALID_ACTION", "Unknown support action.");

    // Authoritative org comes from the live queue row — never from the client.
    const item = (await this.d.reader.listQueue(this.query(input.category, 100_000))).find((i) => i.itemRef === input.itemRef);
    if (!item) throw new SupportQueueError("ITEM_NOT_IN_QUEUE", "That item is not currently in the support queue.");

    const evidence = input.evidence?.trim() || undefined;
    const note = input.note?.trim() || undefined;

    if ((input.action === "record_reconciliation" || input.action === "escalate") && !note) {
      throw new SupportQueueError("NOTE_REQUIRED", "This action requires a note describing the finding.");
    }
    if (input.action === "mark_resolved") {
      if (!evidence) throw new SupportQueueError("EVIDENCE_REQUIRED", "Resolving requires typed evidence of the read-only reconciliation.");
      const history = await this.d.actions.listForItem(input.category, input.itemRef);
      const reconciled = history.some((a) => a.action === "record_reconciliation");
      if (!reconciled) throw new SupportQueueError("RECONCILIATION_REQUIRED", "Log a read-only reconciliation finding before resolving.");
    }

    const row: SupportActionRow = {
      id: this.d.newId(),
      organizationId: item.organizationId,
      adminId: input.adminId,
      itemCategory: input.category,
      itemRef: input.itemRef,
      action: input.action,
      evidence,
      note,
      createdAt: this.d.now(),
    };
    await this.d.actions.append({ ...row, now: row.createdAt });
    return row;
  }
}
