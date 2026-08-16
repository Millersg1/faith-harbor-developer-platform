/**
 * Keyed HMAC blind index for exact-equality lookup / duplicate detection over
 * values that are otherwise encrypted (e.g. registrant email). This exists ONLY
 * where the application genuinely needs equality search — do not create blind
 * indexes for values that are never looked up.
 *
 * Design (per the Stage 3 spec):
 *  - Uses a SEPARATE key from the AES encryption key (its own keyring slot).
 *  - Normalizes the value before hashing (purpose-specific).
 *  - Includes a purpose/domain-separation tag in the HMAC input so the same raw
 *    value under two purposes yields different indexes.
 *  - Versioned key, so the blind-index key can rotate independently.
 *  - Never an UNKEYED hash — an unkeyed hash of an email/phone is trivially
 *    reversible by dictionary. Never exposed to clients.
 *
 * LIMITATION (documented): a deterministic index leaks equality — an attacker
 * with DB access can see which rows share a value and do frequency analysis.
 * That is the accepted trade-off for equality search; it does NOT reveal the
 * plaintext without the key.
 */

import { createHmac } from "node:crypto";

import type { Keyring } from "./Keyring";

export type BlindIndexPurpose =
  | "registrant_email"
  | "registrant_phone";

function normalize(value: string, purpose: BlindIndexPurpose): string {
  const v = value.trim().toLowerCase();
  switch (purpose) {
    case "registrant_email":
      return v;
    case "registrant_phone":
      // Digits only, so formatting differences collapse to one index.
      return v.replace(/[^0-9]/g, "");
    default:
      return v;
  }
}

export class BlindIndex {
  constructor(private readonly keyring: Keyring) {}

  /** Returns "<keyVersion>:<hmacHex>" so lookups can match the versioned index. */
  compute(value: string, purpose: BlindIndexPurpose): string {
    const version = this.keyring.blindActiveVersion;
    return `${version}:${this.hmac(value, purpose, version)}`;
  }

  /** Computes the index under a specific key version (for querying old data). */
  computeVersioned(
    value: string,
    purpose: BlindIndexPurpose,
    version: number,
  ): string {
    return `${version}:${this.hmac(value, purpose, version)}`;
  }

  private hmac(
    value: string,
    purpose: BlindIndexPurpose,
    version: number,
  ): string {
    const key = this.keyring.blindKey(version);
    // Purpose/domain separation is part of the HMAC input.
    return createHmac("sha256", key)
      .update(`domain-registration|${purpose}|`)
      .update(normalize(value, purpose))
      .digest("hex");
  }
}
