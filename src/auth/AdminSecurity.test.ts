import {
  describe,
  expect,
  it,
} from "vitest";

import { AdminSettingsRepository } from "./AdminSettingsRepository";
import { AuthService } from "./AuthService";
import { currentTotp } from "./Totp";

function makeAuth() {
  const settings =
    new AdminSettingsRepository();

  const auth = new AuthService(
    {
      adminEmail:
        "admin@example.com",
      passwordPlain: "original1",
    },
    settings,
  );

  return { auth, settings };
}

describe("AuthService password change", () => {
  it("changes the password and enforces the new one", () => {
    const { auth } = makeAuth();

    expect(
      auth.verifyCredentials(
        "admin@example.com",
        "original1",
      ),
    ).toBe(true);

    auth.changePassword(
      "original1",
      "brand-new-pass",
    );

    expect(
      auth.verifyCredentials(
        "admin@example.com",
        "brand-new-pass",
      ),
    ).toBe(true);

    // The old .env password no longer works.
    expect(
      auth.verifyCredentials(
        "admin@example.com",
        "original1",
      ),
    ).toBe(false);
  });

  it("rejects a wrong current password", () => {
    const { auth } = makeAuth();

    expect(() =>
      auth.changePassword(
        "wrong",
        "brand-new-pass",
      ),
    ).toThrow("current password");
  });

  it("rejects a too-short new password", () => {
    const { auth } = makeAuth();

    expect(() =>
      auth.changePassword(
        "original1",
        "short",
      ),
    ).toThrow("at least 8");
  });
});

describe("AuthService 2FA", () => {
  it("is disabled by default", () => {
    const { auth } = makeAuth();
    expect(auth.is2faEnabled()).toBe(
      false,
    );
  });

  it("enables 2FA with a valid code and then verifies codes", () => {
    const { auth, settings } =
      makeAuth();

    const setup =
      auth.beginTotpSetup();

    // Not enabled until confirmed.
    expect(auth.is2faEnabled()).toBe(
      false,
    );

    const pending = settings.get(
      "totp_pending",
    ) as string;

    auth.enableTotp(
      currentTotp(pending),
    );

    expect(auth.is2faEnabled()).toBe(
      true,
    );
    expect(
      auth.verifyTotpCode(
        currentTotp(setup.secret),
      ),
    ).toBe(true);
    expect(
      auth.verifyTotpCode("000000"),
    ).toBe(false);
  });

  it("refuses to enable with a wrong code", () => {
    const { auth } = makeAuth();

    auth.beginTotpSetup();

    expect(() =>
      auth.enableTotp("000000"),
    ).toThrow("not valid");

    expect(auth.is2faEnabled()).toBe(
      false,
    );
  });

  it("disables 2FA", () => {
    const { auth, settings } =
      makeAuth();

    auth.beginTotpSetup();
    auth.enableTotp(
      currentTotp(
        settings.get(
          "totp_pending",
        ) as string,
      ),
    );

    expect(auth.is2faEnabled()).toBe(
      true,
    );

    auth.disableTotp();

    expect(auth.is2faEnabled()).toBe(
      false,
    );
  });
});
