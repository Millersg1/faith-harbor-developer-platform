import { randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";
import type { EmailDeliveryProvider } from "../email/EmailDeliveryProvider";
import type { LeadMagnetCapabilityService } from "./LeadMagnetCapabilityService";

/**
 * Durable, crash-safe dispatch of a lead-magnet DOWNLOAD-LINK email.
 *
 * This is TRANSACTIONAL fulfillment of a specific request — NOT marketing:
 *  - It uses the configured All Elite Cloud transactional sender (never the
 *    tenant marketing sender), carries NO List-Unsubscribe/one-click headers,
 *    requires no marketing consent, is never metered as marketing, and includes
 *    no tracking pixels / open / click tracking.
 *  - It does NOT require the tenant's marketing physical-mailing-address config.
 *
 * Capability-at-delivery: a fresh opaque capability is minted immediately before
 * EACH SMTP attempt; the raw token exists only long enough to build the fragment
 * URL. A clearly pre-acceptance failure revokes that attempt's unused capability;
 * a retry mints a new one. An UNCERTAIN attempt leaves its capability valid and
 * becomes `delivery_unknown` (never auto-resent). `accepted` is SMTP acceptance,
 * NOT inbox delivery.
 */
export type MagnetDispatchStatus =
  | "queued"
  | "sending"
  | "sent"
  | "failed"
  | "terminal"
  | "delivery_unknown"
  | "canceled";

export interface MagnetDispatchRecord {
  id: string;
  organizationId: string;
  fulfillmentId: string;
  formId: string;
  fileId: string;
  email: string;
  emailSubject: string | null;
  businessName: string | null;
  replyTo: string | null;
  fileTitle: string | null;
  downloadBase: string;
  status: MagnetDispatchStatus;
  attempts: number;
  nextAttemptAt: string;
  leaseOwner: string | null;
  leaseUntil: string | null;
  providerId: string | null;
  reason: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EnqueueMagnetDispatchInput {
  organizationId: string;
  fulfillmentId: string;
  formId: string;
  fileId: string;
  email: string;
  emailSubject?: string | null;
  businessName?: string | null;
  replyTo?: string | null;
  fileTitle?: string | null;
  downloadBase: string;
  runAt?: string;
}

export type MagnetSendAttempt =
  | { classification: "accepted"; providerId?: string }
  | { classification: "uncertain"; reason?: string }
  | { classification: "pre_acceptance_failure"; reason?: string }
  | { classification: "rejected"; reason?: string };

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 5 * 60 * 1000;

interface Row {
  id: string;
  organization_id: string;
  fulfillment_id: string;
  form_id: string;
  file_id: string;
  email: string;
  email_subject: string | null;
  business_name: string | null;
  reply_to: string | null;
  file_title: string | null;
  download_base: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
  lease_owner: string | null;
  lease_until: string | null;
  provider_id: string | null;
  reason: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: Row): MagnetDispatchRecord {
  return {
    id: r.id,
    organizationId: r.organization_id,
    fulfillmentId: r.fulfillment_id,
    formId: r.form_id,
    fileId: r.file_id,
    email: r.email,
    emailSubject: r.email_subject,
    businessName: r.business_name,
    replyTo: r.reply_to,
    fileTitle: r.file_title,
    downloadBase: r.download_base,
    status: r.status as MagnetDispatchStatus,
    attempts: Number(r.attempts),
    nextAttemptAt: r.next_attempt_at,
    leaseOwner: r.lease_owner,
    leaseUntil: r.lease_until,
    providerId: r.provider_id,
    reason: r.reason,
    resolvedAt: r.resolved_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class LeadMagnetDispatchRepository {
  private readonly rows = new Map<string, MagnetDispatchRecord>();

  constructor(private readonly db?: PgQueryable) {}

  /** Idempotent enqueue keyed by fulfillment_id (one email queue per fulfillment). */
  async enqueue(rec: MagnetDispatchRecord): Promise<boolean> {
    if (this.db) {
      const r = await this.db.query(
        `INSERT INTO lead_magnet_dispatch
           (id, organization_id, fulfillment_id, form_id, file_id, email,
            email_subject, business_name, reply_to, file_title, download_base,
            status, attempts, next_attempt_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (fulfillment_id) DO NOTHING`,
        [
          rec.id, rec.organizationId, rec.fulfillmentId, rec.formId, rec.fileId,
          rec.email.toLowerCase(), rec.emailSubject, rec.businessName, rec.replyTo,
          rec.fileTitle, rec.downloadBase, rec.status, rec.attempts,
          rec.nextAttemptAt, rec.createdAt, rec.updatedAt,
        ],
      );
      return (r.rowCount ?? 0) > 0;
    }
    if ([...this.rows.values()].some((m) => m.fulfillmentId === rec.fulfillmentId)) {
      return false;
    }
    this.rows.set(rec.id, { ...rec, email: rec.email.toLowerCase() });
    return true;
  }

  async claimDue(owner: string, nowIso: string, leaseUntilIso: string, limit: number): Promise<MagnetDispatchRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE lead_magnet_dispatch SET
            status='sending', lease_owner=$1, lease_until=$2, updated_at=$3
          WHERE id IN (
            SELECT id FROM lead_magnet_dispatch
             WHERE status IN ('queued','failed') AND next_attempt_at <= $3
             ORDER BY next_attempt_at ASC LIMIT $4 FOR UPDATE SKIP LOCKED
          ) RETURNING *`,
        [owner, leaseUntilIso, nowIso, limit],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    const due = [...this.rows.values()]
      .filter((m) => (m.status === "queued" || m.status === "failed") && m.nextAttemptAt <= nowIso)
      .sort((a, b) => (a.nextAttemptAt < b.nextAttemptAt ? -1 : 1))
      .slice(0, limit);
    for (const m of due) {
      m.status = "sending";
      m.leaseOwner = owner;
      m.leaseUntil = leaseUntilIso;
      m.updatedAt = nowIso;
    }
    return due.map((m) => ({ ...m }));
  }

  async recoverExpiredLeases(nowIso: string): Promise<MagnetDispatchRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `UPDATE lead_magnet_dispatch
            SET status='delivery_unknown', reason='crash:ambiguous',
                lease_owner=NULL, lease_until=NULL, updated_at=$1
          WHERE status='sending' AND lease_until IS NOT NULL AND lease_until < $1
          RETURNING *`,
        [nowIso],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    const out: MagnetDispatchRecord[] = [];
    for (const m of this.rows.values()) {
      if (m.status === "sending" && m.leaseUntil !== null && m.leaseUntil < nowIso) {
        m.status = "delivery_unknown";
        m.reason = "crash:ambiguous";
        m.leaseOwner = null;
        m.leaseUntil = null;
        m.updatedAt = nowIso;
        out.push({ ...m });
      }
    }
    return out;
  }

  async update(rec: MagnetDispatchRecord): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE lead_magnet_dispatch SET
            status=$2, attempts=$3, next_attempt_at=$4, lease_owner=$5,
            lease_until=$6, provider_id=$7, reason=$8, resolved_at=$9, updated_at=$10
          WHERE id=$1`,
        [
          rec.id, rec.status, rec.attempts, rec.nextAttemptAt, rec.leaseOwner,
          rec.leaseUntil, rec.providerId, rec.reason, rec.resolvedAt, rec.updatedAt,
        ],
      );
      return;
    }
    this.rows.set(rec.id, rec);
  }

  async getForOrg(id: string, organizationId: string): Promise<MagnetDispatchRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM lead_magnet_dispatch WHERE id=$1 AND organization_id=$2",
        [id, organizationId],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    const m = this.rows.get(id);
    return m && m.organizationId === organizationId ? { ...m } : undefined;
  }

  async listNeedsAttention(organizationId: string): Promise<MagnetDispatchRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM lead_magnet_dispatch
           WHERE organization_id=$1 AND status IN ('terminal','delivery_unknown')
             AND resolved_at IS NULL ORDER BY updated_at DESC LIMIT 500`,
        [organizationId],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return [...this.rows.values()].filter(
      (m) =>
        m.organizationId === organizationId &&
        m.resolvedAt === null &&
        (m.status === "terminal" || m.status === "delivery_unknown"),
    );
  }
}

export class LeadMagnetDispatchService {
  constructor(
    private readonly repo = new LeadMagnetDispatchRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  async enqueue(input: EnqueueMagnetDispatchInput): Promise<boolean> {
    const nowIso = new Date(this.now()).toISOString();
    return this.repo.enqueue({
      id: randomUUID(),
      organizationId: input.organizationId,
      fulfillmentId: input.fulfillmentId,
      formId: input.formId,
      fileId: input.fileId,
      email: input.email,
      emailSubject: input.emailSubject ?? null,
      businessName: input.businessName ?? null,
      replyTo: input.replyTo ?? null,
      fileTitle: input.fileTitle ?? null,
      downloadBase: input.downloadBase,
      status: "queued",
      attempts: 0,
      nextAttemptAt: input.runAt ?? nowIso,
      leaseOwner: null,
      leaseUntil: null,
      providerId: null,
      reason: null,
      resolvedAt: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  async needsAttention(organizationId: string): Promise<MagnetDispatchRecord[]> {
    return this.repo.listNeedsAttention(organizationId);
  }

  /** Resolve a delivery_unknown/terminal WITHOUT resend. */
  async resolve(id: string, organizationId: string): Promise<boolean> {
    const m = await this.repo.getForOrg(id, organizationId);
    if (!m) return false;
    await this.repo.update({ ...m, resolvedAt: new Date(this.now()).toISOString(), updatedAt: new Date(this.now()).toISOString() });
    return true;
  }

  /** DELIBERATE owner retry — re-queues so the worker mints a NEW sibling capability. */
  async retry(id: string, organizationId: string): Promise<boolean> {
    const m = await this.repo.getForOrg(id, organizationId);
    if (!m) return false;
    const nowIso = new Date(this.now()).toISOString();
    await this.repo.update({ ...m, status: "queued", reason: "manual_retry", nextAttemptAt: nowIso, resolvedAt: null, updatedAt: nowIso });
    return true;
  }

  async cancel(id: string, organizationId: string): Promise<boolean> {
    const m = await this.repo.getForOrg(id, organizationId);
    if (!m) return false;
    const nowIso = new Date(this.now()).toISOString();
    await this.repo.update({ ...m, status: "canceled", reason: "canceled", resolvedAt: nowIso, updatedAt: nowIso });
    return true;
  }

  async runOnce(
    owner: string,
    deps: { send: (m: MagnetDispatchRecord) => Promise<MagnetSendAttempt>; leaseMs?: number; limit?: number },
  ): Promise<{ sent: number; failed: number; unknown: number }> {
    const nowMs = this.now();
    const nowIso = new Date(nowMs).toISOString();
    const recovered = await this.repo.recoverExpiredLeases(nowIso);
    const leaseUntil = new Date(nowMs + (deps.leaseMs ?? 60_000)).toISOString();
    const claimed = await this.repo.claimDue(owner, nowIso, leaseUntil, deps.limit ?? 25);
    let sent = 0;
    let failed = 0;
    let unknown = recovered.length;
    for (const m of claimed) {
      let attempt: MagnetSendAttempt;
      try {
        attempt = await deps.send(m);
      } catch (e) {
        attempt = { classification: "uncertain", reason: e instanceof Error ? e.message.slice(0, 80) : "send_error" };
      }
      const afterIso = new Date(this.now()).toISOString();
      if (attempt.classification === "accepted") {
        await this.repo.update({ ...m, status: "sent", providerId: attempt.providerId ?? null, reason: "sent", leaseOwner: null, leaseUntil: null, updatedAt: afterIso });
        sent += 1;
      } else if (attempt.classification === "uncertain") {
        await this.repo.update({ ...m, status: "delivery_unknown", reason: (attempt.reason ?? "ambiguous").slice(0, 80), leaseOwner: null, leaseUntil: null, updatedAt: afterIso });
        unknown += 1;
      } else if (attempt.classification === "rejected") {
        await this.repo.update({ ...m, status: "terminal", attempts: m.attempts + 1, reason: (attempt.reason ?? "rejected").slice(0, 80), leaseOwner: null, leaseUntil: null, updatedAt: afterIso });
        failed += 1;
      } else {
        const attempts = m.attempts + 1;
        const terminal = attempts >= MAX_ATTEMPTS;
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
        await this.repo.update({ ...m, status: terminal ? "terminal" : "failed", attempts, reason: (attempt.reason ?? "pre_acceptance_failure").slice(0, 80), nextAttemptAt: new Date(this.now() + backoff).toISOString(), leaseOwner: null, leaseUntil: null, updatedAt: afterIso });
        failed += 1;
      }
    }
    return { sent, failed, unknown };
  }
}

function escapeHtml(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Build the transactional magnet email. Tenant identity (business name, file
 * title) appears ONLY through escaped display text. Plain text + safe generated
 * HTML; NO List-Unsubscribe, NO tracking. `downloadUrl` carries the token in a
 * fragment.
 */
export function buildMagnetEmail(input: {
  businessName: string | null;
  fileTitle: string | null;
  downloadUrl: string;
}): { subject: string; text: string; html: string } {
  const from = input.businessName ? input.businessName : "the team";
  const what = input.fileTitle ? input.fileTitle : "your download";
  const subject = `Your download${input.fileTitle ? `: ${input.fileTitle}` : ""}`;
  const text =
    `Thanks for requesting ${what} from ${from}.\n\n` +
    `Download it here (this secure link expires soon and can be used once):\n` +
    `${input.downloadUrl}\n\n` +
    `If you didn't request this, you can ignore this email.`;
  // Generated (escape-then-structure) HTML — no tenant-authored markup parsed.
  const url = input.downloadUrl; // our own URL, structurally safe
  const html =
    `<p>Thanks for requesting <strong>${escapeHtml(what)}</strong> from ${escapeHtml(from)}.</p>` +
    `<p><a href="${escapeHtml(url)}">Download ${escapeHtml(what)}</a><br>` +
    `<small>This secure link expires soon and can be used once.</small></p>` +
    `<p><small>If you didn't request this, you can ignore this email.</small></p>`;
  return { subject, text, html };
}

/**
 * Compose the per-attempt send. Mints a FRESH capability, builds the fragment
 * URL, sends via the configured TRANSACTIONAL sender (no unsubscribe headers),
 * and — on a clear pre-acceptance/rejected outcome — REVOKES that attempt's
 * unused capability. An uncertain/accepted outcome leaves the capability valid.
 */
export function createLeadMagnetSend(deps: {
  capabilities: LeadMagnetCapabilityService;
  emailProvider: EmailDeliveryProvider;
  /** The configured, authenticated transactional From (never the marketing sender). */
  transactionalFrom: string;
}): (m: MagnetDispatchRecord) => Promise<MagnetSendAttempt> {
  return async (m: MagnetDispatchRecord): Promise<MagnetSendAttempt> => {
    const { token } = await deps.capabilities.mint({
      organizationId: m.organizationId,
      formId: m.formId,
      fulfillmentId: m.fulfillmentId,
      fileId: m.fileId,
    });
    const downloadUrl = `${m.downloadBase.replace(/\/+$/, "")}/magnet#d=${token}`;
    const built = buildMagnetEmail({
      businessName: m.businessName,
      fileTitle: m.emailSubject ? null : m.fileTitle,
      downloadUrl,
    });
    const subject = m.emailSubject ?? built.subject;
    const sendingDomain =
      /@([^>\s]+)/.exec(deps.transactionalFrom)?.[1]?.toLowerCase() ?? "localhost";
    const result = await deps.emailProvider.deliver({
      to: m.email,
      from: deps.transactionalFrom,
      ...(m.replyTo ? { replyTo: m.replyTo } : {}),
      subject,
      text: built.text,
      html: built.html,
      // Transactional: NO List-Unsubscribe / one-click / tracking headers.
      messageClass: "transactional",
      logicalId: `magnet:${m.fulfillmentId}`,
      attemptId: randomUUID(),
      sendingDomain,
    });
    if (result.classification === "accepted") {
      return { classification: "accepted", providerId: result.providerId };
    }
    if (result.classification === "uncertain") {
      // Possibly delivered — LEAVE the capability valid; never auto-resend.
      return { classification: "uncertain", reason: result.responseCategory ?? result.reason };
    }
    // Clear pre-acceptance / rejected → the capability was never delivered:
    // revoke this attempt's unused capability. A retry mints a fresh one.
    await deps.capabilities.revoke(token);
    return { classification: result.classification, reason: result.responseCategory ?? result.reason };
  };
}
