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
    "Faith Harbor Test Author",
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

describe("BookRouter", () => {
  it("records a book", async () => {
    const app = createApp();

    const client =
      await createClient(app);

    const response =
      await request(app)
        .post("/api/v1/books")
        .send({
          clientId: client.id,
          title:
            "The Harbor Light",
          author: "Shawn Miller",
          format: "Paperback",
          status: "editing",
          wordCount: 42000,
        });

    expect(response.status)
      .toBe(201);

    expect(response.body.success)
      .toBe(true);

    expect(response.body.status)
      .toBe("editing");

    expect(response.body.book)
      .toMatchObject({
        clientId: client.id,
        title:
          "The Harbor Light",
        author: "Shawn Miller",
        status: "editing",
      });

    expect(
      response.body.book.id,
    ).toBeDefined();
  });

  it("records a book without a client", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/books")
        .send({
          title: "Solo Title",
          author: "Anon",
        });

    expect(response.status)
      .toBe(201);

    expect(
      response.body.book.status,
    ).toBe("draft");
  });

  it("returns all books", async () => {
    const app = createApp();

    await request(app)
      .post("/api/v1/books")
      .send({
        title: "One",
        author: "A",
      });

    await request(app)
      .post("/api/v1/books")
      .send({
        title: "Two",
        author: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/books");

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(2);
  });

  it("filters books by client", async () => {
    const app = createApp();

    const firstClient =
      await createClient(
        app,
        "First Author",
      );

    const secondClient =
      await createClient(
        app,
        "Second Author",
      );

    await request(app)
      .post("/api/v1/books")
      .send({
        clientId:
          firstClient.id,
        title: "A book",
        author: "A",
      });

    await request(app)
      .post("/api/v1/books")
      .send({
        clientId:
          secondClient.id,
        title: "B book",
        author: "B",
      });

    const response =
      await request(app)
        .get("/api/v1/books")
        .query({
          clientId:
            firstClient.id,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.count)
      .toBe(1);

    expect(
      response.body.books[0],
    ).toMatchObject({
      clientId:
        firstClient.id,
    });
  });

  it("returns one book", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/books")
        .send({
          title: "Details",
          author: "Writer",
        });

    const book =
      createResponse.body.book;

    const response =
      await request(app)
        .get(
          `/api/v1/books/${book.id}`,
        );

    expect(response.status)
      .toBe(200);

    expect(response.body)
      .toEqual(book);
  });

  it("returns 404 for a missing book", async () => {
    const app = createApp();

    const response =
      await request(app)
        .get(
          "/api/v1/books/missing",
        );

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("BOOK_NOT_FOUND");
  });

  it("updates a book through the pipeline", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/books")
        .send({
          title: "Manuscript",
          author: "Writer",
          status: "draft",
        });

    const book =
      createResponse.body.book;

    const response =
      await request(app)
        .patch(
          `/api/v1/books/${book.id}`,
        )
        .send({
          status: "published",
          publishedDate:
            "2026-08-01",
          royalties: 250,
        });

    expect(response.status)
      .toBe(200);

    expect(response.body.status)
      .toBe("published");

    expect(response.body.book)
      .toMatchObject({
        id: book.id,
        status: "published",
        publishedDate:
          "2026-08-01",
        royalties: 250,
      });
  });

  it("returns 404 when updating a missing book", async () => {
    const app = createApp();

    const response =
      await request(app)
        .patch(
          "/api/v1/books/missing",
        )
        .send({
          status: "archived",
        });

    expect(response.status)
      .toBe(404);

    expect(
      response.body.error.code,
    ).toBe("BOOK_NOT_FOUND");
  });

  it("deletes a book", async () => {
    const app = createApp();

    const createResponse =
      await request(app)
        .post("/api/v1/books")
        .send({
          title: "To Delete",
          author: "Writer",
        });

    const book =
      createResponse.body.book;

    const deleteResponse =
      await request(app)
        .delete(
          `/api/v1/books/${book.id}`,
        );

    expect(
      deleteResponse.status,
    ).toBe(204);

    const getResponse =
      await request(app)
        .get(
          `/api/v1/books/${book.id}`,
        );

    expect(getResponse.status)
      .toBe(404);
  });

  it("rejects an invalid book request", async () => {
    const app = createApp();

    const response =
      await request(app)
        .post("/api/v1/books")
        .send({
          title: "",
          author: "",
        });

    expect(response.status)
      .toBe(400);

    expect(
      response.body.error.code,
    ).toBe(
      "INVALID_BOOK_REQUEST",
    );
  });
});
