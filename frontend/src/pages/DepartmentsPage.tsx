import {
  useEffect,
  useState,
} from "react";
import { Link } from "react-router-dom";

type DepartmentStatus =
  | "active"
  | "foundation"
  | "planned";

type CatalogDepartment = {
  name: string;
  description: string;
  status: DepartmentStatus;
  statusLabel: string;
  path?: string;
  /**
   * Name used to match the backend department registry when it
   * differs from the display name (e.g. "AI" vs the canonical
   * "Artificial Intelligence").
   */
  liveName?: string;
};

type DepartmentHealth = {
  status:
    | "healthy"
    | "attention"
    | "critical"
    | "unknown";
  activeWorkflows: number;
  pendingApprovals: number;
  lastCheckedAt: string;
};

type LiveDepartment = {
  id: string;
  name: string;
  description: string;
  mission: string;
  owner: string;
  workflows: string[];
  aiProviders: string[];
  health: DepartmentHealth;
};

type DepartmentsResponse = {
  count: number;
  departments: LiveDepartment[];
};

/**
 * Curated Faith Harbor department catalog. The backend tracks
 * operational departments with live health; this catalog adds
 * the roadmap status and workspace links for the full vision.
 */
const departmentCatalog: readonly CatalogDepartment[] = [
  {
    name: "Client Services",
    description:
      "Manage client relationships, proposals, projects, documents, and service delivery.",
    status: "active",
    statusLabel: "Active",
    path: "/clients",
  },
  {
    name: "AI",
    description:
      "Coordinate governed AI providers, prompts, conversations, and AI-assisted work.",
    status: "active",
    statusLabel: "Active",
    path: "/ai-console",
    liveName: "Artificial Intelligence",
  },
  {
    name: "Analytics",
    description:
      "Review operational reporting, business activity, and performance information.",
    status: "foundation",
    statusLabel: "Foundation Ready",
    path: "/reports",
  },
  {
    name: "Administration",
    description:
      "Manage Faith Harbor OS preferences, providers, system information, and configuration.",
    status: "foundation",
    statusLabel: "Foundation Ready",
    path: "/settings",
  },
  {
    name: "Publishing",
    description:
      "Manage manuscripts, editing stages, book production, distribution, and royalties.",
    status: "active",
    statusLabel: "Active",
    path: "/publishing",
  },
  {
    name: "Ministry",
    description:
      "Organize ministry programs, pastoral resources, outreach, prayer needs, and care.",
    status: "planned",
    statusLabel: "Planned",
  },
  {
    name: "Engineering",
    description:
      "Manage software products, repositories, standards, testing, releases, and deployments.",
    status: "planned",
    statusLabel: "Planned",
  },
  {
    name: "Hosting",
    description:
      "Monitor websites, domains, SSL certificates, hosting accounts, alerts, and maintenance.",
    status: "active",
    statusLabel: "Active",
    path: "/hosting",
  },
  {
    name: "Marketing",
    description:
      "Coordinate content, social media, email campaigns, SEO, funnels, and lead generation.",
    status: "active",
    statusLabel: "Active",
    path: "/marketing",
  },
  {
    name: "Sales",
    description:
      "Manage opportunities, leads, consultations, follow-up, and new business development.",
    status: "active",
    statusLabel: "Active",
    path: "/sales",
  },
  {
    name: "Support",
    description:
      "Track support requests, service issues, client communication, and resolutions.",
    status: "active",
    statusLabel: "Active",
    path: "/support",
  },
  {
    name: "Accounting",
    description:
      "Manage invoices, payments, revenue, financial records, and summaries.",
    status: "active",
    statusLabel: "Active",
    path: "/accounting",
  },
];

const activeDepartmentCount =
  departmentCatalog.filter(
    (department) =>
      department.status === "active",
  ).length;

const foundationDepartmentCount =
  departmentCatalog.filter(
    (department) =>
      department.status === "foundation",
  ).length;

const plannedDepartmentCount =
  departmentCatalog.filter(
    (department) =>
      department.status === "planned",
  ).length;

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

async function requestDepartments():
Promise<LiveDepartment[]> {
  const response = await fetch(
    "/api/v1/departments",
  );

  if (!response.ok) {
    throw new Error(
      "Departments could not be loaded.",
    );
  }

  const result =
    (await response.json()) as DepartmentsResponse;

  return result.departments;
}

const healthLabels: Record<
  DepartmentHealth["status"],
  string
> = {
  healthy: "Healthy",
  attention: "Attention",
  critical: "Critical",
  unknown: "Unknown",
};

function DepartmentsPage() {
  const [
    liveDepartments,
    setLiveDepartments,
  ] = useState<LiveDepartment[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [error, setError] =
    useState<string | null>(null);

  useEffect(() => {
    let requestCancelled = false;

    requestDepartments()
      .then((departments) => {
        if (requestCancelled) {
          return;
        }

        setLiveDepartments(departments);
        setError(null);
      })
      .catch((requestError: unknown) => {
        if (requestCancelled) {
          return;
        }

        setError(
          getErrorMessage(
            requestError,
            "Departments could not be loaded.",
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

  const liveByName = new Map(
    liveDepartments.map((department) => [
      department.name.toLowerCase(),
      department,
    ]),
  );

  return (
    <section aria-labelledby="departments-title">
      <div className="workspace-header">
        <div>
          <p className="eyebrow">
            Faith Harbor LLC
          </p>

          <h3 id="departments-title">
            Department Hub
          </h3>

          <p className="help-text">
            One operating system for the
            ministries, businesses, services,
            products, and responsibilities of
            Faith Harbor LLC.
          </p>
        </div>

        <Link
          className="secondary-button"
          to="/dashboard"
        >
          Return to Command Center
        </Link>
      </div>

      {error && (
        <div className="status-message error">
          {error} Showing the department
          catalog without live operational
          data.
        </div>
      )}

      <div
        className="metrics-grid"
        aria-label="Department summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Departments
          </span>

          <strong className="metric-value">
            {departmentCatalog.length}
          </strong>

          <span className="metric-detail">
            Faith Harbor operational areas
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Registered
          </span>

          <strong className="metric-value">
            {isLoading
              ? "..."
              : liveDepartments.length}
          </strong>

          <span className="metric-detail">
            Live in the backend registry
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active
          </span>

          <strong className="metric-value">
            {activeDepartmentCount}
          </strong>

          <span className="metric-detail">
            Available for daily work
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Foundations
          </span>

          <strong className="metric-value">
            {foundationDepartmentCount}
          </strong>

          <span className="metric-detail">
            Initial capabilities available
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Planned
          </span>

          <strong className="metric-value">
            {plannedDepartmentCount}
          </strong>

          <span className="metric-detail">
            Scheduled for future development
          </span>
        </article>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Operating Structure
            </p>

            <h3>Faith Harbor Departments</h3>
          </div>
        </div>

        <div className="department-grid">
          {departmentCatalog.map(
            (department) => {
              const live =
                liveByName.get(
                  (
                    department.liveName ??
                    department.name
                  ).toLowerCase(),
                );

              return (
                <article
                  className={`department-card department-${department.status}`}
                  key={department.name}
                >
                  <div className="department-card-heading">
                    <div>
                      <span
                        className={`department-status department-status-${department.status}`}
                      >
                        {department.statusLabel}
                      </span>

                      <h4>
                        {department.name}
                      </h4>
                    </div>
                  </div>

                  <p>
                    {department.description}
                  </p>

                  {live && (
                    <div className="department-live">
                      <span
                        className={`department-health department-health-${live.health.status}`}
                      >
                        {
                          healthLabels[
                            live.health.status
                          ]
                        }
                      </span>

                      <span className="department-live-detail">
                        {
                          live.health
                            .activeWorkflows
                        }{" "}
                        active ·{" "}
                        {
                          live.health
                            .pendingApprovals
                        }{" "}
                        pending
                      </span>
                    </div>
                  )}

                  {department.path ? (
                    <Link
                      className="secondary-button"
                      to={department.path}
                    >
                      Open {department.name}
                    </Link>
                  ) : (
                    <span className="department-coming-soon">
                      {live
                        ? "Registered · workspace coming in a future phase"
                        : "Workspace coming in a future phase"}
                    </span>
                  )}
                </article>
              );
            },
          )}
        </div>
      </div>

      <section
        className="welcome-panel"
        aria-labelledby="department-principle-title"
      >
        <div>
          <p className="eyebrow">
            Operating Principle
          </p>

          <h3 id="department-principle-title">
            Departments organize the work.
            Faith Harbor OS connects it.
          </h3>

          <p>
            Every department will share the
            same clients, projects, documents,
            tasks, knowledge, reporting, and
            human-governed AI foundation.
          </p>
        </div>
      </section>
    </section>
  );
}

export default DepartmentsPage;
