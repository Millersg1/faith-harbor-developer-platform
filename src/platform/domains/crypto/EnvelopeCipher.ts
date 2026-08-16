/**
 * Authenticated envelope encryption (AES-256-GCM) for registrant/contact PII.
 *
 * Format (a single self-describing string, versioned):
 *   "v1:<keyVersion>:<nonceB64>:<tagB64>:<ciphertextB64>"
 * where nonce is a fresh cryptographically-random 96-bit value per operation
 * (never reused with a key), tag is the 128-bit GCM auth tag, and the format
 * prefix ("v1") is the envelope-format version.
 *
 * AAD binds the ciphertext to stable context — organization id, record id,
 * logical field/payload type, and the envelope-format version — so a ciphertext
 * copied to another tenant, record, or field FAILS authentication and yields no
 * plaintext. Authentication failure fails closed (throws {@link DecryptAuthError});
 * partial plaintext is never returned. Plaintext/ciphertext are never logged.
 *
 * Node cannot guarantee secure erasure of GC-managed strings; we overwrite the
 * Buffers we control (nonce, plaintext buffer) with zeros after use as a
 * best-effort measure and document the limitation honestly.
 *
 * See NIST SP 800-38D for the GCM nonce-uniqueness and authentication rules.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { Keyring } from "./Keyring";

const FORMAT = "v1";
const ALGO = "aes-256-gcm";
const NONCE_BYTES = 12; // 96-bit, per SP 800-38D
const TAG_BYTES = 16;

export interface EncryptionContext {
  organizationId: string;
  /** The domain record this payload belongs to (contact/registration id). */
  recordId: string;
  /** Logical field or payload type, e.g. "registrant_contact". */
  fieldType: string;
}

export class DecryptAuthError extends Error {
  constructor(message = "Ciphertext authentication failed (fail closed).") {
    super(message);
    this.name = "DecryptAuthError";
  }
}

export class EnvelopeFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeFormatError";
  }
}

/** Canonical AAD binding — order + separators are part of the contract. */
export function buildAad(ctx: EncryptionContext): Buffer {
  if (!ctx.organizationId || !ctx.recordId || !ctx.fieldType) {
    throw new EnvelopeFormatError("Encryption context is incomplete.");
  }
  return Buffer.from(
    `${FORMAT}|${ctx.organizationId}|${ctx.recordId}|${ctx.fieldType}`,
    "utf8",
  );
}

export class EnvelopeCipher {
  constructor(private readonly keyring: Keyring) {}

  /** The active key version new writes are sealed under (for storage metadata). */
  activeKeyVersion(): number {
    return this.keyring.encActiveVersion;
  }

  encrypt(plaintext: string, ctx: EncryptionContext): string {
    const key = this.keyring.encKey(this.keyring.encActiveVersion);
    const nonce = randomBytes(NONCE_BYTES);
    const aad = buildAad(ctx);
    const cipher = createCipheriv(ALGO, key, nonce);
    cipher.setAAD(aad);
    const pt = Buffer.from(plaintext, "utf8");
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    const envelope = [
      FORMAT,
      String(this.keyring.encActiveVersion),
      nonce.toString("base64"),
      tag.toString("base64"),
      ct.toString("base64"),
    ].join(":");
    // Best-effort scrub of buffers we own (Node can't scrub the GC'd string).
    pt.fill(0);
    nonce.fill(0);
    return envelope;
  }

  decrypt(envelope: string, ctx: EncryptionContext): string {
    const parts = envelope.split(":");
    if (parts.length !== 5 || parts[0] !== FORMAT) {
      throw new EnvelopeFormatError("Unrecognized envelope format.");
    }
    const version = Number(parts[1]);
    if (!Number.isInteger(version)) {
      throw new EnvelopeFormatError("Bad key version.");
    }
    const nonce = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const ct = Buffer.from(parts[4], "base64");
    if (nonce.length !== NONCE_BYTES || tag.length !== TAG_BYTES) {
      throw new EnvelopeFormatError("Bad nonce/tag length.");
    }
    // Unknown key version throws UnknownKeyVersionError (fail closed).
    const key = this.keyring.encKey(version);
    const decipher = createDecipheriv(ALGO, key, nonce);
    decipher.setAAD(buildAad(ctx));
    decipher.setAuthTag(tag);
    try {
      const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
      const out = pt.toString("utf8");
      pt.fill(0);
      return out;
    } catch {
      // Tampered ciphertext/nonce/tag or wrong AAD (cross-tenant/record/field).
      throw new DecryptAuthError();
    }
  }

  /** The key version an existing envelope was written under (for rotation). */
  versionOf(envelope: string): number {
    const parts = envelope.split(":");
    if (parts.length !== 5 || parts[0] !== FORMAT) {
      throw new EnvelopeFormatError("Unrecognized envelope format.");
    }
    return Number(parts[1]);
  }

  /**
   * Re-encrypt an envelope under the active key with a FRESH nonce. Used by the
   * rotation job; it decrypts (authenticating the original) then encrypts anew,
   * so the replacement is authenticated before the caller commits it. The caller
   * must durably commit the new envelope before discarding the old one.
   */
  reencryptToActive(envelope: string, ctx: EncryptionContext): string {
    const plaintext = this.decrypt(envelope, ctx);
    return this.encrypt(plaintext, ctx);
  }
}
