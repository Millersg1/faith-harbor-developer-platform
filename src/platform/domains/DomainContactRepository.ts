/**
 * Tenant-scoped repository for registrant/admin/tech/billing contacts, with
 * encryption-at-rest and immutable version history.
 *
 * Encryption boundary: the plaintext {@link RegistrarContact} is serialized and
 * sealed with {@link EnvelopeCipher} (AES-256-GCM) whose AAD binds the
 * ciphertext to (organization, registration+role, field type) — a row copied to
 * another tenant/record/role fails authentication. ONLY the envelope string is
 * ever written to `contact_ciphertext`; plaintext never touches a column, a log,
 * or audit metadata. Equality lookups use keyed HMAC blind indexes, never the
 * plaintext. Corrections create a NEW version (immutable evidence); the prior
 * version's `is_current` is cleared but its ciphertext/actor/effective_at are
 * never altered.
 */

import type { PgQueryable } from "../../persistence/PgQueryable";
import { TenantScopedRepository } from "../../tenancy/TenantScopedRepository";
import type { BlindIndex } from "./crypto/BlindIndex";
import type { EnvelopeCipher } from "./crypto/EnvelopeCipher";
import type { RegistrarContact } from "./RegistrarContact";

export type ContactRole = "registrant" | "admin" | "tech" | "billing";
const FIELD_TYPE = "registrant_contact";

export interface StoredContactRow {
  id: string;
  organizationId: string;
  registrationId: string;
  role: ContactRole;
  version: number;
  isCurrent: boolean;
  contactCiphertext: string;
  encAlg: string;
  keyVersion: number;
  emailBlindIndex?: string;
  phoneBlindIndex?: string;
  effectiveAt: string;
  actorId?: string;
  createdAt: string;
}

function recordIdFor(registrationId: string, role: ContactRole): string {
  return `${registrationId}:${role}`;
}

export class DomainContactRepository extends TenantScopedRepository {
  private readonly mem = new Map<string, StoredContactRow>();

  constructor(
    private readonly cipher: EnvelopeCipher,
    private readonly blind: BlindIndex,
    db?: PgQueryable,
  ) {
    super(db);
  }

  /** Encrypts + stores a new current version; supersedes the prior current. */
  async putCurrent(args: {
    id: string;
    registrationId: string;
    role: ContactRole;
    contact: RegistrarContact;
    actorId?: string;
    effectiveAt: string;
  }): Promise<StoredContactRow> {
    const organizationId = this.tenantId();
    const ctx = {
      organizationId,
      recordId: recordIdFor(args.registrationId, args.role),
      fieldType: FIELD_TYPE,
    };
    const ciphertext = this.cipher.encrypt(JSON.stringify(args.contact), ctx);
    const emailBi = this.blind.compute(args.contact.email, "registrant_email");
    const phoneBi = this.blind.compute(args.contact.phone, "registrant_phone");
    const prior = await this.currentRow(args.registrationId, args.role);
    const version = (prior?.version ?? 0) + 1;
    const row: StoredContactRow = {
      id: args.id,
      organizationId,
      registrationId: args.registrationId,
      role: args.role,
      version,
      isCurrent: true,
      contactCiphertext: ciphertext,
      encAlg: "aes-256-gcm",
      keyVersion: this.cipher.activeKeyVersion(),
      emailBlindIndex: emailBi,
      phoneBlindIndex: phoneBi,
      effectiveAt: args.effectiveAt,
      actorId: args.actorId,
      createdAt: args.effectiveAt,
    };
    if (this.db) {
      await this.db.query(
        `UPDATE domain_contacts SET is_current = false
           WHERE registration_id = $1 AND contact_role = $2 AND organization_id = $3 AND is_current`,
        [args.registrationId, args.role, organizationId],
      );
      await this.db.query(
        `INSERT INTO domain_contacts
           (id, organization_id, registration_id, contact_role, version, is_current,
            contact_ciphertext, enc_alg, key_version, email_blind_index,
            phone_blind_index, effective_at, actor_id, created_at)
         VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12,$11)`,
        [
          row.id,
          organizationId,
          row.registrationId,
          row.role,
          row.version,
          row.contactCiphertext,
          row.encAlg,
          row.keyVersion,
          row.emailBlindIndex ?? null,
          row.phoneBlindIndex ?? null,
          row.effectiveAt,
          row.actorId ?? null,
        ],
      );
    } else {
      for (const r of this.mem.values()) {
        if (
          r.organizationId === organizationId &&
          r.registrationId === args.registrationId &&
          r.role === args.role
        ) {
          r.isCurrent = false;
        }
      }
      this.mem.set(row.id, row);
    }
    return row;
  }

  /** Decrypts + returns the current contact, or undefined. Tenant-scoped. */
  async getCurrent(
    registrationId: string,
    role: ContactRole,
  ): Promise<RegistrarContact | undefined> {
    const organizationId = this.tenantId();
    const row = await this.currentRow(registrationId, role);
    if (!row) return undefined;
    const ctx = {
      organizationId,
      recordId: recordIdFor(registrationId, role),
      fieldType: FIELD_TYPE,
    };
    // AAD binding means a row from another tenant/record/role cannot decrypt.
    const json = this.cipher.decrypt(row.contactCiphertext, ctx);
    return JSON.parse(json) as RegistrarContact;
  }

  /** Full version history (evidence), newest first. No plaintext returned. */
  async history(
    registrationId: string,
    role: ContactRole,
  ): Promise<StoredContactRow[]> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_contacts
           WHERE registration_id = $1 AND contact_role = $2 AND organization_id = $3
           ORDER BY version DESC`,
        [registrationId, role, organizationId],
      );
      return r.rows.map(mapContactRow);
    }
    return [...this.mem.values()]
      .filter(
        (x) =>
          x.organizationId === organizationId &&
          x.registrationId === registrationId &&
          x.role === role,
      )
      .sort((a, b) => b.version - a.version);
  }

  private async currentRow(
    registrationId: string,
    role: ContactRole,
  ): Promise<StoredContactRow | undefined> {
    const organizationId = this.tenantId();
    if (this.db) {
      const r = await this.db.query(
        `SELECT * FROM domain_contacts
           WHERE registration_id = $1 AND contact_role = $2
             AND organization_id = $3 AND is_current
           LIMIT 1`,
        [registrationId, role, organizationId],
      );
      return r.rows[0] ? mapContactRow(r.rows[0]) : undefined;
    }
    return [...this.mem.values()].find(
      (x) =>
        x.organizationId === organizationId &&
        x.registrationId === registrationId &&
        x.role === role &&
        x.isCurrent,
    );
  }
}

function mapContactRow(row: Record<string, unknown>): StoredContactRow {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    registrationId: String(row.registration_id),
    role: String(row.contact_role) as ContactRole,
    version: Number(row.version),
    isCurrent: Boolean(row.is_current),
    contactCiphertext: String(row.contact_ciphertext),
    encAlg: String(row.enc_alg),
    keyVersion: Number(row.key_version),
    emailBlindIndex: row.email_blind_index
      ? String(row.email_blind_index)
      : undefined,
    phoneBlindIndex: row.phone_blind_index
      ? String(row.phone_blind_index)
      : undefined,
    effectiveAt: String(row.effective_at),
    actorId: row.actor_id ? String(row.actor_id) : undefined,
    createdAt: String(row.created_at),
  };
}
