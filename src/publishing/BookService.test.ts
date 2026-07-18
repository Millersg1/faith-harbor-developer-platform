import {
  describe,
  expect,
  it,
} from "vitest";

import { ClientService } from "../clients/ClientService";

import { BookRepository } from "./BookRepository";
import { BookService } from "./BookService";

function createBookService() {
  const clients =
    new ClientService();

  const repository =
    new BookRepository();

  const service =
    new BookService(
      clients,
      repository,
    );

  return {
    service,
    clients,
    repository,
  };
}

function createClient(
  clients: ClientService,
  companyName =
    "Harbor Author",
) {
  return clients.create({
    companyName,

    primaryContact:
      "Jordan Smith",
  });
}

describe("BookService", () => {
  it("creates and saves a book linked to a client", () => {
    const {
      service,
      clients,
    } = createBookService();

    const client =
      createClient(clients);

    const book =
      service.create({
        clientId: client.id,

        title:
          "  The Harbor Light  ",

        author:
          "  Shawn Miller  ",

        format: "Paperback",

        status: "editing",

        metadata: {
          series: "Harbor",
        },
      });

    expect(book.id)
      .toBeDefined();

    expect(book.clientId)
      .toBe(client.id);

    expect(book.title)
      .toBe("The Harbor Light");

    expect(book.author)
      .toBe("Shawn Miller");

    expect(book.status)
      .toBe("editing");

    expect(book.metadata)
      .toEqual({
        series: "Harbor",
      });

    expect(service.list())
      .toEqual([book]);
  });

  it("creates a book without a client", () => {
    const {
      service,
    } = createBookService();

    const book =
      service.create({
        title: "Solo Title",
        author: "Anon",
      });

    expect(book.clientId)
      .toBeUndefined();

    expect(book.status)
      .toBe("draft");
  });

  it("defaults status to draft", () => {
    const {
      service,
    } = createBookService();

    const book =
      service.create({
        title: "Draft Book",
        author: "Writer",
      });

    expect(book.status)
      .toBe("draft");
  });

  it("lists books for one client", () => {
    const {
      service,
      clients,
    } = createBookService();

    const firstClient =
      createClient(
        clients,
        "First Author",
      );

    const secondClient =
      createClient(
        clients,
        "Second Author",
      );

    const firstBook =
      service.create({
        clientId:
          firstClient.id,
        title: "First",
        author: "A",
      });

    service.create({
      clientId:
        secondClient.id,
      title: "Second",
      author: "B",
    });

    const thirdBook =
      service.create({
        clientId:
          firstClient.id,
        title: "Third",
        author: "A",
      });

    expect(
      service.listForClient(
        firstClient.id,
      ),
    ).toEqual([
      firstBook,
      thirdBook,
    ]);
  });

  it("updates a book", () => {
    const {
      service,
    } = createBookService();

    const book =
      service.create({
        title: "Draft",
        author: "Writer",
        status: "draft",
      });

    const updated =
      service.update({
        ...book,

        status: "published",

        royalties: 500,
      });

    expect(updated.status)
      .toBe("published");

    expect(
      service.get(book.id)
        .royalties,
    ).toBe(500);
  });

  it("deletes a book", () => {
    const {
      service,
    } = createBookService();

    const book =
      service.create({
        title: "To Delete",
        author: "Writer",
      });

    expect(service.list())
      .toHaveLength(1);

    service.delete(book.id);

    expect(service.list())
      .toHaveLength(0);
  });

  it("rejects a book with no title", () => {
    const {
      service,
    } = createBookService();

    expect(() =>
      service.create({
        title: "   ",
        author: "Writer",
      }),
    ).toThrow(
      "A book requires a title.",
    );
  });

  it("rejects a book with no author", () => {
    const {
      service,
    } = createBookService();

    expect(() =>
      service.create({
        title: "Titled",
        author: "   ",
      }),
    ).toThrow(
      "A book requires an author.",
    );
  });

  it("rejects a book for a missing client", () => {
    const {
      service,
    } = createBookService();

    expect(() =>
      service.create({
        clientId:
          "missing-client",
        title: "Titled",
        author: "Writer",
      }),
    ).toThrow(
      'Client "missing-client" was not found.',
    );

    expect(service.list())
      .toHaveLength(0);
  });
});
