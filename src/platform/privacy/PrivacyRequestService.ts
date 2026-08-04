import { randomUUID } from "node:crypto";

import {
  canTransition,
  isPrivacyCategory,
  PRIVACY_CATEGORY_LABELS,
  SUBSTANTIVE_STATUSES,
  type PrivacyCategory,
  type PrivacyDestination,
  type PrivacyRequestNote,
  type PrivacyRequestRecord,
  type PrivacyStatus,
} from "./PrivacyRequest";
import {
  PrivacyRequestRepository,
  type ListFilters,
} from "./PrivacyRequestRepository";
import { generateToken, hashToken } from "./privacyTokens";

export class PrivacyValidationError extends Error {}
export class PrivacyNotFoundError extends Error {
  constructor() {
    super("Privacy request not found.");
    this.name = "PrivacyNotFoundError";
  }
}
export class PrivacyStateError extends Error {}

const VERIFY_TTL_MS = 72 * 60 * 60 * 1000; // 72h to verify email
const MAX_DESC = 4000;
const MAX_NAME = 200;

export interface CreateInput {
  destination: PrivacyDestination;
  organizationId: string | null;
  category: string;
  name: string;
  email: string;
  description: string;
  relationship?: string;
}

/** Management scope resolved by the route from trusted host/auth. */
export type Scope =
  | { kind: "tenant"; organizationId: string }
  | { kind: "platform" };

/** A redacted requester-facing view — no internal notes/staff/audit data. */
export interface RequesterStatusView {
  reference: string;
  category: PrivacyCategory;
  categoryLabel: string;
  verification: "email_verified" | "unverified";
  status: PrivacyStatus;
  resolutionSummary: string | null;
  messages: { body: string; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

function normalizeEmail(v: string): string {
  return v.trim().toLowerCase();
}

/**
 * Orchestrates privacy-request intake, verification, and lifecycle. The route
 * layer resolves the destination + scope from the trusted host / authenticated
 * context and passes it here; the service never trusts a client-supplied
 * organization id. Raw tokens are returned to callers exactly once and are
 * never stored (only hashes) or logged.
 */
export class PrivacyRequestService {
  constructor(
    private readonly repo = new PrivacyRequestRepository(),
  ) {}

  // ---- Intake ----

  /** Create a request. Returns the raw verification token ONCE (to email). */
  async create(
    input: CreateInput,
  ): Promise<{ record: PrivacyRequestRecord; verifyToken: string }> {
    const email = normalizeEmail(input.email);
    if (!email.includes("@") || email.length > 254) {
      throw new PrivacyValidationError("A valid email is required.");
    }
    if (!isPrivacyCategory(input.category)) {
      throw new PrivacyValidationError("Choose a request category.");
    }
    const name = input.name.trim().slice(0, MAX_NAME);
    const description = input.description.trim().slice(0, MAX_DESC);
    if (!description) {
      throw new PrivacyValidationError("A short description is required.");
    }
    if (input.destination === "tenant" && !input.organizationId) {
      throw new PrivacyValidationError("Tenant scope required.");
    }
    const now = new Date().toISOString();
    const { token: verifyToken, hash: verifyTokenHash } = generateToken();
    const record: PrivacyRequestRecord = {
      id: randomUUID(),
      destination: input.destination,
      organizationId:
        input.destination === "tenant" ? input.organizationId : null,
      category: input.category,
      name,
      email,
      description,
      relationship: input.relationship?.trim().slice(0, 200) || null,
      verificationState: "unverified",
      status: "pending_verification",
      assignedTo: null,
      resolutionSummary: null,
      dueDate: null,
      dueDateSource: null,
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      acknowledgedAt: null,
      completedAt: null,
      deniedAt: null,
      closedAt: null,
      purgeAfter: null,
    };
    await this.repo.create(record, {
      verifyTokenHash,
      verifyExpiresAt: new Date(
        Date.parse(now) + VERIFY_TTL_MS,
      ).toISOString(),
      statusTokenHash: null,
    });
    return { record, verifyToken };
  }

  /**
   * Verify email control via the single-use token. On success: mark verified,
   * advance to `received`, clear the verify token, and mint a fresh status
   * token (returned once) for the requester status page. Fails safely on
   * expired/invalid/replayed tokens.
   */
  async verifyEmail(
    token: string,
  ): Promise<
    | { record: PrivacyRequestRecord; statusToken: string }
    | { error: "invalid" | "expired" | "already_used" }
  > {
    if (!token) {
      return { error: "invalid" };
    }
    const found = await this.repo.findByVerifyTokenHash(hashToken(token));
    if (!found) {
      return { error: "invalid" };
    }
    if (found.record.verificationState === "email_verified") {
      return { error: "already_used" };
    }
    if (
      !found.verifyExpiresAt ||
      Date.parse(found.verifyExpiresAt) <= Date.now()
    ) {
      return { error: "expired" };
    }
    const now = new Date().toISOString();
    const { token: statusToken, hash: statusTokenHash } = generateToken();
    const updated: PrivacyRequestRecord = {
      ...found.record,
      verificationState: "email_verified",
      status:
        found.record.status === "pending_verification"
          ? "received"
          : found.record.status,
      verifiedAt: now,
      updatedAt: now,
    };
    await this.repo.update(updated, {
      // single-use: clear the verify token; store the status token hash.
      verifyTokenHash: null,
      verifyExpiresAt: null,
      statusTokenHash,
    });
    return { record: updated, statusToken };
  }

  /** Redacted status view for a verified requester holding the status token. */
  async requesterStatus(
    statusToken: string,
  ): Promise<RequesterStatusView | undefined> {
    if (!statusToken) {
      return undefined;
    }
    const record = await this.repo.findByStatusTokenHash(
      hashToken(statusToken),
    );
    if (!record) {
      return undefined;
    }
    const notes = await this.repo.listNotes(record.id);
    return {
      reference: record.id.slice(0, 8).toUpperCase(),
      category: record.category,
      categoryLabel: PRIVACY_CATEGORY_LABELS[record.category],
      verification:
        record.verificationState === "email_verified"
          ? "email_verified"
          : "unverified",
      status: record.status,
      resolutionSummary: record.resolutionSummary,
      messages: notes
        .filter((n) => n.visibility === "requester")
        .map((n) => ({ body: n.body, createdAt: n.createdAt })),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  // ---- Management (scoped) ----

  private async mustGet(
    scope: Scope,
    id: string,
  ): Promise<PrivacyRequestRecord> {
    const rec =
      scope.kind === "tenant"
        ? await this.repo.getForTenant(id, scope.organizationId)
        : await this.repo.getPlatform(id);
    if (!rec) {
      throw new PrivacyNotFoundError();
    }
    return rec;
  }

  async list(
    scope: Scope,
    filters: ListFilters = {},
  ): Promise<PrivacyRequestRecord[]> {
    return scope.kind === "tenant"
      ? this.repo.listForTenant(scope.organizationId, filters)
      : this.repo.listPlatform(filters);
  }

  async get(
    scope: Scope,
    id: string,
  ): Promise<{
    record: PrivacyRequestRecord;
    notes: PrivacyRequestNote[];
  }> {
    const record = await this.mustGet(scope, id);
    return { record, notes: await this.repo.listNotes(record.id) };
  }

  /**
   * Change status, enforcing the allowed-transition state machine. Substantive
   * decisions (fulfilled/partially_fulfilled/denied) require a human-written
   * resolution summary. Idempotent: a no-op transition to the current status
   * returns without side effects.
   */
  async transition(
    scope: Scope,
    id: string,
    to: PrivacyStatus,
    opts: { resolutionSummary?: string } = {},
  ): Promise<PrivacyRequestRecord> {
    const rec = await this.mustGet(scope, id);
    if (rec.status === to) {
      return rec; // idempotent
    }
    if (!canTransition(rec.status, to)) {
      throw new PrivacyStateError(
        `Cannot move from ${rec.status} to ${to}.`,
      );
    }
    if (
      SUBSTANTIVE_STATUSES.includes(to) &&
      !(opts.resolutionSummary && opts.resolutionSummary.trim())
    ) {
      throw new PrivacyStateError(
        "A written explanation is required for this decision.",
      );
    }
    const now = new Date().toISOString();
    const next: PrivacyRequestRecord = {
      ...rec,
      status: to,
      updatedAt: now,
      resolutionSummary: opts.resolutionSummary?.trim()
        ? opts.resolutionSummary.trim()
        : rec.resolutionSummary,
      acknowledgedAt:
        to === "in_review" && !rec.acknowledgedAt
          ? now
          : rec.acknowledgedAt,
      completedAt:
        to === "fulfilled" || to === "partially_fulfilled"
          ? now
          : rec.completedAt,
      deniedAt: to === "denied" ? now : rec.deniedAt,
      closedAt: to === "closed" ? now : rec.closedAt,
    };
    return this.repo.update(next);
  }

  async assign(
    scope: Scope,
    id: string,
    assignedTo: string | null,
  ): Promise<PrivacyRequestRecord> {
    const rec = await this.mustGet(scope, id);
    return this.repo.update({
      ...rec,
      assignedTo: assignedTo || null,
      updatedAt: new Date().toISOString(),
    });
  }

  async setDueDate(
    scope: Scope,
    id: string,
    dueDate: string | null,
    source: "staff" | "policy",
  ): Promise<PrivacyRequestRecord> {
    const rec = await this.mustGet(scope, id);
    return this.repo.update({
      ...rec,
      dueDate: dueDate || null,
      dueDateSource: dueDate ? source : null,
      updatedAt: new Date().toISOString(),
    });
  }

  async addNote(
    scope: Scope,
    id: string,
    input: {
      body: string;
      visibility: "internal" | "requester";
      authorId?: string | null;
    },
  ): Promise<PrivacyRequestNote> {
    const rec = await this.mustGet(scope, id);
    const body = input.body.trim().slice(0, MAX_DESC);
    if (!body) {
      throw new PrivacyValidationError("A note body is required.");
    }
    const note: PrivacyRequestNote = {
      id: randomUUID(),
      requestId: rec.id,
      visibility: input.visibility,
      authorId: input.authorId ?? null,
      body,
      createdAt: new Date().toISOString(),
    };
    return this.repo.addNote(note);
  }
}
