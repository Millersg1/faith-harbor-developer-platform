import {
  useEffect,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";
import {
  useNavigate,
} from "react-router-dom";
import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type StatusType =
  | "working"
  | "success"
  | "error";

interface StatusMessage {
  message: string;
  type: StatusType;
}

interface Client {
  id: string;
  companyName: string;
  primaryContact: string;
  email?: string;
  phone?: string;
  website?: string;
  industry?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

interface Proposal {
  id: string;
  clientName: string;
  service: string;
  status: string;
  createdAt: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface ClientWorkspaceResponse {
  client: Client;
  proposals: Proposal[];
}

interface ClientFormData {
  companyName: string;
  primaryContact: string;
  email: string;
  phone: string;
  website: string;
  industry: string;
  notes: string;
}

const emptyForm:
  ClientFormData = {
    companyName: "",
    primaryContact: "",
    email: "",
    phone: "",
    website: "",
    industry: "",
    notes: "",
  };

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

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
    throw new Error(
      response.ok
        ? "The server returned an empty response."
        : fallbackMessage,
    );
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

    throw new Error(
      fallbackMessage,
    );
  }

  return result as T;
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

export default function ClientsPage() {
  const navigate = useNavigate();

  const [clients, setClients] =
    useState<Client[]>([]);

  const [
    selectedWorkspace,
    setSelectedWorkspace,
  ] =
    useState<ClientWorkspaceResponse | null>(
      null,
    );

  const [formData, setFormData] =
    useState<ClientFormData>(
      emptyForm,
    );

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [
    loadingClients,
    setLoadingClients,
  ] = useState(true);

  const [
    loadingWorkspace,
    setLoadingWorkspace,
  ] = useState(false);

  const [
    creatingClient,
    setCreatingClient,
  ] = useState(false);

  useEffect(() => {
    let requestCancelled = false;

    requestClients()
      .then((result) => {
        if (requestCancelled) {
          return;
        }

        setClients(
          result.clients,
        );
      })
      .catch(
        (error: unknown) => {
          if (requestCancelled) {
            return;
          }

          setStatus({
            message:
              getErrorMessage(
                error,
                "Clients could not be loaded.",
              ),

            type: "error",
          });
        },
      )
      .finally(() => {
        if (requestCancelled) {
          return;
        }

        setLoadingClients(false);
      });

    return () => {
      requestCancelled = true;
    };
  }, []);

  async function loadClients():
  Promise<void> {
    setLoadingClients(true);

    try {
      const result =
        await requestClients();

      setClients(
        result.clients,
      );
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Clients could not be loaded.",
        ),

        type: "error",
      });
    } finally {
      setLoadingClients(false);
    }
  }

  function refreshClients(): void {
    setStatus(null);

    void loadClients();
  }

  function updateFormField(
    field:
      keyof ClientFormData,
    value: string,
  ): void {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function openClientWorkspace(
    clientId: string,
  ): Promise<void> {
    setLoadingWorkspace(true);
    setStatus(null);

    try {
      const response = await fetch(
        `/api/v1/clients/${clientId}/workspace`,
      );

      const workspace =
        await getResponseData<ClientWorkspaceResponse>(
          response,
          "Client workspace could not be opened.",
        );

      setSelectedWorkspace(
        workspace,
      );
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Client workspace could not be opened.",
        ),

        type: "error",
      });
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function handleSubmit(
    event:
      SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const companyName =
      formData.companyName.trim();

    const primaryContact =
      formData.primaryContact
        .trim();

    if (
      !companyName ||
      !primaryContact
    ) {
      setStatus({
        message:
          "Please enter the company name and primary contact.",

        type: "error",
      });

      return;
    }

    setCreatingClient(true);

    setStatus({
      message:
        "Creating client...",

      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/clients",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            companyName,

            primaryContact,

            email:
              formData.email
                .trim() ||
              undefined,

            phone:
              formData.phone
                .trim() ||
              undefined,

            website:
              formData.website
                .trim() ||
              undefined,

            industry:
              formData.industry
                .trim() ||
              undefined,

            notes:
              formData.notes
                .trim() ||
              undefined,
          }),
        },
      );

      const client =
        await getResponseData<Client>(
          response,
          "Client creation failed.",
        );

      setFormData(emptyForm);

      setStatus({
        message:
          "Client created successfully.",

        type: "success",
      });

      await loadClients();

      await openClientWorkspace(
        client.id,
      );
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Client creation failed.",
        ),

        type: "error",
      });
    } finally {
      setCreatingClient(false);
    }
  }

  async function deleteSelectedClient():
  Promise<void> {
    if (!selectedWorkspace) {
      return;
    }

    const clientId =
      selectedWorkspace.client.id;

    const companyName =
      selectedWorkspace.client
        .companyName;

    try {
      const response = await fetch(
        `/api/v1/clients/${clientId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const responseText =
          await response.text();

        let message =
          "The client could not be deleted.";

        if (responseText.trim()) {
          try {
            const result =
              JSON.parse(
                responseText,
              ) as {
                error?: {
                  message?: string;
                };
              };

            message =
              result.error
                ?.message ??
              message;
          } catch {
            message =
              responseText;
          }
        }

        throw new Error(message);
      }

      setSelectedWorkspace(null);

      setClients((current) =>
        current.filter(
          (client) =>
            client.id !==
            clientId,
        ),
      );

      setStatus({
        message:
          `Client "${companyName}" was deleted permanently.`,

        type: "success",
      });
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "The client could not be deleted.",
        ),

        type: "error",
      });

      throw error;
    }
  }

  function startProposal(): void {
    if (!selectedWorkspace) {
      return;
    }

    navigate("/proposals", {
      state: {
        clientName:
          selectedWorkspace.client
            .companyName,

        clientId:
          selectedWorkspace.client.id,
      },
    });
  }

  function openProposal(
    proposalId: string,
  ): void {
    navigate("/proposals", {
      state: {
        proposalId,
      },
    });
  }

  const selectedClient =
    selectedWorkspace?.client;

  return (
    <section
      className="workspace active"
      id="clients-workspace"
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Relationship Management
          </p>

          <h2>Clients</h2>

          <p className="help-text">
            Manage client relationships,
            contact information,
            proposals, and active
            workspaces.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={
            refreshClients
          }
          disabled={
            loadingClients
          }
        >
          {loadingClients
            ? "Refreshing..."
            : "Refresh Clients"}
        </button>
      </div>

      {status && (
        <div
          className={`status-message ${status.type}`}
          role={
            status.type === "error"
              ? "alert"
              : "status"
          }
        >
          {status.message}
        </div>
      )}

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Relationship
              </p>

              <h3>Add Client</h3>
            </div>
          </div>

          <form
            id="client-form"
            onSubmit={handleSubmit}
          >
            <div className="form-group">
              <label htmlFor="client-company-name">
                Company Name
              </label>

              <input
                id="client-company-name"
                type="text"
                value={
                  formData.companyName
                }
                onChange={(event) =>
                  updateFormField(
                    "companyName",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="client-primary-contact">
                Primary Contact
              </label>

              <input
                id="client-primary-contact"
                type="text"
                value={
                  formData.primaryContact
                }
                onChange={(event) =>
                  updateFormField(
                    "primaryContact",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="client-email">
                  Email
                </label>

                <input
                  id="client-email"
                  type="email"
                  value={
                    formData.email
                  }
                  onChange={(event) =>
                    updateFormField(
                      "email",
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="client-phone">
                  Phone
                </label>

                <input
                  id="client-phone"
                  type="tel"
                  value={
                    formData.phone
                  }
                  onChange={(event) =>
                    updateFormField(
                      "phone",
                      event.target.value,
                    )
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="client-website">
                Website
              </label>

              <input
                id="client-website"
                type="url"
                placeholder="https://example.com"
                value={
                  formData.website
                }
                onChange={(event) =>
                  updateFormField(
                    "website",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="client-industry">
                Industry
              </label>

              <input
                id="client-industry"
                type="text"
                value={
                  formData.industry
                }
                onChange={(event) =>
                  updateFormField(
                    "industry",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="client-notes">
                Notes
              </label>

              <textarea
                id="client-notes"
                rows={5}
                value={
                  formData.notes
                }
                onChange={(event) =>
                  updateFormField(
                    "notes",
                    event.target.value,
                  )
                }
              />
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={
                creatingClient
              }
            >
              {creatingClient
                ? "Creating Client..."
                : "Add Client"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Client Directory
              </p>

              <h3>
                Existing Clients
                {!loadingClients &&
                  ` (${clients.length})`}
              </h3>
            </div>
          </div>

          <div
            id="client-list"
            className="record-list"
          >
            {loadingClients && (
              <p>
                Loading clients...
              </p>
            )}

            {!loadingClients &&
              clients.length === 0 && (
                <p>
                  No clients have been
                  created yet.
                </p>
              )}

            {!loadingClients &&
              clients.map(
                (client) => (
                  <button
                    key={client.id}
                    type="button"
                    className={`record-button ${
                      selectedClient?.id ===
                      client.id
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      void openClientWorkspace(
                        client.id,
                      )
                    }
                  >
                    <span className="record-title">
                      {
                        client.companyName
                      }
                    </span>

                    <span className="record-detail">
                      {[
                        client.primaryContact,
                        client.industry,
                        formatDate(
                          client.createdAt,
                        ),
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </span>
                  </button>
                ),
              )}
          </div>
        </section>
      </div>

      {loadingWorkspace && (
        <section className="card">
          <p>
            Loading client workspace...
          </p>
        </section>
      )}

      {!loadingWorkspace &&
        selectedWorkspace && (
          <section
            id="client-workspace-card"
            className="card client-workspace-card"
          >
            <div className="card-heading">
              <div>
                <p className="eyebrow">
                  Client Workspace
                </p>

                <h3 id="client-workspace-name">
                  {
                    selectedWorkspace
                      .client.companyName
                  }
                </h3>
              </div>

              <button
                id="client-workspace-new-proposal"
                type="button"
                className="primary-button"
                onClick={
                  startProposal
                }
              >
                New Proposal
              </button>
            </div>

            <div
              id="client-overview"
              className="client-overview"
            >
              <div className="client-overview-item">
                <span>
                  Primary Contact
                </span>

                <strong>
                  {
                    selectedWorkspace
                      .client
                      .primaryContact
                  }
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Email</span>

                <strong>
                  {selectedWorkspace
                    .client.email ||
                    "Not provided"}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Phone</span>

                <strong>
                  {selectedWorkspace
                    .client.phone ||
                    "Not provided"}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Website</span>

                <strong>
                  {selectedWorkspace
                    .client.website ||
                    "Not provided"}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Industry</span>

                <strong>
                  {selectedWorkspace
                    .client.industry ||
                    "Not provided"}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Created</span>

                <strong>
                  {formatDate(
                    selectedWorkspace
                      .client.createdAt,
                  )}
                </strong>
              </div>
            </div>

            {selectedWorkspace.client
              .notes && (
              <div className="client-notes">
                <h4>
                  Client Notes
                </h4>

                <p>
                  {
                    selectedWorkspace
                      .client.notes
                  }
                </p>
              </div>
            )}

            <div className="client-proposals">
              <h4>
                Client Proposals
              </h4>

              <div
                id="client-proposal-list"
                className="record-list"
              >
                {selectedWorkspace
                  .proposals.length ===
                  0 && (
                  <p>
                    No proposals have
                    been saved for this
                    client yet.
                  </p>
                )}

                {selectedWorkspace.proposals.map(
                  (proposal) => (
                    <button
                      key={
                        proposal.id
                      }
                      type="button"
                      className="record-button"
                      onClick={() =>
                        openProposal(
                          proposal.id,
                        )
                      }
                    >
                      <span className="record-title">
                        {
                          proposal.service
                        }
                      </span>

                      <span className="record-detail">
                        {
                          proposal.status
                        }{" "}
                        •{" "}
                        {formatDate(
                          proposal.createdAt,
                        )}
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="section-divider" />

            <div>
              <p className="eyebrow">
                Danger Zone
              </p>

              <h4>Delete Client</h4>

              <p className="help-text">
                Permanently remove this
                client from Faith Harbor
                OS. Clients with attached
                proposals or projects
                cannot be deleted.
              </p>

              <ConfirmDeleteButton
                recordName={
                  selectedWorkspace
                    .client.companyName
                }
                onDelete={
                  deleteSelectedClient
                }
              />
            </div>
          </section>
        )}
    </section>
  );
}