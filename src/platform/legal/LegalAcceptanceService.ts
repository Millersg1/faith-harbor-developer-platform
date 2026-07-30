import { randomUUID } from "node:crypto";

import type { LegalKind } from "./PlatformLegalDocument";
import { REQUIRED_ACCEPTANCE_KINDS } from "./LegalAcceptance";
import type { LegalAcceptanceRecord } from "./LegalAcceptance";
import { LegalAcceptanceRepository } from "./LegalAcceptanceRepository";
import type { PlatformLegalService } from "./PlatformLegalService";

/** A document a user still needs to (re-)accept. */
export interface PendingAcceptance {
  kind: LegalKind;
  version: number;
  title: string;
}

/**
 * Records and evaluates legal acceptance for tenant users.
 *
 * Signup acceptance records the exact CURRENTLY-PUBLISHED versions of the
 * required documents (Terms + Privacy). Existing users are never retroactively
 * locked out — a version only requires renewed acceptance when a platform
 * owner explicitly marks it `requiresReconsent`, and even then it is surfaced
 * as a pending item, not an automatic lockout.
 */
export class LegalAcceptanceService {
  constructor(
    private readonly repository: LegalAcceptanceRepository,
    private readonly legal: PlatformLegalService,
  ) {}

  /**
   * The published required documents a user must accept right now. Only
   * returns kinds that actually have a published version — you cannot accept
   * a document that is not yet published.
   */
  async requiredPublished(): Promise<
    { kind: LegalKind; version: number; title: string }[]
  > {
    const docs = await Promise.all(
      REQUIRED_ACCEPTANCE_KINDS.map((kind) =>
        this.legal.getPublished(kind),
      ),
    );
    return docs
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({
        kind: d.kind,
        version: d.version,
        title: d.title,
      }));
  }

  /** True when there is at least one published required document to accept. */
  async acceptanceRequired(): Promise<boolean> {
    const req = await this.requiredPublished();
    return req.length > 0;
  }

  /**
   * Record acceptance of every currently-published required document for a
   * user. Called from signup (must run inside the tenant context). Returns the
   * rows written (empty if nothing is published yet).
   */
  async recordAcceptance(input: {
    userId: string;
    source: string;
    ip?: string | null;
  }): Promise<LegalAcceptanceRecord[]> {
    const required = await this.requiredPublished();
    const now = new Date().toISOString();
    const written: LegalAcceptanceRecord[] = [];
    for (const doc of required) {
      const row = await this.repository.create({
        id: randomUUID(),
        userId: input.userId,
        documentKind: doc.kind,
        documentVersion: doc.version,
        acceptedAt: now,
        source: input.source,
        ip: input.ip ?? null,
      });
      written.push(row);
    }
    return written;
  }

  /**
   * Documents an existing user must re-accept: the current published version
   * is flagged `requiresReconsent` AND the user has not yet accepted that exact
   * version. Nothing is returned unless an owner explicitly required it.
   */
  async pendingReconsent(
    userId: string,
  ): Promise<PendingAcceptance[]> {
    const pending: PendingAcceptance[] = [];
    for (const kind of REQUIRED_ACCEPTANCE_KINDS) {
      const doc = await this.legal.getPublished(kind);
      if (!doc || !doc.requiresReconsent) {
        continue;
      }
      const accepted = await this.repository.hasAccepted(
        userId,
        kind,
        doc.version,
      );
      if (!accepted) {
        pending.push({
          kind: doc.kind,
          version: doc.version,
          title: doc.title,
        });
      }
    }
    return pending;
  }

  async listForUser(
    userId: string,
  ): Promise<LegalAcceptanceRecord[]> {
    return this.repository.listForUser(userId);
  }
}
