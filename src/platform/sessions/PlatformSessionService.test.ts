import {
  describe,
  expect,
  it,
} from "vitest";

import { PlatformSessionRepository } from "./PlatformSessionRepository";
import { PlatformSessionService } from "./PlatformSessionService";

describe("PlatformSessionService", () => {
  it("creates a session bound to the user and org", async () => {
    const service =
      new PlatformSessionService(
        new PlatformSessionRepository(),
      );

    const session =
      await service.createForUser({
        id: "user-1",
        organizationId: "org-1",
      });

    expect(session.token).toHaveLength(
      64,
    );
    expect(session.userId).toBe(
      "user-1",
    );
    expect(
      session.organizationId,
    ).toBe("org-1");

    const validated =
      await service.validate(
        session.token,
      );
    expect(validated?.userId).toBe(
      "user-1",
    );
  });

  it("expires sessions after the TTL", async () => {
    let clock = 1_000;

    const service =
      new PlatformSessionService(
        new PlatformSessionRepository(),
        {
          ttlMs: 100,
          now: () => clock,
        },
      );

    const session =
      await service.createForUser({
        id: "u",
        organizationId: "o",
      });

    expect(
      await service.validate(
        session.token,
      ),
    ).toBeDefined();

    clock += 101;

    expect(
      await service.validate(
        session.token,
      ),
    ).toBeUndefined();
  });

  it("revokes a session", async () => {
    const service =
      new PlatformSessionService(
        new PlatformSessionRepository(),
      );

    const session =
      await service.createForUser({
        id: "u",
        organizationId: "o",
      });

    await service.revoke(
      session.token,
    );

    expect(
      await service.validate(
        session.token,
      ),
    ).toBeUndefined();
  });

  it("returns undefined for an unknown or empty token", async () => {
    const service =
      new PlatformSessionService(
        new PlatformSessionRepository(),
      );

    expect(
      await service.validate(
        "nope",
      ),
    ).toBeUndefined();
    expect(
      await service.validate(""),
    ).toBeUndefined();
  });
});
