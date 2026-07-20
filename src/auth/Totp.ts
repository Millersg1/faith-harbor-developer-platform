import {
  createHmac,
  randomBytes,
} from "node:crypto";

const BASE32_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generates a new base32 TOTP secret (RFC 4648, no padding).
 */
export function generateTotpSecret(
  bytes = 20,
): string {
  const buffer = randomBytes(bytes);

  let bits = "";

  for (const byte of buffer) {
    bits += byte
      .toString(2)
      .padStart(8, "0");
  }

  let secret = "";

  for (
    let i = 0;
    i + 5 <= bits.length;
    i += 5
  ) {
    const chunk = bits.slice(
      i,
      i + 5,
    );

    secret +=
      BASE32_ALPHABET[
        parseInt(chunk, 2)
      ];
  }

  return secret;
}

/**
 * Builds the otpauth:// URL used to make an authenticator QR code.
 */
export function otpauthUrl(
  secret: string,
  account: string,
  issuer = "Faith Harbor OS",
): string {
  const label = encodeURIComponent(
    `${issuer}:${account}`,
  );

  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });

  return `otpauth://totp/${label}?${params.toString()}`;
}

/**
 * Decodes a base32 secret to raw bytes.
 */
function base32Decode(
  secret: string,
): Buffer {
  const clean = secret
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/\s/g, "");

  let bits = "";

  for (const char of clean) {
    const index =
      BASE32_ALPHABET.indexOf(char);

    if (index === -1) {
      continue;
    }

    bits += index
      .toString(2)
      .padStart(5, "0");
  }

  const bytes: number[] = [];

  for (
    let i = 0;
    i + 8 <= bits.length;
    i += 8
  ) {
    bytes.push(
      parseInt(
        bits.slice(i, i + 8),
        2,
      ),
    );
  }

  return Buffer.from(bytes);
}

/**
 * Computes the 6-digit TOTP code for a counter.
 */
function codeForCounter(
  secret: string,
  counter: number,
): string {
  const key = base32Decode(secret);

  const message = Buffer.alloc(8);

  // 64-bit big-endian counter.
  message.writeBigUInt64BE(
    BigInt(counter),
  );

  const hmac = createHmac(
    "sha1",
    key,
  )
    .update(message)
    .digest();

  const offset =
    hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) <<
      16) |
    ((hmac[offset + 2] & 0xff) <<
      8) |
    (hmac[offset + 3] & 0xff);

  return (binary % 1_000_000)
    .toString()
    .padStart(6, "0");
}

/**
 * Returns the current 6-digit TOTP code for a secret. `now` is
 * injectable for deterministic tests.
 */
export function currentTotp(
  secret: string,
  now: number = Date.now(),
): string {
  return codeForCounter(
    secret,
    Math.floor(now / 1000 / 30),
  );
}

/**
 * Verifies a TOTP token against a secret, allowing ±`window` steps of
 * clock drift. `now` is injectable for deterministic tests.
 */
export function verifyTotp(
  token: string,
  secret: string,
  window = 1,
  now: number = Date.now(),
): boolean {
  const trimmed = token
    .trim()
    .replace(/\s/g, "");

  if (!/^\d{6}$/.test(trimmed)) {
    return false;
  }

  const counter = Math.floor(
    now / 1000 / 30,
  );

  for (
    let drift = -window;
    drift <= window;
    drift += 1
  ) {
    if (
      codeForCounter(
        secret,
        counter + drift,
      ) === trimmed
    ) {
      return true;
    }
  }

  return false;
}
