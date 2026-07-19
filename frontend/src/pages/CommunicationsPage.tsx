import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

type EmailStatus =
  | "sent"
  | "logged"
  | "failed";

interface Client {
  id: string;
  companyName: string;
  email?: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface EmailRecord {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  status: EmailStatus;
  provider: string;
  error?: string;
  clientId?: string;
  createdAt: string;
}

interface EmailsResponse {
  count: number;
  emails: EmailRecord[];
}

interface EmailMutationResponse {
  success: boolean;
  status: EmailStatus;
  email: EmailRecord;
}

interface HealthResponse {
  emailDeliveryConfigured?: boolean;
}

interface FormData {
  clientId: string;
  to: string;
  subject: string;
  body: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm: FormData = {
  clientId: "",
  to: "",
  subject: "",
  body: "",
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

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

async function requestEmails():
Promise<EmailsResponse> {
  const response = await fetch(
    "/api/v1/emails",
  );

  return getResponseData<EmailsResponse>(
    response,
    "The outbox could not be loaded.",
  );
}

export default function CommunicationsPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [emails, setEmails] =
    useState<EmailRecord[]>([]);

  const [formData, setFormData] =
    useState<FormData>(emptyForm);

  const [
    deliveryConfigured,
    setDeliveryConfigured,
  ] = useState(false);

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/v1/clients")
        .then((response) =>
          getResponseData<ClientsResponse>(
            response,
            "Clients could not be loaded.",
          ),
        )
        .catch(() => ({
          count: 0,
          clients: [],
        })),
      requestEmails(),
      fetch("/health")
        .then((response) =>
          getResponseData<HealthResponse>(
            response,
            "Status unavailable.",
          ),
        )
        .catch(
          (): HealthResponse => ({}),
        ),
    ])
      .then(
        ([
          clientsResult,
          emailsResult,
          health,
        ]) => {
          if (cancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setEmails(
            emailsResult.emails,
          );

          setDeliveryConfigured(
            Boolean(
              health.emailDeliveryConfigured,
            ),
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
              "Communications could not be loaded.",
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

  function selectClient(
    clientId: string,
  ): void {
    const client = clients.find(
      (candidate) =>
        candidate.id === clientId,
    );

    setFormData((current) => ({
      ...current,
      clientId,
      to:
        client?.email ??
        current.to,
    }));
  }

  async function reloadEmails():
  Promise<void> {
    const result =
      await requestEmails();

    setEmails(result.emails);
  }

  async function handleSend(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (
      !formData.to.trim() ||
      !formData.subject.trim() ||
      !formData.body.trim()
    ) {
      setStatus({
        message:
          "Recipient, subject, and message are all required.",
        type: "error",
      });

      return;
    }

    setSending(true);

    setStatus({
      message: "Sending...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/emails",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            to: formData.to.trim(),
            subject:
              formData.subject
                .trim(),
            body: formData.body
              .trim(),
            clientId:
              formData.clientId ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<EmailMutationResponse>(
          response,
          "The email could not be sent.",
        );

      await reloadEmails();

      setFormData(emptyForm);

      setStatus({
        message:
          result.status === "sent"
            ? "Email sent."
            : "Email recorded in the outbox (delivery is not configured, so it was not sent).",
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The email could not be sent.",
          ),
        type: "error",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Communications
          </p>

          <h3>Email</h3>

          <p className="help-text">
            Send email to clients and
            review the outbox. Every
            message is recorded, whether
            or not delivery is
            configured.
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

      {!deliveryConfigured &&
        !loading && (
          <div className="status-message working">
            Delivery is not configured.
            Emails are recorded in the
            outbox but not sent. Set
            EMAIL_API_URL and
            EMAIL_API_KEY on the server
            to enable real delivery.
          </div>
        )}

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Compose
              </p>

              <h3>New Email</h3>
            </div>
          </div>

          <form
            onSubmit={(event) =>
              void handleSend(event)
            }
          >
            {clients.length > 0 && (
              <div className="form-group">
                <label htmlFor="email-client">
                  Client
                </label>

                <select
                  id="email-client"
                  value={
                    formData.clientId
                  }
                  onChange={(event) =>
                    selectClient(
                      event.target
                        .value,
                    )
                  }
                >
                  <option value="">
                    No client
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
                        {client.email
                          ? ` (${client.email})`
                          : " (no email)"}
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email-to">
                To
              </label>

              <input
                id="email-to"
                type="email"
                value={formData.to}
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      to: event
                        .target
                        .value,
                    }),
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email-subject">
                Subject
              </label>

              <input
                id="email-subject"
                type="text"
                value={
                  formData.subject
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      subject:
                        event.target
                          .value,
                    }),
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="email-body">
                Message
              </label>

              <textarea
                id="email-body"
                rows={10}
                value={formData.body}
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      body: event
                        .target
                        .value,
                    }),
                  )
                }
                required
              />
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={sending}
            >
              {sending
                ? "Sending..."
                : deliveryConfigured
                  ? "Send Email"
                  : "Record Email"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Outbox
              </p>

              <h3>Sent & Recorded</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading outbox...
            </p>
          ) : emails.length === 0 ? (
            <p className="help-text">
              No emails yet.
            </p>
          ) : (
            <div className="record-list">
              {emails.map((email) => (
                <div
                  className="record-button"
                  key={email.id}
                >
                  <span className="record-title">
                    <span
                      className={`email-status email-status-${email.status}`}
                    >
                      {email.status}
                    </span>{" "}
                    {email.subject}
                  </span>

                  <span className="record-detail">
                    To {email.to}
                    {email.clientId
                      ? ` · ${
                          clientNames.get(
                            email.clientId,
                          ) ?? "Client"
                        }`
                      : ""}{" "}
                    ·{" "}
                    {formatDate(
                      email.createdAt,
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
