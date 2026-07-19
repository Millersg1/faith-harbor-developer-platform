import {
  useEffect,
  useState,
} from "react";
import type {
  SyntheticEvent,
} from "react";

import SystemAdministration from "../components/SystemAdministration";

type AIProvider =
  | "auto"
  | "ollama"
  | "openai"
  | "blackbox";

interface HealthResponse {
  status?: string;
  service?: string;
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
  timestamp?: string;
}

interface StatusMessage {
  message: string;
  type: "working" | "success" | "error";
}

const AI_PROVIDER_KEY =
  "faith-harbor-os-default-ai-provider";

function getSavedProvider(): AIProvider {
  const savedProvider =
    window.localStorage.getItem(
      AI_PROVIDER_KEY,
    );

  if (
    savedProvider === "auto" ||
    savedProvider === "ollama" ||
    savedProvider === "openai" ||
    savedProvider === "blackbox"
  ) {
    return savedProvider;
  }

  return "auto";
}

function formatBooleanStatus(
  value?: boolean,
): string {
  if (value === true) {
    return "Available";
  }

  if (value === false) {
    return "Unavailable";
  }

  return "Unknown";
}

function formatDate(
  value?: string,
): string {
  if (!value) {
    return "Unknown";
  }

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

async function getHealth():
Promise<HealthResponse> {
  const response = await fetch(
    "/health",
  );

  const responseText =
    await response.text();

  if (!responseText.trim()) {
    throw new Error(
      response.ok
        ? "The server returned an empty response."
        : "System status could not be loaded.",
    );
  }

  let result: unknown;

  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(
      "The server returned an invalid response.",
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
          "System status could not be loaded.",
      );
    }

    throw new Error(
      "System status could not be loaded.",
    );
  }

  return result as HealthResponse;
}

export default function SettingsPage() {
  const [health, setHealth] =
    useState<HealthResponse | null>(
      null,
    );

  const [
    defaultProvider,
    setDefaultProvider,
  ] = useState<AIProvider>(
    getSavedProvider,
  );

  const [isLoading, setIsLoading] =
    useState(true);

  const [isRefreshing, setIsRefreshing] =
    useState(false);

  const [isSaving, setIsSaving] =
    useState(false);

  const [status, setStatus] =
    useState<StatusMessage | null>(
      null,
    );

  useEffect(() => {
    let requestCancelled = false;

    getHealth()
      .then((result) => {
        if (requestCancelled) {
          return;
        }

        setHealth(result);
      })
      .catch((error: unknown) => {
        if (requestCancelled) {
          return;
        }

        setStatus({
          message: getErrorMessage(
            error,
            "System status could not be loaded.",
          ),
          type: "error",
        });
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

  async function refreshStatus():
  Promise<void> {
    setIsRefreshing(true);

    setStatus({
      message:
        "Refreshing system status...",
      type: "working",
    });

    try {
      const result =
        await getHealth();

      setHealth(result);

      setStatus({
        message:
          "System status refreshed successfully.",
        type: "success",
      });
    } catch (error) {
      setStatus({
        message: getErrorMessage(
          error,
          "System status could not be refreshed.",
        ),
        type: "error",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  function savePreferences(
    event: SyntheticEvent<HTMLFormElement>,
  ): void {
    event.preventDefault();

    setIsSaving(true);

    try {
      window.localStorage.setItem(
        AI_PROVIDER_KEY,
        defaultProvider,
      );

      setStatus({
        message:
          "Faith Harbor OS preferences saved successfully.",
        type: "success",
      });
    } catch {
      setStatus({
        message:
          "Preferences could not be saved in this browser.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section
      className="workspace active"
      id="settings-workspace"
    >
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            Administration
          </p>

          <h3>Settings</h3>

          <p className="help-text">
            Review live platform status
            and manage your Faith Harbor
            OS preferences.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            void refreshStatus()
          }
          disabled={
            isRefreshing ||
            isLoading
          }
        >
          {isRefreshing
            ? "Refreshing..."
            : "Refresh Status"}
        </button>
      </div>

      <SystemAdministration />

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

      <div className="dashboard-grid">
        <section className="card">
          <p className="eyebrow">
            System Configuration
          </p>

          <h3>Platform Status</h3>

          {isLoading ? (
            <p className="help-text">
              Loading system
              configuration...
            </p>
          ) : (
            <div className="settings-list">
              <div>
                <strong>
                  Faith Harbor OS
                </strong>

                <span>
                  {health?.status ??
                    "Unknown"}
                </span>
              </div>

              <div>
                <strong>Version</strong>

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
                  Database
                </strong>

                <span>
                  {formatBooleanStatus(
                    health?.databaseConfigured,
                  )}
                </span>
              </div>

              <div>
                <strong>
                  AI Runtime
                </strong>

                <span>
                  {formatBooleanStatus(
                    health?.aiConfigured,
                  )}
                </span>
              </div>

              <div>
                <strong>
                  Proposal Generation
                </strong>

                <span>
                  {formatBooleanStatus(
                    health?.proposalGenerationAvailable,
                  )}
                </span>
              </div>

              <div>
                <strong>
                  Last Health Check
                </strong>

                <span>
                  {formatDate(
                    health?.timestamp,
                  )}
                </span>
              </div>
            </div>
          )}
        </section>

        <section className="card">
          <p className="eyebrow">
            Personal Preferences
          </p>

          <h3>
            AI Provider Preference
          </h3>

          <p className="help-text">
            Choose the provider Faith
            Harbor OS should select when
            you open the AI Workspace.
          </p>

          <form
            onSubmit={savePreferences}
          >
            <div className="form-group">
              <label htmlFor="default-ai-provider">
                Default provider
              </label>

              <select
                id="default-ai-provider"
                value={defaultProvider}
                onChange={(event) =>
                  setDefaultProvider(
                    event.target
                      .value as AIProvider,
                  )
                }
              >
                <option value="auto">
                  Auto
                </option>

                <option value="ollama">
                  Ollama
                </option>

                <option value="openai">
                  OpenAI
                </option>

                <option value="blackbox">
                  Blackbox
                </option>
              </select>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={isSaving}
            >
              {isSaving
                ? "Saving..."
                : "Save Preferences"}
            </button>
          </form>

          <div className="status-message">
            <strong>
              Recommended:
            </strong>{" "}
            Auto allows Faith Harbor OS
            to select the best configured
            provider for each request.
          </div>
        </section>
      </div>

      <section className="card">
        <p className="eyebrow">
          Platform Capabilities
        </p>

        <h3>
          Persistent Services
        </h3>

        <div className="settings-list">
          <div>
            <strong>
              Client Management
            </strong>

            <span>
              {formatBooleanStatus(
                health?.clientManagementAvailable,
              )}
            </span>
          </div>

          <div>
            <strong>
              Project Management
            </strong>

            <span>
              {formatBooleanStatus(
                health?.projectManagementAvailable,
              )}
            </span>
          </div>

          <div>
            <strong>
              Client Storage
            </strong>

            <span>
              {health?.persistentClientStorage
                ? "Persistent"
                : "In memory"}
            </span>
          </div>

          <div>
            <strong>
              Proposal Storage
            </strong>

            <span>
              {health?.persistentProposalStorage
                ? "Persistent"
                : "In memory"}
            </span>
          </div>

          <div>
            <strong>
              Project Storage
            </strong>

            <span>
              {health?.persistentProjectStorage
                ? "Persistent"
                : "In memory"}
            </span>
          </div>

          <div>
            <strong>
              Human Authority
            </strong>

            <span>
              Required for final client
              delivery
            </span>
          </div>
        </div>
      </section>
    </section>
  );
}