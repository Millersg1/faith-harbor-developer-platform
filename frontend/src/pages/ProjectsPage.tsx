import {
  useEffect,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";
import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type ProjectStatus =
  | "planned"
  | "active"
  | "completed"
  | "archived";

interface Client {
  id: string;
  companyName: string;
  primaryContact: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface Project {
  id: string;
  clientId: string;
  proposalId?: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  startDate?: string;
  dueDate?: string;
  completedDate?: string;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface ProjectsResponse {
  count: number;
  projects: Project[];
}

interface ProjectMutationResponse {
  success: boolean;
  status: ProjectStatus;
  project: Project;
}

interface ProjectFormData {
  clientId: string;
  proposalId: string;
  name: string;
  description: string;
  status: ProjectStatus;
  startDate: string;
  dueDate: string;
  completedDate: string;
  notes: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  ProjectFormData = {
    clientId: "",
    proposalId: "",
    name: "",
    description: "",
    status: "planned",
    startDate: "",
    dueDate: "",
    completedDate: "",
    notes: "",
  };

function formatDate(
  value?: string,
): string {
  if (!value) {
    return "Not provided";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function formatProjectDate(
  value?: string,
): string {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(
    `${value}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function formatStatus(
  status: ProjectStatus,
): string {
  return (
    status.charAt(0).toUpperCase() +
    status.slice(1)
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

async function requestProjects(
  clientId = "",
): Promise<ProjectsResponse> {
  const query = clientId
    ? `?clientId=${encodeURIComponent(
        clientId,
      )}`
    : "";

  const response = await fetch(
    `/api/v1/projects${query}`,
  );

  return getResponseData<ProjectsResponse>(
    response,
    "Projects could not be loaded.",
  );
}

async function requestProject(
  projectId: string,
): Promise<Project> {
  const response = await fetch(
    `/api/v1/projects/${projectId}`,
  );

  return getResponseData<Project>(
    response,
    "The project could not be opened.",
  );
}

export default function ProjectsPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [projects, setProjects] =
    useState<Project[]>([]);

  const [
    selectedProject,
    setSelectedProject,
  ] = useState<Project | null>(
    null,
  );

  const [formData, setFormData] =
    useState<ProjectFormData>(
      emptyForm,
    );

  const [
    clientFilter,
    setClientFilter,
  ] = useState("");

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  const [
    loadingInitialData,
    setLoadingInitialData,
  ] = useState(true);

  const [
    loadingProjects,
    setLoadingProjects,
  ] = useState(false);

  const [
    loadingProject,
    setLoadingProject,
  ] = useState(false);

  const [
    creatingProject,
    setCreatingProject,
  ] = useState(false);

  const [
    updatingProject,
    setUpdatingProject,
  ] = useState(false);

  useEffect(() => {
    let requestCancelled = false;

    Promise.all([
      requestClients(),
      requestProjects(),
    ])
      .then(
        ([
          clientsResult,
          projectsResult,
        ]) => {
          if (requestCancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setProjects(
            projectsResult.projects,
          );
        },
      )
      .catch(
        (error: unknown) => {
          if (requestCancelled) {
            return;
          }

          setStatus({
            message:
              getErrorMessage(
                error,
                "Project information could not be loaded.",
              ),

            type: "error",
          });
        },
      )
      .finally(() => {
        if (requestCancelled) {
          return;
        }

        setLoadingInitialData(
          false,
        );
      });

    return () => {
      requestCancelled = true;
    };
  }, []);

  function updateFormField(
    field:
      keyof ProjectFormData,
    value: string,
  ): void {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function getClientName(
    clientId: string,
  ): string {
    return (
      clients.find(
        (client) =>
          client.id === clientId,
      )?.companyName ??
      "Unknown client"
    );
  }

  async function loadProjects(
    filter = clientFilter,
  ): Promise<void> {
    setLoadingProjects(true);

    try {
      const result =
        await requestProjects(
          filter,
        );

      setProjects(
        result.projects,
      );

      if (
        selectedProject &&
        !result.projects.some(
          (project) =>
            project.id ===
            selectedProject.id,
        )
      ) {
        setSelectedProject(null);
      }
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Projects could not be loaded.",
        ),

        type: "error",
      });
    } finally {
      setLoadingProjects(false);
    }
  }

  function handleClientFilter(
    clientId: string,
  ): void {
    setClientFilter(clientId);
    setLoadingProjects(true);
    setSelectedProject(null);

    requestProjects(clientId)
      .then((result) => {
        setProjects(
          result.projects,
        );
      })
      .catch(
        (error: unknown) => {
          setStatus({
            message:
              getErrorMessage(
                error,
                "Projects could not be loaded.",
              ),

            type: "error",
          });
        },
      )
      .finally(() => {
        setLoadingProjects(false);
      });
  }

  async function openProject(
    projectId: string,
  ): Promise<void> {
    setLoadingProject(true);
    setStatus(null);

    try {
      const project =
        await requestProject(
          projectId,
        );

      setSelectedProject(
        project,
      );
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "The project could not be opened.",
        ),

        type: "error",
      });
    } finally {
      setLoadingProject(false);
    }
  }

  async function handleSubmit(
    event:
      SyntheticEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    const clientId =
      formData.clientId.trim();

    const projectName =
      formData.name.trim();

    if (
      !clientId ||
      !projectName
    ) {
      setStatus({
        message:
          "Please choose a client and enter a project name.",

        type: "error",
      });

      return;
    }

    setCreatingProject(true);

    setStatus({
      message:
        "Creating project...",

      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/projects",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            clientId,

            proposalId:
              formData.proposalId
                .trim() ||
              undefined,

            name: projectName,

            description:
              formData.description
                .trim() ||
              undefined,

            status:
              formData.status,

            startDate:
              formData.startDate ||
              undefined,

            dueDate:
              formData.dueDate ||
              undefined,

            completedDate:
              formData.completedDate ||
              undefined,

            notes:
              formData.notes
                .trim() ||
              undefined,
          }),
        },
      );

      const result =
        await getResponseData<ProjectMutationResponse>(
          response,
          "Project creation failed.",
        );

      setFormData(emptyForm);

      setSelectedProject(
        result.project,
      );

      setStatus({
        message:
          "Project created successfully.",

        type: "success",
      });

      await loadProjects(
        clientFilter,
      );
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Project creation failed.",
        ),

        type: "error",
      });
    } finally {
      setCreatingProject(false);
    }
  }

  async function deleteSelectedProject():
  Promise<void> {
    if (!selectedProject) {
      return;
    }

    const projectId =
      selectedProject.id;

    const projectName =
      selectedProject.name;

    try {
      const response = await fetch(
        `/api/v1/projects/${projectId}`,
        {
          method: "DELETE",
        },
      );

      if (!response.ok) {
        const responseText =
          await response.text();

        let message =
          "The project could not be deleted.";

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

      setSelectedProject(null);

      setProjects((current) =>
        current.filter(
          (project) =>
            project.id !==
            projectId,
        ),
      );

      setStatus({
        message:
          `Project "${projectName}" was deleted permanently.`,

        type: "success",
      });
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "The project could not be deleted.",
        ),

        type: "error",
      });

      throw error;
    }
  }

  async function updateProjectStatus(
    projectStatus:
      ProjectStatus,
  ): Promise<void> {
    if (!selectedProject) {
      return;
    }

    setUpdatingProject(true);

    setStatus({
      message:
        "Updating project status...",

      type: "working",
    });

    try {
      const completedDate =
        projectStatus ===
        "completed"
          ? selectedProject
              .completedDate ??
            new Date()
              .toISOString()
              .slice(0, 10)
          : undefined;

      const response = await fetch(
        `/api/v1/projects/${selectedProject.id}`,
        {
          method: "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            status:
              projectStatus,

            completedDate,
          }),
        },
      );

      const result =
        await getResponseData<ProjectMutationResponse>(
          response,
          "Project status could not be updated.",
        );

      setSelectedProject(
        result.project,
      );

      setProjects((current) =>
        current.map((project) =>
          project.id ===
          result.project.id
            ? result.project
            : project,
        ),
      );

      setStatus({
        message:
          "Project status updated successfully.",

        type: "success",
      });
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "Project status could not be updated.",
        ),

        type: "error",
      });
    } finally {
      setUpdatingProject(false);
    }
  }

  const projectCounts = {
    total:
      projects.length,

    planned:
      projects.filter(
        (project) =>
          project.status ===
          "planned",
      ).length,

    active:
      projects.filter(
        (project) =>
          project.status ===
          "active",
      ).length,

    completed:
      projects.filter(
        (project) =>
          project.status ===
          "completed",
      ).length,
  };

  return (
    <section
      className="workspace active"
      id="projects-workspace"
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Delivery Management
          </p>

          <h3>Projects</h3>

          <p className="help-text">
            Create, organize, monitor,
            and safely remove client
            projects.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void loadProjects()
          }
          disabled={
            loadingProjects ||
            loadingInitialData
          }
        >
          {loadingProjects
            ? "Refreshing..."
            : "Refresh Projects"}
        </button>
      </div>

      {status && (
        <div
          className={`status-message ${status.type}`}
          role={
            status.type ===
            "error"
              ? "alert"
              : "status"
          }
        >
          {status.message}
        </div>
      )}

      <div className="metrics-grid">
        <article className="metric-card">
          <span className="metric-label">
            Projects
          </span>

          <strong className="metric-value">
            {projectCounts.total}
          </strong>

          <span className="metric-detail">
            Current project view
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Planned
          </span>

          <strong className="metric-value">
            {projectCounts.planned}
          </strong>

          <span className="metric-detail">
            Awaiting active work
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active
          </span>

          <strong className="metric-value">
            {projectCounts.active}
          </strong>

          <span className="metric-detail">
            Work in progress
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Completed
          </span>

          <strong className="metric-value">
            {projectCounts.completed}
          </strong>

          <span className="metric-detail">
            Finished projects
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <p className="eyebrow">
            New Project
          </p>

          <h3>Create a Project</h3>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="project-client">
                Client
              </label>

              <select
                id="project-client"
                value={
                  formData.clientId
                }
                onChange={(event) =>
                  updateFormField(
                    "clientId",
                    event.target.value,
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
                      key={client.id}
                      value={client.id}
                    >
                      {
                        client.companyName
                      }
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="project-name">
                Project name
              </label>

              <input
                id="project-name"
                type="text"
                value={formData.name}
                onChange={(event) =>
                  updateFormField(
                    "name",
                    event.target.value,
                  )
                }
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-description">
                Description
              </label>

              <textarea
                id="project-description"
                rows={5}
                value={
                  formData.description
                }
                onChange={(event) =>
                  updateFormField(
                    "description",
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-status">
                Starting status
              </label>

              <select
                id="project-status"
                value={
                  formData.status
                }
                onChange={(event) =>
                  updateFormField(
                    "status",
                    event.target.value,
                  )
                }
              >
                <option value="planned">
                  Planned
                </option>

                <option value="active">
                  Active
                </option>

                <option value="completed">
                  Completed
                </option>

                <option value="archived">
                  Archived
                </option>
              </select>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="project-start-date">
                  Start date
                </label>

                <input
                  id="project-start-date"
                  type="date"
                  value={
                    formData.startDate
                  }
                  onChange={(event) =>
                    updateFormField(
                      "startDate",
                      event.target.value,
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="project-due-date">
                  Due date
                </label>

                <input
                  id="project-due-date"
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
            </div>

            <div className="form-group">
              <label htmlFor="project-proposal-id">
                Proposal ID
              </label>

              <input
                id="project-proposal-id"
                type="text"
                value={
                  formData.proposalId
                }
                onChange={(event) =>
                  updateFormField(
                    "proposalId",
                    event.target.value,
                  )
                }
                placeholder="Optional"
              />
            </div>

            <div className="form-group">
              <label htmlFor="project-notes">
                Project notes
              </label>

              <textarea
                id="project-notes"
                rows={4}
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
                creatingProject ||
                clients.length === 0
              }
            >
              {creatingProject
                ? "Creating Project..."
                : "Create Project"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Project Directory
              </p>

              <h3>
                Existing Projects
              </h3>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="project-client-filter">
              Filter by client
            </label>

            <select
              id="project-client-filter"
              value={clientFilter}
              onChange={(event) =>
                handleClientFilter(
                  event.target.value,
                )
              }
            >
              <option value="">
                All clients
              </option>

              {clients.map(
                (client) => (
                  <option
                    key={client.id}
                    value={client.id}
                  >
                    {
                      client.companyName
                    }
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="record-list">
            {loadingInitialData ||
            loadingProjects ? (
              <p>
                Loading projects...
              </p>
            ) : projects.length ===
              0 ? (
              <p>
                No projects have been
                created yet.
              </p>
            ) : (
              projects.map(
                (project) => (
                  <button
                    key={project.id}
                    type="button"
                    className={`record-button ${
                      selectedProject
                        ?.id ===
                      project.id
                        ? "active"
                        : ""
                    }`}
                    onClick={() =>
                      void openProject(
                        project.id,
                      )
                    }
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
                      {formatProjectDate(
                        project.dueDate,
                      )}
                    </span>
                  </button>
                ),
              )
            )}
          </div>
        </section>
      </div>

      {loadingProject && (
        <section className="card">
          <p>
            Loading project...
          </p>
        </section>
      )}

      {!loadingProject &&
        selectedProject && (
          <section className="card client-workspace-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">
                  Project Workspace
                </p>

                <h3>
                  {
                    selectedProject.name
                  }
                </h3>

                <p className="help-text">
                  {getClientName(
                    selectedProject.clientId,
                  )}
                </p>
              </div>

              <select
                aria-label="Project status"
                value={
                  selectedProject.status
                }
                onChange={(event) =>
                  void updateProjectStatus(
                    event.target
                      .value as ProjectStatus,
                  )
                }
                disabled={
                  updatingProject
                }
              >
                <option value="planned">
                  Planned
                </option>

                <option value="active">
                  Active
                </option>

                <option value="completed">
                  Completed
                </option>

                <option value="archived">
                  Archived
                </option>
              </select>
            </div>

            <div className="client-overview">
              <div className="client-overview-item">
                <span>Status</span>

                <strong>
                  {formatStatus(
                    selectedProject.status,
                  )}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>
                  Start date
                </span>

                <strong>
                  {formatProjectDate(
                    selectedProject.startDate,
                  )}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>
                  Due date
                </span>

                <strong>
                  {formatProjectDate(
                    selectedProject.dueDate,
                  )}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>
                  Completed
                </span>

                <strong>
                  {formatProjectDate(
                    selectedProject.completedDate,
                  )}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Created</span>

                <strong>
                  {formatDate(
                    selectedProject.createdAt,
                  )}
                </strong>
              </div>

              <div className="client-overview-item">
                <span>Updated</span>

                <strong>
                  {formatDate(
                    selectedProject.updatedAt,
                  )}
                </strong>
              </div>
            </div>

            {selectedProject.description && (
              <div className="client-notes">
                <h4>
                  Project Description
                </h4>

                <p>
                  {
                    selectedProject.description
                  }
                </p>
              </div>
            )}

            {selectedProject.notes && (
              <div className="client-notes">
                <h4>
                  Project Notes
                </h4>

                <p>
                  {
                    selectedProject.notes
                  }
                </p>
              </div>
            )}

            {selectedProject.proposalId && (
              <div className="status-message">
                <strong>
                  Proposal ID:
                </strong>{" "}
                {
                  selectedProject.proposalId
                }
              </div>
            )}

            <div className="section-divider" />

            <div>
              <p className="eyebrow">
                Danger Zone
              </p>

              <h4>Delete Project</h4>

              <p className="help-text">
                Permanently remove this
                project from Faith Harbor
                OS. This action cannot be
                undone.
              </p>

              <ConfirmDeleteButton
                recordName={
                  selectedProject.name
                }
                onDelete={
                  deleteSelectedProject
                }
                disabled={
                  updatingProject
                }
              />
            </div>
          </section>
        )}
    </section>
  );
}