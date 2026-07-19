import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting"
  | "resolved"
  | "closed";

type TicketPriority =
  | "low"
  | "medium"
  | "high"
  | "urgent";

const ticketStatuses: readonly TicketStatus[] =
  [
    "open",
    "in_progress",
    "waiting",
    "resolved",
    "closed",
  ];

const ticketPriorities: readonly TicketPriority[] =
  [
    "low",
    "medium",
    "high",
    "urgent",
  ];

interface Client {
  id: string;
  companyName: string;
  primaryContact: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface HostingAccount {
  id: string;
  domain: string;
}

interface HostingAccountsResponse {
  count: number;
  accounts: HostingAccount[];
}

type DiagnosticSeverity =
  | "info"
  | "warning"
  | "critical";

interface DiagnosticFinding {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
}

interface HostingAssessment {
  findings: DiagnosticFinding[];
  summary: string;
  recommendation: string;
  aiGenerated: boolean;
}

interface AssessmentResponse {
  assessment: HostingAssessment;
}

interface Ticket {
  id: string;
  number: string;
  clientId: string;
  projectId?: string;
  hostingAccountId?: string;
  subject: string;
  description?: string;
  status: TicketStatus;
  priority: TicketPriority;
  assignee?: string;
  resolution?: string;
  resolvedDate?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface TicketsResponse {
  count: number;
  tickets: Ticket[];
}

interface TicketMutationResponse {
  success: boolean;
  status: TicketStatus;
  ticket: Ticket;
}

interface TicketFormData {
  clientId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  assignee: string;
  hostingAccountId: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  TicketFormData = {
    clientId: "",
    subject: "",
    description: "",
    priority: "medium",
    assignee: "",
    hostingAccountId: "",
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
          message?: string;
        };

      throw new Error(
        errorResult.error
          ?.message ??
          errorResult.message ??
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
  return value
    .split("_")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function formatDate(
  value?: string,
): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
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

async function requestTickets():
Promise<TicketsResponse> {
  const response = await fetch(
    "/api/v1/tickets",
  );

  return getResponseData<TicketsResponse>(
    response,
    "Tickets could not be loaded.",
  );
}

export default function SupportPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [tickets, setTickets] =
    useState<Ticket[]>([]);

  const [
    selectedTicket,
    setSelectedTicket,
  ] = useState<Ticket | null>(null);

  const [formData, setFormData] =
    useState<TicketFormData>(
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

  const [updating, setUpdating] =
    useState(false);

  const [
    hostingAccounts,
    setHostingAccounts,
  ] = useState<HostingAccount[]>([]);

  const [
    assessment,
    setAssessment,
  ] = useState<HostingAssessment | null>(
    null,
  );

  const [diagnosing, setDiagnosing] =
    useState(false);

  useEffect(() => {
    setAssessment(null);
  }, [selectedTicket?.id]);

  useEffect(() => {
    let requestCancelled = false;

    Promise.all([
      requestClients(),
      requestTickets(),
      fetch(
        "/api/v1/hosting/accounts",
      )
        .then((response) =>
          getResponseData<HostingAccountsResponse>(
            response,
            "Hosting accounts could not be loaded.",
          ),
        )
        .catch(() => ({
          count: 0,
          accounts: [],
        })),
    ])
      .then(
        ([
          clientsResult,
          ticketsResult,
          hostingResult,
        ]) => {
          if (requestCancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setTickets(
            ticketsResult.tickets,
          );

          setHostingAccounts(
            hostingResult.accounts,
          );
        },
      )
      .catch((error: unknown) => {
        if (requestCancelled) {
          return;
        }

        setStatus({
          message:
            getErrorMessage(
              error,
              "Support information could not be loaded.",
            ),
          type: "error",
        });
      })
      .finally(() => {
        if (requestCancelled) {
          return;
        }

        setLoading(false);
      });

    return () => {
      requestCancelled = true;
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
    let open = 0;
    let inProgress = 0;
    let resolved = 0;

    for (const ticket of tickets) {
      if (
        ticket.status === "open" ||
        ticket.status === "waiting"
      ) {
        open += 1;
      }

      if (
        ticket.status ===
        "in_progress"
      ) {
        inProgress += 1;
      }

      if (
        ticket.status ===
          "resolved" ||
        ticket.status === "closed"
      ) {
        resolved += 1;
      }
    }

    return {
      total: tickets.length,
      open,
      inProgress,
      resolved,
    };
  }, [tickets]);

  async function reloadTickets():
  Promise<void> {
    const result =
      await requestTickets();

    setTickets(result.tickets);
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!formData.clientId) {
      setStatus({
        message:
          "Select a client for this ticket.",
        type: "error",
      });

      return;
    }

    if (
      !formData.subject.trim()
    ) {
      setStatus({
        message:
          "Enter a subject for this ticket.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message:
        "Opening ticket...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/tickets",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            clientId:
              formData.clientId,
            subject:
              formData.subject
                .trim(),
            description:
              formData.description
                .trim() ||
              undefined,
            priority:
              formData.priority,
            assignee:
              formData.assignee
                .trim() ||
              undefined,
            hostingAccountId:
              formData.hostingAccountId ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<TicketMutationResponse>(
          response,
          "The ticket could not be opened.",
        );

      await reloadTickets();

      setSelectedTicket(
        result.ticket,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Ticket ${result.ticket.number} opened.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The ticket could not be opened.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function patchTicket(
    ticket: Ticket,
    changes: Record<string, unknown>,
    successMessage: string,
  ): Promise<void> {
    setUpdating(true);

    setStatus({
      message:
        "Updating ticket...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/tickets/${ticket.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(
            changes,
          ),
        },
      );

      const result =
        await getResponseData<TicketMutationResponse>(
          response,
          "The ticket could not be updated.",
        );

      await reloadTickets();

      setSelectedTicket(
        result.ticket,
      );

      setStatus({
        message: successMessage,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The ticket could not be updated.",
          ),
        type: "error",
      });
    } finally {
      setUpdating(false);
    }
  }

  async function handleStatusChange(
    ticket: Ticket,
    nextStatus: TicketStatus,
  ): Promise<void> {
    const changes: Record<
      string,
      unknown
    > = {
      status: nextStatus,
    };

    if (
      (nextStatus === "resolved" ||
        nextStatus === "closed") &&
      !ticket.resolvedDate
    ) {
      changes.resolvedDate =
        new Date().toISOString();
    }

    await patchTicket(
      ticket,
      changes,
      `Ticket ${ticket.number} marked ${formatLabel(
        nextStatus,
      )}.`,
    );
  }

  async function handlePriorityChange(
    ticket: Ticket,
    nextPriority: TicketPriority,
  ): Promise<void> {
    await patchTicket(
      ticket,
      { priority: nextPriority },
      `Ticket ${ticket.number} priority set to ${formatLabel(
        nextPriority,
      )}.`,
    );
  }

  async function runDiagnostics(
    ticket: Ticket,
  ): Promise<void> {
    if (!ticket.hostingAccountId) {
      return;
    }

    setDiagnosing(true);

    setAssessment(null);

    setStatus({
      message:
        "Diagnosing the linked hosting account...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/hosting/assist",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            accountId:
              ticket.hostingAccountId,
            ticketId: ticket.id,
          }),
        },
      );

      const result =
        await getResponseData<AssessmentResponse>(
          response,
          "The diagnosis could not be completed.",
        );

      setAssessment(
        result.assessment,
      );

      setStatus({
        message:
          "Diagnosis complete.",
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The diagnosis could not be completed.",
          ),
        type: "error",
      });
    } finally {
      setDiagnosing(false);
    }
  }

  async function handleDelete(
    ticket: Ticket,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/tickets/${ticket.id}`,
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
        "The ticket could not be deleted.",
      );
    }

    await reloadTickets();

    setSelectedTicket((current) =>
      current?.id === ticket.id
        ? null
        : current,
    );

    setStatus({
      message: `Ticket ${ticket.number} deleted.`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Support
          </p>

          <h3>
            Client Support Tickets
          </h3>

          <p className="help-text">
            Track client requests,
            prioritize work, and record
            resolutions. Human review
            remains the final authority
            on every ticket.
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
        aria-label="Support summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Tickets
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.total}
          </strong>

          <span className="metric-detail">
            All support requests
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Open
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.open}
          </strong>

          <span className="metric-detail">
            Needs attention
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            In Progress
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.inProgress}
          </strong>

          <span className="metric-detail">
            Being worked on
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Resolved
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.resolved}
          </strong>

          <span className="metric-detail">
            Resolved or closed
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Ticket
              </p>

              <h3>Open Ticket</h3>
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
              <label htmlFor="ticket-client">
                Client
              </label>

              <select
                id="ticket-client"
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
                required
              >
                <option value="">
                  Select a client
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

              {clients.length ===
                0 &&
                !loading && (
                  <p className="help-text">
                    Add a client in
                    Client Services
                    first.
                  </p>
                )}
            </div>

            <div className="form-group">
              <label htmlFor="ticket-subject">
                Subject
              </label>

              <input
                id="ticket-subject"
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
              <label htmlFor="ticket-description">
                Description
              </label>

              <textarea
                id="ticket-description"
                rows={4}
                value={
                  formData.description
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      description:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="ticket-priority">
                  Priority
                </label>

                <select
                  id="ticket-priority"
                  value={
                    formData.priority
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        priority:
                          event
                            .target
                            .value as TicketPriority,
                      }),
                    )
                  }
                >
                  {ticketPriorities.map(
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
                <label htmlFor="ticket-assignee">
                  Assignee
                </label>

                <input
                  id="ticket-assignee"
                  type="text"
                  value={
                    formData.assignee
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        assignee:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>
            </div>

            {hostingAccounts.length >
              0 && (
              <div className="form-group">
                <label htmlFor="ticket-hosting">
                  Hosting account
                  (for diagnostics)
                </label>

                <select
                  id="ticket-hosting"
                  value={
                    formData.hostingAccountId
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        hostingAccountId:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                >
                  <option value="">
                    Not linked
                  </option>

                  {hostingAccounts.map(
                    (account) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {
                          account.domain
                        }
                      </option>
                    ),
                  )}
                </select>
              </div>
            )}

            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating
                ? "Opening..."
                : "Open Ticket"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Queue
              </p>

              <h3>Tickets</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading tickets...
            </p>
          ) : tickets.length ===
            0 ? (
            <p className="help-text">
              No tickets yet. Open the
              first one to begin
              tracking client support.
            </p>
          ) : (
            <div className="record-list">
              {tickets.map(
                (ticket) => (
                  <button
                    type="button"
                    className="record-button"
                    key={ticket.id}
                    onClick={() =>
                      setSelectedTicket(
                        ticket,
                      )
                    }
                  >
                    <span className="record-title">
                      {
                        ticket.number
                      }{" "}
                      —{" "}
                      {ticket.subject}
                    </span>

                    <span className="record-detail">
                      <span
                        className={`ticket-status ticket-status-${ticket.status}`}
                      >
                        {formatLabel(
                          ticket.status,
                        )}
                      </span>{" "}
                      <span
                        className={`ticket-priority ticket-priority-${ticket.priority}`}
                      >
                        {formatLabel(
                          ticket.priority,
                        )}
                      </span>{" "}
                      ·{" "}
                      {clientNames.get(
                        ticket.clientId,
                      ) ??
                        "Unknown client"}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>

      {selectedTicket && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Ticket{" "}
                {
                  selectedTicket.number
                }
              </p>

              <h3>
                {
                  selectedTicket.subject
                }
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedTicket(
                  null,
                )
              }
            >
              Close
            </button>
          </div>

          <div className="client-overview">
            <div className="client-overview-item">
              <span>Client</span>

              <strong>
                {clientNames.get(
                  selectedTicket.clientId,
                ) ??
                  "Unknown client"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Status</span>

              <strong>
                {formatLabel(
                  selectedTicket.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Priority</span>

              <strong>
                {formatLabel(
                  selectedTicket.priority,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Assignee</span>

              <strong>
                {selectedTicket.assignee ||
                  "Unassigned"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Opened</span>

              <strong>
                {formatDate(
                  selectedTicket.createdAt,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Resolved</span>

              <strong>
                {formatDate(
                  selectedTicket.resolvedDate,
                )}
              </strong>
            </div>
          </div>

          {selectedTicket.description && (
            <p className="client-notes">
              {
                selectedTicket.description
              }
            </p>
          )}

          {selectedTicket.resolution && (
            <p className="client-notes">
              <strong>
                Resolution:
              </strong>{" "}
              {
                selectedTicket.resolution
              }
            </p>
          )}

          {selectedTicket.hostingAccountId && (
            <>
              <div className="section-divider" />

              <div className="card-heading">
                <div>
                  <p className="eyebrow">
                    AI Hosting Assistant
                  </p>

                  <h4>
                    Diagnose Linked
                    Server
                  </h4>
                </div>

                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    diagnosing
                  }
                  onClick={() =>
                    void runDiagnostics(
                      selectedTicket,
                    )
                  }
                >
                  {diagnosing
                    ? "Diagnosing..."
                    : "Run Diagnostics"}
                </button>
              </div>

              {assessment && (
                <div className="assessment">
                  <p className="help-text">
                    {
                      assessment.summary
                    }
                  </p>

                  {assessment.findings
                    .length > 0 && (
                    <div className="record-list">
                      {assessment.findings.map(
                        (
                          finding,
                          index,
                        ) => (
                          <div
                            className="finding"
                            key={index}
                          >
                            <span
                              className={`finding-severity finding-severity-${finding.severity}`}
                            >
                              {
                                finding.severity
                              }
                            </span>{" "}
                            {
                              finding.message
                            }
                          </div>
                        ),
                      )}
                    </div>
                  )}

                  <div className="assessment-recommendation">
                    <p className="eyebrow">
                      {assessment.aiGenerated
                        ? "AI recommendation — human approval required"
                        : "Recommendation — human approval required"}
                    </p>

                    <pre>
                      {
                        assessment.recommendation
                      }
                    </pre>
                  </div>
                </div>
              )}
            </>
          )}

          <div className="section-divider" />

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ticket-status-update">
                Update status
              </label>

              <select
                id="ticket-status-update"
                value={
                  selectedTicket.status
                }
                disabled={updating}
                onChange={(event) =>
                  void handleStatusChange(
                    selectedTicket,
                    event.target
                      .value as TicketStatus,
                  )
                }
              >
                {ticketStatuses.map(
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
              <label htmlFor="ticket-priority-update">
                Update priority
              </label>

              <select
                id="ticket-priority-update"
                value={
                  selectedTicket.priority
                }
                disabled={updating}
                onChange={(event) =>
                  void handlePriorityChange(
                    selectedTicket,
                    event.target
                      .value as TicketPriority,
                  )
                }
              >
                {ticketPriorities.map(
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
          </div>

          <ConfirmDeleteButton
            recordName={`ticket ${selectedTicket.number}`}
            onDelete={() =>
              handleDelete(
                selectedTicket,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
