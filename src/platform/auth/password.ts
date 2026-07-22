import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;

/**
 * Hashes a password with scrypt and a per-password random salt, returning
 * a self-describing `salt:hash` string (both hex). No external
 * dependencies — scrypt is memory-hard and built into Node.
 */
export function hashPassword(
  password: string,
): string {
  if (!password) {
    throw new Error(
      "A password is required.",
    );
  }

  const salt = randomBytes(16);
  const derived = scryptSync(
    password,
    salt,
    KEY_LENGTH,
  );

  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verifies a password against a stored `salt:hash`. Uses a constant-time
 * comparison so it does not leak information through timing. Returns false
 * for any malformed stored value rather than throwing.
 */
export function verifyPassword(
  password: string,
  stored: string,
): boolean {
  const [saltHex, hashHex] = (
    stored ?? ""
  ).split(":");

  if (!saltHex || !hashHex) {
    return false;
  }

  const expected = Buffer.from(
    hashHex,
    "hex",
  );

  if (expected.length === 0) {
    return false;
  }

  const derived = scryptSync(
    password,
    Buffer.from(saltHex, "hex"),
    expected.length,
  );

  return (
    derived.length ===
      expected.length &&
    timingSafeEqual(derived, expected)
  );
}
