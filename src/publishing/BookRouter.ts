import { Router } from "express";
import { z } from "zod";

import type { BookStatus } from "./BookStatus";
import { BookService } from "./BookService";

const bookStatusSchema = z.enum([
  "draft",
  "editing",
  "design",
  "proof",
  "published",
  "archived",
]);

const bookRequestSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1)
    .optional(),

  title: z
    .string()
    .trim()
    .min(1),

  subtitle: z
    .string()
    .trim()
    .optional(),

  author: z
    .string()
    .trim()
    .min(1),

  status:
    bookStatusSchema.optional(),

  format: z
    .string()
    .trim()
    .optional(),

  isbn: z
    .string()
    .trim()
    .optional(),

  wordCount: z
    .number()
    .nonnegative()
    .optional(),

  targetDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  publishedDate: z
    .string()
    .trim()
    .min(1)
    .optional(),

  royalties: z
    .number()
    .nonnegative()
    .optional(),

  notes: z
    .string()
    .trim()
    .optional(),

  metadata: z
    .record(z.unknown())
    .optional(),
});

const bookUpdateSchema =
  bookRequestSchema.partial();

/**
 * Creates the publishing (books) management routes.
 */
export function createBookRouter(
  bookService: BookService,
): Router {
  const router = Router();

  /**
   * Returns all books.
   *
   * An optional clientId query parameter limits the result.
   */
  router.get("/", (req, res) => {
    const clientId =
      typeof req.query.clientId ===
      "string"
        ? req.query.clientId.trim()
        : "";

    const books =
      clientId.length > 0
        ? bookService.listForClient(
            clientId,
          )
        : bookService.list();

    res.json({
      count: books.length,
      books,
    });
  });

  /**
   * Returns one book.
   */
  router.get(
    "/:bookId",
    (req, res) => {
      try {
        res.json(
          bookService.get(
            req.params.bookId,
          ),
        );
      } catch (error) {
        res.status(404).json({
          error: {
            code:
              "BOOK_NOT_FOUND",
            message:
              error instanceof Error
                ? error.message
                : "Book not found.",
          },
        });
      }
    },
  );

  /**
   * Records a book.
   */
  router.post(
    "/",
    (req, res, next) => {
      try {
        const parsed =
          bookRequestSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_BOOK_REQUEST",
              message:
                "Book request validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const book =
          bookService.create(
            parsed.data,
          );

        res.status(201).json({
          success: true,
          status: book.status,
          book,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Updates a book.
   */
  router.patch(
    "/:bookId",
    (req, res, next) => {
      try {
        const parsed =
          bookUpdateSchema.safeParse(
            req.body,
          );

        if (!parsed.success) {
          res.status(400).json({
            error: {
              code:
                "INVALID_BOOK_UPDATE",
              message:
                "Book update validation failed.",
              details:
                parsed.error.flatten(),
            },
          });

          return;
        }

        const existing =
          bookService.get(
            req.params.bookId,
          );

        const book =
          bookService.update({
            ...existing,

            ...parsed.data,

            status:
              parsed.data.status
                ? (parsed.data
                    .status as BookStatus)
                : existing.status,

            metadata:
              parsed.data.metadata
                ? {
                    ...existing.metadata,
                    ...parsed.data
                      .metadata,
                  }
                : existing.metadata,
          });

        res.json({
          success: true,
          status: book.status,
          book,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "was not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "BOOK_NOT_FOUND",
              message: error.message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  /**
   * Deletes a book.
   */
  router.delete(
    "/:bookId",
    (req, res, next) => {
      try {
        bookService.delete(
          req.params.bookId,
        );

        res.status(204).send();
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes(
            "was not found",
          )
        ) {
          res.status(404).json({
            error: {
              code:
                "BOOK_NOT_FOUND",
              message: error.message,
            },
          });

          return;
        }

        next(error);
      }
    },
  );

  return router;
}
