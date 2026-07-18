import { randomUUID } from "node:crypto";

import { ClientService } from "../clients/ClientService";

import type { BookRecord } from "./BookRecord";
import { BookRepository } from "./BookRepository";
import type { BookRequest } from "./BookRequest";

/**
 * Creates and manages Faith Harbor Publishing books.
 */
export class BookService {
  constructor(
    private readonly clients: ClientService,
    private readonly repository =
      new BookRepository(),
  ) {}

  /**
   * Creates and stores a new book record.
   */
  create(
    request: BookRequest,
  ): BookRecord {
    // Validate the client only when one is supplied.
    if (request.clientId) {
      this.clients.get(
        request.clientId,
      );
    }

    const title =
      request.title.trim();

    const author =
      request.author.trim();

    if (!title) {
      throw new Error(
        "A book requires a title.",
      );
    }

    if (!author) {
      throw new Error(
        "A book requires an author.",
      );
    }

    const now =
      new Date().toISOString();

    const book: BookRecord = {
      id: randomUUID(),

      clientId:
        request.clientId,

      title,

      subtitle:
        request.subtitle,

      author,

      status:
        request.status ??
        "draft",

      format:
        request.format,

      isbn:
        request.isbn,

      wordCount:
        request.wordCount,

      targetDate:
        request.targetDate,

      publishedDate:
        request.publishedDate,

      royalties:
        request.royalties,

      notes:
        request.notes,

      metadata: {
        ...(request.metadata ?? {}),
      },

      createdAt: now,
      updatedAt: now,
    };

    return this.repository.create(
      book,
    );
  }

  /**
   * Returns every book.
   */
  list(): readonly BookRecord[] {
    return this.repository.list();
  }

  /**
   * Returns one book.
   */
  get(
    bookId: string,
  ): BookRecord {
    return this.repository.get(
      bookId,
    );
  }

  /**
   * Returns all books for one client.
   */
  listForClient(
    clientId: string,
  ): readonly BookRecord[] {
    return this.repository.findByClientId(
      clientId,
    );
  }

  /**
   * Updates an existing book.
   */
  update(
    book: BookRecord,
  ): BookRecord {
    if (book.clientId) {
      this.clients.get(
        book.clientId,
      );
    }

    return this.repository.update({
      ...book,
      title: book.title.trim(),
      author: book.author.trim(),
      updatedAt:
        new Date().toISOString(),
    });
  }

  /**
   * Deletes a book.
   */
  delete(
    bookId: string,
  ): void {
    this.repository.delete(
      bookId,
    );
  }
}
