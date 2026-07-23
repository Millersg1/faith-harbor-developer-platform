import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

const KEY_LENGTH = 64;

/**
 * scrypt CPU/memory cost (N, a power of two). Strong in production; much
 * cheaper under NODE_ENV=test so the suite's many concurrent hashes don't
 * starve the CPU and time out. The cost is stored in each hash, so a hash
 * is always verified with the cost it was created at.
 */
const COST =
  process.env.NODE_ENV === "test"
    ? 1024
    : 16384;

/**
 * Hashes a password with scrypt and a per-password random salt, returning
 * a self-describing `cost:salt:hash` string. No external dependencies —
 * scrypt is memory-hard and built into Node.
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
    { N: COST },
  );

  return `${COST}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verifies a password against a stored hash. Accepts the current
 * `cost:salt:hash` form and the earlier `salt:hash` form (implied cost
 * 16384), so hashes created before the cost was recorded still verify.
 * Uses a constant-time comparison; returns false for any malformed value.
 */
export function verifyPassword(
  password: string,
  stored: string,
): boolean {
  const parts = (stored ?? "").split(
    ":",
  );

  let cost: number;
  let saltHex: string;
  let hashHex: string;

  if (parts.length === 3) {
    cost = Number(parts[0]);
    saltHex = parts[1];
    hashHex = parts[2];
  } else if (parts.length === 2) {
    cost = 16384;
    saltHex = parts[0];
    hashHex = parts[1];
  } else {
    return false;
  }

  if (
    !cost ||
    !saltHex ||
    !hashHex
  ) {
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
    { N: cost },
  );

  return (
    derived.length ===
      expected.length &&
    timingSafeEqual(derived, expected)
  );
}
