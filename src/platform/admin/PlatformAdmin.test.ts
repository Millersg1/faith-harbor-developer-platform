import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../../tenancy/OrganizationService";
import { OrganizationDomainService } from "../../tenancy/OrganizationDomainService";
import { BrandingRepository } from "../branding/BrandingRepository";
import { BrandingService } from "../branding/BrandingService";
import { PlatformClientRepository } from "../clients/PlatformClientRepository";
import { PlatformClientService } from "../clients/PlatformClientService";
import { createPlatformApp } from "../createPlatformApp";
import { PlatformInvoiceRepository } from "../invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "../invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "../projects/PlatformProjectRepository";
import { PlatformProjectService } from "../projects/PlatformProjectService";
import { PlatformSessionRepository } from "../sessions/PlatformSessionRepository";
import { PlatformSessionService } from "../sessions/PlatformSessionService";
import { PlatformSignupService } from "../signup/PlatformSignupService";
import { PlatformUserRepository } from "../users/PlatformUserRepository";
import { PlatformUserService } from "../users/PlatformUserService";
import {
  AdminPasswordError,
  PlatformAdminService,
} from "./PlatformAdminService";
import { PlatformAdminSessionService } from "./PlatformAdminSessionService";

async function build() {
  const organizations =
    new OrganizationService();
  const users =
    new PlatformUserService(
      new PlatformUserRepository(),
    );
  const sessions =
    new PlatformSessionService(
      new PlatformSessionRepository(),
    );
  const clients =
    new PlatformClientService(
      new PlatformClientRepository(),
    );
  const admins =
    new PlatformAdminService();

  const app = createPlatformApp({
    organizations,
    users,
    sessions,
    branding: new BrandingService(
      new BrandingRepository(),
    ),
    clients,
    projects:
      new PlatformProjectService(
        new PlatformProjectRepository(),
        clients,
      ),
    invoices:
      new PlatformInvoiceService(
        new PlatformInvoiceRepository(),
        clients,
      ),
    signup: new PlatformSignupService(
      organizations,
      users,
      sessions,
    ),
    domains:
      new OrganizationDomainService(),
    admins,
    adminSessions:
      new PlatformAdminSessionService(),
  });

  await admins.create({
    email: "root@allelitecloud.com",
    password: "adminpass123",
    name: "Root",
  });

  await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      email: "o@acme.com",
      password: "password123",
    });
  await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Beta",
      email: "o@beta.com",
      password: "password123",
    });

  return app;
}

async function adminLogin(
  app: ReturnType<
    typeof createPlatformApp
  >,
) {
  const res = await request(app)
    .post(
      "/platform/admin/api/login",
    )
    .send({
      email:
        "root@allelitecloud.com",
      password: "adminpass123",
    });

  return res.headers["set-cookie"];
}

describe("PlatformAdminService", () => {
  it("authenticates and rejects a wrong password", async () => {
    const admins =
      new PlatformAdminService();
    await admins.create({
      email: "a@x.com",
      password: "password123",
    });

    const ok =
      await admins.authenticate(
        "a@x.com",
        "password123",
      );
    expect(ok.email).toBe("a@x.com");

    await expect(
      admins.authenticate(
        "a@x.com",
        "nope",
      ),
    ).rejects.toThrow(/invalid/i);
  });

  it("changes the password after verifying the current one", async () => {
    const admins =
      new PlatformAdminService();
    const a = await admins.create({
      email: "c@x.com",
      password: "oldpass123",
    });

    await admins.changePassword(
      a.id,
      "oldpass123",
      "newpass456",
    );

    // Old password no longer works; new one does.
    await expect(
      admins.authenticate(
        "c@x.com",
        "oldpass123",
      ),
    ).rejects.toThrow(/invalid/i);
    expect(
      (
        await admins.authenticate(
          "c@x.com",
          "newpass456",
        )
      ).email,
    ).toBe("c@x.com");

    // Wrong current password and too-short new password are rejected.
    await expect(
      admins.changePassword(
        a.id,
        "wrong",
        "another12",
      ),
    ).rejects.toBeInstanceOf(
      AdminPasswordError,
    );
    await expect(
      admins.changePassword(
        a.id,
        "newpass456",
        "short",
      ),
    ).rejects.toBeInstanceOf(
      AdminPasswordError,
    );
  });

  it("bootstraps only the first admin", async () => {
    const admins =
      new PlatformAdminService();

    expect(
      await admins.ensureBootstrapAdmin(
        "first@x.com",
        "password123",
      ),
    ).toBe(true);
    expect(
      await admins.ensureBootstrapAdmin(
        "second@x.com",
        "password123",
      ),
    ).toBe(false);
    expect(await admins.count()).toBe(
      1,
    );
  });
});

describe("Platform admin console (HTTP)", () => {
  it("logs in and reads the admin", async () => {
    const app = await build();
    const cookie =
      await adminLogin(app);

    const me = await request(app)
      .get("/platform/admin/api/me")
      .set("Cookie", cookie);
    expect(me.status).toBe(200);
    expect(me.body.admin.email).toBe(
      "root@allelitecloud.com",
    );
  });

  it("rejects wrong credentials with 401", async () => {
    const app = await build();
    const res = await request(app)
      .post(
        "/platform/admin/api/login",
      )
      .send({
        email:
          "root@allelitecloud.com",
        password: "wrong",
      });
    expect(res.status).toBe(401);
  });

  it("lists every organization across all tenants", async () => {
    const app = await build();
    const cookie =
      await adminLogin(app);

    const res = await request(app)
      .get(
        "/platform/admin/api/organizations",
      )
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(
      res.body.organizations
        .map(
          (o: { slug: string }) =>
            o.slug,
        )
        .sort(),
    ).toEqual(["acme", "beta"]);

    const stats = await request(app)
      .get(
        "/platform/admin/api/stats",
      )
      .set("Cookie", cookie);
    expect(
      stats.body.organizations,
    ).toBe(2);
    expect(stats.body.active).toBe(2);
    expect(stats.body.admins).toBe(1);
  });

  it("suspends an org (blocking its logins) and reactivates it", async () => {
    const app = await build();
    const cookie =
      await adminLogin(app);

    const list = await request(app)
      .get(
        "/platform/admin/api/organizations",
      )
      .set("Cookie", cookie);
    const acme =
      list.body.organizations.find(
        (o: { slug: string }) =>
          o.slug === "acme",
      );

    const suspend = await request(app)
      .patch(
        "/platform/admin/api/organizations/" +
          acme.id,
      )
      .set("Cookie", cookie)
      .send({ status: "suspended" });
    expect(
      suspend.body.organization
        .status,
    ).toBe("suspended");

    // The org's user can no longer sign in.
    const blocked = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "o@acme.com",
        password: "password123",
      });
    expect(blocked.status).toBe(403);

    // Reactivate -> login works again.
    await request(app)
      .patch(
        "/platform/admin/api/organizations/" +
          acme.id,
      )
      .set("Cookie", cookie)
      .send({ status: "active" });

    const ok = await request(app)
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "o@acme.com",
        password: "password123",
      });
    expect(ok.status).toBe(200);
  });

  it("keeps admin and tenant access separate", async () => {
    const app = await build();

    // A tenant user's session cannot reach the admin API.
    const userLogin = await request(
      app,
    )
      .post("/auth/login")
      .set("X-Org-Slug", "beta")
      .send({
        email: "o@beta.com",
        password: "password123",
      });
    const userCookie =
      userLogin.headers["set-cookie"];

    const denied = await request(app)
      .get(
        "/platform/admin/api/organizations",
      )
      .set("Cookie", userCookie);
    expect(denied.status).toBe(401);

    // And no session at all is rejected.
    await request(app)
      .get(
        "/platform/admin/api/organizations",
      )
      .expect(401);
  });

  it("lets the signed-in admin change their password", async () => {
    const app = await build();
    const cookie =
      await adminLogin(app);

    // Wrong current password → 400.
    const bad = await request(app)
      .post(
        "/platform/admin/api/change-password",
      )
      .set("Cookie", cookie)
      .send({
        currentPassword: "wrong",
        newPassword: "newadminpass",
      });
    expect(bad.status).toBe(400);

    // Correct current → 200.
    const ok = await request(app)
      .post(
        "/platform/admin/api/change-password",
      )
      .set("Cookie", cookie)
      .send({
        currentPassword:
          "adminpass123",
        newPassword: "newadminpass",
      });
    expect(ok.status).toBe(200);

    // Old password no longer logs in; the new one does.
    const oldLogin = await request(app)
      .post(
        "/platform/admin/api/login",
      )
      .send({
        email:
          "root@allelitecloud.com",
        password: "adminpass123",
      });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post(
        "/platform/admin/api/login",
      )
      .send({
        email:
          "root@allelitecloud.com",
        password: "newadminpass",
      });
    expect(newLogin.status).toBe(200);
    // Generous timeout: this does several scrypt hash/verify operations
    // (create + change + two logins), which can exceed Vitest's 5s default
    // under the forks pool on a loaded machine.
  }, 20000);

  it("rejects an unauthenticated password change", async () => {
    const app = await build();
    await request(app)
      .post(
        "/platform/admin/api/change-password",
      )
      .send({
        currentPassword: "x",
        newPassword: "yyyyyyyy",
      })
      .expect(401);
  });

  it("serves the admin console page", async () => {
    const app = await build();
    const page = await request(
      app,
    ).get("/platform/admin");
    expect(page.status).toBe(200);
    expect(page.text).toContain(
      "Platform Admin",
    );
  });
});
