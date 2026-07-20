import {
  describe,
  expect,
  it,
} from "vitest";

import { BrandService } from "../../brands/BrandService";
import { ClientService } from "../../clients/ClientService";
import { EmailService } from "../../communications/EmailService";
import { LoggingEmailTransport } from "../../communications/EmailTransport";
import { HostingAccountService } from "../HostingAccountService";
import { HostingPlanService } from "../plans/HostingPlanService";
import type {
  WHMClient,
  WHMCreateAccountRequest,
  WHMCreatedAccount,
} from "../whm/WHMClient";
import {
  defaultPassword,
  defaultUsername,
  ProvisioningService,
} from "./ProvisioningService";

function stubWhm(
  captured: {
    request?: WHMCreateAccountRequest;
    createdPackage?: {
      name: string;
      quotaMb?: number;
      maxEmailAccounts?: number;
    };
  },
  options: {
    result?: Partial<WHMCreatedAccount>;
    existingPackages?: string[];
  } = {},
): WHMClient {
  return {
    async listPackages() {
      return options.existingPackages ??
        [];
    },
    async createPackage(pkg: {
      name: string;
      quotaMb?: number;
      maxEmailAccounts?: number;
    }) {
      captured.createdPackage = pkg;
    },
    async createAccount(
      request: WHMCreateAccountRequest,
    ) {
      captured.request = request;

      return {
        username: request.username,
        domain: request.domain,
        ipAddress: "203.0.113.50",
        ...options.result,
      };
    },
  } as unknown as WHMClient;
}

function build(whm?: WHMClient) {
  const clients = new ClientService();
  const plans = new HostingPlanService();
  plans.seedDefaults();

  const emails = new EmailService(
    new LoggingEmailTransport(),
    "system@faithharbor.test",
  );

  const hostingAccounts =
    new HostingAccountService(
      clients,
      undefined,
    );

  const brands = new BrandService();

  const service =
    new ProvisioningService(
      plans,
      hostingAccounts,
      whm,
      emails,
      {
        clients,
        brands,
        serverLabel:
          "server.example.com",
        // Deterministic for assertions.
        generateUsername: () =>
          "graceco12",
        generatePassword: () =>
          "Str0ng-Pass!x",
      },
    );

  return {
    service,
    clients,
    plans,
    emails,
    hostingAccounts,
    brands,
  };
}

describe("ProvisioningService", () => {
  it("provisions an account, records it, and emails the login", async () => {
    const captured: {
      request?: WHMCreateAccountRequest;
      createdPackage?: {
        name: string;
        quotaMb?: number;
        maxEmailAccounts?: number;
      };
    } = {};

    const { service, plans, emails, brands } =
      build(stubWhm(captured));

    const brand = brands.create({
      name: "All Elite Hosting",
      fromEmail:
        "hello@allelitehosting.com",
    });

    const starter = plans
      .list()
      .find(
        (p) => p.slug === "starter-nvme",
      );

    const result =
      await service.provision({
        planId: starter?.id,
        domain: "GraceChapel.org",
        brandId: brand.id,
        contactEmail:
          "pastor@gracechapel.org",
      });

    // A WHM package was created from the plan's limits...
    expect(
      captured.createdPackage?.name,
    ).toBe("Starter_NVMe");
    expect(
      captured.createdPackage?.quotaMb,
    ).toBe(10240);
    expect(
      captured.createdPackage
        ?.maxEmailAccounts,
    ).toBe(10);

    // ...and the account was created against that package + limits.
    expect(
      captured.request?.plan,
    ).toBe("Starter_NVMe");
    expect(
      captured.request?.limits
        ?.quotaMb,
    ).toBe(10240);
    expect(
      captured.request?.limits
        ?.bandwidthMb,
    ).toBe(100 * 1024);
    // Starter has 1 website → 0 addon domains.
    expect(
      captured.request?.limits
        ?.maxAddonDomains,
    ).toBe(0);
    expect(
      captured.request?.limits
        ?.maxEmailAccounts,
    ).toBe(10);
    expect(
      captured.request?.limits
        ?.maxDatabases,
    ).toBe(5);
    expect(
      captured.request?.domain,
    ).toBe("gracechapel.org");
    expect(
      captured.request?.username,
    ).toBe("graceco12");

    // The account was recorded active with the WHM IP.
    expect(result.account.status).toBe(
      "active",
    );
    expect(
      result.account.ipAddress,
    ).toBe("203.0.113.50");
    expect(result.account.brand).toBe(
      "All Elite Hosting",
    );
    expect(
      result.temporaryPassword,
    ).toBe("Str0ng-Pass!x");

    // The welcome email went from the brand mailbox with the login.
    const sent = emails.list()[0];
    expect(sent.from).toBe(
      "hello@allelitehosting.com",
    );
    expect(sent.to).toBe(
      "pastor@gracechapel.org",
    );
    expect(sent.body).toContain(
      "graceco12",
    );
    expect(sent.body).toContain(
      "Str0ng-Pass!x",
    );
  });

  it("uses an existing owner-prefixed package (root_) without recreating it", async () => {
    const captured: {
      request?: WHMCreateAccountRequest;
      createdPackage?: {
        name: string;
      };
    } = {};

    const { service, plans } = build(
      stubWhm(captured, {
        existingPackages: [
          "root_Starter_NVMe",
        ],
      }),
    );

    const starter = plans
      .list()
      .find(
        (p) => p.slug === "starter-nvme",
      );

    await service.provision({
      planId: starter?.id,
      domain: "example.com",
      contactEmail: "a@b.com",
    });

    // Found the prefixed package; did not create a duplicate.
    expect(
      captured.createdPackage,
    ).toBeUndefined();
    expect(
      captured.request?.plan,
    ).toBe("root_Starter_NVMe");
  });

  it("reports unavailable and refuses to provision without WHM", async () => {
    const { service } = build(undefined);

    expect(service.isAvailable()).toBe(
      false,
    );

    await expect(
      service.provision({
        planSlug: "starter-nvme",
        domain: "example.com",
        contactEmail: "a@b.com",
      }),
    ).rejects.toThrow(
      "WHM is not configured",
    );
  });

  it("requires a contact email", async () => {
    const captured: {
      request?: WHMCreateAccountRequest;
    } = {};

    const { service } = build(
      stubWhm(captured),
    );

    await expect(
      service.provision({
        planSlug: "starter-nvme",
        domain: "example.com",
      }),
    ).rejects.toThrow(
      "contact email is required",
    );
  });
});

describe("provisioning generators", () => {
  it("derives a valid cPanel username from a domain", () => {
    const name = defaultUsername(
      "Grace-Chapel.org",
    );

    // <= 16 chars, starts with a letter, alphanumeric.
    expect(name.length).toBeLessThanOrEqual(
      16,
    );
    expect(/^[a-z][a-z0-9]*$/.test(name)).toBe(
      true,
    );
    expect(name.startsWith("gracechapel")).toBe(
      true,
    );
  });

  it("generates a strong password with mixed classes", () => {
    const pw = defaultPassword();

    expect(pw.length).toBeGreaterThanOrEqual(
      16,
    );
    expect(/[A-Z]/.test(pw)).toBe(true);
    expect(/[a-z]/.test(pw)).toBe(true);
    expect(/[0-9]/.test(pw)).toBe(true);
    expect(
      /[^A-Za-z0-9]/.test(pw),
    ).toBe(true);
  });
});
