/**
 * Server-side validation + normalization of registrant/admin/tech/billing
 * contact data, and TLD-specific requirement checks that FAIL CLOSED when a
 * TLD's registry requirements are not yet supported.
 *
 * PRIVACY: validation errors name only the offending FIELD — never the value —
 * so no contact PII can leak into logs, errors, or audit metadata.
 */

import type { RegistrarContact } from "../RegistrarContact";

export class ContactValidationError extends Error {
  constructor(readonly field: string) {
    super(`Invalid or missing contact field: ${field}.`);
    this.name = "ContactValidationError";
  }
}

export class UnsupportedTldRequirementError extends Error {
  constructor(readonly tld: string) {
    super(`TLD .${tld} has registry contact requirements not yet supported.`);
    this.name = "UnsupportedTldRequirementError";
  }
}

const CONTROL = /[\p{Cc}\p{Cf}]/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function reqStr(value: string | undefined, field: string, max = 255): string {
  const v = (value ?? "").trim();
  if (v.length === 0 || v.length > max || CONTROL.test(v)) {
    throw new ContactValidationError(field);
  }
  return v;
}

function optStr(value: string | undefined, field: string, max = 255): string | undefined {
  if (value == null || value.trim() === "") return undefined;
  return reqStr(value, field, max);
}

/** Normalizes a phone into a compact `+<digits>` form; requires 7–15 digits. */
function normalizePhone(value: string | undefined): string {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) {
    throw new ContactValidationError("phone");
  }
  return `+${digits}`;
}

function normalizeEmail(value: string | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  if (v.length === 0 || v.length > 254 || !EMAIL_RE.test(v)) {
    throw new ContactValidationError("email");
  }
  return v;
}

function normalizeCountry(value: string | undefined): string {
  const v = (value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(v)) {
    throw new ContactValidationError("country");
  }
  return v;
}

/** Returns a normalized copy; throws {@link ContactValidationError} on any bad field. */
export function normalizeContact(input: RegistrarContact): RegistrarContact {
  return {
    firstName: reqStr(input.firstName, "firstName"),
    lastName: reqStr(input.lastName, "lastName"),
    organization: optStr(input.organization, "organization"),
    address1: reqStr(input.address1, "address1"),
    address2: optStr(input.address2, "address2"),
    city: reqStr(input.city, "city"),
    stateProvince: reqStr(input.stateProvince, "stateProvince"),
    postalCode: reqStr(input.postalCode, "postalCode", 32),
    country: normalizeCountry(input.country),
    phone: normalizePhone(input.phone),
    email: normalizeEmail(input.email),
  };
}

/**
 * TLDs whose registry needs only the STANDARD contact set we collect. Anything
 * else (e.g. .us nexus, .ca CIRA presence, .eu/.de residency, .au eligibility)
 * FAILS CLOSED until its extra requirements are explicitly supported.
 */
const STANDARD_TLDS = new Set([
  "com",
  "net",
  "org",
  "info",
  "biz",
  "co",
  "io",
]);

export interface TldContactRequirements {
  supported: boolean;
  requiresStateProvince: boolean;
  requiresPostalCode: boolean;
}

export function tldContactRequirements(tld: string): TldContactRequirements {
  const t = tld.replace(/^\./, "").toLowerCase();
  return {
    supported: STANDARD_TLDS.has(t),
    requiresStateProvince: true,
    requiresPostalCode: true,
  };
}

/** Validates a normalized contact against a TLD; throws (fail closed) if unsupported. */
export function assertContactMeetsTld(
  contact: RegistrarContact,
  tld: string,
): void {
  const req = tldContactRequirements(tld);
  if (!req.supported) {
    throw new UnsupportedTldRequirementError(tld.replace(/^\./, ""));
  }
  if (req.requiresStateProvince && !contact.stateProvince) {
    throw new ContactValidationError("stateProvince");
  }
  if (req.requiresPostalCode && !contact.postalCode) {
    throw new ContactValidationError("postalCode");
  }
}
