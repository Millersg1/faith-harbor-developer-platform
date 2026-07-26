import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { runWithTenant } from "../tenancy/TenantContext";
import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import {
  FileQuotaError,
  FileValidationError,
  PlatformFileService,
} from "./files/PlatformFileService";
import { PlatformFileRepository } from "./files/PlatformFileRepository";
import {
  LocalStorageProvider,
  MemoryStorageProvider,
} from "./files/StorageProvider";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

function b64(s: string): string {
  return Buffer.from(s).toString(
    "base64",
  );
}

function makeService(
  options?: ConstructorParameters<
    typeof PlatformFileService
  >[2],
) {
  return new PlatformFileService(
    new PlatformFileRepository(),
    new MemoryStorageProvider(),
    options,
  );
}

describe("FileService", () => {
  it("uploads, lists, and downloads a file", async () => {
    const svc = makeService();
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const f = await svc.upload({
          name: "doc.txt",
          mimeType: "text/plain",
          data: b64("hello world"),
        });
        expect(f.size).toBe(11);

        const { data } =
          await svc.download(f.id);
        expect(
          data.toString(),
        ).toBe("hello world");
        expect(
          await svc.list(),
        ).toHaveLength(1);
      },
    );
  });

  it("rejects a disallowed content type", async () => {
    const svc = makeService();
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await expect(
          svc.upload({
            name: "evil.exe",
            mimeType:
              "application/x-msdownload",
            data: b64("MZ"),
          }),
        ).rejects.toBeInstanceOf(
          FileValidationError,
        );
      },
    );
  });

  it("enforces the per-file size limit", async () => {
    const svc = makeService({
      maxFileBytes: 4,
    });
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await expect(
          svc.upload({
            name: "big.txt",
            mimeType: "text/plain",
            data: b64("12345"),
          }),
        ).rejects.toBeInstanceOf(
          FileValidationError,
        );
      },
    );
  });

  it("enforces the tenant storage quota", async () => {
    const svc = makeService({
      quotaBytes: 10,
    });
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        await svc.upload({
          name: "a.txt",
          mimeType: "text/plain",
          data: b64("123456"),
        });
        await expect(
          svc.upload({
            name: "b.txt",
            mimeType: "text/plain",
            data: b64("123456"),
          }),
        ).rejects.toBeInstanceOf(
          FileQuotaError,
        );
      },
    );
  });

  it("soft-deletes and restores", async () => {
    const svc = makeService();
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const f = await svc.upload({
          name: "d.txt",
          mimeType: "text/plain",
          data: b64("x"),
        });
        await svc.softDelete(f.id);
        expect(
          await svc.list(),
        ).toHaveLength(0);
        expect(
          await svc.list({
            includeDeleted: true,
          }),
        ).toHaveLength(1);
        await svc.restore(f.id);
        expect(
          await svc.list(),
        ).toHaveLength(1);
      },
    );
  });

  it("never leaks files across tenants", async () => {
    const svc = makeService();
    let id = "";
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        id = (
          await svc.upload({
            name: "secret.txt",
            mimeType: "text/plain",
            data: b64("classified"),
          })
        ).id;
      },
    );

    await runWithTenant(
      { organizationId: "orgB" },
      async () => {
        expect(
          await svc.list(),
        ).toHaveLength(0);
        await expect(
          svc.download(id),
        ).rejects.toThrow();
      },
    );
  });

  it("strips path components from the display name", async () => {
    const svc = makeService();
    await runWithTenant(
      { organizationId: "orgA" },
      async () => {
        const f = await svc.upload({
          name: "../../etc/passwd",
          mimeType: "text/plain",
          data: b64("x"),
        });
        expect(f.name).toBe("passwd");
        expect(
          f.storedKey.startsWith(
            "orgA/",
          ),
        ).toBe(true);
      },
    );
  });
});

describe("LocalStorageProvider", () => {
  it("refuses keys that escape the storage root", async () => {
    const provider =
      new LocalStorageProvider(
        "/tmp/aec-storage-root",
      );
    await expect(
      provider.put(
        "../escape",
        Buffer.from("x"),
      ),
    ).rejects.toThrow(
      /outside the storage root/i,
    );
  });
});

async function buildApp() {
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
  const files =
    new PlatformFileService(
      new PlatformFileRepository(),
      new MemoryStorageProvider(),
    );

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
    files,
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      slug: "acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    cookie:
      signup.headers["set-cookie"],
  };
}

describe("Files API", () => {
  it("uploads and downloads via the API without exposing the storage key", async () => {
    const { app, cookie } =
      await buildApp();

    const up = await request(app)
      .post("/api/platform/files")
      .set("Cookie", cookie)
      .send({
        name: "notes.txt",
        mimeType: "text/plain",
        data: b64("hi there"),
      });
    expect(up.status).toBe(201);
    expect(
      up.body.file.storedKey,
    ).toBeUndefined();
    const id = up.body.file.id;

    const list = await request(app)
      .get("/api/platform/files")
      .set("Cookie", cookie);
    expect(
      list.body.files,
    ).toHaveLength(1);

    const dl = await request(app)
      .get(
        `/api/platform/files/${id}/download`,
      )
      .set("Cookie", cookie);
    expect(dl.status).toBe(200);
    expect(dl.text).toBe("hi there");
  });

  it("rejects a disallowed type with 400", async () => {
    const { app, cookie } =
      await buildApp();
    const res = await request(app)
      .post("/api/platform/files")
      .set("Cookie", cookie)
      .send({
        name: "x.exe",
        mimeType:
          "application/x-msdownload",
        data: b64("MZ"),
      });
    expect(res.status).toBe(400);
  });

  it("rejects an unauthenticated caller", async () => {
    const { app } = await buildApp();
    const res = await request(app).get(
      "/api/platform/files",
    );
    expect(res.status).toBe(401);
  });
});
