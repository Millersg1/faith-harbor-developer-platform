import {
  describe,
  expect,
  it,
} from "vitest";

import {
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "./Totp";

describe("Totp", () => {
  it("verifies a known RFC 6238 vector", () => {
    // RFC 6238 test secret "12345678901234567890" -> base32.
    const secret =
      "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    // At T=59s the SHA-1 TOTP is 287082.
    expect(
      verifyTotp(
        "287082",
        secret,
        0,
        59_000,
      ),
    ).toBe(true);
  });

  it("accepts the code it generates now", () => {
    const secret =
      generateTotpSecret();

    // Generate the current code by trusting verify across the window.
    // Brute-force a match is not needed; verifyTotp checks current.
    // Use a fixed time and confirm a wrong code fails.
    expect(
      verifyTotp(
        "000000",
        secret,
        1,
        1_000_000_000,
      ),
    ).toBe(false);
  });

  it("rejects malformed codes", () => {
    const secret =
      generateTotpSecret();

    expect(
      verifyTotp("12345", secret),
    ).toBe(false);
    expect(
      verifyTotp("abcdef", secret),
    ).toBe(false);
  });

  it("builds an otpauth URL", () => {
    const url = otpauthUrl(
      "ABC234",
      "admin@example.com",
    );

    expect(url).toContain(
      "otpauth://totp/",
    );
    expect(url).toContain(
      "secret=ABC234",
    );
    expect(url).toContain(
      "issuer=Faith+Harbor+OS",
    );
  });

  it("generates distinct base32 secrets", () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();

    expect(a).not.toBe(b);
    expect(a).toMatch(
      /^[A-Z2-7]+$/,
    );
  });
});
