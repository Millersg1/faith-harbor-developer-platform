import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

async function createClient(
  app: ReturnType<typeof createApp>,
  name: string,
) {
  const res = await request(app)
    .post("/api/v1/clients")
    .send({
      companyName: name,
      primaryContact: "Contact",
    });

  return res.body;
}

async function createInvoice(
  app: ReturnType<typeof createApp>,
  clientId: string,
  amount: number,
) {
  const res = await request(app)
    .post("/api/v1/invoices")
    .send({
      clientId,
      status: "sent",
      lineItems: [
        {
          description: "Work",
          quantity: 1,
          unitPrice: amount,
        },
      ],
    });

  // The invoice endpoint wraps the record as { success, invoice }.
  return res.body.invoice;
}

async function addPortalUser(
  app: ReturnType<typeof createApp>,
  clientId: string,
  email: string,
) {
  return request(app)
    .post("/api/v1/client-users")
    .send({
      clientId,
      email,
      password: "portalpass123",
    });
}

describe("Client portal", () => {
  it("creates a portal login and signs in", async () => {
    const app = createApp();
    const client =
      await createClient(
        app,
        "Grace Chapel",
      );

    const created =
      await addPortalUser(
        app,
        client.id,
        "portal@grace.example",
      );

    expect(created.status).toBe(201);
    expect(created.body.clientId)
      .toBe(client.id);
    expect(created.body)
      .not.toHaveProperty(
        "passwordHash",
      );

    const agent =
      request.agent(app);

    const login = await agent
      .post(
        "/api/v1/portal/auth/login",
      )
      .send({
        email:
          "portal@grace.example",
        password: "portalpass123",
      });

    expect(login.status).toBe(200);
    expect(
      login.body.client.companyName,
    ).toBe("Grace Chapel");
  });

  it("shows a client only their own hosting, ownership-checked", async () => {
    const app = createApp();

    const a = await createClient(
      app,
      "Client A",
    );
    const b = await createClient(
      app,
      "Client B",
    );

    // A hosting account for each client.
    const accountA = await request(app)
      .post("/api/v1/hosting/accounts")
      .send({
        clientId: a.id,
        domain: "clienta.com",
        username: "clienta1",
        status: "active",
      });

    const accountB = await request(app)
      .post("/api/v1/hosting/accounts")
      .send({
        clientId: b.id,
        domain: "clientb.com",
        username: "clientb1",
        status: "active",
      });

    await addPortalUser(
      app,
      a.id,
      "a@example.com",
    );

    const agent = request.agent(app);
    await agent
      .post(
        "/api/v1/portal/auth/login",
      )
      .send({
        email: "a@example.com",
        password: "portalpass123",
      });

    // A sees only their own hosting.
    const list = await agent.get(
      "/api/v1/portal/hosting",
    );
    expect(list.body.count).toBe(1);
    expect(
      list.body.accounts[0].domain,
    ).toBe("clienta.com");

    // A cannot open a cPanel session for B's account.
    const other = await agent
      .post(
        `/api/v1/portal/hosting/${accountB.body.account.id}/cpanel-session`,
      );
    expect(other.status).toBe(404);

    // On A's own account, WHM is not configured under test → 503.
    const own = await agent.post(
      `/api/v1/portal/hosting/${accountA.body.account.id}/cpanel-session`,
    );
    expect(own.status).toBe(503);
  });

  it("shows a client only their own data", async () => {
    const app = createApp();

    const a = await createClient(
      app,
      "Client A",
    );
    const b = await createClient(
      app,
      "Client B",
    );

    const invoiceA =
      await createInvoice(
        app,
        a.id,
        100,
      );
    await createInvoice(
      app,
      b.id,
      999,
    );

    await addPortalUser(
      app,
      a.id,
      "a@example.com",
    );

    const agent =
      request.agent(app);

    await agent
      .post(
        "/api/v1/portal/auth/login",
      )
      .send({
        email: "a@example.com",
        password: "portalpass123",
      });

    const invoices = await agent.get(
      "/api/v1/portal/invoices",
    );

    expect(invoices.body.count)
      .toBe(1);
    expect(
      invoices.body.invoices[0].id,
    ).toBe(invoiceA.id);
    // Client B's $999 invoice is never returned.
    expect(
      invoices.body.invoices.some(
        (inv: {
          amount: number;
        }) => inv.amount === 999,
      ),
    ).toBe(false);
  });

  it("blocks paying another client's invoice", async () => {
    const app = createApp();

    const a = await createClient(
      app,
      "Client A",
    );
    const b = await createClient(
      app,
      "Client B",
    );

    const invoiceB =
      await createInvoice(
        app,
        b.id,
        500,
      );

    await addPortalUser(
      app,
      a.id,
      "a@example.com",
    );

    const agent =
      request.agent(app);

    await agent
      .post(
        "/api/v1/portal/auth/login",
      )
      .send({
        email: "a@example.com",
        password: "portalpass123",
      });

    // Client A tries to check out Client B's invoice.
    const attempt = await agent
      .post(
        `/api/v1/portal/invoices/${invoiceB.id}/checkout`,
      );

    expect(attempt.status).toBe(404);
  });

  it("requires authentication for portal data", async () => {
    const app = createApp();

    const res = await request(app)
      .get(
        "/api/v1/portal/invoices",
      );

    expect(res.status).toBe(401);
    expect(res.body.error.code)
      .toBe(
        "PORTAL_UNAUTHENTICATED",
      );
  });

  it("rejects a wrong password", async () => {
    const app = createApp();
    const client =
      await createClient(
        app,
        "Grace Chapel",
      );

    await addPortalUser(
      app,
      client.id,
      "portal@grace.example",
    );

    const res = await request(app)
      .post(
        "/api/v1/portal/auth/login",
      )
      .send({
        email:
          "portal@grace.example",
        password: "wrongpassword",
      });

    expect(res.status).toBe(401);
  });

  it("rejects a duplicate portal email", async () => {
    const app = createApp();
    const client =
      await createClient(
        app,
        "Grace Chapel",
      );

    await addPortalUser(
      app,
      client.id,
      "dup@example.com",
    );

    const again = await addPortalUser(
      app,
      client.id,
      "dup@example.com",
    );

    expect(again.status).toBe(409);
  });
});
