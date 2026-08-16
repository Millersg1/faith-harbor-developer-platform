import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { BlindIndex } from "./BlindIndex";
import {
  buildAad,
  DecryptAuthError,
  EnvelopeCipher,
  EnvelopeFormatError,
  type EncryptionContext,
} from "./EnvelopeCipher";
import { Keyring, KeyConfigError, UnknownKeyVersionError } from "./Keyring";

const key = (seed: number) =>
  Buffer.alloc(32, seed).toString("base64");

function ring(opts?: {
  encActive?: number;
  encKeys?: Record<number, string>;
}): Keyring {
  return new Keyring({
    encKeys: opts?.encKeys ?? { 1: key(1) },
    encActiveVersion: opts?.encActive ?? 1,
    blindKeys: { 1: key(9) },
    blindActiveVersion: 1,
  });
}

const ctx: EncryptionContext = {
  organizationId: "org-1",
  recordId: "rec-1",
  fieldType: "registrant_contact",
};

describe("Keyring", () => {
  it("rejects non-32-byte keys", () => {
    expect(
      () =>
        new Keyring({
          encKeys: { 1: Buffer.alloc(16, 1).toString("base64") },
          encActiveVersion: 1,
          blindKeys: { 1: key(9) },
          blindActiveVersion: 1,
        }),
    ).toThrow(KeyConfigError);
  });
  it("requires the active version to be present", () => {
    expect(
      () =>
        new Keyring({
          encKeys: { 1: key(1) },
          encActiveVersion: 2,
          blindKeys: { 1: key(9) },
          blindActiveVersion: 1,
        }),
    ).toThrow(KeyConfigError);
  });
  it("fromEnv returns null when unconfigured (fail closed)", () => {
    expect(Keyring.fromEnv({})).toBeNull();
  });
  it("fromEnv builds from versioned env vars", () => {
    const r = Keyring.fromEnv({
      DOMAIN_CONTACT_ENC_KEY_V1: key(1),
      DOMAIN_CONTACT_ENC_ACTIVE_VERSION: "1",
      DOMAIN_BLIND_INDEX_KEY_V1: key(9),
      DOMAIN_BLIND_INDEX_ACTIVE_VERSION: "1",
    });
    expect(r).not.toBeNull();
    expect(r!.encActiveVersion).toBe(1);
  });
});

describe("EnvelopeCipher (AES-256-GCM)", () => {
  it("round-trips plaintext", () => {
    const c = new EnvelopeCipher(ring());
    const env = c.encrypt("Jane Doe, 1 Main St", ctx);
    expect(c.decrypt(env, ctx)).toBe("Jane Doe, 1 Main St");
  });

  it("uses a fresh random nonce — identical plaintext yields different ciphertext", () => {
    const c = new EnvelopeCipher(ring());
    const a = c.encrypt("same", ctx);
    const b = c.encrypt("same", ctx);
    expect(a).not.toBe(b);
    expect(c.decrypt(a, ctx)).toBe("same");
    expect(c.decrypt(b, ctx)).toBe("same");
  });

  it("AAD prevents cross-TENANT ciphertext reuse", () => {
    const c = new EnvelopeCipher(ring());
    const env = c.encrypt("secret", ctx);
    expect(() => c.decrypt(env, { ...ctx, organizationId: "org-2" })).toThrow(
      DecryptAuthError,
    );
  });

  it("AAD prevents cross-RECORD and cross-FIELD reuse", () => {
    const c = new EnvelopeCipher(ring());
    const env = c.encrypt("secret", ctx);
    expect(() => c.decrypt(env, { ...ctx, recordId: "rec-2" })).toThrow(
      DecryptAuthError,
    );
    expect(() => c.decrypt(env, { ...ctx, fieldType: "other" })).toThrow(
      DecryptAuthError,
    );
  });

  it("tampered ciphertext / nonce / tag fails closed (no partial plaintext)", () => {
    const c = new EnvelopeCipher(ring());
    const env = c.encrypt("secret", ctx);
    const parts = env.split(":");
    // flip a byte in the ciphertext
    const ct = Buffer.from(parts[4], "base64");
    ct[0] ^= 0xff;
    parts[4] = ct.toString("base64");
    expect(() => c.decrypt(parts.join(":"), ctx)).toThrow(DecryptAuthError);
  });

  it("unknown key version fails closed", () => {
    const c = new EnvelopeCipher(ring());
    const env = c.encrypt("secret", ctx);
    const parts = env.split(":");
    parts[1] = "99";
    expect(() => c.decrypt(parts.join(":"), ctx)).toThrow(
      UnknownKeyVersionError,
    );
  });

  it("decrypts old-version data while writing under the active version", () => {
    // Write under v1.
    const v1 = new EnvelopeCipher(ring({ encActive: 1 }));
    const oldEnv = v1.encrypt("legacy", ctx);
    // Now v2 is active but v1 is still available for decrypt.
    const both = new EnvelopeCipher(
      ring({ encActive: 2, encKeys: { 1: key(1), 2: key(2) } }),
    );
    expect(both.decrypt(oldEnv, ctx)).toBe("legacy"); // old key decrypts
    const newEnv = both.encrypt("fresh", ctx);
    expect(both.versionOf(newEnv)).toBe(2); // new write uses active v2
  });

  it("rotation re-encrypts to the active version with a fresh nonce", () => {
    const both = new EnvelopeCipher(
      ring({ encActive: 2, encKeys: { 1: key(1), 2: key(2) } }),
    );
    const v1 = new EnvelopeCipher(ring({ encActive: 1 }));
    const oldEnv = v1.encrypt("rotate-me", ctx);
    const rotated = both.reencryptToActive(oldEnv, ctx);
    expect(both.versionOf(rotated)).toBe(2);
    expect(rotated).not.toBe(oldEnv);
    expect(both.decrypt(rotated, ctx)).toBe("rotate-me");
    // nonce differs
    expect(oldEnv.split(":")[2]).not.toBe(rotated.split(":")[2]);
  });

  it("rejects malformed envelopes", () => {
    const c = new EnvelopeCipher(ring());
    expect(() => c.decrypt("nonsense", ctx)).toThrow(EnvelopeFormatError);
    expect(() => buildAad({ ...ctx, organizationId: "" })).toThrow();
  });

  it("random keys still round-trip (sanity over key space)", () => {
    const c = new EnvelopeCipher(
      new Keyring({
        encKeys: { 1: randomBytes(32).toString("base64") },
        encActiveVersion: 1,
        blindKeys: { 1: randomBytes(32).toString("base64") },
        blindActiveVersion: 1,
      }),
    );
    const env = c.encrypt("x", ctx);
    expect(c.decrypt(env, ctx)).toBe("x");
  });
});

describe("BlindIndex", () => {
  it("is deterministic + versioned for equal values", () => {
    const b = new BlindIndex(ring());
    const i1 = b.compute("Jane@Example.com ", "registrant_email");
    const i2 = b.compute("jane@example.com", "registrant_email");
    expect(i1).toBe(i2); // normalized
    expect(i1.startsWith("1:")).toBe(true); // versioned
  });

  it("separates purposes (same raw value -> different index)", () => {
    const b = new BlindIndex(ring());
    const email = b.compute("1234567", "registrant_email");
    const phone = b.compute("1234567", "registrant_phone");
    expect(email).not.toBe(phone);
  });

  it("normalizes phone to digits only", () => {
    const b = new BlindIndex(ring());
    expect(b.compute("+1 (555) 123-4567", "registrant_phone")).toBe(
      b.compute("15551234567", "registrant_phone"),
    );
  });

  it("uses a SEPARATE key from encryption (different key -> different index)", () => {
    const a = new BlindIndex(
      new Keyring({
        encKeys: { 1: key(1) },
        encActiveVersion: 1,
        blindKeys: { 1: key(9) },
        blindActiveVersion: 1,
      }),
    );
    const b = new BlindIndex(
      new Keyring({
        encKeys: { 1: key(1) },
        encActiveVersion: 1,
        blindKeys: { 1: key(8) },
        blindActiveVersion: 1,
      }),
    );
    expect(a.compute("x@y.com", "registrant_email")).not.toBe(
      b.compute("x@y.com", "registrant_email"),
    );
  });
});
