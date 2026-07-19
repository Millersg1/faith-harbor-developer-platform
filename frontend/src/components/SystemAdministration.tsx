import {
  useEffect,
  useState,
} from "react";

interface HealthResponse {
  version?: string;
  environment?: string;
  databaseConfigured?: boolean;
  aiConfigured?: boolean;
  whmConfigured?: boolean;
}

interface RegisteredProvider {
  id: string;
  name: string;
  models?: string[];
}

interface AIResponse {
  registeredProviders?: RegisteredProvider[];
  orchestration?: string[];
  finalAuthority?: string;
}

interface WhmResponse {
  configured?: boolean;
}

interface AdminState {
  health: HealthResponse;
  ai: AIResponse;
  whmConfigured: boolean;
}

async function getJson<T>(
  url: string,
): Promise<T | null> {
  try {
    const response =
      await fetch(url);

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function yesNo(
  value: boolean | undefined,
): string {
  return value
    ? "Connected"
    : "Not configured";
}

export default function SystemAdministration() {
  const [state, setState] =
    useState<AdminState | null>(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      getJson<HealthResponse>(
        "/health",
      ),
      getJson<AIResponse>(
        "/api/v1/ai",
      ),
      getJson<WhmResponse>(
        "/api/v1/hosting/whm",
      ),
    ])
      .then(
        ([health, ai, whm]) => {
          if (cancelled) {
            return;
          }

          setState({
            health: health ?? {},
            ai: ai ?? {},
            whmConfigured: Boolean(
              whm?.configured,
            ),
          });
        },
      )
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !state) {
    return (
      <div className="card">
        <p className="help-text">
          Loading system
          administration...
        </p>
      </div>
    );
  }

  const {
    health,
    ai,
    whmConfigured,
  } = state;

  const providers =
    ai.registeredProviders ?? [];

  const orchestration =
    ai.orchestration ?? [];

  return (
    <>
      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Administration
            </p>

            <h3>System Overview</h3>
          </div>
        </div>

        <div className="client-overview">
          <div className="client-overview-item">
            <span>Version</span>

            <strong>
              {health.version ??
                "Unknown"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>Environment</span>

            <strong>
              {health.environment ??
                "Unknown"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>
              Persistent Storage
            </span>

            <strong>
              {health.databaseConfigured
                ? "SQLite connected"
                : "In-memory"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>AI Runtime</span>

            <strong>
              {yesNo(
                health.aiConfigured,
              )}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>
              WHM (Hosting)
            </span>

            <strong>
              {whmConfigured
                ? "Connected"
                : "Not configured"}
            </strong>
          </div>

          <div className="client-overview-item">
            <span>
              Human Authority
            </span>

            <strong>
              {ai.finalAuthority ??
                "Required"}
            </strong>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              Artificial Intelligence
            </p>

            <h3>AI Providers</h3>
          </div>
        </div>

        {providers.length === 0 ? (
          <p className="help-text">
            No AI providers are
            registered. Configure
            provider keys on the server
            to enable AI features.
          </p>
        ) : (
          <div className="record-list">
            {providers.map(
              (provider) => (
                <div
                  className="line-item-summary"
                  key={provider.id}
                >
                  <span>
                    {provider.name}
                  </span>

                  <span>
                    {provider.models &&
                    provider.models
                      .length > 0
                      ? provider.models.join(
                          ", ",
                        )
                      : provider.id}
                  </span>
                </div>
              ),
            )}
          </div>
        )}

        {orchestration.length > 0 && (
          <p className="help-text">
            Orchestration:{" "}
            {orchestration.join(", ")}
          </p>
        )}

        <p className="help-text">
          Provider credentials and the
          administrator login are
          managed through the server
          environment. See the cPanel
          deployment guide.
        </p>
      </div>
    </>
  );
}
