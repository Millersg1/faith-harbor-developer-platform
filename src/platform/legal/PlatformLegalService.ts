import { randomUUID } from "node:crypto";

import type {
  LegalKind,
  PlatformLegalDocumentRecord,
} from "./PlatformLegalDocument";
import { PlatformLegalDocumentRepository } from "./PlatformLegalDocumentRepository";

/** Raised when a caller tries to mutate an immutable (published) version. */
export class ImmutableLegalDocumentError extends Error {
  constructor() {
    super(
      "A published legal version is immutable. Create a new version instead.",
    );
    this.name = "ImmutableLegalDocumentError";
  }
}

export class LegalDocumentNotFoundError extends Error {
  constructor() {
    super("Legal document not found.");
    this.name = "LegalDocumentNotFoundError";
  }
}

export class LegalStateError extends Error {}

/**
 * Audit event emitted for every lifecycle action. Metadata is intentionally
 * limited to identifiers and enums — never the document body or any personal
 * information — matching the platform's audit conventions.
 */
export interface LegalAuditEvent {
  action:
    | "document.created"
    | "document.updated"
    | "document.review_acknowledged"
    | "document.published"
    | "document.superseded"
    | "document.archived";
  kind: LegalKind;
  version: number;
  documentId: string;
  actorId: string | null;
}

/** A document to seed on first run if that kind has no versions yet. */
export interface LegalSeed {
  kind: LegalKind;
  title: string;
  summary: string;
  bodyMarkdown: string;
  /** Publish immediately (only for content fully derived from verified facts). */
  publish: boolean;
  effectiveDate?: string;
}

export interface PlatformLegalServiceOptions {
  audit?: (event: LegalAuditEvent) => void;
}

/**
 * Manages All Elite Cloud's own (platform-level) legal documents.
 *
 * Core invariants:
 *  - Published versions are immutable. `updateDraft` refuses to touch a
 *    published document; changing published text means `createNewVersion`,
 *    which produces a fresh draft at the next version number.
 *  - Publishing a version supersedes the previously published version of the
 *    same kind, so exactly one version is ever live.
 *  - Historical versions are retained (never deleted), preserving the record
 *    of what was in effect when — which acceptance records point at.
 */
export class PlatformLegalService {
  private readonly audit?: (event: LegalAuditEvent) => void;

  constructor(
    private readonly repository = new PlatformLegalDocumentRepository(),
    options: PlatformLegalServiceOptions = {},
  ) {
    this.audit = options.audit;
  }

  /** The live, published version of a kind (what the public route serves). */
  async getPublished(
    kind: LegalKind,
  ): Promise<PlatformLegalDocumentRecord | undefined> {
    return this.repository.getPublished(kind);
  }

  async listVersions(
    kind: LegalKind,
  ): Promise<PlatformLegalDocumentRecord[]> {
    return this.repository.listVersions(kind);
  }

  async getById(
    id: string,
  ): Promise<PlatformLegalDocumentRecord | undefined> {
    return this.repository.get(id);
  }

  async listAll(): Promise<PlatformLegalDocumentRecord[]> {
    return this.repository.listAll();
  }

  /** Create a brand-new draft version for a kind (version = latest + 1). */
  async createDraft(input: {
    kind: LegalKind;
    title: string;
    summary: string;
    bodyMarkdown: string;
    createdBy?: string | null;
  }): Promise<PlatformLegalDocumentRecord> {
    const latest = await this.repository.getLatest(input.kind);
    const version = latest ? latest.version + 1 : 1;
    const now = new Date().toISOString();
    const record: PlatformLegalDocumentRecord = {
      id: randomUUID(),
      kind: input.kind,
      version,
      title: input.title.trim(),
      summary: input.summary.trim(),
      bodyMarkdown: input.bodyMarkdown,
      status: "draft",
      effectiveDate: null,
      requiresReconsent: false,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      createdBy: input.createdBy ?? null,
    };
    const created = await this.repository.create(record);
    this.emit("document.created", created);
    return created;
  }

  /**
   * Edit a draft (or legal-review) version in place. Refuses to modify a
   * published/superseded version — those are immutable.
   */
  async updateDraft(
    id: string,
    changes: {
      title?: string;
      summary?: string;
      bodyMarkdown?: string;
      requiresReconsent?: boolean;
    },
  ): Promise<PlatformLegalDocumentRecord> {
    const existing = await this.mustGet(id);
    if (
      existing.status === "published" ||
      existing.status === "superseded"
    ) {
      throw new ImmutableLegalDocumentError();
    }
    const updated: PlatformLegalDocumentRecord = {
      ...existing,
      title: changes.title?.trim() ?? existing.title,
      summary: changes.summary?.trim() ?? existing.summary,
      bodyMarkdown:
        changes.bodyMarkdown ?? existing.bodyMarkdown,
      requiresReconsent:
        changes.requiresReconsent ?? existing.requiresReconsent,
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.repository.update(updated);
    this.emit("document.updated", saved);
    return saved;
  }

  /**
   * Start a new draft from the current published (or latest) version of a
   * kind — the safe way to change already-published text.
   */
  async createNewVersion(
    kind: LegalKind,
    createdBy?: string | null,
  ): Promise<PlatformLegalDocumentRecord> {
    const base =
      (await this.repository.getPublished(kind)) ??
      (await this.repository.getLatest(kind));
    if (!base) {
      throw new LegalDocumentNotFoundError();
    }
    return this.createDraft({
      kind,
      title: base.title,
      summary: base.summary,
      bodyMarkdown: base.bodyMarkdown,
      createdBy,
    });
  }

  /** Move a draft into "legal review required" and record the acknowledgement. */
  async acknowledgeReview(
    id: string,
  ): Promise<PlatformLegalDocumentRecord> {
    const existing = await this.mustGet(id);
    if (existing.status !== "draft") {
      throw new LegalStateError(
        "Only a draft can be moved to legal review.",
      );
    }
    const saved = await this.repository.update({
      ...existing,
      status: "legal_review",
      updatedAt: new Date().toISOString(),
    });
    this.emit("document.review_acknowledged", saved);
    return saved;
  }

  /**
   * Publish a draft/legal-review version. Supersedes the previously published
   * version of the same kind. Optionally schedule the effective date.
   */
  async publish(
    id: string,
    options: { effectiveDate?: string } = {},
  ): Promise<PlatformLegalDocumentRecord> {
    const doc = await this.mustGet(id);
    if (
      doc.status !== "draft" &&
      doc.status !== "legal_review"
    ) {
      throw new LegalStateError(
        "Only a draft or legal-review version can be published.",
      );
    }
    // Supersede the current published version of this kind, if any.
    const current = await this.repository.getPublished(doc.kind);
    if (current && current.id !== doc.id) {
      const superseded = await this.repository.update({
        ...current,
        status: "superseded",
        updatedAt: new Date().toISOString(),
      });
      this.emit("document.superseded", superseded);
    }
    const now = new Date().toISOString();
    const published = await this.repository.update({
      ...doc,
      status: "published",
      effectiveDate:
        options.effectiveDate ??
        doc.effectiveDate ??
        now.slice(0, 10),
      publishedAt: now,
      updatedAt: now,
    });
    this.emit("document.published", published);
    return published;
  }

  async archive(
    id: string,
  ): Promise<PlatformLegalDocumentRecord> {
    const doc = await this.mustGet(id);
    if (doc.status === "published") {
      throw new LegalStateError(
        "Supersede a published version before archiving it.",
      );
    }
    const saved = await this.repository.update({
      ...doc,
      status: "archived",
      updatedAt: new Date().toISOString(),
    });
    this.emit("document.archived", saved);
    return saved;
  }

  /**
   * Seed initial documents for any kind that has no versions yet. Idempotent:
   * once a kind exists (even as a draft), seeding never touches it again, so
   * owner edits are never overwritten on restart.
   */
  async seedIfEmpty(seeds: LegalSeed[]): Promise<void> {
    for (const seed of seeds) {
      const existing = await this.repository.getLatest(seed.kind);
      if (existing) {
        continue;
      }
      const draft = await this.createDraft({
        kind: seed.kind,
        title: seed.title,
        summary: seed.summary,
        bodyMarkdown: seed.bodyMarkdown,
        createdBy: null,
      });
      if (seed.publish) {
        await this.publish(draft.id, {
          effectiveDate: seed.effectiveDate,
        });
      }
    }
  }

  private async mustGet(
    id: string,
  ): Promise<PlatformLegalDocumentRecord> {
    const doc = await this.repository.get(id);
    if (!doc) {
      throw new LegalDocumentNotFoundError();
    }
    return doc;
  }

  private emit(
    action: LegalAuditEvent["action"],
    doc: PlatformLegalDocumentRecord,
  ): void {
    this.audit?.({
      action,
      kind: doc.kind,
      version: doc.version,
      documentId: doc.id,
      actorId: doc.createdBy,
    });
  }
}
