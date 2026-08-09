import { randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";
import type { FormLeadMagnet, LeadMagnetMode } from "../forms/PlatformForm";
import { validateRedirectUrl } from "./redirectUrlPolicy";
import type { LeadMagnetCapabilityService } from "./LeadMagnetCapabilityService";

/**
 * Durable, idempotent lead-magnet fulfillment. Transactional and INDEPENDENT of
 * marketing consent:
 *  - It always binds to the FORM OWNER's stored config (`form.settings.leadMagnet`)
 *    snapshotted at fulfillment time — client-supplied mode/file/redirect/host
 *    values are ignored, and later config changes never rewrite an existing
 *    fulfillment's binding.
 *  - It is idempotent per submission (unique `submission_id`): re-processing one
 *    submission never mints a second capability or re-sends.
 *  - It performs NO marketing metering / enrollment / sequence / consent /
 *    unsubscribe work.
 */
export type FulfillmentStatus =
  | "ready"
  | "email_pending"
  | "already_fulfilled"
  | "needs_attention";

export interface FulfillmentRecord {
  id: string;
  organizationId: string;
  formId: string;
  submissionId: string;
  magnetId: string;
  mode: LeadMagnetMode;
  email: string | null;
  fileId: string | null;
  redirectUrl: string | null;
  emailSubject: string | null;
  status: FulfillmentStatus;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Row {
  id: string;
  organization_id: string;
  form_id: string;
  submission_id: string;
  magnet_id: string;
  mode: string;
  email: string | null;
  file_id: string | null;
  redirect_url: string | null;
  email_subject: string | null;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: Row): FulfillmentRecord {
  return {
    id: r.id,
    organizationId: r.organization_id,
    formId: r.form_id,
    submissionId: r.submission_id,
    magnetId: r.magnet_id,
    mode: r.mode as LeadMagnetMode,
    email: r.email,
    fileId: r.file_id,
    redirectUrl: r.redirect_url,
    emailSubject: r.email_subject,
    status: r.status as FulfillmentStatus,
    reason: r.reason,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class LeadMagnetFulfillmentRepository {
  private readonly rows = new Map<string, FulfillmentRecord>();

  constructor(private readonly db?: PgQueryable) {}

  /** Insert; returns the row actually persisted (existing one on conflict). */
  async insertIfAbsent(
    rec: FulfillmentRecord,
  ): Promise<{ record: FulfillmentRecord; inserted: boolean }> {
    if (this.db) {
      const r = await this.db.query(
        `INSERT INTO lead_magnet_fulfillments
           (id, organization_id, form_id, submission_id, magnet_id, mode, email,
            file_id, redirect_url, email_subject, status, reason, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (submission_id) DO NOTHING`,
        [
          rec.id, rec.organizationId, rec.formId, rec.submissionId, rec.magnetId,
          rec.mode, rec.email, rec.fileId, rec.redirectUrl, rec.emailSubject,
          rec.status, rec.reason, rec.createdAt, rec.updatedAt,
        ],
      );
      if ((r.rowCount ?? 0) > 0) return { record: rec, inserted: true };
      const existing = await this.getBySubmission(rec.submissionId);
      return { record: existing ?? rec, inserted: false };
    }
    for (const row of this.rows.values()) {
      if (row.submissionId === rec.submissionId) {
        return { record: row, inserted: false };
      }
    }
    this.rows.set(rec.id, rec);
    return { record: rec, inserted: true };
  }

  async getBySubmission(submissionId: string): Promise<FulfillmentRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM lead_magnet_fulfillments WHERE submission_id=$1",
        [submissionId],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    for (const row of this.rows.values()) {
      if (row.submissionId === submissionId) return row;
    }
    return undefined;
  }

  async get(id: string, organizationId: string): Promise<FulfillmentRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM lead_magnet_fulfillments WHERE id=$1 AND organization_id=$2",
        [id, organizationId],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    const row = this.rows.get(id);
    return row && row.organizationId === organizationId ? row : undefined;
  }

  async listForOrg(organizationId: string, formId?: string): Promise<FulfillmentRecord[]> {
    if (this.db) {
      const r = formId
        ? await this.db.query(
            "SELECT * FROM lead_magnet_fulfillments WHERE organization_id=$1 AND form_id=$2 ORDER BY created_at DESC LIMIT 500",
            [organizationId, formId],
          )
        : await this.db.query(
            "SELECT * FROM lead_magnet_fulfillments WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 500",
            [organizationId],
          );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return [...this.rows.values()].filter(
      (row) =>
        row.organizationId === organizationId &&
        (formId === undefined || row.formId === formId),
    );
  }

  async setStatus(id: string, status: FulfillmentStatus, reason: string | null, at: string): Promise<void> {
    if (this.db) {
      await this.db.query(
        "UPDATE lead_magnet_fulfillments SET status=$2, reason=$3, updated_at=$4 WHERE id=$1",
        [id, status, reason, at],
      );
      return;
    }
    const row = this.rows.get(id);
    if (row) {
      row.status = status;
      row.reason = reason;
      row.updatedAt = at;
    }
  }
}

export type FulfillResult =
  | { status: "ready"; mode: "redirect"; fulfillmentId: string; redirectUrl: string }
  /** Download is ready; the caller mints a capability at RESPONSE time. */
  | { status: "ready"; mode: "download"; fulfillmentId: string }
  /** Email is queued for the durable dispatch worker (which mints per attempt). */
  | { status: "email_pending"; mode: "email"; fulfillmentId: string; fileId: string; recipientEmail: string; emailSubject: string | null }
  | { status: "already_fulfilled"; mode: LeadMagnetMode; fulfillmentId: string }
  | { status: "needs_attention"; mode: LeadMagnetMode; fulfillmentId?: string; reason: string }
  | null;

export class LeadMagnetFulfillmentService {
  constructor(
    private readonly repo: LeadMagnetFulfillmentRepository,
    private readonly capabilities: LeadMagnetCapabilityService,
    /**
     * Tenant-scoped eligibility check: does this file exist, live, belong to the
     * org, AND satisfy the launch file policy (PDF only)? The wire site
     * implements it against the file service + magnetFilePolicy.
     */
    private readonly fileEligible: (fileId: string) => Promise<boolean>,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /**
   * Fulfill the magnet for one submission. Binds to the OWNER config only;
   * `recipientEmail` is the server-derived submission email (for email mode).
   * Returns null when the form has no enabled magnet. Capabilities are NOT
   * minted here — download mints at response time (issueDownloadCapability), and
   * the email dispatch worker mints a fresh capability per SMTP attempt.
   */
  async fulfill(input: {
    organizationId: string;
    formId: string;
    submissionId: string;
    magnet: FormLeadMagnet | undefined;
    recipientEmail?: string;
  }): Promise<FulfillResult> {
    const magnet = input.magnet;
    if (!magnet) return null; // no magnet configured on this form

    const nowIso = new Date(this.now()).toISOString();
    const base: Omit<FulfillmentRecord, "status" | "reason" | "email" | "fileId" | "redirectUrl" | "emailSubject"> = {
      id: randomUUID(),
      organizationId: input.organizationId,
      formId: input.formId,
      submissionId: input.submissionId,
      magnetId: magnet.id,
      mode: magnet.mode,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    // Resolve + validate the OWNER config for the mode. Client values are never
    // consulted here.
    let record: FulfillmentRecord;
    if (magnet.mode === "redirect") {
      const v = validateRedirectUrl(magnet.redirectUrl);
      record = {
        ...base,
        email: null,
        fileId: null,
        redirectUrl: v.ok ? v.url : null,
        emailSubject: null,
        status: v.ok ? "ready" : "needs_attention",
        reason: v.ok ? null : `redirect_${v.reason}`,
      };
    } else {
      // email OR download → needs a live, tenant-owned, POLICY-ELIGIBLE file.
      const fileId = magnet.fileId;
      const fileOk = fileId ? await this.fileEligible(fileId) : false;
      const emailMode = magnet.mode === "email";
      record = {
        ...base,
        email: emailMode ? input.recipientEmail ?? null : null,
        fileId: fileId ?? null,
        redirectUrl: null,
        emailSubject: emailMode ? magnet.emailSubject ?? null : null,
        status: !fileOk
          ? "needs_attention"
          : emailMode && !input.recipientEmail
            ? "needs_attention"
            : emailMode
              ? "email_pending"
              : "ready",
        reason: !fileOk
          ? "file_unavailable"
          : emailMode && !input.recipientEmail
            ? "no_recipient"
            : null,
      };
    }

    const { record: persisted, inserted } = await this.repo.insertIfAbsent(record);
    // Idempotent: an existing fulfillment is returned as-is; no new capability,
    // no re-send.
    if (!inserted) {
      return { status: "already_fulfilled", mode: persisted.mode, fulfillmentId: persisted.id };
    }
    if (persisted.status === "needs_attention") {
      return {
        status: "needs_attention",
        mode: persisted.mode,
        fulfillmentId: persisted.id,
        reason: persisted.reason ?? "unavailable",
      };
    }
    if (persisted.mode === "redirect") {
      return {
        status: "ready",
        mode: "redirect",
        fulfillmentId: persisted.id,
        redirectUrl: persisted.redirectUrl!,
      };
    }
    if (persisted.mode === "email") {
      // The durable dispatch worker mints a capability per SMTP attempt; nothing
      // to mint here.
      return {
        status: "email_pending",
        mode: "email",
        fulfillmentId: persisted.id,
        fileId: persisted.fileId!,
        recipientEmail: persisted.email!,
        emailSubject: persisted.emailSubject,
      };
    }
    // download → the caller mints a capability when producing the response.
    return { status: "ready", mode: "download", fulfillmentId: persisted.id };
  }

  /**
   * Mint a download capability for a READY download fulfillment, at RESPONSE
   * time. An idempotent client retry (a lost response) mints a bounded
   * REPLACEMENT sibling — never unlimited tokens. Returns the raw token once, or
   * null if the fulfillment isn't a ready download for this tenant.
   */
  /** Owner/admin: list fulfillments for a tenant (records include email; the
   * ROUTE projects to a PII-free shape before returning). */
  async listForOrg(organizationId: string, formId?: string): Promise<FulfillmentRecord[]> {
    return this.repo.listForOrg(organizationId, formId);
  }

  async issueDownloadCapability(
    fulfillmentId: string,
    organizationId: string,
  ): Promise<string | null> {
    const rec = await this.repo.get(fulfillmentId, organizationId);
    if (!rec || rec.mode !== "download" || rec.status !== "ready" || !rec.fileId) {
      return null;
    }
    const { token } = await this.capabilities.mint({
      organizationId: rec.organizationId,
      formId: rec.formId,
      fulfillmentId: rec.id,
      fileId: rec.fileId,
    });
    return token;
  }
}
