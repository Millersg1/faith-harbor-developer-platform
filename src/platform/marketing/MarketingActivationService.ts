import { randomUUID } from "node:crypto";

import type { PgQueryable } from "../../persistence/PgQueryable";

export type ActivationStatus =
  | "awaiting_confirmation"
  | "ready"
  | "enrolled"
  | "skipped"
  | "needs_attention";

/**
 * A durable marketing-activation intent. It BINDS the exact terms the visitor
 * accepted at submission (org, form, sequence, consent wording+version,
 * double-opt-in requirement, consent reference) so a later sequence change can
 * never silently enroll them into a replacement. Created at submission; flipped
 * to `ready` on confirmation; turned into an enrollment by a crash-safe worker.
 */
export interface ActivationRecord {
  id: string;
  organizationId: string;
  formId: string | null;
  sequenceId: string;
  email: string;
  consentWording: string | null;
  consentVersion: string | null;
  doubleOptIn: boolean;
  consentRef: string | null;
  status: ActivationStatus;
  reason: string | null;
  attempts: number;
  nextAttemptAt: string;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateActivationInput {
  organizationId: string;
  formId: string | null;
  sequenceId: string;
  email: string;
  consentWording?: string | null;
  consentVersion?: string | null;
  doubleOptIn: boolean;
  consentRef?: string | null;
  /** Single opt-in → created already-ready (consent already confirmed). */
  ready?: boolean;
}

/** Honest activation outcomes (never all exposed to the public visitor). */
export type ActivateOutcome =
  | "enrolled"
  | "already_enrolled"
  | "suppressed"
  | "consent_missing"
  | "lead_inactive"
  | "sequence_inactive"
  | "sequence_unavailable"
  | "tenant_mismatch"
  | "retryable";

/**
 * Gate-checkers wired by the caller to the real services WITHIN the activation's
 * tenant scope. Kept as narrow callbacks so the activation state machine is
 * unit-testable without the whole app.
 */
export interface ActivationGates {
  /** Affirmative, granted consent that is confirmed (if required) and matches wording+version. */
  consentOk: (a: ActivationRecord) => Promise<boolean>;
  /** Tenant OR global suppression present. */
  suppressed: (a: ActivationRecord) => Promise<boolean>;
  leadActive: (a: ActivationRecord) => Promise<boolean>;
  /** The BOUND sequence, revalidated: same tenant + active + eligible. */
  sequenceValid: (
    a: ActivationRecord,
  ) => Promise<"ok" | "inactive" | "not_found" | "wrong_tenant">;
  /** Create the enrollment (drip; S6 active-unique is the final safeguard). */
  enroll: (a: ActivationRecord) => Promise<"enrolled" | "duplicate">;
}

const MAX_ATTEMPTS = 5;
const BACKOFF_MS = 5 * 60 * 1000;

interface Row {
  id: string;
  organization_id: string;
  form_id: string | null;
  sequence_id: string;
  email: string;
  consent_wording: string | null;
  consent_version: string | null;
  double_opt_in: boolean;
  consent_ref: string | null;
  status: string;
  reason: string | null;
  attempts: number;
  next_attempt_at: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export class MarketingActivationRepository {
  private readonly rows = new Map<string, ActivationRecord>();

  constructor(private readonly db?: PgQueryable) {}

  /** Idempotent create keyed by (org, form, email, version). Returns existing on conflict. */
  async create(rec: ActivationRecord): Promise<ActivationRecord> {
    if (this.db) {
      const r = await this.db.query(
        `INSERT INTO marketing_activations
           (id, organization_id, form_id, sequence_id, email, consent_wording,
            consent_version, double_opt_in, consent_ref, status, reason,
            attempts, next_attempt_at, confirmed_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (organization_id, form_id, LOWER(email), consent_version)
         DO NOTHING RETURNING *`,
        [
          rec.id, rec.organizationId, rec.formId, rec.sequenceId,
          rec.email.toLowerCase(), rec.consentWording, rec.consentVersion,
          rec.doubleOptIn, rec.consentRef, rec.status, rec.reason, rec.attempts,
          rec.nextAttemptAt, rec.confirmedAt, rec.createdAt, rec.updatedAt,
        ],
      );
      if ((r.rowCount ?? 0) > 0) return mapRow(r.rows[0] as unknown as Row);
      const existing = await this.findByTerms(
        rec.organizationId, rec.formId, rec.email, rec.consentVersion,
      );
      return existing ?? rec;
    }
    const key = termsKey(rec.organizationId, rec.formId, rec.email, rec.consentVersion);
    for (const r of this.rows.values()) {
      if (termsKey(r.organizationId, r.formId, r.email, r.consentVersion) === key) {
        return r;
      }
    }
    this.rows.set(rec.id, rec);
    return rec;
  }

  async findByTerms(
    org: string, formId: string | null, email: string, version: string | null,
  ): Promise<ActivationRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_activations
           WHERE organization_id=$1 AND form_id IS NOT DISTINCT FROM $2
             AND LOWER(email)=$3 AND consent_version IS NOT DISTINCT FROM $4
           LIMIT 1`,
        [org, formId, email.toLowerCase(), version],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    const key = termsKey(org, formId, email, version);
    for (const r of this.rows.values()) {
      if (termsKey(r.organizationId, r.formId, r.email, r.consentVersion) === key) return r;
    }
    return undefined;
  }

  async listReady(nowIso: string): Promise<ActivationRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_activations
           WHERE status='ready' AND next_attempt_at <= $1
           ORDER BY next_attempt_at ASC LIMIT 100`,
        [nowIso],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return [...this.rows.values()].filter(
      (r) => r.status === "ready" && r.nextAttemptAt <= nowIso,
    );
  }

  async listNeedsAttention(org: string): Promise<ActivationRecord[]> {
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM marketing_activations
           WHERE organization_id=$1 AND status='needs_attention'
           ORDER BY updated_at DESC LIMIT 500`,
        [org],
      );
      return (r.rows as unknown as Row[]).map(mapRow);
    }
    return [...this.rows.values()].filter(
      (r) => r.organizationId === org && r.status === "needs_attention",
    );
  }

  async update(rec: ActivationRecord): Promise<void> {
    if (this.db) {
      await this.db.query(
        `UPDATE marketing_activations SET
            status=$2, reason=$3, attempts=$4, next_attempt_at=$5,
            confirmed_at=$6, updated_at=$7
          WHERE id=$1`,
        [
          rec.id, rec.status, rec.reason, rec.attempts, rec.nextAttemptAt,
          rec.confirmedAt, rec.updatedAt,
        ],
      );
      return;
    }
    this.rows.set(rec.id, rec);
  }

  async get(id: string): Promise<ActivationRecord | undefined> {
    if (this.db) {
      const r = await this.db.query(
        "SELECT * FROM marketing_activations WHERE id=$1", [id],
      );
      const row = r.rows[0] as unknown as Row | undefined;
      return row ? mapRow(row) : undefined;
    }
    return this.rows.get(id);
  }
}

function termsKey(org: string, formId: string | null, email: string, version: string | null): string {
  return `${org}|${formId ?? ""}|${email.toLowerCase()}|${version ?? ""}`;
}

function mapRow(row: Row): ActivationRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    formId: row.form_id,
    sequenceId: row.sequence_id,
    email: row.email,
    consentWording: row.consent_wording,
    consentVersion: row.consent_version,
    doubleOptIn: Boolean(row.double_opt_in),
    consentRef: row.consent_ref,
    status: row.status as ActivationStatus,
    reason: row.reason,
    attempts: Number(row.attempts),
    nextAttemptAt: row.next_attempt_at,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Consent-gated marketing activation. Never enrolls from a mere lead record —
 * only a durable activation whose every gate passes at activation time.
 */
export class MarketingActivationService {
  constructor(
    private readonly repo = new MarketingActivationRepository(),
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Create the durable intent (idempotent per accepted terms). */
  async createIntent(input: CreateActivationInput): Promise<ActivationRecord> {
    const nowIso = new Date(this.now()).toISOString();
    return this.repo.create({
      id: randomUUID(),
      organizationId: input.organizationId,
      formId: input.formId,
      sequenceId: input.sequenceId,
      email: input.email.toLowerCase(),
      consentWording: input.consentWording ?? null,
      consentVersion: input.consentVersion ?? null,
      doubleOptIn: input.doubleOptIn,
      consentRef: input.consentRef ?? null,
      status: input.ready ? "ready" : "awaiting_confirmation",
      reason: null,
      attempts: 0,
      nextAttemptAt: nowIso,
      confirmedAt: input.ready ? nowIso : null,
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  /**
   * Flip an awaiting intent to `ready` (the single durable write that makes the
   * confirmed opt-in crash-safe). Idempotent: already-ready/enrolled is a
   * success; also RECOVERS the crash window where a token was consumed but the
   * flip never landed. Returns the activation, or undefined if none matches.
   */
  async confirm(
    organizationId: string,
    email: string,
    version: string | null,
    formId: string | null = null,
  ): Promise<ActivationRecord | undefined> {
    const a = await this.repo.findByTerms(organizationId, formId, email, version);
    if (!a) return undefined;
    if (a.status === "awaiting_confirmation") {
      const nowIso = new Date(this.now()).toISOString();
      const flipped = { ...a, status: "ready" as ActivationStatus, confirmedAt: nowIso, updatedAt: nowIso };
      await this.repo.update(flipped);
      return flipped;
    }
    return a; // already ready/enrolled/etc → idempotent
  }

  async needsAttention(org: string): Promise<ActivationRecord[]> {
    return this.repo.listNeedsAttention(org);
  }

  /**
   * Crash-safe worker: turn `ready` activations into enrollments, rechecking
   * EVERY gate. Idempotent (an existing active enrollment → already_enrolled).
   * Returns per-activation outcomes.
   */
  async activateReady(
    gates: ActivationGates,
  ): Promise<{ id: string; outcome: ActivateOutcome }[]> {
    const nowIso = new Date(this.now()).toISOString();
    const ready = await this.repo.listReady(nowIso);
    const results: { id: string; outcome: ActivateOutcome }[] = [];
    for (const a of ready) {
      const outcome = await this.activateOne(a, gates);
      results.push({ id: a.id, outcome });
    }
    return results;
  }

  private async activateOne(
    a: ActivationRecord,
    gates: ActivationGates,
  ): Promise<ActivateOutcome> {
    const nowIso = new Date(this.now()).toISOString();
    const mark = (status: ActivationStatus, reason: string): void => {
      void this.repo.update({ ...a, status, reason, updatedAt: nowIso });
    };
    try {
      // Consent (affirmative + confirmed-if-required + wording/version match).
      if (!(await gates.consentOk(a))) {
        await this.repo.update({ ...a, status: "needs_attention", reason: "consent_missing", updatedAt: nowIso });
        return "consent_missing";
      }
      // Suppression (tenant or global) — expected outcome, not an error.
      if (await gates.suppressed(a)) {
        await this.repo.update({ ...a, status: "skipped", reason: "suppressed", updatedAt: nowIso });
        return "suppressed";
      }
      // Lead active.
      if (!(await gates.leadActive(a))) {
        await this.repo.update({ ...a, status: "skipped", reason: "lead_inactive", updatedAt: nowIso });
        return "lead_inactive";
      }
      // The BOUND sequence, revalidated — never the form's current replacement.
      const seq = await gates.sequenceValid(a);
      if (seq !== "ok") {
        const reason =
          seq === "inactive" ? "sequence_inactive"
            : seq === "wrong_tenant" ? "tenant_mismatch"
              : "sequence_unavailable";
        await this.repo.update({ ...a, status: "needs_attention", reason, updatedAt: nowIso });
        return reason as ActivateOutcome;
      }
      // Enroll (S6 active-unique index is the final duplicate safeguard).
      const enrolled = await gates.enroll(a);
      await this.repo.update({ ...a, status: "enrolled", reason: enrolled, updatedAt: nowIso });
      return enrolled === "duplicate" ? "already_enrolled" : "enrolled";
    } catch {
      // Retryable system failure — leave for another pass with backoff.
      const attempts = a.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        mark("needs_attention", "terminal_system_failure");
        return "retryable";
      }
      await this.repo.update({
        ...a,
        attempts,
        nextAttemptAt: new Date(this.now() + BACKOFF_MS * attempts).toISOString(),
        reason: "retryable",
        updatedAt: nowIso,
      });
      return "retryable";
    }
  }
}
