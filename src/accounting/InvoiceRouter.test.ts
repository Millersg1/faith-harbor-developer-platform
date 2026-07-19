import request from "supertest";
import {
  describe,
  expect,
  it,
} from "vitest";

import { createApp } from "../app";

async function createClient(
  app: ReturnType<typeof createApp>,
  companyName =
    "Faith Harbor Test Client",
) {
  const response =
    await request(app)
      .post("/api/v1/clients")
      .send({
        companyName,
        primaryContact:
          "Jordan Smith",
      });

  expect(response.status)
    .toBe(201);

  return response.body;
}

describe("InvoiceRouter", () => {
  it("creates an invoice", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/invoices")
        .send({
          clientId: client.id,
          projectId:
            "project-1",
          lineItems: [
            {
              description:
                "Managed IT Services",
              quantity: 2,
              unitPrice: 125,
            },
          ],
          dueDate:
            "2026-08-20",
          notes:
            "Net 30.",
          metadata: {
            poNumber: "PO-9",
          },
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("draft");

    expect(response.body.invoice)
      .toMatchObject({
        clientId: client.id,
        projectId:
          "project-1",
        number: "INV-0001",
        amount: 250,
        currency: "USD",
      });

    expect(
      response.body.invoice.id,
    ).toBeDefined();

    expect(
      response.body.invoice
        .createdAt,
    ).toBeDefined();
  });

  it("returns all invoices", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    await request(app)
      .post("/api/v1/invoices")
      .send({
        clientId: client.id,
        lineItems: [
          {
            description: "First",
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });

    await request(app)
      .post("/api/v1/invoices")
      .send({
        clientId: client.id,
        lineItems: [
          {
            description: "Second",
            quantity: 1,
            unitPrice: 200,
          },
        ],
      });

    const response =
      await request(app)
        .get("/api/v1/invoices");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);

    expect(
      response.body.invoices,
    ).toHaveLength(2);
  });

  it("filters invoices by client", async () => {
    const app = createApp();

    const firstClient =
      await createClient(
        app,
        "First Client",
      );

    const secondClient =
      await createClient(
        app,
        "Second Client",
      );

    await request(app)
      .post("/api/v1/invoices")
      .send({
        clientId:
          firstClient.id,
        lineItems: [
          {
            description: "A",
            quantity: 1,
            unitPrice: 100,
          },
        ],
      });

    await request(app)
      .post("/api/v1/invoices")
      .send({
        clientId:
          secondClient.id,
        lineItems: [
          {
            description: "B",
            quantity: 1,
            unitPrice: 200,
          },
        ],
      });

    const response =
      await request(app)
        .get("/api/v1/invoices")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.invoices[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one invoice", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/invoices")
        .send({
          clientId: client.id,
          lineItems: [
            {
              description:
                "Details",
              quantity: 1,
              unitPrice: 50,
            },
          ],
        });

    const invoice =
      createResponse.body.invoice;

    const response =
      await request(app)
        .get(
          `/api/v1/invoices/${invoice.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(invoice);
  });

  it("returns 404 for a missing invoice", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/invoices/missing-invoice",
        );

    expect(response.status)
      .toBe(404);

    expect(response.body)
      .toEqual({
        error: {
          code:
            "INVOICE_NOT_FOUND",
          message:
            'Invoice "missing-invoice" was not found.',
        },
      });
  });

  it("updates an invoice", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/invoices")
        .send({
          clientId: client.id,
          status: "draft",
          lineItems: [
            {
              description:
                "Original",
              quantity: 1,
              unitPrice: 100,
            },
          ],
        });

    const invoice =
      createResponse.body.invoice;

    const response =
      await request(app)
        .patch(
          `/api/v1/invoices/${invoice.id}`,
        )
        .send({
          status: "paid",
          paidDate:
            "2026-07-25",
          lineItems: [
            {
              description:
                "Revised",
              quantity: 4,
              unitPrice: 75,
            },
          ],
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("paid");

    expect(response.body.invoice)
      .toMatchObject({
        id: invoice.id,
        status: "paid",
        amount: 300,
        paidDate:
          "2026-07-25",
      });

    const getResponse =
      await request(app)
        .get(
          `/api/v1/invoices/${invoice.id}`,
        );

    expect(getResponse.body)
      .toEqual(
        response.body.invoice,
      );
  });

  it("returns 404 when updating a missing invoice", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/invoices/missing-invoice",
        )
        .send({
          status: "paid",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe(
      "INVOICE_NOT_FOUND",
    );
  });

  it("deletes an invoice", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const createResponse =
      await request(app)
        .post("/api/v1/invoices")
        .send({
          clientId: client.id,
          lineItems: [
            {
              description:
                "To Delete",
              quantity: 1,
              unitPrice: 100,
            },
          ],
        });

    const invoice =
      createResponse.body.invoice;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/invoices/${invoice.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    expect(deleteResponse.text)
      .toBe("");

    const getResponse =
      await request(app)
        .get(
          `/api/v1/invoices/${invoice.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("returns 404 when deleting a missing invoice", async () => {
    const app = createApp();

    const response =
      await request(app)
        .delete(
          "/api/v1/invoices/missing-invoice",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe(
      "INVOICE_NOT_FOUND",
    );
  });

  it("rejects an invalid invoice request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/invoices")
        .send({
          clientId: "",
          lineItems: [],
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_INVOICE_REQUEST",
    );

    expect(
      response.body.error.message,
    ).toBe(
      "Invoice request validation failed.",
    );

    expect(
      response.body.error.details,
    ).toBeDefined();
  });

  it("drafts an invoice from a project", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post(
          "/api/v1/invoices/from-project",
        )
        .send({
          projectId:
            "project-9",
          clientId: client.id,
          projectName:
            "Website Redesign",
          amount: 2500,
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.invoice)
      .toMatchObject({
        clientId: client.id,
        projectId:
          "project-9",
        status: "draft",
        amount: 2500,
      });

    expect(
      response.body.invoice
        .lineItems[0]
        .description,
    ).toBe(
      "Website Redesign — services",
    );
  });

  it("rejects an invalid from-project request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post(
          "/api/v1/invoices/from-project",
        )
        .send({
          projectId: "",
          clientId: "",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_INVOICE_REQUEST",
    );
  });

  it("returns an internal error when creating an invoice for a missing client", async () => {
    const app = createApp();

    const consoleError =
      console.error;

    console.error = () => {
      // The application error handler
      // intentionally logs this error.
    };

    try {
      const response =
        await request(app)
          .post(
            "/api/v1/invoices",
          )
          .send({
            clientId:
              "missing-client",
            lineItems: [
              {
                description: "A",
                quantity: 1,
                unitPrice: 100,
              },
            ],
          });

      expect(response.status)
        .toBe(500);

      expect(response.body)
        .toEqual({
          error: {
            code:
              "INTERNAL_ERROR",
            message:
              "An unexpected error occurred.",
          },
        });
    } finally {
      console.error =
        consoleError;
    }
  });
});
