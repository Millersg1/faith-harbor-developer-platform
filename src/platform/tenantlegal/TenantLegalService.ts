import { randomUUID } from "node:crypto";

import {
  findPublishBlocker,
  ImmutableLegalDocumentError,
  LegalDocumentNotFoundError,
  LegalMarkerError,
  LegalStateError,
} from "../legal/PlatformLegalService";
import type { TenantLegalKind } from "./TenantLegalDocument";
import type { TenantLegalDocumentRecord } from "./TenantLegalDocument";
import { TenantLegalDocumentRepository } from "./TenantLegalDocumentRepository";
import {
  sanitizeAnswers,
  type QuestionnaireAnswers,
} from "./TenantQuestionnaire";
import { TenantQuestionnaireRepository } from "./TenantQuestionnaireRepository";
import {
  generateTenantDocument,
  generationHasMissingFacts,
} from "./tenantLegalGenerator";

export interface QuestionnaireView {
  answers: QuestionnaireAnswers;
  updatedAt: string | null;
}

/**
 * Manages a tenant's questionnaire and its own legal documents. All operations
 * run inside the tenant context (the repositories fail closed without one).
 * Published versions are immutable; a publication guard blocks any body that
 * still contains internal markers. Generation never invents facts.
 */
export class TenantLegalService {
  constructor(
    private readonly documents = new TenantLegalDocumentRepository(),
    private readonly questionnaire = new TenantQuestionnaireRepository(),
  ) {}

  // ---- Questionnaire ----

  async getQuestionnaire(): Promise<QuestionnaireView> {
    const rec = await this.questionnaire.get();
    return {
      answers: rec?.answers ?? {},
      updatedAt: rec?.updatedAt ?? null,
    };
  }

  /** Save (progress) — only recognized fields are kept; unknown keys dropped. */
  async saveQuestionnaire(
    rawAnswers: unknown,
  ): Promise<QuestionnaireView> {
    const answers = sanitizeAnswers(rawAnswers);
    const rec = await this.questionnaire.upsert(
      answers,
      new Date().toISOString(),
    );
    return { answers: rec.answers, updatedAt: rec.updatedAt };
  }

  // ---- Reads ----

  async listAll(): Promise<TenantLegalDocumentRecord[]> {
    return this.documents.listAll();
  }

  async listVersions(
    kind: TenantLegalKind,
  ): Promise<TenantLegalDocumentRecord[]> {
    return this.documents.listVersions(kind);
  }

  async getById(
    id: string,
  ): Promise<TenantLegalDocumentRecord | undefined> {
    return this.documents.get(id);
  }

  async getPublished(
    kind: TenantLegalKind,
  ): Promise<TenantLegalDocumentRecord | undefined> {
    return this.documents.getPublished(kind);
  }

  // ---- Drafting ----

  private async nextVersion(
    kind: TenantLegalKind,
  ): Promise<number> {
    const latest = await this.documents.getLatest(kind);
    return latest ? latest.version + 1 : 1;
  }

  /** Generate a draft from the current questionnaire answers. */
  async generateDraft(
    kind: TenantLegalKind,
    createdBy?: string | null,
  ): Promise<{
    document: TenantLegalDocumentRecord;
    missingFacts: string[];
  }> {
    const { answers } = await this.getQuestionnaire();
    const generated = generateTenantDocument(kind, answers);
    const missingFacts = generationHasMissingFacts(kind, answers);
    const now = new Date().toISOString();
    const document = await this.documents.create({
      id: randomUUID(),
      kind,
      version: await this.nextVersion(kind),
      title: generated.title,
      bodyMarkdown: generated.bodyMarkdown,
      status: "draft",
      humanReviewed: false,
      effectiveDate: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      createdBy: createdBy ?? null,
    });
    return { document, missingFacts };
  }

  /** Edit a draft. Refuses to modify a published/superseded version. */
  async updateDraft(
    id: string,
    changes: { title?: string; bodyMarkdown?: string },
  ): Promise<TenantLegalDocumentRecord> {
    const existing = await this.mustGet(id);
    if (
      existing.status === "published" ||
      existing.status === "superseded"
    ) {
      throw new ImmutableLegalDocumentError();
    }
    const saved = await this.documents.update({
      ...existing,
      title: changes.title?.trim() || existing.title,
      bodyMarkdown:
        changes.bodyMarkdown ?? existing.bodyMarkdown,
      // Any edit invalidates a prior review acknowledgement.
      humanReviewed:
        changes.bodyMarkdown !== undefined
          ? false
          : existing.humanReviewed,
      updatedAt: new Date().toISOString(),
    });
    return saved;
  }

  /** Start a new draft version from the current published/latest version. */
  async createNewVersion(
    kind: TenantLegalKind,
    createdBy?: string | null,
  ): Promise<TenantLegalDocumentRecord> {
    const base =
      (await this.documents.getPublished(kind)) ??
      (await this.documents.getLatest(kind));
    if (!base) {
      throw new LegalDocumentNotFoundError();
    }
    const now = new Date().toISOString();
    return this.documents.create({
      id: randomUUID(),
      kind,
      version: await this.nextVersion(kind),
      title: base.title,
      bodyMarkdown: base.bodyMarkdown,
      status: "draft",
      humanReviewed: false,
      effectiveDate: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      createdBy: createdBy ?? null,
    });
  }

  /** Copy any earlier version's content into a brand-new draft. */
  async restoreAsDraft(
    id: string,
    createdBy?: string | null,
  ): Promise<TenantLegalDocumentRecord> {
    const base = await this.mustGet(id);
    const now = new Date().toISOString();
    return this.documents.create({
      id: randomUUID(),
      kind: base.kind,
      version: await this.nextVersion(base.kind),
      title: base.title,
      bodyMarkdown: base.bodyMarkdown,
      status: "draft",
      humanReviewed: false,
      effectiveDate: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
      createdBy: createdBy ?? null,
    });
  }

  /** Acknowledge that a human reviewed the draft (required before publish). */
  async markReviewed(
    id: string,
  ): Promise<TenantLegalDocumentRecord> {
    const existing = await this.mustGet(id);
    if (existing.status !== "draft") {
      throw new LegalStateError(
        "Only a draft can be marked reviewed.",
      );
    }
    return this.documents.update({
      ...existing,
      humanReviewed: true,
      updatedAt: new Date().toISOString(),
    });
  }

  /**
   * Publish a reviewed draft. Fails closed if the body still contains an
   * internal marker, if the draft was not marked reviewed, or if it is not a
   * draft. Supersedes the current published version of the same kind.
   */
  async publish(
    id: string,
    options: { effectiveDate?: string } = {},
  ): Promise<TenantLegalDocumentRecord> {
    const doc = await this.mustGet(id);
    const blocker =
      findPublishBlocker(doc.bodyMarkdown) ??
      findPublishBlocker(doc.title);
    if (blocker) {
      throw new LegalMarkerError(blocker);
    }
    if (doc.status !== "draft") {
      throw new LegalStateError(
        "Only a draft can be published.",
      );
    }
    if (!doc.humanReviewed) {
      throw new LegalStateError(
        "Mark the document reviewed before publishing.",
      );
    }
    const current = await this.documents.getPublished(doc.kind);
    if (current && current.id !== doc.id) {
      await this.documents.update({
        ...current,
        status: "superseded",
        updatedAt: new Date().toISOString(),
      });
    }
    const now = new Date().toISOString();
    return this.documents.update({
      ...doc,
      status: "published",
      effectiveDate:
        options.effectiveDate ??
        doc.effectiveDate ??
        now.slice(0, 10),
      publishedAt: now,
      updatedAt: now,
    });
  }

  /** Remove a published document from public view (version retained). */
  async unpublish(
    id: string,
  ): Promise<TenantLegalDocumentRecord> {
    const doc = await this.mustGet(id);
    if (doc.status !== "published") {
      throw new LegalStateError(
        "Only a published document can be unpublished.",
      );
    }
    return this.documents.update({
      ...doc,
      status: "unpublished",
      updatedAt: new Date().toISOString(),
    });
  }

  async archive(
    id: string,
  ): Promise<TenantLegalDocumentRecord> {
    const doc = await this.mustGet(id);
    if (doc.status === "published") {
      throw new LegalStateError(
        "Unpublish a published document before archiving it.",
      );
    }
    return this.documents.update({
      ...doc,
      status: "archived",
      updatedAt: new Date().toISOString(),
    });
  }

  private async mustGet(
    id: string,
  ): Promise<TenantLegalDocumentRecord> {
    const doc = await this.documents.get(id);
    if (!doc) {
      throw new LegalDocumentNotFoundError();
    }
    return doc;
  }
}
