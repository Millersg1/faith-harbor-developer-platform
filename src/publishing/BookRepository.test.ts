import {
  describe,
  expect,
  it,
} from "vitest";

import { BookRepository } from "./BookRepository";
import type { BookStatus } from "./BookStatus";

function createBook(
  repository: BookRepository,
  overrides: Partial<{
    id: string;
    clientId: string;
    title: string;
    author: string;
    status: BookStatus;
  }> = {},
) {
  const now =
    new Date().toISOString();

  return repository.create({
    id:
      overrides.id ??
      "book-1",

    clientId:
      overrides.clientId,

    title:
      overrides.title ??
      "The Harbor Light",

    author:
      overrides.author ??
      "Shawn Miller",

    status:
      overrides.status ??
      "draft",

    format: "Paperback",

    wordCount: 42000,

    royalties: 125.5,

    metadata: {
      series: "Harbor",
    },

    createdAt: now,
    updatedAt: now,
  });
}

describe("BookRepository", () => {
  it("stores and retrieves books", () => {
    const repository =
      new BookRepository();

    createBook(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    const book =
      repository.get("book-1");

    expect(book.title).toBe(
      "The Harbor Light",
    );

    expect(book.author).toBe(
      "Shawn Miller",
    );

    expect(book.status).toBe(
      "draft",
    );

    expect(book.wordCount).toBe(
      42000,
    );

    expect(book.royalties).toBe(
      125.5,
    );
  });

  it("stores a book without a client", () => {
    const repository =
      new BookRepository();

    createBook(repository);

    const book =
      repository.get("book-1");

    expect(
      book.clientId,
    ).toBeUndefined();
  });

  it("lists books for one client", () => {
    const repository =
      new BookRepository();

    createBook(repository, {
      id: "book-1",
      clientId: "client-1",
    });

    createBook(repository, {
      id: "book-2",
      clientId: "client-2",
    });

    createBook(repository, {
      id: "book-3",
      clientId: "client-1",
    });

    const books =
      repository.findByClientId(
        "client-1",
      );

    expect(books).toHaveLength(2);

    expect(
      books.every(
        (book) =>
          book.clientId ===
          "client-1",
      ),
    ).toBe(true);
  });

  it("updates a book", () => {
    const repository =
      new BookRepository();

    createBook(repository);

    const existing =
      repository.get("book-1");

    const updated =
      repository.update({
        ...existing,

        status: "published",

        publishedDate:
          "2026-08-01",

        isbn:
          "978-1-23456-789-0",

        updatedAt:
          new Date().toISOString(),
      });

    expect(updated.status).toBe(
      "published",
    );

    const stored =
      repository.get("book-1");

    expect(stored.status).toBe(
      "published",
    );

    expect(stored.publishedDate).toBe(
      "2026-08-01",
    );

    expect(stored.isbn).toBe(
      "978-1-23456-789-0",
    );
  });

  it("stores book metadata", () => {
    const repository =
      new BookRepository();

    createBook(repository);

    const book =
      repository.get("book-1");

    expect(book.metadata).toEqual({
      series: "Harbor",
    });
  });

  it("deletes a book", () => {
    const repository =
      new BookRepository();

    createBook(repository);

    expect(
      repository.list(),
    ).toHaveLength(1);

    repository.delete("book-1");

    expect(
      repository.list(),
    ).toHaveLength(0);
  });

  it("throws when a book is missing", () => {
    const repository =
      new BookRepository();

    expect(() =>
      repository.get("missing"),
    ).toThrow(
      'Book "missing" was not found.',
    );
  });
});
