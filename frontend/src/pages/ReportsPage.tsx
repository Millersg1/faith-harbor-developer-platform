
import {
  useEffect,
  useState,
} from "react";
import DocumentExportButtons from "../components/DocumentExportButtons";
import type {
  ExportDocumentData,
} from "../utils/documentExport";

type ProjectStatus =
  | "planned"
  | "active"
  | "completed"
  | "archived";

interface Client {
  id: string;
  companyName: string;
  primaryContact: string;
  industry?: string;
  createdAt: string;
}

interface Proposal {
  id: string;
  clientName: string;
  service?: string;
  status: string;
  createdAt: string;
  metadata?: {
    service?: string;
  };
}

interface Project {
  id: string;
  clientId: string;
  name: string;
  status: ProjectStatus;
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface ProposalsResponse {
  count?: number;
  proposals: Proposal[];
}

interface ProjectsResponse {
  count: number;
  projects: Project[];
}

interface ReportData {
  clients: Client[];
  proposals: Proposal[];
  projects: Project[];
}

interface ExportStatus {
  message: string;
  type: "success" | "error";
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

function formatShortDate(
  value?: string,
): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(
    value.includes("T")
      ? value
      : `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatStatus(
  value: string,
): string {
  if (!value) {
    return "Unknown";
  }

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  );
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
      const errorResult = result as {
        error?: {
          message?: string;
        };
        message?: string;
      };

      throw new Error(
        errorResult.error?.message ??
          errorResult.message ??
          fallbackMessage,
      );
    }

    throw new Error(fallbackMessage);
  }

  return result as T;
}

async function requestReportData():
Promise<ReportData> {
  const [
    clientsResponse,
    proposalsResponse,
    projectsResponse,
  ] = await Promise.all([
    fetch("/api/v1/clients"),
    fetch("/api/v1/proposals"),
    fetch("/api/v1/projects"),
  ]);

  const [
    clientsResult,
    proposalsResult,
    projectsResult,
  ] = await Promise.all([
    getResponseData<ClientsResponse>(
      clientsResponse,
      "Clients could not be loaded.",
    ),

    getResponseData<ProposalsResponse>(
      proposalsResponse,
      "Proposals could not be loaded.",
    ),

    getResponseData<ProjectsResponse>(
      projectsResponse,
      "Projects could not be loaded.",
    ),
  ]);

  return {
    clients:
      clientsResult.clients,

    proposals:
      proposalsResult.proposals,

    projects:
      projectsResult.projects,
  };
}

export default function ReportsPage() {
  const [reportData, setReportData] =
    useState<ReportData>({
      clients: [],
      proposals: [],
      projects: [],
    });

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    exportStatus,
    setExportStatus,
  ] = useState<ExportStatus | null>(
    null,
  );

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState<Date | null>(null);

  useEffect(() => {
    let requestCancelled = false;

    requestReportData()
      .then((result) => {
        if (requestCancelled) {
          return;
        }

        setReportData(result);
        setLastUpdated(new Date());
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestCancelled) {
          return;
        }

        setError(
          getErrorMessage(
            requestError,
            "Reports could not be loaded.",
          ),
        );
      })
      .finally(() => {
        if (requestCancelled) {
          return;
        }

        setIsLoading(false);
      });

    return () => {
      requestCancelled = true;
    };
  }, []);

  async function refreshReports():
  Promise<void> {
    setIsRefreshing(true);
    setExportStatus(null);

    try {
      const result =
        await requestReportData();

      setReportData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Reports could not be refreshed.",
        ),
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  function getClientName(
    clientId: string,
  ): string {
    return (
      reportData.clients.find(
        (client) =>
          client.id === clientId,
      )?.companyName ??
      "Unknown client"
    );
  }

  function handleExportStatus(
    message: string,
    type: "success" | "error",
  ): void {
    setExportStatus({
      message,
      type,
    });
  }

  const plannedProjects =
    reportData.projects.filter(
      (project) =>
        project.status === "planned",
    ).length;

  const activeProjects =
    reportData.projects.filter(
      (project) =>
        project.status === "active",
    ).length;

  const completedProjects =
    reportData.projects.filter(
      (project) =>
        project.status ===
        "completed",
    ).length;

  const archivedProjects =
    reportData.projects.filter(
      (project) =>
        project.status ===
        "archived",
    ).length;

  const draftProposals =
    reportData.proposals.filter(
      (proposal) =>
        proposal.status === "draft",
    ).length;

  const otherProposals =
    reportData.proposals.length -
    draftProposals;

  const recentClients = [
    ...reportData.clients,
  ]
    .sort(
      (first, second) =>
        new Date(
          second.createdAt,
        ).getTime() -
        new Date(
          first.createdAt,
        ).getTime(),
    )
    .slice(0, 5);

  const recentProposals = [
    ...reportData.proposals,
  ]
    .sort(
      (first, second) =>
        new Date(
          second.createdAt,
        ).getTime() -
        new Date(
          first.createdAt,
        ).getTime(),
    )
    .slice(0, 5);

  const recentProjects = [
    ...reportData.projects,
  ]
    .sort(
      (first, second) =>
        new Date(
          second.updatedAt,
        ).getTime() -
        new Date(
          first.updatedAt,
        ).getTime(),
    )
    .slice(0, 5);

  const generatedAt =
    lastUpdated ??
    new Date();

  const reportDocument:
    ExportDocumentData = {
      title:
        "Faith Harbor OS Business Report",

      subtitle:
        "Clients, Proposals, Projects, and Operating Activity",

      filename:
        `Faith Harbor OS Business Report - ${
          generatedAt
            .toISOString()
            .slice(0, 10)
        }`,

      metadata: [
        {
          label: "Prepared For",
          value:
            "Pastor Shawn Miller",
        },
        {
          label: "Generated",
          value:
            generatedAt
              .toLocaleString(),
        },
        {
          label: "Clients",
          value: String(
            reportData.clients.length,
          ),
        },
        {
          label: "Proposals",
          value: String(
            reportData.proposals.length,
          ),
        },
        {
          label: "Projects",
          value: String(
            reportData.projects.length,
          ),
        },
        {
          label: "Active Projects",
          value: String(
            activeProjects,
          ),
        },
      ],

      sections: [
        {
          heading:
            "Executive Summary",

          paragraphs: [
            `Faith Harbor OS currently manages ${reportData.clients.length} client relationship${
              reportData.clients.length ===
              1
                ? ""
                : "s"
            }, ${reportData.proposals.length} saved proposal${
              reportData.proposals.length ===
              1
                ? ""
                : "s"
            }, and ${reportData.projects.length} project${
              reportData.projects.length ===
              1
                ? ""
                : "s"
            }. ${activeProjects} project${
              activeProjects === 1
                ? " is"
                : "s are"
            } currently in active delivery.`,
          ],
        },

        {
          heading:
            "Project Status",

          paragraphs: [
            [
              `Planned: ${plannedProjects}`,
              `Active: ${activeProjects}`,
              `Completed: ${completedProjects}`,
              `Archived: ${archivedProjects}`,
              `Total: ${reportData.projects.length}`,
            ].join("\n"),
          ],
        },

        {
          heading:
            "Proposal Pipeline",

          paragraphs: [
            [
              `Draft: ${draftProposals}`,
              `Other statuses: ${otherProposals}`,
              `Total proposals: ${reportData.proposals.length}`,
            ].join("\n"),
          ],
        },

        {
          heading:
            "Recent Clients",

          paragraphs:
            recentClients.length > 0
              ? recentClients.map(
                  (client) =>
                    [
                      client.companyName,
                      `Primary contact: ${client.primaryContact}`,
                      client.industry
                        ? `Industry: ${client.industry}`
                        : "",
                      `Created: ${formatDate(
                        client.createdAt,
                      )}`,
                    ]
                      .filter(Boolean)
                      .join("\n"),
                )
              : [
                  "No clients have been created yet.",
                ],
        },

        {
          heading:
            "Recent Proposals",

          paragraphs:
            recentProposals.length > 0
              ? recentProposals.map(
                  (proposal) => {
                    const service =
                      proposal.service ??
                      proposal.metadata
                        ?.service ??
                      "Service";

                    return [
                      `${proposal.clientName} — ${service}`,
                      `Status: ${formatStatus(
                        proposal.status,
                      )}`,
                      `Created: ${formatDate(
                        proposal.createdAt,
                      )}`,
                    ].join("\n");
                  },
                )
              : [
                  "No proposals have been saved yet.",
                ],
        },

        {
          heading:
            "Recently Updated Projects",

          paragraphs:
            recentProjects.length > 0
              ? recentProjects.map(
                  (project) =>
                    [
                      project.name,
                      `Client: ${getClientName(
                        project.clientId,
                      )}`,
                      `Status: ${formatStatus(
                        project.status,
                      )}`,
                      `Due: ${formatShortDate(
                        project.dueDate,
                      )}`,
                      `Updated: ${formatDate(
                        project.updatedAt,
                      )}`,
                    ].join("\n"),
                )
              : [
                  "No projects have been created yet.",
                ],
        },
      ],
    };

  if (isLoading) {
    return (
      <section className="workspace active">
        <section className="card">
          <p>
            Loading business reports...
          </p>
        </section>
      </section>
    );
  }

  return (
    <section
      className="workspace active"
      id="reports-workspace"
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Business Intelligence
          </p>

          <h3>Reports</h3>

          <p className="help-text">
            Review and export clients,
            proposals, projects, and
            recent business activity
            across Faith Harbor OS.
          </p>

          {lastUpdated && (
            <p className="help-text">
              Last updated:{" "}
              {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void refreshReports()
          }
          disabled={isRefreshing}
        >
          {isRefreshing
            ? "Refreshing..."
            : "Refresh Reports"}
        </button>
      </div>

      <section className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Document Export
            </p>

            <h3>
              Export Business Report
            </h3>
          </div>
        </div>

        <p className="help-text">
          Copy this report into Word,
          download a genuine Word
          document, or save a
          print-ready PDF.
        </p>

        <DocumentExportButtons
          documentData={
            reportDocument
          }
          disabled={
            isRefreshing
          }
          onStatus={
            handleExportStatus
          }
        />

        {exportStatus && (
          <div
            className={`status-message ${exportStatus.type}`}
            role={
              exportStatus.type ===
              "error"
                ? "alert"
                : "status"
            }
          >
            {exportStatus.message}
          </div>
        )}
      </section>

      {error && (
        <div
          className="status-message error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">
            Clients
          </span>

          <strong className="metric-value">
            {
              reportData.clients
                .length
            }
          </strong>

          <span className="metric-detail">
            Total client relationships
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Proposals
          </span>

          <strong className="metric-value">
            {
              reportData.proposals
                .length
            }
          </strong>

          <span className="metric-detail">
            Saved client proposals
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Projects
          </span>

          <strong className="metric-value">
            {
              reportData.projects
                .length
            }
          </strong>

          <span className="metric-detail">
            Total managed projects
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active Work
          </span>

          <strong className="metric-value">
            {activeProjects}
          </strong>

          <span className="metric-detail">
            Projects currently active
          </span>
        </article>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <p className="eyebrow">
            Project Delivery
          </p>

          <h3>Project Status</h3>

          <div className="settings-list">
            <div>
              <strong>Planned</strong>
              <span>
                {plannedProjects}
              </span>
            </div>

            <div>
              <strong>Active</strong>
              <span>
                {activeProjects}
              </span>
            </div>

            <div>
              <strong>
                Completed
              </strong>
              <span>
                {completedProjects}
              </span>
            </div>

            <div>
              <strong>
                Archived
              </strong>
              <span>
                {archivedProjects}
              </span>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">
            Proposal Pipeline
          </p>

          <h3>Proposal Status</h3>

          <div className="settings-list">
            <div>
              <strong>Draft</strong>
              <span>
                {draftProposals}
              </span>
            </div>

            <div>
              <strong>
                Other statuses
              </strong>
              <span>
                {otherProposals}
              </span>
            </div>

            <div>
              <strong>
                Total proposals
              </strong>
              <span>
                {
                  reportData.proposals
                    .length
                }
              </span>
            </div>

            <div>
              <strong>
                Projects created
              </strong>
              <span>
                {
                  reportData.projects
                    .length
                }
              </span>
            </div>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <p className="eyebrow">
            Recent Relationships
          </p>

          <h3>Recent Clients</h3>

          <div className="record-list">
            {recentClients.length ===
            0 ? (
              <p>
                No clients have been
                created yet.
              </p>
            ) : (
              recentClients.map(
                (client) => (
                  <div
                    className="record-button"
                    key={client.id}
                  >
                    <span className="record-title">
                      {
                        client.companyName
                      }
                    </span>

                    <span className="record-detail">
                      {
                        client.primaryContact
                      }
                      {client.industry
                        ? ` • ${client.industry}`
                        : ""}
                      {" • "}
                      {formatDate(
                        client.createdAt,
                      )}
                    </span>
                  </div>
                ),
              )
            )}
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">
            Recent Delivery
          </p>

          <h3>
            Recent Proposals
          </h3>

          <div className="record-list">
            {recentProposals.length ===
            0 ? (
              <p>
                No proposals have been
                saved yet.
              </p>
            ) : (
              recentProposals.map(
                (proposal) => (
                  <div
                    className="record-button"
                    key={proposal.id}
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
                      {formatStatus(
                        proposal.status,
                      )}{" "}
                      •{" "}
                      {formatDate(
                        proposal.createdAt,
                      )}
                    </span>
                  </div>
                ),
              )
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <p className="eyebrow">
          Recent Operations
        </p>

        <h3>
          Recently Updated Projects
        </h3>

        <div className="record-list">
          {recentProjects.length ===
          0 ? (
            <p>
              No projects have been
              created yet.
            </p>
          ) : (
            recentProjects.map(
              (project) => (
                <div
                  className="record-button"
                  key={project.id}
                >
                  <span className="record-title">
                    {project.name}
                  </span>

                  <span className="record-detail">
                    {getClientName(
                      project.clientId,
                    )}{" "}
                    •{" "}
                    {formatStatus(
                      project.status,
                    )}{" "}
                    • Due:{" "}
                    {formatShortDate(
                      project.dueDate,
                    )}{" "}
                    • Updated:{" "}
                    {formatDate(
                      project.updatedAt,
                    )}
                  </span>
                </div>
              ),
            )
          )}
        </div>
      </section>
    </section>
  );
}