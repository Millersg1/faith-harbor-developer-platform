import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type BookStatus =
  | "draft"
  | "editing"
  | "design"
  | "proof"
  | "published"
  | "archived";

const bookStatuses: readonly BookStatus[] =
  [
    "draft",
    "editing",
    "design",
    "proof",
    "published",
    "archived",
  ];

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface Book {
  id: string;
  clientId?: string;
  title: string;
  subtitle?: string;
  author: string;
  status: BookStatus;
  format?: string;
  isbn?: string;
  wordCount?: number;
  targetDate?: string;
  publishedDate?: string;
  royalties?: number;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface BooksResponse {
  count: number;
  books: Book[];
}

interface BookMutationResponse {
  success: boolean;
  status: BookStatus;
  book: Book;
}

interface BookFormData {
  clientId: string;
  title: string;
  subtitle: string;
  author: string;
  status: BookStatus;
  format: string;
  targetDate: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  BookFormData = {
    clientId: "",
    title: "",
    subtitle: "",
    author: "",
    status: "draft",
    format: "",
    targetDate: "",
  };

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error
    ? error.message
    : fallback;
}

async function getResponseData<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const responseText =
    await response.text();

  if (!responseText.trim()) {
    if (response.ok) {
      return undefined as T;
    }

    throw new Error(fallbackMessage);
  }

  let result: unknown;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      response.ok
        ? "The server returned an invalid response."
        : fallbackMessage,
    );
  }

  if (!response.ok) {
    if (
      typeof result === "object" &&
      result !== null
    ) {
      const errorResult =
        result as {
          error?: {
            message?: string;
          };
        };

      throw new Error(
        errorResult.error
          ?.message ??
          fallbackMessage,
      );
    }

    throw new Error(fallbackMessage);
  }

  return result as T;
}

function formatLabel(
  value: string,
): string {
  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
}

function formatDate(
  value?: string,
): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatMoney(
  value?: number,
): string {
  if (
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "$0.00";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
    },
  ).format(value);
}

async function requestClients():
Promise<ClientsResponse> {
  const response = await fetch(
    "/api/v1/clients",
  );

  return getResponseData<ClientsResponse>(
    response,
    "Clients could not be loaded.",
  );
}

async function requestBooks():
Promise<BooksResponse> {
  const response = await fetch(
    "/api/v1/books",
  );

  return getResponseData<BooksResponse>(
    response,
    "Books could not be loaded.",
  );
}

export default function PublishingPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [books, setBooks] =
    useState<Book[]>([]);

  const [
    selectedBook,
    setSelectedBook,
  ] = useState<Book | null>(null);

  const [formData, setFormData] =
    useState<BookFormData>(
      emptyForm,
    );

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [creating, setCreating] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      requestClients(),
      requestBooks(),
    ])
      .then(
        ([
          clientsResult,
          booksResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setBooks(
            booksResult.books,
          );
        },
      )
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }

        setStatus({
          message:
            getErrorMessage(
              error,
              "Publishing information could not be loaded.",
            ),
          type: "error",
        });
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clientNames = useMemo(() => {
    const names =
      new Map<string, string>();

    for (const client of clients) {
      names.set(
        client.id,
        client.companyName,
      );
    }

    return names;
  }, [clients]);

  const metrics = useMemo(() => {
    let inProduction = 0;
    let published = 0;
    let royalties = 0;

    for (const book of books) {
      if (
        book.status ===
          "published"
      ) {
        published += 1;
      } else if (
        book.status !== "archived"
      ) {
        inProduction += 1;
      }

      royalties +=
        book.royalties ?? 0;
    }

    return {
      total: books.length,
      inProduction,
      published,
      royalties,
    };
  }, [books]);

  async function reloadBooks():
  Promise<void> {
    const result =
      await requestBooks();

    setBooks(result.books);
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (
      !formData.title.trim() ||
      !formData.author.trim()
    ) {
      setStatus({
        message:
          "Title and author are required.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message: "Adding book...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/books",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            clientId:
              formData.clientId ||
              undefined,
            title:
              formData.title
                .trim(),
            subtitle:
              formData.subtitle
                .trim() ||
              undefined,
            author:
              formData.author
                .trim(),
            status:
              formData.status,
            format:
              formData.format
                .trim() ||
              undefined,
            targetDate:
              formData.targetDate ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<BookMutationResponse>(
          response,
          "The book could not be added.",
        );

      await reloadBooks();

      setSelectedBook(
        result.book,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Added "${result.book.title}".`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The book could not be added.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    book: Book,
    nextStatus: BookStatus,
  ): Promise<void> {
    setStatus({
      message: "Updating book...",
      type: "working",
    });

    try {
      const publishedDate =
        nextStatus ===
          "published" &&
        !book.publishedDate
          ? new Date()
              .toISOString()
              .slice(0, 10)
          : book.publishedDate;

      const response = await fetch(
        `/api/v1/books/${book.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
            publishedDate,
          }),
        },
      );

      const result =
        await getResponseData<BookMutationResponse>(
          response,
          "The book could not be updated.",
        );

      await reloadBooks();

      setSelectedBook(
        result.book,
      );

      setStatus({
        message: `"${result.book.title}" moved to ${formatLabel(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The book could not be updated.",
          ),
        type: "error",
      });
    }
  }

  async function handleDelete(
    book: Book,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/books/${book.id}`,
      {
        method: "DELETE",
      },
    );

    if (
      !response.ok &&
      response.status !== 204
    ) {
      await getResponseData<unknown>(
        response,
        "The book could not be deleted.",
      );
    }

    await reloadBooks();

    setSelectedBook((current) =>
      current?.id === book.id
        ? null
        : current,
    );

    setStatus({
      message: `Removed "${book.title}".`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Publishing
          </p>

          <h3>
            Book Production
          </h3>

          <p className="help-text">
            Track manuscripts from
            draft through editing,
            design, proofing, and
            publication. Human review
            remains the final authority
            before a book is released.
          </p>
        </div>
      </div>

      {status && (
        <div
          className={`status-message ${status.type}`}
        >
          {status.message}
        </div>
      )}

      <div
        className="metrics-grid"
        aria-label="Publishing summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Titles
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.total}
          </strong>

          <span className="metric-detail">
            All books tracked
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            In Production
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.inProduction}
          </strong>

          <span className="metric-detail">
            Draft through proof
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Published
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.published}
          </strong>

          <span className="metric-detail">
            Released titles
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Royalties
          </span>

          <strong className="metric-value metric-word">
            {loading
              ? "..."
              : formatMoney(
                  metrics.royalties,
                )}
          </strong>

          <span className="metric-detail">
            Earned to date
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Title
              </p>

              <h3>Add Book</h3>
            </div>
          </div>

          <form
            onSubmit={(event) =>
              void handleCreate(
                event,
              )
            }
          >
            <div className="form-group">
              <label htmlFor="book-title">
                Title
              </label>

              <input
                id="book-title"
                type="text"
                value={
                  formData.title
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      title:
                        event.target
                          .value,
                    }),
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="book-subtitle">
                Subtitle
              </label>

              <input
                id="book-subtitle"
                type="text"
                value={
                  formData.subtitle
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      subtitle:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="book-author">
                Author
              </label>

              <input
                id="book-author"
                type="text"
                value={
                  formData.author
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      author:
                        event.target
                          .value,
                    }),
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="book-client">
                Author client (optional)
              </label>

              <select
                id="book-client"
                value={
                  formData.clientId
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      clientId:
                        event.target
                          .value,
                    }),
                  )
                }
              >
                <option value="">
                  Not linked
                </option>

                {clients.map(
                  (client) => (
                    <option
                      key={
                        client.id
                      }
                      value={
                        client.id
                      }
                    >
                      {
                        client.companyName
                      }
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="book-status">
                  Stage
                </label>

                <select
                  id="book-status"
                  value={
                    formData.status
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        status:
                          event
                            .target
                            .value as BookStatus,
                      }),
                    )
                  }
                >
                  {bookStatuses.map(
                    (value) => (
                      <option
                        key={value}
                        value={value}
                      >
                        {formatLabel(
                          value,
                        )}
                      </option>
                    ),
                  )}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="book-format">
                  Format
                </label>

                <input
                  id="book-format"
                  type="text"
                  placeholder="Paperback / eBook / Audiobook"
                  value={
                    formData.format
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        format:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="book-target">
                Target date
              </label>

              <input
                id="book-target"
                type="date"
                value={
                  formData.targetDate
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      targetDate:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating
                ? "Saving..."
                : "Add Book"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Catalog
              </p>

              <h3>Books</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading books...
            </p>
          ) : books.length === 0 ? (
            <p className="help-text">
              No books yet. Add the
              first manuscript to begin
              tracking production.
            </p>
          ) : (
            <div className="record-list">
              {books.map((book) => (
                <button
                  type="button"
                  className="record-button"
                  key={book.id}
                  onClick={() =>
                    setSelectedBook(
                      book,
                    )
                  }
                >
                  <span className="record-title">
                    {book.title}
                  </span>

                  <span className="record-detail">
                    <span
                      className={`book-status book-status-${book.status}`}
                    >
                      {formatLabel(
                        book.status,
                      )}
                    </span>{" "}
                    {book.author}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedBook && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {selectedBook.author}
              </p>

              <h3>
                {selectedBook.title}
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedBook(null)
              }
            >
              Close
            </button>
          </div>

          <div className="client-overview">
            <div className="client-overview-item">
              <span>Stage</span>

              <strong>
                {formatLabel(
                  selectedBook.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Format</span>

              <strong>
                {selectedBook.format ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Author client</span>

              <strong>
                {selectedBook.clientId
                  ? clientNames.get(
                      selectedBook.clientId,
                    ) ?? "Client"
                  : "Not linked"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Target</span>

              <strong>
                {formatDate(
                  selectedBook.targetDate,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Published</span>

              <strong>
                {formatDate(
                  selectedBook.publishedDate,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Royalties</span>

              <strong>
                {formatMoney(
                  selectedBook.royalties,
                )}
              </strong>
            </div>
          </div>

          {selectedBook.notes && (
            <p className="client-notes">
              {selectedBook.notes}
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="book-status-update">
              Move to stage
            </label>

            <select
              id="book-status-update"
              value={
                selectedBook.status
              }
              onChange={(event) =>
                void handleStatusChange(
                  selectedBook,
                  event.target
                    .value as BookStatus,
                )
              }
            >
              {bookStatuses.map(
                (value) => (
                  <option
                    key={value}
                    value={value}
                  >
                    {formatLabel(
                      value,
                    )}
                  </option>
                ),
              )}
            </select>
          </div>

          <ConfirmDeleteButton
            recordName={`"${selectedBook.title}"`}
            onDelete={() =>
              handleDelete(
                selectedBook,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
