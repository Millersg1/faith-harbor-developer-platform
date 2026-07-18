import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AuthService,
  hashPassword,
} from "./AuthService";

describe("AuthService", () => {
  it("verifies a plaintext password", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
    });

    expect(
      auth.verifyCredentials(
        "director@example.com",
        "secret-pass",
      ),
    ).toBe(true);

    expect(
      auth.verifyCredentials(
        "director@example.com",
        "wrong",
      ),
    ).toBe(false);
  });

  it("matches the email case-insensitively", () => {
    const auth = new AuthService({
      adminEmail:
        "Director@Example.com",
      passwordPlain: "secret-pass",
    });

    expect(
      auth.verifyCredentials(
        "director@example.com",
        "secret-pass",
      ),
    ).toBe(true);
  });

  it("rejects an unknown email", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
    });

    expect(
      auth.verifyCredentials(
        "someone@example.com",
        "secret-pass",
      ),
    ).toBe(false);
  });

  it("verifies a scrypt password hash", () => {
    const hash =
      hashPassword("strong-pass");

    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordHash: hash,
    });

    expect(
      auth.verifyCredentials(
        "director@example.com",
        "strong-pass",
      ),
    ).toBe(true);

    expect(
      auth.verifyCredentials(
        "director@example.com",
        "strong-passX",
      ),
    ).toBe(false);
  });

  it("creates and validates sessions", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
    });

    const token =
      auth.createSession();

    expect(
      auth.isValidSession(token),
    ).toBe(true);

    expect(
      auth.isValidSession(
        "not-a-real-token",
      ),
    ).toBe(false);

    expect(
      auth.isValidSession(
        undefined,
      ),
    ).toBe(false);
  });

  it("expires sessions after their lifetime", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
      sessionTtlMs: -1,
    });

    const token =
      auth.createSession();

    expect(
      auth.isValidSession(token),
    ).toBe(false);
  });

  it("destroys sessions", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
    });

    const token =
      auth.createSession();

    auth.destroySession(token);

    expect(
      auth.isValidSession(token),
    ).toBe(false);
  });

  it("rate limits repeated failures", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
      maxAttempts: 3,
    });

    expect(
      auth.isLoginAllowed("1.1.1.1"),
    ).toBe(true);

    auth.recordFailedAttempt(
      "1.1.1.1",
    );
    auth.recordFailedAttempt(
      "1.1.1.1",
    );
    auth.recordFailedAttempt(
      "1.1.1.1",
    );

    expect(
      auth.isLoginAllowed("1.1.1.1"),
    ).toBe(false);

    // A different key is unaffected.
    expect(
      auth.isLoginAllowed("2.2.2.2"),
    ).toBe(true);
  });

  it("clears attempts after success", () => {
    const auth = new AuthService({
      adminEmail:
        "director@example.com",
      passwordPlain: "secret-pass",
      maxAttempts: 3,
    });

    auth.recordFailedAttempt(
      "1.1.1.1",
    );
    auth.recordFailedAttempt(
      "1.1.1.1",
    );
    auth.recordFailedAttempt(
      "1.1.1.1",
    );

    auth.clearAttempts("1.1.1.1");

    expect(
      auth.isLoginAllowed("1.1.1.1"),
    ).toBe(true);
  });
});
