import {
  useEffect,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";
import {
  useLocation,
} from "react-router-dom";
import ConfirmDeleteButton from "../components/ConfirmDeleteButton";
import DocumentExportButtons from "../components/DocumentExportButtons";
import type {
  ExportDocumentData,
} from "../utils/documentExport";

type StatusType =
  | "working"
  | "success"
  | "error";

interface StatusMessage {
  message: string;
  type?: StatusType;
}

interface Proposal {
  id: string;
  clientId?: string;
  clientName: string;
  service: string;
  status: string;
  proposal: string;
  requestedOutcome?: string;
  requirements?: string;
  dueDate?: string;
  metadata?: {
    service?: string;
    additionalNotes?: string;
  };
  createdAt: string;
  updatedAt?: string;
}

interface ProposalFormData {
  service: string;
  customService: string;
  clientName: string;
  requestedOutcome: string;
  requirements: string;
  dueDate: string;
  additionalNotes: string;
}

interface ProposalsResponse {
  count?: number;
  proposals: Proposal[];
}

interface CreateProposalResponse {
  proposal: Proposal;
}

interface ProposalRouteState {
  clientId?: string;
  clientName?: string;
  proposalId?: string;
}

const serviceOptions = [
  "Managed IT Services",
  "Website Development",
  "AI Consulting",
  "Business Automation",
  "Proposal Writing",
  "Book Publishing",
  "Marketing Services",
  "Custom Service",
];

function getInitialForm(
  clientName = "",
): ProposalFormData {
  return {
    service: "",
    customService: "",
    clientName,
    requestedOutcome: "",
    requirements: "",
    dueDate: "",
    additionalNotes: "",
  };
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

async function requestProposals():
Promise<ProposalsResponse> {
  const response = await fetch(
    "/api/v1/proposals",
  );

  return getResponseData<ProposalsResponse>(
    response,
    "Saved proposals could not be loaded.",
  );
}

async function requestProposal(
  proposalId: string,
): Promise<Proposal> {
  const response = await fetch(
    `/api/v1/proposals/${proposalId}`,
  );

  return getResponseData<Proposal>(
    response,
    "The proposal could not be opened.",
  );
}

function buildProposalDocument(
  proposal: Proposal | null,
): ExportDocumentData | null {
  if (!proposal?.proposal) {
    return null;
  }

  const service =
    proposal.service ??
    proposal.metadata?.service ??
    "Client Services";

  const metadata = [
    {
      label: "Client",
      value: proposal.clientName,
    },
    {
      label: "Service",
      value: service,
    },
    {
      label: "Status",
      value: proposal.status,
    },
    {
      label: "Proposal ID",
      value: proposal.id,
    },
    {
      label: "Created",
      value: formatDate(
        proposal.createdAt,
      ),
    },
  ];

  if (proposal.dueDate) {
    metadata.push({
      label:
        "Requested Delivery",

      value: proposal.dueDate,
    });
  }

  return {
    title:
      `Proposal for ${proposal.clientName}`,

    subtitle: service,

    filename:
      `${proposal.clientName} - ${service} Proposal`,

    metadata,

    sections: [
      {
        heading: "Proposal",

        paragraphs: [
          proposal.proposal,
        ],
      },
    ],
  };
}

export default function ProposalsPage() {
  const location = useLocation();

  const routeState =
    location.state as
      | ProposalRouteState
      | null;

  const [formData, setFormData] =
    useState<ProposalFormData>(
      () =>
        getInitialForm(
          routeState
            ?.clientName ?? "",
        ),
    );

  const [
    savedProposals,
    setSavedProposals,
  ] = useState<Proposal[]>([]);

  const [
    selectedProposal,
    setSelectedProposal,
  ] = useState<Proposal | null>(
    null,
  );

  const [status, setStatus] =
    useState<StatusMessage>({
      message:
        "Complete the form to generate a proposal.",
    });

  const [
    loadingProposals,
    setLoadingProposals,
  ] = useState(true);

  const [
    generatingProposal,
    setGeneratingProposal,
  ] = useState(false);

  const [
    loadingProposal,
    setLoadingProposal,
  ] = useState(false);

  const [
    creatingProject,
    setCreatingProject,
  ] = useState(false);

  async function startProjectFromProposal(
    proposal: Proposal,
  ): Promise<void> {
    if (!proposal.clientId) {
      setStatus({
        message:
          "This proposal is not linked to a client, so a project cannot be started.",
        type: "error",
      });

      return;
    }

    setCreatingProject(true);

    setStatus({
      message:
        "Starting a project from this proposal...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/projects/from-proposal",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            proposalId:
              proposal.id,
            clientId:
              proposal.clientId,
            service:
              proposal.service,
            requestedOutcome:
              proposal.requestedOutcome,
          }),
        },
      );

      if (!response.ok) {
        throw new Error(
          "The project could not be created.",
        );
      }

      setStatus({
        message:
          "Project created. Find it in the Projects workspace.",
        type: "success",
      });
    } catch {
      setStatus({
        message:
          "The project could not be created from this proposal.",
        type: "error",
      });
    } finally {
      setCreatingProject(false);
    }
  }

  useEffect(() => {
    let requestCancelled = false;

    requestProposals()
      .then((result) => {
        if (requestCancelled) {
          return;
        }

        setSavedProposals(
          result.proposals,
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
                "Saved proposals could not be loaded.",
              ),

            type: "error",
          });
        },
      )
      .finally(() => {
        if (requestCancelled) {
          return;
        }

        setLoadingProposals(
          false,
        );
      });

    return () => {
      requestCancelled = true;
    };
  }, []);

  useEffect(() => {
    const proposalId =
      routeState?.proposalId;

    if (!proposalId) {
      return;
    }

    let requestCancelled = false;

    requestProposal(proposalId)
      .then((proposal) => {
        if (requestCancelled) {
          return;
        }

        setSelectedProposal(
          proposal,
        );

        setStatus({
          message:
            "Saved proposal opened.",

          type: "success",
        });
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
                "The proposal could not be opened.",
              ),

            type: "error",
          });
        },
      );

    return () => {
      requestCancelled = true;
    };
  }, [routeState?.proposalId]);

  function updateFormField(
    field:
      keyof ProposalFormData,
    value: string,
  ): void {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function handleServiceChange(
    service: string,
  ): void {
    setFormData((current) => {
      const requestedOutcome =
        current.requestedOutcome
          .trim()
          ? current.requestedOutcome
          : service &&
              service !==
                "Custom Service"
            ? `Prepare a ${service} proposal`
            : "";

      return {
        ...current,

        service,

        customService:
          service ===
          "Custom Service"
            ? current.customService
            : "",

        requestedOutcome,
      };
    });
  }

  async function loadSavedProposals():
  Promise<void> {
    setLoadingProposals(true);

    try {
      const result =
        await requestProposals();

      setSavedProposals(
        result.proposals,
      );
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Saved proposals could not be loaded.",
        ),

        type: "error",
      });
    } finally {
      setLoadingProposals(false);
    }
  }

  function refreshProposals(): void {
    setStatus({
      message:
        "Refreshing saved proposals...",

      type: "working",
    });

    void loadSavedProposals();
  }

  async function openSavedProposal(
    proposalId: string,
  ): Promise<void> {
    setLoadingProposal(true);

    setStatus({
      message:
        "Opening saved proposal...",

      type: "working",
    });

    try {
      const proposal =
        await requestProposal(
          proposalId,
        );

      setSelectedProposal(
        proposal,
      );

      setStatus({
        message:
          "Saved proposal opened.",

        type: "success",
      });

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "The proposal could not be opened.",
        ),

        type: "error",
      });
    } finally {
      setLoadingProposal(false);
    }
  }

  async function handleSubmit(
    event:
      SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const selectedService =
      formData.service ===
      "Custom Service"
        ? formData.customService
            .trim()
        : formData.service;

    const clientName =
      formData.clientName.trim();

    const requestedOutcome =
      formData.requestedOutcome
        .trim();

    const requirements =
      formData.requirements.trim();

    if (
      !selectedService ||
      !clientName ||
      !requestedOutcome ||
      !requirements
    ) {
      setStatus({
        message:
          "Please complete all required fields.",

        type: "error",
      });

      return;
    }

    setGeneratingProposal(true);
    setSelectedProposal(null);

    setStatus({
      message:
        "Faith Harbor OS is preparing and saving the proposal. Local AI generation may take a minute.",

      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/proposals",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            clientName,

            requestedOutcome,

            requirements,

            dueDate:
              formData.dueDate ||
              undefined,

            metadata: {
              service:
                selectedService,

              additionalNotes:
                formData
                  .additionalNotes
                  .trim() ||
                undefined,
            },
          }),
        },
      );

      const result =
        await getResponseData<CreateProposalResponse>(
          response,
          "Proposal generation failed.",
        );

      setSelectedProposal(
        result.proposal,
      );

      setStatus({
        message:
          "Proposal draft generated and saved. Review and approve it before sending it to the client.",

        type: "success",
      });

      await loadSavedProposals();
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Proposal generation failed.",
        ),

        type: "error",
      });
    } finally {
      setGeneratingProposal(
        false,
      );
    }
  }

  async function deleteSelectedProposal():
  Promise<void> {
    if (!selectedProposal) {
      return;
    }

    const proposalId =
      selectedProposal.id;

    const proposalName =
      `${selectedProposal.clientName} — ${selectedProposal.service}`;

    try {
      const response = await fetch(
        `/api/v1/proposals/${proposalId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const responseText =
          await response.text();

        let message =
          "The proposal could not be deleted.";

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

      setSelectedProposal(null);

      setSavedProposals(
        (current) =>
          current.filter(
            (proposal) =>
              proposal.id !==
              proposalId,
          ),
      );

      setStatus({
        message:
          `Proposal "${proposalName}" was deleted permanently.`,

        type: "success",
      });
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "The proposal could not be deleted.",
        ),

        type: "error",
      });

      throw error;
    }
  }

  function handleExportStatus(
    message: string,
    type:
      | "success"
      | "error",
  ): void {
    setStatus({
      message,
      type,
    });
  }

  const selectedService =
    formData.service ===
    "Custom Service"
      ? formData.customService
      : formData.service;

  const proposalDocument =
    buildProposalDocument(
      selectedProposal,
    );

  return (
    <section
      className="workspace active"
      id="proposals-workspace"
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Client Delivery
          </p>

          <h3>Proposals</h3>

          <p className="help-text">
            Generate, save, reopen,
            review, export, and safely
            remove client proposal
            drafts.
          </p>
        </div>
      </div>

      <div className="proposal-layout">
        <section className="card">
          <p className="eyebrow">
            Proposal Generator
          </p>

          <h3>
            Generate a Proposal
          </h3>

          <form
            id="proposal-form"
            onSubmit={handleSubmit}
          >
            <div className="form-group">
              <label htmlFor="service">
                Service
              </label>

              <select
                id="service"
                value={
                  formData.service
                }
                onChange={(event) =>
                  handleServiceChange(
                    event.target.value,
                  )
                }
                required
              >
                <option value="">
                  Select a service
                </option>

                {serviceOptions.map(
                  (service) => (
                    <option
                      key={service}
                      value={service}
                    >
                      {service}
                    </option>
                  ),
                )}
              </select>
            </div>

            {formData.service ===
              "Custom Service" && (
              <div
                className="form-group"
                id="custom-service-group"
              >
                <label htmlFor="custom-service">
                  Custom service name
                </label>

                <input
                  id="custom-service"
                  type="text"
                  value={
                    formData.customService
                  }
                  onChange={(event) =>
                    updateFormField(
                      "customService",
                      event.target.value,
                    )
                  }
                  required
                />
              </div>
            )}

            <div className="form-group">
              <label htmlFor="client-name">
                Client name
              </label>

              <input
                id="client-name"
                type="text"
                value={
                  formData.clientName
                }
                onChange={(event) =>
                  updateFormField(
                    "clientName",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="requested-outcome">
                Requested outcome
              </label>

              <input
                id="requested-outcome"
                type="text"
                value={
                  formData.requestedOutcome
                }
                onChange={(event) =>
                  updateFormField(
                    "requestedOutcome",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="requirements">
                Requirements and
                discovery notes
              </label>

              <textarea
                id="requirements"
                rows={10}
                value={
                  formData.requirements
                }
                onChange={(event) =>
                  updateFormField(
                    "requirements",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="due-date">
                Requested delivery date
              </label>

              <input
                id="due-date"
                type="date"
                value={
                  formData.dueDate
                }
                onChange={(event) =>
                  updateFormField(
                    "dueDate",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="additional-notes">
                Additional notes
              </label>

              <textarea
                id="additional-notes"
                rows={4}
                value={
                  formData.additionalNotes
                }
                onChange={(event) =>
                  updateFormField(
                    "additionalNotes",
                    event.target.value,
                  )
                }
              />
            </div>

            <button
              className="primary-button"
              id="generate-proposal"
              type="submit"
              disabled={
                generatingProposal
              }
            >
              {generatingProposal
                ? "Generating Proposal..."
                : "Generate Proposal"}
            </button>
          </form>
        </section>

        <section className="card proposal-preview">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Draft Deliverable
              </p>

              <h3>
                Proposal Preview
              </h3>
            </div>
          </div>

          <DocumentExportButtons
            documentData={
              proposalDocument
            }
            disabled={
              loadingProposal ||
              generatingProposal
            }
            onStatus={
              handleExportStatus
            }
          />

          <div
            className={`status-message ${
              status.type ?? ""
            }`}
            id="proposal-status"
            role={
              status.type ===
              "error"
                ? "alert"
                : "status"
            }
          >
            {status.message}
          </div>

          {loadingProposal && (
            <div className="status-message working">
              Loading proposal...
            </div>
          )}

          {selectedProposal && (
            <>
              <div
                className="status-message"
                id="proposal-details"
              >
                <div>
                  <strong>
                    Client:
                  </strong>{" "}
                  {
                    selectedProposal.clientName
                  }
                </div>

                <div>
                  <strong>
                    Service:
                  </strong>{" "}
                  {selectedProposal.service ??
                    selectedProposal
                      .metadata
                      ?.service ??
                    selectedService}
                </div>

                <div>
                  <strong>
                    Status:
                  </strong>{" "}
                  {
                    selectedProposal.status
                  }
                </div>

                <div>
                  <strong>
                    Proposal ID:
                  </strong>{" "}
                  {
                    selectedProposal.id
                  }
                </div>

                <div>
                  <strong>
                    Created:
                  </strong>{" "}
                  {formatDate(
                    selectedProposal.createdAt,
                  )}
                </div>
              </div>

              <pre id="proposal-output">
                {
                  selectedProposal.proposal
                }
              </pre>

              <div className="convert-panel">
                <div>
                  <strong>
                    Proposal accepted?
                  </strong>

                  <span>
                    Start a project in
                    delivery, linked to
                    this proposal.
                  </span>
                </div>

                <button
                  type="button"
                  className="primary-button"
                  disabled={
                    creatingProject
                  }
                  onClick={() =>
                    void startProjectFromProposal(
                      selectedProposal,
                    )
                  }
                >
                  {creatingProject
                    ? "Starting..."
                    : "Start Project"}
                </button>
              </div>

              <div className="section-divider" />

              <div>
                <p className="eyebrow">
                  Danger Zone
                </p>

                <h4>
                  Delete Proposal
                </h4>

                <p className="help-text">
                  Permanently remove this
                  proposal from Faith
                  Harbor OS. This action
                  cannot be undone.
                </p>

                <ConfirmDeleteButton
                  recordName={`${selectedProposal.clientName} — ${selectedProposal.service}`}
                  onDelete={
                    deleteSelectedProposal
                  }
                  disabled={
                    loadingProposal ||
                    generatingProposal
                  }
                />
              </div>
            </>
          )}

          {!selectedProposal &&
            !loadingProposal && (
              <pre id="proposal-output" />
            )}
        </section>
      </div>

      <section className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Proposal Management
            </p>

            <h3>
              Saved Proposals
              {!loadingProposals &&
                ` (${savedProposals.length})`}
            </h3>
          </div>

          <button
            className="secondary-button"
            id="refresh-proposals"
            type="button"
            onClick={
              refreshProposals
            }
            disabled={
              loadingProposals
            }
          >
            {loadingProposals
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>

        <div
          className="record-list"
          id="saved-proposals"
        >
          {loadingProposals && (
            <p>
              Loading saved proposals...
            </p>
          )}

          {!loadingProposals &&
            savedProposals.length ===
              0 && (
              <p>
                No proposals have been
                saved yet.
              </p>
            )}

          {!loadingProposals &&
            savedProposals.map(
              (proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  className={`record-button ${
                    selectedProposal
                      ?.id ===
                    proposal.id
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    void openSavedProposal(
                      proposal.id,
                    )
                  }
                >
                  <span className="record-title">
                    {
                      proposal.clientName
                    }{" "}
                    —{" "}
                    {proposal.service ??
                      proposal.metadata
                        ?.service ??
                      "Service"}
                  </span>

                  <span className="record-detail">
                    {proposal.status} •{" "}
                    {formatDate(
                      proposal.createdAt,
                    )}
                  </span>
                </button>
              ),
            )}
        </div>
      </section>
    </section>
  );
}