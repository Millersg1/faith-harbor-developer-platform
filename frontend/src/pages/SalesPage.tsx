import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "proposal"
  | "won"
  | "lost";

const leadStatuses: readonly LeadStatus[] =
  [
    "new",
    "contacted",
    "qualified",
    "proposal",
    "won",
    "lost",
  ];

const openStatuses: readonly LeadStatus[] =
  [
    "new",
    "contacted",
    "qualified",
    "proposal",
  ];

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface Lead {
  id: string;
  clientId?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  serviceInterest?: string;
  estimatedValue?: number;
  status: LeadStatus;
  owner?: string;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface LeadsResponse {
  count: number;
  leads: Lead[];
}

interface LeadMutationResponse {
  success: boolean;
  status: LeadStatus;
  lead: Lead;
}

interface LeadFormData {
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  serviceInterest: string;
  estimatedValue: string;
  status: LeadStatus;
  owner: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  LeadFormData = {
    name: "",
    company: "",
    email: "",
    phone: "",
    source: "",
    serviceInterest: "",
    estimatedValue: "",
    status: "new",
    owner: "",
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

function formatMoney(
  value?: number,
): string {
  if (
    value === undefined ||
    Number.isNaN(value)
  ) {
    return "$0";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    },
  ).format(value);
}

function isOpen(
  status: LeadStatus,
): boolean {
  return openStatuses.includes(
    status,
  );
}

async function requestLeads():
Promise<LeadsResponse> {
  const response = await fetch(
    "/api/v1/leads",
  );

  return getResponseData<LeadsResponse>(
    response,
    "Leads could not be loaded.",
  );
}

export default function SalesPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [leads, setLeads] =
    useState<Lead[]>([]);

  const [
    selectedLead,
    setSelectedLead,
  ] = useState<Lead | null>(null);

  const [formData, setFormData] =
    useState<LeadFormData>(
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
      fetch("/api/v1/clients").then(
        (response) =>
          getResponseData<ClientsResponse>(
            response,
            "Clients could not be loaded.",
          ),
      ),
      requestLeads(),
    ])
      .then(
        ([
          clientsResult,
          leadsResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setLeads(
            leadsResult.leads,
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
              "Sales information could not be loaded.",
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
    let open = 0;
    let won = 0;
    let pipelineValue = 0;
    let wonValue = 0;

    for (const lead of leads) {
      if (isOpen(lead.status)) {
        open += 1;
        pipelineValue +=
          lead.estimatedValue ?? 0;
      }

      if (
        lead.status === "won"
      ) {
        won += 1;
        wonValue +=
          lead.estimatedValue ?? 0;
      }
    }

    return {
      total: leads.length,
      open,
      won,
      pipelineValue,
      wonValue,
    };
  }, [leads]);

  async function reloadLeads():
  Promise<void> {
    const result =
      await requestLeads();

    setLeads(result.leads);
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!formData.name.trim()) {
      setStatus({
        message:
          "A lead name is required.",
        type: "error",
      });

      return;
    }

    const estimatedValue =
      formData.estimatedValue.trim()
        ? Number(
            formData.estimatedValue,
          )
        : undefined;

    if (
      estimatedValue !== undefined &&
      (Number.isNaN(
        estimatedValue,
      ) ||
        estimatedValue < 0)
    ) {
      setStatus({
        message:
          "Estimated value must be a non-negative number.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message: "Adding lead...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/leads",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name:
              formData.name.trim(),
            company:
              formData.company
                .trim() ||
              undefined,
            email:
              formData.email
                .trim() ||
              undefined,
            phone:
              formData.phone
                .trim() ||
              undefined,
            source:
              formData.source
                .trim() ||
              undefined,
            serviceInterest:
              formData.serviceInterest
                .trim() ||
              undefined,
            estimatedValue,
            status:
              formData.status,
            owner:
              formData.owner
                .trim() ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<LeadMutationResponse>(
          response,
          "The lead could not be added.",
        );

      await reloadLeads();

      setSelectedLead(
        result.lead,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Added ${result.lead.name}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The lead could not be added.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    lead: Lead,
    nextStatus: LeadStatus,
  ): Promise<void> {
    setStatus({
      message: "Updating lead...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/leads/${lead.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            status: nextStatus,
          }),
        },
      );

      const result =
        await getResponseData<LeadMutationResponse>(
          response,
          "The lead could not be updated.",
        );

      await reloadLeads();

      setSelectedLead(
        result.lead,
      );

      setStatus({
        message: `${result.lead.name} moved to ${formatLabel(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The lead could not be updated.",
          ),
        type: "error",
      });
    }
  }

  async function handleDelete(
    lead: Lead,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/leads/${lead.id}`,
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
        "The lead could not be deleted.",
      );
    }

    await reloadLeads();

    setSelectedLead((current) =>
      current?.id === lead.id
        ? null
        : current,
    );

    setStatus({
      message: `Removed ${lead.name}.`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Sales
          </p>

          <h3>
            Leads & Opportunities
          </h3>

          <p className="help-text">
            Track opportunities from
            first contact through the
            pipeline. Won leads become
            clients in Client Services.
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
        aria-label="Sales summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Leads
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.total}
          </strong>

          <span className="metric-detail">
            All opportunities
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
            Active in the pipeline
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Pipeline Value
          </span>

          <strong className="metric-value metric-word">
            {loading
              ? "..."
              : formatMoney(
                  metrics.pipelineValue,
                )}
          </strong>

          <span className="metric-detail">
            Estimated open value
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Won
          </span>

          <strong className="metric-value metric-word">
            {loading
              ? "..."
              : formatMoney(
                  metrics.wonValue,
                )}
          </strong>

          <span className="metric-detail">
            {metrics.won} closed won
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Opportunity
              </p>

              <h3>Add Lead</h3>
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
              <label htmlFor="lead-name">
                Name
              </label>

              <input
                id="lead-name"
                type="text"
                value={
                  formData.name
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      name:
                        event.target
                          .value,
                    }),
                  )
                }
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="lead-company">
                  Company
                </label>

                <input
                  id="lead-company"
                  type="text"
                  value={
                    formData.company
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        company:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="lead-source">
                  Source
                </label>

                <input
                  id="lead-source"
                  type="text"
                  placeholder="Referral / Website / Event"
                  value={
                    formData.source
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        source:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="lead-email">
                  Email
                </label>

                <input
                  id="lead-email"
                  type="email"
                  value={
                    formData.email
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        email:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="lead-phone">
                  Phone
                </label>

                <input
                  id="lead-phone"
                  type="text"
                  value={
                    formData.phone
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        phone:
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
              <label htmlFor="lead-service">
                Service interest
              </label>

              <input
                id="lead-service"
                type="text"
                value={
                  formData.serviceInterest
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      serviceInterest:
                        event.target
                          .value,
                    }),
                  )
                }
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="lead-value">
                  Estimated value
                </label>

                <input
                  id="lead-value"
                  type="number"
                  min="0"
                  step="1"
                  value={
                    formData.estimatedValue
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        estimatedValue:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="lead-status">
                  Stage
                </label>

                <select
                  id="lead-status"
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
                            .value as LeadStatus,
                      }),
                    )
                  }
                >
                  {leadStatuses.map(
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

            <button
              type="submit"
              className="primary-button"
              disabled={creating}
            >
              {creating
                ? "Saving..."
                : "Add Lead"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Pipeline
              </p>

              <h3>Leads</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading leads...
            </p>
          ) : leads.length === 0 ? (
            <p className="help-text">
              No leads yet. Add the
              first opportunity to
              start your pipeline.
            </p>
          ) : (
            <div className="record-list">
              {leads.map((lead) => (
                <button
                  type="button"
                  className="record-button"
                  key={lead.id}
                  onClick={() =>
                    setSelectedLead(
                      lead,
                    )
                  }
                >
                  <span className="record-title">
                    {lead.name}
                    {lead.company
                      ? ` — ${lead.company}`
                      : ""}
                  </span>

                  <span className="record-detail">
                    <span
                      className={`lead-status lead-status-${lead.status}`}
                    >
                      {formatLabel(
                        lead.status,
                      )}
                    </span>{" "}
                    {formatMoney(
                      lead.estimatedValue,
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedLead && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {selectedLead.company ||
                  "Lead"}
              </p>

              <h3>
                {selectedLead.name}
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedLead(null)
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
                  selectedLead.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Value</span>

              <strong>
                {formatMoney(
                  selectedLead.estimatedValue,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Source</span>

              <strong>
                {selectedLead.source ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Service</span>

              <strong>
                {selectedLead.serviceInterest ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Email</span>

              <strong>
                {selectedLead.email ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Client</span>

              <strong>
                {selectedLead.clientId
                  ? clientNames.get(
                      selectedLead.clientId,
                    ) ?? "Client"
                  : "Not linked"}
              </strong>
            </div>
          </div>

          {selectedLead.notes && (
            <p className="client-notes">
              {selectedLead.notes}
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="lead-status-update">
              Move to stage
            </label>

            <select
              id="lead-status-update"
              value={
                selectedLead.status
              }
              onChange={(event) =>
                void handleStatusChange(
                  selectedLead,
                  event.target
                    .value as LeadStatus,
                )
              }
            >
              {leadStatuses.map(
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
            recordName={selectedLead.name}
            onDelete={() =>
              handleDelete(
                selectedLead,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
