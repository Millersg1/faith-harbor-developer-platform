/**
 * Registrant/admin/tech/billing contact workflow: authorize → validate +
 * normalize → TLD fail-closed → require the customer's accuracy + authorization
 * confirmation → encrypt-at-rest (Stage 3 repo). The organization is taken from
 * the tenant context inside the repository — never from the caller — and any
 * client-supplied tenant id / provider id / price / currency / premium status /
 * encrypted record id is ignored (this service simply does not accept them).
 * The registrant is always the customer; Faith Harbor / All Elite Cloud is never
 * substituted as the registrant.
 */

import {
  DomainContactRepository,
  type ContactRole,
  type StoredContactRow,
} from "../DomainContactRepository";
import type { RegistrarContact } from "../RegistrarContact";
import {
  authorizeDomainAction,
  type AuthContext,
} from "./contactAuthPolicy";
import {
  assertContactMeetsTld,
  ContactValidationError,
  normalizeContact,
} from "./contactValidation";

export class DomainContactAuthError extends Error {
  constructor(readonly reason: "role" | "reauth_required") {
    super(`Not authorized for this contact action (${reason}).`);
    this.name = "DomainContactAuthError";
  }
}

export interface SetContactInput {
  id: string;
  registrationId: string;
  role: ContactRole;
  tld: string;
  contact: RegistrarContact;
  actorId: string;
  effectiveAt: string;
  /** The customer confirmed the data is accurate. */
  accuracyConfirmed: boolean;
  /** The customer confirmed they are authorized to register the domain. */
  authorizedConfirmed: boolean;
}

export class DomainContactService {
  constructor(private readonly contacts: DomainContactRepository) {}

  /** Sets (a new immutable version of) a contact after full validation + auth. */
  async setContact(
    input: SetContactInput,
    auth: AuthContext,
  ): Promise<StoredContactRow> {
    const action =
      input.role === "registrant" ? "registrant_change" : "contact_change";
    const decision = authorizeDomainAction(action, auth);
    if (!decision.allowed) {
      throw new DomainContactAuthError(decision.reason ?? "role");
    }
    if (!input.accuracyConfirmed || !input.authorizedConfirmed) {
      // The customer must affirmatively confirm accuracy + authorization.
      throw new ContactValidationError("confirmation");
    }
    const normalized = normalizeContact(input.contact);
    assertContactMeetsTld(normalized, input.tld); // fail closed on unsupported TLD

    return this.contacts.putCurrent({
      id: input.id,
      registrationId: input.registrationId,
      role: input.role,
      contact: normalized,
      actorId: input.actorId,
      effectiveAt: input.effectiveAt,
      accuracyConfirmed: true,
      authorizedConfirmed: true,
    });
  }

  /** Reads the current contact (decrypted, tenant-scoped). */
  getContact(registrationId: string, role: ContactRole) {
    return this.contacts.getCurrent(registrationId, role);
  }

  /** Immutable version history (no plaintext PII in the rows returned). */
  history(registrationId: string, role: ContactRole) {
    return this.contacts.history(registrationId, role);
  }
}
