import {
  useEffect,
  useState,
} from "react";
import {
  NavLink,
} from "react-router-dom";

type ProjectStatus =
  | "planned"
  | "active"
  | "completed"
  | "archived";

interface HealthResponse {
  status?: string;
  service?: string;
  name?: string;
  version?: string;
  environment?: string;
  databaseConfigured?: boolean;
  aiConfigured?: boolean;
  proposalGenerationAvailable?: boolean;
  clientManagementAvailable?: boolean;
  projectManagementAvailable?: boolean;
  persistentClientStorage?: boolean;
  persistentProposalStorage?: boolean;
  persistentProjectStorage?: boolean;
}

interface Client {
  id: string;
  companyName: string;
  primaryContact: string;
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

interface DashboardData {
  health: HealthResponse;
  clients: Client[];
  proposals: Proposal[];
  projects: Project[];
}

function formatDate(value: string): string {
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
    return "No due date";
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

async function requestDashboardData():
Promise<DashboardData> {
  const [
    healthResponse,
    clientsResponse,
    proposalsResponse,
    projectsResponse,
  ] = await Promise.all([
    fetch("/health"),
    fetch("/api/v1/clients"),
    fetch("/api/v1/proposals"),
    fetch("/api/v1/projects"),
  ]);

  const [
    health,
    clientsResult,
    proposalsResult,
    projectsResult,
  ] = await Promise.all([
    getResponseData<HealthResponse>(
      healthResponse,
      "System health could not be loaded.",
    ),
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
    health,
    clients: clientsResult.clients,
    proposals:
      proposalsResult.proposals,
    projects:
      projectsResult.projects,
  };
}

export default function DashboardPage() {
  const [dashboardData, setDashboardData] =
    useState<DashboardData | null>(
      null,
    );

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [
    lastUpdated,
    setLastUpdated,
  ] = useState<Date | null>(null);

  useEffect(() => {
    let requestCancelled = false;

    requestDashboardData()
      .then((result) => {
        if (requestCancelled) {
          return;
        }

        setDashboardData(result);
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
            "Dashboard data could not be loaded.",
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

  async function refreshDashboard():
  Promise<void> {
    setIsRefreshing(true);

    try {
      const result =
        await requestDashboardData();

      setDashboardData(result);
      setLastUpdated(new Date());
      setError(null);
    } catch (requestError) {
      setError(
        getErrorMessage(
          requestError,
          "Dashboard data could not be refreshed.",
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
      dashboardData?.clients.find(
        (client) =>
          client.id === clientId,
      )?.companyName ??
      "Unknown client"
    );
  }

  if (
    isLoading &&
    !dashboardData
  ) {
    return (
      <section className="workspace active">
        <section className="card">
          <p>
            Loading Faith Harbor OS
            dashboard...
          </p>
        </section>
      </section>
    );
  }

  const health =
    dashboardData?.health;

  const clients =
    dashboardData?.clients ?? [];

  const proposals =
    dashboardData?.proposals ?? [];

  const projects =
    dashboardData?.projects ?? [];

  const activeProjects =
    projects.filter(
      (project) =>
        project.status === "active",
    );

  const plannedProjects =
    projects.filter(
      (project) =>
        project.status === "planned",
    );

  const draftProposals =
    proposals.filter(
      (proposal) =>
        proposal.status === "draft",
    );

  const recentProposals = [
    ...proposals,
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
    ...projects,
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

  const backendStatus = error
    ? "Attention"
    : health?.status ?? "Unknown";

  return (
    <section className="workspace active">
      <div className="welcome-panel">
        <div>
          <p className="eyebrow">
            Faith Harbor Workspace
          </p>

          <h3>
            Welcome back, Pastor Shawn.
          </h3>

          <p>
            Review your clients,
            proposals, projects, and AI
            operations from one command
            center.
          </p>

          {lastUpdated && (
            <p className="help-text">
              Last updated:{" "}
              {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>

        <div className="button-group">
          <NavLink
            className="primary-button"
            to="/proposals"
          >
            Generate Proposal
          </NavLink>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              void refreshDashboard()
            }
            disabled={isRefreshing}
          >
            {isRefreshing
              ? "Refreshing..."
              : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="status-message error"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="metrics-grid">
        <MetricCard
          label="Clients"
          value={String(
            clients.length,
          )}
          detail="Active client relationships"
        />

        <MetricCard
          label="Proposals"
          value={String(
            proposals.length,
          )}
          detail={`${draftProposals.length} currently in draft`}
        />

        <MetricCard
          label="Projects"
          value={String(
            projects.length,
          )}
          detail={`${plannedProjects.length} planned`}
        />

        <MetricCard
          label="Active Work"
          value={String(
            activeProjects.length,
          )}
          detail="Projects in active delivery"
        />
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                System Overview
              </p>

              <h3>
                Platform Status
              </h3>
            </div>

            <span
              className={`status-message ${
                error
                  ? "error"
                  : "success"
              }`}
            >
              {backendStatus}
            </span>
          </div>

          <div className="settings-list">
            <div>
              <strong>
                Application Version
              </strong>

              <span>
                {health?.version ??
                  "Unknown"}
              </span>
            </div>

            <div>
              <strong>
                Environment
              </strong>

              <span>
                {health?.environment ??
                  "Unknown"}
              </span>
            </div>

            <div>
              <strong>
                SQLite Persistence
              </strong>

              <span>
                {health?.databaseConfigured
                  ? "Connected"
                  : "Not configured"}
              </span>
            </div>

            <div>
              <strong>
                AI Runtime
              </strong>

              <span>
                {health?.aiConfigured
                  ? "Connected"
                  : "Not configured"}
              </span>
            </div>

            <div>
              <strong>
                Proposal Generation
              </strong>

              <span>
                {health?.proposalGenerationAvailable
                  ? "Available"
                  : "Unavailable"}
              </span>
            </div>

            <div>
              <strong>
                Human Authority
              </strong>

              <span>
                Required for final
                delivery
              </span>
            </div>
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">
            Quick Actions
          </p>

          <h3>Start Work</h3>

          <div className="quick-actions">
            <NavLink
              className="quick-action"
              to="/clients"
            >
              <strong>
                New Client
              </strong>

              <span>
                Create or open a client
                workspace
              </span>
            </NavLink>

            <NavLink
              className="quick-action"
              to="/proposals"
            >
              <strong>
                Generate Proposal
              </strong>

              <span>
                Prepare a client
                deliverable
              </span>
            </NavLink>

            <NavLink
              className="quick-action"
              to="/projects"
            >
              <strong>
                Manage Projects
              </strong>

              <span>
                Review active delivery
              </span>
            </NavLink>

            <NavLink
              className="quick-action"
              to="/ai-console"
            >
              <strong>
                AI Workspace
              </strong>

              <span>
                Ask Faith Harbor OS
              </span>
            </NavLink>

            <NavLink
              className="quick-action"
              to="/reports"
            >
              <strong>
                Business Reports
              </strong>

              <span>
                Review operating metrics
              </span>
            </NavLink>
          </div>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <p className="eyebrow">
            Client Delivery
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
                  <NavLink
                    key={proposal.id}
                    className="record-button"
                    to="/proposals"
                    state={{
                      proposalId:
                        proposal.id,
                    }}
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
                  </NavLink>
                ),
              )
            )}
          </div>
        </section>

        <section className="card">
          <p className="eyebrow">
            Project Delivery
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
                  <NavLink
                    key={project.id}
                    className="record-button"
                    to="/projects"
                    state={{
                      projectId:
                        project.id,
                    }}
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
                      •{" "}
                      {formatShortDate(
                        project.dueDate,
                      )}
                    </span>
                  </NavLink>
                ),
              )
            )}
          </div>
        </section>
      </div>
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  detail: string;
}

function MetricCard({
  label,
  value,
  detail,
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <span className="metric-label">
        {label}
      </span>

      <strong className="metric-value">
        {value}
      </strong>

      <span className="metric-detail">
        {detail}
      </span>
    </article>
  );
}