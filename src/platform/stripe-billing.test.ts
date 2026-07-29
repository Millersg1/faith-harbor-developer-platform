import { createHmac } from "node:crypto";
import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { HttpStripeSubscriptionGateway } from "./billing/StripeSubscriptionGateway";

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
  lastPortalCustomer?: string;
} {
  const g: StripeSubscriptionGateway & {
    lastCheckout?: SubscriptionCheckoutInput;
    lastPortalCustomer?: string;
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
    createBillingPortalSession:
      async (input) => {
        g.lastPortalCustomer =
          input.customerId;
        return {
          url:
            "https://billing.stripe.test/portal/" +
            input.customerId,
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

/** POSTs a signed (stub-"valid") webhook event. */
function hook(
  app: ReturnType<
    typeof createPlatformApp
  >,
  event: Record<string, unknown>,
) {
  return request(app)
    .post("/webhooks/stripe")
    .set("stripe-signature", "valid")
    .set(
      "Content-Type",
      "application/json",
    )
    .send(JSON.stringify(event));
}
const statusOf = async (
  app: ReturnType<
    typeof createPlatformApp
  >,
  cookie: string | string[],
) => {
  const r = await request(app)
    .get("/api/platform/billing")
    .set(
      "Cookie",
      cookie as string[],
    );
  return {
    status:
      r.body.subscription.status,
    plan: r.body.plan.id,
  };
};

describe("Stripe billing lifecycle", () => {
  it("runs checkout → payment_failed (past_due, access retained) → invoice.paid (active)", async () => {
    const { app, ownerCookie, orgId } =
      await build(stubGateway());

    await hook(app, {
      id: "evt_checkout",
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
    });
    expect(
      await statusOf(app, ownerCookie),
    ).toEqual({
      status: "active",
      plan: "business",
    });

    await hook(app, {
      id: "evt_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    // past_due but the plan (access) is RETAINED during the grace window.
    expect(
      await statusOf(app, ownerCookie),
    ).toEqual({
      status: "past_due",
      plan: "business",
    });

    await hook(app, {
      id: "evt_paid",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    expect(
      await statusOf(app, ownerCookie),
    ).toEqual({
      status: "active",
      plan: "business",
    });
  });

  it("is idempotent: a replayed event id is skipped", async () => {
    const { app, ownerCookie, orgId } =
      await build(stubGateway());
    await hook(app, {
      id: "c",
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
    });
    await hook(app, {
      id: "paid",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    // A duplicate of an OLD failure event id must NOT re-apply (stays active).
    await hook(app, {
      id: "old_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    expect(
      (await statusOf(app, ownerCookie))
        .status,
    ).toBe("past_due");
    await hook(app, {
      id: "paid2",
      type: "invoice.paid",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    // Re-deliver the SAME failure id — idempotency skips it, stays active.
    await hook(app, {
      id: "old_fail",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });
    expect(
      (await statusOf(app, ownerCookie))
        .status,
    ).toBe("active");
  });

  it("binds by stored customer id, never trusting event metadata (cross-tenant safe)", async () => {
    const { app, ownerCookie, orgId } =
      await build(stubGateway());
    const suB = await request(app)
      .post("/auth/signup")
      .send({
        organizationName: "Beta",
        email: "owner@beta.com",
        password: "password123",
      });
    const orgB =
      suB.body.organization.id;
    const cookieB =
      suB.headers["set-cookie"];

    await hook(app, {
      id: "a1",
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: {
            organizationId: orgId,
            planId: "business",
          },
          customer: "cus_A",
          subscription: "sub_A",
        },
      },
    });
    // Failure for cus_A, but metadata LIES that it's org B. Stored id wins.
    await hook(app, {
      id: "a2",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_A",
          subscription: "sub_A",
          metadata: {
            organizationId: orgB,
          },
        },
      },
    });
    expect(
      (await statusOf(app, ownerCookie))
        .status,
    ).toBe("past_due");
    // Org B is untouched despite the forged metadata id.
    expect(
      (await statusOf(app, cookieB))
        .status,
    ).toBe("active");

    // An unknown customer id resolves to no tenant → safely ignored.
    const unknown = await hook(app, {
      id: "a3",
      type: "invoice.payment_failed",
      data: {
        object: {
          customer: "cus_UNKNOWN",
        },
      },
    });
    expect(unknown.status).toBe(200);
    expect(
      (await statusOf(app, cookieB))
        .status,
    ).toBe("active");
  });

  it("activates from customer.subscription.created (API/dashboard-created subs) via metadata", async () => {
    const { app, ownerCookie, orgId } =
      await build(stubGateway());
    await hook(app, {
      id: "sc1",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_api",
          customer: "cus_api",
          metadata: {
            organizationId: orgId,
            planId: "professional",
          },
        },
      },
    });
    expect(
      await statusOf(app, ownerCookie),
    ).toEqual({
      status: "active",
      plan: "professional",
    });
  });

  it("maps customer.subscription.updated status and cancels on canceled", async () => {
    const { app, ownerCookie, orgId } =
      await build(stubGateway());
    await hook(app, {
      id: "c",
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
    });
    await hook(app, {
      id: "u1",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "past_due",
        },
      },
    });
    expect(
      await statusOf(app, ownerCookie),
    ).toEqual({
      status: "past_due",
      plan: "business",
    });
    await hook(app, {
      id: "u2",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "canceled",
        },
      },
    });
    expect(
      await statusOf(app, ownerCookie),
    ).toEqual({
      status: "canceled",
      plan: "essentials",
    });
  });
});

describe("Subscription webhook signature", () => {
  const secret = "whsec_test_secret";
  const sign = (
    raw: string,
    ts: number,
  ) => {
    const v = createHmac(
      "sha256",
      secret,
    )
      .update(`${ts}.${raw}`)
      .digest("hex");
    return `t=${ts},v1=${v}`;
  };

  it("accepts a fresh valid signature and rejects forged, missing, and stale ones", () => {
    const clock = 1_700_000_000_000;
    const gw =
      new HttpStripeSubscriptionGateway(
        {
          secretKey: "sk_test_x",
          webhookSecret: secret,
        },
        undefined,
        () => clock,
      );
    const raw = JSON.stringify({
      id: "evt_1",
      type: "invoice.paid",
    });
    const ts = Math.floor(
      clock / 1000,
    );

    expect(
      gw.verifyWebhook(
        raw,
        sign(raw, ts),
      ),
    ).toBe(true);
    // Forged signature.
    expect(
      gw.verifyWebhook(
        raw,
        `t=${ts},v1=deadbeef`,
      ),
    ).toBe(false);
    // Missing signature.
    expect(
      gw.verifyWebhook(raw, undefined),
    ).toBe(false);
    // Stale: timestamp older than the 5-minute window.
    expect(
      gw.verifyWebhook(
        raw,
        sign(raw, ts - 600),
      ),
    ).toBe(false);
    // Tampered body (signature no longer matches).
    expect(
      gw.verifyWebhook(
        raw + "x",
        sign(raw, ts),
      ),
    ).toBe(false);
  });
});

describe("Billing portal (update payment method)", () => {
  it("returns a portal url for the owner once a customer exists, and refuses members", async () => {
    const gateway = stubGateway();
    const { app, ownerCookie, orgId } =
      await build(gateway);

    // No Stripe customer yet → 400.
    const early = await request(app)
      .post(
        "/api/platform/billing/portal",
      )
      .set("Cookie", ownerCookie)
      .send({});
    expect(early.status).toBe(400);

    await hook(app, {
      id: "c",
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
    });

    const ok = await request(app)
      .post(
        "/api/platform/billing/portal",
      )
      .set("Cookie", ownerCookie)
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.url).toContain(
      "billing.stripe.test",
    );
    expect(
      gateway.lastPortalCustomer,
    ).toBe("cus_1");

    // A member is forbidden from the billing control.
    await request(app)
      .post("/api/platform/team")
      .set("Cookie", ownerCookie)
      .send({
        email: "member@acme.com",
        password: "password123",
        role: "member",
      });
    const memberLogin = await request(
      app,
    )
      .post("/auth/login")
      .set("X-Org-Slug", "acme")
      .send({
        email: "member@acme.com",
        password: "password123",
      });
    const denied = await request(app)
      .post(
        "/api/platform/billing/portal",
      )
      .set(
        "Cookie",
        memberLogin.headers[
          "set-cookie"
        ],
      )
      .send({});
    expect(denied.status).toBe(403);
  });
});
