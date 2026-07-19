import {
  useEffect,
  useState,
} from "react";

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface ReviewProfile {
  clientId: string;
  businessName: string;
  reviewUrl: string;
  googlePlaceId?: string;
}

interface IntegrationStatus {
  googleConnected: boolean;
  message: string;
}

interface RequestResult {
  prepared: number;
  skipped: number;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

async function getJson<T>(
  url: string,
): Promise<T | null> {
  try {
    const response =
      await fetch(url);

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data =
      (await response.json()) as {
        error?: {
          message?: string;
        };
      };

    return (
      data.error?.message ?? fallback
    );
  } catch {
    return fallback;
  }
}

/**
 * Parses a textarea of customers, one per line: "Name, email" or
 * "Name <email>" or just "email".
 */
function parseCustomers(
  raw: string,
): { name: string; email: string }[] {
  const customers: {
    name: string;
    email: string;
  }[] = [];

  for (const line of raw.split(
    "\n",
  )) {
    const trimmed = line.trim();

    if (!trimmed) {
      continue;
    }

    const angle = trimmed.match(
      /^(.*)<(.+@.+)>$/,
    );

    if (angle) {
      customers.push({
        name: angle[1].trim(),
        email: angle[2].trim(),
      });

      continue;
    }

    const comma =
      trimmed.split(",");

    if (
      comma.length >= 2 &&
      comma[1].includes("@")
    ) {
      customers.push({
        name: comma[0].trim(),
        email: comma[1].trim(),
      });

      continue;
    }

    if (trimmed.includes("@")) {
      customers.push({
        name: trimmed.split("@")[0],
        email: trimmed,
      });
    }
  }

  return customers;
}

export default function ReviewsPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [clientId, setClientId] =
    useState("");

  const [status, setStatus] =
    useState<IntegrationStatus | null>(
      null,
    );

  const [
    businessName,
    setBusinessName,
  ] = useState("");

  const [reviewUrl, setReviewUrl] =
    useState("");

  const [customers, setCustomers] =
    useState("");

  const [message, setMessage] =
    useState<StatusMessage | null>(
      null,
    );

  const [busy, setBusy] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getJson<ClientsResponse>(
        "/api/v1/clients",
      ),
      getJson<IntegrationStatus>(
        "/api/v1/reviews/status",
      ),
    ]).then(
      ([clientsData, statusData]) => {
        if (cancelled) {
          return;
        }

        setClients(
          clientsData?.clients ?? [],
        );

        setStatus(statusData);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  async function selectClient(
    id: string,
  ): Promise<void> {
    setClientId(id);
    setBusinessName("");
    setReviewUrl("");

    if (!id) {
      return;
    }

    const profile =
      await getJson<ReviewProfile>(
        `/api/v1/reviews/profiles/${id}`,
      );

    if (profile) {
      setBusinessName(
        profile.businessName,
      );
      setReviewUrl(
        profile.reviewUrl,
      );
    } else {
      const client = clients.find(
        (c) => c.id === id,
      );

      setBusinessName(
        client?.companyName ?? "",
      );
    }
  }

  async function saveProfile(): Promise<void> {
    if (!clientId) {
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/v1/reviews/profiles/${clientId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            businessName,
            reviewUrl,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Could not save the profile.",
          ),
        );
      }

      setMessage({
        message:
          "Review link saved.",
        type: "success",
      });
    } catch (error) {
      setMessage({
        message:
          error instanceof Error
            ? error.message
            : "Could not save the profile.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  async function sendRequests(): Promise<void> {
    if (!clientId) {
      return;
    }

    const parsed =
      parseCustomers(customers);

    if (parsed.length === 0) {
      setMessage({
        message:
          "Add at least one customer (name and email).",
        type: "error",
      });

      return;
    }

    setBusy(true);
    setMessage({
      message: "Preparing requests...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/reviews/requests",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            clientId,
            customers: parsed,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            "Could not prepare requests.",
          ),
        );
      }

      const result =
        (await response.json()) as RequestResult;

      setCustomers("");

      setMessage({
        message: `${result.prepared} review request(s) prepared as drafts${
          result.skipped > 0
            ? `, ${result.skipped} skipped (already asked or no email)`
            : ""
        }. Approve them on the Automations page.`,
        type: "success",
      });
    } catch (error) {
      setMessage({
        message:
          error instanceof Error
            ? error.message
            : "Could not prepare requests.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Reputation
          </p>

          <h3>Google Reviews</h3>

          <p className="help-text">
            Ask a client's customers for
            honest Google reviews. Every
            customer is asked the same
            way, and each request waits
            for your approval before it
            sends.
          </p>
        </div>
      </div>

      {status && (
        <div
          className={`status-message ${
            status.googleConnected
              ? "success"
              : "working"
          }`}
        >
          {status.message}
        </div>
      )}

      {message && (
        <div
          className={`status-message ${message.type}`}
        >
          {message.message}
        </div>
      )}

      <div className="form-group">
        <label htmlFor="review-client">
          Client
        </label>

        <select
          id="review-client"
          value={clientId}
          onChange={(event) =>
            void selectClient(
              event.target.value,
            )
          }
        >
          <option value="">
            Select a client
          </option>

          {clients.map((client) => (
            <option
              key={client.id}
              value={client.id}
            >
              {client.companyName}
            </option>
          ))}
        </select>
      </div>

      {clientId && (
        <div className="workspace-grid">
          <section className="card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">
                  Setup
                </p>

                <h3>
                  Google Review Link
                </h3>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="review-business">
                Business Name
              </label>

              <input
                id="review-business"
                type="text"
                value={businessName}
                onChange={(event) =>
                  setBusinessName(
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="review-url">
                Google "Write a review"
                link
              </label>

              <input
                id="review-url"
                type="text"
                placeholder="https://g.page/r/..."
                value={reviewUrl}
                onChange={(event) =>
                  setReviewUrl(
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <button
              type="button"
              className="secondary-button"
              disabled={busy}
              onClick={() =>
                void saveProfile()
              }
            >
              Save Link
            </button>
          </section>

          <section className="card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">
                  Request Reviews
                </p>

                <h3>Customers</h3>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="review-customers">
                One per line — "Name,
                email"
              </label>

              <textarea
                id="review-customers"
                rows={8}
                placeholder={
                  "Sam Jones, sam@example.com\nDana Lee, dana@example.com"
                }
                value={customers}
                onChange={(event) =>
                  setCustomers(
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() =>
                void sendRequests()
              }
            >
              Prepare Requests
            </button>

            <p className="help-text">
              Prepared requests appear
              as drafts on the
              Automations page for your
              approval.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
