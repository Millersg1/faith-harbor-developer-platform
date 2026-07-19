import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import ConfirmDeleteButton from "../components/ConfirmDeleteButton";

type ProgramStatus =
  | "planned"
  | "active"
  | "paused"
  | "completed";

const programStatuses: readonly ProgramStatus[] =
  [
    "planned",
    "active",
    "paused",
    "completed",
  ];

const categorySuggestions: readonly string[] =
  [
    "Grief Support",
    "Outreach",
    "Prayer",
    "Pastoral Care",
    "Bible Study",
    "Worship",
    "Youth",
    "Discipleship",
  ];

interface Client {
  id: string;
  companyName: string;
}

interface ClientsResponse {
  count: number;
  clients: Client[];
}

interface Program {
  id: string;
  clientId?: string;
  name: string;
  category?: string;
  status: ProgramStatus;
  leader?: string;
  schedule?: string;
  participants?: number;
  startDate?: string;
  endDate?: string;
  description?: string;
  notes?: string;
  metadata: Record<
    string,
    unknown
  >;
  createdAt: string;
  updatedAt: string;
}

interface ProgramsResponse {
  count: number;
  programs: Program[];
}

interface ProgramMutationResponse {
  success: boolean;
  status: ProgramStatus;
  program: Program;
}

interface ProgramFormData {
  name: string;
  category: string;
  status: ProgramStatus;
  leader: string;
  schedule: string;
  participants: string;
}

interface StatusMessage {
  message: string;
  type:
    | "working"
    | "success"
    | "error";
}

const emptyForm:
  ProgramFormData = {
    name: "",
    category: "",
    status: "planned",
    leader: "",
    schedule: "",
    participants: "",
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

async function requestPrograms():
Promise<ProgramsResponse> {
  const response = await fetch(
    "/api/v1/programs",
  );

  return getResponseData<ProgramsResponse>(
    response,
    "Programs could not be loaded.",
  );
}

export default function MinistryPage() {
  const [clients, setClients] =
    useState<Client[]>([]);

  const [programs, setPrograms] =
    useState<Program[]>([]);

  const [
    selectedProgram,
    setSelectedProgram,
  ] = useState<Program | null>(null);

  const [formData, setFormData] =
    useState<ProgramFormData>(
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
      requestPrograms(),
    ])
      .then(
        ([
          clientsResult,
          programsResult,
        ]) => {
          if (cancelled) {
            return;
          }

          setClients(
            clientsResult.clients,
          );

          setPrograms(
            programsResult.programs,
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
              "Ministry information could not be loaded.",
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
    let active = 0;
    let participants = 0;

    for (const program of programs) {
      if (
        program.status === "active"
      ) {
        active += 1;
      }

      participants +=
        program.participants ?? 0;
    }

    return {
      total: programs.length,
      active,
      participants,
    };
  }, [programs]);

  async function reloadPrograms():
  Promise<void> {
    const result =
      await requestPrograms();

    setPrograms(result.programs);
  }

  async function handleCreate(
    event: SyntheticEvent,
  ): Promise<void> {
    event.preventDefault();

    if (!formData.name.trim()) {
      setStatus({
        message:
          "A program name is required.",
        type: "error",
      });

      return;
    }

    const participants =
      formData.participants.trim()
        ? Number(
            formData.participants,
          )
        : undefined;

    if (
      participants !== undefined &&
      (Number.isNaN(participants) ||
        participants < 0)
    ) {
      setStatus({
        message:
          "Participants must be a non-negative number.",
        type: "error",
      });

      return;
    }

    setCreating(true);

    setStatus({
      message: "Adding program...",
      type: "working",
    });

    try {
      const response = await fetch(
        "/api/v1/programs",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            name:
              formData.name.trim(),
            category:
              formData.category
                .trim() ||
              undefined,
            status:
              formData.status,
            leader:
              formData.leader
                .trim() ||
              undefined,
            schedule:
              formData.schedule
                .trim() ||
              undefined,
            participants,
          }),
        },
      );

      const result =
        await getResponseData<ProgramMutationResponse>(
          response,
          "The program could not be added.",
        );

      await reloadPrograms();

      setSelectedProgram(
        result.program,
      );

      setFormData(emptyForm);

      setStatus({
        message: `Added "${result.program.name}".`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The program could not be added.",
          ),
        type: "error",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(
    program: Program,
    nextStatus: ProgramStatus,
  ): Promise<void> {
    setStatus({
      message: "Updating program...",
      type: "working",
    });

    try {
      const response = await fetch(
        `/api/v1/programs/${program.id}`,
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
        await getResponseData<ProgramMutationResponse>(
          response,
          "The program could not be updated.",
        );

      await reloadPrograms();

      setSelectedProgram(
        result.program,
      );

      setStatus({
        message: `"${result.program.name}" is now ${formatLabel(
          nextStatus,
        )}.`,
        type: "success",
      });
    } catch (error) {
      setStatus({
        message:
          getErrorMessage(
            error,
            "The program could not be updated.",
          ),
        type: "error",
      });
    }
  }

  async function handleDelete(
    program: Program,
  ): Promise<void> {
    const response = await fetch(
      `/api/v1/programs/${program.id}`,
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
        "The program could not be deleted.",
      );
    }

    await reloadPrograms();

    setSelectedProgram((current) =>
      current?.id === program.id
        ? null
        : current,
    );

    setStatus({
      message: `Removed "${program.name}".`,
      type: "success",
    });
  }

  return (
    <section className="workspace active">
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Ministry
          </p>

          <h3>
            Programs & Care
          </h3>

          <p className="help-text">
            Organize ministry programs
            &mdash; grief support,
            outreach, prayer, pastoral
            care, and more. People are
            the mission.
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
        aria-label="Ministry summary"
      >
        <article className="metric-card">
          <span className="metric-label">
            Programs
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.total}
          </strong>

          <span className="metric-detail">
            All ministry programs
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Active
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.active}
          </strong>

          <span className="metric-detail">
            Currently running
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            People Served
          </span>

          <strong className="metric-value">
            {loading
              ? "..."
              : metrics.participants}
          </strong>

          <span className="metric-detail">
            Total participants
          </span>
        </article>

        <article className="metric-card">
          <span className="metric-label">
            Mission
          </span>

          <strong className="metric-value metric-word">
            People
          </strong>

          <span className="metric-detail">
            Christ is our foundation
          </span>
        </article>
      </div>

      <div className="workspace-grid">
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                New Program
              </p>

              <h3>Add Program</h3>
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
              <label htmlFor="program-name">
                Name
              </label>

              <input
                id="program-name"
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

            <div className="form-group">
              <label htmlFor="program-category">
                Category
              </label>

              <input
                id="program-category"
                type="text"
                list="program-category-options"
                placeholder="Grief Support / Outreach / Prayer"
                value={
                  formData.category
                }
                onChange={(event) =>
                  setFormData(
                    (current) => ({
                      ...current,
                      category:
                        event.target
                          .value,
                    }),
                  )
                }
              />

              <datalist id="program-category-options">
                {categorySuggestions.map(
                  (category) => (
                    <option
                      key={category}
                      value={category}
                    />
                  ),
                )}
              </datalist>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="program-leader">
                  Leader
                </label>

                <input
                  id="program-leader"
                  type="text"
                  value={
                    formData.leader
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        leader:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="program-schedule">
                  Schedule
                </label>

                <input
                  id="program-schedule"
                  type="text"
                  placeholder="Weekly / Sundays"
                  value={
                    formData.schedule
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        schedule:
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
                <label htmlFor="program-participants">
                  Participants
                </label>

                <input
                  id="program-participants"
                  type="number"
                  min="0"
                  step="1"
                  value={
                    formData.participants
                  }
                  onChange={(event) =>
                    setFormData(
                      (current) => ({
                        ...current,
                        participants:
                          event
                            .target
                            .value,
                      }),
                    )
                  }
                />
              </div>

              <div className="form-group">
                <label htmlFor="program-status">
                  Status
                </label>

                <select
                  id="program-status"
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
                            .value as ProgramStatus,
                      }),
                    )
                  }
                >
                  {programStatuses.map(
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
                : "Add Program"}
            </button>
          </form>
        </section>

        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                Programs
              </p>

              <h3>All Programs</h3>
            </div>
          </div>

          {loading ? (
            <p className="help-text">
              Loading programs...
            </p>
          ) : programs.length ===
            0 ? (
            <p className="help-text">
              No programs yet. Add the
              first ministry program to
              begin.
            </p>
          ) : (
            <div className="record-list">
              {programs.map(
                (program) => (
                  <button
                    type="button"
                    className="record-button"
                    key={program.id}
                    onClick={() =>
                      setSelectedProgram(
                        program,
                      )
                    }
                  >
                    <span className="record-title">
                      {program.name}
                    </span>

                    <span className="record-detail">
                      <span
                        className={`program-status program-status-${program.status}`}
                      >
                        {formatLabel(
                          program.status,
                        )}
                      </span>{" "}
                      {program.category ||
                        "Ministry"}
                    </span>
                  </button>
                ),
              )}
            </div>
          )}
        </section>
      </div>

      {selectedProgram && (
        <section className="card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">
                {selectedProgram.category ||
                  "Ministry"}
              </p>

              <h3>
                {selectedProgram.name}
              </h3>
            </div>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setSelectedProgram(
                  null,
                )
              }
            >
              Close
            </button>
          </div>

          <div className="client-overview">
            <div className="client-overview-item">
              <span>Status</span>

              <strong>
                {formatLabel(
                  selectedProgram.status,
                )}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Leader</span>

              <strong>
                {selectedProgram.leader ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Schedule</span>

              <strong>
                {selectedProgram.schedule ||
                  "Not set"}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Participants</span>

              <strong>
                {selectedProgram.participants ??
                  0}
              </strong>
            </div>

            <div className="client-overview-item">
              <span>Church / Client</span>

              <strong>
                {selectedProgram.clientId
                  ? clientNames.get(
                      selectedProgram.clientId,
                    ) ?? "Client"
                  : "Faith Harbor"}
              </strong>
            </div>
          </div>

          {selectedProgram.description && (
            <p className="client-notes">
              {
                selectedProgram.description
              }
            </p>
          )}

          {selectedProgram.notes && (
            <p className="client-notes">
              {selectedProgram.notes}
            </p>
          )}

          <div className="section-divider" />

          <div className="form-group">
            <label htmlFor="program-status-update">
              Update status
            </label>

            <select
              id="program-status-update"
              value={
                selectedProgram.status
              }
              onChange={(event) =>
                void handleStatusChange(
                  selectedProgram,
                  event.target
                    .value as ProgramStatus,
                )
              }
            >
              {programStatuses.map(
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
            recordName={`"${selectedProgram.name}"`}
            onDelete={() =>
              handleDelete(
                selectedProgram,
              )
            }
          />
        </section>
      )}
    </section>
  );
}
