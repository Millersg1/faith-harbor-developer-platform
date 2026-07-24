import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { OrganizationService } from "../tenancy/OrganizationService";
import { OrganizationDomainService } from "../tenancy/OrganizationDomainService";
import { PlatformAdminService } from "./admin/PlatformAdminService";
import { PlatformAdminSessionService } from "./admin/PlatformAdminSessionService";
import { BillingService } from "./billing/BillingService";
import { SubscriptionRepository } from "./billing/SubscriptionRepository";
import type {
  StripeSubscriptionGateway,
  SubscriptionCheckoutInput,
} from "./billing/StripeSubscriptionGateway";
import { BrandingRepository } from "./branding/BrandingRepository";
import { BrandingService } from "./branding/BrandingService";
import { PlatformClientRepository } from "./clients/PlatformClientRepository";
import { PlatformClientService } from "./clients/PlatformClientService";
import { createPlatformApp } from "./createPlatformApp";
import { PlatformInvoiceRepository } from "./invoices/PlatformInvoiceRepository";
import { PlatformInvoiceService } from "./invoices/PlatformInvoiceService";
import { PlatformProjectRepository } from "./projects/PlatformProjectRepository";
import { PlatformProjectService } from "./projects/PlatformProjectService";
import { PlatformSessionRepository } from "./sessions/PlatformSessionRepository";
import { PlatformSessionService } from "./sessions/PlatformSessionService";
import { PlatformSignupService } from "./signup/PlatformSignupService";
import { PlatformUserRepository } from "./users/PlatformUserRepository";
import { PlatformUserService } from "./users/PlatformUserService";

/** A stub gateway: connected, records checkout inputs, accepts sig "valid". */
function stubGateway(): StripeSubscriptionGateway & {
  lastCheckout?: SubscriptionCheckoutInput;
} {
  const g: StripeSubscriptionGateway & {
    lastCheckout?: SubscriptionCheckoutInput;
  } = {
    isConnected: () => true,
    createSubscriptionCheckout:
      async (input) => {
        g.lastCheckout = input;
        return {
          id: "cs_test_123",
          url:
            "https://checkout.stripe.test/session/" +
            input.planId,
        };
      },
    verifyWebhook: (_raw, sig) =>
      sig === "valid",
  };
  return g;
}

async function build(
  gateway: StripeSubscriptionGateway,
) {
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
  const billing = new BillingService(
    new SubscriptionRepository(),
    gateway,
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
    billing,
    admins: new PlatformAdminService(),
    adminSessions:
      new PlatformAdminSessionService(),
    baseDomain: "allelitecloud.com",
  });

  const signup = await request(app)
    .post("/auth/signup")
    .send({
      organizationName: "Acme",
      email: "owner@acme.com",
      password: "password123",
    });

  return {
    app,
    billing,
    ownerCookie:
      signup.headers["set-cookie"],
    orgId:
      signup.body.organization.id,
  };
}

describe("Stripe subscription billing", () => {
  it("routes a paid plan change to Stripe Checkout", async () => {
    const gateway = stubGateway();
    const { app, ownerCookie } =
      await build(gateway);

    const res = await request(app)
      .post(
        "/api/platform/billing/plan",
      )
      .set("Cookie", ownerCookie)
      .send({ planId: "business" });

    expect(res.status).toBe(200);
    expect(res.body.checkoutUrl).toContain(
      "checkout.stripe.test",
    );
    // Nothing changed yet — the webhook does that after payment.
    expect(
      gateway.lastCheckout?.planId,
    ).toBe("business");
    expect(
      gateway.lastCheckout
        ?.amountCents,
    ).toBe(9900);

    const billing = await request(app)
      .get("/api/platform/billing")
      .set("Cookie", ownerCookie);
    expect(
      billing.body.plan.id,
    ).toBe("essentials");
  });

  it("activates the plan when Stripe confirms via webhook", async () => {
    const gateway = stubGateway();
    const { app, ownerCookie, orgId } =
      await build(gateway);

    const event = {
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            organizationId: orgId,
            planId: "business",
          },
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    };

    const hook = await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set(
        "Content-Type",
        "application/json",
      )
      .send(JSON.stringify(event));
    expect(hook.status).toBe(200);

    const billing = await request(app)
      .get("/api/platform/billing")
      .set("Cookie", ownerCookie);
    expect(
      billing.body.plan.id,
    ).toBe("business");
    expect(
      billing.body.subscription
        .stripeSubscriptionId,
    ).toBe("sub_1");
  });

  it("rejects a webhook with a bad signature", async () => {
    const gateway = stubGateway();
    const { app } =
      await build(gateway);

    const res = await request(app)
      .post("/webhooks/stripe")
      .set(
        "stripe-signature",
        "nope",
      )
      .set(
        "Content-Type",
        "application/json",
      )
      .send(
        JSON.stringify({
          type: "checkout.session.completed",
        }),
      );

    expect(res.status).toBe(400);
  });

  it("drops the org to the free plan when the subscription is canceled", async () => {
    const gateway = stubGateway();
    const { app, ownerCookie, orgId } =
      await build(gateway);

    // First put them on business via a completed checkout.
    await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set(
        "Content-Type",
        "application/json",
      )
      .send(
        JSON.stringify({
          type: "checkout.session.completed",
          data: {
            object: {
              metadata: {
                organizationId:
                  orgId,
                planId: "business",
              },
            },
          },
        }),
      );

    // Then cancel.
    await request(app)
      .post("/webhooks/stripe")
      .set("stripe-signature", "valid")
      .set(
        "Content-Type",
        "application/json",
      )
      .send(
        JSON.stringify({
          type: "customer.subscription.deleted",
          data: {
            object: {
              metadata: {
                organizationId:
                  orgId,
              },
            },
          },
        }),
      );

    const billing = await request(app)
      .get("/api/platform/billing")
      .set("Cookie", ownerCookie);
    expect(
      billing.body.plan.id,
    ).toBe("essentials");
    expect(
      billing.body.subscription
        .status,
    ).toBe("canceled");
  });
});
