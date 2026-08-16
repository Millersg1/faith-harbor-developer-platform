/**
 * A registrant/admin/tech/billing contact as the registrar requires it. This is
 * the shape validated server-side (Stage 5) and encrypted at rest (Stage 3);
 * the provider layer only passes it through to the registrar API. It is PII and
 * must never appear in logs, audit metadata, or cross-tenant responses.
 */
export interface RegistrarContact {
  firstName: string;
  lastName: string;
  organization?: string;
  address1: string;
  address2?: string;
  city: string;
  /** State/province — some TLDs require it. */
  stateProvince: string;
  postalCode: string;
  /** ISO 3166-1 alpha-2 country code. */
  country: string;
  /** E.164-ish phone, e.g. "+1.5551234567" (registrar format). */
  phone: string;
  email: string;
}
