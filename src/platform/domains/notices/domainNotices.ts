/**
 * DESIGN ONLY — the customer notices the domain subsystem will send. NOTHING is
 * sent in this stage. These are TRANSACTIONAL notices only: no marketing
 * enrollment, no consent inference. When wired (a later stage), they go through
 * the platform's transactional email path (`EmailDeliveryProvider`,
 * `messageClass: "transactional"`), deduplicated per logical id, with no
 * List-Unsubscribe/marketing headers.
 *
 * This module exposes the notice catalog + a pure mapping from a lifecycle event
 * to the intended notice — so tests can assert coverage without sending mail.
 */

export type DomainNoticeType =
  | "order_received"
  | "registration_successful"
  | "registration_failed_refund"
  | "registration_ambiguous_review"
  | "contact_verification_required"
  | "transfer_initiated"
  | "transfer_completed"
  | "transfer_failed"
  | "renewal_reminder"
  | "auto_renew_result"
  | "expiration_grace_redemption_warning"
  | "registrant_contact_changed"
  | "epp_code_requested";

export interface DomainNoticeSpec {
  type: DomainNoticeType;
  /** Always transactional — never marketing. */
  messageClass: "transactional";
  /** Human summary of when it fires (documentation, not logic). */
  when: string;
  /** Logical-id prefix for dedup (per registration/order + type). */
  logicalIdPrefix: string;
}

export const DOMAIN_NOTICES: Record<DomainNoticeType, DomainNoticeSpec> = {
  order_received: t("order_received", "A domain order is created (payment pending)."),
  registration_successful: t("registration_successful", "The registrar confirms the domain is registered."),
  registration_failed_refund: t("registration_failed_refund", "A definitive registration failure; refund status included."),
  registration_ambiguous_review: t("registration_ambiguous_review", "An ambiguous outcome is under reconciliation."),
  contact_verification_required: t("contact_verification_required", "The registry/registrar requires registrant verification."),
  transfer_initiated: t("transfer_initiated", "An incoming/outgoing transfer has started."),
  transfer_completed: t("transfer_completed", "A transfer completed."),
  transfer_failed: t("transfer_failed", "A transfer failed."),
  renewal_reminder: t("renewal_reminder", "Upcoming renewal (per registrar-provided timing)."),
  auto_renew_result: t("auto_renew_result", "An auto-renew attempt succeeded or failed."),
  expiration_grace_redemption_warning: t("expiration_grace_redemption_warning", "Expiration/grace/redemption risk (no invented universal deadlines)."),
  registrant_contact_changed: t("registrant_contact_changed", "A material registrant/contact change was made."),
  epp_code_requested: t("epp_code_requested", "An EPP/auth code was requested through the registrar's process."),
};

function t(type: DomainNoticeType, when: string): DomainNoticeSpec {
  return {
    type,
    messageClass: "transactional",
    when,
    logicalIdPrefix: `domain-${type}`,
  };
}

/** The complete, ordered catalog (for coverage checks + admin/UI display). */
export function domainNoticeCatalog(): DomainNoticeSpec[] {
  return Object.values(DOMAIN_NOTICES);
}
