import {
  describe,
  expect,
  it,
} from "vitest";

import {
  hashPassword,
  verifyPassword,
} from "./password";

describe("password hashing", () => {
  it("verifies a correct password", () => {
    const stored = hashPassword(
      "correct horse battery staple",
    );

    expect(
      verifyPassword(
        "correct horse battery staple",
        stored,
      ),
    ).toBe(true);
  });

  it("rejects a wrong password", () => {
    const stored =
      hashPassword("s3cret");

    expect(
      verifyPassword(
        "wrong",
        stored,
      ),
    ).toBe(false);
  });

  it("salts: the same password hashes differently each time", () => {
    expect(
      hashPassword("same"),
    ).not.toBe(hashPassword("same"));
  });

  it("returns false for a malformed stored value", () => {
    expect(
      verifyPassword("x", "garbage"),
    ).toBe(false);
    expect(
      verifyPassword("x", ""),
    ).toBe(false);
  });
});
